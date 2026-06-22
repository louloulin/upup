## ADDED Requirements

### Requirement: RENDERER-LIB-001 — All referenced modules resolve
The system SHALL provide every TypeScript module referenced via `import ... from '../lib/<name>'` or `'../../lib/<name>'` in `app/src/renderer/src/components/**/*.{ts,tsx}` as a real source file in `app/src/renderer/src/lib/`. `tsc --noEmit -p tsconfig.web.json` SHALL report zero `TS2307 Cannot find module '../lib/*'` errors after this requirement is satisfied.

#### Scenario: All lib imports resolve
- **WHEN** developer runs `npx tsc --noEmit -p tsconfig.web.json`
- **THEN** no `TS2307` errors reference `../lib/<name>` or `../../lib/<name>` paths
- **AND** every export imported by component files is exported from the corresponding `src/renderer/src/lib/<name>.ts` file

#### Scenario: Renderer build succeeds
- **WHEN** developer runs `cd app && npm run build`
- **THEN** `electron-vite` renders `out/renderer/index.html` and all renderer chunks
- **AND** no `RollupError: Could not resolve "../lib/*"` messages appear in build output

### Requirement: RENDERER-LIB-002 — Hook signatures match consumer call sites
Every React hook exported from `app/src/renderer/src/lib/` SHALL accept the arguments used at consumer call sites and SHALL return values structurally compatible with how the consumer uses them. Hooks MUST NOT throw at module-load time.

#### Scenario: useKeyboardShortcutSettings returns bindings
- **WHEN** `useKeyboardShortcutSettings()` is called from `Workbench.tsx` or `WindowsTitleBar.tsx`
- **THEN** the returned value exposes a `bindings` property (object) so consumers can read it without runtime TypeError

#### Scenario: emitRendererSettingsChanged accepts a value
- **WHEN** `emitRendererSettingsChanged(next)` is invoked from `SettingsView.tsx`
- **THEN** the function accepts a single argument of any type without throwing

### Requirement: RENDERER-LIB-003 — Existing tests remain green
All existing unit tests in `app/src/main/upup/__tests__/` and `app/src/renderer/src/investment/panels/__tests__/` SHALL continue to pass after the lib files are added. No existing test file SHALL require modification.

#### Scenario: Test count unchanged
- **WHEN** developer runs `npx vitest run src/main/upup/ src/renderer/src/investment/`
- **THEN** the total passing test count is 95 (matching the pre-change baseline)
- **AND** no test file reports `failed`

### Requirement: RENDERER-LIB-004 — GUI launches without build errors
After the lib files are added, an Electron-vite dev session (`npm run dev`) SHALL reach the renderer load stage without module-resolution errors. Window creation MUST NOT abort due to missing renderer chunks.

#### Scenario: Dev server serves renderer
- **WHEN** developer runs `cd app && npm run dev`
- **THEN** `electron-vite dev` serves the renderer at the configured port
- **AND** no terminal log shows `Could not resolve "../lib/..."` during startup

#### Scenario: Build output contains renderer bundle
- **WHEN** developer runs `cd app && npm run build`
- **THEN** `app/out/renderer/index.html` exists after the build completes
- **AND** the renderer JS bundle exists and includes all component code
