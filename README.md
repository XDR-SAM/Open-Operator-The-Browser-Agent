# 🤖 AI Browser Agent — Chrome Extension

A powerful browser agent that uses AI to control your browser and complete tasks automatically.
No login required. Supports OpenAI, Claude, Ollama, LM Studio, OpenRouter, and any custom API.

---

## 📦 Installation

### Step 1 — Load the Extension in Chrome

1. Open Chrome and go to: `chrome://extensions/`
2. Enable **Developer Mode** (toggle in top-right)
3. Click **"Load unpacked"**
4. Select this folder: `ai-browser-agent/`
5. The extension icon will appear in your toolbar 🎉

---

## ⚙️ Setup Your AI Provider

Click the extension icon → **Settings tab** → Choose a provider:

---

### 🟢 OpenAI (GPT-4o)
- Get API key: https://platform.openai.com/api-keys
- Recommended model: `gpt-4o` (has vision — sees the page)
- Cost: ~$0.005 per page action

---

### 🟣 Claude (Anthropic)
- Get API key: https://console.anthropic.com
- Recommended model: `claude-sonnet-4-5`
- Cost: ~$0.003 per page action

---

### 🦙 Ollama (FREE — runs locally)
1. Install Ollama: https://ollama.ai
2. Pull a vision model:
   ```bash
   ollama pull llama3.2-vision
   # or
   ollama pull minicpm-v
   ```
3. Make sure Ollama is running (it starts automatically)
4. In Settings: URL = `http://localhost:11434`, Model = `llama3.2-vision`
5. **Important**: Chrome can't access localhost by default.
   Go to `chrome://flags/#block-insecure-private-network-requests` → Disable it
   Or run Ollama with: `OLLAMA_ORIGINS=* ollama serve`

---

### 🏠 LM Studio (FREE — runs locally)
1. Download LM Studio: https://lmstudio.ai
2. Download any model (recommend a vision model like `llava`)
3. Go to **Developer** tab → Start Local Server
4. In Settings: URL = `http://localhost:1234`
5. Same Chrome flag fix as Ollama above

---

### 🔀 OpenRouter (100+ models)
- Get API key: https://openrouter.ai/keys
- Free tier available
- Try model: `openai/gpt-4o` or `anthropic/claude-3-5-sonnet`

---

## 🚀 Using the Agent

1. Navigate to any webpage
2. Click the extension icon
3. Type your task in natural language
4. Hit **▶ Run Agent**

### Example Tasks:
```
Search for "best laptops 2024" on Google and tell me the top 3 results

Go to wikipedia.org and find the population of Bangladesh

Fill out the contact form on this page with: Name=John, Email=john@test.com, Message=Hello

Scroll down and find all the prices on this page

Go to news.ycombinator.com and click on the top story
```

---

## 🎛️ Options

| Option | Description |
|--------|-------------|
| 📸 Screenshots | Send page screenshot to AI (better accuracy, uses more tokens) |
| 🌐 DOM context | Send page HTML structure to AI (helps find elements) |
| 🔍 Verbose | Show detailed reasoning in log |
| Max Steps | How many actions before stopping (default: 20) |

---

## 🎯 Supported Actions

The AI can perform these actions:
- `click` — Click any element
- `type` — Type text into inputs
- `navigate` — Go to a URL
- `scroll` — Scroll the page
- `hover` — Hover over elements
- `select` — Choose dropdown options
- `extract` — Extract text from page
- `wait` — Wait for elements to appear
- `back` / `forward` — Browser navigation
- `done` — Mark task complete

---

## 🔧 Troubleshooting

**"API error 401"** → Wrong or missing API key. Check Settings.

**"Element not found"** → The AI used a wrong selector. Try enabling DOM context.

**"Ollama connection refused"** → Make sure Ollama is running: `ollama serve`

**"localhost blocked"** → Disable `block-insecure-private-network-requests` in `chrome://flags`

**Extension not working on chrome:// pages** → Chrome restricts extensions on its own pages. Navigate to a real website first.

---

## 📁 File Structure

```
ai-browser-agent/
├── manifest.json      # Extension config
├── popup.html         # UI popup
├── popup.js           # UI logic
├── background.js      # Agent brain + API calls
├── content.js         # Page interaction + visual feedback
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## 🔒 Privacy

- No data is sent anywhere except the AI provider you choose
- API keys are stored locally in Chrome's extension storage
- Local providers (Ollama/LM Studio) keep all data on your machine
- No telemetry, no tracking, no login
