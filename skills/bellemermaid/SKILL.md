---
name: bellemermaid
description: "Renders a Mermaid diagram to a themed SVG file, or to ASCII art in the terminal, with the beautiful-mermaid library. Use it when the user asks for a diagram, a flowchart, a sequence diagram, a state diagram, a class diagram, an entity relationship diagram, or a chart. Use it also when the user gives Mermaid source or a .mmd file and wants a picture from it."
license: MIT
---

# bellemermaid — render Mermaid diagrams

The script `scripts/render.mjs` turns Mermaid source into an SVG file or into ASCII art. It
uses the [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) library. The
library is pure JavaScript. It starts no browser, so a render takes about 50 ms.

**Read the ASCII. Write the SVG to a file.** ASCII shows you the shape of the diagram in a
few hundred characters. An SVG holds about 5 kB of markup that you do not need to read.

## When to use it

Use this skill when:

- The user asks for a diagram, a flowchart, a sequence diagram, a state diagram, a class
  diagram, an entity relationship diagram, or a chart.
- The user gives Mermaid source, or a `.mmd` file, and wants a picture.
- The user asks for a diagram in a document, a README, or a set of slides.
- You want to check your own understanding of a flow before you write it down.

Do not use it when the target file shows Mermaid itself. GitHub, GitLab, and many static
site builders render a ` ```mermaid ` block. Write the block, and render nothing.

## Steps

1. **Choose the type.** `references/DIAGRAM_TYPES.md` lists the six types that the library
   renders, and the types that it refuses. `mindmap`, `pie`, and `gantt` all fail.
2. **Write the source to a file.** Use the `.mmd` extension.
3. **Check the source.** The library accepts a bad body without an error, so use a real
   checker. Use `vendor/maid.cjs` when that file is present. If it is absent, use npx:
   ```bash
   node vendor/maid.cjs diagram.mmd      # the Cowork build
   npx -y @probelabs/maid diagram.mmd    # each other place
   ```
   It prints `Valid`, or an error with a code, a line, and a column.
4. **Look at the shape first.** Render ASCII and read it:
   ```bash
   node scripts/render.mjs -i diagram.mmd -f ascii
   ```
5. **Write the SVG.** Choose a theme from `references/THEMES.md`:
   ```bash
   node scripts/render.mjs -i diagram.mmd -o docs/diagram.svg -t tokyo-night --json
   ```
6. **Read the JSON.** It gives the path and the size:
   ```json
   {"schema_version":1,"success":true,"format":"svg","bytes":4810,
    "dimensions":{"width":479.9,"height":182.5},"theme":"tokyo-night",
    "output":"/abs/path/docs/diagram.svg"}
   ```

The first run installs the library into the skill folder. That takes a few seconds. Each run
after that starts immediately.

## Options

| Option | Effect |
| --- | --- |
| `-c, --code <text>` | Mermaid source as a string |
| `-i, --input <file>` | Mermaid source file |
| `--input-dir <dir>` | Render each `.mmd` file in the directory. Needs `--output-dir`. |
| `-o, --output <file>` | Output file. SVG needs this, or `--stdout`. |
| `-f, --format svg\|ascii` | Output format. The default is `svg`. |
| `-t, --theme <name>` | One of the 15 themes |
| `--font-preset <name>` | `serif` (the default), `sans`, `mono`, or `sketch` |
| `--font <family>` | One font family name. It replaces the preset. |
| `--sketch` | Short form of `--font-preset sketch` |
| `--transparent` | No background fill |
| `--json` | One line of JSON on stdout |
| `--workers <n>` | Files to render at the same time. The default is 4. |
| `--plain` | Pure ASCII instead of Unicode box characters |

Run `node scripts/render.mjs --help` for the full list, which includes the seven colour
options and the spacing options.

### Themes

`references/THEMES.md` holds the 15 themes with their colours. Short guide:

- Dark documentation — `tokyo-night`.
- Light documentation — `github-light`.
- A README that both light mode and dark mode show — add `--transparent`, and use
  `zinc-light` or `zinc-dark`.

### Fonts

The library takes one font family name. It writes that name into the SVG, and it adds a
Google Fonts import for it. A preset is a short name for one family:

| Preset | Family | Use it for |
| --- | --- | --- |
| `serif` | Lora | The default. Documents and reports. |
| `sans` | Inter | The font that the layout measures. Use it for a dense diagram. |
| `mono` | JetBrains Mono | Code, and names of files. |
| `sketch` | Patrick Hand | A hand-written look. |

`--font <family>` names any other family. Google Fonts must hold it, or a reader sees the
fallback font.

`--sketch` changes **the lettering only**. The library draws sharp geometric boxes. It has
no rough edge mode, so a sketch diagram is not fully hand-drawn.

A reader who is offline sees the fallback font, because the SVG loads the font from Google.

## Batch

```bash
node scripts/render.mjs --input-dir ./diagrams --output-dir ./docs/img \
  -t github-dark --workers 8 --json
```

The JSON holds one result for each file. The exit code is 3 if one file or more failed. The
other files still render.

## Limits to know

1. **The library accepts a bad body.** It checks the header only. `A[Start --> B]]]{` renders
   a wrong diagram and reports success. Always run `maid` first.
2. **A 0 x 0 render means an empty diagram.** The script fails with exit code 3 when this
   happens. A sequence diagram with no `participant` line is the common cause. Pass
   `--allow-empty` to write the file anyway.
3. **The layout uses Inter metrics.** The library measures each label as Inter at 13 px, and
   it sets no `textLength`. It does not measure the font that you choose. A wider font can
   spill out of its box. Look at the result when a label is long. `--font-preset sans` gives
   Inter, so the boxes always fit.
4. **Six types only.** See `references/DIAGRAM_TYPES.md`.
5. **No PNG.** Render the SVG. For a PNG, run
   `npx -y beautiful-mermaid-cli@~0.2.4 render x.mmd -o x.png --scale 2`.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Unclassified |
| 2 | Bad option, or an unknown theme |
| 3 | Parse failure, an empty render, or a failed file in a batch |
| 4 | Read failure, write failure, or an install failure |

An error goes to stderr. With `--json`, it goes there as one line of JSON.

## Other places than Claude Code

Claude Cowork and claude.ai take a skill as a zip file. Those machines give no npm access,
and they start again for each session. Make a zip that holds each dependency:

```bash
./scripts/build-cowork.sh
```

It writes `dist/bellemermaid-cowork.zip`. In Cowork, go to **Customize > Skills** and upload
it. A skill does not move between products, so upload it one time for each product.

The build puts two files in `vendor/`. The scripts read `vendor/` before they read
`node_modules/`, so the same source works in each place.

## Files

- `scripts/render.mjs` — the renderer.
- `scripts/build-cowork.sh` — makes the zip for Cowork and for claude.ai.
- `scripts/themes.mjs` — lists the themes. `--json` and `--markdown` change the output.
- `references/THEMES.md` — generated. Make it again with
  `node scripts/themes.mjs --markdown > references/THEMES.md`.
- `references/DIAGRAM_TYPES.md` — the syntax of each type, with tested examples.

## Credits

- Rendering by [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) (lukilabs,
  MIT).
- Checking by [maid](https://github.com/probelabs/maid) (probelabs).
- The approach comes from [Pretty-mermaid-skills](https://github.com/imxv/Pretty-mermaid-skills)
  (imxv, MIT). This skill shares no code with it.
