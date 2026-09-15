/**
 * `bun dev:ext` — run the local prompt-repeat extension in place of the
 * marketplace copy.
 *
 * The script links `extensions/prompt-repeat` into the OMP plugin runtime slot,
 * waits for a signal, and then puts the remote marketplace version back. The
 * recovery state lives in `.cache/omp-dev-ext/state.json`. A run that dies
 * without a signal is repaired by the next run.
 *
 * Every change goes through `omp plugin ...` commands. This script never edits
 * an OMP configuration file itself.
 */
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

/** Folder of the extension inside this repository. It locates the package. */
const EXTENSION_NAME = "prompt-repeat";

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const EXTENSION_DIR = path.join(REPO_ROOT, "extensions", EXTENSION_NAME);
const EXTENSION_MANIFEST = path.join(EXTENSION_DIR, "package.json");
const MARKETPLACE_FILE = path.join(REPO_ROOT, ".omp-plugin", "marketplace.json");
const STATE_FILE = path.join(REPO_ROOT, ".cache", "omp-dev-ext", "state.json");

const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

type Scope = "user" | "project";

interface RemoteState {
	scope: Scope;
	version: string;
	enabled: boolean;
}

interface DevState {
	pluginId: string;
	packageName: string;
	extensionDir: string;
	remote: RemoteState | null;
	projectDisabledByDev: boolean;
	startedAt: string;
}

interface RemoteSummary {
	id: string;
	scope: Scope;
	entries: Array<{ version: string; enabled: boolean; installPath: string }>;
}

interface PluginList {
	marketplace: RemoteSummary[];
	npm: Array<{ name: string; path: string; enabled: boolean }>;
}

/** Shape of `omp plugin list --json`. Checked field by field: it is another tool's output. */
interface RawPluginList {
	marketplace?: Array<{
		id?: unknown;
		scope?: unknown;
		entries?: Array<{ version?: unknown; enabled?: unknown; installPath?: unknown }>;
	}>;
	npm?: Array<{ name?: unknown; path?: unknown; enabled?: unknown }>;
}

/** Shape of `.cache/omp-dev-ext/state.json`. Written by this script, edited by hand only for repair. */
interface RawDevState {
	pluginId?: unknown;
	packageName?: unknown;
	extensionDir?: unknown;
	remote?: { scope?: unknown; version?: unknown; enabled?: unknown } | null;
	projectDisabledByDev?: unknown;
	startedAt?: unknown;
}

// =============================================================================
// Small readers
// =============================================================================

function readJsonFile<T>(file: string): T {
	// A missing file must name itself, so check first and let a syntax error surface as is.
	if (!existsSync(file)) {
		throw new Error(`missing file: ${file}`);
	}
	return JSON.parse(readFileSync(file, "utf8")) as T;
}

/** Read one link's target. Returns null when the path is absent or not a link. */
function readLinkTarget(linkPath: string): string | null {
	try {
		if (!lstatSync(linkPath).isSymbolicLink()) {
			return null;
		}
		return readlinkSync(linkPath);
	} catch {
		return null;
	}
}

/**
 * Resolve a path for comparison. macOS reports `/private/tmp` for `/tmp`, so a
 * link target and the recorded directory can name the same directory twice.
 */
async function resolveForComparison(target: string): Promise<string> {
	try {
		return await fs.realpath(target);
	} catch {
		return path.resolve(target);
	}
}

// =============================================================================
// OMP commands
// =============================================================================

