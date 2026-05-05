// ─── AI Browser Agent — Background Service Worker ────────────────────────────
// Handles: Agent loop, LLM API calls, action dispatch to content script

let agentRunning = false;
let stopRequested = false;

// ─── Message Router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'RUN_AGENT') {
    runAgentLoop(msg).catch(err => {
      broadcastLog('💥 Fatal error: ' + err.message, 'error');
      broadcastDone(false, err.message);
    });
    return true;
  }
  if (msg.type === 'STOP_AGENT') {
    stopRequested = true;
  }
});

// ─── Main Agent Loop ──────────────────────────────────────────────────────────

async function runAgentLoop({ task, tabId, provider, settings, options }) {
  agentRunning = true;
  stopRequested = false;
  const maxSteps = options.maxSteps || 20;
  const memory = []; // conversation history

  broadcastLog(`📋 Task received. Starting loop (max ${maxSteps} steps)`, 'info');

  for (let step = 1; step <= maxSteps; step++) {
    if (stopRequested) break;

    broadcastStep(step, maxSteps);
    broadcastLog(`── Step ${step}/${maxSteps} ──`, 'info');

    try {
      // 1. Gather page context
      const context = await gatherPageContext(tabId, options);
      if (options.verbose) {
        broadcastLog(`📄 URL: ${context.url}`, 'info');
        broadcastLog(`📝 Title: ${context.title}`, 'info');
      }

      // 2. Ask LLM what to do
      broadcastLog(`🤖 Asking ${provider} AI…`, 'ai');
      const action = await askLLM({ provider, settings, task, context, memory, step, maxSteps });

      if (!action) {
        broadcastLog('⚠ No action returned by AI', 'warn');
        continue;
      }

      broadcastLog(`🎯 Action: ${action.type}${action.selector ? ' → ' + action.selector.slice(0,40) : ''}${action.value ? ' = "' + String(action.value).slice(0,30) + '"' : ''}`, 'action');

      if (action.reasoning && options.verbose) {
        broadcastLog(`💭 ${action.reasoning}`, 'ai');
      }

      // 3. Done?
      if (action.type === 'done') {
        broadcastLog(`✅ ${action.message || 'Task complete!'}`, 'success');
        broadcastDone(true, action.message || 'Task complete!');
        return;
      }

      // 4. Execute the action
      const result = await executeAction(tabId, action);

      if (result && result.error) {
        broadcastLog(`⚠ Action failed: ${result.error}`, 'warn');
        memory.push({ role: 'user', content: `Action failed: ${result.error}. Try a different approach.` });
      } else {
        if (result && result.extracted) {
          broadcastLog(`📦 Extracted: ${String(result.extracted).slice(0, 100)}`, 'success');
        }
        memory.push({ role: 'assistant', content: `Step ${step}: Executed ${action.type}. ` + (result?.message || 'Success.') });
      }

      // 5. Wait for page to settle
      await sleep(1200);

    } catch (err) {
      broadcastLog(`❌ Step error: ${err.message}`, 'error');
      memory.push({ role: 'user', content: `Error on step ${step}: ${err.message}` });
    }
  }

  broadcastLog('⏱ Max steps reached or agent stopped.', 'warn');
  broadcastDone(false, 'Max steps reached.');
  agentRunning = false;
}

// ─── Page Context Gatherer ────────────────────────────────────────────────────

async function gatherPageContext(tabId, options) {
  const context = {};

  // Get tab info
  const tab = await chrome.tabs.get(tabId);
  context.url = tab.url;
  context.title = tab.title;

  // Get DOM snapshot
  if (options.useDom) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: extractPageDOM
      });
      context.dom = results[0]?.result || '';
    } catch (e) {
      context.dom = '(DOM extraction failed)';
    }
  }

  // Take screenshot
  if (options.useScreenshot) {
    try {
      context.screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 60 });
    } catch (e) {
      context.screenshot = null;
    }
  }

  return context;
}

// Runs inside the page (injected)
function extractPageDOM() {
  const MAX_CHARS = 8000;

  function getInteractable() {
    const selectors = ['a[href]', 'button', 'input', 'select', 'textarea', '[onclick]', '[role="button"]', '[role="link"]', '[role="menuitem"]', '[tabindex]'];
    const elements = [];

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach((el, i) => {
        if (i > 30) return; // limit per type
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        const text = (el.textContent || el.value || el.placeholder || el.alt || el.title || '').trim().slice(0, 80);
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0,2).join('.') : '';
        const tag = el.tagName.toLowerCase();
        const type = el.type ? `[type="${el.type}"]` : '';
        const href = el.href ? ` href="${el.href.slice(0,60)}"` : '';
        const placeholder = el.placeholder ? ` placeholder="${el.placeholder}"` : '';

        elements.push(`<${tag}${id}${cls}${type}${href}${placeholder}>${text}</${tag}>`);
      });
    });

    return elements.join('\n').slice(0, MAX_CHARS);
  }

  return `URL: ${window.location.href}\nTitle: ${document.title}\n\nINTERACTABLE ELEMENTS:\n${getInteractable()}\n\nPAGE TEXT (first 2000 chars):\n${document.body.innerText.slice(0,2000)}`;
}

