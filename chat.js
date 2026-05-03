let BASE = 'http://127.0.0.1:11434';
let model = '', streaming = false;
let modelSupportsThinking = false;

// Context window — the single source of truth for all messages.
// Each entry: { role: 'user' | 'assistant', content: string }
// This array is fed to the API on every request to give the model
// full conversation history. It also doubles as the in-memory
// representation that sessions/persistence will serialize later.
let chatMessages = [];

const modelSel = document.getElementById('model');
const dot = document.getElementById('dot');
const status = document.getElementById('status');
const msgs = document.getElementById('msgs');
const input = document.getElementById('input');
const send = document.getElementById('send');
const chatInput = document.getElementById('chat-input');
const translatePanel = document.getElementById('translate-panel');
const trInput = document.getElementById('tr-input');
const trOutput = document.getElementById('tr-output');
const trBtn = document.getElementById('tr-btn');
const trLang = document.getElementById('tr-lang');
const trSrcLang = document.getElementById('tr-src-lang');

// --- Port config elements ---
const portModal = document.getElementById('port-modal');
const portInput = document.getElementById('port-input');
const portCancel = document.getElementById('port-cancel');
const portSave = document.getElementById('port-save');
const statusDiv = document.getElementById('status');
const dotDiv = document.getElementById('dot');

// --- Sidebar elements ---
const sidebarTrigger = document.getElementById('sidebar-trigger');
const sidebar = document.getElementById('sidebar');
const sidebarHistory = document.getElementById('sidebar-history');
const btnAnonymous = document.getElementById('btn-anonymous');
const btnNewChat = document.getElementById('btn-new-chat');
const btnSettings = document.getElementById('btn-settings');

// --- Thinking toggle elements ---
const thinkingToggle = document.getElementById('thinking-toggle');
const thinkingCheckbox = document.getElementById('thinking-checkbox');

// --- Tab switching ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const mode = tab.dataset.tab;
    if (mode === 'chat') {
      msgs.style.display = 'flex';
      chatInput.style.display = 'flex';
      translatePanel.style.display = 'none';
    } else {
      msgs.style.display = 'none';
      chatInput.style.display = 'none';
      translatePanel.style.display = 'flex';
    }
  };
});

// --- API helpers ---
function bgFetch(path, opts = {}) {
  const url = BASE + path;
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'fetch', url, opts }, res => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (res.error) reject(new Error(res.error));
      else resolve(res.text);
    });
  });
}

async function streamFetch(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.body.getReader();
}

// --- Ollama connection ---
async function check() {
  try {
    const txt = await bgFetch('/api/tags');
    const d = JSON.parse(txt);
    dot.className = 'dot green';
    status.textContent = 'Connected';
    modelSel.innerHTML = '';
    (d.models || []).forEach(m => {
      const o = document.createElement('option');
      o.value = m.name;
      o.textContent = m.name;
      modelSel.appendChild(o);
    });
    if (d.models?.length) {
      model = d.models[0].name;
      send.disabled = false;
      trBtn.disabled = false;
      // Check thinking capability for the first model
      checkModelThinkingCapability(model);
    }
  } catch (e) {
    dot.className = 'dot red';
    status.textContent = 'Error: ' + e.message;
  }
}

// --- Port config ---
let currentPort = '11434';
statusDiv.style.cursor = 'pointer';
statusDiv.title = 'Click to change port';
statusDiv.onclick = () => {
  portInput.value = currentPort;
  portModal.classList.add('show');
};
portCancel.onclick = () => { portModal.classList.remove('show'); };
portSave.onclick = () => {
  const val = portInput.value.trim();
  if (val && parseInt(val) > 0 && parseInt(val) <= 65535) {
    currentPort = val;
    // Update BASE URL
    BASE = 'http://127.0.0.1:' + currentPort;
    // Send message to background script to update declarativeNetRequest rule
    chrome.runtime.sendMessage({ type: 'update-port', baseUrl: BASE }, (response) => {
      // Re-check connection with new port
      check();
      portModal.classList.remove('show');
    });
  }
};
// Close modal on overlay click
portModal.onclick = (e) => {
  if (e.target === portModal) portModal.classList.remove('show');
};

modelSel.onchange = () => {
  model = modelSel.value;
  checkModelThinkingCapability(model);
};

