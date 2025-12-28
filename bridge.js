// 拡張機能（設定画面など）からのメッセージを受け取り、MAINワールドのcontent.jsへイベントとして転送する
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'YCNC_clearCache') {
    document.dispatchEvent(new CustomEvent('YCNC_Command', {
      detail: { 
        command: 'clearCache'
      }
    }));
  }
});

// 設定（対象チャンネルID）をcontent.jsへ送信する関数
function sendConfig(handles) {
  document.dispatchEvent(new CustomEvent('YCNC_ConfigUpdate', { detail: { handles } }));
}

// 初期ロード時に設定を送信
chrome.storage.local.get(['targetHandles'], (result) => {
  sendConfig(result.targetHandles || []);
});

// 設定変更時に新しい設定を送信
chrome.storage.onChanged.addListener((changes) => {
  if (changes.targetHandles) {
    sendConfig(changes.targetHandles.newValue);
  }
});