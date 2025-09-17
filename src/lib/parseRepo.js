// parseRepo.js
// Exports a single function extractRepoFromUrl(url) -> { owner, repo } | null

function extractRepoFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url, 'https://example.com');
    // Only care about github.com host (allow subdomains like www)
    const host = u.hostname.toLowerCase();
    if (!host.endsWith('github.com')) return null;

    // Path segments: /owner/repo/...
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1];

    // Reject common non-repo paths (e.g., /notifications, /settings)
    if (!owner || !repo) return null;

    // Repo names may not contain spaces; keep a conservative validation
    const valid = /^[A-Za-z0-9_.-]+$/;
    if (!valid.test(owner) || !valid.test(repo)) return null;

    return { owner, repo };
  } catch (err) {
    return null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractRepoFromUrl };
}