// --- Check if model supports thinking ---
async function checkModelThinkingCapability(modelName) {
  if (!modelName) {
    thinkingToggle.style.display = 'none';
    modelSupportsThinking = false;
    return;
  }

  try {
    const body = JSON.stringify({ model: modelName });
    const txt = await bgFetch('/api/show', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    const data = JSON.parse(txt);
    const capabilities = data.capabilities || [];
    modelSupportsThinking = capabilities.includes('thinking');

    if (modelSupportsThinking) {
      thinkingToggle.style.display = 'flex';
      // Default to enabled for thinking-capable models
      thinkingCheckbox.checked = true;
    } else {
      thinkingToggle.style.display = 'none';
      thinkingCheckbox.checked = false;
    }
  } catch (e) {
    console.error('Failed to check model capabilities:', e);
    thinkingToggle.style.display = 'none';
    modelSupportsThinking = false;
  }
}

// --- Streaming response handler ---
function createStreamHandler(onThinking, onContent, onError, onDone) {
  let thinking = '', content = '', thinkStartTime = null, contentStarted = false;

  async function run(reader) {
    const dec = new TextDecoder();
    let buf = '';

    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buf += dec.decode(value, {stream: true});
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const l of lines) {
          if (!l) continue;
          try {
            const j = JSON.parse(l);
            const msg = j.message || {};
            const t = msg.thinking;
            const c = msg.content;
            if (t) {
              if (!thinkStartTime) thinkStartTime = Date.now();
              thinking += t;
              onThinking(thinking);
            }
            if (c) {
              // First content chunk — signal thinking is done, fold it
              if (!contentStarted && thinking) {
                contentStarted = true;
                onThinking(thinking, Date.now() - thinkStartTime, true);
              }
              content += c;
              onContent(content);
            }
          } catch(e) {}
        }
      }
    } catch (e) {
      onError(e.message);
    }
    onDone();
  }

  return { run };
}

// --- Thinking UI helpers ---
function createThinkingBlock(parent) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'margin-bottom:6px;font-size:13px;';

  const header = document.createElement('div');
  header.style.cssText = 'cursor:pointer;color:#888;display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:6px;background:#111;user-select:none;';
  header.textContent = 'Thinking...';

  const body = document.createElement('div');
  body.style.cssText = 'display:block;padding:8px 10px;color:#999;font-size:12px;line-height:1.5;white-space:pre-wrap;border-left:2px solid #333;margin:4px 0 0 4px;';

  let expanded = false, thinkingText = '', thinkTime = 0, folded = false;

  header.onclick = () => {
    if (folded) {
      expanded = !expanded;
      body.style.display = expanded ? 'block' : 'none';
      header.textContent = expanded
        ? `Thought for ${formatTime(thinkTime)} ▲`
        : `Thought for ${formatTime(thinkTime)} ▼`;
    }
  };

  wrapper.appendChild(header);
  wrapper.appendChild(body);
  parent.appendChild(wrapper);

  function formatTime(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return s + 's';
    return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  }

  return {
    updateThinking(text) {
      thinkingText = text;
      body.textContent = text;
      parent.scrollTop = parent.scrollHeight;
    },
    fold(time) {
      folded = true;
      thinkTime = time;
      expanded = false;
      body.style.display = 'none';
      header.textContent = 'Thought for ' + formatTime(time) + ' ▼';
      // 折叠后调整滚动位置到新的底部，避免滚动错乱
      const msgsContainer = wrapper.parentElement;
      if (msgsContainer) {
        msgsContainer.scrollTop = msgsContainer.scrollHeight;
      }
    },
    setFinal() {
      if (!folded) {
        body.style.display = 'none';
        header.textContent = 'Thinking... (no output)';
      }
    }
  };
}

// --- Chat ---
async function sendMsg() {
  const txt = input.value.trim();
  if (!txt || !model || streaming) return;

  // User message
  chatMessages.push({ role: 'user', content: txt });

  const userDiv = document.createElement('div');
  userDiv.className = 'msg user';
  userDiv.textContent = txt;
  msgs.appendChild(userDiv);

  input.value = '';
  streaming = true;
  send.disabled = true;

  // Assistant container
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'align-self:flex-start;max-width:75%;';
  const contentDiv = document.createElement('div');
  contentDiv.className = 'msg assistant';
  contentDiv.style.cssText = 'margin-top:0;';

  // Only create thinking block if thinking is enabled
  const isThinkingEnabled = modelSupportsThinking && thinkingCheckbox.checked;
  let thinkBlock = null;
  if (isThinkingEnabled) {
    thinkBlock = createThinkingBlock(wrapper);
  }
  wrapper.appendChild(contentDiv);
  msgs.appendChild(wrapper);

  let thinkDone = false, assistantContent = '';

  const handler = createStreamHandler(
    (thinking, time, fold) => {
      if (thinkBlock) {
        thinkBlock.updateThinking(thinking);
        if (fold) {
          thinkBlock.fold(time);
          thinkDone = true;
        }
      }
    },
    (content) => {
      assistantContent = content;
      // 实时渲染Markdown为HTML
      const html = renderMarkdown(content);
      contentDiv.innerHTML = html;
      // 渲染其中的KaTeX公式
      renderFormulas(contentDiv);
      // 保持滚动到最新内容
      msgs.scrollTop = msgs.scrollHeight;
    },
    (err) => {
      contentDiv.textContent = 'Error: ' + err;
      contentDiv.className = 'msg error';
    },
    () => {
      if (thinkBlock && !thinkDone) thinkBlock.setFinal();
      // Store complete assistant reply in context for the next turn
      if (assistantContent && contentDiv.className !== 'msg error') {
        chatMessages.push({ role: 'assistant', content: assistantContent });
      } else if (contentDiv.className === 'msg error') {
        chatMessages.pop(); // remove user msg that never got an answer
      }
      streaming = false;
      send.disabled = false;
      msgs.scrollTop = msgs.scrollHeight;
    }
  );

  try {
    const requestBody = { model, messages: chatMessages, stream: true };
    // Only enable thinking if model supports it and user has it enabled
    if (modelSupportsThinking && thinkingCheckbox.checked) {
      requestBody.think = true;
    }
    const body = JSON.stringify(requestBody);
    const reader = await streamFetch('/api/chat', body);
    handler.run(reader);
  } catch (e) {
    contentDiv.textContent = 'Error: ' + e.message;
    contentDiv.className = 'msg error';
    chatMessages.pop(); // remove the user msg that never got an answer
    streaming = false;
    send.disabled = false;
  }

  msgs.scrollTop = msgs.scrollHeight;
}

