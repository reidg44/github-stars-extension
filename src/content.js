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

  function parseUrl(href) {
    if (extractRepoFromUrl) {
      const res = extractRepoFromUrl(href);
      if (res) return res;
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
      .map((x) => ({ el: x.el, owner: x.parsed.owner, repo: x.parsed.repo }));
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

  function makeBadgeElement() {
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

    span.appendChild(svg);
    span.appendChild(txt);
    return { span, txt };
  }

  function insertBadge(anchor, owner, repo) {
    if (!badgesEnabled) return;
    if (hostIsDisabled()) return;
    if (anchor.dataset.ghStarsBadgeInserted) return;
    anchor.dataset.ghStarsBadgeInserted = '1';

    const { span, txt } = makeBadgeElement();
    anchor.insertAdjacentElement('afterend', span);

    chrome.runtime.sendMessage(
      { type: 'GET_STARS', owner, repo },
      (response) => {
        if (!response) return;
        if (response.error) {
          txt.textContent = '-';
        } else {
          txt.textContent = response.stars.toLocaleString();
          span.title = `Updated: ${new Date(
            response.updated
          ).toLocaleString()}`;
          if (response.stale) span.classList.add('stale');
        }
      }
    );
  }

  function scanAndInsert() {
    const repos = findRepoLinks();
    repos.forEach((r) => insertBadge(r.el, r.owner, r.repo));
  }

  // Initial scan
  scanAndInsert();

  // Observe DOM changes for dynamically added links
  const mo = new MutationObserver(() => {
    scanAndInsert();
  });
  mo.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });
})();
