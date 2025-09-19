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
- Default TTL: 24 hours, user-configurable via options (changed from minutes to hours)

## Options Configuration

**User-configurable settings** via extension options page:

- **GitHub Token**: Optional PAT for increased rate limits
- **Cache TTL**: Time-to-live in hours (default: 24 hours)
- **Inactive Threshold**: Days before marking repo as inactive (default: 60 days)
- **Badge Toggle**: Enable/disable inline badges globally
- **Domain Exclusions**: Per-domain opt-out list
- **Debug Logging**: Enable console debug output

## Content Script Communication Pattern

Content script → Background worker message flow:

```javascript
// Content script sends
chrome.runtime.sendMessage({ type: 'GET_STARS', owner, repo }, callback);

// Background worker responds with:
{ stars: 1234, updated: timestamp, pushed_at: timestamp, archived: false, inactive: boolean }
// OR { error: 'message', notFound: true }
```

**Note**: The `inactive` flag is computed by the background script using the user-configurable inactive threshold (default 60 days) and `pushed_at` timestamp.

## Badge State Visual Patterns

- **Active repo**: ⭐ {count} (yellow star + number)
- **Inactive repo**: 🧟 ⭐ {count} (zombie emoji + yellow star + number for repos not pushed to in 30+ days)
- **Archived repo**: 🪦 (gravestone emoji only, no star)
- **Not found**: 🚫 (banned emoji only, no star)

**Note**: Inactive detection changed from `updated_at` to `pushed_at` to focus on actual code activity rather than general repository activity (stars, issues, etc.). The threshold is now user-configurable (default 60 days) instead of hardcoded 30 days.

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

### Badge DOM Structure

Badges use a modular DOM structure for flexible display:

```html
<span class="gh-stars-badge">
  <span class="gh-stars-zombie" style="display: none">🧟</span>
  <!-- Hidden by default -->
  <svg>...</svg>
  <!-- Star icon -->
  <span class="gh-stars-count">1,234</span>
</span>
```

For inactive repos, the zombie prefix is shown and styled with `display: inline`.

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
