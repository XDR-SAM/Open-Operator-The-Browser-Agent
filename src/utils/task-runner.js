/**
 * src/utils/task-runner.js
 * Run multiple tasks from a JSON file sequentially.
 *
 * Usage:
 *   node src/utils/task-runner.js --file tasks/example-tasks.json
 *   node src/utils/task-runner.js --file tasks/example-tasks.json --index 0
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { program } from 'commander';
import chalk from 'chalk';
import { config, validateConfig } from '../../config/index.js';
import { AgentCore } from '../agent/core.js';
import logger from './logger.js';

program
  .option('-f, --file <path>',  'Path to tasks JSON file', 'tasks/example-tasks.json')
  .option('-i, --index <n>',   'Run only task at this index (0-based)', parseInt)
  .option('-o, --output <path>','Save results JSON to this file')
  .parse(process.argv);

const opts = program.opts();

async function main() {
  validateConfig();

  // Load tasks file
  const filePath = resolve(process.cwd(), opts.file);
  const tasks = JSON.parse(readFileSync(filePath, 'utf8'));

  // Filter to single task if --index given
  const toRun = opts.index !== undefined
    ? [{ ...tasks[opts.index], _originalIndex: opts.index }]
    : tasks.map((t, i) => ({ ...t, _originalIndex: i }));

  console.log(chalk.bold.cyan(`\n🤖 Batch Task Runner — ${toRun.length} task(s) to run\n`));

  const results = [];

  for (const taskDef of toRun) {
    console.log(chalk.bold(`\n[${taskDef._originalIndex}] ${taskDef.name}`));
    console.log(chalk.dim(`    ${taskDef.description}`));

    const agent = new AgentCore({
      onStep: step => {
        process.stdout.write(chalk.dim('.'));
      },
    });

    const startMs = Date.now();
    const outcome = await agent.run(taskDef.task);
    const elapsed = Math.round((Date.now() - startMs) / 1000);

    console.log('');  // newline after dots

    const record = {
      index:     taskDef._originalIndex,
      name:      taskDef.name,
      task:      taskDef.task,
      success:   outcome.success,
      result:    outcome.result,
      artifacts: outcome.artifacts,
      summary:   outcome.summary,
      elapsed,
    };

    results.push(record);

    console.log(outcome.success
      ? chalk.green(`    ✅ Done in ${elapsed}s — ${outcome.summary.steps} steps`)
      : chalk.red(`    ❌ Failed in ${elapsed}s — ${outcome.result}`)
    );
  }

  // Print summary table
  console.log(chalk.bold.cyan('\n\n📊 Results Summary'));
  console.log(chalk.dim('─'.repeat(60)));
  results.forEach(r => {
    const status = r.success ? chalk.green('✅') : chalk.red('❌');
    console.log(`${status} [${r.index}] ${r.name.padEnd(25)} ${r.elapsed}s / ${r.summary?.steps ?? '?'} steps`);
  });

  // Save output
  if (opts.output) {
    const outPath = resolve(process.cwd(), opts.output);
    writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(chalk.dim(`\nResults saved to: ${outPath}`));
  }
}

main().catch(err => {
  logger.error(err.message);
  process.exit(1);
});
