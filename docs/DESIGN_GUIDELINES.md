# Pullora Design Guidelines

Pullora follows the final GitHub + Pullora visual system: GitHub provides the dark Library/Settings structure and directness; GitHub provides workstation density, flat panels, thin borders, status rails, and table-like surfaces.

## Rules

- Keep the main Library split between a compact repository list and a focused details/action pane.
- Prefer flat dark panels, thin separators, compact rows, and blue active selection over glass, cinematic blur, or large card layouts.
- Treat the shell as a workstation: titlebar status chips, sidebar telemetry, compact tables, and clear status rails are preferred over decorative hero surfaces.
- Use GitHub-inspired tokens as the baseline: shell `#171a21`, library/surface `#1b2838` and `#16202d`, table borders `#2a475e`, active blue `#66c0f4`.
- Use project art as optional supporting content. The UI must stay readable and functional without art.
- Keep destructive actions behind explicit confirmation.
- Preserve Ukrainian and English layouts; avoid hardcoded UI text outside `i18n.tsx`.
- Respect reduced motion, keyboard focus states, and the 1000x700 minimum window.
- Do not add extra platform release UX or packaging paths unless the release policy changes explicitly.

## GitHub Workstation Layer

- Use left-edge status rails to communicate state: blue for active/current, green for ready/completed, yellow for pending/update, red for failure/destructive.
- Prefer table-like rows for repositories, launcher versions, updates, downloads, and AI activity.
- Keep controls rectangular with 2px radius unless an existing platform control requires otherwise.
- Avoid introducing new large gradients, glassmorphism, cinematic backdrop behavior, or oversized cards.
- AI Workspace should read like an operations console: dense panes, terminal-like chat area, and compact inspector/activity rows.
- Settings, Library, About, Release, App Details, confirmations, and AI Workspace should share the same rectangular controls and 2px-or-less geometry unless a native control requires otherwise.

## Release UI

- Release surfaces should remain list/table-like and compact.
- Portable EXE remains the primary launcher artifact; setup EXE remains the installer artifact.
- Do not expose MSI, ZIP, Linux, or Arch packaging paths in release UI unless policy changes.
- Release wizard, asset selection, update center, and confirmation dialogs should use facts grids, status rails, and sticky action rows instead of decorative modal cards.

## Theme Editor

- Presets are safe defaults, but the GitHub shell should remain the baseline visual language.
- Custom colors, font, radius, density, and CSS are user-controlled advanced settings.
- Theme import/export must not change GitHub owner, install folders, AI Workspace settings, or installed apps.

## Roadmap Closure

- `v5.0.0` closes the GitHub + Pullora roadmap as one cohesive workstation release.
- Legacy cinematic selectors may remain only as inactive compatibility CSS; active UI styling should be expressed through `.sam-shell` and shared component selectors.
- Future design work should be incremental polish, not a return to glass, glow, or platform expansion.
