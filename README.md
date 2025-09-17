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

## Build

This project uses `esbuild` to bundle the background service worker so it works in Manifest V3.

- Build (bundles `src/background.js` to `dist/background.js`):

	npm run build

Make sure you run the build before loading the extension if you've edited background source files.

## Testing

We use Jest for unit and integration tests. Some tests run in a DOM-like environment using jsdom.

- Install dev dependencies (if not already):

	npm install

- Run tests:

	npm test

### End-to-end (Playwright)

We provide a Playwright E2E test that loads `test/test-page.html`, injects a minimal `chrome` shim and the extension's `src/content.js`, and asserts badges render for Active / Archived / Stale / Missing scenarios.

Install Playwright and run the E2E tests:

```bash
# Install Playwright and browsers
npm install -D playwright @playwright/test
npx playwright install

# Run E2E tests
npm run test:e2e
```

The E2E tests use a file:// URL to load `test/test-page.html` and rely on `page.addInitScript` to inject the content script and a small `chrome` shim so the test doesn't need a loaded Chrome extension.

Notes:
- The DOM tests require `jest-environment-jsdom` which is included in devDependencies.
- Tests mock the `chrome` APIs where appropriate so you can run them locally.

## Loading in Chrome (unpacked)

1. Run `npm run build` to produce `dist/background.js`.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable "Developer mode" (top-right).
4. Click "Load unpacked" and select the repository root (or the folder containing `manifest.json`).
5. The extension will be loaded; use the toolbar action to open the options page or right-click a page and inspect injected badges.

## Options & Token

Open the extension Options page (via the action menu or `chrome://extensions` -> Details -> Options) to:
- Paste a GitHub Personal Access Token (PAT) to increase API rate limits (optional). Create one at https://github.com/settings/tokens with `public_repo` scope.
- Set the cache TTL in minutes.
- Enable/disable inline badges and add per-domain opt-outs.

Security note: the PAT is stored in `chrome.storage.sync` for convenience — treat it like a password and revoke it if exposed.

## Packaging for Chrome Web Store

To prepare a zip for upload (manually):

1. Run `npm run build`.
2. Create a zip archive containing `manifest.json`, `dist/`, `src/styles/`, `src/options.html`, `src/options.js`, and any icons/resources. Do NOT include tests, node_modules, or dev files.

Example (from repository root):

	zip -r github-stars.zip manifest.json dist src/styles src/options.html src/options.js icons

	Or use the included npm script which runs the build and creates a zip in the repo root:

		npm run package

	This will produce `github-stars-extension.zip` containing the minified/bundled background and the files needed for distribution.

## Troubleshooting

- If badges do not appear on a page, check the Options page that badges are enabled and the current site is not in the opt-out list.
- If the background script fails to load in Chrome MV3, ensure `dist/background.js` exists (run `npm run build`).
- If tests fail, run `npm install` to ensure dev dependencies are present and then `npm test` again.

