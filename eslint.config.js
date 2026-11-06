// ESLint flat config (ESLint 9+). Replaces .eslintrc.json and .eslintignore.
const js = require('@eslint/js');

module.exports = [
  {
    ignores: ['dist/', 'node_modules/', 'playwright-report/', 'test-results/']
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'commonjs'
    },
    rules: {
      // caughtErrors: 'none' keeps ESLint 8 behavior (v9 started flagging unused catch params).
      'no-unused-vars': ['warn', { caughtErrors: 'none' }],
      // Browser, Node, Jest, and chrome.* globals are all in play; not worth listing.
      'no-undef': 'off'
    }
  }
];
