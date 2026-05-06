/**
 * src/browser/controller.js
 * Playwright-based browser controller.
 *
 * Responsibilities:
 *  - Launch / close the browser
 *  - Execute typed actions (click, type, navigate, scroll, extract…)
 *  - Build a DOM snapshot (visible interactive elements)
 *  - Take screenshots
 */

import { chromium, firefox, webkit } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { config } from '../../config/index.js';
import logger from '../utils/logger.js';

const BROWSER_ENGINES = { chromium, firefox, webkit };

export class BrowserController {
  constructor() {
    this.browser   = null;
    this.context   = null;
    this.page      = null;
    this.screenshotDir = resolve(process.cwd(), 'screenshots');
  }

  // ── Lifecycle ────────────────────────────────────────────

  async launch() {
    const engine = BROWSER_ENGINES[config.browser.type] ?? chromium;
    logger.info(`[Browser] Launching ${config.browser.type} (headless=${config.browser.headless})`);

    this.browser = await engine.launch({
      headless: config.browser.headless,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    this.context = await this.browser.newContext({
      viewport:  config.browser.viewport,
      userAgent: config.browser.userAgent,
      // Avoid detection as automation
      javaScriptEnabled: true,
    });

    this.page = await this.context.newPage();

    // Intercept console errors for debugging
    this.page.on('console', msg => {
      if (msg.type() === 'error') logger.debug(`[Browser] Console error: ${msg.text()}`);
    });

    logger.info('[Browser] Ready');
  }

  async close() {
    await this.browser?.close();
    logger.info('[Browser] Closed');
  }

  // ── DOM Snapshot ─────────────────────────────────────────

  /**
   * Extract a concise snapshot of visible, interactive elements.
   * Gives the LLM selectors it can actually use.
   */
  async getDOMSnapshot() {
    try {
      const snapshot = await this.page.evaluate(() => {
        const interactiveSelectors = [
          'a[href]', 'button', 'input', 'select', 'textarea',
          '[role="button"]', '[role="link"]', '[role="textbox"]',
          '[role="menuitem"]', '[role="tab"]', '[role="checkbox"]',
          '[onclick]', '[tabindex]',
        ];

        const elements = [];
        const seen = new Set();

        // Helper: get a stable, short CSS selector
        function getSelector(el) {
          if (el.id) return `#${CSS.escape(el.id)}`;
          if (el.name) return `[name="${el.name}"]`;

          const testId = el.dataset?.testid || el.dataset?.cy;
          if (testId) return `[data-testid="${testId}"]`;

          const aria = el.getAttribute('aria-label');
          if (aria) return `[aria-label="${aria.slice(0, 50)}"]`;

          // Fallback: tag + class chain (first two classes only)
          const classes = [...el.classList].slice(0, 2).join('.');
          return classes ? `${el.tagName.toLowerCase()}.${classes}` : el.tagName.toLowerCase();
        }

        function isVisible(el) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }

        document.querySelectorAll(interactiveSelectors.join(',')).forEach(el => {
          if (!isVisible(el)) return;

          const text  = (el.innerText || el.value || el.placeholder || el.title || '').slice(0, 80).trim();
          const tag   = el.tagName.toLowerCase();
          const type  = el.type || '';
          const href  = el.href || '';
          const sel   = getSelector(el);

          if (seen.has(sel)) return;
          seen.add(sel);

          elements.push({ tag, type, text, href, selector: sel });
          if (elements.length >= 60) return; // cap to avoid huge prompts
        });

        return elements;
      });

      const url   = this.page.url();
      const title = await this.page.title();

      const lines = [
        `URL: ${url}`,
        `Title: ${title}`,
        '',
        'Interactive elements:',
        ...snapshot.map(e => {
          const parts = [`[${e.tag}${e.type ? `[${e.type}]` : ''}]`, `selector="${e.selector}"`];
          if (e.text)  parts.push(`text="${e.text}"`);
          if (e.href)  parts.push(`href="${e.href.slice(0, 80)}"`);
          return '  ' + parts.join(' ');
        }),
      ];

      return lines.join('\n');
    } catch (err) {
      return `Error building DOM snapshot: ${err.message}`;
    }
  }

  // ── Action Executor ──────────────────────────────────────

  /**
   * Execute a single action object as returned by the LLM.
   * Returns a string observation describing what happened.
   */
  async executeAction(action) {
    logger.info(`[Action] ${action.type} ${JSON.stringify(action).slice(0, 120)}`);

    switch (action.type) {

      // ── Navigation ──────────────────────────────────────
      case 'navigate': {
        await this.page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        return `Navigated to ${action.url}. Current title: ${await this.page.title()}`;
      }

      case 'back': {
        await this.page.goBack();
        return `Went back. Now at: ${this.page.url()}`;
      }

      case 'forward': {
        await this.page.goForward();
        return `Went forward. Now at: ${this.page.url()}`;
      }

      case 'reload': {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        return `Page reloaded. URL: ${this.page.url()}`;
      }

      // ── Click ────────────────────────────────────────────
      case 'click': {
        const el = await this._resolve(action.selector);
        await el.click({ timeout: 10000 });
        await this.page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
        return `Clicked "${action.selector}". Now at: ${this.page.url()}`;
      }

      // ── Type / Fill ──────────────────────────────────────
      case 'type': {
        const el = await this._resolve(action.selector);
        if (action.clear !== false) await el.clear();
        await el.type(action.text, { delay: 50 });
        return `Typed "${action.text}" into "${action.selector}"`;
      }

      // ── Select dropdown ──────────────────────────────────
      case 'select': {
        const el = await this._resolve(action.selector);
        await el.selectOption(action.value);
        return `Selected "${action.value}" in "${action.selector}"`;
      }

      // ── Hover ────────────────────────────────────────────
      case 'hover': {
        const el = await this._resolve(action.selector);
        await el.hover();
        return `Hovered over "${action.selector}"`;
      }

      // ── Scroll ────────────────────────────────────────────
      case 'scroll': {
        const { direction = 'down', amount = 300 } = action;
        const delta = {
          down:  { x: 0, y:  amount },
          up:    { x: 0, y: -amount },
          right: { x:  amount, y: 0 },
          left:  { x: -amount, y: 0 },
        }[direction] ?? { x: 0, y: amount };

        await this.page.mouse.wheel(delta.x, delta.y);
        await this.page.waitForTimeout(400);
        return `Scrolled ${direction} by ${amount}px`;
      }

      // ── Press key ────────────────────────────────────────
      case 'press_key': {
        await this.page.keyboard.press(action.key);
        return `Pressed key: ${action.key}`;
      }

      // ── Extract data ─────────────────────────────────────
      case 'extract': {
        const { selector, attribute = 'text', multiple = false } = action;
        const attr = attribute === 'text' ? 'innerText' : attribute;

        if (multiple) {
          const values = await this.page.$$eval(
            selector,
            (els, a) => els.map(e => (a === 'innerText' ? e.innerText : e.getAttribute(a)) ?? '').filter(Boolean),
            attr,
          );
          return `Extracted ${values.length} items from "${selector}":\n${values.slice(0, 20).join('\n')}`;
        }

        const value = await this.page.$eval(
          selector,
          (el, a) => (a === 'innerText' ? el.innerText : el.getAttribute(a)) ?? '',
          attr,
        );
        return `Extracted from "${selector}": ${value.slice(0, 500)}`;
      }

      // ── Screenshot ───────────────────────────────────────
      case 'screenshot': {
        const filename = action.filename ?? `screenshot-${Date.now()}.png`;
        if (!existsSync(this.screenshotDir)) mkdirSync(this.screenshotDir, { recursive: true });
        const path = resolve(this.screenshotDir, filename);
        await this.page.screenshot({ path, fullPage: false });
        return `Screenshot saved to: ${path}`;
      }

      // ── Wait ─────────────────────────────────────────────
      case 'wait': {
        await this.page.waitForTimeout(action.ms ?? 1000);
        return `Waited ${action.ms ?? 1000}ms`;
      }

      case 'wait_for': {
        await this.page.waitForSelector(action.selector, { timeout: action.timeout ?? 10000 });
        return `Element "${action.selector}" appeared`;
      }

      // ── Tab management ───────────────────────────────────
      case 'new_tab': {
        const newPage = await this.context.newPage();
        if (action.url) await newPage.goto(action.url, { waitUntil: 'domcontentloaded' });
        this.page = newPage;
        return `Opened new tab. URL: ${this.page.url()}`;
      }

      case 'close_tab': {
        await this.page.close();
        const pages = this.context.pages();
        this.page   = pages[pages.length - 1];
        return `Closed tab. Now on: ${this.page.url()}`;
      }

      default:
        return `Unknown action type: "${action.type}"`;
    }
  }

  // ── Helper: resolve a selector or visible text ────────────

  async _resolve(selector) {
    // Try CSS selector first
    let el = null;
    try {
      el = this.page.locator(selector).first();
      await el.waitFor({ state: 'visible', timeout: 5000 });
      return el;
    } catch {}

    // Fallback: find by visible text (for links and buttons)
    try {
      el = this.page.getByText(selector, { exact: false }).first();
      await el.waitFor({ state: 'visible', timeout: 3000 });
      return el;
    } catch {}

    throw new Error(`Element not found: "${selector}"`);
  }
}
