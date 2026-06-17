# Pullora Release Process

Pullora releases are Windows-only and must publish exactly two GitHub assets: one portable EXE and one setup EXE.

## Pre-Release Checklist

- Confirm roadmap slices with the same version number are closed together.
- Confirm `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, and `AboutPage` fallback all use the same version.
- Confirm AI Workspace remains removed from the active product unless a future roadmap explicitly restores it.
- Confirm Library/install metadata remains local and independent from removed AI Workspace data.
- Confirm the release directory contains only the portable EXE and setup EXE.

## Commands

```powershell
npm run build
cd src-tauri
cargo check
cd ..
npm run check:release -- -Version <version> -SkipArtifacts -SkipSmokeTest -RcReadiness
npm run tauri-build
```

After staging artifacts in `Pullora Builds\<version>`:

```powershell
npm run check:release -- -Version <version>
npm run check:release -- -Version <version> -SkipSmokeTest -CheckGitHubRelease
```

## Artifact Names

- `Pullora_<version>_portable_x64.exe`
- `Pullora_<version>_x64-setup.exe`

No MSI, ZIP, or extra platform assets are part of the current release policy.
