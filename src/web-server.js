/**
 * src/web-server.js
 * Express + WebSocket server — serves the Web UI and streams agent activity.
 * Start with: node src/web-server.js  →  http://localhost:3000
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { config } from '../config/index.js';
import { AgentCore } from './agent/core.js';
import { registerSetupRoutes } from './setup/config-api.js';
import logger from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app    = express();
const server = createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(resolve(__dirname, '../web-ui')));

// ── Setup wizard API ──────────────────────────────────────
registerSetupRoutes(app);

// ── WebSocket broadcast ───────────────────────────────────
function broadcast(type, data) {
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  wss.clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}

// ── Run task ──────────────────────────────────────────────
app.post('/api/run', async (req, res) => {
  const { task, provider } = req.body;
  if (!task) return res.status(400).json({ error: 'task is required' });
  if (provider) config.llm.provider = provider;

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

// ── Config info ───────────────────────────────────────────
app.get('/api/config', (_req, res) => {
  res.json({
    provider: config.llm.provider,
    model:    config.llm[config.llm.provider]?.model ?? 'unknown',
    headless: config.browser.headless,
    maxSteps: config.agent.maxSteps,
  });
});

const port = config.webUI.port;
server.listen(port, () => {
  logger.info(`[WebServer] Running at http://localhost:${port}`);
  console.log(`\n🌐 Open: http://localhost:${port}\n`);
});
