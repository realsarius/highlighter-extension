/**
 * Highlighter Extension - Content Script
 * Handles DOM operations only, storage via background
 */

// ============================================
// CONSTANTS
// ============================================
const HIGHLIGHT_CLASS = 'hl-extension-highlight';
const HIGHLIGHT_DATA_ATTR = 'data-hl-id';
const CONTEXT_SIZE = 30; // Characters for prefix/suffix

// Cache for highlight data (notes, tags, etc.)
let highlightCache = {};

// Color palette
const COLORS = {
  yellow: '#FFEB3B',
  green: '#69F0AE',
  blue: '#40C4FF',
  pink: '#FF80AB',
  orange: '#FFAB40',
  purple: '#B388FF'
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generates a unique ID for a highlight
 * @returns {string} Unique highlight ID in format 'hl-{timestamp}-{random}'
 */
function generateId() {
  return 'hl-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  } catch (e) {
    return url;
  }
}

function getContrastColor(hexColor) {
  if (!hexColor) return '#000000';
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

// ============================================
// XPATH FUNCTIONS (Consistent format: from body)
// ============================================

/**
 * Generates XPath for an element relative to document.body
 * @param {Element} element - DOM element to get XPath for
 * @returns {string|null} XPath string or null if element is invalid
 */
function getElementXPath(element) {
  if (!element) return null;
  if (element === document.body) return '/body';
  if (element.nodeType !== Node.ELEMENT_NODE) return null;

  let path = '';
  let current = element;

  while (current && current !== document.body && current.parentNode) {
    const parent = current.parentNode;
    const siblings = Array.from(parent.children).filter(
      child => child.tagName === current.tagName
    );
    
    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      path = `/${current.tagName.toLowerCase()}[${index}]` + path;
    } else {
      path = `/${current.tagName.toLowerCase()}` + path;
    }
    
    current = parent;
  }

  return '/body' + path;
}

function getTextNodeXPath(textNode) {
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return null;
  
  const parent = textNode.parentNode;
  if (!parent) return null;

  const parentXPath = getElementXPath(parent);
  if (!parentXPath) return null;

  // Count text node position among siblings
  const textNodes = Array.from(parent.childNodes).filter(
    node => node.nodeType === Node.TEXT_NODE
  );
  const index = textNodes.indexOf(textNode) + 1;

  return parentXPath + `/text()[${index}]`;
}

function getElementByXPath(xpath) {
  if (!xpath) return null;
  
  try {
    // Convert our /body/... format to proper XPath
    const fullXPath = '/html' + xpath;
    const result = document.evaluate(
      fullXPath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue;
  } catch (e) {
    console.warn('XPath evaluation failed:', xpath, e);
    return null;
  }
}

function getTextNodeByXPath(xpath) {
  return getElementByXPath(xpath);
}

// ============================================
// SELECTION & VALIDATION
// ============================================

function getSelectionInfo() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const text = selection.toString().trim();

  if (!text) return null;

  // Check for single text node (MVP constraint)
  if (range.startContainer !== range.endContainer) {
    // Multi-node selection - check if it's _just_ text nodes within same parent
    if (range.startContainer.nodeType !== Node.TEXT_NODE ||
        range.endContainer.nodeType !== Node.TEXT_NODE ||
        range.startContainer.parentNode !== range.endContainer.parentNode) {
      return { error: 'multi-node', text };
    }
  }

  const textNode = range.startContainer;
  if (textNode.nodeType !== Node.TEXT_NODE) {
    return { error: 'not-text-node', text };
  }

  // Get XPath
  const xpath = getTextNodeXPath(textNode);
  if (!xpath) {
    return { error: 'xpath-failed', text };
  }

  // Get context (prefix/suffix)
  const fullText = textNode.textContent || '';
  const startOffset = range.startOffset;
  const endOffset = range.endOffset;
  
  const prefix = fullText.substring(Math.max(0, startOffset - CONTEXT_SIZE), startOffset);
  const suffix = fullText.substring(endOffset, Math.min(fullText.length, endOffset + CONTEXT_SIZE));

  return {
    text,
    quote: text,
    xpath,
    startOffset,
    endOffset,
    prefix,
    suffix,
    range
  };
}

