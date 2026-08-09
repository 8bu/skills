import { describe, expect, test } from "bun:test";

import { normaliseAnswers, validateForm, ValidationError } from "../src/domain.ts";

const question = (over: Record<string, unknown> = {}) => ({
  id: "ui",
  text: "Where does the UI render?",
  type: "single",
  choices: [{ label: "Browser" }],
  ...over,
});

describe("validateForm", () => {
  test("accepts a minimal Form and defaults allowOther to true", () => {
    const form = validateForm({ title: "Design", questions: [question()] });
    expect(form.title).toBe("Design");
    expect(form.questions).toHaveLength(1);
    expect(form.questions[0]!.allowOther).toBe(true);
    expect(form.timeoutSeconds).toBeUndefined();
  });

  test("rejects a Form with zero Questions", () => {
    expect(() => validateForm({ title: "Design", questions: [] })).toThrow(
      /at least one Question/
    );
  });

  test("rejects duplicate Question ids", () => {
    expect(() =>
      validateForm({ title: "Design", questions: [question(), question({ text: "Again?" })] })
    ).toThrow(/duplicate/);
  });

  test("rejects an unanswerable Question — no Choices and no Other", () => {
    expect(() =>
      validateForm({
        title: "Design",
        questions: [question({ choices: [], allowOther: false })],
      })
    ).toThrow(/unanswerable/);
  });

  test("allows a Question with no Choices when Other is available", () => {
    const form = validateForm({
      title: "Design",
      questions: [question({ choices: [] })],
    });
    expect(form.questions[0]!.choices).toEqual([]);
  });

  test("treats omitted choices as none rather than an error", () => {
    const form = validateForm({
      title: "Design",
      questions: [{ id: "name", text: "Call it what?", type: "single" }],
    });
    expect(form.questions[0]!.choices).toEqual([]);
  });

  test("rejects duplicate Choice labels within a Question", () => {
    expect(() =>
      validateForm({
        title: "Design",
        questions: [question({ choices: [{ label: "Browser" }, { label: "Browser" }] })],
      })
    ).toThrow(/duplicate Choice label/);
  });

  test("rejects a bad type, a bad timeout and a missing title", () => {
    expect(() => validateForm({ title: "D", questions: [question({ type: "dropdown" })] })).toThrow(
      /"single" or "multi"/
    );
    expect(() =>
      validateForm({ title: "D", questions: [question()], timeoutSeconds: -1 })
    ).toThrow(/positive number/);
    expect(() => validateForm({ questions: [question()] })).toThrow(/title/);
  });

  test("throws ValidationError, so the tool layer can mark it retryable", () => {
    expect(() => validateForm(null)).toThrow(ValidationError);
  });
});

describe("normaliseAnswers", () => {
  const form = validateForm({
    title: "Design",
    questions: [
      question(),
      question({ id: "types", type: "multi", choices: [{ label: "A" }, { label: "B" }] }),
    ],
  });

  test("keeps both a Choice and Other text on the same Question", () => {
    const answers = normaliseAnswers(form, {
      ui: { choices: ["Browser"], other: "and a TUI later" },
      types: { choices: ["A", "B"], other: "" },
    });
    expect(answers.ui).toEqual({ choices: ["Browser"], other: "and a TUI later" });
    expect(answers.types).toEqual({ choices: ["A", "B"], other: null });
  });

  test("accepts an Other-only Answer", () => {
    const answers = normaliseAnswers(form, {
      ui: { choices: [], other: "somewhere else" },
      types: { choices: ["A"] },
    });
    expect(answers.ui!.other).toBe("somewhere else");
  });

  test("refuses a partly answered Form", () => {
    expect(() =>
      normaliseAnswers(form, { ui: { choices: ["Browser"], other: "" }, types: { choices: [] } })
    ).toThrow(/must be answered/);
  });

  test("drops labels that are not Choices of the Question", () => {
    expect(() =>
      normaliseAnswers(form, { ui: { choices: ["Smuggled"] }, types: { choices: ["A"] } })
    ).toThrow(/has no Answer/);
  });

  test("refuses more than one Choice on a single-select Question", () => {
    const multiChoiceSingle = validateForm({
      title: "Design",
      questions: [question({ choices: [{ label: "A" }, { label: "B" }] })],
    });
    expect(() =>
      normaliseAnswers(multiChoiceSingle, { ui: { choices: ["A", "B"] } })
    ).toThrow(/single-select/);
  });

  test("ignores Other text on a Question that opted out", () => {
    const noOther = validateForm({
      title: "Design",
      questions: [question({ allowOther: false })],
    });
    expect(() => normaliseAnswers(noOther, { ui: { choices: [], other: "sneaky" } })).toThrow(
      /has no Answer/
    );
  });
});
