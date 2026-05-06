/**
 * src/memory/state.js
 * In-process memory store for the agent's working state.
 *
 * Tracks:
 *  - The original task
 *  - All steps taken (thought + action + observation)
 *  - Extracted data artifacts
 *  - Error history for retry logic
 */

export class AgentMemory {
  constructor(task) {
    this.task       = task;                // Original user instruction
    this.steps      = [];                  // [{stepNo, thought, action, observation, error}]
    this.artifacts  = {};                  // Named data extractions { key: value }
    this.startTime  = Date.now();
    this.stepCount  = 0;
  }

  // ── Record a completed step ──────────────────────────────

  addStep({ thought, action, observation, error = null }) {
    this.stepCount++;
    const step = {
      stepNo:      this.stepCount,
      timestamp:   new Date().toISOString(),
      thought,
      action,
      observation,
      error,
    };
    this.steps.push(step);
    return step;
  }

  // ── Store extracted data ─────────────────────────────────

  saveArtifact(key, value) {
    this.artifacts[key] = value;
  }

  // ── Get last N steps for context window ─────────────────

  getRecentSteps(n = 8) {
    return this.steps.slice(-n);
  }

  // ── Check consecutive error count (for stuck detection) ──

  consecutiveErrors() {
    let count = 0;
    for (let i = this.steps.length - 1; i >= 0; i--) {
      if (this.steps[i].error) count++;
      else break;
    }
    return count;
  }

  // ── Build the conversation history for the LLM ───────────

  buildMessages(currentObservation) {
    const recentSteps = this.getRecentSteps(8);

    // Summarise history so we don't blow the context window
    const history = recentSteps
      .map(s => {
        const parts = [
          `Step ${s.stepNo}:`,
          `  Thought: ${s.thought}`,
          `  Action: ${JSON.stringify(s.action)}`,
          `  Observation: ${s.observation}`,
        ];
        if (s.error) parts.push(`  Error: ${s.error}`);
        return parts.join('\n');
      })
      .join('\n\n');

    const userContent = [
      `Task: ${this.task}`,
      '',
      history ? `Previous steps:\n${history}` : 'No steps taken yet.',
      '',
      `Current observation:\n${currentObservation}`,
    ].join('\n');

    // Single-turn message — system prompt is provided separately
    return [{ role: 'user', content: userContent }];
  }

  // ── Summary for display ───────────────────────────────────

  getSummary() {
    return {
      task:       this.task,
      steps:      this.stepCount,
      artifacts:  Object.keys(this.artifacts).length,
      elapsed:    Math.round((Date.now() - this.startTime) / 1000),
      errors:     this.steps.filter(s => s.error).length,
    };
  }
}
