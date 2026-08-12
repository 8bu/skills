#!/usr/bin/env node
// Renders Mermaid text to SVG or ASCII with the beautiful-mermaid library.
// The output contract is stable. See SKILL.md for the JSON schema and the exit codes.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 1;
const skillRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const EXIT = {
  UNCLASSIFIED: 1,
  USAGE: 2,
  PARSE: 3,
  IO: 4,
};

class CliError extends Error {
  constructor(type, code, message, extra = {}) {
    super(message);
    this.type = type;
    this.code = code;
    this.extra = extra;
  }
}

const usageError = (m, extra) => new CliError('UsageError', EXIT.USAGE, m, extra);
const parseError = (m, extra) => new CliError('ParseError', EXIT.PARSE, m, extra);
const ioError = (m, extra) => new CliError('IoError', EXIT.IO, m, extra);

// --- dependency loading -----------------------------------------------------

// Installs the dependency one time, then keeps the module in the skill folder.
function installDependencies() {
  const lockfile = join(skillRoot, 'package-lock.json');
  const command = existsSync(lockfile) ? 'ci' : 'install';
  process.stderr.write(`[bellemermaid] beautiful-mermaid is absent. Running npm ${command}...\n`);
  try {
    execFileSync('npm', [command, '--silent', '--no-fund', '--no-audit'], {
      cwd: skillRoot,
      stdio: ['ignore', 'ignore', 'inherit'],
      timeout: 180000,
    });
  } catch (e) {
    throw new CliError(
      'IoError',
      EXIT.IO,
      `npm ${command} failed in ${skillRoot}: ${e.message}. Run it by hand, then try again.`,
    );
  }
}

async function loadLibrary() {
  const local = join(skillRoot, 'node_modules', 'beautiful-mermaid', 'dist', 'index.js');
  if (existsSync(local)) return import(local);
  installDependencies();
  if (!existsSync(local)) {
    throw ioError(`beautiful-mermaid is still absent after the install. Looked in ${local}.`);
  }
  return import(local);
}

// --- arguments --------------------------------------------------------------

const HELP = `Usage: render.mjs [options]

Input (give one):
  -c, --code <text>        Mermaid source as a string
  -i, --input <file>       Mermaid source file
      --input-dir <dir>    Render each .mmd and .mermaid file in the directory

Output:
  -o, --output <file>      Output file. SVG needs this, or --stdout.
      --output-dir <dir>   Output directory. Use it with --input-dir.
      --stdout             Write SVG to stdout instead of a file
  -f, --format <fmt>       svg or ascii (default: svg)
      --json               Emit one line of JSON on stdout

Style (SVG):
  -t, --theme <name>       Theme name. Run themes.mjs to list them.
      --bg --fg --line --accent --muted --surface --border <hex>
      --font-preset <name> serif (default, Lora), sans (Inter), mono
                           (JetBrains Mono), or sketch (Patrick Hand)
      --sketch             Short form of --font-preset sketch
      --font <family>      One font family name. It replaces the preset.
                           The library adds a Google Fonts import for it.
      --transparent        No background fill
      --padding <n>        Canvas padding in px (default: 40)
      --node-spacing <n>   Space between sibling nodes (default: 24)
      --layer-spacing <n>  Space between layers (default: 40)

Style (ASCII):
      --plain              Pure ASCII instead of Unicode box characters
      --padding-x <n>      Horizontal space (default: 5)
      --padding-y <n>      Vertical space (default: 5)

Other:
      --workers <n>        Files to render at the same time (default: 4)
      --allow-empty        Do not fail when the diagram renders to 0 x 0
  -h, --help               Show this help

Exit codes: 0 success, 1 unclassified, 2 usage, 3 parse or empty render, 4 I/O.`;

const COLOR_KEYS = ['bg', 'fg', 'line', 'accent', 'muted', 'surface', 'border'];

// The library takes one font family name. It puts that name in the SVG and adds a Google
// Fonts import for it. A preset is a short name for one family. It is not a font stack.
// The library cannot draw rough edges, so "sketch" changes the lettering only.
const FONT_PRESETS = {
  serif: 'Lora',
  sans: 'Inter',
  mono: 'JetBrains Mono',
  sketch: 'Patrick Hand',
};
const DEFAULT_FONT_PRESET = 'serif';

