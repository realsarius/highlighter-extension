/**
 * Highlighter Extension - Popup Script
 */

// ============================================
// DOM ELEMENTS
// ============================================
const colorPalette = document.getElementById('colorPalette');
const highlightsList = document.getElementById('highlightsList');
const highlightCount = document.getElementById('highlightCount');
const emptyState = document.getElementById('emptyState');
const allNotesBtn = document.getElementById('allNotesBtn');

// ============================================
// STATE
// ============================================
let currentUrl = '';
let currentColor = '#FFEB3B';
let currentTabId = null;

// ============================================
// INITIALIZATION
// ============================================
async function init() {
  try {
    // Initialize i18n
    if (window.i18n) {
      await window.i18n.init();
    }

    // Get active tab first
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      currentTabId = tabs[0].id;
    }

    const response = await browser.runtime.sendMessage({
      type: 'POPUP_GET_PAGE_DATA',
      payload: {}
    });

    if (response) {
      currentUrl = response.url;
      currentColor = response.settings?.lastUsedColor || '#FFEB3B';
      
      // Update color palette selection
      updateSelectedColor(currentColor);
      
      // Render highlights
      renderHighlights(response.pageData?.items || []);
    }
  } catch (e) {
    console.error('Failed to get page data:', e);
    renderHighlights([]);
  }
}

// ============================================
// COLOR PICKER
// ============================================
function updateSelectedColor(color) {
  colorPalette.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.color === color);
  });
}

colorPalette.addEventListener('click', async (e) => {
  const btn = e.target.closest('.color-btn');
  if (!btn) return;

  const color = btn.dataset.color;
  currentColor = color;
  updateSelectedColor(color);

  try {
    await browser.runtime.sendMessage({
      type: 'POPUP_HIGHLIGHT_SELECTION',
      payload: { color }
    });
    
    // Refresh list after a short delay
    setTimeout(refreshHighlights, 200);
  } catch (e) {
    console.error('Failed to highlight:', e);
  }
});

// ============================================
// HIGHLIGHTS LIST
// ============================================

/**
 * Renders the list of highlights in the popup
 * @param {Array} items - Array of highlight objects to display
 */
function renderHighlights(items) {
  highlightCount.textContent = items.length;
  
  if (items.length === 0) {
    emptyState.style.display = 'block';
    highlightsList.querySelectorAll('.highlight-item').forEach(el => el.remove());
    return;
  }

  emptyState.style.display = 'none';
  
  // Clear existing items
  highlightsList.querySelectorAll('.highlight-item').forEach(el => el.remove());

  // Sort by creation date (newest first)
  const sortedItems = [...items].sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );

  sortedItems.forEach(item => {
    const el = createHighlightElement(item);
    highlightsList.appendChild(el);
  });
}

/**
 * Creates a DOM element for a single highlight item
 * @param {Object} item - Highlight data object
 * @returns {HTMLDivElement} Configured highlight item element
 */
