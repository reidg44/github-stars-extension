// content.js
// Finds GitHub repo links on the page and inserts a placeholder badge element.

(function () {
  // Prefer using the more robust parser if available
  let extractRepoFromUrl = null;
  try {
    // In bundling environments this may be replaced; fallback below
    // eslint-disable-next-line no-undef
    if (typeof require === 'function') {
      extractRepoFromUrl = require('./lib/parseRepo').extractRepoFromUrl;
    }
  } catch (e) {
    // ignore
  }

  const FALLBACK_REGEX = new RegExp(
    'https?://(?:www\\.)?github.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)(?:[/#?]|$)',
    'i'
  );

  // GitHub paths that are NOT repository links (easy to extend)
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

  // GitHub path patterns that can appear anywhere in the path (not just at the start)
  const EXCLUDED_GITHUB_PATTERNS = [
    '.github-private',
    '/stargazers',
    '/forks',
    '/watchers',
    '/network',
    '/graphs',
    '/contributors',
    '/releases',
    '/tags',
    '/branches',
    '/commits',
    '/compare',
    '/blame',
    '/history',
    '/raw',
    '/tree/',
    '/blob/',
    '/commit/',
    '/pull/',
    '/issues',
    '/projects',
    '/wiki',
    '/pulse',
    '/settings',
    '/actions',
    '/security',
    '/insights',
    '/deployments',
    'resources/'
  ];

  // Hard-coded webpage URLs where badges should never appear
  // Add specific webpage URLs here where you don't want ANY GitHub badges to show
  // These are checked against the current page URL (window.location.href)
  // Example usage:
  //   'https://example.com/sensitive-page',
  //   'https://internal-docs.company.com',
  //   'https://confluence.myorg.com/display/SECRET',
  const HARD_CODED_EXCLUDED_PAGES = [
    // Example: 'https://example.com/private-docs',
    // Example: 'https://internal.company.com/wiki',
    'https://github.com/orgs/',
    'https://github.com/settings/',
    'https://google.com/search',
    'https://www.google.com/complete/search',
    'https://github.com/trending',
    'https://docs.github.com/'
  ];

  function parseUrl(href) {
    if (extractRepoFromUrl) {
      const res = extractRepoFromUrl(href);
      if (res) return res;
    }

    // Check if this is an excluded GitHub path
    try {
      const url = new URL(href);
      const hostname = url.hostname.toLowerCase();
      // Only allow github.com and *.github.com
      if (hostname === 'github.com' || hostname.endsWith('.github.com')) {
        const path = url.pathname.toLowerCase();
        // Remove leading slash for comparison
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;

        // Check if the path starts with any excluded prefix
        for (const excludedPath of EXCLUDED_GITHUB_PATHS) {
          if (cleanPath.startsWith(excludedPath.toLowerCase())) {
            return null; // This is not a repo link
          }
        }

        // Check if the path contains any excluded patterns
        for (const excludedPattern of EXCLUDED_GITHUB_PATTERNS) {
          if (cleanPath.includes(excludedPattern.toLowerCase())) {
            return null; // This is not a repo link
          }
        }
      }
    } catch (e) {
      // If URL parsing fails, continue with regex fallback
    }

    const m = href.match(FALLBACK_REGEX);
    if (!m) return null;
    return { owner: m[1], repo: m[2] };
  }

  function findRepoLinks() {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    return anchors
      .map((a) => ({ el: a, parsed: parseUrl(a.href) }))
      .filter((x) => x.parsed)
      .map((x) => ({ el: x.el, owner: x.parsed.owner, repo: x.parsed.repo }))
      .filter((item) => shouldInsertBadge(item.el, item.owner, item.repo));
  }

  let badgesEnabled = true;
  let disabledDomains = [];

  function hostIsDisabled() {
    try {
      const host = window.location.hostname.toLowerCase();
      return disabledDomains.some(
        (d) =>
          (d && host === d.toLowerCase()) ||
          host.endsWith('.' + d.toLowerCase())
      );
    } catch (e) {
      return false;
    }
  }

  function pageIsHardCodedExcluded() {
    try {
      const currentUrl = window.location.href.toLowerCase().replace(/\/$/, ''); // Remove trailing slash and normalize
      return HARD_CODED_EXCLUDED_PAGES.some((excludedPage) => {
        const normalizedExcluded = excludedPage
          .toLowerCase()
          .replace(/\/$/, '');
        return (
          currentUrl === normalizedExcluded ||
          currentUrl.startsWith(normalizedExcluded + '/')
        );
      });
    } catch (e) {
      return false;
    }
  }

  // read initial setting
  chrome.storage &&
    chrome.storage.sync &&
    chrome.storage.sync.get(['badges_enabled'], (items) => {
      if (items && items.badges_enabled === false) badgesEnabled = false;
    });

  // read disabled domains
  chrome.storage &&
    chrome.storage.sync &&
    chrome.storage.sync.get(['disabled_domains'], (items) => {
      disabledDomains = Array.isArray(items.disabled_domains)
        ? items.disabled_domains
        : [];
    });

  // Log a page-visible warning once if no GH token is configured.
  try {
    if (chrome && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(['gh_token'], (items) => {
        const token = items && items.gh_token;
        if (!token) {
          try {
            if (!window.__ghStarsLoggedTokenMissing) {
              console.warn(
                'GitHub token not present for GitHub Stars extension; add one in extension options to increase rate limits'
              );
              window.__ghStarsLoggedTokenMissing = true;
            }
          } catch (e) {
            // ignore
          }
        }
      });
    }
  } catch (e) {
    // ignore
  }

  // listen for changes
  if (chrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.badges_enabled) {
        badgesEnabled = changes.badges_enabled.newValue;
        if (!badgesEnabled) {
          // Remove existing badges
          document
            .querySelectorAll('.gh-stars-badge')
            .forEach((el) => el.remove());
          // Clear insertion markers so they can be re-added when enabled
          document
            .querySelectorAll('[data-gh-stars-badge-inserted]')
            .forEach((a) => delete a.dataset.ghStarsBadgeInserted);
        } else {
          scanAndInsert();
        }
      }
    });
  }

  /**
   * Calculate relative luminance of a color according to WCAG formula
   * @param {number} r - Red value (0-255)
   * @param {number} g - Green value (0-255)
   * @param {number} b - Blue value (0-255)
   * @returns {number} Relative luminance (0-1)
   */
  function getRelativeLuminance(r, g, b) {
    const rsRGB = r / 255;
    const gsRGB = g / 255;
    const bsRGB = b / 255;

    const rLinear =
      rsRGB <= 0.04045 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
    const gLinear =
      gsRGB <= 0.04045 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
    const bLinear =
      bsRGB <= 0.04045 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

    return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
  }

  /**
   * Detect if element has a dark background by traversing up the DOM tree
   * @param {HTMLElement} element - The element to check
   * @returns {boolean} True if background is dark
   */
  function isDarkBackground(element) {
    let current = element;

    // Traverse up to 10 levels to find a background color
    for (let i = 0; i < 10 && current; i++) {
      const style = window.getComputedStyle(current);
      const bgColor = style.backgroundColor;

      // Parse rgba/rgb color
      const match = bgColor.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
      );

      if (match) {
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        const a = match[4] ? parseFloat(match[4]) : 1;

        // If alpha is very low, the background is transparent, keep looking
        if (a < 0.1) {
          current = current.parentElement;
          continue;
        }

        // Calculate relative luminance
        const luminance = getRelativeLuminance(r, g, b);

        // Dark backgrounds have low luminance (< 0.5)
        return luminance < 0.5;
      }

      current = current.parentElement;
    }

    // Fallback: Check inherited text color
    // If all backgrounds are transparent, check if text is light (indicating dark theme)
    if (current) {
      const style = window.getComputedStyle(current);
      const textColor = style.color;
      const match = textColor.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
      );

      if (match) {
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        const luminance = getRelativeLuminance(r, g, b);

        // Light text (high luminance) indicates dark background
        return luminance > 0.5;
      }
    }

    // Default to light background if we can't determine
    return false;
  }

  function makeBadgeElement(anchor) {
    const span = document.createElement('span');
    span.className = 'gh-stars-badge';
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', 'GitHub stars');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.innerHTML =
      '<path d="M8 12.026l-3.717 1.955.71-4.144L1.5 6.817l4.175-.607L8 2.5l1.325 3.71 4.175.607-3.493 2.999.71 4.144z"/>';
    const txt = document.createElement('span');
    txt.className = 'gh-stars-count';
    txt.textContent = '…';

    const zombiePrefix = document.createElement('span');
    zombiePrefix.className = 'gh-stars-zombie';
    zombiePrefix.style.display = 'none'; // hidden by default

    span.appendChild(zombiePrefix);
    span.appendChild(svg);
    span.appendChild(txt);

    // Apply dark background class if needed for adaptive text color
    if (anchor && isDarkBackground(anchor)) {
      span.classList.add('dark-bg');
    }

    // Check if any parent element has scaleY(-1) transform that would flip our badge
    // If so, apply counter-transform to fix it
    setTimeout(() => {
      let element = span.parentElement;
      let hasInvertingTransform = false;

      while (element && element !== document.body) {
        const style = window.getComputedStyle(element);
        const transform = style.transform;

        // Check if transform contains scaleY(-1) or matrix with negative Y scale
        if (transform && transform !== 'none') {
          if (
            transform.includes('scaleY(-1)') ||
            (transform.startsWith('matrix(') && transform.includes(', -1,'))
          ) {
            hasInvertingTransform = true;
            break;
          }
        }
        element = element.parentElement;
      }

      if (hasInvertingTransform) {
        span.style.transform = 'scaleY(-1)';
      }
    }, 0);

    return { span, txt, zombiePrefix };
  }

  // Helper: compute inactivity from a 'pushed_at' timestamp (number or string).
  function computeInactiveFromPushed(pushed) {
    try {
      if (!pushed) return false;
      const ts = typeof pushed === 'number' ? pushed : Date.parse(pushed);
      if (Number.isNaN(ts)) return false;
      const DEFAULT_INACTIVE_THRESHOLD_DAYS = 60;
      const INACTIVE_THRESHOLD_MS =
        1000 * 60 * 60 * 24 * DEFAULT_INACTIVE_THRESHOLD_DAYS;
      return Date.now() - ts > INACTIVE_THRESHOLD_MS;
    } catch (e) {
      return false;
    }
  }

  function insertBadge(anchor, owner, repo) {
    if (!badgesEnabled) return;
    if (hostIsDisabled()) return;
    if (pageIsHardCodedExcluded()) return;
    if (anchor.dataset.ghStarsBadgeInserted) return;
    anchor.dataset.ghStarsBadgeInserted = '1';

    const { span, txt, zombiePrefix } = makeBadgeElement(anchor);
    anchor.insertAdjacentElement('afterend', span);

    chrome.runtime.sendMessage(
      { type: 'GET_STARS', owner, repo },
      (response) => {
        if (!response) return;
        if (response.error) {
          // debug logging (enable by setting window.__ghStarsDebug = true in the page console)
          try {
            if (window.__ghStarsDebug) {
              console.log('[gh-stars] GET_STARS error', {
                owner,
                repo,
                payload: response
              });
            }
          } catch (e) {
            // ignore
          }
          // Treat explicit notFound flag OR common 404/not found messages as missing repo
          const errMsg = response.error ? String(response.error) : '';
          const looks404 =
            response.notFound ||
            /not\s*found/i.test(errMsg) ||
            /404/.test(errMsg);
          if (looks404) {
            // Show only the banned emoji for not-found repos. Remove/hide the svg star.
            txt.textContent = '🚫';
            span.title = 'Repository not found';
            span.classList.add('notfound');
            try {
              const svg = span.querySelector('svg');
              if (svg && svg.remove) svg.remove();
            } catch (e) {
              // ignore DOM errors
            }
          } else {
            txt.textContent = '-';
          }
        } else {
          // if archived, show gravestone emoji only
          if (response.archived) {
            txt.textContent = '🪦';
            span.title = 'Repository archived';
            span.classList.add('archived');
            try {
              const svg = span.querySelector('svg');
              if (svg && svg.remove) svg.remove();
            } catch (e) {
              // ignore
            }
          } else {
            // compute display for stars; if inactive, prefix with zombie emoji
            const inactiveFlag =
              typeof response.inactive === 'boolean'
                ? response.inactive
                : computeInactiveFromPushed(response.pushed_at);

            const countText = (response.stars || 0).toLocaleString();
            if (inactiveFlag) {
              zombiePrefix.textContent = '🧟';
              zombiePrefix.style.display = 'inline';
              txt.textContent = countText;
              span.title = `Repository marked as inactive (not pushed recently). Pushed: ${
                response.pushed_at
                  ? new Date(response.pushed_at).toLocaleString()
                  : 'Unknown'
              }`;
              span.classList.add('inactive');
            } else {
              zombiePrefix.style.display = 'none';
              txt.textContent = countText;
              span.title = `Updated: ${new Date(
                response.updated
              ).toLocaleString()}`;
            }
          }
        }
      }
    );
  }

  // Decide whether to insert a badge for this anchor on this page.
  function shouldInsertBadge(anchor, owner, repo) {
    try {
      const host = window.location.hostname.toLowerCase();
      // If we're not on GitHub itself, allow badges everywhere (subject to disabled domains)
      if (!host.endsWith('github.com')) return true;

      // On GitHub pages, be conservative: skip links that are within UI chrome
      const DENY_SELECTORS = [
        '.social-count',
        '.js-social-count',
        '.pagehead',
        '.pagehead-actions',
        'header',
        'nav',
        'button',
        '.btn',
        '.dropdown',
        '.commit-meta',
        '.file-header',
        '.file',
        '.reponav',
        '.octicon',
        '.avatar',
        '.discussion-timeline',
        '.toc',
        '.repo-list',
        // GitHub Project Interface Elements
        'dialog',
        '[role="dialog"]',
        '.side-panel',
        '.sidebar',
        '.metadata',
        '.labels-list',
        '.LabelsList-module__labelsListContainer--bS7BO',
        '.IssueMetadata-module__metadataValue--d40kf',
        // GitHub Label/Filter Links
        '.label',
        '.labels',
        '[class*="label"]',
        '[class*="Label"]',
        '.tag',
        '.tags',
        // GitHub Dashboard Sidebars (Your repositories, etc.)
        '.dashboard-sidebar'
      ];

      for (const sel of DENY_SELECTORS) {
        if (anchor.closest(sel)) return false;
      }

      // If the anchor is icon/image-only (no visible text), skip — it's likely UI.
      const text = (anchor.textContent || '').trim();
      const hasIcon = !!anchor.querySelector('svg, img');
      if (hasIcon && text.length === 0) return false;

      // Skip links with itemprop="name codeRepository" - these are semantic markup for repo names
      if (anchor.getAttribute('itemprop') === 'name codeRepository')
        return false;

      // Avoid adding badges to links that point to the same repository page
      // e.g., when viewing /owner/repo don't badge intra-repo links
      const p = window.location.pathname.split('/').filter(Boolean);
      if (p.length >= 2) {
        const currentOwner = p[0];
        const currentRepo = p[1];
        if (
          currentOwner.toLowerCase() === owner.toLowerCase() &&
          currentRepo.toLowerCase() === repo.toLowerCase()
        ) {
          return false;
        }
      }

      // Only add a badge if the anchor shows some readable text (guard against tiny UI links)
      if (text.length < 2) return false;

      return true;
    } catch (e) {
      return true; // on error, be permissive
    }
  }

  // Expose helper for tests when running in JS DOM environment
  try {
    if (typeof window !== 'undefined') {
      window.__ghStarsTest = window.__ghStarsTest || {};
      window.__ghStarsTest.shouldInsertBadge = shouldInsertBadge;
    }
  } catch (e) {
    // ignore
  }

  function scanAndInsert() {
    const repos = findRepoLinks();
    repos.forEach((r) => insertBadge(r.el, r.owner, r.repo));
  }

  // Run initial scan and attach a MutationObserver after DOM is ready.
  function onDomReady(cb) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', cb);
    } else {
      // already ready
      cb();
    }
  }

  onDomReady(() => {
    scanAndInsert();

    // Observe DOM changes for dynamically added links
    const mo = new MutationObserver(() => {
      scanAndInsert();
    });
    const target = document.body || document.documentElement;
    if (target && typeof target.nodeType === 'number') {
      mo.observe(target, {
        childList: true,
        subtree: true
      });
    }
  });
})();
