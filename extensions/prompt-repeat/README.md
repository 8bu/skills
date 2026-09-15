# prompt-repeat

An OMP (Oh My Pi) extension that sends the task text twice to `deepseek/deepseek-flash`
when it runs a `task` subagent.

## What it does

For a `task` subagent that uses `deepseek/deepseek-flash`, at any thinking level, the
extension sends the latest user or task message twice:

```text
<task>

<task>
```

The change lives only in the transient LLM context of one request. The session history,
the system prompts, the tool schemas, the images and the earlier messages do not change.
Other agents and other models do not change. The operation is idempotent: text that is
already repeated stays as it is.

## Install from GitHub

This repository is an OMP marketplace. The name of the marketplace is `skills`. It is not
`8bu`: OMP reads a marketplace name that starts with a digit as an npm version.

```sh
omp plugin marketplace add 8bu/skills
omp plugin discover skills
omp plugin install prompt-repeat@skills
```

Add `--scope project` to install for one project only:

```sh
omp plugin install prompt-repeat@skills --scope project
```

Start a new `omp` session. OMP loads the extension when a session starts.

To move to a newer version, refresh the catalogue first:

```sh
omp plugin marketplace update skills
omp plugin upgrade prompt-repeat@skills
```

## Uninstall

```sh
omp plugin uninstall prompt-repeat@skills
```

To drop the catalogue too:

```sh
omp plugin marketplace remove skills
```

## Local development

Clone the repository and go to its root:

```sh
git clone https://github.com/8bu/skills.git
cd skills
```

Start the development mode:

```sh
bun dev:ext
```

The command prints:

```text
$ bun dev:ext
prompt-repeat: local development mode active
local: /Users/8bu/Projects/skills/extensions/prompt-repeat
Press Ctrl+C to stop and restore the remote marketplace version.

^C
prompt-repeat: restoring remote marketplace version...
prompt-repeat: remote version restored
```

Before the "active" line, the command prints what it found, for example
`prompt-repeat: detected prompt-repeat@skills 0.1.0 (user scope)` or
`prompt-repeat: no remote version installed`. After the restore, it prints what it
restored.

The command does three things:

1. It finds the installed remote copy of the extension, and it writes that record to
   `.cache/omp-dev-ext/state.json`. This file does not go into Git.
2. It runs `omp plugin link extensions/prompt-repeat`. OMP then loads the copy in this
   repository.
3. It stays in the foreground until you stop it.

Start a new `omp` session after the command starts, and after each code change.

## What happens on Ctrl+C

On Ctrl+C, on `SIGTERM`, on `SIGHUP`, or on a normal exit, the script runs
`omp plugin install --force prompt-repeat@skills`. This command restores the cached
marketplace copy. If no remote version was installed before, the script removes the link
instead. Then the script deletes the state file.

A hard kill (`SIGKILL`) does not run the restore. The next `bun dev:ext` restores first,
then starts again. There is no `dev:ext:off` command.

## Check which copy is active

```sh
omp plugin list --json
```

The marketplace copy appears only under `marketplace`, as `prompt-repeat@skills`. The local
link appears under `npm`, with a `path` field.

You can also read the runtime slot:

```sh
readlink ~/.omp/plugins/node_modules/prompt-repeat
```

A path under `~/.omp/plugins/cache/` means the remote copy. A path in this repository means
the local copy.

## Reload after code changes

OMP imports extension modules one time, when a session starts. The `/reload-plugins`
command reloads skills, commands, agents and MCP servers. It does not reload extension
code. Start a new `omp` process to load your changes.

## Known limitations

These limitations come from the plugin manager of OMP 18.2.0.

- A marketplace name that starts with a digit does not work. `omp plugin install
  name@8bu` goes to npm, because `8bu` looks like a version. The marketplace is `skills`
  for this reason.
- There is no `omp plugin unlink` command. The script uses `omp plugin uninstall
  prompt-repeat` to drop the lock entry, then it removes the leftover symbolic link
  itself. It does this only when the link points at this repository.
- `omp plugin uninstall prompt-repeat` matches the plugin by name, not by id. It can
  remove a marketplace install of the same plugin. The script drops the local link first
  and reinstalls the remote copy after, so the end state is correct.
- The restore installs the current version of the catalogue. That version can differ from
  the version that the script recorded at the start. The script prints both versions.
- An enabled project-scope install hides the user-scope link. While the development mode
  is active, the script disables the project copy. It enables the copy again on exit.
- A project-scope install writes `.omp/plugins/` into the project directory. Git does not
  ignore that folder in this repository.
- The GitHub source works only after the `.omp-plugin/marketplace.json` catalogue is on
  the `main` branch.
