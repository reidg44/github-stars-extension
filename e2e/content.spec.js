const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// Helper to inject the extension's content script into the page context
async function injectContentScript(page) {
  const contentSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/content.js'),
    'utf8'
  );
  await page.addInitScript({ content: contentSrc });
}

// Shim a minimal chrome.storage and runtime.sendMessage for the content script to call
const chromeShim = `
window.chrome = window.chrome || {};
window.chrome.storage = window.chrome.storage || {
  sync: {
    get(keys, cb) { cb({}); }
  },
  local: { get(keys, cb){ cb({}); }, set(obj, cb){ cb && cb(); } }
};
window.chrome.runtime = window.chrome.runtime || {
  sendMessage(msg, cb) {
    // Simple responder: return canned values based on owner/repo in the message
    const owner = msg.owner || '';
    const repo = msg.repo || '';
    if (repo.includes('missing-repo') || repo.includes('does-not-exist')) {
      cb && cb({ error: 'Not Found', notFound: true });
      return;
    }
    if (repo.includes('archived')) {
      cb && cb({ stars: 100, updated: Date.now() - 1000 * 60 * 60 * 24 * 400, archived: true });
      return;
    }
    // Special-case the DopplerHQ example used in the test page: treat as archived
    if (owner.toLowerCase() === 'dopplerhq' && repo.toLowerCase().includes('awesome-interview-questions')) {
      cb && cb({ stars: 100, updated: Date.now() - 1000 * 60 * 60 * 24 * 400, archived: true });
      return;
    }
    if (repo.includes('project-based-learning')) {
      // simulate inactive repo: updated more than 30 days ago
      cb && cb({ stars: 50, updated: Date.now() - 1000 * 60 * 60 * 24 * 40, inactive: true });
      return;
    }
    // default active repo
    cb && cb({ stars: 1234, updated: Date.now() });
  }
};
`;

test('E2E: badges render for active, inactive, archived, and missing', async ({
  page
}) => {
  const testPage =
    'file://' + path.resolve(__dirname, '../test/test-page.html');
  // Capture page console and errors for debugging
  page.on('console', (msg) => console.log('PAGE LOG>', msg.text()));
  page.on('pageerror', (err) => console.log('PAGE ERROR>', err.message));

  await page.addInitScript({ content: chromeShim });
  await injectContentScript(page);

  await page.goto(testPage);

  // Debug: check how many anchors are present
  const anchorCount = await page
    .evaluate(() => document.querySelectorAll('a[href]').length)
    .catch(() => 0);
  console.log('Found anchors on page:', anchorCount);

  // Wait for content script to run and badges to be inserted
  await page.waitForSelector('.gh-stars-badge');

  const results = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('a').forEach((a) => {
      const next = a.nextElementSibling;
      if (!next || !next.classList.contains('gh-stars-badge')) return;
      const id = a.id || a.href;
      const txt = next.querySelector('.gh-stars-count')?.textContent || '';
      out[id] = txt.trim();
    });
    return out;
  });

  // Map by ids used in test page
  expect(results['repo1']).toBe('1,234'); // active
  expect(results['repo4']).toBe('1,234'); // facebook/react active
  expect(results['repo5']).toBe('1,234'); // trekhleb active
  // archived should show gravestone
  expect(results['repo2']).toBe('🪦');
  // inactive should show zombie + star count
  // project-based-learning is in repo3
  expect(results['repo3']).toBe('🧟 50');
  // missing repo should show banned emoji
  expect(results['repo6']).toBe('🚫');
});
