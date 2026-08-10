import { afterAll, describe, expect, test } from "bun:test";

import { validateForm, type Outcome } from "../src/domain.ts";
import { FormServer } from "../src/http-server.ts";

const forms = new FormServer({ abandonGraceMs: 100 });
await forms.start();

afterAll(async () => await forms.stop());

const makeForm = (over: Record<string, unknown> = {}) =>
  validateForm({
    title: "grillwithform",
    questions: [
      { id: "ui", text: "Where?", type: "single", choices: [{ label: "Browser" }] },
      { id: "name", text: "Called?", type: "single", choices: [] },
    ],
    ...over,
  });

/** Opens a page's WebSocket and resolves once the server has sent the Form. */
async function openPage(url: string) {
  const socket = new WebSocket(url.replace("http://", "ws://") + "/ws");
  const messages: any[] = [];
  const waiters: ((m: any) => void)[] = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else messages.push(message);
  });

  const next = () =>
    new Promise<any>((resolve) => {
      const queued = messages.shift();
      if (queued) resolve(queued);
      else waiters.push(resolve);
    });

  const first = await next();
  return { socket, first, next };
}

describe("FormServer", () => {
  test("serves the page and pushes the Form over the WebSocket", async () => {
    const ask = await forms.open(makeForm());

    const response = await fetch(ask.url);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("<title>grillwithform</title>");
    // Styles and script are inlined, so the page loads nothing from anywhere.
    expect(html).toContain("--ring:");
    expect(html).not.toMatch(/<(link|script|img)[^>]+(src|href)=/);

    const page = await openPage(ask.url);
    expect(page.first.type).toBe("form");
    expect(page.first.form.questions.map((q: any) => q.id)).toEqual(["ui", "name"]);

    page.socket.send(JSON.stringify({ type: "cancel" }));
    await ask.outcome;
  });

  test("returns Submitted Answers when the page submits", async () => {
    const ask = await forms.open(makeForm());
    const page = await openPage(ask.url);

    page.socket.send(
      JSON.stringify({
        type: "submit",
        answers: {
          ui: { choices: ["Browser"], other: "" },
          name: { choices: [], other: "grillwithform" },
        },
      })
    );

    const outcome = await ask.outcome;
    expect(outcome).toEqual({
      kind: "submitted",
      answers: {
        ui: { choices: ["Browser"], other: null },
        name: { choices: [], other: "grillwithform" },
      },
    } satisfies Outcome);
  });

  test("keeps the Ask open and reports back when a submit is incomplete", async () => {
    const ask = await forms.open(makeForm());
    const page = await openPage(ask.url);

    page.socket.send(
      JSON.stringify({ type: "submit", answers: { ui: { choices: ["Browser"] } } })
    );

    const message = await page.next();
    expect(message.type).toBe("error");
    expect(message.message).toMatch(/must be answered/);

    page.socket.send(
      JSON.stringify({
        type: "submit",
        answers: { ui: { choices: ["Browser"] }, name: { other: "grillwithform" } },
      })
    );
    expect((await ask.outcome).kind).toBe("submitted");
  });

  test("Cancel ends the Ask with no Answers", async () => {
    const ask = await forms.open(makeForm());
    const page = await openPage(ask.url);
    page.socket.send(JSON.stringify({ type: "cancel" }));

    expect(await ask.outcome).toEqual({ kind: "cancelled" });
    expect((await page.next()).type).toBe("done");
  });

  test("a closed tab that does not come back is Abandoned", async () => {
    const ask = await forms.open(makeForm());
    const page = await openPage(ask.url);
    page.socket.close();

    expect(await ask.outcome).toEqual({ kind: "abandoned" });
  });

  test("a reconnect within the grace period keeps the Ask alive", async () => {
    const ask = await forms.open(makeForm());
    const first = await openPage(ask.url);
    first.socket.close();
    await Bun.sleep(30);

    const second = await openPage(ask.url);
    expect(second.first.type).toBe("form");
    await Bun.sleep(150); // longer than the grace period, but a tab is open

    second.socket.send(JSON.stringify({ type: "cancel" }));
    expect(await ask.outcome).toEqual({ kind: "cancelled" });
  });

  test("timeoutSeconds ends the Ask as Abandoned", async () => {
    const ask = await forms.open(makeForm({ timeoutSeconds: 0.1 }));
    expect(await ask.outcome).toEqual({ kind: "abandoned" });
  });

  test("concurrent Asks share the one server and stay separate", async () => {
    const first = await forms.open(makeForm());
    const second = await forms.open(makeForm());
    expect(new URL(first.url).port).toBe(new URL(second.url).port);
    expect(first.id).not.toBe(second.id);

    const firstPage = await openPage(first.url);
    firstPage.socket.send(JSON.stringify({ type: "cancel" }));
    expect(await first.outcome).toEqual({ kind: "cancelled" });

    // The second Ask is untouched by the first one ending.
    const secondPage = await openPage(second.url);
    expect(secondPage.first.type).toBe("form");
    secondPage.socket.send(
      JSON.stringify({
        type: "submit",
        answers: { ui: { choices: ["Browser"] }, name: { other: "still here" } },
      })
    );
    expect((await second.outcome).kind).toBe("submitted");
  });

  test("the page is told the Ask is done before the server shuts down", async () => {
    // Regression: a forced shutdown used to cut the socket before the closing
    // message flushed, leaving the page reconnecting to a server that was gone.
    const solo = new FormServer();
    const ask = await solo.open(makeForm());
    const page = await openPage(ask.url);
    page.socket.send(
      JSON.stringify({
        type: "submit",
        answers: { ui: { choices: ["Browser"] }, name: { other: "grillwithform" } },
      })
    );

    await ask.outcome;
    await solo.stop();
    expect((await page.next()).type).toBe("done");
  });

  test("abandon() ends the Ask and tells the page", async () => {
    const ask = await forms.open(makeForm());
    const page = await openPage(ask.url);

    ask.abandon();
    expect(await ask.outcome).toEqual({ kind: "abandoned" });
    expect((await page.next()).type).toBe("done");
  });

  test("abandon() after an Outcome changes nothing", async () => {
    const ask = await forms.open(makeForm());
    const page = await openPage(ask.url);
    page.socket.send(JSON.stringify({ type: "cancel" }));
    expect(await ask.outcome).toEqual({ kind: "cancelled" });

    ask.abandon();
    expect(await ask.outcome).toEqual({ kind: "cancelled" });
  });

  test("an unknown or finished Ask is not readable", async () => {
    expect((await fetch(`${forms.origin}/form/nope`)).status).toBe(404);
    expect((await fetch(`${forms.origin}/`)).status).toBe(404);

    const ask = await forms.open(makeForm());
    const page = await openPage(ask.url);
    page.socket.send(JSON.stringify({ type: "cancel" }));
    await ask.outcome;
    expect((await fetch(ask.url)).status).toBe(404);
  });
});
