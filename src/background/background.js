/**
 * Highlighter Extension - Background Script (Service Worker)
 * Single source of truth for storage operations
 */

// ============================================
// STORAGE KEYS
// ============================================
const STORAGE_KEY_HIGHLIGHTS = 'highlights';
const STORAGE_KEY_SETTINGS = 'settings';

// Default settings
const DEFAULT_SETTINGS = {
  lastUsedColor: '#FFEB3B',
  theme: 'auto',
  showContextMenu: true
};

// ============================================
// URL NORMALIZATION
// ============================================
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    // Use origin + pathname (ignore query params and hash)
    return urlObj.origin + urlObj.pathname;
  } catch (e) {
    return url;
  }
}

// ============================================
// STORAGE OPERATIONS
// ============================================

/**
 * Retrieves highlights for a specific URL
 * @param {string} url - The page URL to get highlights for
 * @returns {Promise<{title: string, items: Array}>} Page data with title and highlight items
 */
async function getHighlightsForUrl(url) {
  const normalizedUrl = normalizeUrl(url);
  const result = await chrome.storage.local.get(STORAGE_KEY_HIGHLIGHTS);
  const highlights = result[STORAGE_KEY_HIGHLIGHTS] || {};
  return highlights[normalizedUrl] || { title: '', items: [] };
}

/**
 * Saves highlights for a specific URL
 * @param {string} url - The page URL
 * @param {string} title - The page title
 * @param {Array} items - Array of highlight items
 * @returns {Promise<void>}
 */
async function saveHighlightsForUrl(url, title, items) {
  const normalizedUrl = normalizeUrl(url);
  const result = await chrome.storage.local.get(STORAGE_KEY_HIGHLIGHTS);
  const highlights = result[STORAGE_KEY_HIGHLIGHTS] || {};

  if (items.length === 0) {
    // Remove the URL entry if no highlights
    delete highlights[normalizedUrl];
  } else {
    highlights[normalizedUrl] = { title, items };
  }

  await chrome.storage.local.set({ [STORAGE_KEY_HIGHLIGHTS]: highlights });
}

/**
 * Adds a new highlight to a page
 * @param {string} url - The page URL
 * @param {string} title - The page title
 * @param {Object} highlightData - The highlight data object
 * @returns {Promise<Object>} The added highlight data
 */
async function addHighlight(url, title, highlightData) {
  const pageData = await getHighlightsForUrl(url);
  pageData.title = title || pageData.title;
  pageData.items.push(highlightData);
  await saveHighlightsForUrl(url, pageData.title, pageData.items);
  return highlightData;
}

/**
 * Removes a highlight by ID
 * @param {string} url - The page URL
 * @param {string} highlightId - The highlight ID to remove
 * @returns {Promise<void>}
 */
async function removeHighlight(url, highlightId) {
  const pageData = await getHighlightsForUrl(url);
  pageData.items = pageData.items.filter(item => item.id !== highlightId);
  await saveHighlightsForUrl(url, pageData.title, pageData.items);
}

/**
 * Updates an existing highlight
 * @param {string} url - The page URL
 * @param {string} highlightId - The highlight ID to update
 * @param {Object} updates - Object containing properties to update
 * @returns {Promise<void>}
 */
async function updateHighlight(url, highlightId, updates) {
  const pageData = await getHighlightsForUrl(url);
  const index = pageData.items.findIndex(item => item.id === highlightId);
  if (index !== -1) {
    pageData.items[index] = { ...pageData.items[index], ...updates };
    await saveHighlightsForUrl(url, pageData.title, pageData.items);
  }
}

/**
 * Gets extension settings with defaults
 * @returns {Promise<Object>} Settings object with defaults applied
 */
async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEY_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEY_SETTINGS] };
}

/**
 * Updates extension settings
 * @param {Object} updates - Object containing settings to update
 * @returns {Promise<Object>} Updated settings object
 */
async function updateSettings(updates) {
  const settings = await getSettings();
  const newSettings = { ...settings, ...updates };
  await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: newSettings });
  return newSettings;
}

