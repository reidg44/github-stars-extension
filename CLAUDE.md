# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Manifest V3 Chrome extension that displays GitHub star counts as inline badges next to GitHub repo links on any webpage. No runtime dependencies — uses browser APIs only.

## Commands

```bash
npm run build          # Bundle src/background.js + src/content.js → dist/ (esbuild, required before loading extension)
npm run lint           # ESLint on all .js files
npm test               # Jest unit tests (node env by default; content.test.js overrides to jsdom)
npx jest test/cache.test.js  # Run a single test file
npm run test:e2e       # Playwright E2E tests (requires: npx playwright install)
npm run package        # Build + zip for distribution → github-stars-extension.zip
```

**Critical:** Always run `npm run build` after modifying `src/background.js`, `src/content.js`, or any `src/lib/` module — the extension loads both scripts from `dist/`, not source.

Pre-commit hooks (gitleaks, trailing-whitespace, end-of-file-fixer) run on commit — install with `pre-commit install`.

## Architecture

**Content Script → Background Service Worker** message-passing pattern:

- `src/content.js` — Scans DOM for GitHub links, injects badge elements, sends `{ type: 'GET_STARS', owner, repo }` messages to background
- `src/background.js` — Receives messages, calls GitHub API via `src/lib/ghApi.js`, manages two-tier cache (`chrome.storage.local` + TTL via `src/lib/cache.js`), responds with star data
- `src/options.js` + `src/options.html` — User config UI (token, cache TTL, inactive threshold, domain exclusions, debug toggle)
- `src/lib/parseRepo.js` — Canonical URL classification: `extractRepoFromUrl` (lenient parse) and `extractBadgeableRepo` (parse + badge exclusion lists)
- `src/lib/domain.js` — Domain matching (exact + subdomain)

**Module pattern** — `src/lib/` modules are CommonJS (`module.exports`, guarded with `typeof module !== 'undefined'` where the E2E harness inlines them). Both entry points (`background.js`, `content.js`) `require()` them directly; esbuild resolves the requires at build time, and Node resolves them in Jest.

## Testing

**Unit tests** (`test/*.test.js`): Chrome APIs are shimmed via globals defined at the top of each test file. Content script is loaded via `require()`.

**E2E tests** (`e2e/content.spec.js`): Playwright injects content script + lib modules via `page.addInitScript()` with shimmed Chrome APIs. Tests run against `test/test-page.html`.

## Key Conventions

- Cache keys use `gh:owner/repo` format
- Badge insertion guarded by `data-gh-stars-badge-inserted` attribute to prevent duplicates
- **URL filtering has three layers**: `EXCLUDED_GITHUB_PATHS` (path-prefix matches like `orgs/`, `settings/`) and `EXCLUDED_GITHUB_PATTERNS` (substring matches like `/blob/`, `/issues`) both live canonically in `src/lib/parseRepo.js`; `HARD_CODED_EXCLUDED_PAGES` (full page-URL matches like `docs.github.com`) lives in `src/content.js`
- `extractRepoFromUrl` intentionally still parses repo sub-pages (`/tree/`, `/issues`) to `{owner, repo}`; `extractBadgeableRepo` is the strict variant the content script uses for badge decisions
- Wrap all `chrome.*` API calls in try-catch for test environment compatibility
- Inactive repos detected via `pushed_at` timestamp (not `updated_at`), threshold is user-configurable (default 60 days)
- Badge states: active (⭐ count), inactive (🧟⭐ count), archived (🪦), not found (🚫)
