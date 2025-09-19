document.addEventListener('DOMContentLoaded', () => {
  const tokenEl = document.getElementById('token');
  const ttlEl = document.getElementById('ttl');
  const inactiveDaysEl = document.getElementById('inactive-days');
  const saveBtn = document.getElementById('save');
  const toggleTokenBtn = document.getElementById('toggle-token');
  // legacy status element (kept for screen-reader aria-live). We use toasts for visual feedback.
  const status = document.getElementById('status');
  const toastContainer = document.getElementById('toast-container');
  const disableSiteBtn = document.getElementById('disable-site');
  const resetBtn = document.getElementById('reset');

  // Token masking state
  let actualToken = '';
  let isTokenMasked = false;

  function maskToken(token) {
    if (!token) return '';
    // Show first 4 and last 4 characters, mask the middle
    if (token.length <= 8) return '•'.repeat(token.length);
    return (
      token.substring(0, 4) +
      '•'.repeat(token.length - 8) +
      token.substring(token.length - 4)
    );
  }

  function updateTokenDisplay() {
    if (isTokenMasked && actualToken) {
      tokenEl.value = maskToken(actualToken);
      tokenEl.readOnly = true;
      toggleTokenBtn.textContent = 'Edit';
    } else {
      tokenEl.value = actualToken;
      tokenEl.readOnly = false;
      toggleTokenBtn.textContent = actualToken ? 'Hide' : 'Show';
    }
  }

  // Toggle token visibility/editability
  toggleTokenBtn.addEventListener('click', () => {
    if (isTokenMasked) {
      // Show token for editing
      isTokenMasked = false;
      updateTokenDisplay();
      tokenEl.focus();
    } else {
      // Hide/mask token
      if (tokenEl.value.trim()) {
        actualToken = tokenEl.value.trim();
        isTokenMasked = true;
        updateTokenDisplay();
      }
    }
  });

  // Update actual token when user types (only when not masked)
  tokenEl.addEventListener('input', () => {
    if (!isTokenMasked) {
      actualToken = tokenEl.value;
    }
  });

  chrome.storage.sync.get(
    [
      'gh_token',
      'cache_ttl_hours',
      'cache_ttl_minutes',
      'inactive_threshold_days',
      'badges_enabled',
      'debug_logging'
    ],
    (items) => {
      if (items.gh_token) {
        actualToken = items.gh_token;
        // If there's a saved token, show it masked initially
        isTokenMasked = true;
        updateTokenDisplay();
      } else {
        actualToken = '';
        isTokenMasked = false;
        updateTokenDisplay();
      }

      // Handle migration from minutes to hours
      if (items.cache_ttl_hours) {
        ttlEl.value = items.cache_ttl_hours;
      } else if (items.cache_ttl_minutes) {
        // Convert old minutes setting to hours (round up)
        ttlEl.value = Math.ceil(items.cache_ttl_minutes / 60);
      } else {
        ttlEl.value = 24; // default 24 hours
      }

      if (items.inactive_threshold_days) {
        inactiveDaysEl.value = items.inactive_threshold_days;
      } else {
        inactiveDaysEl.value = 60; // default 60 days
      }

      if (items.badges_enabled === false) {
        document.getElementById('enabled').checked = false;
      } else {
        document.getElementById('enabled').checked = true;
      }
      if (items.debug_logging) {
        document.getElementById('debug-logging').checked = true;
      } else {
        document.getElementById('debug-logging').checked = false;
      }
    }
  );

  // load disabled domains
  const disabledListEl = document.getElementById('disabled-list');
  chrome.storage.sync.get(['disabled_domains'], (items) => {
    const arr = Array.isArray(items.disabled_domains)
      ? items.disabled_domains
      : [];
    arr.forEach(addDomainToList);
  });

  function addDomainToList(domain) {
    const li = document.createElement('li');
    li.textContent = domain;
    const btn = document.createElement('button');
    btn.textContent = 'Remove';
    btn.style.marginLeft = '8px';
    btn.addEventListener('click', () => {
      li.remove();
      saveDomains();
    });
    li.appendChild(btn);
    disabledListEl.appendChild(li);
  }

  function saveDomains() {
    const domains = Array.from(disabledListEl.querySelectorAll('li')).map(
      (li) => li.firstChild.textContent
    );
    chrome.storage.sync.set({ disabled_domains: domains });
  }

  document.getElementById('add-domain').addEventListener('click', () => {
    const input = document.getElementById('domain-input');
    const val = input.value.trim();
    if (!val) return;
    // simple validation: must look like a domain
    if (!/^[a-z0-9.-]+$/i.test(val)) {
      alert('Invalid domain');
      return;
    }
    addDomainToList(val);
    input.value = '';
    saveDomains();
  });

  saveBtn.addEventListener('click', () => {
    // Get the actual token value (whether it's masked or not)
    const token = isTokenMasked ? actualToken : tokenEl.value.trim();
    const ttl = Math.max(1, parseInt(ttlEl.value, 10) || 24);
    const inactiveDays = Math.max(1, parseInt(inactiveDaysEl.value, 10) || 60);
    const enabled = document.getElementById('enabled').checked;
    const debug = document.getElementById('debug-logging').checked;

    // Update actual token if user was editing
    if (!isTokenMasked) {
      actualToken = token;
    }

    chrome.storage.sync.set(
      {
        gh_token: token,
        cache_ttl_hours: ttl,
        inactive_threshold_days: inactiveDays,
        badges_enabled: enabled,
        debug_logging: debug
      },
      () => {
        showToast('Saved.', 'success');
        // After saving, mask the token if it exists
        if (token) {
          isTokenMasked = true;
          updateTokenDisplay();
        }
      }
    );
  });

  // Disable badges for the current site (quick button)
  disableSiteBtn.addEventListener('click', () => {
    // try to get the active tab's hostname
    if (chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (!tab || !tab.url) {
          alert('Could not determine current site');
          return;
        }
        try {
          const u = new URL(tab.url);
          const host = u.hostname;
          addDomainToList(host);
          saveDomains();
          showToast(`Disabled for ${host}`, 'success');
        } catch (e) {
          alert('Could not parse current site URL');
        }
      });
    } else {
      alert('Tabs API not available. Manually add the domain.');
    }
  });

  // Reset to defaults
  resetBtn.addEventListener('click', () => {
    if (
      !confirm(
        'Reset options to defaults? This will clear the token and disabled domains.'
      )
    )
      return;

    // Reset token state
    actualToken = '';
    isTokenMasked = false;
    updateTokenDisplay();

    ttlEl.value = 24;
    inactiveDaysEl.value = 60;
    document.getElementById('enabled').checked = true;
    // clear list
    disabledListEl.innerHTML = '';
    chrome.storage.sync.set(
      {
        gh_token: '',
        cache_ttl_hours: 24,
        inactive_threshold_days: 60,
        badges_enabled: true,
        disabled_domains: []
      },
      () => {
        showToast('Reset to defaults', 'success');
      }
    );
  });

  // Toast helper
  function showToast(message, type = 'success', ms = 2500) {
    if (!toastContainer) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    toastContainer.appendChild(el);
    // update aria-live status for screen readers
    if (status) {
      status.textContent = message;
      setTimeout(() => (status.textContent = ''), ms);
    }
    setTimeout(() => {
      el.remove();
    }, ms);
  }
});
