from __future__ import annotations

import json
import runpy
import sys
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
INTERACTIONS = runpy.run_path(str(ROOT / "scripts" / "check-about-release-interactions.py"))
CONTROLS = INTERACTIONS["CONTROLS"]
BASELINE = INTERACTIONS["BASELINE"]
VIEWPORTS = ((1000, 700), (1280, 720), (1920, 1080))


def check_source_contract() -> None:
    about = (ROOT / "src" / "pages" / "AboutPage.tsx").read_text(encoding="utf-8")
    styles = (ROOT / "src" / "pages" / "PageStyles.css").read_text(encoding="utf-8")

    assert about.count('className="modal-overlay about-dialog-overlay"') == 2
    for fragment in (
        ":root[data-theme] .cinematic-shell .about-page",
        "background: transparent;",
        ":root[data-theme] .cinematic-shell .about-dialog-overlay",
        "background: var(--launcher-background-scrim);",
        ".about-dialog-overlay .about-notes-modal",
        ".about-dialog-overlay .confirm-modal",
        "var(--surface-material-strong)",
        "blur(var(--surface-blur))",
    ):
        assert fragment in styles, fragment
    print("[about-background-continuity] source contract: ok")


def alpha(color: str) -> float:
    if color.startswith("rgba("):
        return float(color.removeprefix("rgba(").removesuffix(")").split(",")[-1])
    if "/" in color:
        value = color.rsplit("/", 1)[-1].rstrip(" )").strip()
        return float(value.removesuffix("%")) / (100 if value.endswith("%") else 1)
    return 1.0


def background_state(page: Page, dialog_selector: str | None = None) -> dict:
    return page.evaluate(
        """
        (dialogSelector) => {
          const background = document.querySelector('.cinematic-background');
          const pageElement = document.querySelector('.about-page');
          const overlay = document.querySelector('.about-dialog-overlay');
          const dialog = dialogSelector ? document.querySelector(dialogSelector) : null;
          const root = getComputedStyle(document.documentElement);
          const read = element => element ? {
            backgroundColor: getComputedStyle(element).backgroundColor,
            backgroundImage: getComputedStyle(element).backgroundImage,
            backdropFilter: getComputedStyle(element).backdropFilter,
          } : null;
          return {
            artwork: read(background),
            artworkVisible: background?.classList.contains('is-visible') ?? false,
            artworkOpacity: background ? Number(getComputedStyle(background).opacity) : 0,
            page: read(pageElement),
            overlay: read(overlay),
            overlayParentIsLayout: overlay?.parentElement?.classList.contains('layout') ?? false,
            dialog: read(dialog),
            surfaceBlur: root.getPropertyValue('--surface-blur').trim(),
          };
        }
        """,
        dialog_selector,
    )


def open_about(page: Page) -> None:
    CONTROLS["seed_release_matrix"](page, BASELINE)
    BASELINE.open_library(page)
    page.locator(".nav-item").nth(2).click()
    page.locator(".about-page").wait_for()
    page.locator(".about-release-link--older").wait_for()
    BASELINE.apply_custom_background(page)


def assert_continuity(state: dict, expected_artwork: str, *, dialog: bool) -> None:
    assert state["artworkVisible"] and state["artworkOpacity"] > 0
    assert state["artwork"]["backgroundImage"] == expected_artwork
    assert alpha(state["page"]["backgroundColor"]) == 0
    if not dialog:
        assert state["overlay"] is None
        return

    assert state["overlayParentIsLayout"]
    assert alpha(state["overlay"]["backgroundColor"]) < 1
    assert state["surfaceBlur"] in state["overlay"]["backdropFilter"]
    assert alpha(state["dialog"]["backgroundColor"]) < 1
    assert state["surfaceBlur"] in state["dialog"]["backdropFilter"]


def inspect(page: Page) -> dict:
    initial = background_state(page)
    artwork = initial["artwork"]["backgroundImage"]
    assert_continuity(initial, artwork, dialog=False)

    older = page.locator(".about-release-link--older")
    trigger = older.locator(".project-actions-trigger")
    trigger.click()
    page.locator(".about-release-menu-portal").get_by_role("menuitem").first.click()
    notes = page.locator(".about-notes-modal")
    notes.wait_for()
    notes_state = background_state(page, ".about-notes-modal")
    assert_continuity(notes_state, artwork, dialog=True)
    page.keyboard.press("Escape")
    notes.wait_for(state="hidden")

    activate = older.locator(".about-release-actions > .secondary-btn")
    activate.click()
    confirm = page.locator(".confirm-modal")
    confirm.wait_for()
    confirm_state = background_state(page, ".confirm-modal")
    assert_continuity(confirm_state, artwork, dialog=True)
    page.keyboard.press("Escape")
    confirm.wait_for(state="hidden")

    return {
        "artworkOpacity": initial["artworkOpacity"],
        "surfaceBlur": initial["surfaceBlur"],
        "notesOverlay": notes_state["overlay"],
        "confirmOverlay": confirm_state["overlay"],
    }


def main() -> None:
    check_source_contract()
    if "--static" in sys.argv:
        return

    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for theme in ("dark", "light"):
            for width, height in VIEWPORTS:
                context = browser.new_context(
                    viewport={"width": width, "height": height},
                    color_scheme=theme,
                    locale="uk-UA",
                )
                page = context.new_page()
                open_about(page)
                results.append({"theme": theme, "viewport": [width, height], **inspect(page)})
                context.close()
        browser.close()

    print(json.dumps({"checks": len(results), "viewports": VIEWPORTS}, ensure_ascii=False))


if __name__ == "__main__":
    main()
