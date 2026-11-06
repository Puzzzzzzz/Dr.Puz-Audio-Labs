param(
  [string]$AppDirectory = 'release/win-unpacked',
  [string]$Installer
)

$ErrorActionPreference = 'Stop'

function Resolve-SignTool {
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

$appPath = (Resolve-Path -LiteralPath $AppDirectory).Path
$files = @(Get-ChildItem -LiteralPath $appPath -Recurse -File |
  Where-Object { $_.Extension -in '.exe', '.dll' })

if ($Installer) {
  $installerPath = (Resolve-Path -LiteralPath $Installer).Path
  if ([IO.Path]::GetExtension($installerPath) -ne '.exe') {
    throw "Installer path is not an EXE file: $installerPath"
  }
  $files += Get-Item -LiteralPath $installerPath
}

if ($files.Count -eq 0) { throw "No EXE/DLL files found in: $appPath" }

$signtool = Resolve-SignTool
$results = foreach ($file in ($files | Sort-Object -Unique FullName)) {
  $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
  $verifyOutput = @(& $signtool verify /pa /all /q $file.FullName 2>&1)
  $toolValid = $LASTEXITCODE -eq 0
  [pscustomobject]@{
    File = $file.FullName
    Signature = $signature.Status
    Signer = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { '' }
    SignToolValid = $toolValid
    Detail = if ($toolValid) { '' } else { ($verifyOutput -join ' ').Trim() }
  }
}

$results | Format-Table -AutoSize
$invalid = @($results | Where-Object { $_.Signature -ne 'Valid' -or -not $_.SignToolValid })
if ($invalid.Count -gt 0) {
  throw "Signature verification failed for $($invalid.Count) of $($results.Count) EXE/DLL files. Do not publish this release."
}

Write-Host "Verified signatures for all $($results.Count) EXE/DLL files."