function parseArgs(argv) {
  const o = {
    format: 'svg',
    json: false,
    stdout: false,
    transparent: false,
    plain: false,
    allowEmpty: false,
    workers: 4,
    colors: {},
    numbers: {},
  };

  const int = (name, val) => {
    const n = Number.parseInt(val, 10);
    if (!Number.isFinite(n)) throw usageError(`${name} needs a whole number. Got "${val}".`);
    return n;
  };

  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    const needsValue = () => {
      if (val === undefined || val.startsWith('--')) throw usageError(`${key} needs a value.`);
      i++;
      return val;
    };

    switch (key) {
      case '-c': case '--code': o.code = needsValue(); break;
      case '-i': case '--input': o.input = needsValue(); break;
      case '--input-dir': o.inputDir = needsValue(); break;
      case '-o': case '--output': o.output = needsValue(); break;
      case '--output-dir': o.outputDir = needsValue(); break;
      case '--stdout': o.stdout = true; break;
      case '-f': case '--format': o.format = needsValue(); break;
      case '--json': o.json = true; break;
      case '-t': case '--theme': o.theme = needsValue(); break;
      case '--font': o.font = needsValue(); break;
      case '--font-preset': o.fontPreset = needsValue(); break;
      case '--sketch': o.fontPreset = 'sketch'; break;
      case '--transparent': o.transparent = true; break;
      case '--plain': o.plain = true; break;
      case '--allow-empty': o.allowEmpty = true; break;
      case '--workers': o.workers = int(key, needsValue()); break;
      case '--padding': o.numbers.padding = int(key, needsValue()); break;
      case '--node-spacing': o.numbers.nodeSpacing = int(key, needsValue()); break;
      case '--layer-spacing': o.numbers.layerSpacing = int(key, needsValue()); break;
      case '--padding-x': o.numbers.paddingX = int(key, needsValue()); break;
      case '--padding-y': o.numbers.paddingY = int(key, needsValue()); break;
      case '-h': case '--help': process.stdout.write(`${HELP}\n`); process.exit(0); break;
      default: {
        const color = COLOR_KEYS.find((c) => key === `--${c}`);
        if (color) { o.colors[color] = needsValue(); break; }
        throw usageError(`Unknown option "${key}". Use --help for the option list.`);
      }
    }
  }

  const sources = ['code', 'input', 'inputDir'].filter((k) => o[k] !== undefined);
  if (sources.length === 0) throw usageError('Give one of --code, --input, or --input-dir.');
  if (sources.length > 1) throw usageError(`Give only one input. Got ${sources.length}.`);

  if (o.format !== 'svg' && o.format !== 'ascii') {
    throw usageError(`--format must be svg or ascii. Got "${o.format}".`);
  }
  if (o.inputDir && !o.outputDir) throw usageError('--input-dir needs --output-dir.');
  if (!o.inputDir && o.format === 'svg' && !o.output && !o.stdout) {
    throw usageError('SVG output needs --output <file>, or --stdout to write it to the terminal.');
  }
  if (o.workers < 1) throw usageError('--workers must be 1 or more.');

  if (o.fontPreset && !FONT_PRESETS[o.fontPreset]) {
    throw usageError(
      `Unknown font preset "${o.fontPreset}". Available: ${Object.keys(FONT_PRESETS).join(', ')}.`,
    );
  }
  // A raw --font value wins over a preset. Both name one font family.
  o.font = o.font ?? FONT_PRESETS[o.fontPreset ?? DEFAULT_FONT_PRESET];

  return o;
}

// --- rendering --------------------------------------------------------------

const readSource = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch (e) {
    throw ioError(`Cannot read ${file}: ${e.code ?? e.message}`);
  }
};

const writeOutput = (file, text) => {
  try {
    mkdirSync(dirname(resolve(file)), { recursive: true });
    writeFileSync(file, text);
  } catch (e) {
    throw ioError(`Cannot write ${file}: ${e.code ?? e.message}`);
  }
};

const readDimensions = (svg) => {
  const m = /width="([\d.]+)"\s+height="([\d.]+)"/.exec(svg);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: null, height: null };
};

async function renderOne(lib, source, opts, label) {
  const { renderMermaid, renderMermaidAscii, THEMES } = lib;

  if (opts.format === 'ascii') {
    let text;
    try {
      text = renderMermaidAscii(source, {
        useAscii: opts.plain,
        ...(opts.numbers.paddingX !== undefined && { paddingX: opts.numbers.paddingX }),
        ...(opts.numbers.paddingY !== undefined && { paddingY: opts.numbers.paddingY }),
      });
    } catch (e) {
      throw parseError(e.message, { source: label });
    }
    return { format: 'ascii', text, lines: text.split('\n').length };
  }

  let theme;
  if (opts.theme) {
    theme = THEMES[opts.theme];
    if (!theme) {
      throw usageError(
        `Unknown theme "${opts.theme}". Available: ${Object.keys(THEMES).join(', ')}.`,
      );
    }
  }

  let svg;
  try {
    svg = await renderMermaid(source, {
      ...(theme ?? {}),
      ...opts.colors,
      ...(opts.font && { font: opts.font }),
      ...(opts.numbers.padding !== undefined && { padding: opts.numbers.padding }),
      ...(opts.numbers.nodeSpacing !== undefined && { nodeSpacing: opts.numbers.nodeSpacing }),
      ...(opts.numbers.layerSpacing !== undefined && { layerSpacing: opts.numbers.layerSpacing }),
      transparent: opts.transparent,
    });
  } catch (e) {
    throw parseError(e.message, { source: label });
  }

  const dimensions = readDimensions(svg);
  // The parser accepts a bad diagram body and returns a 0 x 0 canvas. Report it.
  if (!opts.allowEmpty && dimensions.width === 0) {
    throw parseError(
      'The diagram rendered to 0 x 0. The header is valid but the body produced no nodes. ' +
        'Check the body with: npx -y @probelabs/maid <file>',
      { source: label },
    );
  }

  return { format: 'svg', svg, bytes: Buffer.byteLength(svg), dimensions };
}

