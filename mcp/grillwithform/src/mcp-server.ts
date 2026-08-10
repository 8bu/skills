/**
 * The stdio MCP server. One tool, `grill_with_form`, which blocks until the Ask
 * reaches an Outcome and returns the Answers as markdown.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { renderOutcome } from "./answers-md.ts";
import { validateForm, ValidationError } from "./domain.ts";
import { FormServer, openBrowser } from "./http-server.ts";

/**
 * How often to tell the client that the wait is deliberate. It must stay well
 * under the idle window of the client: Claude Code allows 30 min on stdio and
 * 5 min on HTTP. The environment variable exists so tests do not wait a minute.
 */
const HEARTBEAT_MS = Number(process.env.GRILLWITHFORM_HEARTBEAT_MS ?? 60_000);

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
    { name: "grillwithform", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.onclose = () => {
    void forms.stop().then(() => process.exit(0));
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "grill_with_form",
        description: TOOL_DESCRIPTION,
        inputSchema: INPUT_SCHEMA,
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (request.params.name !== "grill_with_form") {
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

    const ask = await forms.open(form);
    console.error(`grillwithform: waiting on ${ask.url}`);
    openBrowser(ask.url);

    // A person can take a long time over a form, and a client that hears
    // nothing treats the call as stalled: Claude Code aborts an idle stdio call
    // after 30 minutes. A heartbeat says the wait is deliberate. It only goes
    // out when the client asked for progress by sending a token.
    const progressToken = request.params._meta?.progressToken;
    let beats = 0;
    const heartbeat =
      progressToken === undefined
        ? undefined
        : setInterval(() => {
            void extra
              .sendNotification({
                method: "notifications/progress",
                params: {
                  progressToken,
                  progress: ++beats,
                  message: "Waiting for the person to answer the form.",
                },
              })
              .catch(() => {
                // The client went away. The Outcome still stands.
              });
          }, HEARTBEAT_MS);

    // If the client gives up on the call, end the Ask too. Otherwise the tab
    // stays open over a server that nobody is listening to any more.
    const giveUp = () => ask.abandon();
    extra.signal.addEventListener("abort", giveUp, { once: true });

    try {
      const outcome = await ask.outcome;
      return { content: [{ type: "text", text: renderOutcome(form, outcome) }] };
    } finally {
      clearInterval(heartbeat);
      extra.signal.removeEventListener("abort", giveUp);
    }
  });

  await server.connect(new StdioServerTransport());
}
