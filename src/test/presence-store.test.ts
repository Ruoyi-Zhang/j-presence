import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PresenceStore, type PresenceConfig } from "../presence-store.js";

const testConfig: PresenceConfig = {
  name: "J",
  avatarUrl: "data:image/svg+xml;base64,PHN2Zy8+",
  initialStatus: "here",
  asideTtlSeconds: 30,
  updateCooldownSeconds: 10,
  idleAfterSeconds: 60,
  idlePhraseCooldownSeconds: 120,
  idlePhrases: ["still here.", "waiting."],
};

async function withStore(
  callback: (store: PresenceStore, setNow: (value: string) => void, statePath: string) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "j-presence-test-"));
  const statePath = join(root, "data", "presence-state.json");
  let now = new Date("2026-01-01T00:00:00.000Z");
  const store = new PresenceStore(testConfig, statePath, root, () => now);
  try {
    await callback(
      store,
      (value) => {
        now = new Date(value);
      },
      statePath,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("persists a live aside and removes it after its TTL", async () => {
  await withStore(async (store, setNow, statePath) => {
    const result = await store.update({
      status: "reading",
      aside: "That phrasing is doing a lot of work.",
      detail: "reading the latest message",
    });
    assert.equal(result.applied, true);
    assert.equal(result.state.asideSource, "live");
    assert.equal(result.state.status, "reading");

    const persisted = JSON.parse(await readFile(statePath, "utf8")) as { aside: string };
    assert.equal(persisted.aside, "That phrasing is doing a lot of work.");

    setNow("2026-01-01T00:00:31.000Z");
    const expired = await store.getSnapshot();
    assert.equal(expired.aside, null);
    assert.equal(expired.detail, null);
    assert.equal(expired.asideExpiresAt, null);
  });
});

test("throttles repeated asides but permits meaningful status changes", async () => {
  await withStore(async (store, setNow) => {
    await store.update({ status: "reading", aside: "One thought at a time." });
    setNow("2026-01-01T00:00:02.000Z");

    const throttled = await store.update({ aside: "Too soon." });
    assert.equal(throttled.throttled, true);
    assert.equal(throttled.state.aside, "One thought at a time.");

    const meaningful = await store.update({ status: "working", aside: "Now we're moving." });
    assert.equal(meaningful.applied, true);
    assert.equal(meaningful.throttled, false);
    assert.equal(meaningful.state.status, "working");
  });
});

test("uses idle fallbacks slowly and never overrides a live aside", async () => {
  await withStore(async (store, setNow) => {
    await store.getSnapshot();
    setNow("2026-01-01T00:01:01.000Z");
    const first = await store.getSnapshot();
    assert.equal(first.aside, "still here.");
    assert.equal(first.asideSource, "fallback");

    setNow("2026-01-01T00:02:59.000Z");
    const stillFirst = await store.getSnapshot();
    assert.equal(stillFirst.aside, "still here.");

    setNow("2026-01-01T00:03:01.000Z");
    const second = await store.getSnapshot();
    assert.equal(second.aside, "waiting.");
  });
});

test("normalizes short presence text and rejects oversized private payloads", async () => {
  await withStore(async (store) => {
    const result = await store.update({ status: "  working\nnow  ", aside: "  concise\taside  " });
    assert.equal(result.state.status, "working now");
    assert.equal(result.state.aside, "concise aside");
    await assert.rejects(() => store.update({ status: "x".repeat(25) }), /24 characters/);
    await assert.rejects(() => store.update({ aside: "x".repeat(141) }), /140 characters/);
  });
});
