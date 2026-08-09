# MCP servers

Skills are documents. All code that runs is in this directory.

Each server has its own folder, `mcp/<name>/`. Each folder is independent: it has its own
`package.json`, its own dependencies, and its own tests. There is no workspace tooling, no
root `package.json`, and no shared lock file. One server does not need them. A second server
can add them later.

Some servers have a skill. The skill is in `skills/<name>/SKILL.md`. The skill tells the
agent how to call the server. It does not describe the code. The `README.md` of the server
describes the code.

| Server | Function | Package |
| --- | --- | --- |
| [`grillwithform`](grillwithform/) | Shows a form of questions to a person in their browser. Returns the answers as markdown. | [`grillwithform`](https://www.npmjs.com/package/grillwithform) |
