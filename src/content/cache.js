'use strict';

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    const constants = require('../shared/constants');
    const handle = require('../shared/handle');
    const storage = require('../shared/storage');
    module.exports = factory(constants, handle, storage);
  } else {
    root.YCNC = root.YCNC || {};
    root.YCNC.cache = factory(root.YCNC.constants, root.YCNC.handle, root.YCNC.storage);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (constants, handleUtils, storage) {
  const { STORAGE_KEYS, CACHE } = constants;

  /**
   * Removes legacy v1 localStorage cache keys (prefixed with "YCNC:") without index shifting bugs.
   * @param {Storage | null} [localStorageRef]
   * @returns {number}
   */
  function cleanupLegacyLocalStorage(localStorageRef) {
    let targetStorage = localStorageRef;
    if (targetStorage === undefined) {
      try {
        targetStorage = typeof localStorage !== 'undefined' ? localStorage : null;
      } catch {
        targetStorage = null;
      }
    }
    if (!targetStorage) return 0;

    try {
      const keysToRemove = [];
      for (let i = 0; i < targetStorage.length; i++) {
        const key = targetStorage.key(i);
        if (key && key.startsWith(STORAGE_KEYS.LEGACY_LOCAL_STORAGE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        targetStorage.removeItem(key);
      }
      return keysToRemove.length;
    } catch {
      return 0;
    }
  }

  /**
   * Two-tier cache combining an in-memory Map with chrome.storage.local persistence
   * and a short-lived failure cooldown map.
   */
  function createChannelNameCache(options = {}) {
    const storageArea = options.storageArea;
    const nowFn = options.now || (() => Date.now());
    const refreshIntervalMs = options.refreshIntervalMs ?? CACHE.REFRESH_INTERVAL_MS;
    const failedCooldownMs = options.failedCooldownMs ?? CACHE.FAILED_COOLDOWN_MS;
    const maxEntries = options.maxEntries ?? CACHE.MAX_ENTRIES;

    const memoryCache = new Map();
    const failedCooldowns = new Map();

    function getSync(handle) {
      const key = handleUtils.normalizeHandleKey(handle);
      if (!key) return null;
      return memoryCache.has(key) ? memoryCache.get(key) : null;
    }

    function isInFailedCooldown(handle) {
      const key = handleUtils.normalizeHandleKey(handle);
      if (!key || !failedCooldowns.has(key)) return false;
      const failedAt = failedCooldowns.get(key);
      if (nowFn() - failedAt < failedCooldownMs) {
        return true;
      }
      failedCooldowns.delete(key);
      return false;
    }

    function markFailed(handle) {
      const key = handleUtils.normalizeHandleKey(handle);
      if (!key) return;
      failedCooldowns.set(key, nowFn());
    }

    async function get(handle) {
      const key = handleUtils.normalizeHandleKey(handle);
      if (!key) return null;

      if (memoryCache.has(key)) {
        return memoryCache.get(key);
      }

      const now = nowFn();
      try {
        const entry = await storage.getCachedEntry(key, storageArea, now);
        if (!entry) return null;

        memoryCache.set(key, entry.name);

        // Throttle TTL refresh writes to avoid redundant storage writes on active chatters
        if (now - entry.timestamp >= refreshIntervalMs) {
          storage.setCachedEntry(key, entry.name, storageArea, now).catch(() => {});
        }

        return entry.name;
      } catch (err) {
        console.warn('[YCNC] Failed to read cache from storage:', err);
        return null;
      }
    }

    async function set(handle, name) {
      const key = handleUtils.normalizeHandleKey(handle);
      if (!key || typeof name !== 'string' || !name) return;

      memoryCache.set(key, name);
      failedCooldowns.delete(key);

      try {
        await storage.setCachedEntry(key, name, storageArea, nowFn());
      } catch (err) {
        console.warn('[YCNC] Failed to save cache to storage:', err);
      }
    }

    function clearMemory() {
      memoryCache.clear();
      failedCooldowns.clear();
    }

    async function cleanupExpired() {
      try {
        return await storage.cleanupExpiredCache(storageArea, nowFn(), maxEntries);
      } catch (err) {
        console.warn('[YCNC] Failed to cleanup expired cache:', err);
        return 0;
      }
    }

    return {
      getSync,
      get,
      set,
      isInFailedCooldown,
      markFailed,
      clearMemory,
      cleanupExpired,
    };
  }

  return Object.freeze({
    cleanupLegacyLocalStorage,
    createChannelNameCache,
  });
});
