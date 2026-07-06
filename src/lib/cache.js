// cache.js - small wrapper around a storage-like API for caching with TTL

const KEY_PREFIX = 'gh:';

function makeKey(owner, repo) {
  return `${KEY_PREFIX}${owner}/${repo}`;
}

async function getCached(storage, owner, repo) {
  const key = makeKey(owner, repo);
  return new Promise((resolve) =>
    storage.get([key], (items) => resolve(items[key] || null))
  );
}

async function setCached(storage, owner, repo, data) {
  const key = makeKey(owner, repo);
  const payload = { data, ts: Date.now() };
  return new Promise((resolve) =>
    storage.set({ [key]: payload }, () => resolve())
  );
}

function isFresh(cached, ttlMs) {
  if (!cached) return false;
  return Date.now() - cached.ts < ttlMs;
}

module.exports = { getCached, setCached, isFresh, makeKey, KEY_PREFIX };
