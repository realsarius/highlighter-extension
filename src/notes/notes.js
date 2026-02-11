/**
 * Highlighter Extension - All Notes Page
 */

// ============================================
// DOM ELEMENTS
// ============================================
const notesList = document.getElementById('notesList');
const loadingEl = document.getElementById('loading');
const emptyState = document.getElementById('emptyState');
const totalSitesEl = document.getElementById('totalSites');
const totalHighlightsEl = document.getElementById('totalHighlights');
const searchInput = document.getElementById('searchInput');
const tagFilterBar = document.getElementById('tagFilterBar');
const tagFilterList = document.getElementById('tagFilterList');

// Settings elements
const themeSelect = document.getElementById('themeSelect');
const contextMenuToggle = document.getElementById('contextMenuToggle');
const clearAllBtn = document.getElementById('clearAllBtn');

// Navigation
const navTabs = document.querySelectorAll('.nav-tab');
const tabContents = document.querySelectorAll('.tab-content');

// ============================================
// STATE
// ============================================
let allData = {};
let allTags = [];
let selectedTag = null;
let currentSettings = {};

// ============================================
// INITIALIZATION
// ============================================
async function init() {
  try {
    // Initialize i18n
    if (window.i18n) {
      await window.i18n.init();
      setupLanguageSelector();
    }

    const response = await chrome.runtime.sendMessage({
      type: 'GET_ALL_HIGHLIGHTS',
      payload: {}
    });

    loadingEl.style.display = 'none';

    if (response && response.highlights) {
      allData = response.highlights;
      collectAllTags(allData);
      renderTagFilter();
      renderAllNotes(allData);
      renderStats(allData); // Init stats
    } else {
      showEmpty();
      renderStats({}); // Init empty stats
    }
  } catch (e) {
    console.error('Failed to load highlights:', e);
    loadingEl.textContent = 'Yüklenemedi';
  }
}

// ============================================
// RENDERING
// ============================================

/**
 * Renders all notes grouped by website
 * @param {Object} data - Object with URLs as keys and page data as values
 * @param {string} [filter=''] - Optional search filter string
 */
function renderAllNotes(data, filter = '') {
  // Clear existing content (except loading/empty)
  notesList.querySelectorAll('.site-group').forEach(el => el.remove());

  const urls = Object.keys(data);

  if (urls.length === 0) {
    showEmpty();
    return;
  }

  emptyState.style.display = 'none';

  let totalHighlights = 0;
  let sitesWithMatches = 0;

  urls.forEach(url => {
    const pageData = data[url];
    const items = pageData.items || [];

    // Filter items by search and/or tag
    let filteredItems = items;

    if (filter) {
      filteredItems = filteredItems.filter(item =>
        (item.quote || '').toLowerCase().includes(filter) ||
        (item.note || '').toLowerCase().includes(filter) ||
        (item.tags || []).some(t => t.toLowerCase().includes(filter))
      );
    }

    if (selectedTag) {
      filteredItems = filteredItems.filter(item =>
        (item.tags || []).includes(selectedTag)
      );
    }

    if (filteredItems.length === 0) return;

    sitesWithMatches++;
    totalHighlights += filteredItems.length;

    const siteGroup = createSiteGroup(url, pageData.title, filteredItems);
    notesList.appendChild(siteGroup);
  });

  // Update stats
  totalSitesEl.textContent = sitesWithMatches;
  totalHighlightsEl.textContent = totalHighlights;

  if (sitesWithMatches === 0 && filter) {
    showEmpty('Aramanızla eşleşen sonuç bulunamadı');
  }
}

