/**
 * src/utils/logger.js
 * Winston-based structured logger with pretty console output + file sink.
 */

import winston from 'winston';
import chalk from 'chalk';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { config } from '../../config/index.js';

// Ensure log directory exists
const logDir = dirname(config.log.file);
if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

// ── Colour map for log levels ──────────────────────────────
const LEVEL_COLOURS = {
  error: chalk.red.bold,
  warn:  chalk.yellow.bold,
  info:  chalk.cyan,
  debug: chalk.gray,
};

// ── Emoji prefix per semantic tag ─────────────────────────
const TAG_ICONS = {
  '[Agent]':    '🤖',
  '[Browser]':  '🌐',
  '[LLM]':      '🧠',
  '[Memory]':   '💾',
  '[Action]':   '⚡',
  '[Plan]':     '📋',
  '[Observe]':  '👁️ ',
  '[Error]':    '❌',
  '[Retry]':    '🔄',
  '[System]':   '🖥️ ',
};

function addIcon(msg) {
  for (const [tag, icon] of Object.entries(TAG_ICONS)) {
    if (msg.includes(tag)) return `${icon}  ${msg}`;
  }
  return msg;
}

// ── Custom console format ──────────────────────────────────
const consoleFormat = winston.format.printf(({ level, message, timestamp }) => {
  const colour = LEVEL_COLOURS[level] || chalk.white;
  const ts     = chalk.dim(new Date(timestamp).toLocaleTimeString());
  return `${ts} ${colour(level.padEnd(5))} ${addIcon(message)}`;
});

// ── Winston instance ───────────────────────────────────────
const logger = winston.createLogger({
  level: config.log.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
  ),
  transports: [
    // Pretty console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        consoleFormat,
      ),
    }),
    // JSON file sink for post-run analysis
    new winston.transports.File({
      filename: config.log.file,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
  ],
});

export default logger;
