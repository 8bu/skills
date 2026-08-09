/**
 * The published artifact is a bundle run by Node, not by the runtime the rest
 * of this suite happens to use. This drives that exact bundle, under Node, end
 * to end — build, serve, answer, print — so a Node-only regression cannot hide
 * behind tests that pass elsewhere.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let workspace = "";
let bundle = "";
let formFile = "";

const FORM = {
  title: "node bundle",
  questions: [
    { id: "ui", text: "Where?", type: "single", choices: [{ label: "Browser" }, { label: "Terminal" }] },
    { id: "name", text: "Called?", type: "single", choices: [] },
  ],
};

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), "grillwithform-"));
  bundle = join(workspace, "grillwithform.js");
  formFile = join(workspace, "form.json");
  await writeFile(formFile, JSON.stringify(FORM));

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

test("the Node bundle serves a form, takes an answer and prints it", async () => {
  const child = spawn("node", [bundle, "serve", formFile], {
    env: { ...process.env, GRILLWITHFORM_NO_BROWSER: "1" },
  });

  let stderr = "";
  let stdout = "";
  child.stderr.on("data", (chunk) => (stderr += chunk));
  child.stdout.on("data", (chunk) => (stdout += chunk));

  const url = await new Promise<string>((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`no URL on stderr: ${stderr}`)), 10_000);
    const poll = setInterval(() => {
      const match = /waiting on (http:\S+)/.exec(stderr);
      if (match) {
        clearInterval(poll);
        clearTimeout(deadline);
        resolve(match[1]!);
      }
    }, 25);
  });

  expect((await fetch(url)).status).toBe(200);

  const received: string[] = [];
  const socket = new WebSocket(url.replace("http://", "ws://") + "/ws");
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    received.push(message.type);
    if (message.type === "form") {
      socket.send(
        JSON.stringify({
          type: "submit",
          answers: { ui: { choices: ["Browser"] }, name: { other: "grillwithform" } },
        })
      );
    }
  });

  const exitCode = await new Promise<number>((resolve) => child.on("exit", (code) => resolve(code ?? -1)));

  // The page is told the Ask is over before the process leaves.
  expect(received).toEqual(["form", "done"]);
  expect(exitCode).toBe(0);
  expect(stdout.trim()).toBe(
    [
      "# Ask: node bundle",
      "",
      "- **[ui]** Where? → **Browser**",
      '- **[name]** Called? → *other:* "grillwithform"',
    ].join("\n")
  );
}, 30_000);
