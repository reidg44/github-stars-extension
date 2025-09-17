// cache.js - small wrapper around a storage-like API for caching with TTL

function nowMs() {
  return Date.now();
}

function makeKey(owner, repo) {
  return `gh:${owner}/${repo}`;
}

async function getCached(storage, owner, repo) {
  const key = makeKey(owner, repo);
  return new Promise((resolve) =>
    storage.get([key], (items) => resolve(items[key] || null))
  );
}

async function setCached(storage, owner, repo, data) {
  const key = makeKey(owner, repo);
  const payload = { data, ts: nowMs() };
  return new Promise((resolve) =>
    storage.set({ [key]: payload }, () => resolve())
  );
}

function isFresh(cached, ttlMs) {
  if (!cached) return false;
  return nowMs() - cached.ts < ttlMs;
}

module.exports = { getCached, setCached, isFresh };
