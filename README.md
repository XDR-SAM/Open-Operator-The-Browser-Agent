# 🤖 Autonomous Browser Agent

An AI-powered agent that controls a real browser to complete tasks autonomously — using LLM reasoning to plan actions and Playwright to execute them.

```
Plan → Act → Observe → Reflect → Repeat
```

---

## Features

- **Multi-provider LLM support**: Claude, OpenAI, Ollama (local), LM Studio (local)
- **Full browser control**: click, type, scroll, extract, screenshot, tab management
- **Structured action loop**: Plan → Act → Observe → Reflect
- **Safety guardrails**: whitelist-only actions, URL blocklist, input sanitisation
- **CLI mode**: interactive REPL or single `--task` flag
- **Web UI mode**: real-time agent log streamed via WebSocket
- **Docker support**: fully containerised with Playwright Chromium
- **Batch runner**: run multiple tasks from a JSON file

---

## Project Structure

```
autonomous-browser-agent/
├── config/
│   └── index.js              # Config loader + validator
├── src/
│   ├── index.js              # CLI entry point
│   ├── web-server.js         # Express + WebSocket server
│   ├── agent/
│   │   └── core.js           # Plan→Act→Observe loop
│   ├── browser/
│   │   └── controller.js     # Playwright wrapper + DOM snapshot
│   ├── llm/
│   │   └── interface.js      # Unified LLM client (Claude/OpenAI/Ollama/LMStudio)
│   ├── memory/
│   │   └── state.js          # Step history + artifact store
│   └── utils/
│       ├── logger.js         # Winston logger
│       ├── safety.js         # Action validation guardrails
│       └── task-runner.js    # Batch task executor
├── web-ui/
│   └── index.html            # Dark terminal Web UI
├── tasks/
│   └── example-tasks.json    # Ready-to-run example tasks
├── logs/                     # Agent logs (auto-created)
├── screenshots/              # Agent screenshots (auto-created)
├── .env.example              # Environment template
├── Dockerfile
└── docker-compose.yml
```

---

## Quick Start

### 1. Clone & Install

```bash
git clone <your-repo>
cd autonomous-browser-agent
npm install
npx playwright install chromium
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and set your provider + API key:

```env
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
HEADLESS=false          # true = no browser window
```

### 3. Run (CLI — interactive)

```bash
npm start
```

You'll get an interactive prompt. Type any task in natural language:

```
🤖 Enter task: Search Google for the top 5 AI news articles and extract their titles
```

### 4. Run (CLI — single task)

```bash
node src/index.js --task "Go to books.toscrape.com and list the top 5 cheapest books"
```

### 5. Run (Web UI)

```bash
npm run web
# Open http://localhost:3000
```

---

## Provider Configuration

### Claude (Anthropic)
```env
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-your-key
CLAUDE_MODEL=claude-opus-4-5
```

### OpenAI
```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key
OPENAI_MODEL=gpt-4o
```

### Ollama (local, free)
```bash
# Install Ollama: https://ollama.ai
ollama pull llama3
```
```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

### LM Studio (local, free)
```
# Start LM Studio → Local Server → Start Server
```
```env
LLM_PROVIDER=lmstudio
LMSTUDIO_BASE_URL=http://localhost:1234
LMSTUDIO_MODEL=your-model-name
```

Switch provider at runtime:
```bash
node src/index.js --provider ollama --task "Search for AI news"
```

---

## Docker

### Build & Run CLI
```bash
docker compose up agent-cli
```

### Build & Run Web UI
```bash
docker compose up agent-web
# Open http://localhost:3000
```

### Run a single task via Docker
```bash
TASK="Extract top 5 books from books.toscrape.com" docker compose --profile task up agent-task
```

---

## Example Tasks

| Task | What the agent does |
|------|---------------------|
| `Search Google for AI news and extract the top 5 titles` | Opens Google, searches, waits for results, extracts titles |
| `Go to books.toscrape.com and list books under £10` | Navigates, reads prices, filters and reports |
| `Fill the form at selenium.dev/web-form.html` | Fills inputs, selects options, submits |
| `Take a screenshot of example.com` | Navigates, screenshots, reports path |
| `Get trending repos from github.com/trending` | Scrapes GitHub, returns names + star counts |

Run all example tasks:
```bash
node src/utils/task-runner.js --file tasks/example-tasks.json --output results.json
```

Run a single example:
```bash
node src/utils/task-runner.js --file tasks/example-tasks.json --index 0
```

---

## How It Works

```
User Task
    │
    ▼
┌─────────────────────────────────────────────────┐
│                  AgentCore                       │
│                                                  │
│  1. OBSERVE  ← getDOMSnapshot()                  │
│               (URL, title, interactive elements) │
│                                                  │
│  2. PLAN     → LLM (Claude / OpenAI / Ollama)   │
│               Returns: { thought, action, done } │
│                                                  │
│  3. VALIDATE → safety.validateAction()           │
│               Blocks non-browser actions         │
│                                                  │
│  4. ACT      → BrowserController.executeAction() │
│               Playwright executes in real browser│
│                                                  │
│  5. RECORD   → AgentMemory.addStep()             │
│               Builds context for next LLM call   │
│                                                  │
│  6. REFLECT  → Check done / stuck / max-steps   │
│               Loop back to OBSERVE               │
└─────────────────────────────────────────────────┘
    │
    ▼
 Result + Artifacts
```

---

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `claude` | `openai` \| `claude` \| `ollama` \| `lmstudio` |
| `ANTHROPIC_API_KEY` | — | Your Claude API key |
| `OPENAI_API_KEY` | — | Your OpenAI API key |
| `CLAUDE_MODEL` | `claude-opus-4-5` | Claude model name |
| `OPENAI_MODEL` | `gpt-4o` | OpenAI model name |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `llama3` | Ollama model name |
| `LMSTUDIO_BASE_URL` | `http://localhost:1234` | LM Studio server URL |
| `MAX_STEPS` | `25` | Max agent steps per task |
| `STEP_DELAY_MS` | `1000` | Delay between steps (ms) |
| `HEADLESS` | `true` | Run browser headlessly |
| `BROWSER_TYPE` | `chromium` | `chromium` \| `firefox` \| `webkit` |
| `SCREENSHOT_ON_EACH_STEP` | `false` | Screenshot after every step |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `WEB_UI_PORT` | `3000` | Web UI port |

---

## Safety

The agent is restricted to browser-only actions. The safety module:

- **Action whitelist**: only `navigate`, `click`, `type`, `extract`, etc. are allowed — no shell, no file system
- **URL blocklist**: blocks `file://`, `chrome://`, `about:` and self-referential localhost API calls
- **Input sanitisation**: blocks `<script>`, `javascript:`, inline event handlers in typed text
- **Scroll/wait caps**: prevents runaway waits or giant scrolls
- **Stuck detection**: aborts after 3 consecutive errors

---

## Extending the Agent

### Add a new action type

1. Add the handler in `src/browser/controller.js` inside `executeAction()`
2. Add it to the whitelist in `src/utils/safety.js`
3. Describe it in the system prompt in `src/llm/interface.js`

### Add a new LLM provider

1. Add a config block in `config/index.js`
2. Add a `callYourProvider()` function in `src/llm/interface.js`
3. Add a case in the `complete()` switch statement

---

## Requirements

- Node.js ≥ 18
- npm ≥ 9
- One of: Anthropic API key, OpenAI API key, Ollama running locally, or LM Studio running locally
