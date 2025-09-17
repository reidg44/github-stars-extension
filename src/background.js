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

const DEFAULT_TTL_MS = 1000 * 60 * 60; // fallback 1 hour

function getTtlMsFromSettings(cb) {
  chrome.storage.sync.get(['cache_ttl_minutes'], (items) => {
    const mins = parseInt(items.cache_ttl_minutes, 10);
    cb(Number.isFinite(mins) && mins > 0 ? mins * 60 * 1000 : DEFAULT_TTL_MS);
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
        const cached = await getCached(chrome.storage.local, owner, repo);
        if (isFresh(cached, ttlMs)) {
          sendResponse({
            stars: cached.data.stargazers_count,
            updated: cached.ts,
            cached: true
          });
          return;
        }

        chrome.storage.sync.get(['gh_token'], async (items) => {
          try {
            const token = items.gh_token;
            const json = await ghApi.getRepo(owner, repo, token);
            await setCached(chrome.storage.local, owner, repo, json);
            sendResponse({
              stars: json.stargazers_count,
              updated: Date.now(),
              cached: false
            });
          } catch (err) {
            // If fetch failed but we have stale cached data, return it as fallback
            if (cached) {
              sendResponse({
                stars: cached.data.stargazers_count,
                updated: cached.ts,
                cached: true,
                stale: true
              });
            } else {
              sendResponse({ error: err.message });
            }
          }
        });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('GitHub Stars extension installed');
});
