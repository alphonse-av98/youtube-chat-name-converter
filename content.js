// チャンネル名のキャッシュ
const nameCache = new Map();
// 重複リクエスト防止用のPromiseキャッシュ
const fetchPromises = new Map();
// リクエストキューと同時実行制御
const requestQueue = [];
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 5;
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30日（約1ヶ月）
let allowedHandles = null; // 許可されたハンドルネームリスト（初期値null: 未ロード）
let isConfigLoaded = false; // 設定読み込み済みフラグ

// 実際のネットワーク取得処理を行う関数
async function performFetch(handle) {
  try {
    // チャンネルページをフェッチ
    const response = await fetch(`https://www.youtube.com/${handle}`);
    const text = await response.text();
    
    // タイトルタグを抽出 (<title>チャンネル名 - YouTube</title>)
    // Trusted Types対策のためDOMParserではなく正規表現を使用
    const titleMatch = text.match(/<title>(.*?)<\/title>/);
    let title = titleMatch ? titleMatch[1] : null;
    
    if (title) {
      // HTMLエンティティのデコード
      title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

      // " - YouTube" を削除してチャンネル名のみにする
      const channelName = title.replace(/ - YouTube$/, '');
      nameCache.set(handle, channelName);

      // ローカルストレージに保存 (YCNC:プレフィックスを使用)
      try {
        const cacheData = {
          name: channelName,
          timestamp: Date.now()
        };
        localStorage.setItem(`YCNC:${handle}`, JSON.stringify(cacheData));
      } catch (e) {
        console.warn('[YCNC] Failed to save to localStorage:', e);
      }

      return channelName;
    }
  } catch (error) {
    console.error(`[YCNC] Failed to fetch channel name for ${handle}:`, error);
  }
  return null;
}

// キューを処理する関数
async function processQueue() {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS || requestQueue.length === 0) return;

  activeRequests++;
  const { handle, resolve } = requestQueue.shift();

  try {
    const result = await performFetch(handle);
    resolve(result);
  } finally {
    activeRequests--;
    processQueue();
  }
}

// チャンネルページから名前を取得する関数
async function getChannelName(handle) {
  if (nameCache.has(handle)) {
    return nameCache.get(handle);
  }

  // ローカルストレージから取得
  const storedData = localStorage.getItem(`YCNC:${handle}`);
  if (storedData) {
    try {
      const parsedData = JSON.parse(storedData);
      // 有効期限内かつデータが正常なら使用
      if (parsedData && parsedData.name && parsedData.timestamp && (Date.now() - parsedData.timestamp < CACHE_TTL)) {
        nameCache.set(handle, parsedData.name);

        // 最終利用日時を更新して有効期限を延長する
        try {
          const updatedData = {
            name: parsedData.name,
            timestamp: Date.now()
          };
          localStorage.setItem(`YCNC:${handle}`, JSON.stringify(updatedData));
        } catch (e) {
          // 更新失敗時は無視
        }

        return parsedData.name;
      }
    } catch (e) {
      // パースエラー（古い形式など）の場合は再取得へ進む
    }
  }
  
  if (fetchPromises.has(handle)) {
    return fetchPromises.get(handle);
  }

  const promise = new Promise((resolve) => {
    requestQueue.push({ handle, resolve });
    processQueue();
  });

  fetchPromises.set(handle, promise);
  return promise;
}

// DOMを更新する関数
function updateAuthorNode(authorNameNode, handle, originalName) {
  // 名前が既に変更されていないか確認
  if (authorNameNode.textContent.trim() !== handle) {
    return;
  }

  // 名前を置き換える
  authorNameNode.textContent = originalName;

  // 元のハンドルをツールチップとして設定
  authorNameNode.setAttribute('title', handle);
}

// 期限切れのキャッシュを削除する関数
function cleanupExpiredCache() {
  const now = Date.now();
  let removedCount = 0;
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('YCNC:')) {
      try {
        const item = localStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item);
          if (parsed && parsed.timestamp && (now - parsed.timestamp > CACHE_TTL)) {
            localStorage.removeItem(key);
            removedCount++;
          }
        }
      } catch (e) {
        // エラー時は無視
      }
    }
  }
  if (removedCount > 0) {
  }
}

// キャッシュクリア機能
window.YCNC_clearCache = function() {
  nameCache.clear();
  fetchPromises.clear();
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('YCNC:')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  console.log('[YCNC] Cache cleared.');
};

// 設定画面からのコマンドを受け取るリスナー
document.addEventListener('YCNC_Command', (e) => {
  if (!e.detail) return;
  const { command } = e.detail;
  if (command === 'clearCache') {
    if (typeof window.YCNC_clearCache === 'function') window.YCNC_clearCache();
  }
});

// 設定（対象チャンネルリスト）を受け取るリスナー
document.addEventListener('YCNC_ConfigUpdate', (e) => {
  allowedHandles = e.detail.handles || [];
  isConfigLoaded = true;
  applySettings();
});

