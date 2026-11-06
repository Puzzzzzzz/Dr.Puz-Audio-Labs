param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string[]]$Path,

  [string]$SignToolPath,
  [string]$CertificateThumbprint,
  [string]$TimestampServer = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'

function Resolve-SignTool {
  param([string]$RequestedPath)
  if ($RequestedPath) {
    if (-not (Test-Path -LiteralPath $RequestedPath -PathType Leaf)) { throw "signtool not found: $RequestedPath" }
    return (Resolve-Path -LiteralPath $RequestedPath).Path
  }
  $found = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($found) { return $found.Source }
  $kitsRoot = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Windows Kits/10/bin'
  if (Test-Path $kitsRoot) {
    $candidate = Get-ChildItem -LiteralPath $kitsRoot -Filter signtool.exe -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match '[\\/]x64[\\/]' } |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($candidate) { return $candidate.FullName }
  }
  throw 'signtool.exe was not found. Install the Windows SDK or add signtool.exe to PATH.'
}

$certificateFile = $env:WIN_CSC_LINK
if (-not $certificateFile) { $certificateFile = $env:CSC_LINK }
$certificatePassword = $env:WIN_CSC_KEY_PASSWORD
if (-not $certificatePassword) { $certificatePassword = $env:CSC_KEY_PASSWORD }
if (-not $CertificateThumbprint -and -not $certificateFile) {
  throw 'Set WIN_CSC_LINK to a PFX file or pass -CertificateThumbprint for a certificate in the Windows store.'
}
if ($certificateFile -and $certificateFile -match '^https?://|^[A-Za-z0-9+/=]{200,}$') {
  throw 'This signtool helper requires a local PFX file. For URL/base64 secrets, use electron-builder via npm run release:win.'
}
if ($certificateFile -and -not (Test-Path -LiteralPath $certificateFile -PathType Leaf)) {
  throw "PFX file from WIN_CSC_LINK/CSC_LINK was not found: $certificateFile"
}

$signtool = Resolve-SignTool $SignToolPath
$files = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
foreach ($entry in $Path) {
  if (-not (Test-Path -LiteralPath $entry)) { throw "File or directory not found: $entry" }
  $item = Get-Item -LiteralPath $entry
  if ($item.PSIsContainer) {
    Get-ChildItem -LiteralPath $item.FullName -Recurse -File |
      Where-Object { $_.Extension -in '.exe', '.dll' } |
      ForEach-Object { $files.Add($_) }
  } elseif ($item.Extension -in '.exe', '.dll') {
    $files.Add($item)
  } else {
    throw "Only EXE/DLL files are supported: $($item.FullName)"
  }
}

if ($files.Count -eq 0) { throw 'No EXE/DLL files were found to sign.' }

foreach ($file in ($files | Sort-Object -Unique FullName)) {
  $existing = Get-AuthenticodeSignature -LiteralPath $file.FullName
  if ($existing.Status -eq 'Valid') {
    Write-Host "Skipped already signed file: $($file.FullName)"
    continue
  }

  $arguments = @('sign', '/fd', 'SHA256', '/tr', $TimestampServer, '/td', 'SHA256')
  if ($CertificateThumbprint) {
    $arguments += @('/sha1', ($CertificateThumbprint -replace '\s', ''), '/s', 'My')
  } else {
    $arguments += @('/f', (Resolve-Path -LiteralPath $certificateFile).Path)
    if ($certificatePassword) { $arguments += @('/p', $certificatePassword) }
  }
  $arguments += $file.FullName

  Write-Host "Signing: $($file.FullName)"
  & $signtool @arguments
  if ($LASTEXITCODE -ne 0) { throw "signtool sign failed with exit code $LASTEXITCODE for: $($file.FullName)" }
  & $signtool verify /pa /all /v $file.FullName
  if ($LASTEXITCODE -ne 0) { throw "signtool verify did not confirm the signature: $($file.FullName)" }
}

Write-Host "Signed or verified $($files.Count) files."
