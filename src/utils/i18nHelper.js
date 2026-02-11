/**
 * Highlighter Extension - i18n Helper
 * Handles manual language selection and dynamic UI translation
 */

const SUPPORTED_LANGUAGES = [
  { code: 'tr', name: 'Türkçe' },
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'ru', name: 'Русский' },
  { code: 'zh_CN', name: '简体中文' }
];

let currentLanguage = 'tr';
let translations = {};
let isInitialized = false;

/**
 * Initialize i18n
 * Loads language preference and fetches translations
 */
async function initI18n() {
  if (isInitialized) {
    console.log('[i18n] Already initialized, skipping');
    return currentLanguage;
  }

  try {
    console.log('[i18n] Initializing...');
    
    // 1. Get stored language preference
    const result = await chrome.storage.local.get('settings');
    const settings = result.settings || {};
    
    // Default to browser language or 'en' if not supported/set
    let targetLang = settings.language;
    console.log('[i18n] Settings language:', targetLang);
    
    if (!targetLang) {
      const browserLang = chrome.i18n.getUILanguage().split('-')[0];
      console.log('[i18n] Browser language:', browserLang);
      // Check if browser lang is supported
      if (SUPPORTED_LANGUAGES.some(l => l.code === browserLang)) {
        targetLang = browserLang;
      } else {
        targetLang = 'en';
      }
    }
    
    currentLanguage = targetLang;
    console.log('[i18n] Target language:', currentLanguage);
    
    // 2. Load translation file
    const url = chrome.runtime.getURL(`_locales/${currentLanguage}/messages.json`);
    console.log('[i18n] Fetching:', url);
    
    const resp = await fetch(url);
    
    if (!resp.ok) {
      console.warn('[i18n] Failed to load locale:', resp.status, '- falling back to en');
      // Fallback to English
      const fallbackUrl = chrome.runtime.getURL('_locales/en/messages.json');
      const fallbackResp = await fetch(fallbackUrl);
      if (fallbackResp.ok) {
        translations = await fallbackResp.json();
        currentLanguage = 'en';
      } else {
        console.error('[i18n] Failed to load fallback locale');
        return 'en';
      }
    } else {
      translations = await resp.json();
    }
    
    const keyCount = Object.keys(translations).length;
    console.log('[i18n] Loaded', keyCount, 'translation keys');
    
    if (keyCount === 0) {
      console.error('[i18n] No translations loaded!');
      return currentLanguage;
    }
    
    // 3. Apply to page
    isInitialized = true;
    applyTranslations();
    
    console.log('[i18n] Initialization complete');
    return currentLanguage;
  } catch (e) {
    console.error('[i18n] init failed:', e);
    // Still try to apply whatever we have
    applyTranslations();
    return 'en';
  }
}

/**
 * Apply translations to all elements with data-i18n attribute
 */
function applyTranslations() {
  const elements = document.querySelectorAll('[data-i18n], [data-i18n-title]');
  console.log('[i18n] Found', elements.length, 'elements to translate');
  
  let translated = 0;
  let failed = 0;
  
  elements.forEach(el => {
    // Text Content / Placeholder
    if (el.hasAttribute('data-i18n')) {
      const key = el.getAttribute('data-i18n');
      const msg = t(key);
      if (msg) {
        if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search')) {
          el.placeholder = msg;
        } else if (el.tagName === 'OPTION') {
          el.textContent = msg;
        } else {
          el.textContent = msg;
        }
        translated++;
      } else {
        console.warn('[i18n] Missing key:', key);
        failed++;
      }
    }
    
    // Title Attribute
    if (el.hasAttribute('data-i18n-title')) {
      const key = el.getAttribute('data-i18n-title');
      const msg = t(key);
      if (msg) {
        el.title = msg;
        translated++;
      } else {
        failed++;
      }
    }
  });
  
  console.log('[i18n] Translated:', translated, '| Failed:', failed);
}

/**
 * Get translation for a key
 * @param {string} key 
 * @returns {string} Translated string or empty if not found
 */
function t(key) {
  if (translations[key] && translations[key].message) {
    return translations[key].message;
  }
  return '';
}

/**
 * Get current language code
 */
function getLanguage() {
  return currentLanguage;
}

/**
 * Get list of supported languages
 */
function getSupportedLanguages() {
  return SUPPORTED_LANGUAGES;
}

/**
 * Check if i18n is initialized
 */
function isReady() {
  return isInitialized;
}

// Export for use in other scripts
window.i18n = {
  init: initI18n,
  apply: applyTranslations,
  t: t,
  getLanguage: getLanguage,
  getSupportedLanguages: getSupportedLanguages,
  isReady: isReady
};

console.log('[i18n] Helper loaded, window.i18n available');