function createSiteGroup(url, title, items) {
  const group = document.createElement('div');
  group.className = 'site-group';

  // Extract domain for display
  let domain = url;
  try {
    domain = new URL(url).hostname;
  } catch { }

  // Sort by date (newest first)
  const sortedItems = [...items].sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );

  group.innerHTML = `
    <div class="site-header" data-url="${escapeHtml(url)}">
      <img class="site-favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" alt="" onerror="this.style.display='none'">
      <div class="site-info">
        <div class="site-title">${escapeHtml(title || domain)}</div>
        <div class="site-url">${escapeHtml(domain)}</div>
      </div>
      <span class="site-count">${items.length}</span>
    </div>
    <div class="site-highlights">
      ${sortedItems.map(item => createHighlightItem(item, url)).join('')}
    </div>
  `;

  // Site header click → open page
  group.querySelector('.site-header').addEventListener('click', () => {
    chrome.tabs.create({ url });
  });

  // Individual highlight clicks → open page and scroll to highlight
  group.querySelectorAll('.highlight-item').forEach(el => {
    // Go to page click
    const gotoBtn = el.querySelector('.highlight-goto-btn');
    if (gotoBtn) {
      gotoBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const highlightId = el.dataset.id;

        // Create tab and wait for it to load
        const tab = await chrome.tabs.create({ url });

        // Send scroll message after short delay to allow page to load
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SCROLL_TO_HIGHLIGHT',
            payload: { highlightId }
          }).catch(() => {
            // Tab might not be ready yet, retry
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, {
                type: 'SCROLL_TO_HIGHLIGHT',
                payload: { highlightId }
              }).catch(() => { });
            }, 1500);
          });
        }, 1000);
      });
    }

    // Delete click
    const deleteBtn = el.querySelector('.highlight-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const highlightId = el.dataset.id;

        if (!confirm('Bu vurguyu silmek istediğinize emin misiniz?')) return;

        // Remove from storage
        await chrome.runtime.sendMessage({
          type: 'REMOVE_HIGHLIGHT',
          payload: {
            url: url,
            highlightId: highlightId
          }
        });

        // Update UI
        el.remove();

        // Check if group is empty
        if (group.querySelectorAll('.highlight-item').length === 0) {
          group.remove();
        }

        // Update stats
        // We need to reload or manually update stats, reloading is safer for sync
        init();

        showNotification(window.i18n.t('notificationHighlightDeleted'), 'success');
      });
    }
  });

  return group;
}

function createHighlightItem(item, url) {
  const quote = item.quote || '';

  const date = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
    : '';

  const contrastColor = getContrastColor(item.color);

  const tagsHtml = item.tags && item.tags.length > 0
    ? `<div class="highlight-tags">${item.tags.map(t => `<span class="tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  return `
    <div class="highlight-item" data-id="${item.id}" data-url="${escapeHtml(url)}">
      <div class="highlight-color-bar" style="background-color: ${item.color};"></div>
      <div class="highlight-content">
        <div class="highlight-quote" style="background-color: ${item.color}; color: ${contrastColor};">${escapeHtml(quote)}</div>
        ${item.note ? `<div class="highlight-note">📝 ${escapeHtml(item.note)}</div>` : ''}
        ${tagsHtml}
        <div class="highlight-meta">${date}</div>
      </div>
      <div class="highlight-actions">
        <button class="highlight-action-btn highlight-goto-btn" title="Sayfaya Git">🔗</button>
        <button class="highlight-action-btn highlight-delete-btn" title="Sil">🗑️</button>
      </div>
    </div>
  `;
}

function showEmpty(message = null) {
  emptyState.style.display = 'block';
  if (message) {
    emptyState.querySelector('p').textContent = message;
  }
  totalSitesEl.textContent = '0';
  totalHighlightsEl.textContent = '0';
}

// ============================================
// SEARCH
// ============================================
searchInput.addEventListener('input', (e) => {
  const filter = e.target.value.toLowerCase().trim();
  renderAllNotes(allData, filter);
});

// ============================================
// TAG FILTER
// ============================================
function collectAllTags(data) {
  const tagSet = new Set();
  Object.values(data).forEach(page => {
    (page.items || []).forEach(item => {
      (item.tags || []).forEach(tag => tagSet.add(tag));
    });
  });
  allTags = [...tagSet].sort();
}

function renderTagFilter() {
  if (allTags.length === 0) {
    tagFilterBar.style.display = 'none';
    return;
  }

  tagFilterBar.style.display = 'flex';
  tagFilterList.innerHTML = `
    <button class="tag-filter-btn ${!selectedTag ? 'active' : ''}" data-tag="">Tümü</button>
    ${allTags.map(tag =>
    `<button class="tag-filter-btn ${selectedTag === tag ? 'active' : ''}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
  ).join('')}
  `;

  // Add click handlers
  tagFilterList.querySelectorAll('.tag-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedTag = btn.dataset.tag || null;
      renderTagFilter();
      renderAllNotes(allData, searchInput.value.toLowerCase().trim());
    });
  });
}

// ============================================
// UTILITIES
// ============================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
// EXPORT / IMPORT
// ============================================
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');

