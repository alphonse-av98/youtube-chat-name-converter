'use strict';

(function (root) {
  const ns = root.YCNC;
  if (!ns || !ns.constants || !ns.handle || !ns.storage) {
    return;
  }

  const { STORAGE_KEYS, MESSAGES } = ns.constants;
  const { normalizeHandleKey } = ns.handle;
  const { getEnabled, setEnabled, getTargetHandles, setTargetHandles, getCacheStats, isCacheKey } =
    ns.storage;

  const statusBadgeEl = document.getElementById('statusBadge');
  const enabledToggleEl = document.getElementById('enabledToggle');
  const toggleHintEl = document.getElementById('toggleHint');
  const currentChannelSectionEl = document.getElementById('currentChannelSection');
  const currentChannelHandleEl = document.getElementById('currentChannelHandle');
  const currentChannelStatusEl = document.getElementById('currentChannelStatus');
  const toggleChannelBtn = document.getElementById('toggleChannelBtn');
  const scopeSummaryEl = document.getElementById('scopeSummary');
  const cacheCountEl = document.getElementById('cacheCount');
  const feedbackEl = document.getElementById('feedbackMessage');
  const openOptionsBtn = document.getElementById('openOptionsBtn');

  let currentEnabled = true;
  let savedHandles = [];
  let activeChannelHandle = null;
  let feedbackTimer = null;

  function showFeedback(message) {
    if (feedbackTimer !== null) {
      clearTimeout(feedbackTimer);
      feedbackTimer = null;
    }
    feedbackEl.textContent = message;
    feedbackEl.hidden = false;
    feedbackTimer = setTimeout(() => {
      feedbackEl.hidden = true;
      feedbackTimer = null;
    }, 3000);
  }

  function isChannelRegistered(handle) {
    if (!handle) return false;
    const key = normalizeHandleKey(handle);
    return savedHandles.some((h) => normalizeHandleKey(h) === key);
  }

  function renderState() {
    enabledToggleEl.checked = currentEnabled;
    statusBadgeEl.textContent = currentEnabled ? '有効' : '停止中';
    statusBadgeEl.className = `status-badge ${currentEnabled ? 'is-active' : 'is-paused'}`;
    toggleHintEl.textContent = currentEnabled
      ? 'ライブチャットの @ハンドル をチャンネル名に変換します'
      : '停止中です（チャット欄は元のハンドル表示に戻ります）';

    scopeSummaryEl.textContent =
      savedHandles.length === 0 ? 'すべてのチャンネル' : `${savedHandles.length} チャンネルに制限中`;

    if (!activeChannelHandle) {
      currentChannelSectionEl.hidden = true;
      return;
    }

    currentChannelSectionEl.hidden = false;
    currentChannelHandleEl.textContent = activeChannelHandle;

    const registered = isChannelRegistered(activeChannelHandle);
    if (!currentEnabled) {
      currentChannelStatusEl.textContent = '全体の変換がオフのため停止中です。';
    } else if (savedHandles.length === 0) {
      currentChannelStatusEl.textContent = '現在このチャンネルで変換中です（全チャンネル対象）。';
    } else if (registered) {
      currentChannelStatusEl.textContent = '対象リストに登録されているため変換中です。';
    } else {
      currentChannelStatusEl.textContent = '対象リスト未登録のため、このチャンネルでは停止中です。';
    }

    if (registered) {
      toggleChannelBtn.textContent = '対象リストから削除';
    } else if (savedHandles.length === 0) {
      toggleChannelBtn.textContent = 'このチャンネルだけ対象にする';
    } else {
      toggleChannelBtn.textContent = '対象リストに追加';
    }
  }

  function queryActiveTabChannel() {
    if (
      typeof chrome === 'undefined' ||
      !chrome.tabs ||
      typeof chrome.tabs.query !== 'function' ||
      typeof chrome.tabs.sendMessage !== 'function'
    ) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if ((chrome.runtime && chrome.runtime.lastError) || !tabs || !tabs[0] || tabs[0].id == null) {
          resolve(null);
          return;
        }

        chrome.tabs.sendMessage(tabs[0].id, { type: MESSAGES.GET_CONTEXT }, (response) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(response && response.channelHandle ? response.channelHandle : null);
        });
      });
    });
  }

  async function refreshCacheCount() {
    try {
      const { count } = await getCacheStats();
      cacheCountEl.textContent = `${count} 件`;
    } catch {
      cacheCountEl.textContent = '-';
    }
  }

  async function init() {
    try {
      const [enabled, handles, detectedChannel] = await Promise.all([
        getEnabled(),
        getTargetHandles(),
        queryActiveTabChannel(),
      ]);
      currentEnabled = enabled;
      savedHandles = handles;
      activeChannelHandle = detectedChannel;
      renderState();
    } catch (err) {
      console.error('[YCNC] Failed to initialize popup:', err);
    }

    await refreshCacheCount();
  }

  enabledToggleEl.addEventListener('change', async () => {
    const nextEnabled = enabledToggleEl.checked;
    enabledToggleEl.disabled = true;
    try {
      await setEnabled(nextEnabled);
      currentEnabled = nextEnabled;
      renderState();
      showFeedback(nextEnabled ? '変換を有効にしました。' : '変換を一時停止しました。');
    } catch (err) {
      console.error('[YCNC] Failed to toggle enabled state:', err);
      enabledToggleEl.checked = currentEnabled;
    } finally {
      enabledToggleEl.disabled = false;
    }
  });

  toggleChannelBtn.addEventListener('click', async () => {
    if (!activeChannelHandle) return;
    toggleChannelBtn.disabled = true;

    const key = normalizeHandleKey(activeChannelHandle);
    const registered = isChannelRegistered(activeChannelHandle);
    const nextHandles = registered
      ? savedHandles.filter((h) => normalizeHandleKey(h) !== key)
      : [...savedHandles, activeChannelHandle];

    try {
      await setTargetHandles(nextHandles);
      savedHandles = nextHandles;
      renderState();
      showFeedback(
        registered
          ? `${activeChannelHandle} を対象リストから削除しました。`
          : `${activeChannelHandle} を対象リストに追加しました。`
      );
    } catch (err) {
      console.error('[YCNC] Failed to update target handles:', err);
    } finally {
      toggleChannelBtn.disabled = false;
    }
  });

  openOptionsBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  });

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;

      let needsRender = false;
      if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEYS.ENABLED)) {
        currentEnabled = changes[STORAGE_KEYS.ENABLED].newValue !== false;
        needsRender = true;
      }
      if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEYS.TARGET_HANDLES)) {
        const next = changes[STORAGE_KEYS.TARGET_HANDLES].newValue;
        savedHandles = Array.isArray(next) ? next : [];
        needsRender = true;
      }
      if (needsRender) {
        renderState();
      }

      const cacheChanged = Object.keys(changes).some(
        (key) => isCacheKey(key) || key === STORAGE_KEYS.CACHE_CLEARED_AT
      );
      if (cacheChanged) {
        refreshCacheCount();
      }
    });
  }

  init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
