/**
 * config/index.js
 * Central configuration loader — reads .env and validates required fields
 */

import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Load .env from project root
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  loadEnv({ path: envPath });
} else {
  console.warn('[Config] No .env file found. Using environment variables directly.');
}

/**
 * Validated, typed configuration object.
 * All agent behaviour is driven from here — no magic strings elsewhere.
 */
export const config = {
  // ── LLM Provider ──────────────────────────────────────────
  llm: {
    provider: process.env.LLM_PROVIDER || 'claude',   // openai | claude | ollama | lmstudio

    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model:  process.env.OPENAI_MODEL  || 'gpt-4o',
      baseURL: 'https://api.openai.com/v1',
    },

    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model:  process.env.CLAUDE_MODEL      || 'claude-opus-4-5',
    },

    ollama: {
      baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model:   process.env.OLLAMA_MODEL    || 'llama3',
    },

    lmstudio: {
      baseURL: process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234',
      model:   process.env.LMSTUDIO_MODEL    || 'local-model',
    },
  },

  // ── Agent Behaviour ───────────────────────────────────────
  agent: {
    maxSteps:             parseInt(process.env.MAX_STEPS            || '25', 10),
    stepDelayMs:          parseInt(process.env.STEP_DELAY_MS        || '1000', 10),
    screenshotEachStep:   process.env.SCREENSHOT_ON_EACH_STEP       === 'true',
  },

  // ── Browser ───────────────────────────────────────────────
  browser: {
    headless:   process.env.HEADLESS      !== 'false',   // default headless
    type:       process.env.BROWSER_TYPE  || 'chromium', // chromium | firefox | webkit
    viewport: {
      width:  parseInt(process.env.VIEWPORT_WIDTH  || '1280', 10),
      height: parseInt(process.env.VIEWPORT_HEIGHT || '800',  10),
    },
    userAgent: process.env.USER_AGENT || undefined,
  },

  // ── Logging ───────────────────────────────────────────────
  log: {
    level: process.env.LOG_LEVEL || 'info',
    file:  process.env.LOG_FILE  || 'logs/agent.log',
  },

  // ── Web UI ────────────────────────────────────────────────
  webUI: {
    port: parseInt(process.env.WEB_UI_PORT || '3000', 10),
  },
};

/**
 * Validate that the selected provider has the required credentials.
 * Throws a descriptive error so setup problems surface immediately.
 */
export function validateConfig() {
  const p = config.llm.provider;

  const checks = {
    openai:   () => !!config.llm.openai.apiKey,
    claude:   () => !!config.llm.claude.apiKey,
    ollama:   () => !!config.llm.ollama.baseURL,
    lmstudio: () => !!config.llm.lmstudio.baseURL,
  };

  if (!checks[p]?.()) {
    const hints = {
      openai:   'Set OPENAI_API_KEY in .env',
      claude:   'Set ANTHROPIC_API_KEY in .env',
      ollama:   'Set OLLAMA_BASE_URL in .env (default: http://localhost:11434)',
      lmstudio: 'Set LMSTUDIO_BASE_URL in .env (default: http://localhost:1234)',
    };
    throw new Error(`[Config] Provider "${p}" is misconfigured. ${hints[p] || ''}`);
  }
}
