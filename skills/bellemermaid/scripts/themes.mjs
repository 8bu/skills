#!/usr/bin/env node
// Lists the themes that beautiful-mermaid supplies.
// Use --markdown to make references/THEMES.md again after a library update.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
// The Cowork build supplies the vendor file. A normal install supplies node_modules.
const vendored = join(skillRoot, 'vendor', 'beautiful-mermaid.mjs');
const local = join(skillRoot, 'node_modules', 'beautiful-mermaid', 'dist', 'index.js');
const source = [vendored, local].find((p) => existsSync(p));

if (!source) {
  process.stderr.write(`[bellemermaid] beautiful-mermaid is absent. Run: npm ci --prefix ${skillRoot}\n`);
  process.exit(4);
}

const { THEMES } = await import(source);
const names = Object.keys(THEMES).sort();
const isDark = (hex) => {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
};

const mode = process.argv[2];

if (mode === '--json') {
  process.stdout.write(
    `${JSON.stringify({
      schema_version: 1,
      count: names.length,
      themes: names.map((name) => ({ name, ...THEMES[name] })),
    })}\n`,
  );
} else if (mode === '--markdown') {
  const rows = names.map((name) => {
    const t = THEMES[name];
    return `| \`${name}\` | ${isDark(t.bg) ? 'dark' : 'light'} | \`${t.bg}\` | \`${t.fg}\` | \`${t.accent ?? '—'}\` |`;
  });
  process.stdout.write(
    [
      '# Themes',
      '',
      `The beautiful-mermaid library supplies ${names.length} themes. This file is generated.`,
      'To make it again, run:',
      '',
      '```bash',
      'node scripts/themes.mjs --markdown > references/THEMES.md',
      '```',
      '',
      '| Name | Mode | Background | Foreground | Accent |',
      '| --- | --- | --- | --- | --- |',
      ...rows,
      '',
      '## How to choose one',
      '',
      '- **Dark documentation** — `tokyo-night`. It is the safe first choice.',
      '- **Light documentation** — `github-light`. It prints well.',
      '- **A README that both modes show** — add `--transparent`, and choose colors that work on',
      '  each background. `zinc-light` and `zinc-dark` hold the most contrast.',
      '- **High contrast for a projector** — `zinc-light`.',
      '',
      'A theme sets `bg`, `fg`, and the other colors together. A `--bg` or `--fg` option that you',
      'give after `--theme` replaces that one color only.',
    ].join('\n') + '\n',
  );
} else {
  for (const name of names) {
    const t = THEMES[name];
    process.stdout.write(`${name.padEnd(20)} ${isDark(t.bg) ? 'dark ' : 'light'}  bg ${t.bg}  fg ${t.fg}\n`);
  }
  process.stdout.write(`\n${names.length} themes. Use --json or --markdown for other output.\n`);
}
