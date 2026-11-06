// Jest environment: jsdom plus a `setUrl(url)` global.
//
// Since jsdom 26 (Jest 30), `window.location` cannot be deleted or replaced,
// so tests can't fake the page URL by assigning to it. jsdom's own
// `reconfigure({ url })` changes the URL, across origins, without navigating.
const { TestEnvironment } = require('jest-environment-jsdom');

class JsdomWithUrlEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    this.global.setUrl = (url) => this.dom.reconfigure({ url });
  }

  async teardown() {
    // Closing the window empties the document, which fires the content
    // script's MutationObserver, which calls requestAnimationFrame. jsdom has
    // already stopped its timers by then, so that frame would run against a
    // closed window and crash the worker. Make rAF a no-op before closing.
    if (this.global) {
      this.global.requestAnimationFrame = () => 0;
    }
    await super.teardown();
  }
}

module.exports = JsdomWithUrlEnvironment;
