'use strict';

const assert = require('assert').strict;
const fetcherModule = require('../src/content/fetcher');
const cacheModule = require('../src/content/cache');

function createInMemoryStorageArea() {
  const store = {};
  return {
    get(keys, cb) {
      if (keys === null) return cb({ ...store });
      const res = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        if (Object.prototype.hasOwnProperty.call(store, k)) res[k] = store[k];
      }
      cb(res);
    },
    set(items, cb) {
      Object.assign(store, items);
      cb();
    },
    remove(keys, cb) {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
      cb();
    },
  };
}

test('fetcher: extractChannelNameFromHtml parses valid titles and rejects error pages', () => {
  assert.equal(
    fetcherModule.extractChannelNameFromHtml(
      '<html><head><title>Foo &amp; Bar - YouTube</title></head></html>'
    ),
    'Foo & Bar'
  );
  assert.equal(
    fetcherModule.extractChannelNameFromHtml(
      '<html><head><title>404 Not Found</title></head></html>'
    ),
    null
  );
  assert.equal(
    fetcherModule.extractChannelNameFromHtml('<html><head><title>YouTube</title></head></html>'),
    null
  );
  assert.equal(
    fetcherModule.extractChannelNameFromHtml(
      '<meta property="og:title" content="Fallback &#x30C1;&#x30E3;&#x30F3;&#x30CD;&#x30EB;">'
    ),
    'Fallback チャンネル'
  );
});

test('fetcher: request queue strictly enforces maxConcurrent limit', async () => {
  const queue = fetcherModule.createRequestQueue(2);
  let active = 0;
  let maxObserved = 0;

  const tasks = Array.from({ length: 6 }, (_, i) =>
    queue.enqueue(async () => {
      active++;
      maxObserved = Math.max(maxObserved, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return i;
    })
  );

  const results = await Promise.all(tasks);
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5]);
  assert.equal(maxObserved, 2);
});

test('fetcher: deduplicates in-flight requests, cleans up promises, and retries after cooldown', async () => {
  let now = 1_700_000_000_000;
  let fetchCalls = 0;
  let shouldFail = true;

  const cache = cacheModule.createChannelNameCache({
    storageArea: createInMemoryStorageArea(),
    now: () => now,
    failedCooldownMs: 1000,
  });

  const fetcher = fetcherModule.createChannelNameFetcher({
    cache,
    timeoutMs: 0,
    fetchImpl: async () => {
      fetchCalls++;
      await new Promise((r) => setTimeout(r, 5));
      if (shouldFail) {
        return { ok: false, status: 429, text: async () => '<title>Too Many Requests</title>' };
      }
      return { ok: true, status: 200, text: async () => '<title>Recovered Name - YouTube</title>' };
    },
  });

  // Two concurrent calls for different casing share one HTTP request
  const [r1, r2] = await Promise.all([
    fetcher.resolveChannelName('@RetryUser'),
    fetcher.resolveChannelName('@retryuser'),
  ]);
  assert.equal(r1, null);
  assert.equal(r2, null);
  assert.equal(fetchCalls, 1);
  // In-flight map must be cleaned up (fixes v1 Promise leak)
  assert.equal(fetcher.getInFlightCount(), 0);

  // During cooldown, no new HTTP fetch is issued
  shouldFail = false;
  assert.equal(await fetcher.resolveChannelName('@retryuser'), null);
  assert.equal(fetchCalls, 1);

  // After cooldown expires, request retries and succeeds
  now += 1000;
  const recovered = await fetcher.resolveChannelName('@retryuser');
  assert.equal(recovered, 'Recovered Name');
  assert.equal(fetchCalls, 2);
  assert.equal(fetcher.getInFlightCount(), 0);
});
