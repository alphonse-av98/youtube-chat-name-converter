'use strict';

(function (root, factory) {
  const exportsObj = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  } else {
    root.YCNC = root.YCNC || {};
    root.YCNC.constants = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MESSAGE_RENDERER_TAGS = [
    'yt-live-chat-text-message-renderer',
    'yt-live-chat-paid-message-renderer',
    'yt-live-chat-paid-sticker-renderer',
    'yt-live-chat-membership-item-renderer',
    'yt-live-chat-sponsorships-gift-purchase-announcement-renderer',
  ];

  const MESSAGE_RENDERER_TAG_SET = new Set(
    MESSAGE_RENDERER_TAGS.map((tag) => tag.toUpperCase())
  );

  const MESSAGE_RENDERER_SELECTOR = MESSAGE_RENDERER_TAGS.join(', ');

  const CHAT_CONTAINER_SELECTORS = [
    'yt-live-chat-item-list-renderer #items',
    '#item-list #items',
    '#items.yt-live-chat-item-list-renderer',
  ];

  const OWNER_LINK_SELECTORS = [
    'ytd-watch-metadata #owner #channel-name a[href^="/@"]',
    '#owner #channel-name a[href^="/@"]',
    'ytd-video-owner-renderer a[href^="/@"]',
  ];

  return Object.freeze({
    STORAGE_KEYS: Object.freeze({
      TARGET_HANDLES: 'targetHandles',
      CACHE_PREFIX: 'ycnc_cache:',
      CACHE_CLEARED_AT: 'ycnc_cache_cleared_at',
      LEGACY_LOCAL_STORAGE_PREFIX: 'YCNC:',
    }),
    CACHE: Object.freeze({
      TTL_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
      REFRESH_INTERVAL_MS: 24 * 60 * 60 * 1000, // Refresh TTL at most once per day
      FAILED_COOLDOWN_MS: 5 * 60 * 1000, // 5 minutes cooldown after failed fetch
      MAX_ENTRIES: 5000,
    }),
    FETCH: Object.freeze({
      MAX_CONCURRENT_REQUESTS: 5,
      TIMEOUT_MS: 10000,
      YOUTUBE_ORIGIN: 'https://www.youtube.com',
    }),
    OBSERVER: Object.freeze({
      INIT_RETRY_INTERVAL_MS: 1000,
      MAX_INIT_RETRIES: 30,
      OWNER_RETRY_INTERVAL_MS: 1000,
      MAX_OWNER_RETRIES: 15,
    }),
    DOM: Object.freeze({
      MESSAGE_RENDERER_TAGS: Object.freeze(MESSAGE_RENDERER_TAGS),
      MESSAGE_RENDERER_TAG_SET,
      MESSAGE_RENDERER_SELECTOR,
      CHAT_CONTAINER_SELECTORS: Object.freeze(CHAT_CONTAINER_SELECTORS),
      OWNER_LINK_SELECTORS: Object.freeze(OWNER_LINK_SELECTORS),
      AUTHOR_NAME_SELECTOR: '#author-name',
      ORIGINAL_HANDLE_ATTR: 'data-ycnc-original-handle',
    }),
  });
});
