from __future__ import annotations

import subprocess
import sys


CHECKS = (
    "scripts/ui/check-library-card-states.py",
    "scripts/ui/check-library-density.py",
    "scripts/ui/check-library-hero-layers.py",
    "scripts/ui/check-library-hero-art-parity.py",
    "scripts/ui/check-library-surface-controls.py",
    "scripts/ui/check-library-performance.py",
    "scripts/ui/check-lazy-page-loading.py",
    "scripts/ui/check-bulk-menu.py",
    "scripts/ui/check-repo-action-menu.py",
    "scripts/ui/check-destructive-dialog.py",
    "scripts/ui/check-legacy-shell-parity.py",
    "scripts/ui/check-state-panel-parity.py",
    "scripts/ui/check-download-panel-parity.py",
    "scripts/ui/check-rendered-contrast.py",
    "scripts/ui/check-release-selector-layout.py",
    "scripts/ui/check-install-surface-controls.py",
    "scripts/ui/check-settings-composition.py",
    "scripts/ui/check-select-controls.py",
    "scripts/ui/check-about-composition.py",
    "scripts/ui/check-about-release-controls.py",
    "scripts/ui/check-about-release-interactions.py",
    "scripts/ui/check-about-surface-controls.py",
    "scripts/ui/check-about-background-continuity.py",
    "scripts/ui/check-launcher-update-safety.py",
    "scripts/ui/capture-visual-baseline.py",
)


for check in CHECKS:
    print(f"[ui-release] running {check}")
    subprocess.run([sys.executable, "-u", check], check=True)

print(f"[ui-release] {len(CHECKS)} headless checks: ok")
