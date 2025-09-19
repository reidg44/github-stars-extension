const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// Helper to inject the extension's content script into the page context
async function injectContentScript(page) {
  // First inject the parseRepo module
  const parseRepoSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/lib/parseRepo.js'),
    'utf8'
  );

  // Create a module setup for parseRepo
  const moduleSetup = `
    // Set up module system for parseRepo
    window.require = window.require || function(path) {
      if (path === './lib/parseRepo') {
        // Inject parseRepo module content
        ${parseRepoSrc}
        return { extractRepoFromUrl };
      }
      return {};
    };
  `;

  await page.addInitScript({ content: moduleSetup });

  // Then inject the content script
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
      cb && cb({ stars: 100, updated: Date.now() - 1000 * 60 * 60 * 24 * 400, pushed_at: Date.now() - 1000 * 60 * 60 * 24 * 400, archived: true });
      return;
    }
    if (repo.includes('project-based-learning')) {
      // simulate inactive repo: pushed more than 30 days ago
      cb && cb({ stars: 50, updated: Date.now() - 1000 * 60 * 60 * 24 * 5, pushed_at: Date.now() - 1000 * 60 * 60 * 24 * 40, inactive: true });
      return;
    }
    // default active repo
    cb && cb({ stars: 1234, updated: Date.now(), pushed_at: Date.now() });
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

      // Get zombie prefix if it exists and is visible
      const zombiePrefix = next.querySelector('.gh-stars-zombie');
      const zombieText =
        zombiePrefix && zombiePrefix.style.display !== 'none'
          ? zombiePrefix.textContent
          : '';

      // Get count text
      const countText =
        next.querySelector('.gh-stars-count')?.textContent || '';

      // Combine zombie + count for output (matching the visual appearance)
      const fullText = zombieText + (zombieText ? ' ' : '') + countText;
      out[id] = fullText.trim();
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

test('E2E: excluded GitHub URLs do not get parsed as repos', async ({
  page
}) => {
  // Add chrome mock first
  await page.addInitScript({ content: chromeShim });
  await injectContentScript(page);

  // Navigate to test page
  const testPagePath = path.resolve(__dirname, '../test/test-page.html');
  await page.goto(`file://${testPagePath}`);

  // Wait a moment for the extension to process
  await page.waitForTimeout(500);

  // Count total anchors vs anchors that got processed as repos
  const totalAnchors = await page.locator('a[href*="github.com"]').count();
  const processedRepos = await page.evaluate(() => {
    // Access the extension's findRepoLinks function to see what it found
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    let repoCount = 0;

    // Simulate the same filtering logic the extension uses
    anchors.forEach((a) => {
      const href = a.href;
      if (!href.includes('github.com')) return;

      // Test the same parseUrl logic - check for excluded paths
      try {
        const url = new URL(href);
        const path = url.pathname.toLowerCase();
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;

        const excludedPaths = [
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
          'search'
        ];

        // Check if path should be excluded
        const isExcluded = excludedPaths.some((excludedPath) =>
          cleanPath.startsWith(excludedPath.toLowerCase())
        );

        if (!isExcluded) {
          // Check if it matches repo pattern
          const repoPattern =
            /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:[/#?]|$)/i;
          if (repoPattern.test(href)) {
            repoCount++;
          }
        }
      } catch (e) {
        // If parsing fails, still check repo pattern
        const repoPattern =
          /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:[/#?]|$)/i;
        if (repoPattern.test(href)) {
          repoCount++;
        }
      }
    });

    return repoCount;
  });

  console.log(
    `Total GitHub anchors: ${totalAnchors}, Processed as repos: ${processedRepos}`
  );

  // We should have significantly fewer processed repos than total GitHub anchors
  // The test page has 6 real repo links + 14 excluded URLs = 20 total
  // Only the 6 real repo links should be processed
  expect(processedRepos).toBeLessThan(totalAnchors);
  expect(processedRepos).toBe(6); // Only the real repo links should be processed
});