/** Run one `omp` command and return its stdout. Throws on a non-zero exit. */
async function omp(args: string[]): Promise<string> {
	const proc = Bun.spawn(["omp", ...args], {
		cwd: REPO_ROOT,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode !== 0) {
		const detail = stderr.trim() || stdout.trim();
		throw new Error(`omp ${args.join(" ")} failed with exit code ${exitCode}${detail ? `: ${detail}` : ""}`);
	}
	return stdout;
}

async function listPlugins(): Promise<PluginList> {
	const parsed = JSON.parse(await omp(["plugin", "list", "--json"])) as RawPluginList;

	const marketplace: RemoteSummary[] = [];
	for (const summary of Array.isArray(parsed.marketplace) ? parsed.marketplace : []) {
		if (typeof summary?.id !== "string") continue;
		const entries: RemoteSummary["entries"] = [];
		for (const entry of Array.isArray(summary.entries) ? summary.entries : []) {
			entries.push({
				version: typeof entry?.version === "string" ? entry.version : "unknown",
				enabled: entry?.enabled !== false,
				installPath: typeof entry?.installPath === "string" ? entry.installPath : "",
			});
		}
		marketplace.push({ id: summary.id, scope: summary.scope === "project" ? "project" : "user", entries });
	}

	const npm: PluginList["npm"] = [];
	for (const entry of Array.isArray(parsed.npm) ? parsed.npm : []) {
		if (typeof entry?.name !== "string") continue;
		npm.push({
			name: entry.name,
			path: typeof entry.path === "string" ? entry.path : "",
			enabled: entry.enabled !== false,
		});
	}

	return { marketplace, npm };
}

/**
 * Pick the remote install that OMP would load: an enabled project-scope copy
 * shadows the user-scope copy. Returns null when nothing is installed.
 */
function selectRemote(list: PluginList, pluginId: string): RemoteState | null {
	const summaries = list.marketplace.filter(summary => summary.id === pluginId);
	if (summaries.length === 0) {
		return null;
	}
	const active = summaries.find(summary => summary.scope === "project" && summary.entries[0]?.enabled !== false);
	const chosen = active ?? summaries.find(summary => summary.scope === "user") ?? summaries[0];
	const entry = chosen.entries[0];
	return { scope: chosen.scope, version: entry?.version ?? "unknown", enabled: entry?.enabled !== false };
}

/**
 * Where OMP keeps the user-scope plugin slot. The doctor report names the
 * directory; the fallback repeats the OMP default for a first run.
 */
async function resolveUserNodeModules(): Promise<string> {
	try {
		const parsed = JSON.parse(await omp(["plugin", "doctor", "--json"])) as Array<{
			name?: unknown;
			message?: unknown;
		}>;
		for (const check of Array.isArray(parsed) ? parsed : []) {
			if (check?.name !== "plugins_directory" || typeof check.message !== "string") continue;
			const match = /^Found at (.+)$/.exec(check.message);
			if (match) {
				return path.join(match[1], "node_modules");
			}
		}
	} catch (error) {
		const failure = error instanceof Error ? error : new Error(String(error));
		console.log(`${EXTENSION_NAME}: warning: cannot read the plugin directory: ${failure.message}`);
	}
	return path.join(os.homedir(), process.env.PI_CONFIG_DIR ?? ".omp", "plugins", "node_modules");
}

// =============================================================================
// Repository metadata
// =============================================================================

function readLocalPackageName(): string {
	const manifest = readJsonFile<{ name?: unknown }>(EXTENSION_MANIFEST);
	if (typeof manifest.name !== "string") {
		throw new Error(`${EXTENSION_MANIFEST} has no name`);
	}
	return manifest.name;
}

function readMarketplaceId(): string {
	const catalog = readJsonFile<{ name?: unknown; plugins?: Array<{ name?: unknown; source?: unknown }> }>(
		MARKETPLACE_FILE,
	);
	if (typeof catalog.name !== "string") {
		throw new Error(`${MARKETPLACE_FILE} has no name`);
	}
	for (const plugin of Array.isArray(catalog.plugins) ? catalog.plugins : []) {
		if (typeof plugin?.name !== "string" || typeof plugin.source !== "string") continue;
		if (path.resolve(REPO_ROOT, plugin.source) !== EXTENSION_DIR) continue;
		return `${plugin.name}@${catalog.name}`;
	}
	throw new Error(`${MARKETPLACE_FILE} has no plugin for ${EXTENSION_DIR}`);
}

// =============================================================================
// Recovery state
// =============================================================================

async function readState(): Promise<DevState | null> {
	if (!(await Bun.file(STATE_FILE).exists())) {
		return null;
	}
	const record = readJsonFile<RawDevState>(STATE_FILE);
	if (
		typeof record.pluginId !== "string" ||
		typeof record.packageName !== "string" ||
		typeof record.extensionDir !== "string"
	) {
		throw new Error(`${STATE_FILE} is incomplete`);
	}
	const remote = record.remote;
	return {
		pluginId: record.pluginId,
		packageName: record.packageName,
		extensionDir: record.extensionDir,
		remote: remote
			? {
					scope: remote.scope === "project" ? "project" : "user",
					version: typeof remote.version === "string" ? remote.version : "unknown",
					enabled: remote.enabled !== false,
				}
			: null,
		projectDisabledByDev: record.projectDisabledByDev === true,
		startedAt: typeof record.startedAt === "string" ? record.startedAt : "",
	};
}

async function writeState(state: DevState): Promise<void> {
	await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
	await Bun.write(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

async function clearState(): Promise<void> {
	await fs.rm(STATE_FILE, { force: true });
}

// =============================================================================
// Switch and restore
// =============================================================================

let activeState: DevState | null = null;
let restoreRun: Promise<void> | null = null;
let restoreDone = false;

/** Remove the user-scope link, but only when it points at the local extension. */
async function removeLocalLink(state: DevState): Promise<void> {
	try {
		await omp(["plugin", "uninstall", state.packageName]);
	} catch (error) {
		const failure = error instanceof Error ? error : new Error(String(error));
		console.log(`${state.packageName}: warning: ${failure.message}`);
	}
	const linkPath = path.join(await resolveUserNodeModules(), state.packageName);
	const target = readLinkTarget(linkPath);
	if (target === null) {
		console.log(`${state.packageName}: no local link is left to remove`);
		return;
	}
	const absoluteTarget = path.isAbsolute(target) ? target : path.resolve(path.dirname(linkPath), target);
	if ((await resolveForComparison(absoluteTarget)) !== (await resolveForComparison(state.extensionDir))) {
		console.log(`${state.packageName}: warning: kept ${linkPath}; it points at ${target}`);
		return;
	}
	await fs.unlink(linkPath);
	console.log(`${state.packageName}: removed local link ${linkPath}`);
}

async function runRestore(): Promise<void> {
	const state = activeState;
	if (!state) {
		return;
	}
	const name = state.packageName;
	const remote = state.remote;
	console.log(`${name}: restoring remote marketplace version...`);

	// `omp plugin uninstall <package>` matches the package NAME, so it can drop a
	// marketplace install of this plugin as well. Drop the dev link first and put
	// the remote copy back afterwards. A user-scope copy owns the slot that dev
	// mode took over, so it repairs itself and needs no removal.
	const before = await listPlugins();
	const userCopy = before.marketplace.find(summary => summary.id === state.pluginId && summary.scope === "user");
	if (!remote || (remote.scope === "project" && !userCopy)) {
		await removeLocalLink(state);
	}

	if (remote) {
		await omp(["plugin", "install", "--force", state.pluginId, "--scope", remote.scope]);
		console.log(`${name}: reinstalled ${state.pluginId} (${remote.scope}) ${remote.version}`);
		if (state.projectDisabledByDev) {
			await omp(["plugin", "enable", state.pluginId, "--scope", "project"]);
			console.log(`${name}: enabled ${state.pluginId} (project scope)`);
		}
	}

	if (remote?.scope === "project" && userCopy) {
		const version = userCopy.entries[0]?.version ?? "unknown";
		await omp(["plugin", "install", "--force", state.pluginId, "--scope", "user"]);
		console.log(`${name}: reinstalled ${state.pluginId} (user) ${version}`);
	}

	const list = await listPlugins();
	if (remote) {
		const restored = selectRemote(list, state.pluginId);
		if (restored && restored.version !== remote.version) {
			console.log(
				`${name}: warning: the restored version ${restored.version} differs from the recorded ${remote.version}`,
			);
		}
	}

	await clearState();
	activeState = null;
	console.log(
		remote ? `${name}: remote version restored` : `${name}: local link removed; no remote version to restore`,
	);
}

/** Restore once. A second call during a restore reports and joins that restore. */
function requestRestore(): Promise<void> {
	if (restoreDone) {
		return Promise.resolve();
	}
	if (restoreRun) {
		console.log(`${activeState?.packageName ?? EXTENSION_NAME}: cleanup already in progress`);
		return restoreRun;
	}
	const run = runRestore().then(
		() => {
			restoreDone = true;
		},
		error => {
			restoreRun = null;
			throw error;
		},
	);
	restoreRun = run;
	return run;
}

async function activate(): Promise<void> {
	const packageName = readLocalPackageName();
	const pluginId = readMarketplaceId();

	const stale = await readState();
	if (stale) {
		console.log(`${stale.packageName}: found state from a previous run; restoring first`);
		activeState = stale;
		await requestRestore();
		activeState = null;
		restoreRun = null;
		restoreDone = false;
	}

	const list = await listPlugins();
	const remote = selectRemote(list, pluginId);
	const link = list.npm.find(entry => entry.name === packageName) ?? null;

	console.log(
		remote
			? `${packageName}: detected ${pluginId} ${remote.version} (${remote.scope} scope)`
			: `${packageName}: no remote version installed`,
	);
	if (link) {
		console.log(`${packageName}: a local link is already present at ${link.path}`);
	}

	// Record the plan before the first change, so a kill at any point is repairable.
	const state: DevState = {
		pluginId,
		packageName,
		extensionDir: EXTENSION_DIR,
		remote,
		projectDisabledByDev: remote?.scope === "project" && remote.enabled,
		startedAt: new Date().toISOString(),
	};
	await writeState(state);
	activeState = state;

	if (state.projectDisabledByDev) {
		await omp(["plugin", "disable", pluginId, "--scope", "project"]);
		console.log(`${packageName}: disabled ${pluginId} (project scope)`);
	}

	await omp(["plugin", "link", EXTENSION_DIR]);
	const linkPath = path.join(await resolveUserNodeModules(), packageName);
	const target = readLinkTarget(linkPath);
	console.log(`${packageName}: linked ${linkPath} -> ${target ?? "nothing"}`);
	if (target === null || (await resolveForComparison(target)) !== (await resolveForComparison(EXTENSION_DIR))) {
		console.log(`${packageName}: warning: the runtime link does not point at ${EXTENSION_DIR}`);
	}

	console.log(`${packageName}: local development mode active`);
	console.log(`local: ${EXTENSION_DIR}`);
	console.log("Press Ctrl+C to stop and restore the remote marketplace version.");

	const keepAlive = setInterval(() => {}, 1 << 30);
	try {
		await new Promise<void>(resolve => {
			for (const signal of SIGNALS) {
				process.once(signal, resolve);
			}
		});
	} finally {
		clearInterval(keepAlive);
		await requestRestore();
	}
}

try {
	await activate();
} catch (error) {
	const failure = error instanceof Error ? error : new Error(String(error));
	console.error(`${EXTENSION_NAME}: ${failure.message}`);
	process.exitCode = 1;
	try {
		await requestRestore();
	} catch (restoreError) {
		const restoreFailure = restoreError instanceof Error ? restoreError : new Error(String(restoreError));
		console.error(`${EXTENSION_NAME}: restore failed: ${restoreFailure.message}`);
	}
	process.exit(process.exitCode);
}
