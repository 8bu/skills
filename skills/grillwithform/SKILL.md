---
name: grillwithform
description: "Shows a full set of questions to the person as a browser form with the grill_with_form MCP tool, then reads the answers back. Use it when the user asks for a form (\"put that in a form\", /grillwithform), or when a grilling session produces several questions at the same time. Do not use it for one or two quick questions."
license: MIT
---

# grillwithform — ask a full set of questions at one time

The tool `grill_with_form` opens a form in the browser of the person. It waits. Then it
returns the answers as markdown.

A form can hold any number of questions. The person must answer each question. There is one
Submit button. You get all of the answers, or you get none of them.

The words this tool uses are in `CONTEXT.md`. The server is in `mcp/grillwithform/`.

## When to use it

Use this tool when you already have a full set of questions. For example:

- The user asks for a form. The user says "put that in a form", "give me a form", or types
  `/grillwithform`.
- A grilling session, a brainstorm, or a specification review gives you several open
  questions at the same time. Send them as one form.
- You have more than two questions.
- Your options have long text, descriptions, code, or links. The person must read them
  carefully.

## When not to use it

- You have one or two short questions in the middle of a task. Ask in the conversation. Do
  not open a browser window if the user does not expect it.
- The code, the git history, or a file gives the answer. Look there first.
- The decision is yours. Make the decision. Then tell the user what you assumed.

## How to call it

Send the full set of questions in one call.

```json
{
  "title": "Auth rewrite — open questions",
  "questions": [
    {
      "id": "session-store",
      "text": "Where do sessions live?",
      "type": "single",
      "choices": [
        { "label": "Redis", "description": "It is fast. You must run one more service." },
        { "label": "Postgres", "description": "There is one less service. Reads are slower." }
      ]
    },
    {
      "id": "must-have",
      "text": "Which of these must v1 include?",
      "type": "multi",
      "choices": [{ "label": "SSO" }, { "label": "2FA" }, { "label": "Audit log" }]
    },
    { "id": "deadline", "text": "What else controls the shape of this work?", "type": "single", "choices": [] }
  ]
}
```

Use the fields as follows:

- `id` — keep it short and clear. It labels the answer that comes back.
- `type` — use `single` for one choice at most. Use `multi` for any number of choices.
- `choices` — leave this list empty for a free-text question.
- `allowOther` — shows a free-text box with the choices. The default is true. Set it to
  false only if your choices cover every possible answer.
- `timeoutSeconds` — omit this field. Let the person take the time they need.

Write each choice as a real position with a real cost. Do not write a survey. Add a
description when it tells the person what that choice costs.

## How to read the result

An ask ends in one of three outcomes.

- **Submitted** — the person answered each question. The markdown lists the answers. It
  shows only what the person selected or wrote. If a question has both a choice and free
  text, the free text is the more exact answer.
- **Cancelled** — the person refused to answer. Do not send the form again. Ask the user
  what to do, or continue and state your assumption.
- **Abandoned** — the person left and did not decide. Respond as you do for Cancelled. The
  person did not refuse, so you can ask if they saw the form.

Never guess an answer that is not there. The tool never returns a part of a form. If an
answer is absent, your question was not clear enough.

## Notes

- The tool rejects a bad form before it shows anything. These faults are rejected: two
  questions with the same `id`, a form with no questions, and a question with no choices and
  no free-text box. The error message tells you what to correct. Correct it and call again.
- The browser opens by itself. If it does not open, the tool prints the URL to stderr.
- No data leaves the machine. The server listens on `127.0.0.1`. The page loads nothing from
  the network.
