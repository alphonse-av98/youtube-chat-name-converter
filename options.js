function sendMessageToYouTubeTabs(message) {
  chrome.tabs.query({url: "*://www.youtube.com/*"}, (tabs) => {
    if (tabs.length === 0) {
      alert('YouTubeのタブが見つかりません。YouTubeを開いてから実行してください。');
      return;
    }
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, message);
    });
    alert(`${tabs.length} 個のタブにコマンドを送信しました。`);
  });
}

document.getElementById('clearCacheBtn').addEventListener('click', () => {
  if (confirm('本当にすべてのキャッシュを削除しますか？')) {
    sendMessageToYouTubeTabs({ action: 'YCNC_clearCache' });
  }
});

// ハンドルネームリストの管理
let savedHandles = [];

function renderList() {
  const list = document.getElementById('handleList');
  list.innerHTML = '';
  
  if (savedHandles.length === 0) {
    const li = document.createElement('li');
    li.className = 'handle-item';
    li.textContent = '登録なし（全チャンネルで有効）';
    li.style.color = '#666';
    li.style.fontStyle = 'italic';
    list.appendChild(li);
    return;
  }

  savedHandles.forEach((handle) => {
    const li = document.createElement('li');
    li.className = 'handle-item';
    
    const link = document.createElement('a');
    link.textContent = handle;
    link.href = `https://www.youtube.com/${handle}`;
    link.target = '_blank';
    link.style.textDecoration = 'none';
    link.style.color = 'inherit';
    link.style.cursor = 'pointer';
    link.onmouseover = () => { link.style.color = '#007bff'; link.style.textDecoration = 'underline'; };
    link.onmouseout = () => { link.style.color = 'inherit'; link.style.textDecoration = 'none'; };
    
    const btn = document.createElement('button');
    btn.textContent = '削除';
    btn.className = 'delete-btn';
    btn.addEventListener('click', () => {
      savedHandles = savedHandles.filter(h => h !== handle);
      chrome.storage.local.set({ targetHandles: savedHandles }, renderList);
    });
    
    li.appendChild(link);
    li.appendChild(btn);
    list.appendChild(li);
  });
}

document.getElementById('addHandleBtn').addEventListener('click', () => {
  const input = document.getElementById('newHandleInput');
  const val = input.value.trim();
  
  if (!val) return;
  if (!val.startsWith('@')) {
    alert('ハンドルネームは @ から始めてください');
    return;
  }
  if (savedHandles.includes(val)) {
    alert('すでに登録されています');
    return;
  }
  
  savedHandles.push(val);
  chrome.storage.local.set({ targetHandles: savedHandles }, () => {
    input.value = '';
    renderList();
  });
});

// 初期ロード
chrome.storage.local.get(['targetHandles'], (result) => {
  if (result.targetHandles) {
    savedHandles = result.targetHandles;
  }
  renderList();
});