// ============================================
// HIGHLIGHT CREATION
// ============================================

/**
 * Creates a styled highlight span element
 * @param {string} id - Unique highlight ID
 * @param {string} color - Background color in hex format
 * @returns {HTMLSpanElement} Configured span element with click handler
 */
function createHighlightSpan(id, color) {
  const span = document.createElement('span');
  span.className = HIGHLIGHT_CLASS;
  span.setAttribute(HIGHLIGHT_DATA_ATTR, id);
  span.style.backgroundColor = color;
  span.style.color = getContrastColor(color);
  span.style.cursor = 'pointer';
  
  // Create listener for interaction
  span.addEventListener('click', (e) => handleHighlightClick(e, id));
  
  return span;
}

/**
 * Applies a highlight to the selected text
 * @param {Object} selectionInfo - Selection info from getSelectionInfo()
 * @param {string} color - Highlight color in hex format
 * @returns {Object|null} Highlight data object or null if failed
 */
function applyHighlight(selectionInfo, color) {
  const { range, text, quote, xpath, startOffset, endOffset, prefix, suffix } = selectionInfo;
  
  const id = generateId();
  const span = createHighlightSpan(id, color);

  try {
    range.surroundContents(span);
  } catch (e) {
    console.warn('surroundContents failed:', e);
    showNotification('Bu seçim vurgulanamıyor (karmaşık yapı)', 'error');
    return null;
  }

  // Clear selection
  window.getSelection().removeAllRanges();

  // Prepare highlight data for storage
  const highlightData = {
    id,
    quote: quote || text,
    prefix: prefix || '',
    suffix: suffix || '',
    color,
    xpath,
    startOffset,
    endOffset,
    note: '',
    createdAt: new Date().toISOString()
  };

  // Add click handler
  span.addEventListener('click', (e) => handleHighlightClick(e, id));

  return highlightData;
}

// ============================================
// HIGHLIGHT RESTORATION (3-tier strategy)
// ============================================

function restoreHighlights(items) {
  if (!items || items.length === 0) return;

  items.forEach(item => {
    // Cache item data
    highlightCache[item.id] = item;

    // Skip if already restored
    if (document.querySelector(`[${HIGHLIGHT_DATA_ATTR}="${item.id}"]`)) {
      return;
    }

    const restored = tryRestoreHighlight(item);
    if (!restored) {
      console.warn('Could not restore highlight:', item.id, item.quote?.substring(0, 30));
    }
  });
}

function tryRestoreHighlight(item) {
  // Strategy 1: XPath + offset
  let textNode = getTextNodeByXPath(item.xpath);
  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    const text = textNode.textContent || '';
    
    // Verify the text matches at expected position
    const expectedText = text.substring(item.startOffset, item.endOffset);
    if (expectedText === item.quote) {
      return applyHighlightToTextNode(textNode, item.startOffset, item.endOffset, item);
    }
  }

  // Strategy 2: Find quote within XPath parent
  if (textNode) {
    const parent = textNode.nodeType === Node.TEXT_NODE ? textNode.parentNode : textNode;
    const found = findQuoteInElement(parent, item.quote);
    if (found) {
      return applyHighlightToTextNode(found.node, found.start, found.end, item);
    }
  }

  // Strategy 3: Search document with prefix/suffix context
  const found = findQuoteWithContext(item.quote, item.prefix, item.suffix);
  if (found) {
    return applyHighlightToTextNode(found.node, found.start, found.end, item);
  }

  return false;
}

function findQuoteInElement(element, quote) {
  if (!element || !quote) return null;

  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let node;
  while (node = walker.nextNode()) {
    const text = node.textContent || '';
    const index = text.indexOf(quote);
    if (index !== -1) {
      return { node, start: index, end: index + quote.length };
    }
  }

  return null;
}

