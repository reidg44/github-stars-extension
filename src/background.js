// background.js (service worker) — bundled by esbuild into dist/background.js,
// so lib modules resolve at build time (and via Node require in tests).
const { getCached, setCached, isFresh, KEY_PREFIX } = require('./lib/cache');
const ghApi = require('./lib/ghApi');
const { VALID_SEGMENT } = require('./lib/parseRepo');

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24; // fallback 24 hours
const DEFAULT_INACTIVE_THRESHOLD_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

// Promisified chrome.storage helpers
function storageGet(area, keys) {
  return new Promise((resolve) => area.get(keys, resolve));
}

function storageRemove(area, keys) {
  return new Promise((resolve) => area.remove(keys, resolve));
}

const MAX_CONCURRENT = 6;
let activeRequests = 0;
const pendingQueue = [];

function acquireSlot() {
  return new Promise((resolve) => {
    if (activeRequests < MAX_CONCURRENT) {
      activeRequests++;
      resolve();
    } else {
      pendingQueue.push(resolve);
    }
  });
}

function releaseSlot() {
  activeRequests--;
  if (pendingQueue.length > 0) {
    activeRequests++;
    const next = pendingQueue.shift();
    next();
  }
}

// Coalesce concurrent requests for the same repo into one API call
const inflight = new Map();

function fetchRepo(owner, repo, token) {
  const key = `${owner}/${repo}`;
  let p = inflight.get(key);
  if (!p) {
    p = (async () => {
      await acquireSlot();
      try {
        return await ghApi.getRepo(owner, repo, token);
      } finally {
        releaseSlot();
      }
    })();
    inflight.set(key, p);
    p.finally(() => inflight.delete(key)).catch(() => {});
  }
  return p;
}

// Resolve the cache TTL from settings, handling migration from the old
// cache_ttl_minutes setting
function ttlMsFromSettings(items) {
  let hours;
  if (items.cache_ttl_hours) {
    hours = parseInt(items.cache_ttl_hours, 10);
  } else if (items.cache_ttl_minutes) {
    const mins = parseInt(items.cache_ttl_minutes, 10);
    hours = Number.isFinite(mins) && mins > 0 ? Math.ceil(mins / 60) : 24;
  } else {
    hours = 24; // default 24 hours
  }
  return Number.isFinite(hours) && hours > 0
    ? hours * 60 * 60 * 1000
    : DEFAULT_TTL_MS;
}

function inactiveThresholdMsFromSettings(items) {
  const thresholdDays = parseInt(items.inactive_threshold_days, 10);
  return Number.isFinite(thresholdDays) && thresholdDays > 0
    ? thresholdDays * 24 * 60 * 60 * 1000
    : DEFAULT_INACTIVE_THRESHOLD_MS;
}

async function handleGetStars(msg, sendResponse) {
  const { owner, repo } = msg;
  if (!owner || !repo || !VALID_SEGMENT.test(owner) || !VALID_SEGMENT.test(repo)) {
    sendResponse({ error: 'Invalid owner or repo' });
    return;
  }

  let cached = null;
  let debug = false;
  try {
    const [syncItems, tokenItems, cachedEntry] = await Promise.all([
      storageGet(chrome.storage.sync, [
        'cache_ttl_hours',
        'cache_ttl_minutes',
        'inactive_threshold_days',
        'debug_logging'
      ]),
      storageGet(chrome.storage.local, ['gh_token']),
      getCached(chrome.storage.local, owner, repo)
    ]);
    cached = cachedEntry;
    debug = !!syncItems.debug_logging;
    const ttlMs = ttlMsFromSettings(syncItems);
    const inactiveThresholdMs = inactiveThresholdMsFromSettings(syncItems);
    const token = tokenItems.gh_token;

    // computeInactiveFlag: returns true if `pushedAt` is more than threshold days ago.
    const computeInactiveFlag = (pushedAt) => {
      if (!pushedAt) return false;
      const ts = Date.parse(pushedAt);
      if (Number.isNaN(ts)) return false;
      return Date.now() - ts > inactiveThresholdMs;
    };

    // Build the message response from repo data (API json or cached.data)
    const buildResponse = (data, fetchedAt, fromCache) => ({
      stars: data.stargazers_count,
      updated: data.updated_at || new Date(fetchedAt).toISOString(),
      pushed_at: data.pushed_at || null,
      fetched_at: fetchedAt,
      cached: fromCache,
      archived: !!data.archived,
      inactive: computeInactiveFlag(data.pushed_at)
    });

    try {
      if (debug)
        console.debug('[gh-stars] GET_STARS', { owner, repo, cached });
      if (!token) {
        console.warn(
          'GitHub token not present; requests will be unauthenticated and may be rate-limited'
        );
      }

      if (isFresh(cached, ttlMs)) {
        sendResponse(buildResponse(cached.data, cached.ts, true));
        return;
      }

      const json = await fetchRepo(owner, repo, token);
      if (debug)
        console.debug('[gh-stars] API response', { owner, repo, json });

      // Trim API response to only the fields we need
      const cacheData = {
        stargazers_count: json.stargazers_count,
        updated_at: json.updated_at,
        pushed_at: json.pushed_at,
        archived: json.archived
      };

      // Set cache and handle quota errors gracefully
      try {
        await setCached(chrome.storage.local, owner, repo, cacheData);
      } catch (cacheErr) {
        // If quota exceeded, try to clean up and retry once
        if (cacheErr.message && cacheErr.message.includes('quota')) {
          console.warn('[gh-stars] Cache quota exceeded, cleaning up...');
          await cleanupCache();
          try {
            await setCached(chrome.storage.local, owner, repo, cacheData);
          } catch (retryErr) {
            console.error(
              '[gh-stars] Failed to cache after cleanup:',
              retryErr
            );
          }
        }
      }
      sendResponse(buildResponse(json, Date.now(), false));
    } catch (err) {
      // If the error indicates the repo is missing (404), prefer to signal notFound
      const errMsg = err && err.message ? String(err.message) : '';
      const status = err && err.status ? Number(err.status) : null;
      const is404 =
        status === 404 || /not\s*found/i.test(errMsg) || /404/.test(errMsg);
      if (debug)
        console.debug('[gh-stars] GET_STARS error', { owner, repo, err });
      if (is404) {
        sendResponse({ error: errMsg, notFound: true });
      } else if (cached) {
        // For other errors, return stale cached data as fallback
        sendResponse(buildResponse(cached.data, cached.ts, true));
      } else {
        sendResponse({ error: errMsg });
      }
    }
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'GET_STARS') {
    // Validate sender is from this extension
    if (!sender || sender.id !== chrome.runtime.id) {
      sendResponse({ error: 'Unauthorized sender' });
      return false;
    }
    handleGetStars(msg, sendResponse);
    return true;
  }
});

