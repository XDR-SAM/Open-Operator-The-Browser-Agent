// ─── AI Browser Agent — Content Script ───────────────────────────────────────
// Injected into every page. Handles visual feedback and message relay.

(function () {
  if (window.__agentInjected) return;
  window.__agentInjected = true;

  // ── Visual Cursor Indicator ────────────────────────────────────────────────

  let cursor = null;

  function showCursor(x, y) {
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.id = '__agent_cursor';
      cursor.style.cssText = `
        position: fixed;
        width: 20px; height: 20px;
        border-radius: 50%;
        background: rgba(124, 106, 255, 0.6);
        border: 2px solid #7c6aff;
        pointer-events: none;
        z-index: 2147483647;
        transition: all 0.2s ease;
        box-shadow: 0 0 12px rgba(124,106,255,0.8);
        transform: translate(-50%, -50%);
      `;
      document.body.appendChild(cursor);
    }
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
    cursor.style.display = 'block';
  }

  function hideCursor() {
    if (cursor) cursor.style.display = 'none';
  }

  // ── Element Highlight ──────────────────────────────────────────────────────

  let highlight = null;

  function highlightElement(el) {
    if (!highlight) {
      highlight = document.createElement('div');
      highlight.id = '__agent_highlight';
      highlight.style.cssText = `
        position: fixed;
        pointer-events: none;
        z-index: 2147483646;
        border: 2px solid #7c6aff;
        background: rgba(124,106,255,0.08);
        border-radius: 4px;
        transition: all 0.2s ease;
        box-shadow: 0 0 0 4px rgba(124,106,255,0.15);
      `;
      document.body.appendChild(highlight);
    }

    const rect = el.getBoundingClientRect();
    highlight.style.left = (rect.left - 2) + 'px';
    highlight.style.top = (rect.top - 2) + 'px';
    highlight.style.width = (rect.width + 4) + 'px';
    highlight.style.height = (rect.height + 4) + 'px';
    highlight.style.display = 'block';

    // Show cursor at element center
    showCursor(rect.left + rect.width / 2, rect.top + rect.height / 2);

    setTimeout(() => {
      if (highlight) highlight.style.display = 'none';
      hideCursor();
    }, 800);
  }

  // ── Toast Notifications ────────────────────────────────────────────────────

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const colors = {
      info: '#7c6aff',
      success: '#00d4aa',
      error: '#ff4f6a',
      warn: '#ffb347'
    };
    const color = colors[type] || colors.info;

    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #111118;
      color: #e8e8f0;
      border: 1px solid ${color};
      border-left: 3px solid ${color};
      border-radius: 8px;
      padding: 10px 14px;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      z-index: 2147483647;
      max-width: 320px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      animation: slideIn 0.3s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: none; opacity: 1; } }
      @keyframes slideOut { to { transform: translateX(110%); opacity: 0; } }
    `;
    document.head.appendChild(style);

    const icon = { info: '🤖', success: '✅', error: '❌', warn: '⚠️' }[type] || '🤖';
    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Message Listener ──────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'HIGHLIGHT_ELEMENT') {
      const el = document.querySelector(msg.selector);
      if (el) highlightElement(el);
    }

    if (msg.type === 'SHOW_TOAST') {
      showToast(msg.message, msg.toastType);
    }

    if (msg.type === 'PING') {
      sendResponse({ ok: true });
    }
  });

})();
