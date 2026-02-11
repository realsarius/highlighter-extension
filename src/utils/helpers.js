/**
 * Highlighter Extension - Shared Helper Functions
 * Centralized utility functions used across multiple scripts
 */

// ============================================
// TEXT UTILITIES
// ============================================

/**
 * Escapes HTML special characters to prevent XSS
 * @param {string} text - Raw text to escape
 * @returns {string} Escaped text safe for HTML insertion
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// COLOR UTILITIES
// ============================================

/**
 * Calculates contrast color (black or white) based on background luminance
 * Uses WCAG luminance formula for accessibility
 * @param {string} hexColor - Hex color code (e.g., '#FFEB3B')
 * @returns {string} '#000000' for dark text or '#ffffff' for light text
 */
function getContrastColor(hexColor) {
  // Defensive null check
  if (!hexColor) return '#000000';

  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;

  // WCAG luminance formula
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  return luminance > 0.5 ? '#000000' : '#ffffff';
}

// ============================================
// URL UTILITIES
// ============================================

/**
 * Normalizes URL by removing hash and query parameters
 * Ensures consistent URL matching across the extension
 * @param {string} url - Full URL to normalize
 * @returns {string} Normalized URL (origin + pathname)
 */
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  } catch {
    return url;
  }
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Default highlight colors palette
 * Used in popup, context menu, and content script
 */
const HIGHLIGHT_COLORS = {
  yellow: '#FFEB3B',
  green: '#69F0AE',
  blue: '#40C4FF',
  pink: '#FF80AB',
  orange: '#FFAB40',
  purple: '#B388FF'
};

/**
 * Context menu color items with localized names
 */
const MENU_COLORS = [
  { id: 'hl-yellow', colorKey: 'colorYellow', color: '#FFEB3B' },
  { id: 'hl-green', colorKey: 'colorGreen', color: '#69F0AE' },
  { id: 'hl-blue', colorKey: 'colorBlue', color: '#40C4FF' },
  { id: 'hl-pink', colorKey: 'colorPink', color: '#FF80AB' },
  { id: 'hl-orange', colorKey: 'colorOrange', color: '#FFAB40' },
  { id: 'hl-purple', colorKey: 'colorPurple', color: '#B388FF' }
];

/**
 * UI timing constants (in milliseconds)
 * Use these instead of magic numbers in setTimeout calls
 */
const TIMING = {
  NOTIFICATION_DURATION_MS: 3000,       // Time before notification auto-hides
  NOTIFICATION_FADE_MS: 300,            // Fade-out animation duration
  HIGHLIGHT_SCROLL_DELAY_MS: 100,       // Delay before scrolling to highlight
  REFRESH_DELAY_MS: 200,                // Delay before refreshing data
  PAGE_RELOAD_DELAY_MS: 1000,           // Delay before reloading page
  CONTEXT_SIZE: 30                      // Characters for prefix/suffix in XPath
};

/**
 * Accessibility thresholds
 */
const THRESHOLDS = {
  LUMINANCE_CONTRAST: 0.5
};

// ============================================
// EXPORT (for non-module scripts)
// ============================================

// Attach to window for global access in extension context
if (typeof window !== 'undefined') {
  window.HighlighterUtils = {
    escapeHtml,
    getContrastColor,
    normalizeUrl,
    HIGHLIGHT_COLORS,
    MENU_COLORS,
    TIMING,
    THRESHOLDS
  };
}

// For background script (no window object)
if (typeof globalThis !== 'undefined' && typeof window === 'undefined') {
  globalThis.HighlighterUtils = {
    escapeHtml,
    getContrastColor,
    normalizeUrl,
    HIGHLIGHT_COLORS,
    MENU_COLORS,
    TIMING,
    THRESHOLDS
  };
}
