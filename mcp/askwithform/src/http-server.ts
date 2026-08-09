/**
 * One long-lived HTTP server, shared by every concurrent Ask.
 *
 * Bound to 127.0.0.1 on an ephemeral port, with each Ask living at an
 * unguessable /form/<id> so another process on the same machine cannot read a
 * Form it was not given. A WebSocket per open page carries the live state.
 */

import type { ServerWebSocket, Server } from "bun";
import { normaliseAnswers, ValidationError, type Form, type Outcome } from "./domain.ts";

import htmlShell from "./ui/index.html" with { type: "text" };
import appCss from "./ui/app.css" with { type: "text" };
import appJs from "./ui/app.js" with { type: "text" };

/** A closed tab gets this long to come back before the Ask is Abandoned. */
export const ABANDON_GRACE_MS = 30_000;

/** How long a shutdown waits for pages to receive their closing message. */
const SHUTDOWN_GRACE_MS = 1_000;

const PAGE = (htmlShell as unknown as string)
  .replace("/*!APP_CSS*/", () => appCss)
  .replace("/*!APP_JS*/", () => appJs as unknown as string);

interface SocketData {
  askId: string;
}

interface AskState {
  id: string;
  form: Form;
  settle: (outcome: Outcome) => void;
  settled: boolean;
  sockets: Set<ServerWebSocket<SocketData>>;
  abandonTimer?: ReturnType<typeof setTimeout>;
  timeoutTimer?: ReturnType<typeof setTimeout>;
}

export interface AskHandle {
  id: string;
  url: string;
  outcome: Promise<Outcome>;
}

function newAskId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Buffer.from(bytes).toString("base64url");
}

export class FormServer {
  private server: Server<SocketData> | null = null;
  private readonly asks = new Map<string, AskState>();
  private readonly abandonGraceMs: number;

  constructor(options: { abandonGraceMs?: number } = {}) {
    this.abandonGraceMs = options.abandonGraceMs ?? ABANDON_GRACE_MS;
  }

  /** Starts the server if it is not already up. Safe to call repeatedly. */
  start(): void {
    if (this.server) return;

    this.server = Bun.serve<SocketData>({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (req, server) => this.handle(req, server),
      websocket: {
        open: (ws) => this.onOpen(ws),
        message: (ws, message) => this.onMessage(ws, message),
        close: (ws) => this.onClose(ws),
      },
    });
  }

  get origin(): string {
    if (!this.server) throw new Error("FormServer is not started.");
    return `http://127.0.0.1:${this.server.port}`;
  }

  /** True while any Ask is still waiting on a person. */
  get busy(): boolean {
    return this.asks.size > 0;
  }

  /** Presents a Form and resolves once the Ask reaches exactly one Outcome. */
  open(form: Form): AskHandle {
    this.start();
    const id = newAskId();

    let settle!: (outcome: Outcome) => void;
    const outcome = new Promise<Outcome>((resolve) => {
      settle = resolve;
    });

    const state: AskState = {
      id,
      form,
      settle,
      settled: false,
      sockets: new Set(),
    };

    if (form.timeoutSeconds !== undefined) {
      state.timeoutTimer = setTimeout(
        () => this.settle(state, { kind: "abandoned" }),
        form.timeoutSeconds * 1000
      );
    }

    this.asks.set(id, state);
    return { id, url: `${this.origin}/form/${id}`, outcome };
  }

  /**
   * Shuts the server down without cutting pages off mid-sentence. Each page has
   * already been sent its closing message and asked to disconnect; this waits
   * for that to land, then stops waiting on any tab that has gone quiet.
   */
  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    await Promise.race([server.stop(), Bun.sleep(SHUTDOWN_GRACE_MS)]);
    await server.stop(true);
  }

  // --- HTTP -------------------------------------------------------------

  private handle(req: Request, server: Server<SocketData>): Response | undefined {
    const url = new URL(req.url);
    const match = /^\/form\/([A-Za-z0-9_-]+)(\/ws)?$/.exec(url.pathname);
    if (!match) return notFound();

    const askId = match[1]!;
    const state = this.asks.get(askId);
    if (!state) return gone();

    if (match[2]) {
      const upgraded = server.upgrade(req, { data: { askId } });
      return upgraded ? undefined : new Response("Expected a WebSocket upgrade.", { status: 426 });
    }

    return new Response(PAGE, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
    });
  }

  // --- WebSocket --------------------------------------------------------

  private onOpen(ws: ServerWebSocket<SocketData>): void {
    const state = this.asks.get(ws.data.askId);
    if (!state) {
      ws.close();
      return;
    }
    state.sockets.add(ws);
    clearTimeout(state.abandonTimer);
    state.abandonTimer = undefined;
    ws.send(JSON.stringify({ type: "form", form: state.form }));
  }

  private onMessage(ws: ServerWebSocket<SocketData>, raw: string | Buffer): void {
    const state = this.asks.get(ws.data.askId);
    if (!state || state.settled) return;

    let message: unknown;
    try {
      message = JSON.parse(typeof raw === "string" ? raw : raw.toString());
    } catch {
      return;
    }
    if (typeof message !== "object" || message === null) return;
    const { type, answers } = message as { type?: unknown; answers?: unknown };

    if (type === "cancel") {
      this.settle(state, { kind: "cancelled" });
      return;
    }

    if (type === "submit") {
      try {
        this.settle(state, { kind: "submitted", answers: normaliseAnswers(state.form, answers) });
      } catch (error) {
        // Submit is disabled until the Form is complete, so this only fires if
        // the page is bypassed. Tell it, and keep the Ask open.
        const text = error instanceof ValidationError ? error.message : "Could not accept those answers.";
        ws.send(JSON.stringify({ type: "error", message: text }));
      }
    }
  }

  private onClose(ws: ServerWebSocket<SocketData>): void {
    const state = this.asks.get(ws.data.askId);
    if (!state || state.settled) return;

    state.sockets.delete(ws);
    if (state.sockets.size > 0) return;

    // Never hang forever with no signal: a tab that does not come back within
    // the grace period ends the Ask as Abandoned.
    state.abandonTimer = setTimeout(
      () => this.settle(state, { kind: "abandoned" }),
      this.abandonGraceMs
    );
  }

  // --- outcome ----------------------------------------------------------

  private settle(state: AskState, outcome: Outcome): void {
    if (state.settled) return;
    state.settled = true;
    clearTimeout(state.abandonTimer);
    clearTimeout(state.timeoutTimer);
    this.asks.delete(state.id);

    for (const ws of state.sockets) {
      try {
        ws.send(JSON.stringify({ type: "done", outcome: outcome.kind }));
        ws.close(1000, "ask complete");
      } catch {
        // The page is already gone; the Outcome stands either way.
      }
    }
    state.sockets.clear();
    state.settle(outcome);
  }
}

const notFound = () => new Response("Not found.", { status: 404 });

const gone = () =>
  new Response("This form is closed. You can return to the assistant.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

/** Opens the person's browser. Failure is survivable — the URL is on stderr. */
export function openBrowser(url: string): void {
  if (process.env.ASKWITHFORM_NO_BROWSER) return;
  const command =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    Bun.spawn(command, { stdout: "ignore", stderr: "ignore", stdin: "ignore" }).unref();
  } catch {
    // Fall back to the printed URL.
  }
}
