'use strict';

const assert = require('assert').strict;
const cacheModule = require('../src/content/cache');
const storage = require('../src/shared/storage');

function createSpyStorageArea() {
  const store = {};
  let setCalls = 0;
  return {
    _store: store,
    getSetCalls: () => setCalls,
    get(keys, cb) {
      if (keys === null) return cb({ ...store });
      const res = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        if (Object.prototype.hasOwnProperty.call(store, k)) res[k] = store[k];
      }
      cb(res);
    },
    set(items, cb) {
      setCalls++;
      Object.assign(store, items);
      cb();
    },
    remove(keys, cb) {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
      cb();
    },
  };
}

test('cache: cleanupLegacyLocalStorage removes all YCNC:* keys without index shifting skips', () => {
  const map = new Map([
    ['YCNC:@a', '{"name":"A"}'],
    ['YCNC:@b', '{"name":"B"}'],
    ['yt-player-volume', '50'],
    ['YCNC:@c', '{"name":"C"}'],
    ['YCNC:@d', '{"name":"D"}'],
  ]);

  const mockLocalStorage = {
    get length() {
      return map.size;
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key) {
      map.delete(key);
    },
  };

  const removed = cacheModule.cleanupLegacyLocalStorage(mockLocalStorage);
  assert.equal(removed, 4);
  assert.deepEqual(Array.from(map.keys()), ['yt-player-volume']);
});

test('cache: two-tier cache throttles TTL refresh writes and respects failure cooldowns', async () => {
  const area = createSpyStorageArea();
  let currentTime = 1_700_000_000_000;

  await storage.setCachedEntry('@alice', 'Alice', area, currentTime);
  const initialSetCalls = area.getSetCalls();

  const cache = cacheModule.createChannelNameCache({
    storageArea: area,
    now: () => currentTime,
    refreshIntervalMs: 1000,
    failedCooldownMs: 500,
  });

  // Within refresh interval -> should load into memory without writing back to storage
  currentTime += 500;
  assert.equal(await cache.get('@Alice'), 'Alice');
  assert.equal(cache.getSync('@ALICE'), 'Alice');
  assert.equal(area.getSetCalls(), initialSetCalls);

  // Clear memory and advance beyond refresh interval -> triggers one background TTL refresh write
  cache.clearMemory();
  currentTime += 1000;
  assert.equal(await cache.get('@alice'), 'Alice');
  assert.equal(area.getSetCalls(), initialSetCalls + 1);

  // Failure cooldown expires after failedCooldownMs
  cache.markFailed('@missing');
  assert.equal(cache.isInFailedCooldown('@MISSING'), true);
  currentTime += 500;
  assert.equal(cache.isInFailedCooldown('@missing'), false);
});