// Cache cleanup utilities
async function cleanupCache() {
  try {
    const syncItems = await storageGet(chrome.storage.sync, [
      'cache_ttl_hours',
      'cache_ttl_minutes'
    ]);
    const ttlMs = ttlMsFromSettings(syncItems);
    const allItems = await storageGet(chrome.storage.local, null);

    const now = Date.now();
    const keysToRemove = [];

    // Remove stale entries (older than 2x TTL to be safe)
    const staleThreshold = ttlMs * 2;

    for (const [key, value] of Object.entries(allItems)) {
      // Only process our cache keys (format: gh:owner/repo)
      if (key.startsWith(KEY_PREFIX) && value && value.ts) {
        const age = now - value.ts;
        if (age > staleThreshold) {
          keysToRemove.push(key);
        }
      }
    }

    if (keysToRemove.length > 0) {
      await storageRemove(chrome.storage.local, keysToRemove);
      console.log(
        `[gh-stars] Cleaned up ${keysToRemove.length} stale cache entries`
      );
      keysToRemove.forEach((k) => delete allItems[k]);
    }

    // Check if cache is still too large (size-based eviction)
    await evictOldestIfNeeded(allItems);
  } catch (err) {
    console.error('[gh-stars] Cache cleanup error:', err);
  }
}

// Evict oldest entries if cache has too many items
async function evictOldestIfNeeded(allItems) {
  try {
    const cacheEntries = Object.entries(allItems)
      .filter(([key]) => key.startsWith(KEY_PREFIX))
      .map(([key, value]) => ({ key, ts: value.ts || 0 }));

    const MAX_CACHE_ENTRIES = 500; // Reasonable limit to avoid quota issues

    if (cacheEntries.length > MAX_CACHE_ENTRIES) {
      // Sort by timestamp (oldest first)
      cacheEntries.sort((a, b) => a.ts - b.ts);

      // Remove oldest entries to get back to 80% of max
      const targetSize = Math.floor(MAX_CACHE_ENTRIES * 0.8);
      const toRemove = cacheEntries.slice(0, cacheEntries.length - targetSize);
      const keysToRemove = toRemove.map((entry) => entry.key);

      await storageRemove(chrome.storage.local, keysToRemove);
      console.log(
        `[gh-stars] Evicted ${keysToRemove.length} oldest cache entries (size limit)`
      );
    }
  } catch (err) {
    console.error('[gh-stars] Cache eviction error:', err);
  }
}

// Run cleanup on extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[gh-stars] Extension startup - running cache cleanup');
  cleanupCache();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('GitHub Stars extension installed');
  // Run cleanup on install/update
  cleanupCache();

  // Migrate token from sync to local
  chrome.storage.sync.get(['gh_token'], (syncItems) => {
    if (syncItems.gh_token) {
      chrome.storage.local.get(['gh_token'], (localItems) => {
        if (!localItems.gh_token) {
          chrome.storage.local.set({ gh_token: syncItems.gh_token }, () => {
            chrome.storage.sync.remove('gh_token');
          });
        } else {
          chrome.storage.sync.remove('gh_token');
        }
      });
    }
  });
});
