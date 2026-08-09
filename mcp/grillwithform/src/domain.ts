/**
 * Domain types and validation for an Ask.
 *
 * Vocabulary is the repo's ubiquitous language (see CONTEXT.md): Ask, Form,
 * Question, Choice, Other, Answer, Outcome.
 *
 * Validation is strict and never repairs. A Form that fails here is rejected
 * before anything renders, with a message the assistant can act on and retry.
 */

export type QuestionType = "single" | "multi";

export interface Choice {
  label: string;
  description?: string;
}

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  choices: Choice[];
  /** Other is available unless a Question explicitly opts out. */
  allowOther: boolean;
}

export interface Form {
  title: string;
  questions: Question[];
  /** Absent means the Ask waits forever. */
  timeoutSeconds?: number;
}

/** What one person supplied for one Question. Uniform across Question types. */
export interface Answer {
  choices: string[];
  other: string | null;
}

export type Answers = Record<string, Answer>;

export type Outcome =
  | { kind: "submitted"; answers: Answers }
  | { kind: "cancelled" }
  | { kind: "abandoned" };

export class ValidationError extends Error {
  override readonly name = "ValidationError";
}

const fail = (message: string): never => {
  throw new ValidationError(message);
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Validate untrusted tool input into a Form.
 *
 * Throws ValidationError with a precise, retryable message on the first
 * problem found. Rejected cases the design calls out by name: zero Questions,
 * duplicate ids, and an unanswerable Question (no Choices and no Other).
 */
export function validateForm(input: unknown): Form {
  if (!isRecord(input)) fail("Form must be an object.");
  const raw = input as Record<string, unknown>;

  if (typeof raw.title !== "string" || raw.title.trim() === "") {
    fail("Form.title must be a non-empty string.");
  }

  if (!Array.isArray(raw.questions)) fail("Form.questions must be an array.");
  const rawQuestions = raw.questions as unknown[];
  if (rawQuestions.length === 0) {
    fail("Form.questions must contain at least one Question; a Form with zero Questions cannot be answered.");
  }

  const seen = new Set<string>();
  const questions = rawQuestions.map((q, i) => validateQuestion(q, i, seen));

  let timeoutSeconds: number | undefined;
  if (raw.timeoutSeconds !== undefined) {
    if (
      typeof raw.timeoutSeconds !== "number" ||
      !Number.isFinite(raw.timeoutSeconds) ||
      raw.timeoutSeconds <= 0
    ) {
      fail("Form.timeoutSeconds must be a positive number of seconds, or be omitted to wait forever.");
    }
    timeoutSeconds = raw.timeoutSeconds as number;
  }

  const form: Form = { title: (raw.title as string).trim(), questions };
  if (timeoutSeconds !== undefined) form.timeoutSeconds = timeoutSeconds;
  return form;
}

function validateQuestion(input: unknown, index: number, seen: Set<string>): Question {
  const at = `questions[${index}]`;
  if (!isRecord(input)) fail(`${at} must be an object.`);
  const raw = input as Record<string, unknown>;

  if (typeof raw.id !== "string" || raw.id.trim() === "") {
    fail(`${at}.id must be a non-empty string.`);
  }
  const id = (raw.id as string).trim();
  if (seen.has(id)) {
    fail(`${at}.id "${id}" is a duplicate; every Question id in a Form must be unique.`);
  }
  seen.add(id);

  if (typeof raw.text !== "string" || raw.text.trim() === "") {
    fail(`${at}.text must be a non-empty string.`);
  }

  if (raw.type !== "single" && raw.type !== "multi") {
    fail(`${at}.type must be "single" or "multi".`);
  }
  const type = raw.type as QuestionType;

  if (raw.choices !== undefined && !Array.isArray(raw.choices)) {
    fail(`${at}.choices must be an array of Choices.`);
  }
  const rawChoices = (raw.choices as unknown[] | undefined) ?? [];
  const choices = rawChoices.map((c, ci) => validateChoice(c, `${at}.choices[${ci}]`));

  const labels = new Set<string>();
  for (const c of choices) {
    if (labels.has(c.label)) {
      fail(`${at} has a duplicate Choice label "${c.label}"; Choice labels identify the Answer, so they must be unique within a Question.`);
    }
    labels.add(c.label);
  }

  if (raw.allowOther !== undefined && typeof raw.allowOther !== "boolean") {
    fail(`${at}.allowOther must be a boolean.`);
  }
  const allowOther = (raw.allowOther as boolean | undefined) ?? true;

  if (choices.length === 0 && !allowOther) {
    fail(`${at} is unanswerable: it has zero Choices and allowOther is false. Give it Choices, or leave allowOther unset.`);
  }

  return { id, text: (raw.text as string).trim(), type, choices, allowOther };
}

function validateChoice(input: unknown, at: string): Choice {
  if (!isRecord(input)) fail(`${at} must be an object with a label.`);
  const raw = input as Record<string, unknown>;

  if (typeof raw.label !== "string" || raw.label.trim() === "") {
    fail(`${at}.label must be a non-empty string.`);
  }
  if (raw.description !== undefined && typeof raw.description !== "string") {
    fail(`${at}.description must be a string when present.`);
  }

  const choice: Choice = { label: (raw.label as string).trim() };
  const description = (raw.description as string | undefined)?.trim();
  if (description) choice.description = description;
  return choice;
}

/**
 * Normalise whatever the page submitted into Answers, and confirm the Form is
 * fully answered. The page disables Submit until then; this is the server-side
 * guarantee, because partial Answers are never returned.
 */
export function normaliseAnswers(form: Form, input: unknown): Answers {
  if (!isRecord(input)) fail("Submitted answers must be an object keyed by Question id.");
  const raw = input as Record<string, unknown>;
  const answers: Answers = {};

  for (const q of form.questions) {
    const supplied = raw[q.id];
    const choices: string[] = [];
    let other: string | null = null;

    if (isRecord(supplied)) {
      const validLabels = new Set(q.choices.map((c) => c.label));
      if (Array.isArray(supplied.choices)) {
        for (const label of supplied.choices) {
          if (typeof label === "string" && validLabels.has(label) && !choices.includes(label)) {
            choices.push(label);
          }
        }
      }
      if (q.type === "single" && choices.length > 1) {
        fail(`Question "${q.id}" is single-select but received ${choices.length} Choices.`);
      }
      if (q.allowOther && typeof supplied.other === "string" && supplied.other.trim() !== "") {
        other = supplied.other.trim();
      }
    }

    if (choices.length === 0 && other === null) {
      fail(`Question "${q.id}" has no Answer; every Question must be answered before a Form is Submitted.`);
    }

    answers[q.id] = { choices, other };
  }

  return answers;
}
