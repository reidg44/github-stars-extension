---
name: gen-test
description: Generate unit tests for a module following this project's Jest + Chrome API mocking patterns
disable-model-invocation: true
---

# Generate Unit Test

Generate a Jest unit test file for the specified module, following the established patterns in this project.

## Instructions

1. Read the target module to understand its exports and behavior
2. Read 1-2 existing test files in `test/` to match current conventions
3. Generate the test file in `test/{module-name}.test.js`

## Project Test Conventions

- **Framework**: Jest with Node test environment
- **Location**: `test/*.test.js`
- **Module imports**: Use `require()` with relative paths from `test/` to `src/`
- **Chrome API mocking**: Create mock `chrome.storage` and `chrome.runtime` objects inline in the test file (not in a shared setup file)
- **Mock pattern for chrome.storage**:
```javascript
function makeMockStorage() {
  const store = {};
  return {
    get(keys, cb) {
      const res = {};
      keys.forEach((k) => {
        if (store[k] !== undefined) res[k] = store[k];
      });
      cb(res);
    },
    set(obj, cb) {
      Object.assign(store, obj);
      if (cb) cb();
    },
    _dump: () => store
  };
}
```
- **Test style**: Use top-level `test()` calls (not nested `describe` blocks)
- **Assertions**: Use `expect()` with `.toBe()`, `.toEqual()`, `.toBeTruthy()`, `.toBeNull()`
- **Async tests**: Use `async/await` for storage operations
- **No beforeEach/afterEach**: Each test sets up its own state

## Usage

```
/gen-test <module-name>
```

Example: `/gen-test ghApi` generates `test/ghApi.test.js` for `src/lib/ghApi.js`
