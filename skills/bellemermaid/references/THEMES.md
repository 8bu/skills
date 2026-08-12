# Themes

The beautiful-mermaid library supplies 15 themes. This file is generated.
To make it again, run:

```bash
node scripts/themes.mjs --markdown > references/THEMES.md
```

| Name | Mode | Background | Foreground | Accent |
| --- | --- | --- | --- | --- |
| `catppuccin-latte` | light | `#eff1f5` | `#4c4f69` | `#8839ef` |
| `catppuccin-mocha` | dark | `#1e1e2e` | `#cdd6f4` | `#cba6f7` |
| `dracula` | dark | `#282a36` | `#f8f8f2` | `#bd93f9` |
| `github-dark` | dark | `#0d1117` | `#e6edf3` | `#4493f8` |
| `github-light` | light | `#ffffff` | `#1f2328` | `#0969da` |
| `nord` | dark | `#2e3440` | `#d8dee9` | `#88c0d0` |
| `nord-light` | light | `#eceff4` | `#2e3440` | `#5e81ac` |
| `one-dark` | dark | `#282c34` | `#abb2bf` | `#c678dd` |
| `solarized-dark` | dark | `#002b36` | `#839496` | `#268bd2` |
| `solarized-light` | light | `#fdf6e3` | `#657b83` | `#268bd2` |
| `tokyo-night` | dark | `#1a1b26` | `#a9b1d6` | `#7aa2f7` |
| `tokyo-night-light` | light | `#d5d6db` | `#343b58` | `#34548a` |
| `tokyo-night-storm` | dark | `#24283b` | `#a9b1d6` | `#7aa2f7` |
| `zinc-dark` | dark | `#18181B` | `#FAFAFA` | `—` |
| `zinc-light` | light | `#FFFFFF` | `#27272A` | `—` |

## How to choose one

- **Dark documentation** — `tokyo-night`. It is the safe first choice.
- **Light documentation** — `github-light`. It prints well.
- **A README that both modes show** — add `--transparent`, and choose colors that work on
  each background. `zinc-light` and `zinc-dark` hold the most contrast.
- **High contrast for a projector** — `zinc-light`.

A theme sets `bg`, `fg`, and the other colors together. A `--bg` or `--fg` option that you
give after `--theme` replaces that one color only.
