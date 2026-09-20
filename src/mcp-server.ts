import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PresenceSnapshot, PresenceStore, PresenceUpdate } from "./presence-store.js";
import { PRESENCE_WIDGET_URI, presenceWidgetHtml } from "./widget.js";

const snapshotSchema = {
  name: z.string(),
  status: z.string(),
  aside: z.string().nullable(),
  detail: z.string().nullable(),
  avatarUrl: z.string(),
  updatedAt: z.string(),
  asideExpiresAt: z.string().nullable(),
  asideSource: z.enum(["live", "fallback"]).nullable(),
};

const stateText = (state: PresenceSnapshot) =>
  [
    `J is ${state.status}.`,
    state.aside ? `Aside: ${state.aside}` : null,
    state.detail ? `Detail: ${state.detail}` : null,
  ]
    .filter(Boolean)
    .join(" ");

export function createPresenceMcpServer(store: PresenceStore): McpServer {
  const server = new McpServer(
    { name: "j-presence", version: "0.1.0" },
    {
      capabilities: { tools: {}, resources: {} },
      instructions:
        "Use j_presence_update sparingly for short, intentionally written presence only. Generate asides from the current conversation; never copy the main response, private filenames, tool arguments, full conversation text, or hidden context. Do not force an aside every turn. Keep serious or emotional moments quiet and simple. Call j_presence_show when the user wants the compact Presence UI.",
    },
  );

  server.registerResource(
    "j-presence-widget",
    PRESENCE_WIDGET_URI,
    { mimeType: "text/html;profile=mcp-app" },
    async () => ({
      contents: [
        {
          uri: PRESENCE_WIDGET_URI,
          mimeType: "text/html;profile=mcp-app",
          text: presenceWidgetHtml,
          _meta: {
            ui: {
              prefersBorder: false,
              csp: {
                connectDomains: [],
                resourceDomains: store.getAvatarResourceDomains(),
              },
            },
          },
        },
      ],
    }),
  );

  server.registerTool(
    "j_presence_get",
    {
      title: "Read J Presence",
      description:
        "Read the current authoritative J Presence snapshot. This does not expose conversation text or hidden context.",
      inputSchema: {},
      outputSchema: snapshotSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ui: { visibility: ["model", "app"] },
        "openai/toolInvocation/invoking": "Checking J…",
        "openai/toolInvocation/invoked": "J is here.",
      },
    },
    async () => {
      const state = await store.getSnapshot();
      return {
        structuredContent: state,
        content: [{ type: "text", text: stateText(state) }],
      };
    },
  );

  server.registerTool(
    "j_presence_update",
    {
      title: "Update J Presence",
      description:
        "Write a short live presence update when J is meaningfully responding, reasoning, reading, using tools, reacting, or handling a request. The aside must be freshly written from current context, optional, brief, and not a paraphrase of the main answer. Skip routine turns. Never include full conversation text, tool arguments, private filenames, secrets, or hidden context. Use quieter wording for serious or emotional moments. Updates are throttled and live asides expire.",
      inputSchema: {
        status: z
          .string()
          .max(24)
          .optional()
          .describe("Short presence state such as here, reading, working, quiet, or listening."),
        aside: z
          .string()
          .max(140)
          .nullable()
          .optional()
          .describe("Optional contextual aside. Use null or an empty string to clear it."),
        detail: z
          .string()
          .max(100)
          .nullable()
          .optional()
          .describe("Optional lightweight activity/detail line; omit unless useful."),
        expiresAt: z
          .string()
          .datetime({ offset: true })
          .nullable()
          .optional()
          .describe("Optional ISO-8601 expiry for the live aside; otherwise the configured TTL applies."),
      },
      outputSchema: snapshotSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Updating J…",
        "openai/toolInvocation/invoked": "J Presence updated.",
      },
    },
    async (input) => {
      try {
        const result = await store.update(input as PresenceUpdate);
        const note = result.throttled
          ? "Update was throttled; the previous presence remains current."
          : result.applied
            ? "J Presence updated."
            : "J Presence was already current.";
        return {
          structuredContent: result.state,
          content: [{ type: "text", text: `${note} ${stateText(result.state)}` }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : "Presence update failed.",
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "j_presence_show",
    {
      title: "Show J Presence",
      description:
        "Render the compact J Presence surface. Use this when the user asks to see, open, or pin J Presence.",
      inputSchema: {},
      outputSchema: snapshotSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ui: { resourceUri: PRESENCE_WIDGET_URI, visibility: ["model", "app"] },
        "openai/outputTemplate": PRESENCE_WIDGET_URI,
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Opening J Presence…",
        "openai/toolInvocation/invoked": "J Presence is open.",
      },
    },
    async () => {
      const state = await store.getSnapshot();
      return {
        structuredContent: state,
        content: [{ type: "text", text: stateText(state) }],
      };
    },
  );

  return server;
}
