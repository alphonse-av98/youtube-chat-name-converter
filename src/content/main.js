'use strict';

(function (root) {
  const ns = root.YCNC;
  if (!ns || !ns.constants || !ns.storage || !ns.cache || !ns.fetcher || !ns.chat) {
    return;
  }

  const { STORAGE_KEYS } = ns.constants;
  const { storage, cache: cacheModule, fetcher: fetcherModule, chat: chatModule } = ns;

  function init() {
    if (!window.location.href.includes('live_chat')) {
      return;
    }

    const cache = cacheModule.createChannelNameCache();
    const fetcher = fetcherModule.createChannelNameFetcher({ cache });
    const controller = chatModule.createChatController({ cache, fetcher });

    // Clean up legacy localStorage entries from v1 and expired chrome.storage cache entries
    cacheModule.cleanupLegacyLocalStorage();
    cache.cleanupExpired();

    // Load initial allowlist setting directly in the ISOLATED world (no bridge race condition)
    storage
      .getTargetHandles()
      .then((handles) => {
        controller.setAllowedHandles(handles);
      })
      .catch((err) => {
        console.warn('[YCNC] Failed to load target handles:', err);
        controller.setAllowedHandles([]);
      });

    // React to settings updates and external cache clears (e.g. from options page)
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;

        if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEYS.TARGET_HANDLES)) {
          const nextHandles = changes[STORAGE_KEYS.TARGET_HANDLES].newValue;
          controller.setAllowedHandles(Array.isArray(nextHandles) ? nextHandles : []);
        }

        if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEYS.CACHE_CLEARED_AT)) {
          cache.clearMemory();
          fetcher.reset();
        }
      });
    }

    controller.start();

    window.addEventListener('pagehide', () => {
      controller.stop();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
