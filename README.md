# 8bu-skills

8bu's personal Claude skills. This repository also holds the MCP servers that some
skills call.

| Skill | Function |
| --- | --- |
| [`grillwithform`](skills/grillwithform/SKILL.md) | Shows a full set of questions as a form in your browser. Reads your answers back. It calls the [`grillwithform`](mcp/grillwithform) MCP server. |
| [`stv`](skills/stv/SKILL.md) | Writes and checks Vietnamese computer-science documents. It applies the TVKTĐGH/KHMT standard. |

## Install

You must have Node 20 or later. All three methods run the MCP server with `npx`.

**Method 1 — the Claude Code plugin.** You get the skills and the MCP server together.

```sh
/plugin marketplace add 8bu/skills
/plugin install 8bu-skills@8bu
```

**Method 2 — the skills only.** This method works for each agent that reads `SKILL.md`.

```sh
npx skills add 8bu/skills                        # both skills
npx skills add 8bu/skills --skill grillwithform  # one skill
```

The skills are documents. The `grillwithform` skill tells the agent how to call the MCP
server, but it does not install that server. Use method 1 or method 3 to install the server.

**Method 3 — the MCP server only.**

```sh
claude mcp add grillwithform -- npx -y grillwithform mcp
```

## Layout

```
.claude-plugin/marketplace.json  The catalogue. This repository is one plugin.
.claude-plugin/plugin.json       The plugin manifest: the skills and the MCP server.
skills/                          One folder for each skill. Documents only.
mcp/                             One folder for each MCP server. Each one is independent.
CONTEXT.md                       The words this repository uses, and their meanings.
templates/SKILL.template.md      Copy this file to start a new skill.
scripts/list-skills.sh           Lists each skill and its description.
CLAUDE.md                        Instructions for Claude in this repository.
```

## Add a skill

1. Copy the template:
   ```sh
   cp templates/SKILL.template.md skills/<skill-name>/SKILL.md
   ```
2. Write the frontmatter (`name` and `description`) and the body.
3. Use kebab-case for `name`. The name must be the same as the folder name.
4. Commit the new skill:
   ```sh
   git commit -m "feat(<skill-name>): add skill"
   ```

## License

[MIT](LICENSE) — © 2026 8bu.
