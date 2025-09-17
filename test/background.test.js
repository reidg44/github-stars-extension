const path = require('path');

// Provide a minimal fake chrome.storage implementation that is easy to reset
const fakeStorage = {
  local: {
    store: {},
    get(keys, cb) {
      if (Array.isArray(keys)) {
        const res = {};
        keys.forEach((k) => {
          if (k in this.store) res[k] = this.store[k];
        });
        cb(res);
      } else if (typeof keys === 'object') {
        const res = {};
        Object.keys(keys).forEach((k) => {
          res[k] = this.store[k] || keys[k];
        });
        cb(res);
      } else {
        cb({ [keys]: this.store[keys] });
      }
    },
    set(obj, cb) {
      Object.assign(this.store, obj);
      if (cb) cb();
    }
  },
  sync: {
    store: {},
    get(keys, cb) {
      if (Array.isArray(keys)) {
        const res = {};
        keys.forEach((k) => {
          if (k in this.store) res[k] = this.store[k];
        });
        cb(res);
      } else if (typeof keys === 'object') {
        const res = {};
        Object.keys(keys).forEach((k) => {
          res[k] = this.store[k] || keys[k];
        });
        cb(res);
      } else {
        cb({ [keys]: this.store[keys] });
      }
    },
    set(obj, cb) {
      Object.assign(this.store, obj);
      if (cb) cb();
    }
  }
};

// Minimal runtime messaging emulation
let messageHandler = null;
const chrome = {
  storage: fakeStorage,
  runtime: {
    onMessage: {
      addListener(fn) {
        messageHandler = fn;
      }
    },
    onInstalled: { addListener: () => {} }
  }
};

// Put chrome on global so background.js can access it
global.chrome = chrome;

// Helper to load background file freshly per test
function loadBackgroundWithMockFetch() {
  // Clear require cache for background so it re-requires ghApi which uses global.fetch
  delete require.cache[require.resolve('../src/background.js')];
  require('../src/background.js');
}

function sendGetStars(owner, repo) {
  return new Promise((resolve) => {
    // Simulate runtime sendMessage; the background code uses addListener that calls sendResponse
    messageHandler({ type: 'GET_STARS', owner, repo }, {}, (resp) =>
      resolve(resp)
    );
  });
}

beforeEach(() => {
  // reset storage
  global.chrome.storage.local = fakeStorage.local;
  global.chrome.storage.sync = fakeStorage.sync;
  fakeStorage.local.store = {};
  fakeStorage.sync.store = {};
});

test('returns cached when fresh', async () => {
  const owner = 'reidg44';
  const repo = 'github-stars-extension';
  const key = `gh:${owner}/${repo}`;
  const now = Date.now();
  // put fresh cached entry
  fakeStorage.local.set({ [key]: { data: { stargazers_count: 42 }, ts: now } });
  // set TTL to large value
  fakeStorage.sync.set({ cache_ttl_minutes: 60 });

  // ensure fetch is not used (we are returning cached)
  global.fetch = undefined;
  loadBackgroundWithMockFetch();
  const res = await sendGetStars(owner, repo);
  expect(res.stars).toBe(42);
  expect(res.cached).toBe(true);
});

test('old cache but API success updates cache', async () => {
  const owner = 'reidg44';
  const repo = 'github-stars-extension';
  const key = `gh:${owner}/${repo}`;
  const oldTs = Date.now() - 1000 * 60 * 120; // 2 hours ago
  // set an old cached entry
  fakeStorage.local.set({
    [key]: { data: { stargazers_count: 10 }, ts: oldTs }
  });
  // set TTL to 60 minutes
  fakeStorage.sync.set({ cache_ttl_minutes: 60 });

  // mock fetch returns new value
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ stargazers_count: 123 })
  });
  loadBackgroundWithMockFetch();
  const res = await sendGetStars(owner, repo);
  expect(res.stars).toBe(123);
  expect(res.cached).toBe(false);

  // ensure cache updated
  const cached = await new Promise((r) =>
    fakeStorage.local.get([key], (items) => r(items[key]))
  );
  expect(cached.data.stargazers_count).toBe(123);
});

test('old cache and API failure returns cached data', async () => {
  const owner = 'reidg44';
  const repo = 'github-stars-extension';
  const key = `gh:${owner}/${repo}`;
  const oldTs = Date.now() - 1000 * 60 * 120; // 2 hours ago
  fakeStorage.local.set({
    [key]: { data: { stargazers_count: 7 }, ts: oldTs }
  });
  fakeStorage.sync.set({ cache_ttl_minutes: 60 });

  global.fetch = async () => {
    throw new Error('network');
  };
  loadBackgroundWithMockFetch();
  const res = await sendGetStars(owner, repo);
  expect(res.stars).toBe(7);
});

test('no cache and API failure returns error', async () => {
  const owner = 'reidg44';
  const repo = 'github-stars-extension';
  fakeStorage.sync.set({ cache_ttl_minutes: 60 });

  global.fetch = async () => {
    throw new Error('fail');
  };
  loadBackgroundWithMockFetch();
  const res = await sendGetStars(owner, repo);
  expect(res.error).toBeDefined();
});
