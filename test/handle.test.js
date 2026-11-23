'use strict';

const assert = require('assert').strict;
const handle = require('../src/shared/handle');

test('handle: parseHandleInput handles raw handles, paths, URLs, and encoded Japanese handles', () => {
  assert.equal(handle.parseHandleInput('@youtube'), '@youtube');
  assert.equal(handle.parseHandleInput('  @User_123  '), '@User_123');
  assert.equal(handle.parseHandleInput('/@creator/streams'), '@creator');
  assert.equal(handle.parseHandleInput('/@creator?si=abc'), '@creator');
  assert.equal(handle.parseHandleInput('https://www.youtube.com/@YouTube/featured'), '@YouTube');
  assert.equal(handle.parseHandleInput('/@%E3%83%86%E3%82%B9%E3%83%88'), '@テスト');
  assert.equal(
    handle.parseHandleInput('https://www.youtube.com/@%E3%83%86%E3%82%B9%E3%83%88'),
    '@テスト'
  );
});

test('handle: parseHandleInput rejects invalid inputs and non-YouTube URLs', () => {
  assert.equal(handle.parseHandleInput(''), null);
  assert.equal(handle.parseHandleInput('@'), null);
  assert.equal(handle.parseHandleInput('youtube'), null);
  assert.equal(handle.parseHandleInput('@has space'), null);
  assert.equal(handle.parseHandleInput('https://example.com/@youtube'), null);
  assert.equal(handle.parseHandleInput(null), null);
});

test('handle: normalizeHandleKey normalizes casing and percent encoding', () => {
  assert.equal(handle.normalizeHandleKey('@YouTube'), '@youtube');
  assert.equal(handle.normalizeHandleKey('@%E3%83%86%E3%82%B9%E3%83%88'), '@テスト');
});

test('handle: buildChannelUrl preserves literal @ and encodes non-ASCII slugs', () => {
  assert.equal(handle.buildChannelUrl('@user-id'), 'https://www.youtube.com/@user-id');
  assert.equal(
    handle.buildChannelUrl('@テスト'),
    'https://www.youtube.com/@%E3%83%86%E3%82%B9%E3%83%88'
  );
  assert.equal(handle.buildChannelUrl('invalid'), null);
});

test('handle: decodeHtmlEntities decodes named, decimal, and hex entities in a single pass', () => {
  assert.equal(
    handle.decodeHtmlEntities('Tom &amp; Jerry &lt;3&gt; &quot;hi&quot; &#39;ok&#39; &apos;yo&apos;'),
    'Tom & Jerry <3> "hi" \'ok\' \'yo\''
  );
  assert.equal(handle.decodeHtmlEntities('&#x3042;&#12356;'), 'あい');
  // Must not double-unescape &amp;lt; into <
  assert.equal(handle.decodeHtmlEntities('&amp;lt;script&amp;gt;'), '&lt;script&gt;');
});
