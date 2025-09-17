// ghApi.js - fetch GitHub repo info with optional token and retry/backoff

async function fetchJson(url, options = {}, retries = 2) {
  try {
    const resp = await fetch(url, options);
    if (!resp.ok) {
      const err = new Error(`HTTP ${resp.status}`);
      // attach status for downstream detection
      err.status = resp.status;
      // attempt to read json body for message if present
      try {
        const body = await resp.json();
        if (body && body.message)
          err.message = `${err.message} - ${body.message}`;
      } catch (e) {
        // ignore parse errors
      }
      throw err;
    }
    return resp.json();
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 200 * (3 - retries)));
      return fetchJson(url, options, retries - 1);
    }
    throw err;
  }
}

async function getRepo(owner, repo, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `token ${token}`;
  return fetchJson(url, { headers });
}

module.exports = { getRepo };
