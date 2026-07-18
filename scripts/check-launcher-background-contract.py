from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def require(source: str, fragment: str, label: str) -> None:
    assert fragment in source, f"Missing {label}: {fragment}"


def main() -> None:
    app = read("src/App.tsx")
    layout = read("src/components/Layout/Layout.tsx")
    layout_css = read("src/components/Layout/Layout.css")
    modal_css = read("src/components/Modal/Modal.css")
    page_css = read("src/pages/PageStyles.css")
    cinematic_css = read("src/styles/Cinematic.css")
    theme = read("src/utils/theme.ts")
    library = read("src/features/library/LibraryPage.tsx")
    hero = read("src/features/library/components/LibraryHero.tsx")

    require(app, "const visibleBackground = launcherBackgrounds[resolvedTheme]", "theme background selection")
    require(app, "backgroundImage={visibleBackground}", "root Layout background")
    for child in ("<LibraryPage", "<SettingsPage", "<AboutPage", "<InstallationPathModal"):
        require(app, child, f"Layout child {child}")

    assert layout.count('className={`cinematic-background') == 1
    assert layout.count('className="cinematic-backdrop"') == 1
    require(layout_css, "var(--launcher-background-scrim)", "shared root scrim")
    assert "settings-open .cinematic-background" not in layout_css
    assert "settings-open .cinematic-backdrop" not in layout_css

    require(theme, "'--launcher-background-scrim'", "appearance scrim token")
    require(theme, "normalized.surfaceBlur", "shared blur setting")

    for source, selector in (
        (modal_css, ":root[data-theme='light'] .modal-overlay"),
        (cinematic_css, ".modal-overlay"),
        (page_css, ".modal-backdrop"),
        (page_css, ".settings-reset-overlay"),
    ):
        rule_start = source.rfind(f"{selector} {{")
        assert rule_start >= 0, f"Missing dialog overlay: {selector}"
        rule_end = source.find("}", rule_start)
        rule = source[rule_start:rule_end]
        require(rule, "var(--launcher-background-scrim)", f"shared scrim for {selector}")
        require(rule, "blur(var(--surface-blur))", f"shared blur for {selector}")

    require(library, "projectArtBackgroundUrl(featuredArt, { fallbackToCover: false })", "independent hero art")
    require(library, "'--library-hero-background'", "local hero background variable")
    require(hero, 'className="library-hero-background" style={backgroundStyle}', "local hero layer")

    print("Launcher background contract: OK")


if __name__ == "__main__":
    main()
