# AGENTS.md

Windows-only local audio/video player: Electron 45 + electron-vite 6 + React 18, strict TypeScript. UI strings are Polish.

## Commands

- `npm run dev` — dev app; `npm run build` — production build to `out/` (gitignored).
- `npm test` — `node --test tests/*.test.mjs`; covers only `shared/`. Test files are `.mjs` importing `.ts` directly, so they rely on Node's built-in type stripping (Node ≥ 22.18; use the installed Node 24). Run a single file with `node --test tests/shared.test.mjs`.
- `npm run typecheck` — two projects: `tsconfig.json` (`src/`, renderer) and `tsconfig.node.json` (`electron/`, `shared/`, `electron.vite.config.ts`). Both must pass; running plain `tsc` checks only one. No linter/formatter is configured.
- Code outside `src/` is checked by the *other* tsconfig — typecheck after touching `shared/` or `electron/` even for renderer-only work.

## Architecture

- Three electron-vite targets (see `electron.vite.config.ts`):
  - Main process: `electron/main/index.ts` — all IPC handlers (`state:*`, `library:*`, `media:read-audio`, `dialog:*`, `playlist:*`, `stats:read`), folder scan/watch, and persistence.
  - Preload: `electron/preload/index.ts` — exposes `window.mediaApp` via `contextBridge`. `contextIsolation` + `sandbox` are on; the renderer has no Node access.
  - Renderer: `src/` (vite root, alias `@` → `src`). Nearly all app logic lives in the single large `src/App.tsx`; `src/components/` holds pages/widgets.
- IPC contract lives in `shared/types.ts` (`MediaAppApi`, `Track`, `PersistedState`, extension lists, `makeTrack`), imported by main, preload, and renderer. Adding an IPC channel means touching three places: main handler, preload wrapper, and the `MediaAppApi` type. Renderer must go through `window.mediaApp` only.
- Persisted state is a JSON file (`library-state.json`) in Electron `userData`, written via debounced `state:save`. `readState()` in main migrates legacy keys (`playbackTempo`/`crossfadeSeconds` → `globalBpm`/`crossfadeBars`); keep backward compatibility when changing the `PersistedState` schema.
- Version string is duplicated: `package.json` and the hardcoded `mediaApp.version()` in `electron/preload/index.ts`. Bump both.
- BPM detection/crossfade math lives in pure modules: `src/bpm.ts`, `src/clock.ts`, `src/playback.ts`.

## Release (signed Windows builds)

- `npm run dist:win` builds + packages NSIS installer into `release/`.
- `npm run release:win` = dist + signature verification; requires env `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` — code signing is mandatory (`forceCodeSigning: true`). CI (`windows-release.yml`) signs on tags `v*` using secrets `WIN_CSC_PFX_BASE64` / `WIN_CSC_KEY_PASSWORD`.
- The release script fails if the git tag `vX` doesn't match `package.json` `version`.
- `npm run verify:win-signatures` re-checks Authenticode signatures of `release/win-unpacked` and the installer. Signing audit/history: `docs/windows-code-signing-audit.md`.
