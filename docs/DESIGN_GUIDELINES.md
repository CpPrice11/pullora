# Air Launcher Design Guidelines

Air Launcher uses a compact Steam-style layout with Air identity polish. The default UI should stay focused on finding, installing, updating, and launching apps.

## Rules

- Keep the main Library simple: one primary action per card and secondary actions in menus/drawers.
- Use project art as atmosphere, not as required content. The UI must stay readable without art.
- Prefer compact surfaces, clear status chips, and actionable empty/error states.
- Keep destructive actions behind explicit confirmation.
- Preserve Ukrainian and English layouts; avoid text that only fits one language.
- Respect reduced motion and keyboard focus states.
- Do not add extra platform release UX or packaging paths unless the release policy changes explicitly.

## Theme Editor

- Presets are safe defaults.
- Custom colors, font, radius, density, and CSS are user-controlled advanced settings.
- Theme import/export must not change GitHub owner, install folders, AI Workspace settings, or installed apps.
