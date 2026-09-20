import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createPresenceMcpServer } from "./mcp-server.js";
import { PresenceStore } from "./presence-store.js";
import { presenceWidgetHtml } from "./widget.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function startStdio(): Promise<void> {
  const store = await PresenceStore.create(projectRoot);
  const server = createPresenceMcpServer(store);
  await server.connect(new StdioServerTransport());
}

async function startHttp(): Promise<void> {
  const store = await PresenceStore.create(projectRoot);
  const host = process.env.J_PRESENCE_HOST ?? "127.0.0.1";
  const port = Number.parseInt(process.env.J_PRESENCE_PORT ?? "8787", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("J_PRESENCE_PORT must be an integer from 1 to 65535.");
  }

  const app = createMcpExpressApp({ host });

  app.get("/", (_request: Request, response: Response) => {
    response.type("html").send(presenceWidgetHtml);
  });

  app.get("/api/presence", async (_request: Request, response: Response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json(await store.getSnapshot());
  });

  app.get("/health", (_request: Request, response: Response) => {
    response.json({ ok: true, service: "j-presence" });
  });

  app.post("/mcp", async (request: Request, response: Response) => {
    const server = createPresenceMcpServer(store);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
      response.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      console.error("MCP request failed:", error);
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  for (const method of ["get", "delete"] as const) {
    app[method]("/mcp", (_request: Request, response: Response) => {
      response.status(405).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      });
    });
  }

  app.listen(port, host, (error?: Error) => {
    if (error) throw error;
    console.log(`J Presence listening at http://${host}:${port}`);
    console.log(`MCP endpoint: http://${host}:${port}/mcp`);
  });
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const useStdio = process.argv.includes("--stdio");
  (useStdio ? startStdio() : startHttp()).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
