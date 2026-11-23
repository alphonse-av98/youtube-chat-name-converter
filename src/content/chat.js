'use strict';

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    const constants = require('../shared/constants');
    const handle = require('../shared/handle');
    module.exports = factory(constants, handle);
  } else {
    root.YCNC = root.YCNC || {};
    root.YCNC.chat = factory(root.YCNC.constants, root.YCNC.handle);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (constants, handleUtils) {
  const { DOM, OBSERVER } = constants;

  function isMessageRenderer(node) {
    return Boolean(
      node &&
        node.nodeType === 1 &&
        typeof node.tagName === 'string' &&
        DOM.MESSAGE_RENDERER_TAG_SET.has(node.tagName.toUpperCase())
    );
  }

  function findChatContainer(doc) {
    if (!doc || typeof doc.querySelector !== 'function') return null;
    for (const selector of DOM.CHAT_CONTAINER_SELECTORS) {
      const container = doc.querySelector(selector);
      if (container) return container;
    }
    return null;
  }

  /**
   * Attempts to detect the current channel's handle from the parent YouTube watch page.
   * Returns null for popout chat or if the owner element has not rendered yet.
   * @param {Window} [win]
   * @returns {string | null}
   */
  function extractCurrentChannelHandle(win) {
    try {
      const targetWin = win || (typeof window !== 'undefined' ? window : null);
      if (!targetWin || !targetWin.parent || targetWin.parent === targetWin) {
        return null;
      }
      const parentDoc = targetWin.parent.document;
      if (!parentDoc || typeof parentDoc.querySelector !== 'function') {
        return null;
      }

      for (const selector of DOM.OWNER_LINK_SELECTORS) {
        const ownerLink = parentDoc.querySelector(selector);
        if (ownerLink) {
          const href = ownerLink.getAttribute('href');
          const parsed = handleUtils.parseHandleInput(href);
          if (parsed) return parsed;
        }
      }
    } catch {
      // Cross-origin or popout chat access error
    }
    return null;
  }

  /**
   * Checks whether conversion is permitted given the configured handle allowlist
   * and the current stream channel handle.
   * @param {string[] | null} allowedHandles
   * @param {string | null} currentChannelHandle
   * @returns {boolean}
   */
  function isConversionAllowed(allowedHandles, currentChannelHandle) {
    if (allowedHandles === null) return false;
    if (allowedHandles.length === 0) return true;
    if (!currentChannelHandle) return false;

    const normalizedCurrent = handleUtils.normalizeHandleKey(currentChannelHandle);
    if (!normalizedCurrent) return false;

    return allowedHandles.some(
      (handle) => handleUtils.normalizeHandleKey(handle) === normalizedCurrent
    );
  }

  function getAuthorDisplayText(authorNameNode) {
    if (!authorNameNode) return '';
    if (authorNameNode.childElementCount > 0 && authorNameNode.childNodes) {
      for (const child of authorNameNode.childNodes) {
        if (child.nodeType === 3) {
          const trimmed = (child.nodeValue || '').trim();
          if (trimmed) return trimmed;
        }
      }
    }
    return (authorNameNode.textContent || '').trim();
  }

  function setAuthorDisplayText(authorNameNode, expectedCurrent, nextText) {
    if (authorNameNode.childElementCount > 0 && authorNameNode.childNodes) {
      for (const child of authorNameNode.childNodes) {
        if (child.nodeType === 3 && (child.nodeValue || '').trim() === expectedCurrent) {
          child.nodeValue = nextText;
          return true;
        }
      }
      return false;
    }

    if ((authorNameNode.textContent || '').trim() !== expectedCurrent) {
      return false;
    }
    authorNameNode.textContent = nextText;
    return true;
  }

  /**
   * Replaces a handle in the author element with the resolved channel name,
   * keeping the original handle in the tooltip and a data attribute for clean reversal.
   */
  function updateAuthorNode(authorNameNode, handle, originalName) {
    if (!authorNameNode || authorNameNode.isConnected === false) {
      return false;
    }
    if (!originalName || originalName === handle) {
      return false;
    }

    const updated = setAuthorDisplayText(authorNameNode, handle, originalName);
    if (!updated) return false;

    authorNameNode.setAttribute('title', handle);
    authorNameNode.setAttribute(DOM.ORIGINAL_HANDLE_ATTR, handle);
    return true;
  }

  /**
   * Restores a previously converted author element back to its original handle.
   */
  function revertAuthorNode(authorNameNode) {
    if (!authorNameNode || typeof authorNameNode.getAttribute !== 'function') {
      return false;
    }
    const originalHandle = authorNameNode.getAttribute(DOM.ORIGINAL_HANDLE_ATTR);
    if (!originalHandle) return false;

    const currentText = getAuthorDisplayText(authorNameNode);
    if (currentText && currentText !== originalHandle) {
      setAuthorDisplayText(authorNameNode, currentText, originalHandle);
    }
    authorNameNode.removeAttribute('title');
    authorNameNode.removeAttribute(DOM.ORIGINAL_HANDLE_ATTR);
    return true;
  }

  function createChatController(options) {
    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    const win = options.window || (typeof window !== 'undefined' ? window : null);
    const cache = options.cache;
    const fetcher = options.fetcher;
    const MutationObserverImpl =
      options.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    const setTimeoutImpl = options.setTimeout || setTimeout;
    const clearTimeoutImpl = options.clearTimeout || clearTimeout;

    let enabled = true;
    let allowedHandles = null;
    let cachedOwnerHandle = null;
    let chatContainer = null;
    let observer = null;
    let initTimer = null;
    let ownerRetryTimer = null;
    let initRetries = 0;
    let ownerRetries = 0;
    let stopped = false;

    function getCurrentChannelHandle() {
      const detected = extractCurrentChannelHandle(win);
      if (detected) {
        cachedOwnerHandle = detected;
      }
      return cachedOwnerHandle;
    }

    function canConvertNow() {
      if (!enabled) return false;
      if (allowedHandles === null) return false;
      if (allowedHandles.length === 0) return true;
      return isConversionAllowed(allowedHandles, getCurrentChannelHandle());
    }

    function processMessage(node) {
      if (!isMessageRenderer(node)) return;
      if (!canConvertNow()) return;

      const authorNameNode = node.querySelector(DOM.AUTHOR_NAME_SELECTOR);
      if (!authorNameNode) return;

      const currentName = getAuthorDisplayText(authorNameNode);
      if (!handleUtils.isValidHandle(currentName)) return;

      const syncCachedName = cache.getSync(currentName);
      if (syncCachedName) {
        updateAuthorNode(authorNameNode, currentName, syncCachedName);
        return;
      }

      fetcher.resolveChannelName(currentName).then((resolvedName) => {
        if (stopped || !resolvedName || !canConvertNow()) return;
        updateAuthorNode(authorNameNode, currentName, resolvedName);
      });
    }

    function processExistingMessages() {
      if (!chatContainer || !canConvertNow()) return;
      const nodes = chatContainer.querySelectorAll(DOM.MESSAGE_RENDERER_SELECTOR);
      nodes.forEach((node) => processMessage(node));
    }

    function revertConvertedMessages() {
      if (!chatContainer) return;
      const selector = `${DOM.AUTHOR_NAME_SELECTOR}[${DOM.ORIGINAL_HANDLE_ATTR}]`;
      const nodes = chatContainer.querySelectorAll(selector);
      nodes.forEach((authorNode) => revertAuthorNode(authorNode));
    }

    function scheduleOwnerDetectionIfNeeded() {
      if (stopped || !allowedHandles || allowedHandles.length === 0) return;
      if (getCurrentChannelHandle()) return;
      if (ownerRetryTimer !== null || ownerRetries >= OBSERVER.MAX_OWNER_RETRIES) return;

      ownerRetryTimer = setTimeoutImpl(() => {
        ownerRetryTimer = null;
        ownerRetries++;
        if (getCurrentChannelHandle()) {
          applyCurrentSettings();
        } else {
          scheduleOwnerDetectionIfNeeded();
        }
      }, OBSERVER.OWNER_RETRY_INTERVAL_MS);
    }

    function applyCurrentSettings() {
      if (allowedHandles === null) return;

      if (canConvertNow()) {
        processExistingMessages();
      } else {
        revertConvertedMessages();
        if (enabled) {
          scheduleOwnerDetectionIfNeeded();
        }
      }
    }

    function setEnabled(nextEnabled) {
      enabled = nextEnabled !== false;
      applyCurrentSettings();
    }

    function setAllowedHandles(handles) {
      allowedHandles = Array.isArray(handles) ? handles.slice() : [];
      ownerRetries = 0;
      applyCurrentSettings();
    }

    function handleMutations(mutations) {
      if (stopped || !canConvertNow()) return;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;

          if (isMessageRenderer(node)) {
            processMessage(node);
          } else if (typeof node.querySelectorAll === 'function') {
            const nested = node.querySelectorAll(DOM.MESSAGE_RENDERER_SELECTOR);
            nested.forEach((childNode) => processMessage(childNode));
          }
        }
      }
    }

    function attachObserver() {
      if (stopped || !doc) return;

      const container = findChatContainer(doc);
      if (!container) {
        if (initRetries < OBSERVER.MAX_INIT_RETRIES) {
          initRetries++;
          initTimer = setTimeoutImpl(attachObserver, OBSERVER.INIT_RETRY_INTERVAL_MS);
        }
        return;
      }

      chatContainer = container;
      if (observer) {
        observer.disconnect();
      }

      if (MutationObserverImpl) {
        observer = new MutationObserverImpl(handleMutations);
        observer.observe(chatContainer, { childList: true });
      }

      applyCurrentSettings();
    }

    function start() {
      stopped = false;
      initRetries = 0;
      attachObserver();
    }

    function stop() {
      stopped = true;
      if (initTimer !== null) {
        clearTimeoutImpl(initTimer);
        initTimer = null;
      }
      if (ownerRetryTimer !== null) {
        clearTimeoutImpl(ownerRetryTimer);
        ownerRetryTimer = null;
      }
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }

    return {
      start,
      stop,
      setEnabled,
      setAllowedHandles,
      getCurrentChannelHandle,
      canConvertNow,
      processMessage,
      processExistingMessages,
      revertConvertedMessages,
    };
  }

  return Object.freeze({
    isMessageRenderer,
    findChatContainer,
    extractCurrentChannelHandle,
    isConversionAllowed,
    updateAuthorNode,
    revertAuthorNode,
    createChatController,
  });
});
