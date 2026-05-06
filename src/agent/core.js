/**
 * src/agent/core.js
 * The heart of the autonomous agent.
 *
 * Implements the Plan → Act → Observe → Reflect loop:
 *
 *  1. Build observation (DOM snapshot + current state)
 *  2. Ask LLM for the next action (Plan)
 *  3. Execute the action (Act)
 *  4. Record the observation (Observe)
 *  5. Check for termination / retry conditions (Reflect)
 *  6. Repeat
 */

import { complete } from '../llm/interface.js';
import { BrowserController } from '../browser/controller.js';
import { AgentMemory } from '../memory/state.js';
import { validateAction } from '../utils/safety.js';
import { config } from '../../config/index.js';
import logger from '../utils/logger.js';

export class AgentCore {
  /**
   * @param {object} [opts]
   * @param {function} [opts.onStep]   - Callback called after each step: (step) => void
   * @param {function} [opts.onDone]   - Callback when task completes: (result) => void
   */
  constructor(opts = {}) {
    this.browser   = new BrowserController();
    this.onStep    = opts.onStep    ?? (() => {});
    this.onDone    = opts.onDone    ?? (() => {});
  }

  // ── Public API ───────────────────────────────────────────

  /**
   * Run a task to completion.
   *
   * @param {string} task - Natural language instruction
   * @returns {Promise<{success: boolean, result: string, artifacts: object}>}
   */
  async run(task) {
    logger.info(`[Agent] Starting task: "${task}"`);

    const memory = new AgentMemory(task);
    await this.browser.launch();

    let finalResult = null;
    let success     = false;

    try {
      finalResult = await this._loop(memory);
      success     = true;
    } catch (err) {
      logger.error(`[Agent] Fatal error: ${err.message}`);
      finalResult = `Agent failed: ${err.message}`;
    } finally {
      await this.browser.close();
    }

    const summary = memory.getSummary();
    logger.info(
      `[Agent] Done in ${summary.elapsed}s — ${summary.steps} steps, ${summary.errors} errors`,
    );

    this.onDone({ success, result: finalResult, artifacts: memory.artifacts, summary });
    return { success, result: finalResult, artifacts: memory.artifacts, summary };
  }

  // ── Internal loop ────────────────────────────────────────

  async _loop(memory) {
    const { maxSteps, stepDelayMs, screenshotEachStep } = config.agent;

    for (let i = 0; i < maxSteps; i++) {
      // ── 1. Observe ──────────────────────────────────────
      const domSnapshot = await this.browser.getDOMSnapshot();
      logger.debug(`[Observe] DOM snapshot:\n${domSnapshot.slice(0, 400)}…`);

      // ── 2. Plan ─────────────────────────────────────────
      const messages = memory.buildMessages(domSnapshot);

      logger.info(`[Plan] Asking ${config.llm.provider} for next action (step ${i + 1}/${maxSteps})`);
      let llmResponse;
      try {
        llmResponse = await complete(messages);
      } catch (err) {
        logger.error(`[LLM] Call failed: ${err.message}`);
        memory.addStep({
          thought:     'LLM call failed',
          action:      { type: 'wait', ms: 2000 },
          observation: 'Waiting after LLM failure',
          error:       err.message,
        });
        continue;
      }

      const { thought, action, done, result } = llmResponse;

      logger.info(`[Plan] Thought: ${thought}`);
      logger.info(`[Plan] Action: ${JSON.stringify(action)}`);

      // ── 3. Safety check ──────────────────────────────────
      const safety = validateAction(action);
      if (!safety.ok) {
        logger.warn(`[Agent] Blocked unsafe action: ${safety.reason}`);
        memory.addStep({
          thought,
          action,
          observation: `Action blocked: ${safety.reason}`,
          error: 'SAFETY_BLOCK',
        });
        continue;
      }

      // ── 4. Termination check ─────────────────────────────
      if (done) {
        logger.info(`[Agent] Task complete! Result: ${result}`);
        return result ?? 'Task completed successfully';
      }

      // ── 5. Act ───────────────────────────────────────────
      let observation = '';
      let error       = null;

      try {
        observation = await this.browser.executeAction(action);
        logger.info(`[Observe] ${observation}`);
      } catch (err) {
        error       = err.message;
        observation = `Action failed: ${err.message}`;
        logger.warn(`[Error] Action "${action.type}" failed: ${err.message}`);
      }

      // ── 6. Optional per-step screenshot ──────────────────
      if (screenshotEachStep) {
        try {
          await this.browser.executeAction({ type: 'screenshot', filename: `step-${i + 1}.png` });
        } catch {}
      }

      // ── 7. Record ────────────────────────────────────────
      const step = memory.addStep({ thought, action, observation, error });
      this.onStep(step);

      // Save any extracted data as an artifact
      if (action.type === 'extract' && !error) {
        memory.saveArtifact(`extract_step${step.stepNo}`, observation);
      }

      // ── 8. Stuck detection ───────────────────────────────
      if (memory.consecutiveErrors() >= 3) {
        logger.warn('[Agent] 3 consecutive errors — aborting to prevent infinite loop');
        return `Task aborted after 3 consecutive errors. Last error: ${error}`;
      }

      // Throttle between steps
      if (stepDelayMs > 0) await sleep(stepDelayMs);
    }

    return `Task did not complete within ${maxSteps} steps`;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