// ============================================
// MESSAGE HANDLERS
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle async responses
  const handleAsync = async () => {
    const { type, payload } = message;
    const tabId = sender.tab?.id;
    const url = payload?.url || sender.tab?.url;

    switch (type) {
      // Content script requests restore data
      case 'CONTENT_REQUEST_RESTORE': {
        const pageData = await getHighlightsForUrl(url);
        const settings = await getSettings();
        return { pageData, settings };
      }

      // Content script adds a new highlight
      case 'CONTENT_ADD_HIGHLIGHT': {
        const { title, highlightData } = payload;
        await addHighlight(url, title, highlightData);
        await updateSettings({ lastUsedColor: highlightData.color });
        return { success: true };
      }

      // Content script removes a highlight
      case 'CONTENT_REMOVE_HIGHLIGHT': {
        const { highlightId } = payload;
        await removeHighlight(url, highlightId);
        return { success: true };
      }

      // Content script updates a highlight
      case 'CONTENT_UPDATE_HIGHLIGHT': {
        const { highlightId, updates } = payload;
        await updateHighlight(url, highlightId, updates);
        if (updates.color) {
          await updateSettings({ lastUsedColor: updates.color });
        }
        return { success: true };
      }

      // Popup requests page data
      case 'POPUP_GET_PAGE_DATA': {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) return { pageData: { title: '', items: [] }, settings: await getSettings() };

        const activeUrl = tabs[0].url;
        const pageData = await getHighlightsForUrl(activeUrl);
        const settings = await getSettings();
        return { pageData, settings, url: activeUrl };
      }

      // Get all highlights (for dashboard)
      case 'GET_ALL_HIGHLIGHTS': {
        const result = await chrome.storage.local.get('highlights');
        return { highlights: result.highlights || {} };
      }

      // Popup requests highlight with specific color
      case 'POPUP_HIGHLIGHT_SELECTION': {
        const { color } = payload;
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
          await chrome.tabs.sendMessage(tabs[0].id, {
            type: 'DO_HIGHLIGHT',
            payload: { color }
          });
          await updateSettings({ lastUsedColor: color });
        }
        return { success: true };
      }

      // Popup requests to remove a highlight
      case 'POPUP_REMOVE_HIGHLIGHT': {
        const { highlightId, tabId } = payload;

        let targetTabId = tabId;
        if (!targetTabId) {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs.length > 0) targetTabId = tabs[0].id;
        }

        if (targetTabId) {
          const tab = await chrome.tabs.get(targetTabId);
          const activeUrl = tab.url;

          await removeHighlight(activeUrl, highlightId);

          // Tell content script to remove the visual
          await chrome.tabs.sendMessage(targetTabId, {
            type: 'REMOVE_HIGHLIGHT_VISUAL',
            payload: { highlightId }
          }).catch(() => { });
        }
        return { success: true };
      }

      // Popup updates highlight (color or note)
      case 'POPUP_UPDATE_HIGHLIGHT': {
        const { highlightId, updates, tabId } = payload;

        let targetTabId = tabId;
        if (!targetTabId) {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs.length > 0) targetTabId = tabs[0].id;
        }

        if (targetTabId) {
          const tab = await chrome.tabs.get(targetTabId);
          const activeUrl = tab.url;

          await updateHighlight(activeUrl, highlightId, updates);

          // Always tell content script to update its cache/visuals
          await chrome.tabs.sendMessage(targetTabId, {
            type: 'UPDATE_HIGHLIGHT_DATA',
            payload: { highlightId, updates }
          }).catch(() => { });

          // Additional specific visual update if color changed
          if (updates.color) {
            await updateSettings({ lastUsedColor: updates.color });
          }
        }
        return { success: true };
      }

      // Get settings only
      case 'GET_SETTINGS': {
        return await getSettings();
      }

      // Get all highlights across all sites
      case 'GET_ALL_HIGHLIGHTS': {
        const result = await chrome.storage.local.get(STORAGE_KEY_HIGHLIGHTS);
        return { highlights: result[STORAGE_KEY_HIGHLIGHTS] || {} };
      }

      // Import highlights (merge with existing)
      case 'IMPORT_HIGHLIGHTS': {
        const { highlights: importedHighlights } = payload;
        const result = await chrome.storage.local.get(STORAGE_KEY_HIGHLIGHTS);
        const existingHighlights = result[STORAGE_KEY_HIGHLIGHTS] || {};

        // Merge: for each URL, merge items (avoid duplicates by ID)
        for (const [url, pageData] of Object.entries(importedHighlights)) {
          if (!existingHighlights[url]) {
            existingHighlights[url] = pageData;
          } else {
            const existingIds = new Set(existingHighlights[url].items.map(i => i.id));
            const newItems = (pageData.items || []).filter(i => !existingIds.has(i.id));
            existingHighlights[url].items.push(...newItems);
            // Update title if missing
            if (!existingHighlights[url].title && pageData.title) {
              existingHighlights[url].title = pageData.title;
            }
          }
        }

        await chrome.storage.local.set({ [STORAGE_KEY_HIGHLIGHTS]: existingHighlights });
        return { success: true };
      }

      // Update settings
      case 'UPDATE_SETTINGS': {
        const newSettings = await updateSettings(payload);

        // Handle context menu visibility change
        if ('showContextMenu' in payload) {
          if (payload.showContextMenu) {
            createContextMenus();
          } else {
            chrome.contextMenus.removeAll();
          }
        }

        return newSettings;
      }

      // Clear all data
      case 'CLEAR_ALL_DATA': {
        await chrome.storage.local.remove(STORAGE_KEY_HIGHLIGHTS);
        return { success: true };
      }

      default:
        return { error: 'Unknown message type' };
    }
  };

  // Return true to indicate async response
  handleAsync().then(sendResponse);
  return true;
});

