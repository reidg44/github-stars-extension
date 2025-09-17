const { extractRepoFromUrl } = require('../src/lib/parseRepo');

test('parses normal repo URL', () => {
  expect(extractRepoFromUrl('https://github.com/owner/repo')).toEqual({
    owner: 'owner',
    repo: 'repo'
  });
});

test('parses URL with trailing slash and path', () => {
  expect(extractRepoFromUrl('https://github.com/owner/repo/')).toEqual({
    owner: 'owner',
    repo: 'repo'
  });
  expect(extractRepoFromUrl('https://github.com/owner/repo/tree/main')).toEqual(
    { owner: 'owner', repo: 'repo' }
  );
});

test('ignores non-github hosts', () => {
  expect(extractRepoFromUrl('https://gitlab.com/owner/repo')).toBeNull();
});

test('returns null for insufficient path segments', () => {
  expect(extractRepoFromUrl('https://github.com/owner')).toBeNull();
});

test('rejects invalid owner/repo names', () => {
  expect(extractRepoFromUrl('https://github.com/own er/repo')).toBeNull();
  expect(extractRepoFromUrl('https://github.com/owner/repo name')).toBeNull();
});
