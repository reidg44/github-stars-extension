// parseRepo.js
// Exports a single function extractRepoFromUrl(url) -> { owner, repo } | null

// GitHub paths that are NOT repository links (easy to extend)
const EXCLUDED_GITHUB_PATHS = [
  'topics/',
  'contact/',
  'orgs/',
  'settings/',
  'notifications/',
  'explore/',
  'marketplace/',
  'pricing/',
  'features/',
  'enterprise/',
  'security/',
  'sponsors/',
  'about/',
  'blog/',
  'developer/',
  'support/',
  'community/',
  'events/',
  'collections/',
  'discussions/',
  'new/',
  'organizations/',
  'login',
  'logout',
  'signup',
  'join',
  'apps/',
  'oauth/',
  'search',
  'in-product-messaging/',
  'account/',
  'site/',
  'codespaces/'
];

function extractRepoFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url, 'https://example.com');
    // Only care about github.com host (allow subdomains like www)
    const host = u.hostname.toLowerCase();
    // Accept only github.com and its direct subdomains
    const hostParts = host.split('.');
    if (hostParts.length < 2 || hostParts.slice(-2).join('.') !== 'github.com') return null;

    // Check if this is an excluded GitHub path
    const path = u.pathname.toLowerCase();
    // Remove leading slash for comparison
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;

    // Check if the path starts with any excluded prefix
    for (const excludedPath of EXCLUDED_GITHUB_PATHS) {
      if (cleanPath.startsWith(excludedPath.toLowerCase())) {
        return null; // This is not a repo link
      }
    }

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
