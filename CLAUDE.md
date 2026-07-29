# Repo guidance

This repo holds personal Claude skills.

- Each skill lives in `skills/<name>/SKILL.md`.
- `SKILL.md` starts with YAML frontmatter: `name` (kebab-case, matches folder)
  and `description` (one line stating when to use the skill).
- Keep skills self-contained. Put helper scripts inside the skill folder.
- Start new skills from `templates/SKILL.template.md`.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).
