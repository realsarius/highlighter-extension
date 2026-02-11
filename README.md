# Highlighter Extension

**Highlighter** is a simple yet powerful browser extension that allows you to highlight text on web pages, add notes, and organize your research with ease. All data is stored locally in your browser, ensuring your privacy.

## Features

- **Highlight Text**: Select text on any web page and highlight it with multiple colors (Yellow, Green, Blue, Pink, Orange, Purple).
- **Add Notes**: Attach notes to your highlights to remember key details or thoughts.
- **Organize with Tags**: Categorize your highlights using tags for easy retrieval.
- **Local Storage**: Your data stays on your device. No external servers involved.
- **Dashboard**: View all your highlights, notes, and statistics in a dedicated dashboard.
- **Export/Import**: Backup your data or move it to another device easily.
- **Context Menu Support**: Right-click to highlight text quickly.
- **Customizable**: Choose between Light and Dark themes.

## Installation

1. Clone this repository.
2. Open your browser's extensions page (e.g., `chrome://extensions` in Chrome).
3. Enable "Developer mode" in the top right.
4. Click "Load unpacked" and select the extension directory.

## Usage

1. Select any text on a web page.
2. Use the context menu (Right-click > Highlight) or use the keyboard shortcut `Ctrl+Shift+Y` (Mac: `Command+Shift+Y`).
3. Click the extension icon to view recent highlights or access the full dashboard.

## Development

### Structure
- `background/`: Background scripts for handling events and context menus.
- `content/`: Scripts that run on web pages to render highlights.
- `popup/`: The extension popup interface.
- `_locales/`: Internationalization strings.

## License

© 2026 Highlighter Extension
