const BASE = 'http://127.0.0.1:11434';

// Rewrite the Origin header on requests to Ollama — chrome-extension:// is rejected by Ollama
chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [1],
  addRules: [{
    id: 1,
    priority: 1,
    condition: { requestDomains: ['127.0.0.1'], requestMethods: ['post', 'put', 'delete'] },
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'Origin', operation: 'set', value: BASE }]
    }
  }]
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'chat.html' });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'fetch') return;
  fetch(BASE + msg.path, msg.opts)
    .then(async r => {
      sendResponse({ ok: r.ok, status: r.status, text: await r.text() });
    })
    .catch(e => sendResponse({ error: e.message }));
  return true;
});
