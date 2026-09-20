# J Presence

J Presence is a compact, server-backed presence layer for J inside ordinary ChatGPT conversations. It is independent from `j-resonance`, NetEase, and all music features.

This repository contains the first working prototype:

- configurable shared avatar
- `J` + status + metallic indicator in the collapsed view
- one short live aside and an optional detail line in the expanded view
- durable server-side state with live-aside expiry
- throttled model-written updates through MCP
- slow, configurable idle fallbacks
- a light frosted-glass MCP Apps widget for ChatGPT

## Run locally

Requirements: Node.js 20 or newer and npm/pnpm.

```bash
npm install
npm run build
npm test
npm start
```

The server starts on `http://127.0.0.1:8787` by default:

- visual preview: `http://127.0.0.1:8787/`
- MCP endpoint: `http://127.0.0.1:8787/mcp`
- health check: `http://127.0.0.1:8787/health`

Use `J_PRESENCE_HOST` and `J_PRESENCE_PORT` to override the bind address and port. `npm run dev` builds once and then runs the compiled server with Node's watch mode.

For MCP-level inspection:

```bash
npx @modelcontextprotocol/inspector
```

Choose Streamable HTTP and enter `http://127.0.0.1:8787/mcp`.

## Connect to ChatGPT

The current OpenAI plugin flow requires the MCP server to be registered in ChatGPT developer mode. A hosted ChatGPT client cannot reach your computer's `localhost` directly.

1. Start J Presence locally.
2. Expose `http://127.0.0.1:8787/mcp` with OpenAI's Secure MCP Tunnel for private development, or deploy it behind a stable HTTPS endpoint.
3. In ChatGPT, enable Developer mode under **Settings → Security and login**.
4. Open ChatGPT Plugins, add the MCP server URL, and complete the connection.
5. In a conversation, ask to “Show J Presence” so ChatGPT calls `j_presence_show`.

For a production deployment, add proper user authentication and map each authenticated user to their own state. The prototype is intentionally a single-person server and should not be exposed as a public unauthenticated service.

Official references used for this prototype:

- [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)
- [Add UI to an MCP server](https://developers.openai.com/plugins/build/chatgpt-ui)
- [Plugin UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines)
- [Plugin UI reference](https://developers.openai.com/plugins/reference)
- [Package a plugin](https://developers.openai.com/plugins/build/plugins)

## MCP tools

### `j_presence_update`

Writes intentional short presence data:

- `status` — up to 24 characters
- `aside` — optional, up to 140 characters
- `detail` — optional, up to 100 characters
- `expiresAt` — optional ISO-8601 expiry; otherwise the configured TTL is used

The tool description tells the model to write from current conversational context, avoid restating the main response, skip routine turns, use quiet language in serious moments, and never expose conversation text, tool arguments, filenames, secrets, or hidden context. Repeated non-status updates are throttled.

### `j_presence_get`

Returns the current authoritative state without rendering a new widget. The open widget calls it through the standard MCP Apps `tools/call` bridge every 15 seconds while visible.

### `j_presence_show`

Returns the same state and attaches the compact MCP Apps UI resource. Data tools and rendering are separated so live updates do not repeatedly remount the iframe.

## Replace the avatar

Edit `config/presence.json`, change `avatarUrl`, and restart the server. No component code changes are needed.

Supported values:

```json
{
  "avatarUrl": "asset:assets/my-j-avatar.png"
}
```

```json
{
  "avatarUrl": "https://example.com/my-j-avatar.webp"
}
```

An `asset:` path must remain inside the repository and use SVG, PNG, JPEG, GIF, or WebP. The server embeds local assets as an image data URL. HTTPS images are added to the widget resource's CSP allowlist. Both web and mobile render the same `avatarUrl` from the server snapshot.

The bundled `assets/j-avatar.svg` is only the default configured asset; the UI component does not contain or assume it.

## State and idle behavior

Authoritative state is saved in `data/presence-state.json` (gitignored):

- status
- aside
- detail
- resolved avatar URL
- update timestamp
- aside expiry

The UI keeps only presentation state (`expanded`) and temporary animation state. Live asides override idle fallbacks. When a live aside expires, its detail is cleared too.

Idle behavior is configured in `config/presence.json`:

- `asideTtlSeconds`: default live-aside lifetime
- `updateCooldownSeconds`: minimum interval for repeated non-status updates
- `idleAfterSeconds`: delay before an idle fallback can appear
- `idlePhraseCooldownSeconds`: minimum fallback rotation interval
- `idlePhrases`: small fallback library

Fallback selection is deterministic from server time and the last meaningful update. It does not claim that a model ran or that J independently thought something.

## Web and mobile behavior

The implementation follows the current supported presentation modes: inline, picture-in-picture (PiP), and fullscreen.

- **Web/desktop:** the widget starts inline. Expanding it requests ChatGPT's optional PiP mode when `requestDisplayMode` is available. The host may decline; the inline card remains functional.
- **Mobile:** at compact viewports, expansion stays inline and does not request PiP. This is the native-feeling fallback because current OpenAI documentation notes that mobile may present PiP as fullscreen.
- **Persistence limit:** PiP is host-managed and persists only for the active conversation session until dismissed or the session ends. J Presence cannot create an app-global overlay across unrelated chats.
- **Cross-device state:** web and mobile read the same state when they connect to the same running/deployed J Presence server. Widget-local expanded/collapsed state is not shared.

The interface uses system sans-serif typography, warm-white translucent surfaces, silver borders, soft gray-blue shadows, restrained mist/cobalt accents, a CSS metallic coin, and reduced-motion fallbacks. It contains no model, token, memory, score, or tool telemetry.

## Repository layout

```text
assets/j-avatar.svg            Default replaceable avatar asset
config/presence.json           Avatar, timing, cooldown, and fallback configuration
src/presence-store.ts          Persistence, TTL, throttling, idle fallback logic
src/mcp-server.ts              MCP tools and UI resource registration
src/widget.ts                  Compact frosted-glass MCP Apps widget
src/server.ts                  Streamable HTTP and stdio entrypoint
src/test/*.test.ts             State and MCP integration tests
.codex-plugin/plugin.json      Supported compatibility plugin manifest
.mcp.json                      Local MCP endpoint wiring
```

## Privacy boundary

J Presence accepts and stores only the deliberately short fields above. It has no input for full conversation history, hidden model context, raw tool arguments, or filenames. The widget renders values using `textContent`, not HTML. The server normalizes whitespace, enforces strict length limits, and accepts avatars only from repository assets, image data URLs, or HTTPS.

## License

MIT