// Export all highlights as JSON
exportBtn.addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_ALL_HIGHLIGHTS',
      payload: {}
    });

    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      highlights: response.highlights || {}
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `highlighter-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showNotification(window.i18n.t('notificationExportSuccess'), 'success');
  } catch (e) {
    console.error('Export failed:', e);
    showNotification(window.i18n.t('notificationExportFailed'), 'error');
  }
});

// Trigger file picker
importBtn.addEventListener('click', () => {
  importFile.click();
});

// Handle file import
importFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate structure
    if (!data.highlights || typeof data.highlights !== 'object') {
      throw new Error('Invalid file format');
    }

    // Count items
    let count = 0;
    Object.values(data.highlights).forEach(page => {
      count += (page.items || []).length;
    });

    // Confirm before import
    const confirmed = confirm(`${count} vurgu içe aktarılacak. Mevcut verilerle birleştirilecek. Devam edilsin mi?`);
    if (!confirmed) {
      importFile.value = '';
      return;
    }

    // Send to background for merge
    await chrome.runtime.sendMessage({
      type: 'IMPORT_HIGHLIGHTS',
      payload: { highlights: data.highlights }
    });

    showNotification(`${count} ${window.i18n.t('notificationImported')}`, 'success');

    // Refresh the page
    setTimeout(() => location.reload(), 1000);
  } catch (e) {
    console.error('Import failed:', e);
    showNotification(window.i18n.t('notificationImportFailed'), 'error');
  }

  importFile.value = '';
});

// ============================================
// NOTIFICATIONS
// ============================================
function showNotification(message, type = 'info') {
  // Remove existing
  document.querySelectorAll('.notification').forEach(el => el.remove());

  const notif = document.createElement('div');
  notif.className = `notification notification-${type}`;
  notif.textContent = message;
  document.body.appendChild(notif);

  setTimeout(() => {
    notif.classList.add('notification-hide');
    setTimeout(() => notif.remove(), 300);
  }, 2700);
}

// ============================================
// THEME SYSTEM
// ============================================
function applyTheme(theme) {
  if (theme === 'auto') {
    // Check system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (currentSettings.theme === 'auto') {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  }
});

// ============================================
// TAB NAVIGATION
// ============================================
navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;

    // Update active tab
    navTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Show target content
    tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === `tab-${targetTab}`) {
        content.classList.add('active');
      }
    });
  });
});

// ============================================
// SETTINGS HANDLERS
// ============================================
async function loadSettings() {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_SETTINGS',
    payload: {}
  });

  currentSettings = response || {};

  // Apply theme
  const theme = currentSettings.theme || 'auto';
  themeSelect.value = theme;
  applyTheme(theme);

  // Apply context menu setting
  const showContextMenu = currentSettings.showContextMenu !== false;
  contextMenuToggle.checked = showContextMenu;
}

themeSelect.addEventListener('change', async () => {
  const theme = themeSelect.value;
  currentSettings.theme = theme;
  applyTheme(theme);

  await chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    payload: { theme }
  });
});

contextMenuToggle.addEventListener('change', async () => {
  const showContextMenu = contextMenuToggle.checked;
  currentSettings.showContextMenu = showContextMenu;

  await chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    payload: { showContextMenu }
  });

  showNotification(showContextMenu ? window.i18n.t('notificationContextMenuOn') : window.i18n.t('notificationContextMenuOff'), 'success');
});

clearAllBtn.addEventListener('click', async () => {
  const confirmed = confirm('Tüm vurgular silinecek. Bu işlem geri alınamaz. Devam edilsin mi?');
  if (!confirmed) return;

  await chrome.runtime.sendMessage({
    type: 'CLEAR_ALL_DATA',
    payload: {}
  });

  showNotification(window.i18n.t('notificationDeleted'), 'success');
  allData = {};
  allTags = [];
  selectedTag = null;
  renderAllNotes({});
  renderTagFilter();
});

// ============================================
// STATISTICS
// ============================================
function renderStats(data) {
  // Aggregate data
  let totalNotes = 0;
  let totalTagsSet = new Set();
  let dates = {};
  let days = new Set();
  let tags = {};
  let colors = {};
  let maxHighlights = 0;
  let maxDay = '-';

  Object.values(data).forEach(page => {
    (page.items || []).forEach(item => {
      // Notes
      if (item.note) totalNotes++;

      // Tags
      if (item.tags) {
        item.tags.forEach(t => {
          totalTagsSet.add(t);
          tags[t] = (tags[t] || 0) + 1;
        });
      }

      // Colors
      const color = item.color || '#FFEB3B';
      colors[color] = (colors[color] || 0) + 1;

      // Dates
      if (item.createdAt) {
        const dateKey = new Date(item.createdAt).toISOString().split('T')[0];
        dates[dateKey] = (dates[dateKey] || 0) + 1;
        days.add(dateKey);
      }
    });
  });

  // Calculate Max Day
  Object.entries(dates).forEach(([date, count]) => {
    if (count > maxHighlights) {
      maxHighlights = count;
      maxDay = new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    }
  });

  // Update Summary Cards
  document.getElementById('statsTotalDays').textContent = days.size;
  document.getElementById('statsTotalNotes').textContent = totalNotes;
  document.getElementById('statsTotalTags').textContent = totalTagsSet.size;
  document.getElementById('statsMaxDay').textContent = maxHighlights > 0 ? `${maxHighlights} (${maxDay})` : '0';

  // Render Charts
  renderActivityChart(dates);
  renderTagStats(tags);
  renderColorStats(colors);
}

function renderActivityChart(dates) {
  const container = document.getElementById('activityChart');
  container.innerHTML = '';

  // Last 30 days
  const today = new Date();
  const days = [];
  let maxVal = 0;

  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const dateKey = d.toISOString().split('T')[0];
    const val = dates[dateKey] || 0;
    if (val > maxVal) maxVal = val;
    days.push({
      date: dateKey,
      label: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
      value: val
    });
  }

  // Render bars
  days.forEach((day, index) => {
    // Only show label for every 3rd day to save space
    const showLabel = index % 3 === 0 || index === 29;
    const heightPercent = maxVal > 0 ? (day.value / maxVal) * 100 : 0;

    // Fallback min height for visibility if 0 but we want to show track
    // If value is 0, height is 2px (min-height in CSS)

    const col = document.createElement('div');
    col.className = 'bar-col';
    col.innerHTML = `
      <div class="bar" style="height: ${Math.max(heightPercent, 1)}%;" data-count="${day.value}"></div>
      ${showLabel ? `<span class="bar-label">${day.label}</span>` : ''}
    `;
    container.appendChild(col);
  });
}

function renderTagStats(tags) {
  const container = document.getElementById('tagStatsList');
  container.innerHTML = '';

  const sortedTags = Object.entries(tags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5); // Top 5

  if (sortedTags.length === 0) {
    container.innerHTML = `<span style="color:#666; font-size:13px; font-style:italic;">${window.i18n.t('statsNoData')}</span>`;
    return;
  }

  const maxVal = sortedTags[0][1];

  sortedTags.forEach(([tag, count]) => {
    const percent = (count / maxVal) * 100;
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <span class="stat-row-label" title="${tag}">${tag}</span>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" style="width: ${percent}%;"></div>
      </div>
      <span class="stat-row-count">${count}</span>
    `;
    container.appendChild(row);
  });
}

