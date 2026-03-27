# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Manifest V3 Chrome extension that displays GitHub star counts as inline badges next to GitHub repo links on any webpage. No runtime dependencies — uses browser APIs only.

## Commands

```bash
npm run build          # Bundle src/background.js → dist/background.js (esbuild, required before loading extension)
npm run lint           # ESLint on all .js files
npm test               # Jest unit tests (node env by default; content.test.js overrides to jsdom)
npx jest test/cache.test.js  # Run a single test file
npm run test:e2e       # Playwright E2E tests (requires: npx playwright install)
npm run package        # Build + zip for distribution → github-stars-extension.zip
```

**Critical:** Always run `npm run build` after modifying `src/background.js` or any `src/lib/` module — the service worker loads from `dist/background.js`, not source.

Pre-commit hooks (gitleaks, trailing-whitespace, end-of-file-fixer) run on commit — install with `pre-commit install`.

## Architecture

**Content Script → Background Service Worker** message-passing pattern:

- `src/content.js` — Scans DOM for GitHub links, injects badge elements, sends `{ type: 'GET_STARS', owner, repo }` messages to background
- `src/background.js` — Receives messages, calls GitHub API via `src/lib/ghApi.js`, manages two-tier cache (`chrome.storage.local` + TTL via `src/lib/cache.js`), responds with star data
- `src/options.js` + `src/options.html` — User config UI (token, cache TTL, inactive threshold, domain exclusions, debug toggle)
- `src/lib/parseRepo.js` — URL parsing with extensive excluded-path filtering to avoid false positives
- `src/lib/domain.js` — Domain matching (exact + subdomain)

**Dual module pattern** — All `src/lib/` modules export via `module.exports` for Node.js (tests/build) and are also available as browser globals. The background script uses try-catch `require()` with inline fallbacks for browser context.

## Testing

**Unit tests** (`test/*.test.js`): Chrome APIs are shimmed via globals defined at the top of each test file. Content script is loaded via `require()`.

**E2E tests** (`e2e/content.spec.js`): Playwright injects content script + lib modules via `page.addInitScript()` with shimmed Chrome APIs. Tests run against `test/test-page.html`.

## Key Conventions

- Cache keys use `gh:owner/repo` format
- Badge insertion guarded by `data-gh-stars-badge-inserted` attribute to prevent duplicates
- **URL filtering has three layers in `src/content.js`**: `EXCLUDED_GITHUB_PATHS` (path-prefix matches like `orgs/`, `settings/`), `EXCLUDED_GITHUB_PATTERNS` (substring matches like `/blob/`, `/issues`), and `HARD_CODED_EXCLUDED_PAGES` (full page-URL matches like `docs.github.com`)
- **Duplicated excluded-paths gotcha:** `src/lib/parseRepo.js` has its own `EXCLUDED_GITHUB_PATHS` list that overlaps with but is shorter than the one in `src/content.js` — changes to excluded paths must be applied to both files
- Wrap all `chrome.*` API calls in try-catch for test environment compatibility
- Inactive repos detected via `pushed_at` timestamp (not `updated_at`), threshold is user-configurable (default 60 days)
- Badge states: active (⭐ count), inactive (🧟⭐ count), archived (🪦), not found (🚫)
