import { describe, expect, test } from "bun:test";

import { renderOutcome } from "../src/answers-md.ts";
import { validateForm } from "../src/domain.ts";

const form = validateForm({
  title: "askwithform",
  questions: [
    { id: "ui", text: "Where does the UI render?", type: "single", choices: [{ label: "Browser" }] },
    {
      id: "types",
      text: "Which types ship?",
      type: "multi",
      choices: [{ label: "Single-select" }, { label: "Free text" }],
    },
    { id: "name", text: "What should it be called?", type: "single", choices: [] },
  ],
});

describe("renderOutcome", () => {
  test("renders Submitted Answers, echoing only what was chosen", () => {
    const markdown = renderOutcome(form, {
      kind: "submitted",
      answers: {
        ui: { choices: ["Browser"], other: null },
        types: { choices: ["Single-select", "Free text"], other: "also multi" },
        name: { choices: [], other: "askwithform" },
      },
    });

    expect(markdown).toBe(
      [
        "# Ask: askwithform",
        "",
        "- **[ui]** Where does the UI render? → **Browser**",
        '- **[types]** Which types ship? → **Single-select**; **Free text** + *other:* "also multi"',
        '- **[name]** What should it be called? → *other:* "askwithform"',
      ].join("\n")
    );
  });

  test("returns a one-line body and no Answers when Cancelled", () => {
    const markdown = renderOutcome(form, { kind: "cancelled" });
    expect(markdown).toBe(
      "# Ask: askwithform\n\nCancelled — the person declined to answer. No Answers were returned."
    );
  });

  test("distinguishes Abandoned from Cancelled in reporting", () => {
    const markdown = renderOutcome(form, { kind: "abandoned" });
    expect(markdown).toContain("Abandoned");
    expect(markdown).toContain("no explicit refusal");
    expect(markdown).not.toContain("- **[ui]**");
  });

  test("collapses newlines in Question text and Other so each Answer is one line", () => {
    const wrapped = validateForm({
      title: "askwithform",
      questions: [{ id: "q", text: "Line one\nline two", type: "single", choices: [] }],
    });
    const markdown = renderOutcome(wrapped, {
      kind: "submitted",
      answers: { q: { choices: [], other: "first\nsecond" } },
    });
    expect(markdown).toBe('# Ask: askwithform\n\n- **[q]** Line one line two → *other:* "first second"');
  });
});
