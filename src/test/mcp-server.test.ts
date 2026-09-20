import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPresenceMcpServer } from "../mcp-server.js";
import { PresenceStore, type PresenceConfig } from "../presence-store.js";
import { PRESENCE_WIDGET_URI } from "../widget.js";

test("publishes the update/get/show MCP flow and its compact UI resource", async () => {
  const root = await mkdtemp(join(tmpdir(), "j-presence-mcp-test-"));
  const config: PresenceConfig = {
    name: "J",
    avatarUrl: "data:image/svg+xml;base64,PHN2Zy8+",
    initialStatus: "here",
    asideTtlSeconds: 180,
    updateCooldownSeconds: 0,
    idleAfterSeconds: 900,
    idlePhraseCooldownSeconds: 1200,
    idlePhrases: ["still here."],
  };
  const store = new PresenceStore(config, join(root, "data", "state.json"), root);
  const server = createPresenceMcpServer(store);
  const client = new Client({ name: "j-presence-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      ["j_presence_get", "j_presence_show", "j_presence_update"],
    );

    const updated = await client.callTool({
      name: "j_presence_update",
      arguments: { status: "working", aside: "Tiny surface, real signal." },
    });
    assert.equal(updated.isError, undefined);
    assert.equal(
      (updated.structuredContent as { status: string }).status,
      "working",
    );

    const shown = await client.callTool({ name: "j_presence_show", arguments: {} });
    assert.equal((shown.structuredContent as { aside: string }).aside, "Tiny surface, real signal.");

    const resource = await client.readResource({ uri: PRESENCE_WIDGET_URI });
    const firstContent = resource.contents[0];
    const html = firstContent && "text" in firstContent ? firstContent.text : "";
    assert.match(html, /prefers-reduced-motion/);
    assert.match(html, /requestDisplayMode/);
    assert.match(html, /tools\/call/);
    assert.doesNotMatch(html, /model name|token count|relationship score/i);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
    await rm(root, { recursive: true, force: true });
  }
});
