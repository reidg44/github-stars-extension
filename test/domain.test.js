const { hostMatchesDisabled } = require('../src/lib/domain');

test('exact host match', () => {
  expect(hostMatchesDisabled('example.com', 'example.com')).toBe(true);
});

test('subdomain match', () => {
  expect(hostMatchesDisabled('www.example.com', 'example.com')).toBe(true);
  expect(hostMatchesDisabled('api.sub.example.com', 'sub.example.com')).toBe(
    true
  );
});

test('non-match', () => {
  expect(hostMatchesDisabled('evil.com', 'example.com')).toBe(false);
});
