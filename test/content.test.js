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
