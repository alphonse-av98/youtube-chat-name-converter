'use strict';

const assert = require('assert').strict;
const chat = require('../src/content/chat');
const { DOM } = require('../src/shared/constants');

function createMockElement(tagName, { textContent = '', attrs = {}, children = [] } = {}) {
  const attrMap = new Map(Object.entries(attrs));
  const el = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    textContent,
    isConnected: true,
    childNodes: [],
    get childElementCount() {
      return this.childNodes.filter((n) => n.nodeType === 1).length;
    },
    getAttribute(name) {
      return attrMap.has(name) ? attrMap.get(name) : null;
    },
    setAttribute(name, value) {
      attrMap.set(name, String(value));
    },
    removeAttribute(name) {
      attrMap.delete(name);
    },
    querySelector(selector) {
      if (selector === DOM.AUTHOR_NAME_SELECTOR) {
        return this.childNodes.find((n) => n.id === 'author-name') || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === DOM.MESSAGE_RENDERER_SELECTOR) {
        return this.childNodes.filter((n) => chat.isMessageRenderer(n));
      }
      if (selector === `${DOM.AUTHOR_NAME_SELECTOR}[${DOM.ORIGINAL_HANDLE_ATTR}]`) {
        const result = [];
        for (const msg of this.childNodes) {
          const author = msg.querySelector ? msg.querySelector(DOM.AUTHOR_NAME_SELECTOR) : null;
          if (author && author.getAttribute(DOM.ORIGINAL_HANDLE_ATTR)) {
            result.push(author);
          }
        }
        return result;
      }
      return [];
    },
  };
  el.childNodes = children;
  return el;
}

test('chat: isMessageRenderer recognizes text, paid, sticker, membership, and gift renderers', () => {
  assert.equal(chat.isMessageRenderer(createMockElement('yt-live-chat-text-message-renderer')), true);
  assert.equal(chat.isMessageRenderer(createMockElement('yt-live-chat-paid-message-renderer')), true);
  assert.equal(chat.isMessageRenderer(createMockElement('yt-live-chat-paid-sticker-renderer')), true);
  assert.equal(
    chat.isMessageRenderer(createMockElement('yt-live-chat-membership-item-renderer')),
    true
  );
  assert.equal(
    chat.isMessageRenderer(
      createMockElement('yt-live-chat-sponsorships-gift-purchase-announcement-renderer')
    ),
    true
  );
  assert.equal(chat.isMessageRenderer(createMockElement('div')), false);
});

test('chat: isConversionAllowed handles unloaded, empty, case-insensitive, and Japanese handles', () => {
  assert.equal(chat.isConversionAllowed(null, '@any'), false);
  assert.equal(chat.isConversionAllowed([], null), true);
  assert.equal(chat.isConversionAllowed(['@Creator'], '@creator'), true);
  assert.equal(chat.isConversionAllowed(['@テスト'], '@%E3%83%86%E3%82%B9%E3%83%88'), true);
  assert.equal(chat.isConversionAllowed(['@Creator'], '@other'), false);
  assert.equal(chat.isConversionAllowed(['@Creator'], null), false);
});

test('chat: updateAuthorNode preserves child badge elements and revertAuthorNode restores handle', () => {
  const textNode = { nodeType: 3, nodeValue: '@alice' };
  const badgeNode = createMockElement('span', { textContent: 'verified' });
  const authorNode = createMockElement('span', {
    children: [textNode, badgeNode],
  });

  const updated = chat.updateAuthorNode(authorNode, '@alice', 'アリス');
  assert.equal(updated, true);
  assert.equal(textNode.nodeValue, 'アリス');
  assert.equal(authorNode.childNodes.length, 2); // badge child preserved
  assert.equal(authorNode.getAttribute('title'), '@alice');
  assert.equal(authorNode.getAttribute(DOM.ORIGINAL_HANDLE_ATTR), '@alice');

  const reverted = chat.revertAuthorNode(authorNode);
  assert.equal(reverted, true);
  assert.equal(textNode.nodeValue, '@alice');
  assert.equal(authorNode.getAttribute('title'), null);
  assert.equal(authorNode.getAttribute(DOM.ORIGINAL_HANDLE_ATTR), null);
});

test('chat: ChatController converts existing & observed messages and reverts when disallowed', async () => {
  const author1 = createMockElement('span', { textContent: '@user1' });
  author1.id = 'author-name';
  const msg1 = createMockElement('yt-live-chat-text-message-renderer', { children: [author1] });

  const container = createMockElement('div', { children: [msg1] });

  const mockDoc = {
    querySelector(sel) {
      return sel === 'yt-live-chat-item-list-renderer #items' ? container : null;
    },
  };

  const parentOwnerLink = { getAttribute: () => '/@StreamerA/streams' };
  const mockWin = {
    parent: {
      document: {
        querySelector: () => parentOwnerLink,
      },
    },
  };

  let mutationCallback = null;
  let disconnected = false;
  class MockMutationObserver {
    constructor(cb) {
      mutationCallback = cb;
    }
    observe() {}
    disconnect() {
      disconnected = true;
    }
  }

  const resolvedMap = new Map([
    ['@user1', 'User One'],
    ['@user2', 'User Two'],
  ]);
  const mockCache = {
    getSync: (h) => (h === '@user1' ? 'User One' : null),
  };
  const mockFetcher = {
    resolveChannelName: async (h) => resolvedMap.get(h) || null,
  };

  const controller = chat.createChatController({
    document: mockDoc,
    window: mockWin,
    cache: mockCache,
    fetcher: mockFetcher,
    MutationObserver: MockMutationObserver,
  });

  controller.start();
  controller.setAllowedHandles(['@streamera']);

  // Existing message converted synchronously from memory cache
  assert.equal(author1.textContent, 'User One');
  assert.equal(author1.getAttribute('title'), '@user1');

  // Newly observed message converted asynchronously via fetcher
  const author2 = createMockElement('span', { textContent: '@user2' });
  author2.id = 'author-name';
  const msg2 = createMockElement('yt-live-chat-paid-sticker-renderer', { children: [author2] });
  container.childNodes.push(msg2);
  mutationCallback([{ addedNodes: [msg2] }]);

  await new Promise((r) => setTimeout(r, 10));
  assert.equal(author2.textContent, 'User Two');

  // Changing allowlist to another streamer reverts converted messages
  controller.setAllowedHandles(['@otherstreamer']);
  assert.equal(author1.textContent, '@user1');
  assert.equal(author2.textContent, '@user2');

  controller.stop();
  assert.equal(disconnected, true);
});
