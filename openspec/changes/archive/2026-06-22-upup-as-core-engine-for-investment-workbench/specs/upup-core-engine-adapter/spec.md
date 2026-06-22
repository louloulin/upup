## ADDED Requirements

### Requirement: UPUP-ENGINE-001 — Engine adapter interface parity
The system SHALL expose an `upupRuntimeAdapter` in `app/src/main/upup/adapter.ts` whose public surface matches `kunRuntimeAdapter` exactly: `id`, `resolveExecutable(settings)`, `ensureRunning(settings)`, `stopAndWait()`, `isChildRunning()`, `getBaseUrl(settings)`, `reclaimPort(port)`. The export name `KUN_RUNTIME_ID` SHALL be reused as `ENGINE_RUNTIME_ID` while the Kun-specific constant remains for backwards compatibility.

#### Scenario: Default engine still works
- **WHEN** `app.isPackaged` runs without `DEEPSEEK_GUI_ENGINE`
- **THEN** the existing `kunRuntimeAdapter` is selected and the app boots as today
- **AND** the `@upup/agent-core` is not loaded

#### Scenario: UpUp engine selected
- **WHEN** `process.env.DEEPSEEK_GUI_ENGINE === 'upup'` (or settings default is `upup`)
- **THEN** `upupRuntimeAdapter` is selected
- **AND** `ensureRunning` starts the in-process bridge host
- **AND** `getBaseUrl` returns the bridge URL (default `http://127.0.0.1:5300`)

### Requirement: UPUP-ENGINE-002 — Settings bridging
The system SHALL translate `AppSettingsV1.kun` (provider, model, runtimeToken, port, dataDir, mcp) and `AppSettingsV1.claw.modelProvider` into `@upup/agent-core` configuration: LLM provider, model id, Tushare token, ExaSearch key, Tavily key, Anthropic / OpenAI / DeepSeek / Google / xAI keys, MCP servers list. The bridge SHALL fail fast with a clear Chinese error message if a required API key is missing.

#### Scenario: OpenAI provider configured
- **WHEN** settings has `provider = 'openai'` and `OPENAI_API_KEY` env is set
- **THEN** the agent-core boots with `provider: openai` and the configured model id

#### Scenario: Missing API key
- **WHEN** settings specifies a provider whose key is not in `.env` or settings
- **THEN** the bridge throws `缺少模型 API Key: <provider>` before any thread starts

### Requirement: UPUP-ENGINE-003 — Workspace dependency wiring
`app/package.json` MUST declare `@upup/agent-core`, `@upup/sdk`, and `@upup/skills` as workspace dependencies (`link:../../packages/agent-core`, `link:../../packages/sdk`, `link:../../packages/skills`). `electron-vite` and `electron-builder` external config MUST keep them out of the bundled renderer and inside the main process bundle.

#### Scenario: Dev start resolves workspace package
- **WHEN** developer runs `cd app && bun install`
- **THEN** `node_modules/@upup/agent-core` resolves to `../../packages/agent-core`
- **AND** typecheck of `app/src/main/upup/*` passes

#### Scenario: Production build externalizes agent-core
- **WHEN** `npm run dist:mac:arm64` runs
- **THEN** the packaged `DeepSeek GUI.app/Contents/Resources/app.asar` does not duplicate `@upup/agent-core/dist`
- **AND** main process can `import('@upup/agent-core')` at runtime
