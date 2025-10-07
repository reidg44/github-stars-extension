// background.js (service worker) — uses lib/cache and lib/ghApi
let getCached, setCached, isFresh;
let ghApi;

// Try to require modules (works in tests/builds). If not available (MV3 runtime),
// provide small fallbacks that use the chrome.* APIs directly.
try {
  // eslint-disable-next-line no-undef
  const cacheMod =
    typeof require === 'function' ? require('./lib/cache') : null;
  if (cacheMod) {
    getCached = cacheMod.getCached;
    setCached = cacheMod.setCached;
    isFresh = cacheMod.isFresh;
  }
} catch (e) {
  // ignore
}

if (!getCached) {
  // fallback implementations using chrome.storage
  const makeKey = (owner, repo) => {
    return `gh:${owner}/${repo}`;
  };
  getCached = function (storage, owner, repo) {
    const key = makeKey(owner, repo);
    return new Promise((resolve) =>
      storage.get([key], (items) => resolve(items[key] || null))
    );
  };
  setCached = function (storage, owner, repo, data) {
    const key = makeKey(owner, repo);
    const payload = { data, ts: Date.now() };
    return new Promise((resolve) =>
      storage.set({ [key]: payload }, () => resolve())
    );
  };
  isFresh = function (cached, ttlMs) {
    if (!cached) return false;
    return Date.now() - cached.ts < ttlMs;
  };
}

try {
  // eslint-disable-next-line no-undef
  ghApi = typeof require === 'function' ? require('./lib/ghApi') : null;
} catch (e) {
  ghApi = null;
}

if (!ghApi) {
  // simple fallback fetcher with same interface getRepo(owner, repo, token)
  ghApi = {
    async getRepo(owner, repo, token) {
      const url = `https://api.github.com/repos/${owner}/${repo}`;
      const headers = { Accept: 'application/vnd.github.v3+json' };
      if (token) headers['Authorization'] = `token ${token}`;
      const resp = await fetch(url, { headers });
      if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
      return resp.json();
    }
  };
}

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24; // fallback 24 hours