function renderColorStats(colors) {
  const container = document.getElementById('colorStatsList');
  container.innerHTML = '';

  const sortedColors = Object.entries(colors)
    .sort((a, b) => b[1] - a[1]);

  if (sortedColors.length === 0) {
    container.innerHTML = `<span style="color:#666; font-size:13px; font-style:italic;">${window.i18n.t('statsNoData')}</span>`;
    return;
  }

  const total = Object.values(colors).reduce((a, b) => a + b, 0);

  sortedColors.forEach(([color, count]) => {
    const percent = (count / total) * 100;
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <div class="highlight-color-bar" style="background-color: ${color}; width: 16px; height: 16px; border-radius: 4px;"></div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" style="width: ${percent}%; background-color: ${color};"></div>
      </div>
      <span class="stat-row-count">${Math.round(percent)}%</span>
    `;
    container.appendChild(row);
  });
}

function setupLanguageSelector() {
  const select = document.getElementById('languageSelect');
  if (!select) return;

  const languages = window.i18n.getSupportedLanguages();
  const currentLang = window.i18n.getLanguage();

  languages.forEach(lang => {
    const option = document.createElement('option');
    option.value = lang.code;
    option.textContent = lang.name;
    if (lang.code === currentLang) option.selected = true;
    select.appendChild(option);
  });

  select.addEventListener('change', async (e) => {
    const newLang = e.target.value;

    // Get existing settings
    const result = await chrome.storage.local.get('settings');
    const settings = result.settings || {};

    // Update language
    settings.language = newLang;
    await chrome.storage.local.set({ settings });

    // Reload to apply changes
    window.location.reload();
  });
}

// ============================================
// START
// ============================================
loadSettings();
init();
