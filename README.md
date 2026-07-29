# long-skills

Long Nguyen's personal Claude skills. Installable as a Claude Code / Cowork plugin.

Empty by design — add skills over time. Structure kept minimal and clean.

## Layout

```
.claude-plugin/plugin.json   Plugin manifest (name, version, author)
skills/                      One folder per skill, each with a SKILL.md
templates/SKILL.template.md  Copy this to start a new skill
scripts/list-skills.sh       List every skill and its description
CLAUDE.md                    Guidance for Claude when editing this repo
```

## Add a skill

1. Copy the template:
   ```bash
   cp templates/SKILL.template.md skills/<skill-name>/SKILL.md
   ```
2. Fill in the frontmatter (`name`, `description`) and the body.
3. Keep `name` in kebab-case and matching the folder name.
4. Commit: `git commit -m "feat(<skill-name>): add skill"`.

## Install

Point your Claude Code / Cowork plugin config at this repo, or symlink
`skills/` into your skills directory.

## License

[MIT](LICENSE) — © 2026 Long Nguyen.
