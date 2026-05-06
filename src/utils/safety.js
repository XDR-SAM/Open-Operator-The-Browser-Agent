/**
 * src/utils/safety.js
 * Safety guardrails — validates actions before execution.
 *
 * Rules:
 *  1. Only browser actions are allowed (no shell, file I/O, etc.)
 *  2. URL blocklist prevents navigation to dangerous domains
 *  3. Input sanitisation prevents XSS / injection via type actions
 */

import logger from './logger.js';

// ── Allowed action types (strict whitelist) ────────────────
const ALLOWED_ACTIONS = new Set([
  'navigate', 'back', 'forward', 'reload',
  'click', 'type', 'select', 'hover', 'scroll', 'press_key',
  'extract', 'screenshot',
  'wait', 'wait_for',
  'new_tab', 'close_tab',
]);

// ── URL blocklist (patterns) ───────────────────────────────
const URL_BLOCK_PATTERNS = [
  /^file:\/\//i,          // Local filesystem
  /^chrome:\/\//i,        // Chrome internals
  /^about:/i,             // Browser internals
  /localhost:\d+\/api/i,  // Prevent self-calls to agent API
];

// ── Dangerous text patterns in type actions ────────────────
const DANGEROUS_INPUT_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,           // Event handlers like onclick=
];

/**
 * Validate an action object. Returns { ok: true } or { ok: false, reason: string }.
 *
 * @param {object} action
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateAction(action) {
  if (!action || typeof action !== 'object') {
    return { ok: false, reason: 'Action must be an object' };
  }

  const { type } = action;

  // 1. Whitelist check
  if (!ALLOWED_ACTIONS.has(type)) {
    return { ok: false, reason: `Action type "${type}" is not allowed` };
  }

  // 2. URL safety for navigate / new_tab
  if ((type === 'navigate' || type === 'new_tab') && action.url) {
    for (const pattern of URL_BLOCK_PATTERNS) {
      if (pattern.test(action.url)) {
        return { ok: false, reason: `URL blocked by safety rule: ${action.url}` };
      }
    }

    // Ensure URL has a scheme
    if (!/^https?:\/\//i.test(action.url)) {
      // Auto-fix: prepend https://
      action.url = 'https://' + action.url;
      logger.debug(`[Safety] Auto-prepended https:// to URL`);
    }
  }

  // 3. Input sanitisation for type actions
  if (type === 'type' && action.text) {
    for (const pattern of DANGEROUS_INPUT_PATTERNS) {
      if (pattern.test(action.text)) {
        return { ok: false, reason: `Potentially dangerous input blocked: ${action.text.slice(0, 50)}` };
      }
    }
  }

  // 4. Scroll amount cap (prevent enormous scrolls)
  if (type === 'scroll' && action.amount) {
    action.amount = Math.min(Math.abs(action.amount), 5000);
  }

  // 5. Wait time cap (prevent agent from sleeping forever)
  if (type === 'wait' && action.ms) {
    if (action.ms > 30000) {
      action.ms = 30000;
      logger.debug('[Safety] Capped wait to 30s');
    }
  }

  return { ok: true };
}
