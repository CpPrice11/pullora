# Процес релізу Pullora

Pullora випускається лише для Windows. GitHub Release містить два виконувані артефакти та один маніфест контрольних сум: portable EXE, setup EXE і `SHA256SUMS.txt`.

## Перевірки перед релізом

- Закрити разом усі roadmap-пункти з однаковою версією.
- Звірити версію в `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` та fallback в `AboutPage`.
- Переконатися, що Library та install metadata залишаються локальними.
- У release-папці мають бути тільки portable EXE, setup EXE і `SHA256SUMS.txt`.

## Команди

```powershell
npm run build
cd src-tauri
cargo check
cd ..
npm run check:release -- -Version <version> -SkipArtifacts -SkipSmokeTest -RcReadiness
npm run tauri-build
```

Після перенесення EXE у `Pullora Builds\<version>`:

```powershell
npm run check:release -- -Version <version>
npm run check:release -- -Version <version> -SkipSmokeTest -CheckGitHubRelease
```

`check:release` створює `SHA256SUMS.txt` для обох EXE. Під час самооновлення Pullora звіряє GitHub-репозиторій, тег, ім’я asset, SHA-256 і тип файла, а потім повторно перевіряє SHA-256 безпосередньо перед і після заміни поточного EXE.

## Імена артефактів

- `Pullora_<version>_portable_x64.exe`
- `Pullora_<version>_x64-setup.exe`
- `SHA256SUMS.txt`

MSI, ZIP та артефакти інших платформ не входять у поточну release-policy. Самооновлення Pullora вимкнене для релізів без маніфесту контрольних сум.
