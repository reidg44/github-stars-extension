// Test for .github-private exclusion
describe('GitHub Private Repository Exclusion', () => {
  test('should exclude .github-private repositories from URL parsing', () => {
    // Test implementation that mimics the parseUrl logic in content.js
    function testParseUrl(href) {
      const EXCLUDED_GITHUB_PATTERNS = ['.github-private'];

      try {
        const url = new URL(href);
        if (url.hostname.toLowerCase().includes('github.com')) {
          const path = url.pathname.toLowerCase();
          const cleanPath = path.startsWith('/') ? path.slice(1) : path;

          // Check if the path contains any excluded patterns
          for (const excludedPattern of EXCLUDED_GITHUB_PATTERNS) {
            if (cleanPath.includes(excludedPattern.toLowerCase())) {
              return null; // This is not a repo link
            }
          }
        }
      } catch (e) {
        return null;
      }

      // If not excluded, parse with regex
      const FALLBACK_REGEX = new RegExp(
        'https?://(?:www\\.)?github.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)(?:[/#?]|$)',
        'i'
      );
      const m = href.match(FALLBACK_REGEX);
      if (!m) return null;
      return { owner: m[1], repo: m[2] };
    }

    // Test URLs
    const testCases = [
      {
        url: 'https://github.com/cdcent/.github-private/',
        expected: null,
        description: 'should exclude .github-private repo'
      },
      {
        url: 'https://github.com/cdcent/normal-repo',
        expected: { owner: 'cdcent', repo: 'normal-repo' },
        description: 'should allow normal repo'
      },
      {
        url: 'https://github.com/someorg/.github-private/some-path',
        expected: null,
        description: 'should exclude .github-private repo with path'
      },
      {
        url: 'https://github.com/microsoft/vscode',
        expected: { owner: 'microsoft', repo: 'vscode' },
        description: 'should allow other normal repos'
      }
    ];

    testCases.forEach(({ url, expected }) => {
      const result = testParseUrl(url);
      expect(result).toEqual(expected);
    });
  });
});
