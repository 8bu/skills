# MCP servers

Skills are documentation; anything that runs lives here. One directory per server,
`mcp/<name>/`, each self-contained with its own `package.json`, dependencies and tests.

There is deliberately no workspace tooling — no root `package.json`, no shared lockfile.
A second server would earn that; one does not.

A server that has an accompanying skill keeps the skill in `skills/<name>/SKILL.md`, where
it documents the calling convention rather than the implementation.

| Server | What it does |
| --- | --- |
| [`askwithform`](askwithform/) | Asks a person a form of questions in their browser and returns the answers as markdown. |
