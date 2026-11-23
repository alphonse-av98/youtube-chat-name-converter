'use strict';

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    const constants = require('./constants');
    const handle = require('./handle');
    module.exports = factory(constants, handle);
  } else {
    root.YCNC = root.YCNC || {};
    root.YCNC.storage = factory(root.YCNC.constants, root.YCNC.handle);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (constants, handleUtils) {
  const { STORAGE_KEYS, CACHE } = constants;

  function getDefaultStorageArea() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
    throw new Error('chrome.storage.local is not available');
  }

  function storageGet(area, keys) {
    return new Promise((resolve, reject) => {
      try {
        const maybePromise = area.get(keys, (result) => {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(result || {});
        });
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then((res) => resolve(res || {}), reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  function storageSet(area, items) {
    return new Promise((resolve, reject) => {
      try {
        const maybePromise = area.set(items, () => {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(() => resolve(), reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  function storageRemove(area, keys) {
    if (Array.isArray(keys) && keys.length === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      try {
        const maybePromise = area.remove(keys, () => {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(() => resolve(), reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  function buildCacheKey(handle) {
    const normalized = handleUtils.normalizeHandleKey(handle);
    return `${STORAGE_KEYS.CACHE_PREFIX}${normalized}`;
  }

  function isCacheKey(key) {
    return typeof key === 'string' && key.startsWith(STORAGE_KEYS.CACHE_PREFIX);
  }

  function isValidCacheEntry(entry, now = Date.now(), ttlMs = CACHE.TTL_MS) {
    return Boolean(
      entry &&
        typeof entry === 'object' &&
        typeof entry.name === 'string' &&
        entry.name.length > 0 &&
        typeof entry.timestamp === 'number' &&
        Number.isFinite(entry.timestamp) &&
        now - entry.timestamp < ttlMs
    );
  }

  async function getEnabled(area = getDefaultStorageArea()) {
    const data = await storageGet(area, [STORAGE_KEYS.ENABLED]);
    return data[STORAGE_KEYS.ENABLED] !== false;
  }

  async function setEnabled(enabled, area = getDefaultStorageArea()) {
    await storageSet(area, { [STORAGE_KEYS.ENABLED]: Boolean(enabled) });
  }

  async function getTargetHandles(area = getDefaultStorageArea()) {
    const data = await storageGet(area, [STORAGE_KEYS.TARGET_HANDLES]);
    const list = data[STORAGE_KEYS.TARGET_HANDLES];
    if (!Array.isArray(list)) return [];
    return list.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }

  async function setTargetHandles(handles, area = getDefaultStorageArea()) {
    const sanitized = Array.isArray(handles)
      ? handles.map((h) => h.trim()).filter(Boolean)
      : [];
    await storageSet(area, { [STORAGE_KEYS.TARGET_HANDLES]: sanitized });
  }

  async function getCachedEntry(handle, area = getDefaultStorageArea(), now = Date.now()) {
    const key = buildCacheKey(handle);
    const data = await storageGet(area, [key]);
    const entry = data[key];
    if (!isValidCacheEntry(entry, now)) {
      return null;
    }
    return { name: entry.name, timestamp: entry.timestamp };
  }

  async function setCachedEntry(handle, name, area = getDefaultStorageArea(), now = Date.now()) {
    const key = buildCacheKey(handle);
    await storageSet(area, {
      [key]: {
        name,
        timestamp: now,
      },
    });
  }

  async function getCacheStats(area = getDefaultStorageArea(), now = Date.now()) {
    const all = await storageGet(area, null);
    let activeCount = 0;
    let totalCount = 0;

    for (const [key, value] of Object.entries(all)) {
      if (!isCacheKey(key)) continue;
      totalCount++;
      if (isValidCacheEntry(value, now)) {
        activeCount++;
      }
    }

    return { count: activeCount, totalCount };
  }

  async function clearAllCache(area = getDefaultStorageArea(), now = Date.now()) {
    const all = await storageGet(area, null);
    const cacheKeys = Object.keys(all).filter(isCacheKey);
    if (cacheKeys.length > 0) {
      await storageRemove(area, cacheKeys);
    }
    await storageSet(area, { [STORAGE_KEYS.CACHE_CLEARED_AT]: now });
    return cacheKeys.length;
  }

  async function cleanupExpiredCache(
    area = getDefaultStorageArea(),
    now = Date.now(),
    maxEntries = CACHE.MAX_ENTRIES
  ) {
    const all = await storageGet(area, null);
    const keysToRemove = [];
    const validEntries = [];

    for (const [key, value] of Object.entries(all)) {
      if (!isCacheKey(key)) continue;
      if (!isValidCacheEntry(value, now)) {
        keysToRemove.push(key);
      } else {
        validEntries.push({ key, timestamp: value.timestamp });
      }
    }

    if (validEntries.length > maxEntries) {
      validEntries.sort((a, b) => a.timestamp - b.timestamp);
      const excessCount = validEntries.length - maxEntries;
      for (let i = 0; i < excessCount; i++) {
        keysToRemove.push(validEntries[i].key);
      }
    }

    if (keysToRemove.length > 0) {
      await storageRemove(area, keysToRemove);
    }

    return keysToRemove.length;
  }

  return Object.freeze({
    buildCacheKey,
    isCacheKey,
    isValidCacheEntry,
    getEnabled,
    setEnabled,
    getTargetHandles,
    setTargetHandles,
    getCachedEntry,
    setCachedEntry,
    getCacheStats,
    clearAllCache,
    cleanupExpiredCache,
  });
});
