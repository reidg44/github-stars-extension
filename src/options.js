document.addEventListener('DOMContentLoaded', () => {
  const tokenEl = document.getElementById('token');
  const ttlEl = document.getElementById('ttl');
  const saveBtn = document.getElementById('save');
  // legacy status element (kept for screen-reader aria-live). We use toasts for visual feedback.
  const status = document.getElementById('status');
  const toastContainer = document.getElementById('toast-container');
  const disableSiteBtn = document.getElementById('disable-site');
  const resetBtn = document.getElementById('reset');

  chrome.storage.sync.get(
    ['gh_token', 'cache_ttl_minutes', 'badges_enabled'],
    (items) => {
      if (items.gh_token) tokenEl.value = items.gh_token;
      if (items.cache_ttl_minutes) ttlEl.value = items.cache_ttl_minutes;
      if (items.badges_enabled === false) {
        document.getElementById('enabled').checked = false;
      } else {
        document.getElementById('enabled').checked = true;
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
    const token = tokenEl.value.trim();
    const ttl = Math.max(1, parseInt(ttlEl.value, 10) || 60);
    const enabled = document.getElementById('enabled').checked;
    chrome.storage.sync.set(
      { gh_token: token, cache_ttl_minutes: ttl, badges_enabled: enabled },
      () => {
        showToast('Saved.', 'success');
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
    tokenEl.value = '';
    ttlEl.value = 60;
    document.getElementById('enabled').checked = true;
    // clear list
    disabledListEl.innerHTML = '';
    chrome.storage.sync.set(
      {
        gh_token: '',
        cache_ttl_minutes: 60,
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
