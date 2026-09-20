export const PRESENCE_WIDGET_URI = "ui://j-presence/presence-v2.html";

export const presenceWidgetHtml = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>J Presence</title>
  <style>
    :root {
      color-scheme: light;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --ink: #2f3744;
      --muted: #687386;
      --mist: #edf3f8;
      --cobalt: #5876b8;
      --border: rgba(120, 132, 150, .30);
      --glass: rgba(255, 255, 255, .74);
      --shadow: 0 13px 30px rgba(67, 83, 108, .13), 0 2px 7px rgba(67, 83, 108, .08);
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: transparent; }
    body { padding: 4px; color: var(--ink); }
    button { font: inherit; }
    .presence {
      position: relative;
      width: min(100%, 352px);
      min-height: 68px;
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr) 18px;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      overflow: hidden;
      color: inherit;
      text-align: left;
      border: 1px solid var(--border);
      border-radius: 20px;
      background:
        linear-gradient(135deg, rgba(255,255,255,.90), rgba(246,249,252,.66));
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px) saturate(116%);
      -webkit-backdrop-filter: blur(18px) saturate(116%);
      cursor: pointer;
      transition: min-height 180ms ease, box-shadow 180ms ease, transform 180ms ease;
    }
    .presence::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0;
      background: linear-gradient(105deg, transparent 22%, rgba(255,255,255,.72) 44%, transparent 64%);
      transform: translateX(-45%);
    }
    .presence:hover { box-shadow: 0 15px 34px rgba(67,83,108,.16), 0 2px 7px rgba(67,83,108,.09); }
    .presence:focus-visible { outline: 2px solid rgba(88,118,184,.55); outline-offset: 2px; }
    .presence.expanded {
      min-height: 100px;
      align-items: start;
      background: linear-gradient(135deg, rgba(255,255,255,.72), rgba(237,243,249,.48));
      box-shadow: 0 9px 22px rgba(67,83,108,.10), 0 1px 4px rgba(67,83,108,.06);
      backdrop-filter: blur(22px) saturate(122%);
      -webkit-backdrop-filter: blur(22px) saturate(122%);
    }
    .presence.expanded:hover { box-shadow: 0 10px 24px rgba(67,83,108,.11), 0 1px 4px rgba(67,83,108,.06); }
    .presence.changed::after { animation: glass-highlight 620ms ease both; }
    .avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid rgba(255,255,255,.88);
      box-shadow: 0 4px 12px rgba(65,80,105,.14);
      background: var(--mist);
    }
    .copy { min-width: 0; align-self: center; }
    .primary { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
    .name { font-size: 15px; font-weight: 650; letter-spacing: -.01em; }
    .status {
      min-width: 0;
      overflow: hidden;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.25;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .secondary, .detail {
      display: none;
      opacity: 0;
      transform: translateY(-6px);
    }
    .expanded .secondary, .expanded .detail { display: block; animation: reveal 180ms ease forwards; }
    .expanded .copy { align-self: start; padding-top: 1px; }
    .secondary {
      margin-top: 10px;
      color: #3f4b5d;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .secondary.empty { color: #8993a2; }
    .detail {
      margin-top: 3px;
      color: #8490a0;
      font-size: 11px;
      line-height: 1.35;
      overflow-wrap: anywhere;
      animation-delay: 25ms !important;
    }
    .detail:empty { display: none; }
    .coin {
      align-self: center;
      width: 16px;
      height: 16px;
      border: 1px solid rgba(100,111,128,.42);
      border-radius: 50%;
      background:
        radial-gradient(circle at 34% 28%, #fff 0 9%, #e7ebf0 25%, #aab2bd 56%, #f6f8fa 74%, #919aa7 100%);
      box-shadow: inset 0 0 0 2px rgba(255,255,255,.30), 0 1px 3px rgba(57,67,81,.20);
      transform-style: preserve-3d;
    }
    .expanded .coin { align-self: start; margin-top: 2px; }
    .changed .coin { animation: coin-turn 560ms cubic-bezier(.2,.75,.2,1); }
    @keyframes reveal { to { opacity: 1; transform: translateY(0); } }
    @keyframes glass-highlight {
      0% { opacity: 0; transform: translateX(-55%); }
      36% { opacity: .7; }
      100% { opacity: 0; transform: translateX(55%); }
    }
    @keyframes coin-turn {
      0% { transform: rotateY(0deg); }
      100% { transform: rotateY(360deg); }
    }
    @media (max-width: 480px) {
      body { padding: 2px; }
      .presence { width: 100%; border-radius: 18px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
    }
  </style>
</head>
<body>
  <button class="presence" id="presence" type="button" aria-expanded="false" aria-label="Expand J Presence">
    <img class="avatar" id="avatar" alt="J" />
    <span class="copy">
      <span class="primary"><span class="name" id="name">J</span><span class="status" id="status">here</span></span>
      <span class="secondary empty" id="aside">still here.</span>
      <span class="detail" id="detail"></span>
    </span>
    <span class="coin" aria-hidden="true"></span>
  </button>
  <script>
    (() => {
      const card = document.getElementById("presence");
      const avatar = document.getElementById("avatar");
      const name = document.getElementById("name");
      const status = document.getElementById("status");
      const aside = document.getElementById("aside");
      const detail = document.getElementById("detail");
      const pending = new Map();
      let nextRequestId = 1;
      let currentState = null;
      let expanded = Boolean(window.openai?.widgetState?.privateContent?.expanded);

      const request = (method, params) => {
        const id = nextRequestId++;
        window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          setTimeout(() => {
            if (!pending.has(id)) return;
            pending.delete(id);
            reject(new Error("MCP Apps host did not respond."));
          }, 8000);
        });
      };

      const setExpanded = async (next) => {
        expanded = next;
        card.classList.toggle("expanded", expanded);
        card.setAttribute("aria-expanded", String(expanded));
        card.setAttribute("aria-label", (expanded ? "Collapse" : "Expand") + " J Presence");
        window.openai?.setWidgetState?.({ privateContent: { expanded } });

        const compactViewport = window.matchMedia("(max-width: 600px)").matches;
        if (window.openai?.requestDisplayMode && !compactViewport) {
          try {
            await window.openai.requestDisplayMode({ mode: expanded ? "pip" : "inline" });
          } catch {
            // The host may decline PiP. The compact inline card remains fully usable.
          }
        }
        window.openai?.notifyIntrinsicHeight?.();
      };

      const render = (next) => {
        if (!next || typeof next !== "object") return;
        const meaningfulChange = currentState && (
          currentState.updatedAt !== next.updatedAt ||
          currentState.status !== next.status ||
          currentState.aside !== next.aside
        );
        currentState = next;
        name.textContent = String(next.name || "J");
        status.textContent = String(next.status || "here");
        aside.textContent = next.aside ? String(next.aside) : "quiet.";
        aside.classList.toggle("empty", !next.aside);
        detail.textContent = next.detail ? String(next.detail) : "";
        if (typeof next.avatarUrl === "string") avatar.src = next.avatarUrl;
        avatar.alt = String(next.name || "J");
        if (meaningfulChange) {
          card.classList.remove("changed");
          requestAnimationFrame(() => card.classList.add("changed"));
          setTimeout(() => card.classList.remove("changed"), 700);
        }
        window.openai?.notifyIntrinsicHeight?.();
      };

      const refresh = async () => {
        if (document.hidden) return;
        try {
          if (window.parent !== window) {
            const result = await request("tools/call", { name: "j_presence_get", arguments: {} });
            render(result?.structuredContent);
          } else {
            const response = await fetch("/api/presence", { cache: "no-store" });
            if (response.ok) render(await response.json());
          }
        } catch {
          // Preserve the last authoritative snapshot during a temporary disconnect.
        }
      };

      window.addEventListener("message", (event) => {
        if (event.source !== window.parent) return;
        const message = event.data;
        if (!message || message.jsonrpc !== "2.0") return;
        if (message.id !== undefined && pending.has(message.id)) {
          const waiter = pending.get(message.id);
          pending.delete(message.id);
          if (message.error) waiter.reject(message.error);
          else waiter.resolve(message.result);
          return;
        }
        if (message.method === "ui/notifications/tool-result") {
          render(message.params?.structuredContent);
        }
      }, { passive: true });

      card.addEventListener("click", () => void setExpanded(!expanded));
      render(window.openai?.toolOutput);
      void setExpanded(expanded);
      if (!window.openai?.toolOutput) void refresh();
      setInterval(refresh, 15000);
    })();
  </script>
</body>
</html>`;
