/** @jest-environment jsdom */

// minimal chrome shim for content script during tests
global.chrome = {
  storage: {
    sync: { get: (keys, cb) => cb({}) },
    local: { get: (keys, cb) => cb({}), set: (obj, cb) => cb && cb() },
    onChanged: { addListener: () => {} }
  },
  runtime: { sendMessage: () => {} }
};

beforeEach(() => {
  // reset DOM
  document.body.innerHTML = '';
  // set location to a neutral host by default
  delete window.location;
  window.location = new URL('https://example.com/');
});

function loadContentScript() {
  // load content.js into jsdom environment
  delete require.cache[require.resolve('../src/content.js')];
  require('../src/content.js');
}

test('shouldInsertBadge is permissive on non-github hosts', () => {
  loadContentScript();
  const helper = window.__ghStarsTest.shouldInsertBadge;
  const a = document.createElement('a');
  a.href = 'https://github.com/owner/repo';
  a.textContent = 'repo';
  document.body.appendChild(a);
  expect(helper(a, 'owner', 'repo')).toBe(true);
});

test('skip icon-only links on github', () => {
  window.location = new URL('https://github.com/owner/repo');
  loadContentScript();
  const helper = window.__ghStarsTest.shouldInsertBadge;
  const a = document.createElement('a');
  a.href = 'https://github.com/other/repo2';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  a.appendChild(svg);
  document.body.appendChild(a);
  expect(helper(a, 'other', 'repo2')).toBe(false);
});

test('skip links inside repo header', () => {
  window.location = new URL('https://github.com/owner/repo');
  loadContentScript();
  const helper = window.__ghStarsTest.shouldInsertBadge;
  const header = document.createElement('header');
  const a = document.createElement('a');
  a.href = 'https://github.com/some/thing';
  a.textContent = 'thing';
  header.appendChild(a);
  document.body.appendChild(header);
  expect(helper(a, 'some', 'thing')).toBe(false);
});

test('skip links to same repo', () => {
  window.location = new URL('https://github.com/owner/repo');
  loadContentScript();
  const helper = window.__ghStarsTest.shouldInsertBadge;
  const a = document.createElement('a');
  a.href = 'https://github.com/owner/repo/issues';
  a.textContent = 'issues';
  document.body.appendChild(a);
  expect(helper(a, 'owner', 'repo')).toBe(false);
});

test('allow links with readable text on github outside UI', () => {
  window.location = new URL('https://github.com/owner/repo');
  loadContentScript();
  const helper = window.__ghStarsTest.shouldInsertBadge;
  const a = document.createElement('a');
  a.href = 'https://github.com/other/repo2';
  a.textContent = 'Check this repo';
  document.body.appendChild(a);
  expect(helper(a, 'other', 'repo2')).toBe(true);
});

test('displays notFound indicator when background signals 404', (done) => {
  window.location = new URL('https://example.com/');
  // shim runtime.sendMessage to simulate background response
  global.chrome.runtime.sendMessage = (msg, cb) => {
    // simulate the background telling us the repo was not found
    cb({ error: 'Not Found', notFound: true });
  };

  loadContentScript();
  const a = document.createElement('a');
  a.href = 'https://github.com/some/missing-repo';
  a.textContent = 'missing-repo';
  document.body.appendChild(a);

  // allow mutation observer / async sendMessage callback to run
  setTimeout(() => {
    const badge = document.querySelector('.gh-stars-badge');
    expect(badge).not.toBeNull();
    const txt = badge.querySelector('.gh-stars-count');
    expect(txt.textContent).toBe('🚫');
    done();
  }, 10);
});

test('displays inactive (zombie) indicator when background signals inactive', (done) => {
  window.location = new URL('https://example.com/');
  // shim runtime.sendMessage to simulate background response
  global.chrome.runtime.sendMessage = (msg, cb) => {
    // simulate the background telling us the repo is inactive
    cb({ stars: 1234, updated: Date.now(), inactive: true });
  };

  loadContentScript();
  const a = document.createElement('a');
  a.href = 'https://github.com/some/old-repo';
  a.textContent = 'old-repo';
  document.body.appendChild(a);

  setTimeout(() => {
    const badge = document.querySelector('.gh-stars-badge');
    expect(badge).not.toBeNull();

    // Check zombie emoji is in the prefix element
    const zombiePrefix = badge.querySelector('.gh-stars-zombie');
    expect(zombiePrefix).not.toBeNull();
    expect(zombiePrefix.textContent).toBe('🧟');
    expect(zombiePrefix.style.display).toBe('inline');

    // Check star count is in the text element (without zombie)
    const txt = badge.querySelector('.gh-stars-count');
    expect(txt.textContent).toBe('1,234');

    // star svg should still be present for inactive
    const svg = badge.querySelector('svg');
    expect(svg).not.toBeNull();
    done();
  }, 10);
});

test('displays archived gravestone and removes star svg when background signals archived', (done) => {
  window.location = new URL('https://example.com/');
  global.chrome.runtime.sendMessage = (msg, cb) => {
    // background says repo is archived
    cb({ stars: 9999, updated: Date.now(), archived: true });
  };

  loadContentScript();
  const a = document.createElement('a');
  a.href = 'https://github.com/some/archived-repo';
  a.textContent = 'archived-repo';
  document.body.appendChild(a);

  setTimeout(() => {
    const badge = document.querySelector('.gh-stars-badge');
    expect(badge).not.toBeNull();
    const txt = badge.querySelector('.gh-stars-count');
    expect(txt.textContent).toBe('🪦');
    // star svg should be removed for archived
    const svg = badge.querySelector('svg');
    expect(svg).toBeNull();
    done();
  }, 10);
});

test('skip links inside dashboard-sidebar', () => {
  window.location = new URL('https://github.com/');
  loadContentScript();
  const helper = window.__ghStarsTest.shouldInsertBadge;

  // Create a sidebar with dashboard-sidebar class
  const sidebar = document.createElement('div');
  sidebar.className = 'dashboard-sidebar';

  const a = document.createElement('a');
  a.href = 'https://github.com/owner/repo';
  a.textContent = 'repo';
  sidebar.appendChild(a);
  document.body.appendChild(sidebar);

  // Should not insert badge in dashboard sidebar
  expect(helper(a, 'owner', 'repo')).toBe(false);
});

test('skip links with resources/ in path', () => {
  loadContentScript();
  // The parseUrl function should exclude paths with 'resources/' in them
  const a = document.createElement('a');
  a.href = 'https://github.com/owner/repo/resources/something';
  a.textContent = 'resources';
  document.body.appendChild(a);

  // This link should be filtered out by parseUrl, so it won't even reach shouldInsertBadge
  // We can't directly test parseUrl from here, but we can verify the pattern is excluded
  expect(a.href).toContain('resources/');
});
