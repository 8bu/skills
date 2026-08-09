/**
 * The stdio MCP server. One tool, `ask_with_form`, which blocks until the Ask
 * reaches an Outcome and returns the Answers as markdown.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { renderOutcome } from "./answers-md.ts";
import { validateForm, ValidationError } from "./domain.ts";
import { FormServer, openBrowser } from "./http-server.ts";

const TOOL_DESCRIPTION = [
  "Present a form of questions in the person's browser and wait for their answers.",
  "",
  "Use this when a whole round of questions exists at once — more than a couple, or",
  "options with long text, descriptions or code spans that need to be readable. For one",
  "or two quick questions mid-task, ask in the conversation instead of opening a browser.",
  "",
  "Every question is mandatory and there is one Submit: either all answers come back, or",
  "none do. Each question offers free-text 'Other' alongside its choices unless you set",
  "allowOther to false, and a question with no choices at all is answered purely as free",
  "text. Question and choice text may use `code`, **bold** and links.",
].join("\n");

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "What this round of questions is about. Shown as the form's heading.",
    },
    questions: {
      type: "array",
      minItems: 1,
      description: "The ordered questions. Unlimited, and all are mandatory.",
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Short unique key for this question; it labels the answer you get back.",
          },
          text: { type: "string", description: "The question put to the person." },
          type: {
            type: "string",
            enum: ["single", "multi"],
            description: "single = at most one choice; multi = any number of choices.",
          },
          choices: {
            type: "array",
            description: "Pre-written options. May be empty for a free-text-only question.",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "The option itself." },
                description: {
                  type: "string",
                  description: "Optional line expanding on the label.",
                },
              },
              required: ["label"],
            },
          },
          allowOther: {
            type: "boolean",
            description:
              "Whether free-text 'Other' is offered alongside the choices. Defaults to true; set false only when the choices are genuinely exhaustive.",
          },
        },
        required: ["id", "text", "type"],
      },
    },
    timeoutSeconds: {
      type: "number",
      description: "Give up waiting after this long. Omit to wait for as long as it takes.",
    },
  },
  required: ["title", "questions"],
} as const;

export async function runMcpServer(): Promise<void> {
  // The HTTP server starts with the first Ask and lives as long as the client
  // does; nothing is listening while no Form has been presented.
  const forms = new FormServer();

  const server = new Server(
    { name: "askwithform", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.onclose = () => {
    forms.stop();
    process.exit(0);
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "ask_with_form",
        description: TOOL_DESCRIPTION,
        inputSchema: INPUT_SCHEMA,
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "ask_with_form") {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool "${request.params.name}".` }],
      };
    }

    let form;
    try {
      form = validateForm(request.params.arguments);
    } catch (error) {
      // Rejected before anything renders. A broken Form never reaches the person.
      const text =
        error instanceof ValidationError
          ? `The form was rejected and nothing was shown to the person. Fix it and call again.\n\n${error.message}`
          : String(error);
      return { isError: true, content: [{ type: "text", text }] };
    }

    const ask = forms.open(form);
    console.error(`askwithform: waiting on ${ask.url}`);
    openBrowser(ask.url);

    const outcome = await ask.outcome;
    return { content: [{ type: "text", text: renderOutcome(form, outcome) }] };
  });

  await server.connect(new StdioServerTransport());
}
