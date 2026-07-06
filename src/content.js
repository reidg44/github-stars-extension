// content.js
// Finds GitHub repo links on the page and inserts a placeholder badge element.
// Bundled by esbuild into dist/content.js so lib modules resolve at build time.

(function () {
  const { extractBadgeableRepo } = require('./lib/parseRepo');
  const { hostMatchesDisabled } = require('./lib/domain');

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
    'https://docs.github.com/',
    'https://github.com/orgs/',
    'https://github.com/repos',
    'https://github.com/repos?',
    'https://github.com/settings',
    'https://github.com/trending',
    'https://google.com/search',
    'https://www.google.com/complete/search'
  ];

  function findRepoLinks() {
    const anchors = document.querySelectorAll(
      'a[href]:not([data-gh-stars-badge-inserted])'
    );
    const found = [];
    for (const el of anchors) {
      const parsed = extractBadgeableRepo(el.href);
      if (parsed && shouldInsertBadge(el, parsed.owner, parsed.repo)) {
        found.push({ el, owner: parsed.owner, repo: parsed.repo });
      }
    }
    return found;
  }

  let badgesEnabled = true;
  let disabledDomains = [];

  function hostIsDisabled() {
    try {
      const host = window.location.hostname;
      return disabledDomains.some((d) => hostMatchesDisabled(host, d));
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

  // read initial settings
  chrome.storage &&
    chrome.storage.sync &&
    chrome.storage.sync.get(['badges_enabled', 'disabled_domains'], (items) => {
      if (items && items.badges_enabled === false) badgesEnabled = false;
      disabledDomains = Array.isArray(items && items.disabled_domains)
        ? items.disabled_domains
        : [];
    });

  // Log a page-visible warning once if no GH token is configured.
  try {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['gh_token'], (items) => {
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
   * Convert an sRGB channel value (0-255) to its linear-light value
   * per the WCAG relative-luminance formula
   */
  function channelToLinear(value) {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }

  /**
   * Calculate relative luminance of a color according to WCAG formula
   * @param {number} r - Red value (0-255)
   * @param {number} g - Green value (0-255)
   * @param {number} b - Blue value (0-255)
   * @returns {number} Relative luminance (0-1)
   */
  function getRelativeLuminance(r, g, b) {
    return (
      0.2126 * channelToLinear(r) +
      0.7152 * channelToLinear(g) +
      0.0722 * channelToLinear(b)
    );
  }

  // Parse a CSS rgb()/rgba() color string into channel values, or null
  function parseColor(color) {
    const match = (color || '').match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
    );
    if (!match) return null;
    return {
      r: parseInt(match[1]),
      g: parseInt(match[2]),
      b: parseInt(match[3]),
      a: match[4] ? parseFloat(match[4]) : 1
    };
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
      const color = parseColor(style.backgroundColor);

      if (color) {
        // If alpha is very low, the background is transparent, keep looking
        if (color.a < 0.1) {
          current = current.parentElement;
          continue;
        }

        // Dark backgrounds have low luminance (< 0.5)
        return getRelativeLuminance(color.r, color.g, color.b) < 0.5;
      }

      current = current.parentElement;
    }

    // Fallback: Check inherited text color
    // If all backgrounds are transparent, check if text is light (indicating dark theme)
    if (current) {
      const style = window.getComputedStyle(current);
      const color = parseColor(style.color);
      if (color) {
        // Light text (high luminance) indicates dark background
        return getRelativeLuminance(color.r, color.g, color.b) > 0.5;
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
    const svgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svgPath.setAttribute('d', 'M8 12.026l-3.717 1.955.71-4.144L1.5 6.817l4.175-.607L8 2.5l1.325 3.71 4.175.607-3.493 2.999.71 4.144z');
    svg.appendChild(svgPath);
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

  // Replace the star with a status emoji (not found / archived)
  function showStatusEmoji(span, txt, emoji, title, cls) {
    txt.textContent = emoji;
    span.title = title;
    span.classList.add(cls);
    try {
      const svg = span.querySelector('svg');
      if (svg && svg.remove) svg.remove();
    } catch (e) {
      // ignore DOM errors
    }
  }

  function insertBadge(anchor, owner, repo) {
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
            showStatusEmoji(span, txt, '🚫', 'Repository not found', 'notfound');
          } else {
            txt.textContent = '-';
          }
        } else if (response.archived) {
          showStatusEmoji(span, txt, '🪦', 'Repository archived', 'archived');
        } else {
          // show star count; if inactive, prefix with zombie emoji
          txt.textContent = (response.stars || 0).toLocaleString();
          if (response.inactive) {
            zombiePrefix.textContent = '🧟';
            zombiePrefix.style.display = 'inline';
            span.title = `Repository marked as inactive (not pushed recently). Pushed: ${
              response.pushed_at
                ? new Date(response.pushed_at).toLocaleString()
                : 'Unknown'
            }`;
            span.classList.add('inactive');
          } else {
            zombiePrefix.style.display = 'none';
            span.title = `Updated: ${new Date(
              response.updated
            ).toLocaleString()}`;
          }
        }
      }
    );
  }

  const ALLOWED_GITHUB_HOSTS = [
    'github.com',
    'www.github.com',
    'gist.github.com'
  ];

  // On GitHub pages, skip links that are within UI chrome
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
  ].join(',');

  // Decide whether to insert a badge for this anchor on this page.
  function shouldInsertBadge(anchor, owner, repo) {
    try {
      const host = window.location.hostname.toLowerCase();
      // If we're not on GitHub itself, allow badges everywhere (subject to disabled domains)
      if (!ALLOWED_GITHUB_HOSTS.includes(host)) return true;

      if (anchor.closest(DENY_SELECTORS)) return false;

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
    // Page-level checks are constant for the whole scan
    if (!badgesEnabled || hostIsDisabled() || pageIsHardCodedExcluded()) return;
    findRepoLinks().forEach((r) => insertBadge(r.el, r.owner, r.repo));
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
    let scanScheduled = false;
    const mo = new MutationObserver(() => {
      if (!scanScheduled) {
        scanScheduled = true;
        requestAnimationFrame(() => {
          scanAndInsert();
          scanScheduled = false;
        });
      }
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
