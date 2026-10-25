from __future__ import annotations

import subprocess
import sys

# The card/table catalog supersedes the former two-pane layout and density contracts.
# Current catalog tests retain theme, viewport, keyboard, action and screenshot coverage.
CHECKS = (
    "scripts/ui/check-library-catalog.py",
    "scripts/ui/check-library-table.py",
    "scripts/ui/check-card-operations.py",
    "scripts/ui/check-quick-install.py",
    "scripts/ui/check-library-safety.py",
    "scripts/ui/check-installation-sync.py",
    "scripts/ui/check-public-release-fallback.py",
    "scripts/ui/check-default-media.py",
    "scripts/ui/check-web-project.py",
    "scripts/ui/check-library-performance.py",
    "scripts/ui/check-lazy-page-loading.py",
    "scripts/ui/check-bulk-menu.py",
    "scripts/ui/check-repo-action-menu.py",
    "scripts/ui/check-destructive-dialog.py",
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
)

for check in CHECKS:
    print(f"[ui-release] running {check}", flush=True)
    subprocess.run([sys.executable, "-u", check], check=True)

print(f"[ui-release] {len(CHECKS)} headless checks: ok")