// ============================================
// KEYBOARD SHORTCUT HANDLER
// ============================================

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'highlight-selection') {
    const settings = await getSettings();
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'DO_HIGHLIGHT',
        payload: { color: settings.lastUsedColor }
      });
    }
  }
});

// ============================================
// CONTEXT MENU
// ============================================

const MENU_COLORS = [
  { id: 'hl-yellow', title: '🟡 Sarı', color: '#FFEB3B' },
  { id: 'hl-green', title: '🟢 Yeşil', color: '#69F0AE' },
  { id: 'hl-blue', title: '🔵 Mavi', color: '#40C4FF' },
  { id: 'hl-pink', title: '🟣 Pembe', color: '#FF80AB' },
  { id: 'hl-orange', title: '🟠 Turuncu', color: '#FFAB40' },
  { id: 'hl-purple', title: '🟣 Mor', color: '#B388FF' }
];

// Create context menu on install/startup
function createContextMenus() {
  // Remove existing menus first
  chrome.contextMenus.removeAll().then(() => {
    // Parent menu
    chrome.contextMenus.create({
      id: 'highlighter-parent',
      title: chrome.i18n.getMessage('contextMenuHighlight') || 'Vurgula',
      contexts: ['selection']
    });

    // Color submenu items
    MENU_COLORS.forEach(item => {
      chrome.contextMenus.create({
        id: item.id,
        parentId: 'highlighter-parent',
        title: item.title,
        contexts: ['selection']
      });
    });
  });
}

// Handle menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // Check if it's a color menu item
  const colorItem = MENU_COLORS.find(c => c.id === info.menuItemId);

  if (colorItem && tab?.id) {
    // Send highlight command to content script
    chrome.tabs.sendMessage(tab.id, {
      type: 'DO_HIGHLIGHT',
      payload: { color: colorItem.color }
    });

    // Update last used color
    await updateSettings({ lastUsedColor: colorItem.color });
  }
});

// Create menus on startup (respecting settings)
async function initContextMenus() {
  const settings = await getSettings();
  if (settings.showContextMenu !== false) {
    createContextMenus();
  }
}
initContextMenus();

console.log('Highlighter background script loaded');
