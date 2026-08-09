# Repository guidance

This repository holds personal Claude skills. It also holds the MCP servers that some skills
call. The repository is one Claude Code plugin, and it is also its own marketplace.

## Skills — `skills/`

- The folder `skills/` holds documents only. No code runs from it.
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
