/**
 * src/web-server.js
 * Optional Express + WebSocket server that streams agent activity to the web UI.
 *
 * Start with: node src/web-server.js
 * Open: http://localhost:3000
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { config, validateConfig } from '../config/index.js';
import { AgentCore } from './agent/core.js';
import logger from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Server setup ──────────────────────────────────────────
const app    = express();
const server = createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(resolve(__dirname, '../web-ui')));

// ── WebSocket broadcast ───────────────────────────────────
function broadcast(type, data) {
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  wss.clients.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

// ── API: Run a task ───────────────────────────────────────
app.post('/api/run', async (req, res) => {
  const { task, provider } = req.body;
  if (!task) return res.status(400).json({ error: 'task is required' });

  // Override provider if requested
  if (provider) config.llm.provider = provider;

  try {
    validateConfig();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // Acknowledge immediately — results stream via WebSocket
  res.json({ status: 'started', task });

  broadcast('task_start', { task, provider: config.llm.provider });

  const agent = new AgentCore({
    onStep: step => broadcast('step', step),
    onDone: result => broadcast('task_done', result),
  });

  agent.run(task).catch(err => {
    broadcast('error', { message: err.message });
    logger.error(`[WebServer] Agent error: ${err.message}`);
  });
});

// ── API: Config info ──────────────────────────────────────
app.get('/api/config', (_req, res) => {
  res.json({
    provider: config.llm.provider,
    model:    config.llm[config.llm.provider]?.model ?? 'unknown',
    headless: config.browser.headless,
    maxSteps: config.agent.maxSteps,
  });
});

// ── Start ─────────────────────────────────────────────────
const port = config.webUI.port;
server.listen(port, () => {
  logger.info(`[WebServer] Running at http://localhost:${port}`);
  console.log(`\n🌐 Web UI: http://localhost:${port}\n`);
});