// ─── LLM API Caller ───────────────────────────────────────────────────────────

async function askLLM({ provider, settings, task, context, memory, step, maxSteps }) {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(task, context, step, maxSteps);

  let response;

  switch (provider) {
    case 'openai':
    case 'openrouter':
    case 'custom':
      response = await callOpenAICompatible({ provider, settings, systemPrompt, userPrompt, context });
      break;
    case 'claude':
      response = await callClaude({ settings, systemPrompt, userPrompt, context });
      break;
    case 'ollama':
      response = await callOllama({ settings, systemPrompt, userPrompt, context });
      break;
    case 'lmstudio':
      response = await callLMStudio({ settings, systemPrompt, userPrompt, context });
      break;
    default:
      throw new Error('Unknown provider: ' + provider);
  }

  return parseAction(response);
}

function buildSystemPrompt() {
  return `You are an AI browser agent. You control a web browser to complete tasks.

You will receive:
- The current task
- Current page URL, title, and interactive elements
- Step number and max steps

You must respond with ONLY a JSON object (no markdown, no explanation) describing the next action:

{
  "type": "click" | "type" | "navigate" | "scroll" | "hover" | "select" | "wait" | "back" | "forward" | "extract" | "done",
  "selector": "CSS selector (for click/type/hover/select/wait)",
  "value": "text to type or URL to navigate or option value",
  "scrollY": number (pixels, for scroll — negative = up),
  "message": "result message (for done/extract)",
  "reasoning": "brief explanation of why (optional)"
}

RULES:
- Use specific, unique CSS selectors (prefer id, then specific class+tag combos)
- For "navigate", put the full URL in "value"
- For "type", clear the field first by selecting all
- For "done", include what you accomplished in "message"
- If stuck, try a different approach
- Always return valid JSON only`;
}

function buildUserPrompt(task, context, step, maxSteps) {
  return `TASK: ${task}

STEP: ${step} of ${maxSteps}

CURRENT PAGE:
URL: ${context.url}
Title: ${context.title}

${context.dom ? 'PAGE ELEMENTS:\n' + context.dom : '(DOM not available)'}

Determine the single best next action to complete the task. Return JSON only.`;
}

// ─── OpenAI-Compatible (OpenAI, OpenRouter, Custom) ──────────────────────────

async function callOpenAICompatible({ provider, settings, systemPrompt, userPrompt, context }) {
  const baseUrl = settings.baseUrl || PROVIDER_CONFIGS_BG[provider]?.baseUrl || 'https://api.openai.com/v1';
  const model = settings.model || 'gpt-4o';

  const messages = [{ role: 'system', content: systemPrompt }];

  // Add vision if screenshot available
  if (context.screenshot) {
    messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: context.screenshot, detail: 'low' } },
        { type: 'text', text: userPrompt }
      ]
    });
  } else {
    messages.push({ role: 'user', content: userPrompt });
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${settings.apiKey || ''}`
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://ai-browser-agent';
    headers['X-Title'] = 'AI Browser Agent';
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 500,
      temperature: 0.1
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices[0]?.message?.content || '';
}

// ─── Claude (Anthropic) ───────────────────────────────────────────────────────

async function callClaude({ settings, systemPrompt, userPrompt, context }) {
  const model = settings.model || 'claude-sonnet-4-5';

  const content = [];

  if (context.screenshot) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: context.screenshot.replace('data:image/jpeg;base64,', '')
      }
    });
  }

  content.push({ type: 'text', text: userPrompt });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.content[0]?.text || '';
}

// ─── Ollama ───────────────────────────────────────────────────────────────────

async function callOllama({ settings, systemPrompt, userPrompt, context }) {
  const baseUrl = (settings.baseUrl || 'http://localhost:11434').replace(/\/$/, '');
  const model = settings.model || 'llama3.2-vision';

  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  if (context.screenshot) {
    messages.push({
      role: 'user',
      content: userPrompt,
      images: [context.screenshot.replace('data:image/jpeg;base64,', '')]
    });
  } else {
    messages.push({ role: 'user', content: userPrompt });
  }

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.message?.content || '';
}

// ─── LM Studio ────────────────────────────────────────────────────────────────

async function callLMStudio({ settings, systemPrompt, userPrompt, context }) {
  const baseUrl = (settings.baseUrl || 'http://localhost:1234').replace(/\/$/, '');
  const model = settings.model || undefined;

  const body = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 500,
    temperature: 0.1
  };

  if (model) body.model = model;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LM Studio error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices[0]?.message?.content || '';
}

// ─── Parse LLM Response ───────────────────────────────────────────────────────

function parseAction(rawText) {
  if (!rawText) return null;

  // Try to extract JSON from the response
  let text = rawText.trim();

  // Remove markdown code fences if present
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Find JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    broadcastLog(`⚠ Could not parse AI response: ${text.slice(0, 100)}`, 'warn');
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    broadcastLog(`⚠ JSON parse error: ${e.message}`, 'warn');
    return null;
  }
}

// ─── Action Executor ──────────────────────────────────────────────────────────

async function executeAction(tabId, action) {
  const { type, selector, value, scrollY, message } = action;

  try {
    switch (type) {
      case 'click':
        return await runInPage(tabId, pageClick, [selector]);

      case 'type':
        return await runInPage(tabId, pageType, [selector, value]);

      case 'navigate':
        await chrome.tabs.update(tabId, { url: value });
        await waitForTabLoad(tabId);
        return { message: `Navigated to ${value}` };

      case 'scroll':
        return await runInPage(tabId, pageScroll, [selector, scrollY || 400]);

      case 'hover':
        return await runInPage(tabId, pageHover, [selector]);

      case 'select':
        return await runInPage(tabId, pageSelect, [selector, value]);

      case 'wait':
        return await runInPage(tabId, pageWait, [selector, 5000]);

      case 'back':
        await chrome.scripting.executeScript({ target: { tabId }, func: () => window.history.back() });
        await sleep(1000);
        return { message: 'Navigated back' };

      case 'forward':
        await chrome.scripting.executeScript({ target: { tabId }, func: () => window.history.forward() });
        await sleep(1000);
        return { message: 'Navigated forward' };

      case 'extract':
        return await runInPage(tabId, pageExtract, [selector]);

      default:
        return { error: `Unknown action type: ${type}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

async function runInPage(tabId, func, args) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args: args || []
  });
  return results[0]?.result;
}

