/**
 * One long-lived HTTP server, shared by every concurrent Ask.
 *
 * Bound to 127.0.0.1 on an ephemeral port, with each Ask living at an
 * unguessable /form/<id> so another process on the same machine cannot read a
 * Form it was not given. A WebSocket per open page carries the live state.
 *
 * Plain Node — node:http and ws — so the published package runs anywhere Node
 * does, without asking anyone to install a second runtime first.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { WebSocketServer, type WebSocket } from "ws";

import { normaliseAnswers, ValidationError, type Form, type Outcome } from "./domain.ts";

import htmlShell from "./ui/index.html" with { type: "text" };
import appCss from "./ui/app.css" with { type: "text" };
import appJs from "./ui/app.js" with { type: "text" };

/** A closed tab gets this long to come back before the Ask is Abandoned. */
export const ABANDON_GRACE_MS = 30_000;

/** How long a shutdown waits for pages to receive their closing message. */
const SHUTDOWN_GRACE_MS = 1_000;

const PAGE = (htmlShell as unknown as string)
  .replace("/*!APP_CSS*/", () => appCss as unknown as string)
  .replace("/*!APP_JS*/", () => appJs as unknown as string);

interface AskState {
  id: string;
  form: Form;
  settle: (outcome: Outcome) => void;
  settled: boolean;
  sockets: Set<WebSocket>;
  abandonTimer?: ReturnType<typeof setTimeout>;
  timeoutTimer?: ReturnType<typeof setTimeout>;
}

export interface AskHandle {
  id: string;
  url: string;
  outcome: Promise<Outcome>;
}

const newAskId = (): string => randomBytes(16).toString("base64url");

export class FormServer {
  private http: Server | null = null;
  private sockets: WebSocketServer | null = null;
  private listening: Promise<void> | null = null;
  private readonly asks = new Map<string, AskState>();
  private readonly abandonGraceMs: number;

  constructor(options: { abandonGraceMs?: number } = {}) {
    this.abandonGraceMs = options.abandonGraceMs ?? ABANDON_GRACE_MS;
  }

  /** Starts the server if it is not already up. Safe to call repeatedly. */
  start(): Promise<void> {
    if (this.listening) return this.listening;

    const http = createServer((req, res) => this.handle(req, res));
    const sockets = new WebSocketServer({ noServer: true });

    http.on("upgrade", (req, socket, head) => {
      const state = this.askFor(req.url, true);
      if (!state) {
        socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      sockets.handleUpgrade(req, socket, head, (ws) => this.onOpen(ws, state));
    });

    this.http = http;
    this.sockets = sockets;
    this.listening = new Promise<void>((resolve, reject) => {
      http.once("error", reject);
      http.listen(0, "127.0.0.1", resolve);
    });
    return this.listening;
  }

  get origin(): string {
    const address = this.http?.address();
    if (!address || typeof address === "string") throw new Error("FormServer is not listening.");
    return `http://127.0.0.1:${address.port}`;
  }

  /** True while any Ask is still waiting on a person. */
  get busy(): boolean {
    return this.asks.size > 0;
  }

  /** Presents a Form and resolves once the Ask reaches exactly one Outcome. */
  async open(form: Form): Promise<AskHandle> {
    await this.start();
    const id = newAskId();

    let settle!: (outcome: Outcome) => void;
    const outcome = new Promise<Outcome>((resolve) => {
      settle = resolve;
    });

    const state: AskState = { id, form, settle, settled: false, sockets: new Set() };

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
    const http = this.http;
    const sockets = this.sockets;
    if (!http) return;
    this.http = null;
    this.sockets = null;
    this.listening = null;

    const closed = new Promise<void>((resolve) => http.close(() => resolve()));
    await Promise.race([closed, sleep(SHUTDOWN_GRACE_MS)]);

    // An upgraded socket outlives http.close() on some runtimes, so hang up on
    // anything still attached rather than wait on a tab that will never answer.
    for (const client of sockets?.clients ?? []) client.terminate();
    sockets?.close();
    http.closeAllConnections?.();
    await Promise.race([closed, sleep(SHUTDOWN_GRACE_MS)]);
  }

  // --- routing ----------------------------------------------------------

  /** The Ask a request is for, or undefined if there is no such open Ask. */
  private askFor(path: string | undefined, wantsSocket: boolean): AskState | undefined {
    const match = /^\/form\/([A-Za-z0-9_-]+)(\/ws)?$/.exec(new URL(path ?? "/", "http://x").pathname);
    if (!match || Boolean(match[2]) !== wantsSocket) return undefined;
    return this.asks.get(match[1]!);
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const state = this.askFor(req.url, false);
    if (!state) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("This form is closed. You can return to the assistant.");
      return;
    }

    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    });
    res.end(PAGE);
  }

  // --- WebSocket --------------------------------------------------------

  private onOpen(ws: WebSocket, state: AskState): void {
    state.sockets.add(ws);
    clearTimeout(state.abandonTimer);
    state.abandonTimer = undefined;

    ws.on("message", (raw) => this.onMessage(ws, state, raw.toString()));
    ws.on("close", () => this.onClose(ws, state));
    ws.send(JSON.stringify({ type: "form", form: state.form }));
  }

  private onMessage(ws: WebSocket, state: AskState, raw: string): void {
    if (state.settled) return;

    let message: unknown;
    try {
      message = JSON.parse(raw);
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

  private onClose(ws: WebSocket, state: AskState): void {
    if (state.settled) return;

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

/** Opens the person's browser. Failure is survivable — the URL is on stderr. */
export function openBrowser(url: string): void {
  if (process.env.GRILLWITHFORM_NO_BROWSER) return;
  const [command, ...args] =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    spawn(command!, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // Fall back to the printed URL.
  }
}
