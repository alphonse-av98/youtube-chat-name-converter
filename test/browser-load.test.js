'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');

test('browser-load: all manifest content_scripts load cleanly in order without module/exports', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'manifest.json'), 'utf8'));
  const scripts = manifest.content_scripts[0].js;
  assert.ok(Array.isArray(scripts) && scripts.length > 0);

  const storageListeners = [];
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    window: {
      location: { href: 'https://www.youtube.com/live_chat?v=test' },
      addEventListener() {},
      parent: null,
    },
    document: {
      readyState: 'loading',
      addEventListener() {},
      querySelector() {
        return null;
      },
    },
    chrome: {
      storage: {
        local: {
          get(_keys, cb) {
            cb({});
          },
          set(_items, cb) {
            cb();
          },
          remove(_keys, cb) {
            cb();
          },
        },
        onChanged: {
          addListener(fn) {
            storageListeners.push(fn);
          },
        },
      },
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const context = vm.createContext(sandbox);
  for (const relPath of scripts) {
    const fullPath = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(fullPath), `Missing script in manifest: ${relPath}`);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(code, context, { filename: relPath });
  }

  assert.ok(sandbox.YCNC);
  assert.ok(sandbox.YCNC.constants);
  assert.ok(sandbox.YCNC.handle);
  assert.ok(sandbox.YCNC.storage);
  assert.ok(sandbox.YCNC.cache);
  assert.ok(sandbox.YCNC.fetcher);
  assert.ok(sandbox.YCNC.chat);
});

test('browser-load: options.html script tags exist and load cleanly in order', () => {
  const html = fs.readFileSync(path.join(ROOT_DIR, 'options.html'), 'utf8');
  const scriptMatches = Array.from(html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)).map(
    (m) => m[1]
  );
  assert.ok(scriptMatches.length >= 4);

  const elements = new Map();
  function getOrCreateEl(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        textContent: '',
        className: '',
        value: '',
        hidden: false,
        disabled: false,
        addEventListener() {},
        appendChild() {},
        focus() {},
      });
    }
    return elements.get(id);
  }

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    document: {
      getElementById: getOrCreateEl,
      createElement() {
        return {
          className: '',
          textContent: '',
          href: '',
          target: '',
          rel: '',
          type: '',
          setAttribute() {},
          addEventListener() {},
          appendChild() {},
        };
      },
      createDocumentFragment() {
        return { appendChild() {} };
      },
    },
    chrome: {
      storage: {
        local: {
          get(_keys, cb) {
            cb({});
          },
          set(_items, cb) {
            cb();
          },
          remove(_keys, cb) {
            cb();
          },
        },
        onChanged: {
          addListener() {},
        },
      },
    },
  };
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  for (const relPath of scriptMatches) {
    const fullPath = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(fullPath), `Missing script in options.html: ${relPath}`);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(code, context, { filename: relPath });
  }

  assert.ok(sandbox.YCNC.storage);
});

test('browser-load: manifest icons exist and popup.html scripts load cleanly in order', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'manifest.json'), 'utf8'));

  for (const iconPath of Object.values(manifest.icons || {})) {
    assert.ok(fs.existsSync(path.join(ROOT_DIR, iconPath)), `Missing icon: ${iconPath}`);
  }
  for (const iconPath of Object.values((manifest.action && manifest.action.default_icon) || {})) {
    assert.ok(fs.existsSync(path.join(ROOT_DIR, iconPath)), `Missing action icon: ${iconPath}`);
  }

  const popupPath = path.join(ROOT_DIR, manifest.action.default_popup);
  assert.ok(fs.existsSync(popupPath), `Missing popup file: ${manifest.action.default_popup}`);

  const html = fs.readFileSync(popupPath, 'utf8');
  const scriptMatches = Array.from(html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)).map(
    (m) => m[1]
  );
  assert.ok(scriptMatches.length >= 4);

  const elements = new Map();
  function getOrCreateEl(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        textContent: '',
        className: '',
        checked: false,
        hidden: false,
        disabled: false,
        addEventListener() {},
      });
    }
    return elements.get(id);
  }

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    document: {
      getElementById: getOrCreateEl,
    },
    chrome: {
      runtime: {
        openOptionsPage() {},
      },
      tabs: {
        query(_q, cb) {
          cb([{ id: 1 }]);
        },
        sendMessage(_tabId, _msg, cb) {
          cb({ channelHandle: '@youtube', isActive: true });
        },
      },
      storage: {
        local: {
          get(_keys, cb) {
            cb({});
          },
          set(_items, cb) {
            cb();
          },
          remove(_keys, cb) {
            cb();
          },
        },
        onChanged: {
          addListener() {},
        },
      },
    },
  };
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  for (const relPath of scriptMatches) {
    const fullPath = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(fullPath), `Missing script in popup.html: ${relPath}`);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(code, context, { filename: relPath });
  }

  assert.ok(sandbox.YCNC.storage);

  // Guard against CSS display rules overriding the HTML [hidden] attribute
  const optionsCss = fs.readFileSync(path.join(ROOT_DIR, 'options.css'), 'utf8');
  const popupCss = fs.readFileSync(path.join(ROOT_DIR, 'popup.css'), 'utf8');
  assert.match(optionsCss, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/i);
  assert.match(popupCss, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/i);
});
