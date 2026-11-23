'use strict';

const assert = require('assert').strict;
const storage = require('../src/shared/storage');
const { STORAGE_KEYS, CACHE } = require('../src/shared/constants');

function createMockStorageArea(initialData = {}) {
  const store = { ...initialData };
  return {
    _store: store,
    get(keys, cb) {
      let result = {};
      if (keys === null || keys === undefined) {
        result = { ...store };
      } else if (Array.isArray(keys)) {
        for (const k of keys) {
          if (Object.prototype.hasOwnProperty.call(store, k)) {
            result[k] = store[k];
          }
        }
      } else if (typeof keys === 'string') {
        if (Object.prototype.hasOwnProperty.call(store, keys)) {
          result[keys] = store[keys];
        }
      }
      cb(result);
    },
    set(items, cb) {
      Object.assign(store, items);
      cb();
    },
    remove(keys, cb) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) {
        delete store[k];
      }
      cb();
    },
  };
}

test('storage: targetHandles round-trip preserves sanitized list', async () => {
  const area = createMockStorageArea();
  assert.deepEqual(await storage.getTargetHandles(area), []);

  await storage.setTargetHandles(['  @ChannelA  ', '', '@ChannelB'], area);
  assert.deepEqual(await storage.getTargetHandles(area), ['@ChannelA', '@ChannelB']);
});

test('storage: cached entries are case-insensitive and respect TTL', async () => {
  const area = createMockStorageArea();
  const baseTime = 1_700_000_000_000;

  await storage.setCachedEntry('@Alice', 'アリスチャンネル', area, baseTime);

  const hit = await storage.getCachedEntry('@alice', area, baseTime + 1000);
  assert.deepEqual(hit, { name: 'アリスチャンネル', timestamp: baseTime });

  const expired = await storage.getCachedEntry('@alice', area, baseTime + CACHE.TTL_MS + 1);
  assert.equal(expired, null);
});

test('storage: clearAllCache removes only cache keys and records cleared timestamp', async () => {
  const area = createMockStorageArea();
  const now = 1_700_000_000_000;

  await storage.setTargetHandles(['@keepme'], area);
  await storage.setCachedEntry('@a', 'Channel A', area, now);
  await storage.setCachedEntry('@b', 'Channel B', area, now);

  const removed = await storage.clearAllCache(area, now + 500);
  assert.equal(removed, 2);
  assert.deepEqual(await storage.getTargetHandles(area), ['@keepme']);
  assert.equal(area._store[STORAGE_KEYS.CACHE_CLEARED_AT], now + 500);
  assert.deepEqual(await storage.getCacheStats(area, now + 500), { count: 0, totalCount: 0 });
});

test('storage: cleanupExpiredCache removes expired entries and evicts oldest over maxEntries', async () => {
  const area = createMockStorageArea();
  const now = 1_700_000_000_000;

  await storage.setCachedEntry('@expired', 'Old', area, now - CACHE.TTL_MS - 10);
  await storage.setCachedEntry('@oldest', 'First', area, now - 3000);
  await storage.setCachedEntry('@middle', 'Second', area, now - 2000);
  await storage.setCachedEntry('@newest', 'Third', area, now - 1000);

  const removed = await storage.cleanupExpiredCache(area, now, 2);
  assert.equal(removed, 2); // @expired + @oldest
  assert.equal(await storage.getCachedEntry('@expired', area, now), null);
  assert.equal(await storage.getCachedEntry('@oldest', area, now), null);
  assert.equal((await storage.getCachedEntry('@middle', area, now)).name, 'Second');
  assert.equal((await storage.getCachedEntry('@newest', area, now)).name, 'Third');
});
