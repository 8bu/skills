#!/usr/bin/env node
/**
 * Two modes, one entrypoint:
 *
 *   grillwithform mcp                 stdio MCP server
 *   grillwithform serve <form.json>   run one Ask from a file and print the result
 */

import { readFile } from "node:fs/promises";

import { renderOutcome } from "./answers-md.ts";
import { validateForm, ValidationError } from "./domain.ts";
import { FormServer, openBrowser } from "./http-server.ts";
import { runMcpServer } from "./mcp-server.ts";

const USAGE = `grillwithform — ask a person a form of questions in their browser

  grillwithform mcp                 run as an MCP server over stdio
  grillwithform serve <form.json>   present one form and print the answers as markdown

Register with Claude Code:
  claude mcp add grillwithform -- npx -y grillwithform mcp`;

async function serveOnce(path: string): Promise<number> {
  let form;
  try {
    form = validateForm(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    console.error(error instanceof ValidationError ? error.message : String(error));
    return 1;
  }

  const forms = new FormServer();
  const ask = await forms.open(form);
  console.error(`grillwithform: waiting on ${ask.url}`);
  openBrowser(ask.url);

  const outcome = await ask.outcome;
  // Stop before printing so the page has its closing message in hand.
  await forms.stop();
  console.log(renderOutcome(form, outcome));
  return outcome.kind === "submitted" ? 0 : 1;
}

const [mode, argument] = process.argv.slice(2);

switch (mode) {
  case "mcp":
    await runMcpServer();
    break;

  case "serve":
    if (!argument) {
      console.error("grillwithform serve needs a path to a form JSON file.\n\n" + USAGE);
      process.exit(2);
    }
    process.exit(await serveOnce(argument));
    break;

  default: {
    const wantsHelp = mode === undefined || mode === "help" || mode === "--help" || mode === "-h";
    (wantsHelp ? console.log : console.error)(USAGE);
    process.exit(wantsHelp ? 0 : 2);
  }
}