function findQuoteWithContext(quote, prefix, suffix) {
  if (!quote) return null;

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let node;
  let bestMatch = null;
  let bestScore = 0;

  while (node = walker.nextNode()) {
    const text = node.textContent || '';
    let searchStart = 0;
    let index;

    while ((index = text.indexOf(quote, searchStart)) !== -1) {
      // Calculate context match score
      let score = 1;
      
      if (prefix && index >= prefix.length) {
        const actualPrefix = text.substring(index - prefix.length, index);
        if (actualPrefix === prefix) score += 2;
        else if (actualPrefix.includes(prefix.slice(-10))) score += 1;
      }
      
      if (suffix && index + quote.length + suffix.length <= text.length) {
        const actualSuffix = text.substring(index + quote.length, index + quote.length + suffix.length);
        if (actualSuffix === suffix) score += 2;
        else if (actualSuffix.includes(suffix.slice(0, 10))) score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { node, start: index, end: index + quote.length };
      }

      searchStart = index + 1;
    }
  }

  return bestMatch;
}

function applyHighlightToTextNode(textNode, startOffset, endOffset, item) {
  try {
    const range = document.createRange();
    range.setStart(textNode, startOffset);
    range.setEnd(textNode, endOffset);

    const span = createHighlightSpan(item.id, item.color);
    range.surroundContents(span);

    // Listener is added in createHighlightSpan

    return true;
  } catch (e) {
    console.warn('applyHighlightToTextNode failed:', e);
    return false;
  }
}

// ============================================
// HIGHLIGHT MANAGEMENT
// ============================================

function removeHighlightSpan(id) {
  const span = document.querySelector(`[${HIGHLIGHT_DATA_ATTR}="${id}"]`);
  if (!span) return false;

  const parent = span.parentNode;
  if (!parent) return false;

  // Unwrap: move children out, remove span
  while (span.firstChild) {
    parent.insertBefore(span.firstChild, span);
  }
  parent.removeChild(span);

  // Normalize to merge adjacent text nodes
  parent.normalize();

  return true;
}

function updateHighlightColor(id, newColor) {
  const span = document.querySelector(`[${HIGHLIGHT_DATA_ATTR}="${id}"]`);
  if (!span) return false;

  span.style.backgroundColor = newColor;
  span.style.color = getContrastColor(newColor);
  return true;
}

function scrollToHighlight(id) {
  const span = document.querySelector(`[${HIGHLIGHT_DATA_ATTR}="${id}"]`);
  if (!span) return false;

  // Scroll to element with offset
  span.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });

  // Add pulse animation
  span.classList.add('hl-pulse');
  
  // Remove animation after it completes
  setTimeout(() => {
    span.classList.remove('hl-pulse');
  }, 2000);

  return true;
}

// ============================================
// UI FEEDBACK
// ============================================

let currentTooltip = null;

function handleHighlightClick(e, id) {
  e.stopPropagation();
  
  // Show mini toolbar
  showHighlightToolbar(e.target, id);
}

