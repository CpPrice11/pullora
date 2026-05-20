param(
  [string]$Version = "",
  [string]$BuildRoot = "",
  [switch]$SkipArtifacts,
  [switch]$SkipSmokeTest,
  [switch]$CheckGitHubRelease,
  [string]$Repository = "CpPrice11/air-launcher"
)

$ErrorActionPreference = "Stop"

function Fail($Message) {
  throw "[release-check] $Message"
}

function Read-Json($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    Fail "File not found: $Path"
  }
  Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Read-Text($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    Fail "File not found: $Path"
  }
  Get-Content -LiteralPath $Path -Raw
}

function Assert-Equal($Name, $Actual, $Expected) {
  if ($Actual -ne $Expected) {
    Fail "$Name is '$Actual', expected '$Expected'"
  }
  Write-Host "[ok] $Name = $Actual"
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($BuildRoot)) {
  $BuildRoot = Join-Path (Split-Path $root -Parent) "Air Launcher Builds"
}

Push-Location $root

try {
  $package = Read-Json "package.json"
  if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = [string]$package.version
  }
  if ([string]::IsNullOrWhiteSpace($Version)) {
    Fail "Version was not provided and package.json has no version"
  }

  $tag = "v$Version"
  Write-Host "[release-check] Checking Air Launcher $tag"

  Assert-Equal "package.json version" ([string]$package.version) $Version

  $packageLockText = Read-Text "package-lock.json"
  if ($packageLockText -notmatch '(?m)^\s*"version":\s*"([^"]+)",') {
    Fail "package-lock.json has no root version"
  }
  Assert-Equal "package-lock.json root version" $Matches[1] $Version
  if ($packageLockText -notmatch '(?ms)"packages":\s*\{\s*"":\s*\{.*?"version":\s*"([^"]+)"') {
    Fail "package-lock.json has no root package version"
  }
  Assert-Equal "package-lock package version" $Matches[1] $Version

  $cargoToml = Read-Text "src-tauri\Cargo.toml"
  if ($cargoToml -notmatch '(?m)^version\s*=\s*"([^"]+)"') {
    Fail "src-tauri\Cargo.toml has no package version"
  }
  Assert-Equal "Cargo.toml version" $Matches[1] $Version

  $cargoLock = Read-Text "src-tauri\Cargo.lock"
  if ($cargoLock -notmatch '(?ms)\[\[package\]\]\s+name = "app"\s+version = "([^"]+)"') {
    Fail "src-tauri\Cargo.lock has no app package"
  }
  Assert-Equal "Cargo.lock app version" $Matches[1] $Version

  $tauri = Read-Json "src-tauri\tauri.conf.json"
  Assert-Equal "tauri.conf.json version" ([string]$tauri.version) $Version

  $about = Read-Text "src\pages\AboutPage.tsx"
  if ($about -notmatch "FALLBACK_CURRENT_VERSION\s*=\s*'v$([regex]::Escape($Version))'") {
    Fail "AboutPage fallback is not v$Version"
  }
  Write-Host "[ok] AboutPage fallback = v$Version"

  if (-not $SkipArtifacts) {
    $buildDir = Join-Path $BuildRoot $Version
    if (-not (Test-Path -LiteralPath $buildDir)) {
      Fail "Build artifacts folder not found: $buildDir"
    }

    $portableName = "Air.Launcher_${Version}_portable_x64.exe"
    $setupName = "Air.Launcher_${Version}_x64-setup.exe"
    $portablePath = Join-Path $buildDir $portableName
    $setupPath = Join-Path $buildDir $setupName

    if (-not (Test-Path -LiteralPath $portablePath)) {
      Fail "Portable EXE not found: $portablePath"
    }
    if (-not (Test-Path -LiteralPath $setupPath)) {
      Fail "Setup EXE not found: $setupPath"
    }

    $files = @(Get-ChildItem -LiteralPath $buildDir -File)
    $assetNames = @($files | ForEach-Object { $_.Name })
    $expectedNames = @($portableName, $setupName)
    $unexpected = @($assetNames | Where-Object { $_ -notin $expectedNames })
    if ($files.Count -ne 2 -or $unexpected.Count -gt 0) {
      Fail "Build folder must contain only portable EXE and setup EXE. Found: $($assetNames -join ', ')"
    }

    $blocked = @($files | Where-Object { $_.Extension -match '^\.(msi|zip)$' })
    if ($blocked.Count -gt 0) {
      Fail "MSI/ZIP artifacts are not allowed: $($blocked.Name -join ', ')"
    }

    Write-Host "[ok] Build artifacts: $($assetNames -join ', ')"

    if (-not $SkipSmokeTest) {
      Write-Host "[release-check] Smoke-testing portable EXE..."
      $proc = Start-Process -FilePath $portablePath -PassThru -WindowStyle Hidden
      Start-Sleep -Seconds 6
      if ($proc.HasExited) {
        Fail "Portable EXE exited during smoke-test with code $($proc.ExitCode)"
      }
      Stop-Process -Id $proc.Id -Force
      Write-Host "[ok] Smoke-test portable EXE: Running"
    }
  }

  if ($CheckGitHubRelease) {
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $gh) {
      Fail "gh CLI was not found, cannot check GitHub release"
    }

    $json = gh release view $tag --repo $Repository --json assets,tagName | ConvertFrom-Json
    Assert-Equal "GitHub release tag" ([string]$json.tagName) $tag

    $releaseAssets = @($json.assets | ForEach-Object { $_.name })
    $expectedReleaseAssets = @(
      "Air.Launcher_${Version}_portable_x64.exe",
      "Air.Launcher_${Version}_x64-setup.exe"
    )
    $unexpectedReleaseAssets = @($releaseAssets | Where-Object { $_ -notin $expectedReleaseAssets })
    if ($releaseAssets.Count -ne 2 -or $unexpectedReleaseAssets.Count -gt 0) {
      Fail "GitHub release must contain only portable EXE and setup EXE. Found: $($releaseAssets -join ', ')"
    }
    Write-Host "[ok] GitHub release assets: $($releaseAssets -join ', ')"
  }

  Write-Host "[release-check] Done: $tag"
} finally {
  Pop-Location
}
