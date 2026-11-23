'use strict';

(function (root, factory) {
  const exportsObj = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  } else {
    root.YCNC = root.YCNC || {};
    root.YCNC.handle = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const NAMED_ENTITIES = Object.freeze({
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: '\u00A0',
  });

  const ENTITY_PATTERN = /&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/g;

  /**
   * Safely decodes percent-encoded strings without throwing on malformed sequences.
   * @param {string} value
   * @returns {string}
   */
  function safeDecodeURIComponent(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  /**
   * Extracts a YouTube handle (e.g. "@youtube") from a handle string, relative path,
   * or full YouTube channel URL. Returns null if invalid.
   * @param {string} input
   * @returns {string | null}
   */
  function parseHandleInput(input) {
    if (typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed) return null;

    let candidate = trimmed;

    // Accept full YouTube URLs such as https://www.youtube.com/@handle/streams
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const url = new URL(trimmed);
        if (!/(^|\.)youtube\.com$/i.test(url.hostname)) {
          return null;
        }
        candidate = url.pathname;
      } catch {
        return null;
      }
    }

    // Strip leading slashes, trailing path segments, query strings, and fragments
    candidate = candidate.replace(/^\/+/, '');
    candidate = candidate.split(/[/?#]/)[0];
    candidate = safeDecodeURIComponent(candidate).trim();

    if (!isValidHandle(candidate)) {
      return null;
    }

    return candidate;
  }

  /**
   * Checks whether a string is a valid YouTube handle (starts with "@" and contains no whitespace).
   * @param {string} value
   * @returns {boolean}
   */
  function isValidHandle(value) {
    if (typeof value !== 'string') return false;
    return value.length > 1 && value.startsWith('@') && !/\s/.test(value);
  }

  /**
   * Normalizes a handle for case-insensitive comparison and cache keys.
   * @param {string} handle
   * @returns {string}
   */
  function normalizeHandleKey(handle) {
    if (typeof handle !== 'string') return '';
    return safeDecodeURIComponent(handle).trim().toLowerCase();
  }

  /**
   * Builds a safe YouTube channel URL for a handle (preserving literal "@" and encoding the rest).
   * @param {string} handle
   * @param {string} [origin='https://www.youtube.com']
   * @returns {string | null}
   */
  function buildChannelUrl(handle, origin = 'https://www.youtube.com') {
    const parsed = parseHandleInput(handle);
    if (!parsed) return null;
    const slug = parsed.slice(1);
    return `${origin}/@${encodeURIComponent(slug)}`;
  }

  /**
   * Decodes common named and numeric HTML entities in a single pass (Trusted Types safe).
   * @param {string} text
   * @returns {string}
   */
  function decodeHtmlEntities(text) {
    if (typeof text !== 'string' || !text.includes('&')) {
      return text || '';
    }

    return text.replace(ENTITY_PATTERN, (match, token) => {
      if (token.startsWith('#x') || token.startsWith('#X')) {
        const codePoint = Number.parseInt(token.slice(2), 16);
        if (Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
          return String.fromCodePoint(codePoint);
        }
        return match;
      }

      if (token.startsWith('#')) {
        const codePoint = Number.parseInt(token.slice(1), 10);
        if (Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
          return String.fromCodePoint(codePoint);
        }
        return match;
      }

      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, token)
        ? NAMED_ENTITIES[token]
        : match;
    });
  }

  return Object.freeze({
    safeDecodeURIComponent,
    parseHandleInput,
    isValidHandle,
    normalizeHandleKey,
    buildChannelUrl,
    decodeHtmlEntities,
  });
});
