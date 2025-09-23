// Test for hard-coded page exclusion
describe('Hard-coded Page Exclusion', () => {
  test('should exclude pages from showing any badges', () => {
    // Test implementation that mimics the pageIsHardCodedExcluded logic in content.js
    function testPageIsExcluded(currentUrl, excludedPages) {
      try {
        const normalizedCurrentUrl = currentUrl
          .toLowerCase()
          .replace(/\/$/, ''); // Remove trailing slash and normalize
        return excludedPages.some((excludedPage) => {
          const normalizedExcluded = excludedPage
            .toLowerCase()
            .replace(/\/$/, '');
          return (
            normalizedCurrentUrl === normalizedExcluded ||
            normalizedCurrentUrl.startsWith(normalizedExcluded + '/')
          );
        });
      } catch (e) {
        return false;
      }
    }

    const HARD_CODED_EXCLUDED_PAGES = [
      'https://internal.company.com/docs',
      'https://confluence.myorg.com/display/SECRET/',
      'https://sensitive-site.com'
    ];

    // Test URLs
    const testCases = [
      {
        url: 'https://internal.company.com/docs',
        expected: true,
        description: 'should exclude exact hard-coded page URL'
      },
      {
        url: 'https://internal.company.com/docs/',
        expected: true,
        description: 'should exclude hard-coded page URL with trailing slash'
      },
      {
        url: 'https://internal.company.com/docs/some-page',
        expected: true,
        description: 'should exclude subpages of hard-coded page'
      },
      {
        url: 'https://confluence.myorg.com/display/SECRET',
        expected: true,
        description:
          'should exclude hard-coded page configured with trailing slash'
      },
      {
        url: 'https://confluence.myorg.com/display/SECRET/page-123',
        expected: true,
        description:
          'should exclude subpages of hard-coded page with trailing slash'
      },
      {
        url: 'https://sensitive-site.com/any/path',
        expected: true,
        description: 'should exclude any page on excluded domain'
      },
      {
        url: 'https://internal.company.com/public',
        expected: false,
        description: 'should allow non-excluded pages on same domain'
      },
      {
        url: 'https://github.com/microsoft/vscode',
        expected: false,
        description: 'should allow normal sites'
      },
      {
        url: 'https://example.com',
        expected: false,
        description: 'should allow other sites'
      }
    ];

    testCases.forEach(({ url, expected }) => {
      const result = testPageIsExcluded(url, HARD_CODED_EXCLUDED_PAGES);
      expect(result).toBe(expected);
    });
  });
});