// --- batch ------------------------------------------------------------------

const DIAGRAM_EXTENSIONS = new Set(['.mmd', '.mermaid']);

function listDiagrams(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    throw ioError(`Cannot read the directory ${dir}: ${e.code ?? e.message}`);
  }
  return entries
    .filter((e) => e.isFile() && DIAGRAM_EXTENSIONS.has(extname(e.name)))
    .map((e) => join(dir, e.name))
    .sort();
}

// Runs the tasks with no more than `limit` of them active at the same time.
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function runBatch(lib, opts) {
  const files = listDiagrams(opts.inputDir);
  if (files.length === 0) {
    throw ioError(`No .mmd or .mermaid file is in ${opts.inputDir}.`);
  }
  const extension = opts.format === 'svg' ? '.svg' : '.txt';

  const results = await pool(files, opts.workers, async (file) => {
    const target = join(opts.outputDir, `${basename(file, extname(file))}${extension}`);
    try {
      const out = await renderOne(lib, readSource(file), opts, file);
      writeOutput(target, out.format === 'svg' ? out.svg : out.text);
      return {
        input: file,
        output: resolve(target),
        success: true,
        ...(out.dimensions && { dimensions: out.dimensions }),
        ...(out.bytes && { bytes: out.bytes }),
      };
    } catch (e) {
      return { input: file, success: false, error: { type: e.type ?? 'Error', message: e.message } };
    }
  });

  const failed = results.filter((r) => !r.success);
  const payload = {
    schema_version: SCHEMA_VERSION,
    success: failed.length === 0,
    format: opts.format,
    ...(opts.theme && { theme: opts.theme }),
    total: results.length,
    rendered: results.length - failed.length,
    failed: failed.length,
    results,
  };

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  } else {
    for (const r of results) {
      process.stdout.write(
        r.success ? `ok   ${r.input} -> ${r.output}\n` : `FAIL ${r.input}: ${r.error.message}\n`,
      );
    }
    process.stdout.write(`${payload.rendered}/${payload.total} diagrams rendered.\n`);
  }
  return failed.length === 0 ? 0 : EXIT.PARSE;
}

// --- single -----------------------------------------------------------------

async function runSingle(lib, opts) {
  const label = opts.input ?? '<inline>';
  const source = opts.code ?? readSource(opts.input);
  const out = await renderOne(lib, source, opts, label);

  if (out.format === 'ascii') {
    if (opts.output) writeOutput(opts.output, out.text);
    const payload = {
      schema_version: SCHEMA_VERSION,
      success: true,
      format: 'ascii',
      text: out.text,
      lines: out.lines,
      ...(opts.output && { output: resolve(opts.output) }),
    };
    process.stdout.write(opts.json ? `${JSON.stringify(payload)}\n` : `${out.text}\n`);
    return 0;
  }

  if (opts.stdout && !opts.output) {
    process.stdout.write(out.svg);
    return 0;
  }

  writeOutput(opts.output, out.svg);
  const payload = {
    schema_version: SCHEMA_VERSION,
    success: true,
    format: 'svg',
    bytes: out.bytes,
    dimensions: out.dimensions,
    ...(opts.theme && { theme: opts.theme }),
    output: resolve(opts.output),
  };
  process.stdout.write(
    opts.json
      ? `${JSON.stringify(payload)}\n`
      : `SVG saved to ${payload.output} (${out.dimensions.width} x ${out.dimensions.height}).\n`,
  );
  return 0;
}

// --- entry ------------------------------------------------------------------

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    fail(e, false);
  }
  try {
    const lib = await loadLibrary();
    process.exit(opts.inputDir ? await runBatch(lib, opts) : await runSingle(lib, opts));
  } catch (e) {
    fail(e, opts.json);
  }
}

function fail(e, asJson) {
  const type = e.type ?? 'Error';
  const code = e.code ?? EXIT.UNCLASSIFIED;
  const body = asJson
    ? JSON.stringify({
        schema_version: SCHEMA_VERSION,
        success: false,
        error: { code, type, message: e.message, ...e.extra },
      })
    : `${type}: ${e.message}`;
  process.stderr.write(`${body}\n`);
  process.exit(code);
}

main();
