# Windows build and code-signing audit

Audit date: 2026-10-29  
Audited releases: `0.1.13` (original unsigned build) and `0.1.14` (replacement unsigned build)  
Builder: `electron-builder 27.0.0-alpha.14` with the `nsis` target; the installer is a full offline installer, not `nsis-web`.

## Findings in release 0.1.13

The installer `release/DrPuz-Audio-Lab-0.1.13-Setup.exe` is 115,507,417 bytes and has Authenticode status `NotSigned`. Smart App Control blocked this exact unsigned file in the user's screenshot.

The packaged application is in `release/win-unpacked`. Its PE files were inspected with `Get-AuthenticodeSignature`:

| File | Current signature |
| --- | --- |
| `Dr.Puz Audio Lab.exe` | Not signed |
| `resources/elevate.exe` | Not signed |
| `dxcompiler.dll` | Not signed |
| `electron_wer.dll` | Not signed |
| `ffmpeg.dll` | Not signed |
| `vk_swiftshader.dll` | Not signed |
| `vulkan-1.dll` | Not signed |
| `d3dcompiler_47.dll` | Valid, Microsoft Corporation |
| Setup installer EXE | Not signed |

The currently installed copy under `C:\Program Files\Dr.Puz Audio Lab` also contains an unsigned app EXE, NSIS uninstaller EXE, `resources/elevate.exe`, and the five listed unsigned DLLs. Its `d3dcompiler_47.dll` has a valid Microsoft signature. This is consistent with the package findings; the uninstaller is generated during installation and is not present in `win-unpacked` before installation.

No code-signing certificate was found in the Current User or Local Machine Windows certificate stores. The Windows SDK's `signtool.exe` is installed at `C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe`.

## Installer format, compression, and downloaded code

- `package.json` selects electron-builder's NSIS installer. The generated setup file is a self-extracting full installer; its payload uses the standard NSIS/LZMA compression path. No custom executable packer or obfuscation is configured.
- Electron Builder's default ASAR packaging is active: the application's JavaScript and assets are in `resources/app.asar` (32,806,637 bytes). ASAR is Electron's normal application archive, not an executable packer.
- The replacement setup is approximately 124.6 MB because it contains Chromium/Electron and bundled media/runtime components. This is a large desktop bundle, but size and standard NSIS compression do not remove the need for valid code signatures.
- Source inspection found no application code that spawns child processes or downloads/launches additional EXE files. The application works with local media files. NSIS extracts its bundled application and helper files during installation; there is no post-install downloader.
- Bundled `resources/elevate.exe` is an installer/runtime helper and is currently unsigned. The signing configuration now includes both `.exe` and `.dll`, covering this helper, Electron runtime binaries, the app executable, and the DLLs.

## Changes made

`package.json` now:

- requires a valid code-signing identity for Windows builds with `forceCodeSigning: true`, so an unsigned release build fails instead of silently producing another blocked installer;
- asks electron-builder to sign `.exe` and `.dll` files with SHA-256 and an RFC 3161 timestamp;
- adds `npm run release:win`, which builds and then verifies every EXE/DLL in `win-unpacked` and the versioned installer.

Scripts added:

- `scripts/sign-windows-files.ps1` signs selected EXE/DLL files with the Windows SDK `signtool.exe`. It accepts a local PFX through `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`, or a certificate thumbprint from the Windows `My` store.
- `scripts/verify-win-signatures.ps1` requires every EXE/DLL it scans to have a valid Authenticode signature and pass `signtool verify /pa /all`.
- `scripts/release-win.ps1` requires signing credentials, runs the Windows build, then fails release if any binary or the installer is unsigned/invalid.
- `.github/workflows/windows-release.yml` runs on `v*` tags or manually. It expects GitHub Actions secrets `WIN_CSC_PFX_BASE64` and `WIN_CSC_KEY_PASSWORD`, builds, verifies, and only then uploads the installer artifact.

electron-builder invokes `signtool.exe` itself for normal release signing. Its NSIS target signs the installer, generated uninstaller, and `resources/elevate.exe`; `signExts` extends the app pass to DLLs as well as EXEs. This matters because application binaries must be signed **before** NSIS packs them; signing only the outer setup file would leave the embedded app binaries unsigned. The standalone signing script is for explicitly selected files and should be used on the unpacked application before making an installer.

## How to configure signing locally

Obtain an Authenticode code-signing certificate from a CA trusted by Windows. Do not use a self-signed certificate for public distribution. Keep the PFX and its password outside Git.

In PowerShell, for a local PFX:

```powershell
$env:WIN_CSC_LINK = 'C:\secure\DrPuz-code-signing.pfx'
$env:WIN_CSC_KEY_PASSWORD = 'the PFX password'
npm run release:win
```

The PFX should contain a code-signing certificate and private key. `npm run release:win` will not produce a successful release until credentials are configured; this is intentional. Do not commit the certificate or password.

For the standalone SignTool helper, select exact paths. Sign the unpacked app before packaging it; verify the installer only after the builder has created and signed it:

```powershell
.\scripts\sign-windows-files.ps1 -Path 'release\win-unpacked'
```

The regular release path should be `npm run release:win`, which lets electron-builder sign the app contents and installer in the correct order.

## SmartScreen and Smart App Control recommendations

- Smart App Control blocks unknown unsigned executables and does not offer a per-file allow list. A valid signature from a trusted publisher is required when Microsoft's app intelligence cannot establish trust.
- A valid signature does not guarantee zero SmartScreen warnings on the first release. New signed files and publishers accumulate reputation; keep the same publisher identity across releases and distribute the exact signed build without modifying it afterward.
- Do not buy an EV certificate solely to bypass SmartScreen: Microsoft's current guidance says EV no longer gives an instant reputation bypass. For general consumer distribution, consider Microsoft Store/MSIX if feasible; otherwise use a trusted OV code-signing provider or Microsoft's Artifact Signing service where available.
- Keep release artifacts stable, publish hashes and version information, and avoid repacking/re-signing a release after verification. Never claim that signing guarantees SmartScreen will never warn.

## Verification status

The initial `0.1.14` installer built with the previous NSIS uninstaller-reader workaround failed the NSIS integrity check. It has been replaced using electron-builder `27.0.0-alpha.14`, whose NSIS reader applies the uninstaller icon patch and checks the NSIS CRC while building. The replacement passed that build-time integrity check.

The current app version is `0.1.14`; the unsigned installer is `release/DrPuz-Audio-Lab-0.1.14-Setup.exe` (125,256,861 bytes; SHA-256 `6B5EAB44E1B1122538718C6A25A676D44924FF7C7560884371880254EE3F9DD8`; Authenticode status `NotSigned`). This build also includes the final logo and the per-track half-time/double-time BPM correction controls. The normal release configuration still requires a trusted certificate, and `npm run release:win` plus the GitHub release workflow verify signatures before distribution. Because the replacement is unsigned, SmartScreen / Smart App Control may still warn or block it; the build correction addresses NSIS integrity, not Windows publisher reputation.
