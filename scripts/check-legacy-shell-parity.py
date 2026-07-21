from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
RUNTIME_EXTENSIONS = {".html", ".js", ".jsx", ".ts", ".tsx"}
LEGACY_LAYOUT_CLASSES = (
    "sam-backdrop",
    "sam-background",
    "sam-header-brand",
    "sam-header-chip",
    "sam-header-meta",
    "sam-header-meta-item",
    "sam-header-nav",
    "sam-header-sidebar",
    "sam-header-sync",
    "sam-shell",
    "sam-sidebar-chips",
    "sam-sidebar-control",
    "sam-sidebar-header",
    "sam-sidebar-kicker",
    "sam-sidebar-label",
    "sam-sidebar-status",
    "sam-sidebar-sync",
    "sam-sidebar-value",
    "sam-titlebar",
    "sam-window-mark",
)
CHECKS = (
    "scripts/check-destructive-dialog.py",
    "scripts/check-install-surface-controls.py",
    "scripts/check-about-release-interactions.py",
    "scripts/check-library-surface-controls.py",
    "scripts/check-settings-composition.py",
    "scripts/check-about-surface-controls.py",
)


def runtime_sources() -> dict[str, str]:
    return {
        path.relative_to(ROOT).as_posix(): path.read_text(encoding="utf-8")
        for path in (ROOT / "src").rglob("*")
        if path.suffix in RUNTIME_EXTENSIONS
    }


def check_runtime_shell() -> None:
    matches: dict[str, list[str]] = {}
    sources = runtime_sources()
    for class_name in LEGACY_LAYOUT_CLASSES:
        pattern = re.compile(rf"(?<![a-zA-Z0-9_-]){re.escape(class_name)}(?![a-zA-Z0-9_-])")
        paths = [path for path, source in sources.items() if pattern.search(source)]
        if paths:
            matches[class_name] = paths
    assert not matches, {"unexpectedLegacyShellRuntimeReferences": matches}
    modal_styles = (ROOT / "src/components/Modal/Modal.css").read_text(encoding="utf-8")
    assert ".sam-shell" not in modal_styles
    layout_styles = (ROOT / "src/components/Layout/Layout.css").read_text(encoding="utf-8")
    stale_layout_selectors = [class_name for class_name in LEGACY_LAYOUT_CLASSES if f".{class_name}" in layout_styles]
    assert not stale_layout_selectors, {"unexpectedLegacyLayoutSelectors": stale_layout_selectors}
    app_styles = (ROOT / "src/App.css").read_text(encoding="utf-8")
    assert ".sam-shell" not in app_styles
    print("[legacy-shell-parity] legacy shell classes are absent from runtime: ok")


def main() -> None:
    check_runtime_shell()
    if "--headless" not in sys.argv:
        return
    for check in CHECKS:
        print(f"[legacy-shell-parity] running {check}")
        subprocess.run([sys.executable, "-u", check], cwd=ROOT, check=True)
    print(f"[legacy-shell-parity] {len(CHECKS)} shell and modal scenarios: ok")


if __name__ == "__main__":
    main()
