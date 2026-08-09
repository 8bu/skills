/**
 * Renders an Outcome as the markdown the assistant receives.
 *
 * Only what the person actually answered appears: unselected Choices are never
 * echoed, and no Outcome ever carries partial Answers.
 */

import type { Answer, Form, Outcome } from "./domain.ts";

const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();

export function renderOutcome(form: Form, outcome: Outcome): string {
  const heading = `# Ask: ${oneLine(form.title)}`;

  if (outcome.kind === "cancelled") {
    return `${heading}\n\nCancelled — the person declined to answer. No Answers were returned.`;
  }
  if (outcome.kind === "abandoned") {
    return `${heading}\n\nAbandoned — the person left without deciding. No Answers were returned, and no explicit refusal occurred.`;
  }

  const lines = form.questions.map((q) => {
    const answer = outcome.answers[q.id];
    return `- **[${q.id}]** ${oneLine(q.text)} → ${renderAnswer(answer)}`;
  });

  return `${heading}\n\n${lines.join("\n")}`;
}

function renderAnswer(answer: Answer | undefined): string {
  if (!answer) return "*(no answer)*";

  const selected = answer.choices.map((label) => `**${label}**`).join("; ");
  const other = answer.other === null ? "" : `*other:* ${JSON.stringify(oneLine(answer.other))}`;

  if (selected && other) return `${selected} + ${other}`;
  return selected || other || "*(no answer)*";
}
