// ─── Provider Configs ────────────────────────────────────────────────────────

const PROVIDER_CONFIGS = {
  openai: {
    fields: [
      { id: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...', hint: 'Get from <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>' },
      { id: 'model', label: 'Model', type: 'select', options: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision-preview'], default: 'gpt-4o' }
    ],
    baseUrl: 'https://api.openai.com/v1'
  },
  claude: {
    fields: [
      { id: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-ant-...', hint: 'Get from <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>' },
      { id: 'model', label: 'Model', type: 'select', options: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'], default: 'claude-sonnet-4-5' }
    ],
    baseUrl: 'https://api.anthropic.com/v1'
  },
  ollama: {
    fields: [
      { id: 'baseUrl', label: 'Ollama URL', type: 'text', placeholder: 'http://localhost:11434', default: 'http://localhost:11434', hint: 'Make sure Ollama is running locally' },
      { id: 'model', label: 'Model', type: 'text', placeholder: 'llama3.2-vision', default: 'llama3.2-vision', hint: 'Run: <code style="color:var(--accent2)">ollama pull llama3.2-vision</code>' }
    ]
  },
  lmstudio: {
    fields: [
      { id: 'baseUrl', label: 'LM Studio URL', type: 'text', placeholder: 'http://localhost:1234', default: 'http://localhost:1234', hint: 'Enable local server in LM Studio → Developer tab' },
      { id: 'model', label: 'Model Name', type: 'text', placeholder: 'leave blank for auto', default: '' }
    ]
  },
  openrouter: {
    fields: [
      { id: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-or-...', hint: 'Get from <a href="https://openrouter.ai/keys" target="_blank">openrouter.ai</a>' },
      { id: 'model', label: 'Model', type: 'text', placeholder: 'openai/gpt-4o', default: 'openai/gpt-4o', hint: 'Browse models at <a href="https://openrouter.ai/models" target="_blank">openrouter.ai/models</a>' }
    ],
    baseUrl: 'https://openrouter.ai/api/v1'
  },
  custom: {
    fields: [
      { id: 'baseUrl', label: 'API Base URL', type: 'text', placeholder: 'http://localhost:8080/v1', hint: 'Any OpenAI-compatible endpoint' },
      { id: 'apiKey', label: 'API Key (optional)', type: 'password', placeholder: 'optional' },
      { id: 'model', label: 'Model Name', type: 'text', placeholder: 'model-name' }
    ]
  }
};

// ─── State ────────────────────────────────────────────────────────────────────

let selectedProvider = 'openai';
let isRunning = false;
let currentStep = 0;
let maxSteps = 20;

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupTabs();
  setupProviderCards();
  setupToggles();
  setupControls();
  renderProviderConfig(selectedProvider);
  checkStatus();
});

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });
}

// ─── Provider Cards ───────────────────────────────────────────────────────────

function setupProviderCards() {
  document.querySelectorAll('.provider-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.provider-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedProvider = card.dataset.provider;
      renderProviderConfig(selectedProvider);
    });
  });
}

