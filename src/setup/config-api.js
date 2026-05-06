/**
 * src/setup/config-api.js
 * REST endpoints used by the setup wizard.
 * Handles: reading/writing .env, fetching available models per provider.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import fetch from 'node-fetch';

const ENV_PATH = resolve(process.cwd(), '.env');

// ── Defaults ───────────────────────────────────────────────
const DEFAULTS = {
  LLM_PROVIDER: 'claude',
  CLAUDE_MODEL: 'claude-opus-4-5',
  OPENAI_MODEL: 'gpt-4o',
  OLLAMA_MODEL: 'llama3',
  LMSTUDIO_MODEL: 'local-model',
  HEADLESS: 'false',
  MAX_STEPS: '25',
  STEP_DELAY_MS: '1000',
  BROWSER_TYPE: 'chromium',
  WEB_UI_PORT: '3000',
  LOG_LEVEL: 'info',
  LOG_FILE: 'logs/agent.log',
  SCREENSHOT_ON_EACH_STEP: 'false',
  OLLAMA_BASE_URL: 'http://localhost:11434',
  LMSTUDIO_BASE_URL: 'http://localhost:1234',
};

// ── Parse .env file into object ────────────────────────────
function readEnv() {
  if (!existsSync(ENV_PATH)) return { ...DEFAULTS };
  const lines = readFileSync(ENV_PATH, 'utf8').split('\n');
  const result = { ...DEFAULTS };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    result[key] = val;
  }
  return result;
}

// ── Write object back to .env ──────────────────────────────
function writeEnv(data) {
  const lines = [
    '# Autonomous Browser Agent — auto-generated config',
    `# Last updated: ${new Date().toISOString()}`,
    '',
  ];
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined && val !== '') lines.push(`${key}=${val}`);
  }
  writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf8');
}

// ── Model fetchers per provider ────────────────────────────

async function fetchClaudeModels(apiKey) {
  // Static curated list — Anthropic API doesn't have a public /models endpoint
  return [
    { id: 'claude-opus-4-5',      name: 'Claude Opus 4.5  (most capable)' },
    { id: 'claude-sonnet-4-5',    name: 'Claude Sonnet 4.5  (balanced)' },
    { id: 'claude-haiku-4-5',     name: 'Claude Haiku 4.5  (fastest)' },
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-opus-20240229',     name: 'Claude 3 Opus' },
  ];
}

async function fetchOpenAIModels(apiKey) {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const chat = data.data
    .filter(m => m.id.startsWith('gpt-'))
    .sort((a, b) => b.created - a.created)
    .slice(0, 10)
    .map(m => ({ id: m.id, name: m.id }));
  return chat;
}

async function fetchOllamaModels(baseURL) {
  const res = await fetch(`${baseURL}/api/tags`);
  if (!res.ok) throw new Error(`Ollama not reachable at ${baseURL}`);
  const data = await res.json();
  return (data.models || []).map(m => ({ id: m.name, name: m.name }));
}

async function fetchLMStudioModels(baseURL) {
  const res = await fetch(`${baseURL}/v1/models`);
  if (!res.ok) throw new Error(`LM Studio not reachable at ${baseURL}`);
  const data = await res.json();
  return (data.data || []).map(m => ({ id: m.id, name: m.id }));
}

// ── Validate API key (test call) ───────────────────────────
async function validateKey(provider, apiKey, baseURL) {
  switch (provider) {
    case 'claude': {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      if (res.status === 401) throw new Error('Invalid API key');
      if (!res.ok && res.status !== 400) throw new Error(`HTTP ${res.status}`);
      return true;
    }
    case 'openai': {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.status === 401) throw new Error('Invalid API key');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    }
    case 'ollama': {
      const res = await fetch(`${baseURL}/api/tags`);
      if (!res.ok) throw new Error(`Cannot connect to Ollama at ${baseURL}`);
      return true;
    }
    case 'lmstudio': {
      const res = await fetch(`${baseURL}/v1/models`);
      if (!res.ok) throw new Error(`Cannot connect to LM Studio at ${baseURL}`);
      return true;
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── Express route registrar ────────────────────────────────
export function registerSetupRoutes(app) {

  // GET /api/setup — return current config (mask API keys)
  app.get('/api/setup', (_req, res) => {
    const env = readEnv();
    // Mask keys for display
    const mask = v => v && v.length > 8 ? v.slice(0, 6) + '•'.repeat(10) : (v || '');
    res.json({
      provider:         env.LLM_PROVIDER,
      anthropicKey:     mask(env.ANTHROPIC_API_KEY),
      openaiKey:        mask(env.OPENAI_API_KEY),
      claudeModel:      env.CLAUDE_MODEL,
      openaiModel:      env.OPENAI_MODEL,
      ollamaModel:      env.OLLAMA_MODEL,
      ollamaBaseURL:    env.OLLAMA_BASE_URL,
      lmstudioModel:    env.LMSTUDIO_MODEL,
      lmstudioBaseURL:  env.LMSTUDIO_BASE_URL,
      headless:         env.HEADLESS === 'true',
      maxSteps:         parseInt(env.MAX_STEPS || '25'),
      stepDelay:        parseInt(env.STEP_DELAY_MS || '1000'),
      screenshotSteps:  env.SCREENSHOT_ON_EACH_STEP === 'true',
      configured:       !!(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.OLLAMA_BASE_URL),
    });
  });

  // POST /api/setup/save — write settings to .env
  app.post('/api/setup/save', (req, res) => {
    try {
      const b = req.body;
      const current = readEnv();

      // Only overwrite keys if user actually typed a new value (not a masked one)
      const isNew = v => v && !v.includes('•');

      const updated = {
        ...current,
        LLM_PROVIDER: b.provider || current.LLM_PROVIDER,
        CLAUDE_MODEL: b.claudeModel || current.CLAUDE_MODEL,
        OPENAI_MODEL: b.openaiModel || current.OPENAI_MODEL,
        OLLAMA_MODEL: b.ollamaModel || current.OLLAMA_MODEL,
        OLLAMA_BASE_URL: b.ollamaBaseURL || current.OLLAMA_BASE_URL,
        LMSTUDIO_MODEL: b.lmstudioModel || current.LMSTUDIO_MODEL,
        LMSTUDIO_BASE_URL: b.lmstudioBaseURL || current.LMSTUDIO_BASE_URL,
        HEADLESS: b.headless ? 'true' : 'false',
        MAX_STEPS: String(b.maxSteps || 25),
        STEP_DELAY_MS: String(b.stepDelay || 1000),
        SCREENSHOT_ON_EACH_STEP: b.screenshotSteps ? 'true' : 'false',
      };

      if (isNew(b.anthropicKey)) updated.ANTHROPIC_API_KEY = b.anthropicKey;
      if (isNew(b.openaiKey))    updated.OPENAI_API_KEY    = b.openaiKey;

      writeEnv(updated);

      // Hot-reload config in memory
      process.env.LLM_PROVIDER   = updated.LLM_PROVIDER;
      process.env.CLAUDE_MODEL    = updated.CLAUDE_MODEL;
      process.env.OPENAI_MODEL    = updated.OPENAI_MODEL;
      if (isNew(b.anthropicKey)) process.env.ANTHROPIC_API_KEY = updated.ANTHROPIC_API_KEY;
      if (isNew(b.openaiKey))    process.env.OPENAI_API_KEY    = updated.OPENAI_API_KEY;

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/setup/validate — test API key + return models
  app.post('/api/setup/validate', async (req, res) => {
    const { provider, apiKey, baseURL } = req.body;
    try {
      await validateKey(provider, apiKey, baseURL);

      let models = [];
      switch (provider) {
        case 'claude':   models = await fetchClaudeModels(apiKey); break;
        case 'openai':   models = await fetchOpenAIModels(apiKey); break;
        case 'ollama':   models = await fetchOllamaModels(baseURL || 'http://localhost:11434'); break;
        case 'lmstudio': models = await fetchLMStudioModels(baseURL || 'http://localhost:1234'); break;
      }

      res.json({ ok: true, models });
    } catch (err) {
      res.json({ ok: false, error: err.message, models: [] });
    }
  });

  // GET /api/setup/models/:provider — fetch models (for refresh)
  app.get('/api/setup/models/:provider', async (req, res) => {
    const { provider } = req.params;
    const env = readEnv();
    try {
      let models = [];
      switch (provider) {
        case 'claude':   models = await fetchClaudeModels(env.ANTHROPIC_API_KEY); break;
        case 'openai':   models = await fetchOpenAIModels(env.OPENAI_API_KEY); break;
        case 'ollama':   models = await fetchOllamaModels(env.OLLAMA_BASE_URL); break;
        case 'lmstudio': models = await fetchLMStudioModels(env.LMSTUDIO_BASE_URL); break;
      }
      res.json({ ok: true, models });
    } catch (err) {
      res.json({ ok: false, error: err.message, models: [] });
    }
  });
}
