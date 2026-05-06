# ============================================================
# Autonomous Browser Agent — Dockerfile
# Node 20 + Playwright (Chromium) on Debian Bookworm slim
# ============================================================

FROM node:20-bookworm-slim

# ── System dependencies for Playwright / Chromium ──────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# ── App directory ──────────────────────────────────────────
WORKDIR /app

# ── Install Node dependencies first (layer cache) ──────────
COPY package.json ./
RUN npm install --omit=dev

# ── Install Playwright browsers ────────────────────────────
RUN npx playwright install chromium --with-deps

# ── Copy source ────────────────────────────────────────────
COPY . .

# ── Runtime directories ────────────────────────────────────
RUN mkdir -p logs screenshots

# ── Default env (overridden at runtime via --env-file) ─────
ENV NODE_ENV=production \
    HEADLESS=true \
    LLM_PROVIDER=claude

# ── Expose Web UI port ─────────────────────────────────────
EXPOSE 3000

# ── Default: interactive CLI ───────────────────────────────
CMD ["node", "src/index.js"]