// 設定とハンドルネームが揃った場合に適用する関数
function applySettings() {
  // 設定が未ロード、または（制限あり設定なのに）ハンドルネームが未特定の場合は何もしない
  if (allowedHandles === null) return;

  const chatItems = document.querySelector('#items');
  if (chatItems) {
    const selector = 'yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-membership-item-renderer';
    chatItems.querySelectorAll(selector).forEach(node => {
      if (isConversionAllowed()) processMessage(node);
    });
  }
}

// チャットメッセージを処理する関数
function processMessage(node) {
  // テキストメッセージ、Super Chat、メンバーシップ加入メッセージを対象とする
  // タグ名が小文字の場合もあるため、toUpperCase()で正規化して比較
  const tagName = node.tagName.toUpperCase();
  if (tagName !== 'YT-LIVE-CHAT-TEXT-MESSAGE-RENDERER' && tagName !== 'YT-LIVE-CHAT-PAID-MESSAGE-RENDERER' && tagName !== 'YT-LIVE-CHAT-MEMBERSHIP-ITEM-RENDERER') {
    return;
  }

  const authorNameNode = node.querySelector('#author-name');

  if (authorNameNode) {
    const currentName = authorNameNode.textContent.trim();

    // 現在の名前がハンドル(@で始まる)の場合
    if (currentName.startsWith('@')) {
      // キャッシュにあれば即座に更新
      if (nameCache.has(currentName)) {
        updateAuthorNode(authorNameNode, currentName, nameCache.get(currentName));
      } else {
        // なければ取得してから更新
        getChannelName(currentName).then((originalName) => {
          if (originalName && originalName !== currentName) {
            updateAuthorNode(authorNameNode, currentName, originalName);
          }
        });
      }
    }
  }
}

// 現在の配信者のハンドルネームを取得する関数
function getCurrentChannelHandle() {
  try {
    // 親ウィンドウ（動画視聴ページ）のDOMから取得を試みる
    // ※iframe内から親へのアクセスは同一オリジン(youtube.com)であるため可能
    const doc = window.parent.document;
    
    // 動画オーナーのリンク（/@handle形式）を探す
    const ownerLink = doc.querySelector('#owner #channel-name a[href^="/@"]');
    if (ownerLink) {
      const href = ownerLink.getAttribute('href');
      // "/@handle" -> "@handle"
      return href.substring(1);
    }
  } catch (e) {
    // ポップアップチャットやクロスオリジン制限などでアクセスできない場合
  }
  return null;
}

// 動作が許可されているか確認する関数
function isConversionAllowed() {
  // 設定がまだ読み込まれていない場合は、一旦無効とする（意図しないチャンネルでの動作を防ぐため）
  if (allowedHandles === null) return false;

  // リストが空なら全チャンネルで許可
  if (allowedHandles.length === 0) return true;
  
  const currentHandle = getCurrentChannelHandle();
  // 登録されたハンドルネームリストに含まれているか確認
  return currentHandle && allowedHandles.includes(currentHandle);
}

// チャットリストの監視を開始する関数
function startObserver() {
  // チャットのiframe内（URLにlive_chatが含まれる）でのみ動作させる
  if (!window.location.href.includes('live_chat')) {
    return;
  }

  // 起動時に期限切れキャッシュを削除
  cleanupExpiredCache();

  // セレクタを緩和（クラス指定を削除してIDのみにする）
  const chatItems = document.querySelector('#items');
  
  if (!chatItems) {
    // まだチャット欄がロードされていない場合は少し待って再試行
    setTimeout(startObserver, 1000);
    return;
  }

  // 既存のメッセージを処理
  chatItems.querySelectorAll('yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-membership-item-renderer').forEach(node => {
    if (isConversionAllowed()) {
      processMessage(node);
    }
  });

  // 新しいメッセージを監視
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return; // ELEMENT_NODE以外はスキップ

        // 許可されていないチャンネルなら何もしない
        if (!isConversionAllowed()) return;

        // タグ名チェックを先に行い、無駄な処理を省く
        const tagName = node.tagName.toUpperCase();
        if (tagName === 'YT-LIVE-CHAT-TEXT-MESSAGE-RENDERER' || tagName === 'YT-LIVE-CHAT-PAID-MESSAGE-RENDERER' || tagName === 'YT-LIVE-CHAT-MEMBERSHIP-ITEM-RENDERER') {
          processMessage(node);
        } else if (node.querySelectorAll) {
          // コンテナとして追加された場合のみ検索
          node.querySelectorAll('yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-membership-item-renderer')
            .forEach(processMessage);
        }
      });
    });
  });

  observer.observe(chatItems, { childList: true });
}

// ページ読み込み完了時に監視を開始
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserver);
} else {
  startObserver();
}