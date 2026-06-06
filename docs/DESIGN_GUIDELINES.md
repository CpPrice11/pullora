# Air Launcher Design Guidelines

Air Launcher now follows the MY SAM visual direction: a dense dark workstation shell for finding, installing, updating, and launching GitHub release apps.

## Rules

- Keep the main Library split between a compact repository list and a focused details/action pane.
- Prefer flat dark panels, thin separators, compact rows, and blue active selection over glass, cinematic blur, or large card layouts.
- Use project art as optional supporting content. The UI must stay readable and functional without art.
- Keep destructive actions behind explicit confirmation.
- Preserve Ukrainian and English layouts; avoid hardcoded UI text outside `i18n.tsx`.
- Respect reduced motion, keyboard focus states, and the 1000x700 minimum window.
- Do not add extra platform release UX or packaging paths unless the release policy changes explicitly.

## Release UI

- Release surfaces should remain list/table-like and compact.
- Portable EXE remains the primary launcher artifact; setup EXE remains the installer artifact.
- Do not expose MSI, ZIP, Linux, or Arch packaging paths in release UI unless policy changes.

## Theme Editor

- Presets are safe defaults, but the MY SAM shell should remain the baseline visual language.
- Custom colors, font, radius, density, and CSS are user-controlled advanced settings.
- Theme import/export must not change GitHub owner, install folders, AI Workspace settings, or installed apps.
