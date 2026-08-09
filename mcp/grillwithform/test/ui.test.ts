/**
 * Runs the real page script against a DOM with a stand-in WebSocket, so the
 * claim that no unescaped assistant output reaches the DOM is actually tested.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const appJs = await Bun.file(new URL("../src/ui/app.js", import.meta.url)).text();

class FakeSocket {
  static readonly OPEN = 1;
  static last: FakeSocket | null = null;

  readyState = FakeSocket.OPEN;
  readonly sent: any[] = [];
  private readonly listeners: Record<string, ((event: any) => void)[]> = {};

  constructor(readonly url: string) {
    FakeSocket.last = this;
  }

  addEventListener(type: string, handler: (event: any) => void) {
    (this.listeners[type] ??= []).push(handler);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = 3;
    for (const handler of this.listeners.close ?? []) handler({});
  }

  receive(message: unknown) {
    for (const handler of this.listeners.message ?? []) {
      handler({ data: JSON.stringify(message) });
    }
  }
}

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

function mount(form: unknown) {
  document.body.innerHTML = '<main id="root"></main>';
  FakeSocket.last = null;
  new Function("WebSocket", appJs)(FakeSocket);
  const socket = FakeSocket.last!;
  socket.receive({ type: "form", form });
  return socket;
}

const root = () => document.getElementById("root")!;
const submitButton = () => root().querySelector(".submit-bar .primary") as HTMLButtonElement;

const simpleForm = {
  title: "grillwithform",
  questions: [
    {
      id: "ui",
      text: "Where does the UI render?",
      type: "single",
      choices: [{ label: "Browser", description: "A real page" }, { label: "Terminal" }],
      allowOther: true,
    },
    { id: "name", text: "Call it what?", type: "single", choices: [], allowOther: true },
  ],
};

describe("the page", () => {
  test("renders one .question per Question, with Choices and Other", () => {
    mount(simpleForm);
    expect(root().querySelectorAll(".question")).toHaveLength(2);
    expect(root().querySelectorAll(".choice")).toHaveLength(2);
    expect(root().querySelectorAll(".other-field")).toHaveLength(2);
    expect(root().querySelector(".choice-description")!.textContent).toContain("A real page");
    // The whole row is the label, so the description is clickable too.
    expect(root().querySelector(".choice")!.tagName).toBe("LABEL");
    expect(root().querySelector(".choice")!.querySelector("input")).not.toBeNull();
  });

  test("a Question is a fieldset with its text as the legend", () => {
    mount(simpleForm);
    const question = root().querySelector(".question")!;
    expect(question.tagName).toBe("FIELDSET");
    expect(question.querySelector(".question-text")!.tagName).toBe("LEGEND");
  });

  test("a field's label and control are siblings, and the label names it", () => {
    // Regression: the textarea used to be nested inside its own label, so the
    // gap between them could not exist and the pair had no shared structure.
    mount(simpleForm);
    const wrap = root().querySelector(".other-field") as HTMLElement;
    const label = wrap.querySelector(".field-label") as HTMLLabelElement;
    const control = wrap.querySelector(".field-control") as HTMLTextAreaElement;

    expect(label.parentElement).toBe(wrap);
    expect(control.parentElement).toBe(wrap);
    expect(label.nextElementSibling).toBe(control);
    expect(label.htmlFor).toBe(control.id);
    expect(control.querySelector("label")).toBeNull();
  });

  test("a field's description is announced with its control", () => {
    mount(simpleForm);
    const wrap = root().querySelector(".other-field")!;
    const control = wrap.querySelector(".field-control")!;
    const note = wrap.querySelector(".field-description")!;
    expect(control.getAttribute("aria-describedby")).toBe(note.id);
  });

  test("hides Other only when the Question opts out", () => {
    mount({
      title: "t",
      questions: [
        { id: "a", text: "A?", type: "single", choices: [{ label: "x" }], allowOther: false },
      ],
    });
    expect(root().querySelectorAll(".other-field")).toHaveLength(0);
  });

  test("keeps Submit disabled until every Question has an Answer", () => {
    const socket = mount(simpleForm);
    expect(submitButton().disabled).toBe(true);

    const radio = root().querySelector("input[type=radio]") as HTMLInputElement;
    radio.checked = true;
    radio.dispatchEvent(new Event("change"));
    expect(submitButton().disabled).toBe(true); // "name" is still unanswered

    const textarea = root().querySelector("#q-name-other") as HTMLTextAreaElement;
    textarea.value = "grillwithform";
    textarea.dispatchEvent(new Event("input"));
    expect(submitButton().disabled).toBe(false);

    submitButton().click();
    expect(socket.sent).toEqual([
      {
        type: "submit",
        answers: {
          ui: { choices: ["Browser"], other: "" },
          name: { choices: [], other: "grillwithform" },
        },
      },
    ]);
  });

  test("selecting a Choice does not clear the Other textarea", () => {
    const socket = mount(simpleForm);
    const other = root().querySelector("#q-ui-other") as HTMLTextAreaElement;
    other.value = "somewhere else";
    other.dispatchEvent(new Event("input"));

    const radio = root().querySelector("input[type=radio]") as HTMLInputElement;
    radio.checked = true;
    radio.dispatchEvent(new Event("change"));

    expect(other.value).toBe("somewhere else");

    const name = root().querySelector("#q-name-other") as HTMLTextAreaElement;
    name.value = "x";
    name.dispatchEvent(new Event("input"));
    submitButton().click();
    expect(socket.sent[0].answers.ui).toEqual({ choices: ["Browser"], other: "somewhere else" });
  });

  test("multi-select accumulates and removes Choices", () => {
    const socket = mount({
      title: "t",
      questions: [
        {
          id: "types",
          text: "Which?",
          type: "multi",
          choices: [{ label: "A" }, { label: "B" }],
          allowOther: true,
        },
      ],
    });
    const boxes = root().querySelectorAll("input[type=checkbox]");
    for (const box of boxes) {
      (box as HTMLInputElement).checked = true;
      box.dispatchEvent(new Event("change"));
    }
    submitButton().click();
    expect(socket.sent[0].answers.types.choices).toEqual(["A", "B"]);

    const first = boxes[0] as HTMLInputElement;
    first.checked = false;
    first.dispatchEvent(new Event("change"));
    submitButton().click();
    expect(socket.sent[1].answers.types.choices).toEqual(["B"]);
  });

  test("Cancel sends a cancel and nothing else", () => {
    const socket = mount(simpleForm);
    const cancel = root().querySelector(".submit-bar .ghost") as HTMLButtonElement;
    cancel.click();
    expect(socket.sent).toEqual([{ type: "cancel" }]);
  });

  test("escapes assistant text before applying the markdown subset", () => {
    mount({
      title: "t",
      questions: [
        {
          id: "x",
          text: "Try `<script>alert(1)</script>` and **bold** and [docs](https://example.com/a?b=1&c=2)",
          type: "single",
          choices: [{ label: "<img src=x onerror=alert(1)>" }],
          allowOther: false,
        },
      ],
    });

    // The dangerous text survives only as literal text and as an input value
    // set through a property — never as markup or a handler attribute.
    expect(root().querySelectorAll("script")).toHaveLength(0);
    expect(root().querySelectorAll("img")).toHaveLength(0);
    expect(root().querySelectorAll("[onerror]")).toHaveLength(0);

    const questionText = root().querySelector(".question-text")!;
    expect(questionText.querySelector("code")!.textContent).toBe("<script>alert(1)</script>");
    expect(questionText.querySelector("strong")!.textContent).toBe("bold");

    const link = questionText.querySelector("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://example.com/a?b=1&c=2");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(root().querySelector(".choice-label")!.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  test("does not turn a javascript: URL into a link", () => {
    mount({
      title: "t",
      questions: [
        {
          id: "x",
          // eslint-disable-next-line no-script-url
          text: "[click](javascript:alert(1))",
          type: "single",
          choices: [],
          allowOther: true,
        },
      ],
    });
    expect(root().querySelectorAll("a")).toHaveLength(0);
    expect(root().querySelector(".question-text")!.textContent).toContain("[click](javascript:");
  });

  test("shows a closing message when the server says the Ask is done", () => {
    const socket = mount(simpleForm);
    socket.receive({ type: "done", outcome: "submitted" });
    expect(root().textContent).toContain("Answers sent.");
    expect(root().querySelectorAll(".question")).toHaveLength(0);
  });

  test("stops reconnecting once the Ask is no longer served", async () => {
    // Regression: the page used to retry forever against a finished Ask, so it
    // sat on "Reconnecting…" after the answers had already been delivered.
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("gone", { status: 404 })) as unknown as typeof fetch;
    try {
      const socket = mount(simpleForm);
      socket.close();
      await Bun.sleep(10);
      expect(root().textContent).toContain("This form is closed.");
      expect(root().querySelectorAll(".question")).toHaveLength(0);
    } finally {
      globalThis.fetch = original;
    }
  });

  test("keeps reconnecting while the Ask is still open", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    try {
      const socket = mount(simpleForm);
      socket.close();
      await Bun.sleep(10);
      expect(root().querySelector(".status")!.textContent).toBe("Reconnecting…");
      expect(root().querySelectorAll(".question")).toHaveLength(2);
    } finally {
      globalThis.fetch = original;
    }
  });

  test("surfaces a server error without ending the Ask", () => {
    const socket = mount(simpleForm);
    socket.receive({ type: "error", message: "Question \"name\" has no Answer" });
    expect(root().querySelector(".status")!.textContent).toContain("has no Answer");
    expect(root().querySelectorAll(".question")).toHaveLength(2);
  });
});
