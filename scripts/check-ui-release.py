from __future__ import annotations

import subprocess
import sys


CHECKS = (
    "scripts/check-library-card-states.py",
    "scripts/check-library-density.py",
    "scripts/check-library-hero-layers.py",
    "scripts/check-library-hero-art-parity.py",
    "scripts/check-library-surface-controls.py",
    "scripts/check-library-performance.py",
    "scripts/check-lazy-page-loading.py",
    "scripts/check-bulk-menu.py",
    "scripts/check-repo-action-menu.py",
    "scripts/check-destructive-dialog.py",
    "scripts/check-legacy-shell-parity.py",
    "scripts/check-state-panel-parity.py",
    "scripts/check-download-panel-parity.py",
    "scripts/check-light-palette.py",
    "scripts/check-release-selector-layout.py",
    "scripts/check-install-surface-controls.py",
    "scripts/check-settings-composition.py",
    "scripts/check-select-controls.py",
    "scripts/check-about-composition.py",
    "scripts/check-about-release-controls.py",
    "scripts/check-about-release-interactions.py",
    "scripts/check-about-surface-controls.py",
    "scripts/check-about-background-continuity.py",
    "scripts/check-launcher-update-safety.py",
    "scripts/capture-visual-baseline.py",
)


for check in CHECKS:
    print(f"[ui-release] running {check}")
    subprocess.run([sys.executable, "-u", check], check=True)

print(f"[ui-release] {len(CHECKS)} headless checks: ok")
