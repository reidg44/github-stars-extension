const { getCached, setCached, isFresh } = require('../src/lib/cache');

function makeMockStorage() {
  const store = {};
  return {
    get(keys, cb) {
      const res = {};
      keys.forEach((k) => {
        if (store[k] !== undefined) res[k] = store[k];
      });
      cb(res);
    },
    set(obj, cb) {
      Object.assign(store, obj);
      if (cb) cb();
    },
    _dump: () => store
  };
}

test('setCached and getCached roundtrip', async () => {
  const storage = makeMockStorage();
  await setCached(storage, 'owner', 'repo', { stargazers_count: 5 });
  const val = await getCached(storage, 'owner', 'repo');
  expect(val).toBeTruthy();
  expect(val.data.stargazers_count).toBe(5);
});

test('isFresh returns false for null and true within ttl', async () => {
  const storage = makeMockStorage();
  await setCached(storage, 'o', 'r', { stargazers_count: 1 });
  const val = await getCached(storage, 'o', 'r');
  expect(isFresh(val, 10000)).toBe(true);
  expect(isFresh(null, 10000)).toBe(false);
});
