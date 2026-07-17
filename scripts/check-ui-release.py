from __future__ import annotations

import runpy


CHECKS = (
    "scripts/check-library-card-states.py",
    "scripts/check-library-density.py",
    "scripts/check-library-hero-layers.py",
    "scripts/check-bulk-menu.py",
    "scripts/check-destructive-dialog.py",
    "scripts/check-light-palette.py",
    "scripts/check-release-selector-layout.py",
    "scripts/check-select-controls.py",
    "scripts/capture-visual-baseline.py",
)


for check in CHECKS:
    print(f"[ui-release] running {check}")
    runpy.run_path(check, run_name="__main__")

print(f"[ui-release] {len(CHECKS)} headless checks: ok")