input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }};
send.onclick = sendMsg;

// --- Translate ---
async function doTranslate() {
  const text = trInput.value.trim();
  if (!text || !model || streaming) return;
  streaming = true;
  trBtn.disabled = true;
  trOutput.textContent = '';

  const srcLang = trSrcLang.value;
  const targetLang = trLang.value;

  // Language code mapping
  const langCodeMap = {
    'Chinese': 'zh',
    'English': 'en',
    'Japanese': 'ja',
    'Korean': 'ko',
    'French': 'fr',
    'German': 'de',
    'Spanish': 'es',
    'Russian': 'ru',
    'Arabic': 'ar',
    'Thai': 'th',
    'Vietnamese': 'vi',
    'auto': 'auto'
  };

  // Handle source language
  let sourceLangName, sourceLangCode;
  if (srcLang === 'auto') {
    sourceLangName = 'auto-detected source language';
    sourceLangCode = 'auto';
  } else {
    sourceLangName = srcLang;
    sourceLangCode = langCodeMap[srcLang] || 'unknown';
  }

  // Handle target language
  const targetLangName = targetLang;
  const targetLangCode = langCodeMap[targetLang] || 'unknown';

  // Construct prompt following translategemma official format
  const prompt = `You are a professional ${sourceLangName} (${sourceLangCode}) to ${targetLangName} (${targetLangCode}) translator. Your goal is to accurately convey the meaning and nuances of the original ${sourceLangName} text while adhering to ${targetLangName} grammar, vocabulary, and cultural sensitivities.
Produce only the ${targetLangName} translation, without any additional explanations or commentary. Please translate the following ${sourceLangName} text into ${targetLangName}:

${text}`;

  try {
    const requestBody = {model, messages: [{role:'user', content:prompt}], stream: true};
    // Disable thinking for translate panel
    if (modelSupportsThinking) {
      requestBody.think = false;
    }
    const body = JSON.stringify(requestBody);
    const reader = await streamFetch('/api/chat', body);
    const dec = new TextDecoder();
    let buf = '', respText = '';

    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      buf += dec.decode(value, {stream: true});
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const l of lines) {
        if (!l) continue;
        try {
          const j = JSON.parse(l);
          if (j.message?.content) {
            respText += j.message.content;
            trOutput.textContent = respText;
          }
        } catch(e) {}
      }
    }
  } catch (e) {
    trOutput.textContent = 'Error: ' + e.message;
  } finally {
    streaming = false;
    trBtn.disabled = false;
  }
}

trBtn.onclick = doTranslate;
trInput.onkeydown = e => {
  if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); doTranslate(); }
};

// --- Sidebar ---
// Show sidebar when mouse is near screen left edge (within 8px)
document.addEventListener('mousemove', (e) => {
  if (e.clientX <= 8) {
    sidebar.classList.add('open');
  } else if (e.clientX > 288) { // sidebar width (280px) + 8px trigger
    sidebar.classList.remove('open');
  }
});
sidebar.onmouseleave = (e) => {
  // Only hide if mouse leaves sidebar to the right
  if (e.clientX > 280) {
    sidebar.classList.remove('open');
  }
};

// Anonymous mode (default) - clear current chat display only
btnAnonymous.onclick = () => {
  // Clear display only, keep in-memory chatMessages for this session
  msgs.innerHTML = '';
};

// New chat - coming soon
btnNewChat.onclick = () => {
  alert('New Chat feature coming soon!');
};

// Settings button (placeholder)
btnSettings.onclick = () => {
  alert('Settings panel coming soon!');
};

// --- Init ---
check();
