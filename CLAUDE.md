# Repository guidance

`AGENTS.md` is a symbolic link to this file. Both names hold the same instructions.

This repository holds reusable tooling for AI agents: skills, the MCP servers that some
skills call, OMP extensions, scripts, and templates. The repository is one Claude Code
plugin, and it is also its own marketplace.

## Skills — `skills/`

- Keep the frontmatter to the six fields of the [Agent Skills](https://agentskills.io)
  standard: `name`, `description`, `allowed-tools`, `compatibility`, `license`, and
  `metadata`. A field that only Claude Code knows makes the skill fail validation on
  claude.ai and in the Skills API.
- Each skill is in `skills/<name>/SKILL.md`.
- `SKILL.md` starts with YAML frontmatter. It has two fields: `name` in kebab-case, which
  matches the folder name, and `description`, which states when Claude uses the skill.
- Keep each skill complete in itself. Put helper scripts in the folder of the skill.
- Start a new skill from `templates/SKILL.template.md`.

## MCP servers — `mcp/`

- Each server is in `mcp/<name>/`. Each one is independent: it has its own `package.json`,
  its own dependencies, `src/`, and `test/`. Do not add workspace tooling until a second
  server needs it.
- A server that has a skill describes the calling rules in `skills/<name>/SKILL.md`. It
  describes the code in `mcp/<name>/README.md`.
- A server that npm publishes must run on Node 20 or later. Bun runs and bundles the source,
  but the published file must not need Bun.

## OMP extensions — `extensions/`

- Each extension is in `extensions/<name>/index.ts`. The folder name is the extension id
  that `disabledExtensions` uses: `extension-module:<name>`.
- Keep each extension complete in itself: one `index.ts`, no dependencies outside what
  `@oh-my-pi/pi-coding-agent` gives it. Type-only imports from that package are fine.
- A header comment in `index.ts` states what the extension does, and what it does not touch.
- To use an extension, put a symbolic link to its folder in `~/.omp/agent/extensions/`.
  The plugin does not distribute extensions.

## Distribution — `.claude-plugin/`

- `plugin.json` is the manifest of the plugin. It lists the MCP servers. Claude Code finds
  the skills in `skills/` by itself.
- `marketplace.json` is the catalogue. It lists this repository as one plugin.
- After a change to either file, run `claude plugin validate .`.
- When the code of a server changes, raise the version in three places: the `package.json`
  of the server, `plugin.json`, and `marketplace.json`. npm refuses a second publish of the
  same version.

## Conventions

- `CONTEXT.md` gives the words this repository uses. Use those words in the code, the tests,
  and the user interface.
- Keep design notes and decision records in `docs/`. Git does not track that folder,
  and npm does not publish it.
- Write documents in ASD-STE100 Simplified Technical English. The `stv` skill holds the
  Vietnamese equivalent for Vietnamese documents.
- Use Conventional Commits: `feat:`, `fix:`, `docs:`, and `chore:`.
