/**
 * src/llm/interface.js
 * Unified LLM interface — abstracts OpenAI, Claude, Ollama, LM Studio
 * behind a single `complete(messages, options)` call.
 *
 * Providers are instantiated lazily and cached per process lifetime.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import fetch from 'node-fetch';
import { config } from '../../config/index.js';
import logger from '../utils/logger.js';

// ── Provider singletons ────────────────────────────────────
let _anthropic = null;
let _openai    = null;

function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: config.llm.claude.apiKey });
  return _anthropic;
}

function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: config.llm.openai.apiKey });
  return _openai;
}

// ── System prompt injected into every agent call ───────────
export const AGENT_SYSTEM_PROMPT = `You are an autonomous browser agent. You control a real web browser to complete tasks.

You operate in a loop: Plan → Act → Observe → Reflect.

At each step you receive:
- The original task
- Current page URL and title
- Visible DOM elements (interactive elements with selectors)
- Previous steps taken
- Any error from the last action

You must respond with a JSON object (no markdown, no explanation outside JSON):

{
  "thought": "your internal reasoning about what to do next",
  "action": {
    "type": "<action_type>",
    ...action-specific fields
  },
  "done": false,
  "result": null
}

When the task is complete, set "done": true and "result": "<summary of what was accomplished>".

## Available Action Types

### Navigation
{ "type": "navigate", "url": "https://example.com" }
{ "type": "back" }
{ "type": "forward" }
{ "type": "reload" }

### Interaction
{ "type": "click", "selector": "css-selector-or-text" }
{ "type": "type", "selector": "css-selector", "text": "text to type", "clear": true }
{ "type": "select", "selector": "css-selector", "value": "option value" }
{ "type": "hover", "selector": "css-selector" }
{ "type": "scroll", "direction": "down|up|left|right", "amount": 300 }
{ "type": "press_key", "key": "Enter|Tab|Escape|ArrowDown" }

### Data extraction
{ "type": "extract", "selector": "css-selector", "attribute": "text|href|src|innerHTML", "multiple": true }
{ "type": "screenshot", "filename": "optional-name.png" }

### Waiting
{ "type": "wait", "ms": 1000 }
{ "type": "wait_for", "selector": "css-selector", "timeout": 5000 }

### Tab management
{ "type": "new_tab", "url": "https://example.com" }
{ "type": "close_tab" }

## Rules
- Always use CSS selectors that are specific and stable (prefer id, name, aria-label, data-testid)
- If a selector fails, try alternatives from the DOM snapshot
- Never attempt file system operations, shell commands, or anything outside browser control
- If stuck after 3 retries on the same action, mark done=true with an error result
- Keep "thought" concise — 1-3 sentences of actual reasoning`;

// ── Main completion function ───────────────────────────────

/**
 * Send messages to the configured LLM and get a structured JSON response.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} [opts]
 * @param {string} [opts.systemPrompt] - Override the default system prompt
 * @returns {Promise<object>} Parsed JSON response from the model
 */
export async function complete(messages, opts = {}) {
  const provider = config.llm.provider;
  const system   = opts.systemPrompt ?? AGENT_SYSTEM_PROMPT;

  logger.debug(`[LLM] Calling provider: ${provider}`);

  try {
    switch (provider) {
      case 'claude':   return await callClaude(messages, system);
      case 'openai':   return await callOpenAI(messages, system);
      case 'ollama':   return await callOllama(messages, system);
      case 'lmstudio': return await callLMStudio(messages, system);
      default:
        throw new Error(`[LLM] Unknown provider: "${provider}". Check LLM_PROVIDER in .env`);
    }
  } catch (err) {
    logger.error(`[LLM] Provider ${provider} failed: ${err.message}`);
    throw err;
  }
}

// ── Provider implementations ───────────────────────────────

async function callClaude(messages, system) {
  const client = getAnthropic();
  const res = await client.messages.create({
    model:      config.llm.claude.model,
    max_tokens: 2048,
    system,
    messages,
  });

  const text = res.content[0]?.text ?? '';
  return parseJSON(text, 'Claude');
}

async function callOpenAI(messages, system) {
  const client = getOpenAI();
  const res = await client.chat.completions.create({
    model:       config.llm.openai.model,
    max_tokens:  2048,
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      ...messages,
    ],
  });

  const text = res.choices[0]?.message?.content ?? '';
  return parseJSON(text, 'OpenAI');
}

async function callOllama(messages, system) {
  const { baseURL, model } = config.llm.ollama;
  const url = `${baseURL}/api/chat`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
    }),
  });

  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return parseJSON(data.message?.content ?? '', 'Ollama');
}

async function callLMStudio(messages, system) {
  const { baseURL, model } = config.llm.lmstudio;
  const url = `${baseURL}/v1/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens:  2048,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
    }),
  });

  if (!res.ok) throw new Error(`LM Studio HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return parseJSON(data.choices[0]?.message?.content ?? '', 'LM Studio');
}

// ── JSON parser with graceful fallback ────────────────────

function parseJSON(text, provider) {
  // Strip markdown code fences if present
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to find a JSON object inside the text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    logger.warn(`[LLM] ${provider} returned non-JSON. Raw: ${text.slice(0, 200)}`);
    // Return a safe fallback so the agent loop doesn't crash
    return {
      thought: 'Could not parse model response. Will retry.',
      action:  { type: 'wait', ms: 1000 },
      done:    false,
      result:  null,
    };
  }
}
