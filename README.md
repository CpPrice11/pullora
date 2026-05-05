# Air Launcher

Air Launcher is a lightweight desktop launcher for applications published through public GitHub repositories and releases.

The project uses:

- Tauri 2 for the desktop shell and native capabilities.
- Rust for GitHub access, downloads, storage, extraction, and launching apps.
- React, TypeScript, and Vite for the UI.

## Current Direction

Air Launcher is being built as a personal/public GitHub release launcher:

- Configure a GitHub owner in Settings.
- Show that owner's public repositories that have GitHub Releases.
- Install release assets locally.
- Launch installed apps from the library.
- Keep the app fast, polished, and lightweight.

See [ROADMAP.md](ROADMAP.md) for the product plan and progress log.

## Development

Install dependencies:

```bash
npm ci
```

Run the Vite frontend:

```bash
npm run dev
```

Run the Tauri app in development:

```bash
npm run tauri-dev
```

Build the frontend:

```bash
npm run build
```

Check the Rust/Tauri backend:

```bash
cd src-tauri
cargo check
```

Build the desktop app:

```bash
npm run tauri-build
```

## Releases

The GitHub Actions release workflow builds Windows artifacts when a tag matching `v*` is pushed.

Example:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Repository Hygiene

Committed:

- Source code.
- Tauri icons and configuration.
- `package-lock.json`.
- `src-tauri/Cargo.lock`.
- Roadmap and project documentation.

Ignored:

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `src-tauri/gen/schemas/`
- IDE folders such as `.vs/`, `.vscode/`, and `.idea/`
- Local assistant/tool settings such as `.claude/`
