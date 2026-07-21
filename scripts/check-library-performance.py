from __future__ import annotations

import json
import runpy
import statistics
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent.parent
CARD_COUNT = 1000
LAYOUT_BUDGET_MS = 50
BASELINE = runpy.run_path(str(ROOT / "scripts" / "capture-visual-baseline.py"))


def check_source_contract() -> None:
    styles = (ROOT / "src" / "pages" / "PageStyles.css").read_text(encoding="utf-8")
    assert ".library-folder-section-items .repo-card" in styles
    assert "content-visibility: auto" in styles
    assert "contain-intrinsic-size: auto var(--library-card-max-height)" in styles


def main() -> None:
    check_source_contract()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 720}, locale="uk-UA")
        BASELINE["seed_cache"](page)
        BASELINE["open_library"](page)
        page.locator(".repo-card").first.wait_for()
        samples = page.evaluate(
            """
            ({ cardCount }) => {
              const results = document.querySelector('.search-results');
              const sourceCard = document.querySelector('.library-folder-section-items .repo-card');
              if (!(results instanceof HTMLElement) || !(sourceCard instanceof HTMLElement)) {
                throw new Error('Library performance fixture is unavailable');
              }

              const fixture = document.createElement('div');
              fixture.className = 'library-folder-section-items';
              fixture.setAttribute('aria-hidden', 'true');
              fixture.style.display = 'none';
              fixture.innerHTML = sourceCard.outerHTML.repeat(cardCount);
              results.append(fixture);

              const measurements = [];
              for (let run = 0; run < 7; run += 1) {
                fixture.style.display = 'none';
                void results.offsetHeight;
                const startedAt = performance.now();
                fixture.style.display = 'grid';
                void results.scrollHeight;
                measurements.push(performance.now() - startedAt);
              }
              fixture.remove();
              return measurements.slice(2);
            }
            """,
            {"cardCount": CARD_COUNT},
        )
        browser.close()

    median_ms = statistics.median(samples)
    assert median_ms <= LAYOUT_BUDGET_MS, {"medianMs": median_ms, "samples": samples}
    print(json.dumps({
        "cards": CARD_COUNT,
        "budgetMs": LAYOUT_BUDGET_MS,
        "medianMs": round(median_ms, 2),
        "samples": [round(value, 2) for value in samples],
    }))


if __name__ == "__main__":
    main()
