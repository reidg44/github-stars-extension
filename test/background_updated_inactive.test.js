// Provide a minimal fake chrome.storage implementation that is easy to reset
const fakeStorage = {
  local: {
    store: {},
    get(keys, cb) {
      if (keys === null) {
        // Get all items
        cb({ ...this.store });
      } else if (Array.isArray(keys)) {
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
    },
    remove(keys, cb) {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      keyArray.forEach((k) => delete this.store[k]);
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
    onInstalled: { addListener: () => {} },
    onStartup: { addListener: () => {} }
  }
};

global.chrome = chrome;

// Helper to load background file freshly per test
function loadBackgroundWithMockFetch() {
  delete require.cache[require.resolve('../src/background.js')];
  require('../src/background.js');
}

function sendGetStars(owner, repo) {
  return new Promise((resolve) => {
    messageHandler({ type: 'GET_STARS', owner, repo }, {}, (resp) =>
      resolve(resp)
    );
  });
}

beforeEach(() => {
  global.chrome.storage.local = fakeStorage.local;
  global.chrome.storage.sync = fakeStorage.sync;
  fakeStorage.local.store = {};
  fakeStorage.sync.store = {};
});

test('fresh cache includes updated and inactive', async () => {
  const owner = 'a';
  const repo = 'b';
  const oldNow = Date.now() - 1000 * 60 * 60 * 24 * 400; // old updated_at
  const cachedPayload = {
    data: {
      stargazers_count: 5,
      updated_at: new Date(oldNow).toISOString(),
      archived: false
    },
    ts: Date.now()
  };
  const key = `gh:${owner}/${repo}`;
  fakeStorage.local.set({ [key]: cachedPayload });
  fakeStorage.sync.set({ cache_ttl_minutes: 60 });

  // ensure fetch not required
  global.fetch = undefined;
  loadBackgroundWithMockFetch();
  const res = await sendGetStars(owner, repo);
  expect(res.cached).toBe(true);
  expect(res.updated).toBe(cachedPayload.data.updated_at);
  expect(typeof res.inactive).toBe('boolean');
});

test('fallback when API fails includes updated and inactive', async () => {
  const owner = 'a2';
  const repo = 'b2';
  const oldNow = Date.now() - 1000 * 60 * 60 * 24 * 400; // old updated_at
  const cachedPayload = {
    data: {
      stargazers_count: 7,
      updated_at: new Date(oldNow).toISOString(),
      archived: false
    },
    ts: Date.now() - 1000 * 60 * 60 * 24 * 10 // 10 days ago -> cached data when TTL=1 min
  };
  const key = `gh:${owner}/${repo}`;
  fakeStorage.local.set({ [key]: cachedPayload });
  fakeStorage.sync.set({ cache_ttl_minutes: 1 });

  // Make fetch fail to force fallback to cached data
  global.fetch = async () => {
    throw new Error('network');
  };
  loadBackgroundWithMockFetch();
  const res = await sendGetStars(owner, repo);
  expect(res.updated).toBe(cachedPayload.data.updated_at);
  expect(typeof res.inactive).toBe('boolean');
});

test('fresh fetch includes updated and inactive', async () => {
  const owner = 'a3';
  const repo = 'b3';
  fakeStorage.sync.set({ cache_ttl_minutes: 60 });

  const apiUpdated = new Date(
    Date.now() - 1000 * 60 * 60 * 24 * 200
  ).toISOString();
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      stargazers_count: 88,
      updated_at: apiUpdated,
      archived: false
    })
  });
  loadBackgroundWithMockFetch();
  const res = await sendGetStars(owner, repo);
  expect(res.cached).toBe(false);
  expect(res.updated).toBe(apiUpdated);
  expect(typeof res.inactive).toBe('boolean');
});
