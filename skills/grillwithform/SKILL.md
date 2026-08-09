---
name: grillwithform
description: "Put a whole round of questions to the person as a browser form via the grill_with_form MCP tool, and read the answers back. Use when the user asks for a form (\"put that in a form\", /grillwithform), or when a grilling-style round produces several questions at once. Not for one or two quick questions."
---

# grillwithform — ask a whole round of questions at once

`grill_with_form` opens a form in the person's browser, waits, and returns their answers as
markdown. Unlimited questions, all mandatory, one Submit: either every answer comes back or
none does.

Vocabulary is in `CONTEXT.md`. The server lives in `mcp/grillwithform/`.

## When to use

Use it when **a whole round of questions already exists at once**:

- The user asks for one — "put that in a form", "give me a form", `/grillwithform`.
- A grilling, brainstorming, or spec-gathering round has produced several open questions
  together. A round of grilling *is* a form; send it as one.
- More than a couple of questions, or options whose text is long enough to want reading
  rather than skimming — descriptions, code spans, links.

## When not to use

- One or two quick questions mid-task. Ask in the conversation. Opening a browser window
  unasked is obnoxious.
- Anything the codebase, the git history, or a file can answer. Look first.
- A decision that is yours to make. Make it and say what you assumed.

## How to call it

One call carries the whole round:

```json
{
  "title": "Auth rewrite — open questions",
  "questions": [
    {
      "id": "session-store",
      "text": "Where do sessions live?",
      "type": "single",
      "choices": [
        { "label": "Redis", "description": "Fast, one more thing to run." },
        { "label": "Postgres", "description": "One less moving part; slower reads." }
      ]
    },
    {
      "id": "must-have",
      "text": "Which of these are must-haves for v1?",
      "type": "multi",
      "choices": [{ "label": "SSO" }, { "label": "2FA" }, { "label": "Audit log" }]
    },
    { "id": "deadline", "text": "Anything else forcing the shape of this?", "type": "single", "choices": [] }
  ]
}
```

- `id` — short and meaningful; it labels the answer you get back.
- `type` — `single` for at most one choice, `multi` for any number.
- `choices` — leave empty for a question that is purely free text.
- `allowOther` — free text alongside the choices, on by default. Set it false only when the
  choices are genuinely exhaustive.
- `timeoutSeconds` — omit it. Wait for as long as the person takes.

Write the choices as real positions with real trade-offs, not as a survey. A description
earns its place when it says what picking that option costs.

## Reading the result

Three outcomes:

- **Submitted** — every question answered. The markdown lists them; only what was chosen is
  echoed. Treat free text as the more specific answer when it sits alongside a choice.
- **Cancelled** — the person declined. Do not re-send the form. Ask what to do instead, or
  proceed under a stated assumption.
- **Abandoned** — they left without deciding. Same response as Cancelled, but no refusal was
  made, so it is fair to check whether the form was seen at all.

Never guess a missing answer: partial answers are never returned, so anything absent was
never asked well enough.

## Notes

- The tool rejects a bad form before anything renders — duplicate ids, zero questions, or a
  question with no choices and no Other. The error says what to fix; fix it and call again.
- The browser opens on its own, and the URL is also printed to stderr if it does not.
- Nothing leaves the machine: the server binds to `127.0.0.1` and the page has no external
  assets.