function renderProviderConfig(provider) {
  const config = PROVIDER_CONFIGS[provider];
  const container = document.getElementById('providerConfig');

  container.innerHTML = config.fields.map(field => {
    if (field.type === 'select') {
      return `
        <div class="field">
          <label>${field.label}</label>
          <select id="cfg-${field.id}">
            ${field.options.map(o => `<option value="${o}" ${o === field.default ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>`;
    }
    return `
      <div class="field">
        <label>${field.label}</label>
        <input type="${field.type}" id="cfg-${field.id}" placeholder="${field.placeholder || ''}" value="${field.default || ''}" />
        ${field.hint ? `<div class="hint">${field.hint}</div>` : ''}
      </div>`;
  }).join('');

  // Restore saved values
  chrome.storage.local.get(['providerSettings'], result => {
    const saved = result.providerSettings?.[provider] || {};
    config.fields.forEach(field => {
      const el = document.getElementById('cfg-' + field.id);
      if (el && saved[field.id]) el.value = saved[field.id];
    });
  });
}

// ─── Toggles ──────────────────────────────────────────────────────────────────

function setupToggles() {
  ['screenshot', 'dom', 'verbose'].forEach(id => {
    const chip = document.getElementById('chip-' + id);
    const input = document.getElementById('opt-' + id);
    if (!chip) return;
    function update() {
      chip.classList.toggle('on', input.checked);
    }
    update();
    input.addEventListener('change', update);
    chip.addEventListener('click', (e) => {
      if (e.target !== input) {
        input.checked = !input.checked;
        update();
      }
    });
  });
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function setupControls() {
  // Max steps slider
  const slider = document.getElementById('maxSteps');
  const val = document.getElementById('maxStepsVal');
  slider.addEventListener('input', () => {
    maxSteps = parseInt(slider.value);
    val.textContent = maxSteps;
  });

  // Run button
  document.getElementById('runBtn').addEventListener('click', runAgent);

  // Stop button
  document.getElementById('stopBtn').addEventListener('click', stopAgent);

  // Clear log
  document.getElementById('clearLog').addEventListener('click', () => {
    document.getElementById('agentLog').innerHTML = '<div class="log-empty">Log cleared.</div>';
  });

  // Save settings
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
}

// ─── Settings Save/Load ───────────────────────────────────────────────────────

async function saveSettings() {
  const config = PROVIDER_CONFIGS[selectedProvider];
  const values = {};
  config.fields.forEach(field => {
    const el = document.getElementById('cfg-' + field.id);
    if (el) values[field.id] = el.value;
  });

  const result = await chrome.storage.local.get(['providerSettings']);
  const all = result.providerSettings || {};
  all[selectedProvider] = values;

  await chrome.storage.local.set({
    selectedProvider,
    providerSettings: all
  });

  const status = document.getElementById('saveStatus');
  status.textContent = '✓ Settings saved!';
  status.style.color = 'var(--success)';
  setTimeout(() => { status.textContent = ''; }, 2000);
}

async function loadSettings() {
  const result = await chrome.storage.local.get(['selectedProvider', 'providerSettings']);
  if (result.selectedProvider) {
    selectedProvider = result.selectedProvider;
    document.querySelectorAll('.provider-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.provider === selectedProvider);
    });
  }
}

// ─── Status Check ─────────────────────────────────────────────────────────────

async function checkStatus() {
  const result = await chrome.storage.local.get(['selectedProvider', 'providerSettings']);
  const dot = document.getElementById('statusDot');
  if (result.selectedProvider && result.providerSettings?.[result.selectedProvider]) {
    dot.className = 'status-dot ready';
  } else {
    dot.className = 'status-dot error';
  }
}

// ─── Agent Run ────────────────────────────────────────────────────────────────

async function runAgent() {
  const task = document.getElementById('taskPrompt').value.trim();
  if (!task) {
    addLog('Please enter a task!', 'error');
    return;
  }

  // Get current settings
  const result = await chrome.storage.local.get(['selectedProvider', 'providerSettings']);
  const provider = result.selectedProvider || selectedProvider;
  const settings = result.providerSettings?.[provider] || {};

  if (!settings.apiKey && !['ollama', 'lmstudio'].includes(provider)) {
    addLog('⚠ No API key found. Go to Settings first.', 'warn');
    // Switch to settings tab
    document.querySelector('[data-tab="settings"]').click();
    return;
  }

  isRunning = true;
  currentStep = 0;
  document.getElementById('runBtn').disabled = true;
  document.getElementById('stopBtn').style.display = 'block';
  document.getElementById('statusDot').className = 'status-dot running';
  document.getElementById('agentLog').innerHTML = '';

  addLog(`🚀 Starting agent — "${task.slice(0, 60)}${task.length > 60 ? '…' : ''}"`, 'info');
  addLog(`Provider: ${provider} | Model: ${settings.model || 'default'}`, 'info');

  const options = {
    useScreenshot: document.getElementById('opt-screenshot').checked,
    useDom: document.getElementById('opt-dom').checked,
    verbose: document.getElementById('opt-verbose').checked,
    maxSteps: parseInt(document.getElementById('maxSteps').value)
  };

  // Send to background
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.runtime.sendMessage({
    type: 'RUN_AGENT',
    task,
    tabId: tab.id,
    provider,
    settings,
    options
  });

  // Listen for progress
  chrome.runtime.onMessage.addListener(function listener(msg) {
    if (msg.type === 'AGENT_LOG') {
      addLog(msg.message, msg.level || 'info');
    }
    if (msg.type === 'AGENT_STEP') {
      currentStep = msg.step;
      updateStepBar(msg.step, options.maxSteps);
    }
    if (msg.type === 'AGENT_DONE') {
      agentFinished(msg.success, msg.message);
      chrome.runtime.onMessage.removeListener(listener);
    }
  });
}

function stopAgent() {
  chrome.runtime.sendMessage({ type: 'STOP_AGENT' });
  agentFinished(false, 'Agent stopped by user.');
}

function agentFinished(success, message) {
  isRunning = false;
  document.getElementById('runBtn').disabled = false;
  document.getElementById('stopBtn').style.display = 'none';
  document.getElementById('statusDot').className = 'status-dot ready';
  addLog(message || (success ? '✓ Task complete!' : '✗ Agent stopped'), success ? 'success' : 'warn');
}

// ─── Log ──────────────────────────────────────────────────────────────────────

function addLog(message, level = 'info') {
  const log = document.getElementById('agentLog');
  const empty = log.querySelector('.log-empty');
  if (empty) empty.remove();

  const now = new Date();
  const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-time">${time}</span><span class="log-msg ${level}">${escapeHtml(message)}</span>`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Step Bar ─────────────────────────────────────────────────────────────────

function updateStepBar(step, max) {
  document.getElementById('stepLabel').textContent = `${step} / ${max} steps`;
  document.getElementById('stepFill').style.width = `${(step / max) * 100}%`;
}
