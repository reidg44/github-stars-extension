# GitHub Stars Chrome Extension
A Chrome extension that displays the number of stars for a GitHub repository directly next to a link to the repository on the page.

Vibe coded with GitHub Copilot and Claude Sonnet.

## Features

The extension shows different badge types based on repository status:

- **Active repositories**: ⭐ {count} - Show star icon with count
- **Inactive repositories**: 🧟 ⭐ {count} - Show zombie emoji + star icon + count (not pushed to in 30+ days)
- **Archived repositories**: 🪦 - Show gravestone emoji only
- **Missing repositories**: 🚫 - Show banned emoji only

**Note**: Inactive detection is based on `pushed_at` (last code push) rather than `updated_at` (general activity like stars/issues) to focus on actual development activity.

## Recent Updates

- **v0.1.0 (Sept 2025)**:
  - Improved inactive repository detection using `pushed_at` timestamps instead of `updated_at` for more accurate assessment of code activity
  - Updated badge visual hierarchy so zombie emoji appears before star icon
  - Changed cache TTL from minutes to hours with 24-hour default
  - Added configurable inactive threshold (60 days default) instead of hardcoded 30 days

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

This project includes:
- Unit/integration tests with Jest (some tests run in a jsdom environment).
- An end-to-end (E2E) smoke test implemented with Playwright that loads `test/test-page.html`, injects a small `chrome` shim and the extension's `src/content.js`, and verifies the badges for Active / Inactive / Archived / Missing cases.

Unit tests (Jest)

- Install dev dependencies (if not already):

```bash
npm install
```

- Run the unit tests:

```bash
npm test
```

E2E tests (Playwright)

The E2E tests are under the `e2e/` folder and are configured by the root `playwright.config.js` (Playwright will run tests in `e2e/` by default).

- Install Playwright test runner and browsers:

```bash
npm install -D playwright @playwright/test
npx playwright install
```

- Run the E2E tests:

```bash
npm run test:e2e
```

- View HTML report for the last run:

```bash
npx playwright show-report
```

Troubleshooting & notes

- Single Playwright config: this repo uses the root `playwright.config.js` to avoid accidental discovery of unit tests under `test/` by Playwright. A duplicate `e2e/playwright.config.js` was removed to prevent conflicting configs.
- Playwright `addInitScript` usage: Playwright requires `page.addInitScript({ content: '...' })` or `page.addInitScript({ path: '/abs/path/to/file.js' })`. If you see errors like "Either path or content property must be present", change any `{ script: ... }` calls to `{ content: ... }`.
- MutationObserver errors in tests: some earlier runs injected the content script before `document.body` existed which caused `MutationObserver.observe` to throw. The content script now waits for DOMContentLoaded and guards `observe()` so the tests won't fail with "parameter 1 is not of type 'Node'".
- Missing GitHub token warning: when running tests you may see a console warning "GitHub token not present..." — this is expected unless you've configured a PAT in the extension options. The tests mock `chrome` APIs to avoid real network usage.
- If Playwright tries to run Jest tests (you'll see ReferenceError: beforeEach/test is not defined), ensure Playwright's `testDir` points to `e2e/` (see root `playwright.config.js`).

If you change the content script or background code, rebuild the background bundle for MV3 using:

```bash
npm run build
```

Run the unit tests and E2E tests locally after install as shown above.

## Loading in Chrome (unpacked)

1. Run `npm run build` to produce `dist/background.js`.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable "Developer mode" (top-right).
4. Click "Load unpacked" and select the repository root (or the folder containing `manifest.json`).
5. The extension will be loaded; use the toolbar action to open the options page or right-click a page and inspect injected badges.

## Options & Token

Open the extension Options page (via the action menu or `chrome://extensions` → Details → Options) to:
- Paste a GitHub Personal Access Token (PAT) to increase API rate limits (optional). Create one at https://github.com/settings/tokens with `public_repo` scope.
- Set the cache TTL in hours (default: 24 hours).
- Configure the inactive threshold in days (default: 60 days) - repositories that haven't been pushed to in this many days will show the zombie emoji.
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
