# GitHub Stars Extension AI Instructions

## Architecture Overview

This is a **Manifest V3 Chrome extension** that displays GitHub repository star counts as inline badges next to GitHub repo links on any webpage. Key architectural components:

- **Content Script** (`src/content.js`): Scans pages for GitHub links, injects badge placeholders, communicates with background service worker
- **Background Service Worker** (`dist/background.js`): Handles GitHub API calls, caching, bundled with esbuild for MV3 compatibility
- **Options Page** (`src/options.html/js`): User configuration for GitHub token, cache TTL, domain exclusions
- **Modular Library** (`src/lib/`): Reusable modules for URL parsing, caching, GitHub API calls

## Critical Build & Development Workflow

**ALWAYS run `npm run build` before loading extension** - the background script requires bundling for MV3:

```bash
npm run build  # bundles src/background.js → dist/background.js
```

Load unpacked extension: Chrome → `chrome://extensions` → Developer mode → Load unpacked (select repo root)

## Testing Architecture

**Dual testing approach** with shared module patterns:

### Unit Tests (Jest + jsdom)

- Location: `test/*.test.js`
- Chrome APIs mocked via global shims in test files
- Content script loaded via `require()` in test environment
- Tests individual functions and DOM manipulation

### E2E Tests (Playwright)

- Location: `e2e/*.spec.js`
- Content script injected via `page.addInitScript({ content: scriptSource })`
- Chrome APIs shimmed with realistic mock responses in browser context
- Tests full integration on real test page (`test/test-page.html`)

## Module System & MV3 Compatibility

**Dual module pattern** for Node.js tests + browser runtime:

```javascript
// In src/lib/parseRepo.js
function extractRepoFromUrl(url) {
  /* implementation */
}

// Export for Node.js (tests/build)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractRepoFromUrl };
}

// In src/background.js - graceful fallback
try {
  const cacheMod =
    typeof require === 'function' ? require('./lib/cache') : null;
  if (cacheMod) {
    getCached = cacheMod.getCached;
  }
} catch (e) {
  /* use inline fallback */
}
```

## Caching Strategy

**Two-tier caching system**:

- `chrome.storage.local` for API responses with timestamps
- TTL-based freshness checking via `src/lib/cache.js`
- Cache keys: `gh:owner/repo` format
- Default TTL: 1 hour, user-configurable via options

## Content Script Communication Pattern

Content script → Background worker message flow:

```javascript
// Content script sends
chrome.runtime.sendMessage({ type: 'GET_STARS', owner, repo }, callback);

// Background worker responds with:
{ stars: 1234, updated: timestamp, archived: false }
// OR { error: 'message', notFound: true }
```

## Badge State Visual Patterns

- **Active repo**: ⭐ {count} (yellow star + number)
- **Inactive repo**: 🧟 {count} (zombie emoji + star count for repos not updated in 30+ days)
- **Archived repo**: 🪦 (gravestone emoji only, no star)
- **Not found**: 🚫 (banned emoji only, no star)

## Extension-Specific Conventions

### Chrome API Error Handling

Always wrap chrome.\* calls in try-catch - APIs may not exist in test environments:

```javascript
try {
  if (chrome && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['key'], callback);
  }
} catch (e) {
  /* graceful fallback */
}
```

### DOM Insertion Guards

Prevent duplicate badges via data attributes:

```javascript
if (anchor.dataset.ghStarsBadgeInserted) return;
anchor.dataset.ghStarsBadgeInserted = '1';
```

### Packaging for Distribution

Use `npm run package` which:

1. Runs `npm run build`
2. Creates zip with only distribution files (excludes tests, node_modules)
3. Outputs `github-stars-extension.zip` in repo root

## Key Files for AI Context

- `manifest.json`: Extension permissions and entry points
- `src/content.js`: Core link detection and badge injection logic (339 lines)
- `src/background.js`: API calls and caching service worker (219 lines)
- `src/lib/parseRepo.js`: URL parsing with validation patterns
- `test/test-page.html`: Test page with various GitHub link scenarios
- `e2e/content.spec.js`: E2E test patterns for content script injection

## Development Debugging

- Enable debug mode via options page → "Debug logging"
- Console debug in content script: `window.__ghStarsDebug = true`
- Test GitHub token: Options page will warn if missing (affects rate limits)
- Badge not appearing: Check options for disabled domains or global toggle
