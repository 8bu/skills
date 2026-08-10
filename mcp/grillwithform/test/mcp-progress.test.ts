/**
 * A person can spend a long time on a form. A client that hears nothing during
 * that wait treats the call as stalled and aborts it — Claude Code does so
 * after 30 minutes on stdio. These tests drive the built bundle over stdio with
 * a real MCP client and a fast heartbeat, so the keep-alive is proven, not
 * assumed.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let workspace = "";
let bundle = "";

const FORM = {
  title: "heartbeat",
  questions: [{ id: "name", text: "Called?", type: "single", choices: [] }],
};

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), "grillwithform-mcp-"));
  bundle = join(workspace, "grillwithform.js");
  const built = await Bun.build({
    entrypoints: [new URL("../src/index.ts", import.meta.url).pathname],
    target: "node",
    outdir: workspace,
    naming: "grillwithform.js",
  });
  expect(built.success).toBe(true);
});

afterAll(async () => {
  if (workspace) await rm(workspace, { recursive: true, force: true });
});

/** Starts the server over stdio and returns the client plus its stderr. */
async function connect() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [bundle, "mcp"],
    env: {
      ...process.env,
      GRILLWITHFORM_NO_BROWSER: "1",
      GRILLWITHFORM_HEARTBEAT_MS: "60",
    } as Record<string, string>,
    stderr: "pipe",
  });

  const client = new Client({ name: "heartbeat-test", version: "0" });
  await client.connect(transport);

  let stderr = "";
  transport.stderr!.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  const url = () =>
    new Promise<string>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error(`no URL: ${stderr}`)), 10_000);
      const poll = setInterval(() => {
        const match = /waiting on (http:\S+)/.exec(stderr);
        if (match) {
          clearInterval(poll);
          clearTimeout(deadline);
          resolve(match[1]!);
        }
      }, 20);
    });

  return { client, transport, url };
}

test("the server sends progress while it waits, so the call is not idle", async () => {
  const { client, url } = await connect();
  const progress: number[] = [];

  const call = client.callTool(
    { name: "grill_with_form", arguments: FORM },
    undefined,
    { onprogress: (p) => progress.push(p.progress) }
  );

  // Wait past several heartbeats without answering the form.
  const formUrl = await url();
  await Bun.sleep(400);
  expect(progress.length).toBeGreaterThanOrEqual(2);
  // Progress must advance, never repeat a value.
  expect(progress).toEqual([...progress].sort((a, b) => a - b));
  expect(new Set(progress).size).toBe(progress.length);

  // Answering still works, and the heartbeat stops with the Ask.
  const socket = new WebSocket(formUrl.replace("http://", "ws://") + "/ws");
  socket.addEventListener("message", (event) => {
    if (JSON.parse(String(event.data)).type === "form") {
      socket.send(
        JSON.stringify({ type: "submit", answers: { name: { other: "grillwithform" } } })
      );
    }
  });

  const result: any = await call;
  expect(result.content[0].text).toContain('*other:* "grillwithform"');

  const beats = progress.length;
  await Bun.sleep(200);
  expect(progress.length).toBe(beats);
  await client.close();
}, 30_000);

test("a client that gives up on the call ends the Ask", async () => {
  const { client, url } = await connect();
  const controller = new AbortController();

  const call = client.callTool(
    { name: "grill_with_form", arguments: FORM },
    undefined,
    { signal: controller.signal }
  );

  const formUrl = await url();
  const socket = new WebSocket(formUrl.replace("http://", "ws://") + "/ws");
  const closing = new Promise<string>((resolve) => {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type === "done") resolve(message.outcome);
    });
  });

  await Bun.sleep(150);
  controller.abort();

  await expect(call).rejects.toThrow();
  // The page is told, rather than left waiting on a server nobody listens to.
  expect(await closing).toBe("abandoned");
  await client.close();
}, 30_000);
