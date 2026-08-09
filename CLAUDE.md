# Repo guidance

This repo holds personal Claude skills, and the MCP servers some of them call.

## Skills — `skills/`

- `skills/` is documentation only. No code runs from it.
- Each skill lives in `skills/<name>/SKILL.md`.
- `SKILL.md` starts with YAML frontmatter: `name` (kebab-case, matches folder)
  and `description` (one line stating when to use the skill).
- Keep skills self-contained. Put helper scripts inside the skill folder.
- Start new skills from `templates/SKILL.template.md`.

## MCP servers — `mcp/`

- Each server lives in `mcp/<name>/`, self-contained: its own `package.json`,
  dependencies, `src/`, and `test/`. No workspace tooling until a second server
  needs it.
- A server with an accompanying skill documents the calling convention in
  `skills/<name>/SKILL.md` and the implementation in `mcp/<name>/README.md`.

## Conventions

- `CONTEXT.md` holds the repo's ubiquitous language. Use those words in code,
  tests, and UI copy.
- Decisions with a real alternative go in `docs/adr/`.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).
