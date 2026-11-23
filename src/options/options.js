'use strict';

(function (root) {
  const ns = root.YCNC;
  if (!ns || !ns.constants || !ns.handle || !ns.storage) {
    return;
  }

  const { STORAGE_KEYS } = ns.constants;
  const { parseHandleInput, normalizeHandleKey, buildChannelUrl } = ns.handle;
  const {
    getEnabled,
    setEnabled,
    getTargetHandles,
    setTargetHandles,
    getCacheStats,
    clearAllCache,
    isCacheKey,
  } = ns.storage;

  const statusMessageEl = document.getElementById('statusMessage');
  const enabledToggleEl = document.getElementById('enabledToggle');
  const enabledDescriptionEl = document.getElementById('enabledDescription');
  const cacheCountEl = document.getElementById('cacheCount');
  const cacheActionsEl = document.getElementById('cacheActions');
  const clearCacheBtn = document.getElementById('clearCacheBtn');
  const clearConfirmRowEl = document.getElementById('clearConfirmRow');
  const confirmClearCacheBtn = document.getElementById('confirmClearCacheBtn');
  const cancelClearCacheBtn = document.getElementById('cancelClearCacheBtn');
  const addHandleForm = document.getElementById('addHandleForm');
  const newHandleInput = document.getElementById('newHandleInput');
  const formErrorEl = document.getElementById('formError');
  const handleListEl = document.getElementById('handleList');

  let savedHandles = [];
  let statusHideTimer = null;

  function showStatus(message, type = 'success') {
    if (statusHideTimer !== null) {
      clearTimeout(statusHideTimer);
      statusHideTimer = null;
    }
    statusMessageEl.textContent = message;
    statusMessageEl.className = `status-message is-${type}`;
    statusMessageEl.hidden = false;

    statusHideTimer = setTimeout(() => {
      statusMessageEl.hidden = true;
      statusHideTimer = null;
    }, 4000);
  }

  function showFormError(message) {
    formErrorEl.textContent = message;
    formErrorEl.hidden = false;
  }

  function clearFormError() {
    formErrorEl.textContent = '';
    formErrorEl.hidden = true;
  }

  function setClearConfirmVisible(visible) {
    cacheActionsEl.hidden = visible;
    clearConfirmRowEl.hidden = !visible;
  }

  function renderHandleList() {
    handleListEl.textContent = '';

    if (savedHandles.length === 0) {
      const li = document.createElement('li');
      li.className = 'handle-item is-empty';
      li.textContent = '登録なし（すべてのチャンネルで有効）';
      handleListEl.appendChild(li);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const handle of savedHandles) {
      const li = document.createElement('li');
      li.className = 'handle-item';

      const link = document.createElement('a');
      link.className = 'handle-link';
      link.textContent = handle;
      link.href = buildChannelUrl(handle) || `https://www.youtube.com/${handle}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-danger btn-sm';
      deleteBtn.textContent = '削除';
      deleteBtn.setAttribute('aria-label', `${handle} を削除`);
      deleteBtn.addEventListener('click', () => handleRemove(handle));

      li.appendChild(link);
      li.appendChild(deleteBtn);
      fragment.appendChild(li);
    }

    handleListEl.appendChild(fragment);
  }

  async function refreshCacheStats() {
    try {
      const { count, totalCount } = await getCacheStats();
      cacheCountEl.textContent = `${count} 件`;
      clearCacheBtn.disabled = totalCount === 0;
    } catch (err) {
      console.error('[YCNC] Failed to read cache stats:', err);
      cacheCountEl.textContent = '取得失敗';
    }
  }

  function renderEnabledState(enabled) {
    if (!enabledToggleEl) return;
    enabledToggleEl.checked = enabled;
    if (enabledDescriptionEl) {
      enabledDescriptionEl.textContent = enabled
        ? '現在オンです。ライブチャットのハンドルネームをチャンネル名に変換します。'
        : '現在オフです。変換を一時停止しています。';
    }
  }

  async function loadEnabledState() {
    try {
      const enabled = await getEnabled();
      renderEnabledState(enabled);
    } catch (err) {
      console.error('[YCNC] Failed to load enabled state:', err);
    }
  }

  async function loadHandles() {
    try {
      savedHandles = await getTargetHandles();
      renderHandleList();
    } catch (err) {
      console.error('[YCNC] Failed to load target handles:', err);
      showStatus('設定の読み込みに失敗しました。', 'error');
    }
  }

  async function handleRemove(handleToRemove) {
    const targetKey = normalizeHandleKey(handleToRemove);
    const nextHandles = savedHandles.filter((h) => normalizeHandleKey(h) !== targetKey);
    try {
      await setTargetHandles(nextHandles);
      savedHandles = nextHandles;
      renderHandleList();
      showStatus(`${handleToRemove} を削除しました。`);
    } catch (err) {
      console.error('[YCNC] Failed to remove handle:', err);
      showStatus('削除の保存に失敗しました。', 'error');
    }
  }

  async function handleAddSubmit(event) {
    event.preventDefault();
    clearFormError();

    const parsed = parseHandleInput(newHandleInput.value);
    if (!parsed) {
      showFormError('有効なハンドルネーム（例: @youtube）またはチャンネルURLを入力してください。');
      newHandleInput.focus();
      return;
    }

    const normalizedNew = normalizeHandleKey(parsed);
    const alreadyExists = savedHandles.some((h) => normalizeHandleKey(h) === normalizedNew);
    if (alreadyExists) {
      showFormError(`${parsed} はすでに登録されています。`);
      newHandleInput.focus();
      return;
    }

    const nextHandles = [...savedHandles, parsed];
    try {
      await setTargetHandles(nextHandles);
      savedHandles = nextHandles;
      newHandleInput.value = '';
      renderHandleList();
      showStatus(`${parsed} を追加しました。`);
    } catch (err) {
      console.error('[YCNC] Failed to add handle:', err);
      showStatus('設定の保存に失敗しました。', 'error');
    }
  }

  async function handleClearCacheConfirm() {
    confirmClearCacheBtn.disabled = true;
    try {
      const removedCount = await clearAllCache();
      setClearConfirmVisible(false);
      await refreshCacheStats();
      showStatus(`${removedCount} 件のキャッシュを削除しました。`);
    } catch (err) {
      console.error('[YCNC] Failed to clear cache:', err);
      showStatus('キャッシュの削除に失敗しました。', 'error');
    } finally {
      confirmClearCacheBtn.disabled = false;
    }
  }

  if (enabledToggleEl) {
    enabledToggleEl.addEventListener('change', async () => {
      const nextEnabled = enabledToggleEl.checked;
      enabledToggleEl.disabled = true;
      try {
        await setEnabled(nextEnabled);
        renderEnabledState(nextEnabled);
        showStatus(nextEnabled ? '自動変換をオンにしました。' : '自動変換をオフにしました。');
      } catch (err) {
        console.error('[YCNC] Failed to save enabled state:', err);
        enabledToggleEl.checked = !nextEnabled;
        showStatus('設定の保存に失敗しました。', 'error');
      } finally {
        enabledToggleEl.disabled = false;
      }
    });
  }

  clearCacheBtn.addEventListener('click', () => setClearConfirmVisible(true));
  cancelClearCacheBtn.addEventListener('click', () => setClearConfirmVisible(false));
  confirmClearCacheBtn.addEventListener('click', handleClearCacheConfirm);
  addHandleForm.addEventListener('submit', handleAddSubmit);
  newHandleInput.addEventListener('input', clearFormError);

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;

      if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEYS.ENABLED)) {
        renderEnabledState(changes[STORAGE_KEYS.ENABLED].newValue !== false);
      }

      if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEYS.TARGET_HANDLES)) {
        const next = changes[STORAGE_KEYS.TARGET_HANDLES].newValue;
        savedHandles = Array.isArray(next) ? next : [];
        renderHandleList();
      }

      const cacheChanged = Object.keys(changes).some(
        (key) => isCacheKey(key) || key === STORAGE_KEYS.CACHE_CLEARED_AT
      );
      if (cacheChanged) {
        refreshCacheStats();
      }
    });
  }

  loadEnabledState();
  loadHandles();
  refreshCacheStats();
})(typeof globalThis !== 'undefined' ? globalThis : this);
