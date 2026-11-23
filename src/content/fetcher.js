'use strict';

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    const constants = require('../shared/constants');
    const handle = require('../shared/handle');
    module.exports = factory(constants, handle);
  } else {
    root.YCNC = root.YCNC || {};
    root.YCNC.fetcher = factory(root.YCNC.constants, root.YCNC.handle);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (constants, handleUtils) {
  const { FETCH } = constants;

  const TITLE_TAG_REGEX = /<title[^>]*>([\s\S]*?)<\/title>/i;
  const OG_TITLE_REGEX = /<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["'][^>]*>/i;
  const OG_TITLE_REVERSED_REGEX =
    /<meta\s+[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["'][^>]*>/i;
  const YOUTUBE_TITLE_SUFFIX_REGEX = /\s+-\s+YouTube$/;

  /**
   * Extracts a YouTube channel name from channel page HTML without DOM parsing (Trusted Types safe).
   * Returns null if the HTML does not look like a valid channel page (e.g., 404 or generic page).
   * @param {string} html
   * @returns {string | null}
   */
  function extractChannelNameFromHtml(html) {
    if (typeof html !== 'string' || !html) return null;

    const titleMatch = html.match(TITLE_TAG_REGEX);
    if (titleMatch) {
      const rawTitle = handleUtils.decodeHtmlEntities(titleMatch[1]).trim();
      if (YOUTUBE_TITLE_SUFFIX_REGEX.test(rawTitle)) {
        const channelName = rawTitle.replace(YOUTUBE_TITLE_SUFFIX_REGEX, '').trim();
        if (channelName) {
          return channelName;
        }
      }
    }

    const ogMatch = html.match(OG_TITLE_REGEX) || html.match(OG_TITLE_REVERSED_REGEX);
    if (ogMatch) {
      const ogTitle = handleUtils.decodeHtmlEntities(ogMatch[1]).trim();
      if (ogTitle && ogTitle !== 'YouTube' && ogTitle !== '404 Not Found') {
        return ogTitle;
      }
    }

    return null;
  }

  /**
   * Concurrency-limited FIFO task queue.
   */
  function createRequestQueue(maxConcurrent = FETCH.MAX_CONCURRENT_REQUESTS) {
    const queue = [];
    let activeCount = 0;

    function drain() {
      while (activeCount < maxConcurrent && queue.length > 0) {
        const item = queue.shift();
        activeCount++;

        Promise.resolve()
          .then(() => item.task())
          .then(
            (result) => item.resolve(result),
            (err) => item.reject(err)
          )
          .finally(() => {
            activeCount--;
            drain();
          });
      }
    }

    function enqueue(task) {
      return new Promise((resolve, reject) => {
        queue.push({ task, resolve, reject });
        drain();
      });
    }

    function clear() {
      while (queue.length > 0) {
        const item = queue.shift();
        item.resolve(null);
      }
    }

    function getPendingCount() {
      return queue.length;
    }

    function getActiveCount() {
      return activeCount;
    }

    return {
      enqueue,
      clear,
      getPendingCount,
      getActiveCount,
    };
  }

  /**
   * Coordinates channel name resolution with caching, in-flight deduplication,
   * failure cooldown, concurrency limiting, and request timeouts.
   */
  function createChannelNameFetcher(options) {
    const cache = options.cache;
    const fetchImpl = options.fetchImpl || ((url, init) => fetch(url, init));
    const maxConcurrent = options.maxConcurrent ?? FETCH.MAX_CONCURRENT_REQUESTS;
    const timeoutMs = options.timeoutMs ?? FETCH.TIMEOUT_MS;
    const origin = options.origin || FETCH.YOUTUBE_ORIGIN;

    const queue = createRequestQueue(maxConcurrent);
    const inFlight = new Map();

    async function fetchChannelPage(handle) {
      const url = handleUtils.buildChannelUrl(handle, origin);
      if (!url) return null;

      let controller = null;
      let timerId = null;

      if (typeof AbortController !== 'undefined' && timeoutMs > 0) {
        controller = new AbortController();
        timerId = setTimeout(() => controller.abort(), timeoutMs);
      }

      try {
        const init = controller ? { signal: controller.signal } : undefined;
        const response = await fetchImpl(url, init);
        if (!response || !response.ok) {
          return null;
        }
        const html = await response.text();
        return extractChannelNameFromHtml(html);
      } catch (err) {
        console.warn(`[YCNC] Failed to fetch channel name for ${handle}:`, err);
        return null;
      } finally {
        if (timerId !== null) {
          clearTimeout(timerId);
        }
      }
    }

    async function resolveChannelName(handle) {
      const key = handleUtils.normalizeHandleKey(handle);
      if (!key) return null;

      const syncHit = cache.getSync(key);
      if (syncHit) return syncHit;

      const cached = await cache.get(key);
      if (cached) return cached;

      if (cache.isInFailedCooldown(key)) {
        return null;
      }

      if (inFlight.has(key)) {
        return inFlight.get(key);
      }

      const promise = queue
        .enqueue(async () => {
          const channelName = await fetchChannelPage(handle);
          if (channelName) {
            await cache.set(key, channelName);
            return channelName;
          }
          cache.markFailed(key);
          return null;
        })
        .finally(() => {
          // Always clean up so entries never leak and failed requests can be retried after cooldown
          inFlight.delete(key);
        });

      inFlight.set(key, promise);
      return promise;
    }

    function reset() {
      queue.clear();
      inFlight.clear();
    }

    return {
      resolveChannelName,
      reset,
      getInFlightCount: () => inFlight.size,
    };
  }

  return Object.freeze({
    extractChannelNameFromHtml,
    createRequestQueue,
    createChannelNameFetcher,
  });
});
