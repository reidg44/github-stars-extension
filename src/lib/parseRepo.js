// parseRepo.js
// Canonical GitHub URL classification, shared by the content script (bundled)
// and tests.
//   extractRepoFromUrl(url)   -> { owner, repo } | null  lenient: any *.github.com
//                                URL that resolves to an owner/repo, including
//                                repo sub-pages like /tree/ or /issues
//   extractBadgeableRepo(url) -> { owner, repo } | null  strict: only links that
//                                should receive a star badge

// GitHub top-level paths that are NOT repository owners (easy to extend)
const EXCLUDED_GITHUB_PATHS = [
  'about/',
  'account/',
  'apps/',
  'blog/',
  'codespaces/',
  'collections/',
  'community/',
  'contact/',
  'copilot/',
  'customer-terms/',
  'developer/',
  'discussions/',
  'enterprise/',
  'enterprises/',
  'events/',
  'explore/',
  'features/',
  'followers',
  'git-guides',
  'github-copilot/',
  'in-product-messaging/',
  'join',
  'login',
  'logout',
  'marketplace/',
  'mcp/',
  'new/',
  'notifications/',
  'oauth/',
  'organizations/',
  'orgs/',
  'pricing/',
  'readme/',
  'repos/',
  'search',
  'security/',
  'settings/',
  'signup',
  'site/',
  'sponsors/',
  'stars/',
  'support/',
  'topics/',
  'trending',
  'users/',
  'watching'
];

// Path patterns that mark a URL as a repo sub-page (or otherwise non-badgeable)
// rather than a plain repo link; may appear anywhere in the path
const EXCLUDED_GITHUB_PATTERNS = [
  '.github-private',
  '/actions',
  '/blame',
  '/blob/',
  '/branches',
  '/commit/',
  '/commits',
  '/compare',
  '/contributors',
  '/deployments',
  '/forks',
  '/graphs',
  '/history',
  '/insights',
  '/issues',
  '/network',
  '/projects',
  '/pull/',
  '/pulse',
  '/raw',
  '/releases',
  '/resources/',
  '/security',
  '/settings',
  '/stargazers',
  '/tags',
  '/tree/',
  '/watchers',
  '/wiki'
];

// Owner and repo path segments may only contain these characters
const VALID_SEGMENT = /^[A-Za-z0-9_.-]+$/;

function cleanPathOf(u) {
  const path = u.pathname.toLowerCase();
  return path.startsWith('/') ? path.slice(1) : path;
}

function extractRepoFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url, 'https://example.com');
    // Accept only github.com and its direct subdomains
    const host = u.hostname.toLowerCase();
    const hostParts = host.split('.');
    if (hostParts.length < 2 || hostParts.slice(-2).join('.') !== 'github.com') return null;

    // Check if the path starts with any excluded prefix
    const cleanPath = cleanPathOf(u);
    for (const excludedPath of EXCLUDED_GITHUB_PATHS) {
      if (cleanPath.startsWith(excludedPath)) {
        return null; // This is not a repo link
      }
    }

    // Path segments: /owner/repo/...
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1];
    if (!VALID_SEGMENT.test(owner) || !VALID_SEGMENT.test(repo)) return null;

    return { owner, repo };
  } catch (err) {
    return null;
  }
}

function extractBadgeableRepo(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    // Badges only target repo links on github.com proper (gists, docs and other
    // subdomains are not repos)
    const host = u.hostname.toLowerCase();
    if (host !== 'github.com' && host !== 'www.github.com') return null;

    const cleanPath = cleanPathOf(u);
    for (const pattern of EXCLUDED_GITHUB_PATTERNS) {
      if (cleanPath.includes(pattern)) {
        return null; // Repo sub-page, not a repo link
      }
    }
  } catch (err) {
    return null;
  }
  return extractRepoFromUrl(url);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractRepoFromUrl,
    extractBadgeableRepo,
    EXCLUDED_GITHUB_PATHS,
    EXCLUDED_GITHUB_PATTERNS,
    VALID_SEGMENT
  };
}
