# grillwithform

An MCP server. It shows a form of questions to a person in their browser. It gives the
answers back to the assistant as markdown.

A form can hold any number of questions. The person must answer each question. There is one
Submit button. You get all of the answers, or you get none of them.

For the words this server uses, read
[`CONTEXT.md`](https://github.com/8bu/skills/blob/main/CONTEXT.md): Ask, Form, Question,
Choice, Other, Answer, and Outcome.

## Install

```sh
claude mcp add grillwithform -- npx -y grillwithform mcp
```

You must have Node 20 or later. You do not need to build or clone anything.

## Run one form without an MCP client

```sh
npx -y grillwithform serve form.json
```

This command runs the same server code in the same process. It prints the answers to stdout
as markdown. The exit status is `0` if the person submits the form. For each other result,
the exit status is `1`.

```json
{
  "title": "grillwithform",
  "questions": [
    {
      "id": "ui",
      "text": "Where does the UI render?",
      "type": "single",
      "choices": [
        { "label": "Browser", "description": "A real page. You can read long text on it." },
        { "label": "Terminal" }
      ]
    },
    { "id": "name", "text": "What should it be called?", "type": "single", "choices": [] }
  ]
}
```

To stop the server from opening a browser, set `GRILLWITHFORM_NO_BROWSER=1`. The server
always prints the URL to stderr.

## The tool

The tool `grill_with_form` accepts these fields.

| Field | Meaning |
| --- | --- |
| `title` | The subject of this set of questions. |
| `questions[].id` | A short unique key. It labels the answer that comes back. |
| `questions[].text` | The question. It can contain `` `code` ``, `**bold**`, and links. |
| `questions[].type` | `single` for one choice at most. `multi` for any number of choices. |
| `questions[].choices` | The options you write. Each one has a `label` and an optional `description`. The list can be empty. |
| `questions[].allowOther` | Shows a free-text box with the choices. The default is true. |
| `timeoutSeconds` | Stops the ask after this time. Omit this field to wait with no limit. |

The server checks the form before it shows anything. It rejects these three faults:

- two questions with the same `id`
- a form with no questions
- a question that nobody can answer, because it has no choices and no free-text box

The server does not repair a bad form. It returns a message that tells the assistant what to
correct. A bad form never gets to the person.

The answers come back one line for each question. The server shows only what the person
selected or wrote.

```markdown
# Ask: grillwithform

- **[ui]** Where does the UI render? → **Browser**
- **[name]** What should it be called? → *other:* "grillwithform"
```

The ask can also end in two other ways. The person can click Cancel. The person can also
close the tab and not come back in 30 s. Each of these results gives one line of text and no
answers.

## How it runs

One HTTP server runs for a long time. It listens on `127.0.0.1` and on a free port. All
concurrent asks share this one server.

Each ask has its own address, `/form/<random id>`. The server makes the id from 16 random
bytes. Another program on the same machine cannot guess the id, so it cannot read a form.

A WebSocket carries the live state between the page and the server. If the tab closes and
does not come back in 30 s, the ask ends with the outcome Abandoned. The server never waits
for a signal that cannot come.

The page uses hand-written CSS on the shadcn/ui token palette, and approximately 290 lines
of plain JavaScript. The build puts the CSS and the JavaScript into the bundle. The page
uses no Tailwind and no CSS framework. It loads nothing from the network, so it works
offline and no other party sees a form. The page follows the light or dark setting of the
operating system.

The page escapes all text from the assistant. Then it applies a small subset of markdown.
No text from the assistant reaches the DOM without an escape first.

## Develop

```sh
bun install
bun test             # unit, integration, DOM, and the Node bundle end to end
bun run typecheck
bun run build        # → dist/grillwithform.js, the file that npm publishes
```

Bun runs and bundles the TypeScript source, but the result runs on Node. The build imports
the CSS and the JavaScript of the page as text, so they go into the one output file. The
packages `ws` and `@modelcontextprotocol/sdk` stay external. npm installs them.
