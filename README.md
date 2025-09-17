# GitHub Stars Chrome Extension
A Chrome extension that displays the number of stars for a GitHub repository directly next to a link to the repository on the page.

## Scaffold

This repository contains a minimal scaffold for a Manifest V3 Chrome extension. Files added:

- `manifest.json` - extension manifest (MV3)
- `src/content.js` - content script that finds GitHub repo links and injects badges
- `src/background.js` - background service worker that fetches GitHub API and caches results
- `src/options.html` / `src/options.js` - options page to set a GitHub token and cache TTL
- `package.json`, `.gitignore`, `icons/`

You can enable or disable inline badges via the extension Options page.

## How to load (developer)

1. Open Chrome and go to chrome://extensions
2. Enable "Developer mode"
3. Click "Load unpacked" and choose this repository's root folder

The extension will inject small star badges next to GitHub repo links on pages.

## Next steps

- Implement more robust URL parsing and unit tests
- Add caching TTL configurable via options
- Improve badge styling and accessibility