function getTtlMsFromSettings(cb) {
  chrome.storage.sync.get(['cache_ttl_hours', 'cache_ttl_minutes'], (items) => {
    let hours;
    if (items.cache_ttl_hours) {
      hours = parseInt(items.cache_ttl_hours, 10);
    } else if (items.cache_ttl_minutes) {
      // Handle migration from old minutes setting
      const mins = parseInt(items.cache_ttl_minutes, 10);
      hours = Number.isFinite(mins) && mins > 0 ? Math.ceil(mins / 60) : 24;
    } else {
      hours = 24; // default 24 hours
    }
    cb(
      Number.isFinite(hours) && hours > 0
        ? hours * 60 * 60 * 1000
        : DEFAULT_TTL_MS
    );
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'GET_STARS') {
    (async () => {
      const { owner, repo } = msg;
      try {
        const ttlMs = await new Promise((resolve) =>
          getTtlMsFromSettings(resolve)
        );

        // Get configurable inactive threshold
        const inactiveThresholdMs = await new Promise((resolve) => {
          chrome.storage.sync.get(['inactive_threshold_days'], (items) => {
            const thresholdDays = parseInt(items.inactive_threshold_days, 10);
            const defaultMs = 60 * 24 * 60 * 60 * 1000; // 60 days in milliseconds
            resolve(
              Number.isFinite(thresholdDays) && thresholdDays > 0
                ? thresholdDays * 24 * 60 * 60 * 1000
                : defaultMs
            );
          });
        });

        // computeInactiveFlag: returns true if `pushedAt` is more than threshold days ago.
        const computeInactiveFlag = (pushedAt) => {
          try {
            if (!pushedAt) return false;
            const ts = Date.parse(pushedAt);
            if (Number.isNaN(ts)) return false;
            return Date.now() - ts > inactiveThresholdMs;
          } catch (e) {
            return false;
          }
        };
        const cached = await getCached(chrome.storage.local, owner, repo);
        chrome.storage.sync.get(
          ['gh_token', 'debug_logging'],
          async (items) => {
            let debug = false;
            try {
              const token = items.gh_token;
              debug = !!items.debug_logging;
              if (debug)
                console.debug('[gh-stars] GET_STARS', { owner, repo, cached });
              if (!token) {
                console.warn(
                  'GitHub token not present; requests will be unauthenticated and may be rate-limited'
                );
              }

              // If we have a fresh cached value, perform a quick HEAD check to ensure the repo still exists.

              if (isFresh(cached, ttlMs)) {
                try {
                  const url = `https://api.github.com/repos/${owner}/${repo}`;
                  const headers = { Accept: 'application/vnd.github.v3+json' };
                  if (token) headers['Authorization'] = `token ${token}`;
                  const headResp = await fetch(url, {
                    method: 'HEAD',
                    headers
                  });
                  // If HEAD reports 404, prefer signaling notFound even though cache is fresh
                  if (headResp.status === 404) {
                    sendResponse({ error: 'Not Found', notFound: true });
                    return;
                  }
                  // otherwise, return the cached value
                  sendResponse({
                    stars: cached.data.stargazers_count,
                    // expose the repository's updated_at (when available) so callers can
                    // compute inactivity from the repository's last push/update time.
                    updated:
                      cached.data && cached.data.updated_at
                        ? cached.data.updated_at
                        : new Date(cached.ts).toISOString(),
                    pushed_at:
                      cached.data && cached.data.pushed_at
                        ? cached.data.pushed_at
                        : null,
                    fetched_at: cached.ts,
                    cached: true,
                    archived: !!cached.data.archived,
                    inactive: computeInactiveFlag(cached.data.pushed_at)
                  });
                  return;
                } catch (headErr) {
                  // network errors when checking HEAD -> fall back to cached
                  sendResponse({
                    stars: cached.data.stargazers_count,
                    updated:
                      cached.data && cached.data.updated_at
                        ? cached.data.updated_at
                        : new Date(cached.ts).toISOString(),
                    pushed_at:
                      cached.data && cached.data.pushed_at
                        ? cached.data.pushed_at
                        : null,
                    fetched_at: cached.ts,
                    cached: true,
                    archived: !!cached.data.archived,
                    inactive: computeInactiveFlag(cached.data.pushed_at)
                  });
                  return;
                }
              }

              const json = await ghApi.getRepo(owner, repo, token);
              if (debug)
                console.debug('[gh-stars] API response', { owner, repo, json });

              // Set cache and handle quota errors gracefully
              try {
                await setCached(chrome.storage.local, owner, repo, json);
              } catch (cacheErr) {
                // If quota exceeded, try to clean up and retry once
                if (cacheErr.message && cacheErr.message.includes('quota')) {
                  console.warn(
                    '[gh-stars] Cache quota exceeded, cleaning up...'
                  );
                  await cleanupCache();
                  try {
                    await setCached(chrome.storage.local, owner, repo, json);
                  } catch (retryErr) {
                    console.error(
                      '[gh-stars] Failed to cache after cleanup:',
                      retryErr
                    );
                  }
                }
              }
              sendResponse({
                stars: json.stargazers_count,
                // use the repo's updated_at provided by the API
                updated: json.updated_at || new Date().toISOString(),
                // use the repo's pushed_at for inactive calculation
                pushed_at: json.pushed_at || null,
                fetched_at: Date.now(),
                cached: false,
                archived: !!json.archived,
                inactive: computeInactiveFlag(json.pushed_at)
              });
            } catch (err) {
              // If the error indicates the repo is missing (404), prefer to signal notFound
              const msg = err && err.message ? String(err.message) : '';
              const status = err && err.status ? Number(err.status) : null;
              const is404 =
                status === 404 || /not\s*found/i.test(msg) || /404/.test(msg);
              if (debug)
                console.debug('[gh-stars] GET_STARS error', {
                  owner,
                  repo,
                  err
                });
              if (is404) {
                sendResponse({ error: msg, notFound: true });
                return;
              }

              // For other errors, if fetch failed but we have cached data, return it as fallback
              if (cached) {
                sendResponse({
                  stars: cached.data.stargazers_count,
                  updated:
                    cached.data && cached.data.updated_at
                      ? cached.data.updated_at
                      : new Date(cached.ts).toISOString(),
                  pushed_at:
                    cached.data && cached.data.pushed_at
                      ? cached.data.pushed_at
                      : null,
                  fetched_at: cached.ts,
                  cached: true,
                  archived: !!cached.data.archived,
                  inactive: computeInactiveFlag(cached.data.pushed_at)
                });
              } else {
                sendResponse({ error: msg });
              }
            }
          }
        );
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
});

// Cache cleanup utilities
async function cleanupCache() {
  try {
    const ttlMs = await new Promise((resolve) => getTtlMsFromSettings(resolve));
    const allItems = await new Promise((resolve) => {
      chrome.storage.local.get(null, (items) => resolve(items));
    });

    const now = Date.now();
    const keysToRemove = [];

    // Remove stale entries (older than 2x TTL to be safe)
    const staleThreshold = ttlMs * 2;

    for (const [key, value] of Object.entries(allItems)) {
      // Only process our cache keys (format: gh:owner/repo)
      if (key.startsWith('gh:') && value && value.ts) {
        const age = now - value.ts;
        if (age > staleThreshold) {
          keysToRemove.push(key);
        }
      }
    }

    if (keysToRemove.length > 0) {
      await new Promise((resolve) => {
        chrome.storage.local.remove(keysToRemove, () => {
          console.log(
            `[gh-stars] Cleaned up ${keysToRemove.length} stale cache entries`
          );
          resolve();
        });
      });
    }

    // Check if cache is still too large (size-based eviction)
    await evictOldestIfNeeded();
  } catch (err) {
    console.error('[gh-stars] Cache cleanup error:', err);
  }
}

// Evict oldest entries if cache has too many items
async function evictOldestIfNeeded() {
  try {
    const allItems = await new Promise((resolve) => {
      chrome.storage.local.get(null, (items) => resolve(items));
    });

    const cacheEntries = Object.entries(allItems)
      .filter(([key]) => key.startsWith('gh:'))
      .map(([key, value]) => ({ key, ts: value.ts || 0 }));

    const MAX_CACHE_ENTRIES = 500; // Reasonable limit to avoid quota issues

    if (cacheEntries.length > MAX_CACHE_ENTRIES) {
      // Sort by timestamp (oldest first)
      cacheEntries.sort((a, b) => a.ts - b.ts);

      // Remove oldest entries to get back to 80% of max
      const targetSize = Math.floor(MAX_CACHE_ENTRIES * 0.8);
      const toRemove = cacheEntries.slice(0, cacheEntries.length - targetSize);
      const keysToRemove = toRemove.map((entry) => entry.key);

      await new Promise((resolve) => {
        chrome.storage.local.remove(keysToRemove, () => {
          console.log(
            `[gh-stars] Evicted ${keysToRemove.length} oldest cache entries (size limit)`
          );
          resolve();
        });
      });
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
});
