let BASE = 'http://127.0.0.1:11434';

// Initialize declarativeNetRequest with default port
updateOriginRule(BASE);

function updateOriginRule(baseUrl) {
  const hostname = new URL(baseUrl).hostname;
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      condition: { requestDomains: [hostname], requestMethods: ['post', 'put', 'delete'] },
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'Origin', operation: 'set', value: baseUrl }]
      }
    }]
  });
}

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'chat.html' });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'update-port') {
    BASE = msg.baseUrl;
    updateOriginRule(BASE);
    sendResponse({ ok: true });
    return false; // synchronous
  }
  if (msg.type !== 'fetch') return false;
  fetch(msg.url, msg.opts)
    .then(async r => {
      sendResponse({ ok: r.ok, status: r.status, text: await r.text() });
    })
    .catch(e => sendResponse({ error: e.message }));
  return true;
});