function showHighlightToolbar(highlightSpan, id) {
  removeTooltip();

  const toolbar = document.createElement('div');
  toolbar.className = 'hl-extension-toolbar';
  toolbar.dataset.id = id;
  toolbar.innerHTML = `
    <div class="hl-toolbar-row">
      <div class="hl-toolbar-colors">
        ${Object.entries(COLORS).map(([name, color]) => 
          `<button class="hl-color-btn" data-color="${color}" style="background-color: ${color};" title="${name}"></button>`
        ).join('')}
      </div>
      <button class="hl-note-btn" title="Not Ekle">📝</button>
      <button class="hl-delete-btn" title="Sil">🗑️</button>
    </div>
  `;

  // Check if we have a note for this highlight
  const cachedItem = highlightCache[id];
  if (cachedItem && cachedItem.note) {
    const notePreview = document.createElement('div');
    notePreview.className = 'hl-toolbar-note-preview';
    notePreview.textContent = cachedItem.note;
    toolbar.appendChild(notePreview);
  }

  // Position toolbar
  const rect = highlightSpan.getBoundingClientRect();
  toolbar.style.position = 'fixed';
  toolbar.style.top = (rect.top - 40) + 'px';
  toolbar.style.left = rect.left + 'px';
  toolbar.style.zIndex = '999999';

  document.body.appendChild(toolbar);
  currentTooltip = toolbar;

  // Color buttons
  toolbar.querySelectorAll('.hl-color-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const color = btn.dataset.color;
      updateHighlightColor(id, color);
      
      await browser.runtime.sendMessage({
        type: 'CONTENT_UPDATE_HIGHLIGHT',
        payload: {
          url: window.location.href,
          highlightId: id,
          updates: { color }
        }
      });
      
      removeTooltip();
    });
  });

  // Note button
  toolbar.querySelector('.hl-note-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    removeTooltip();
    showNoteModal(id);
  });

  // Delete button
  toolbar.querySelector('.hl-delete-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    removeHighlightSpan(id);
    
    await browser.runtime.sendMessage({
      type: 'CONTENT_REMOVE_HIGHLIGHT',
      payload: {
        url: window.location.href,
        highlightId: id
      }
    });
    
    removeTooltip();
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', removeTooltip, { once: true });
  }, 0);
}

// ============================================
// NOTE MODAL
// ============================================
let currentNoteModal = null;

async function showNoteModal(highlightId) {
  // Close existing modal
  if (currentNoteModal) {
    currentNoteModal.remove();
    currentNoteModal = null;
  }

  // Get existing data
  let existingNote = '';
  let existingTags = [];
  try {
    const response = await browser.runtime.sendMessage({
      type: 'CONTENT_REQUEST_RESTORE',
      payload: { url: window.location.href }
    });
    const item = response.pageData?.items?.find(i => i.id === highlightId);
    existingNote = item?.note || '';
    existingTags = item?.tags || [];
  } catch (e) { }

  const modal = document.createElement('div');
  modal.className = 'hl-extension-note-modal';
  modal.innerHTML = `
    <div class="hl-note-modal-content">
      <div class="hl-note-modal-header">
        <span>📝 Not ve Etiketler</span>
        <button class="hl-note-close-btn">×</button>
      </div>
      <textarea class="hl-note-textarea" placeholder="Notunuzu yazın..." rows="3">${escapeHtml(existingNote)}</textarea>
      <div class="hl-tags-section">
        <label class="hl-tags-label">🏷️ Etiketler</label>
        <input type="text" class="hl-tags-input" placeholder="#önemli #okuma-listesi" value="${escapeHtml(existingTags.join(' '))}">
        <small class="hl-tags-hint">Etiketleri boşlukla ayırın (örn: #önemli #sonra-oku)</small>
      </div>
      <div class="hl-note-modal-actions">
        <button class="hl-note-cancel-btn">İptal</button>
        <button class="hl-note-save-btn">Kaydet</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  currentNoteModal = modal;

  const textarea = modal.querySelector('.hl-note-textarea');
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  // Save button
  modal.querySelector('.hl-note-save-btn').addEventListener('click', async () => {
    const note = textarea.value.trim();
    const tagsInput = modal.querySelector('.hl-tags-input').value.trim();
    
    // Parse tags: split by space, filter those starting with #, remove duplicates
    const tags = [...new Set(
      tagsInput.split(/\s+/)
        .map(t => t.startsWith('#') ? t : (t ? '#' + t : ''))
        .filter(t => t.length > 1)
    )];
    
    await browser.runtime.sendMessage({
      type: 'CONTENT_UPDATE_HIGHLIGHT',
      payload: {
        url: window.location.href,
        highlightId: highlightId,
        updates: { note, tags }
      }
    });

    showNotification('Kaydedildi!', 'success');
    closeNoteModal();
  });

  // Cancel/Close buttons
  modal.querySelector('.hl-note-cancel-btn').addEventListener('click', closeNoteModal);
  modal.querySelector('.hl-note-close-btn').addEventListener('click', closeNoteModal);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeNoteModal();
  });

  // Close on Escape
  document.addEventListener('keydown', handleNoteEscape);
}

function handleNoteEscape(e) {
  if (e.key === 'Escape') {
    closeNoteModal();
  }
}

function closeNoteModal() {
  if (currentNoteModal) {
    currentNoteModal.remove();
    currentNoteModal = null;
  }
  document.removeEventListener('keydown', handleNoteEscape);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function removeTooltip() {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
  }
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `hl-extension-notification hl-notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('hl-notification-hide');
    setTimeout(() => notification.remove(), 300);
  }, 2700);
}

