# Avon Chrome Extension (MV3)

Minimal scaffold for a Chrome Extension using Manifest V3.

## Install (Load Unpacked)

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable Developer mode (toggle in top-right).
3. Click "Load unpacked" and select this folder: `/home/user/avon-extension`.

## What’s included

- `manifest.json`: MV3 manifest
- `background.js`: service worker
- `contentScript.js`: runs on all pages at `document_idle`
- `popup/`:
  - `popup.html`, `popup.css`, `popup.js`
- `options/`:
  - `options.html`, `options.js`

## Try it

- Click the extension icon to open the popup.
- Use "Ping" to message the active tab content script or background.
- Select text on a page, then click "Highlight Selection" to wrap it with yellow background.
- Click "Inject Alert" to run a small script via `chrome.scripting` on the current tab.
- Open Options and save your favorite color (stored in `chrome.storage.sync`).

## Notes

- No build tooling required. Plain JS/HTML/CSS.
- Permissions: `storage`, `activeTab`, `scripting`, and `host_permissions` on `<all_urls>` for demo purposes. Reduce as needed.
