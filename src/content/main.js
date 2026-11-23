'use strict';

(function (root) {
  const ns = root.YCNC;
  if (!ns || !ns.constants || !ns.storage || !ns.cache || !ns.fetcher || !ns.chat) {
    return;
  }

  const { STORAGE_KEYS, MESSAGES } = ns.constants;
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

    // Load initial settings directly in the ISOLATED world (no bridge race condition)
    Promise.all([storage.getEnabled(), storage.getTargetHandles()])
      .then(([enabled, handles]) => {
        controller.setEnabled(enabled);
        controller.setAllowedHandles(handles);
      })
      .catch((err) => {
        console.warn('[YCNC] Failed to load settings:', err);
        controller.setEnabled(true);
        controller.setAllowedHandles([]);
      });

    // React to settings updates and external cache clears (e.g. from popup/options page)
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;

        if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEYS.ENABLED)) {
          controller.setEnabled(changes[STORAGE_KEYS.ENABLED].newValue !== false);
        }

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

    // Answer context queries from the toolbar popup (requires no extra permissions)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        if (request && request.type === MESSAGES.GET_CONTEXT) {
          sendResponse({
            channelHandle: controller.getCurrentChannelHandle(),
            isActive: controller.canConvertNow(),
          });
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