// ─── Page Functions (injected into page) ─────────────────────────────────────

function pageClick(selector) {
  const el = selector ? document.querySelector(selector) : null;
  if (!el) return { error: `Element not found: ${selector}` };

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus();
  el.click();

  // Dispatch events for SPA frameworks
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  return { message: `Clicked: ${selector}` };
}

function pageType(selector, text) {
  const el = selector ? document.querySelector(selector) : null;
  if (!el) return { error: `Element not found: ${selector}` };

  el.focus();
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Clear existing value
  el.value = '';
  el.dispatchEvent(new Event('input', { bubbles: true }));

  // Type character by character for SPA compat
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
                                    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, text);
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    el.textContent = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  return { message: `Typed into: ${selector}` };
}

function pageScroll(selector, pixels) {
  if (selector) {
    const el = document.querySelector(selector);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return { message: `Scrolled to ${selector}` }; }
  }
  window.scrollBy({ top: pixels, behavior: 'smooth' });
  return { message: `Scrolled ${pixels}px` };
}

function pageHover(selector) {
  const el = document.querySelector(selector);
  if (!el) return { error: `Element not found: ${selector}` };
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  return { message: `Hovered: ${selector}` };
}

function pageSelect(selector, value) {
  const el = document.querySelector(selector);
  if (!el) return { error: `Element not found: ${selector}` };
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { message: `Selected ${value} in ${selector}` };
}

function pageWait(selector, timeout) {
  return new Promise(resolve => {
    const start = Date.now();
    const check = () => {
      const el = document.querySelector(selector);
      if (el) return resolve({ message: `Element appeared: ${selector}` });
      if (Date.now() - start > timeout) return resolve({ error: `Timeout waiting for: ${selector}` });
      setTimeout(check, 300);
    };
    check();
  });
}

function pageExtract(selector) {
  const el = selector ? document.querySelector(selector) : document.body;
  if (!el) return { error: `Element not found: ${selector}` };
  const text = (el.innerText || el.textContent || '').trim().slice(0, 2000);
  return { extracted: text, message: `Extracted ${text.length} chars` };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 500);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 8000); // fallback timeout
  });
}

function broadcastLog(message, level = 'info') {
  chrome.runtime.sendMessage({ type: 'AGENT_LOG', message, level }).catch(() => {});
}

function broadcastStep(step, max) {
  chrome.runtime.sendMessage({ type: 'AGENT_STEP', step, max }).catch(() => {});
}

function broadcastDone(success, message) {
  agentRunning = false;
  chrome.runtime.sendMessage({ type: 'AGENT_DONE', success, message }).catch(() => {});
}

// Provider config mirror for background
const PROVIDER_CONFIGS_BG = {
  openai: { baseUrl: 'https://api.openai.com/v1' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1' },
  claude: { baseUrl: 'https://api.anthropic.com/v1' }
};
