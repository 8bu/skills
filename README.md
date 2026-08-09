# long-skills

Long Nguyen's personal Claude skills, and the MCP servers some of them call.
Installable as a Claude Code / Cowork plugin.

## Layout

```
.claude-plugin/plugin.json   Plugin manifest (name, version, author)
skills/                      One folder per skill, each with a SKILL.md — docs only
mcp/                         One folder per MCP server, each self-contained
docs/adr/                    Decisions that had a real alternative
CONTEXT.md                   Ubiquitous language for this repo
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
