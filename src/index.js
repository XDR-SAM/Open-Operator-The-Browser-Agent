#!/usr/bin/env node
/**
 * src/index.js
 * CLI entry point for the Autonomous Browser Agent.
 *
 * Usage:
 *   node src/index.js                          # interactive mode
 *   node src/index.js --task "Search Google…"  # single task
 *   node src/index.js --provider claude         # override provider
 */

import { createInterface } from 'readline';
import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { config, validateConfig } from '../config/index.js';
import { AgentCore } from './agent/core.js';
import logger from './utils/logger.js';

// ── CLI definition ─────────────────────────────────────────
program
  .name('agent')
  .description('Autonomous Browser Agent — AI-powered browser automation')
  .option('-t, --task <task>',       'Task to execute (non-interactive mode)')
  .option('-p, --provider <name>',   'LLM provider override: openai|claude|ollama|lmstudio')
  .option('--headless',              'Run browser in headless mode')
  .option('--visible',               'Run browser with visible UI (overrides headless setting)')
  .option('--max-steps <n>',         'Max agent steps', parseInt)
  .parse(process.argv);

const opts = program.opts();

// Apply CLI overrides to config
if (opts.provider)  config.llm.provider          = opts.provider;
if (opts.headless)  config.browser.headless       = true;
if (opts.visible)   config.browser.headless       = false;
if (opts.maxSteps)  config.agent.maxSteps         = opts.maxSteps;

// ── Banner ─────────────────────────────────────────────────
function printBanner() {
  console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║   🤖  Autonomous Browser Agent  v1.0     ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════╝\n'));
  console.log(chalk.dim(`Provider : ${chalk.white(config.llm.provider)}`));
  console.log(chalk.dim(`Browser  : ${chalk.white(config.browser.type)} (headless=${config.browser.headless})`));
  console.log(chalk.dim(`Max steps: ${chalk.white(config.agent.maxSteps)}\n`));
}

// ── Step display callback ──────────────────────────────────
function onStep(step) {
  console.log(chalk.dim('─'.repeat(60)));
  console.log(chalk.bold.yellow(`Step ${step.stepNo}`));
  console.log(chalk.cyan('  💭 Thought: ') + step.thought);
  console.log(chalk.green('  ⚡ Action:  ') + JSON.stringify(step.action));
  console.log(chalk.white('  👁️  Observe: ') + step.observation.slice(0, 200));
  if (step.error) {
    console.log(chalk.red('  ❌ Error:   ') + step.error);
  }
}

// ── Run a single task ──────────────────────────────────────
async function runTask(task) {
  const spinner = ora({ text: 'Agent thinking…', color: 'cyan' }).start();
  spinner.stop(); // We show real-time step logs instead

  console.log(chalk.bold(`\n📋 Task: "${task}"\n`));

  const agent = new AgentCore({ onStep });
  const { success, result, artifacts, summary } = await agent.run(task);

  // ── Final summary ────────────────────────────────────────
  console.log(chalk.dim('\n' + '═'.repeat(60)));
  console.log(chalk.bold(success ? chalk.green('✅ TASK COMPLETE') : chalk.red('❌ TASK FAILED')));
  console.log(chalk.white(`Result: ${result}`));
  console.log(chalk.dim(`Steps: ${summary.steps} | Errors: ${summary.errors} | Time: ${summary.elapsed}s`));

  if (Object.keys(artifacts).length > 0) {
    console.log(chalk.bold.cyan('\n📦 Extracted Artifacts:'));
    for (const [key, val] of Object.entries(artifacts)) {
      console.log(chalk.cyan(`  ${key}:`));
      console.log(chalk.white(`    ${String(val).slice(0, 400)}`));
    }
  }

  return success;
}

// ── Interactive REPL ───────────────────────────────────────
async function interactiveMode() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const ask = () => new Promise(resolve => {
    rl.question(chalk.bold.cyan('\n🤖 Enter task (or "exit"): '), resolve);
  });

  console.log(chalk.dim('Type a task in natural language. Examples:'));
  console.log(chalk.dim('  • Search Google for top 5 AI news articles and extract titles'));
  console.log(chalk.dim('  • Go to toscrape.com and extract all book titles'));
  console.log(chalk.dim('  • Navigate to example.com and take a screenshot'));

  while (true) {
    const task = (await ask()).trim();
    if (!task || task.toLowerCase() === 'exit') {
      console.log(chalk.dim('\nGoodbye! 👋\n'));
      rl.close();
      break;
    }
    await runTask(task);
  }
}

// ── Main ───────────────────────────────────────────────────
async function main() {
  printBanner();

  try {
    validateConfig();
  } catch (err) {
    console.error(chalk.red(err.message));
    process.exit(1);
  }

  if (opts.task) {
    const ok = await runTask(opts.task);
    process.exit(ok ? 0 : 1);
  } else {
    await interactiveMode();
  }
}

main().catch(err => {
  logger.error(`[System] Unhandled error: ${err.message}`);
  console.error(chalk.red(err.stack));
  process.exit(1);
});
