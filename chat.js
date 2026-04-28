const BASE = 'http://127.0.0.1:11434';
let model = '', streaming = false;

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
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'fetch', path, opts }, res => {
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
    if (d.models?.length) { model = d.models[0].name; send.disabled = false; trBtn.disabled = false; }
  } catch (e) {
    dot.className = 'dot red';
    status.textContent = 'Error: ' + e.message;
  }
}

modelSel.onchange = () => { model = modelSel.value; };

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

  const thinkBlock = createThinkingBlock(wrapper);
  wrapper.appendChild(contentDiv);
  msgs.appendChild(wrapper);

  let thinkDone = false, assistantContent = '';

  const handler = createStreamHandler(
    (thinking, time, fold) => {
      thinkBlock.updateThinking(thinking);
      if (fold) {
        thinkBlock.fold(time);
        thinkDone = true;
      }
    },
    (content) => {
      assistantContent = content;
      contentDiv.textContent = content;
    },
    (err) => {
      contentDiv.textContent = 'Error: ' + err;
      contentDiv.className = 'msg error';
    },
    () => {
      if (!thinkDone) thinkBlock.setFinal();
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
    const body = JSON.stringify({ model, messages: chatMessages, stream: true });
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
  const target = trLang.value;
  const srcLabel = target === 'auto' ? 'the language used in the text' : target;

  const prompt = `Translate the following text into ${srcLabel}. Only output the translation, nothing else:\n\n${text}`;

  try {
    const body = JSON.stringify({model, messages: [{role:'user', content:prompt}], stream: true});
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

// --- Init ---
check();
