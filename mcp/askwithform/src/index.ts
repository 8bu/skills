#!/usr/bin/env bun
/**
 * Two modes, one binary:
 *
 *   askwithform mcp                 stdio MCP server
 *   askwithform serve <form.json>   run one Ask from a file and print the result
 */

import { renderOutcome } from "./answers-md.ts";
import { validateForm, ValidationError } from "./domain.ts";
import { FormServer, openBrowser } from "./http-server.ts";
import { runMcpServer } from "./mcp-server.ts";

const USAGE = `askwithform — ask a person a form of questions in their browser

  askwithform mcp                 run as an MCP server over stdio
  askwithform serve <form.json>   present one form and print the answers as markdown

Register with Claude Code:
  claude mcp add askwithform -- /path/to/askwithform mcp`;

async function serveOnce(path: string): Promise<number> {
  let form;
  try {
    form = validateForm(await Bun.file(path).json());
  } catch (error) {
    console.error(error instanceof ValidationError ? error.message : String(error));
    return 1;
  }

  const forms = new FormServer();
  const ask = forms.open(form);
  console.error(`askwithform: waiting on ${ask.url}`);
  openBrowser(ask.url);

  const outcome = await ask.outcome;
  console.log(renderOutcome(form, outcome));
  forms.stop();
  return outcome.kind === "submitted" ? 0 : 1;
}

const [mode, argument] = process.argv.slice(2);

switch (mode) {
  case "mcp":
    await runMcpServer();
    break;

  case "serve":
    if (!argument) {
      console.error("askwithform serve needs a path to a form JSON file.\n\n" + USAGE);
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
