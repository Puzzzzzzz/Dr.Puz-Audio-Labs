$ErrorActionPreference = 'Stop'

$certificate = $env:WIN_CSC_LINK
if (-not $certificate) { $certificate = $env:CSC_LINK }
if (-not $certificate) {
  throw 'A trusted publisher certificate is required. Set WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD; release signing is mandatory.'
}

Push-Location (Join-Path $PSScriptRoot '..')
try {
  & npm.cmd run dist:win
  if ($LASTEXITCODE -ne 0) { throw "electron-builder failed with exit code $LASTEXITCODE." }

  $package = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
  if ($env:GITHUB_REF_NAME -match '^v(.+)$' -and $Matches[1] -ne $package.version) {
    throw "Git tag $env:GITHUB_REF_NAME does not match package version $($package.version)."
  }
  $installer = Join-Path 'release' "DrPuz-Audio-Lab-$($package.version)-Setup.exe"
  if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw "Installer not found: $installer" }

  & (Join-Path $PSScriptRoot 'verify-win-signatures.ps1') -AppDirectory 'release/win-unpacked' -Installer $installer
  Write-Host "Release signed and verified: $installer"
} finally {
  Pop-Location
}