function createHighlightElement(item) {
  const div = document.createElement('div');
  div.className = 'highlight-item';
  div.dataset.id = item.id;
  
  const quoteText = item.quote || item.text || '(boş)';
  const truncatedQuote = quoteText.length > 60 
    ? quoteText.substring(0, 60) + '...' 
    : quoteText;

  const notePreview = item.note 
    ? (item.note.length > 40 ? item.note.substring(0, 40) + '...' : item.note)
    : '';

  const tagsHtml = item.tags && item.tags.length > 0
    ? `<div class="highlight-tags">${item.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  div.innerHTML = `
    <div class="highlight-color" style="background-color: ${item.color};"></div>
    <div class="highlight-content">
      <div class="highlight-quote">${escapeHtml(truncatedQuote)}</div>
      ${notePreview ? `<div class="highlight-note">📝 ${escapeHtml(notePreview)}</div>` : ''}
      ${tagsHtml}
    </div>
    <div class="highlight-actions">
      <button class="action-btn note-btn" title="Not ve Etiket">📝</button>
      <button class="action-btn edit-btn" title="Renk Değiştir">🎨</button>
      <button class="action-btn delete-btn" title="Sil">🗑️</button>
    </div>
  `;

  // Note preview click -> Edit
  const notePreviewEl = div.querySelector('.highlight-note');
  if (notePreviewEl) {
    notePreviewEl.style.cursor = 'pointer';
    notePreviewEl.title = 'Düzenle';
    notePreviewEl.addEventListener('click', (e) => {
      e.stopPropagation();
      showNoteInput(div, item);
    });
  }

  // Note edit button
  const noteBtn = div.querySelector('.note-btn');
  noteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showNoteInput(div, item);
  });

  // Color change dropdown
  const editBtn = div.querySelector('.edit-btn');
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showColorDropdown(div, item);
  });

  // Delete button
  const deleteBtn = div.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await deleteHighlight(item.id);
  });

  return div;
}

function showColorDropdown(itemEl, item) {
  // Remove any existing dropdown
  document.querySelectorAll('.color-dropdown').forEach(el => el.remove());

  const dropdown = document.createElement('div');
  dropdown.className = 'color-dropdown';
  
  const colors = ['#FFEB3B', '#69F0AE', '#40C4FF', '#FF80AB', '#FFAB40', '#B388FF'];
  
  colors.forEach(color => {
    const btn = document.createElement('button');
    btn.className = 'dropdown-color-btn';
    btn.style.backgroundColor = color;
    if (color === item.color) btn.classList.add('current');
    
    btn.addEventListener('click', async () => {
      await updateHighlightColor(item.id, color);
      dropdown.remove();
    });
    
    dropdown.appendChild(btn);
  });

  itemEl.appendChild(dropdown);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', () => dropdown.remove(), { once: true });
  }, 0);
}

// ============================================
// ACTIONS
// ============================================
async function deleteHighlight(id) {
  try {
    await browser.runtime.sendMessage({
      type: 'POPUP_REMOVE_HIGHLIGHT',
      payload: { highlightId: id, tabId: currentTabId }
    });
    
    // Refresh list
    await refreshHighlights();
  } catch (e) {
    console.error('Failed to delete:', e);
  }
}

async function updateHighlightColor(id, color) {
  try {
    await browser.runtime.sendMessage({
      type: 'POPUP_UPDATE_HIGHLIGHT',
      payload: { highlightId: id, updates: { color }, tabId: currentTabId }
    });
    
    // Refresh list
    await refreshHighlights();
  } catch (e) {
    console.error('Failed to update color:', e);
  }
}

async function refreshHighlights() {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'POPUP_GET_PAGE_DATA',
      payload: {}
    });
    
    if (response && response.pageData) {
      renderHighlights(response.pageData.items || []);
    }
  } catch (e) {
    console.error('Failed to refresh:', e);
  }
}

// ============================================
// UTILITIES
// ============================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// NOTE INPUT
// ============================================
function showNoteInput(itemEl, item) {
  // Remove any existing note input
  document.querySelectorAll('.note-input-container').forEach(el => el.remove());

  const existingTags = item.tags || [];

  const container = document.createElement('div');
  container.className = 'note-input-container';
  container.innerHTML = `
    <textarea class="note-input" placeholder="${window.i18n.t('notePlaceholder')}" rows="2">${escapeHtml(item.note || '')}</textarea>
    <input type="text" class="tags-input" placeholder="${window.i18n.t('tagsPlaceholder')}" value="${escapeHtml(existingTags.join(' '))}">
    <div class="note-input-actions">
      <button class="note-cancel-btn">${window.i18n.t('btnCancel')}</button>
      <button class="note-save-btn">${window.i18n.t('btnSave')}</button>
    </div>
  `;

  // Prevent clicks inside container from closing anything
  container.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  itemEl.appendChild(container);

  const textarea = container.querySelector('.note-input');
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  // Save
  container.querySelector('.note-save-btn').addEventListener('click', async () => {
    const note = textarea.value.trim();
    const tagsInput = container.querySelector('.tags-input').value.trim();
    
    // Parse tags
    const tags = [...new Set(
      tagsInput.split(/\s+/)
        .map(t => t.startsWith('#') ? t : (t ? '#' + t : ''))
        .filter(t => t.length > 1)
    )];
    
    await browser.runtime.sendMessage({
      type: 'POPUP_UPDATE_HIGHLIGHT',
      payload: { highlightId: item.id, updates: { note, tags }, tabId: currentTabId }
    });

    container.remove();
    await refreshHighlights();
  });

  // Cancel
  container.querySelector('.note-cancel-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    container.remove();
  });
}

// ============================================
// ALL NOTES BUTTON
// ============================================
allNotesBtn.addEventListener('click', () => {
  browser.tabs.create({ url: browser.runtime.getURL('notes/notes.html') });
});

// ============================================
// START
// ============================================
init();
