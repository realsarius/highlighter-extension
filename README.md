# Highlighter

Highlighter is a straightforward browser extension for marking up the web. It lets you highlight text, jot down notes, and keep your research organized. The main focus here is privacy: everything is stored locally in your browser (Local Storage), so no data is ever sent to external servers.

## What it does

- **Highlights**: Mark text on any page using 6 different colors (Yellow, Green, Blue, Pink, Orange, Purple).
- **Notes**: Attach sticky notes to your highlights to remember context or ideas.
- **Tagging**: Group your highlights with tags so you can actually find them later.
- **Local Only**: Data stays on your machine. No cloud sync, no tracking.
- **Dashboard**: A dedicated view to manage all your clips, notes, and stats.
- **Backup**: Easily export your data to JSON or import it to another device.
- **Quick Access**: Supports right-click context menu.
- **Themes**: Includes both Light and Dark modes.

## Installation

1. Clone this repository.
2. Go to your browser's extensions page (e.g., `chrome://extensions`).
3. Toggle "Developer mode" in the top right corner.
4. Click "Load unpacked" and select the folder you just cloned.

## How to use

1. Select some text on a page.
2. Right-click and choose "Highlight", or just hit `Ctrl+Shift+Y` (Mac: `Command+Shift+Y`).
3. Click the extension icon in the toolbar to see your recent notes or open the full dashboard.

## Under the Hood

For those interested in the code structure:

- `background/`: Handles the event listeners and context menus.
- `content/`: Scripts that inject the highlights into the DOM.
- `popup/`: The UI you see when clicking the toolbar icon.
- `_locales/`: Translation strings.

## License

© 2026 Highlighter Extension
