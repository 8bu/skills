# grillwithform

An MCP server that puts a form of questions in front of a person in their browser and hands
the answers back to the assistant as markdown.

Unlimited questions, every one of them mandatory, one Submit. Either all the answers come
back or none do.

See [`../../CONTEXT.md`](../../CONTEXT.md) for the vocabulary (Ask, Form, Question, Choice,
Other, Answer, Outcome) and [`../../docs/grillwithform-design.md`](../../docs/grillwithform-design.md)
for the design this implements.

## Build

```sh
bun install
bun test
bun run build        # → ./grillwithform, a single self-contained binary
```

## Register with Claude Code

```sh
claude mcp add grillwithform -- /absolute/path/to/mcp/grillwithform/grillwithform mcp
```

## Run one form without an MCP client

```sh
./grillwithform serve form.json
```

Same server code, in-process. The answers print to stdout as markdown; the exit status is
`0` when the form was Submitted and `1` otherwise.

```json
{
  "title": "grillwithform",
  "questions": [
    {
      "id": "ui",
      "text": "Where does the UI render?",
      "type": "single",
      "choices": [
        { "label": "Browser", "description": "A real page, readable at length." },
        { "label": "Terminal" }
      ]
    },
    { "id": "name", "text": "What should it be called?", "type": "single", "choices": [] }
  ]
}
```

## The tool

`grill_with_form` takes:

| Field | Meaning |
| --- | --- |
| `title` | What the round of questions is about. |
| `questions[].id` | Short unique key; labels the answer that comes back. |
| `questions[].text` | The question. May use `` `code` ``, `**bold**` and links. |
| `questions[].type` | `single` (at most one choice) or `multi` (any number). |
| `questions[].choices` | Pre-written options, each a `label` and optional `description`. May be empty. |
| `questions[].allowOther` | Free-text alongside the choices. Defaults to true. |
| `timeoutSeconds` | Give up waiting after this long. Omit to wait indefinitely. |

A form is validated before anything renders. Duplicate ids, zero questions, and a question
that is unanswerable (no choices and no Other) are rejected with a message the assistant can
act on. Nothing is auto-repaired, so a broken form never reaches the person.

The answers come back per question, echoing only what was chosen:

```markdown
# Ask: grillwithform

- **[ui]** Where does the UI render? → **Browser**
- **[name]** What should it be called? → *other:* "grillwithform"
```

Cancelling, or closing the tab and not coming back within 30 seconds, ends the ask with a
one-line body and no answers.

## How it runs

One long-lived HTTP server on an ephemeral port bound to `127.0.0.1`, shared by every
concurrent ask. Each ask lives at `/form/<unguessable id>` so no other process on the machine
can read a form it was not given. A WebSocket carries the live state.

The page is hand-written CSS on shadcn/ui's token palette plus ~200 lines of vanilla JS, all
inlined into the binary. No Tailwind and no CSS framework; nothing is fetched, so it works
offline and no third party ever sees a form. Light and dark follow the OS setting. Question and
choice text is escaped before a small markdown subset is applied, so no unescaped assistant
output reaches the DOM.

Set `GRILLWITHFORM_NO_BROWSER=1` to skip opening a browser; the URL is always printed to stderr.