// ============================================
// MESSAGE HANDLERS
// ============================================

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case 'DO_HIGHLIGHT': {
      const selectionInfo = getSelectionInfo();
      
      if (!selectionInfo) {
        showNotification(browser.i18n.getMessage('notificationSelectText'), 'warning');
        sendResponse({ success: false, error: 'no-selection' });
        return;
      }

      if (selectionInfo.error) {
        if (selectionInfo.error === 'multi-node') {
          showNotification(browser.i18n.getMessage('notificationMultiNode'), 'warning');
        } else {
          showNotification(browser.i18n.getMessage('notificationCannotHighlight'), 'warning');
        }
        sendResponse({ success: false, error: selectionInfo.error });
        return;
      }

      const highlightData = applyHighlight(selectionInfo, payload.color);
      
      if (highlightData) {
        // Update cache
        highlightCache[highlightData.id] = highlightData;

        // Save to storage via background
        browser.runtime.sendMessage({
          type: 'CONTENT_ADD_HIGHLIGHT',
          payload: {
            url: window.location.href,
            title: document.title,
            highlightData
          }
        });
        
        showNotification(browser.i18n.getMessage('notificationAdded'), 'success');
        sendResponse({ success: true, highlightData });
      } else {
        sendResponse({ success: false, error: 'apply-failed' });
      }
      return;
    }

    case 'REMOVE_HIGHLIGHT_VISUAL': {
      const { highlightId } = payload;
      removeHighlightSpan(highlightId);
      sendResponse({ success: true });
      return;
    }

    case 'UPDATE_HIGHLIGHT_DATA': {
      const { highlightId, updates } = payload;
      
      // Update cache (create if missing to ensure note is stored)
      if (!highlightCache[highlightId]) {
        highlightCache[highlightId] = {};
        // If we created it fresh, try to find the element to verify it exists? 
        // Not strictly necessary for showing the note in toolbar.
      }
      highlightCache[highlightId] = { ...highlightCache[highlightId], ...updates };
      
      // Update visual if color changed
      if (updates.color) {
        updateHighlightColor(highlightId, updates.color);
      }
      
      // Update toolbar if open for this highlight
      if (currentTooltip && currentTooltip.dataset.id === highlightId) {
        const notePreview = currentTooltip.querySelector('.hl-toolbar-note-preview');
        if (updates.note) {
          if (notePreview) {
            notePreview.textContent = updates.note;
          } else {
            // Create if didn't exist
            const newPreview = document.createElement('div');
            newPreview.className = 'hl-toolbar-note-preview';
            newPreview.textContent = updates.note;
            currentTooltip.appendChild(newPreview);
          }
        } else if (updates.note === '') {
          // Remove if cleared
          if (notePreview) notePreview.remove();
        }
      }
      
      sendResponse({ success: true });
      return;
    }

    case 'SCROLL_TO_HIGHLIGHT': {
      const { highlightId } = payload;
      scrollToHighlight(highlightId);
      sendResponse({ success: true });
      return;
    }
  }
});

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  try {
    // Request restore data from background (SINGLE restore source)
    const response = await browser.runtime.sendMessage({
      type: 'CONTENT_REQUEST_RESTORE',
      payload: { url: window.location.href }
    });

    if (response && response.pageData && response.pageData.items) {
      restoreHighlights(response.pageData.items);
    }
  } catch (e) {
    console.warn('Highlighter restore failed:', e);
  }
}

// Run on document ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

console.log('Highlighter content script loaded');
