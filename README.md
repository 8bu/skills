# 8bu-skills

8bu's reusable tooling for AI agents: skills, the MCP servers that some skills call, OMP
extensions, and the scripts and templates that maintain them. The skills follow the
[Agent Skills](https://agentskills.io) standard, so they work in Claude Code, Codex,
Cursor, Antigravity, and other agents that read `SKILL.md`.

## What is where

| Folder | Holds | Used by |
| --- | --- | --- |
| `skills/` | One folder for each skill: a `SKILL.md` document, and its helper scripts. | Any agent that reads `SKILL.md`. |
| `extensions/` | One folder for each OMP (Oh My Pi) extension. Each one is an OMP plugin package: a `package.json` and an `index.ts`. | OMP only. Not part of the plugin. |
| `mcp/` | One folder for each MCP server. Each one is an independent npm package. | Any MCP client. |
| `scripts/` | Maintenance scripts for this repository. | You. |
| `templates/` | Files to copy when you start a new skill. | You. |

## Skills

| Skill | Function |
| --- | --- |
| [`bellemermaid`](skills/bellemermaid/SKILL.md) | Renders a Mermaid diagram to a themed SVG file or to ASCII art in the terminal. |
| [`grillwithform`](skills/grillwithform/SKILL.md) | Shows a full set of questions as a form in your browser. Reads your answers back. It calls the [`grillwithform`](mcp/grillwithform) MCP server. |
| [`stv`](skills/stv/SKILL.md) | Writes and checks Vietnamese computer-science documents. It applies the TVKTĐGH/KHMT standard. |

## OMP extensions

| Extension | Function |
| --- | --- |
| [`prompt-repeat`](extensions/prompt-repeat/index.ts) | Sends the task text twice to `deepseek/deepseek-flash` when it runs a `task` subagent. Other models, other agents, and the session history stay as they are. |

This repository is an OMP marketplace. The catalogue is
[`.omp-plugin/marketplace.json`](.omp-plugin/marketplace.json), and its name is `skills`.

```sh
omp plugin marketplace add 8bu/skills
omp plugin discover skills
omp plugin install prompt-repeat@skills
```

For local development with `bun dev:ext`, read
[`extensions/prompt-repeat/README.md`](extensions/prompt-repeat/README.md).

## Install

There are two parts. The **skills** are documents that tell your agent what to do. The
**MCP server** is the program that shows the form. Only the `grillwithform` skill needs
the server; the other skills do not.

You must have Node 20 or later for the server.

### Claude Code: both parts at one time

```sh
/plugin marketplace add 8bu/skills
/plugin install 8bu-skills@8bu
```

This installs the skills and registers the MCP server. You do not need the steps below.

### Other agents: the skills

```sh
npx skills add 8bu/skills                        # every skill
npx skills add 8bu/skills --skill grillwithform  # one skill
```

The command finds the agents on your machine and asks which ones to write to. It supports
more than 75 agents, which include Codex, Cursor, Windsurf, Cline, Zed, Goose, OpenCode,
and GitHub Copilot. Useful options:

| Option | Effect |
| --- | --- |
| `-a, --agent <name>` | Writes to one agent only, for example `-a codex -a cursor`. |
| `-g, --global` | Writes to your home directory, not the current project. |
| `--all` | Writes to each agent it finds, and asks nothing. |
| `--copy` | Copies the files. The default makes symbolic links. |

### Other agents: the MCP server

The server speaks MCP over stdio. Each agent below starts it with the same command:
`npx -y grillwithform mcp`.

**Codex** — run `codex mcp add`, or write `~/.codex/config.toml`:

```toml
[mcp_servers.grillwithform]
command = "npx"
args = ["-y", "grillwithform", "mcp"]
```

**Cursor** — write `~/.cursor/mcp.json` for each project, or `.cursor/mcp.json` for one:

```json
{
  "mcpServers": {
    "grillwithform": { "command": "npx", "args": ["-y", "grillwithform", "mcp"] }
  }
}
```

**Antigravity** — write `~/.gemini/config/mcp_config.json`, or `.agents/mcp_config.json`
in the workspace. The file uses the same shape as the Cursor example above. In the IDE, open
the agent panel, select **Manage MCP Servers**, then **View raw config**.

**Claude Code without the plugin**:

```sh
claude mcp add grillwithform -- npx -y grillwithform mcp
```

**Any other MCP client** — give it this command, and it needs nothing else:

```sh
npx -y grillwithform mcp
```

## Layout

```
.claude-plugin/marketplace.json  The catalogue. This repository is one plugin.
.claude-plugin/plugin.json       The plugin manifest: the skills and the MCP server.
skills/                          One folder for each skill. Documents and helper scripts.
extensions/                      One folder for each OMP extension. One index.ts each.
mcp/                             One folder for each MCP server. Each one is independent.
CONTEXT.md                       The words this repository uses, and their meanings.
templates/SKILL.template.md      Copy this file to start a new skill.
scripts/list-skills.sh           Lists each skill and its description.
CLAUDE.md                        Instructions for an agent working in this repository.
AGENTS.md                        A symbolic link to CLAUDE.md, for agents that read it.
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
