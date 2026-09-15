# Pi-Native LLM Provider 化后续计划 (2026-09-15)

> 本文档是 `docs/pi7-pi-llm-config-audit.md` §7 的延续。基于"已经完成 `PROVIDERS` 表全量 Pi 化、41 provider selector 渲染正常、22/22 Pi7-final 合同通过"这一现状，记录下一步要推的事。

## 已完成 (本次)

- `packages/utils/src/providers.ts` 142 行，全部从 `@earendil-works/pi-ai` 派生。
- `packages/utils/package.json`：`@upup/pi-runtime` 由 devDeps 移到 deps。
- `packages/pi-runtime/src/model-registry.ts`：新增 `detectPiProvider()`，含 `MiniMax-` 前缀识别。
- `packages/pi-event-adapter/src/pi-model-bridge.ts`：原 `detectPiProvider` 改为 re-export，保持 import path 兼容。
- `packages/utils/src/providers.test.ts`：9 条契约测试，包含 legacy alias (moonshot/kimi/gemini/grok)、MiniMax 解析、Ollama 边界。
- `env.example`：新增 `MINIMAX_API_KEY` / `MINIMAX_CN_API_KEY`。

## 仍待推 (按价值 / 风险排序)

### P1 — 必须做但需要设计

1. **`agentDir` 与 Pi `.pi/agent` 契约对齐**
   - 文件：`packages/pi-cli-bootstrap/src/agent-launcher.ts` 等
   - 当前 `agentDir=cwd` 让多窗口场景下 Pi 的 `.pi/agent` 数据互相覆盖。
   - 计划：参考 Pi 文档的 `agentDir` 解析顺序（`UPUP_AGENT_DIR` > `.upup/agent` > `.pi/agent`），并允许 `--agent-dir` 覆盖。
   - 风险：与已有用户配置冲突；先做 dry-run / 迁移工具。

2. **接入 Pi `settings.json`，抛弃 `SettingsManager.inMemory()`**
   - 文件：`packages/pi-config/` 或 `packages/utils/src/config/`
   - Pi 已经把 settings 持久化到 `.upup/settings.json`（`PiSettingsManager`），目前 UpUp 的 setup wizard 仍走 `inMemory()`，导致用户切换 provider / model 后第二次启动又被打回 prompt。
   - 计划：把 `SettingsManager.inMemory()` 替换为 `PiSettingsManager`，让 setup wizard 在检测到 `.upup/settings.json` 已存在时跳过 API key 录入（直接读环境变量）。
   - 风险：现有 `.upup/settings.json` schema 与 Pi 0.85.1 不一定一致；需先做 schema migration。

3. **`resolvePiModel` 静默 fallback 报警**
   - 文件：`packages/pi-event-adapter/src/pi-model-bridge.ts`
   - 现在 `resolvePiModel('MiniMax-M9')`（catalog 不存在的 model）静默返回 undefined。
   - 计划：在 `prompt-runner.ts` 包装一层，未命中时打 `describePiModelResolution` 诊断（"unknown model 'MiniMax-M9'; available: MiniMax-M2.7, MiniMax-M3"）。
   - 风险：低，纯加错误信息。

### P2 — 改善体验，常规 PR

4. **`/provider` 选择器支持 Pi catalog 全 41 项**
   - 文件：`packages/pi-tui-app/src/components/select-list.ts`
   - 当前列表只显示 8 个 curated + MiniMax（前 10）。剩余 31 个需要滚动才能看到。
   - 计划：分组显示（"常用" / "Pi catalog" / "本地 (Ollama)"），并增加 `/search <query>` 子命令过滤。
   - 验证：与 `bun run dev` 已观测到的渲染对齐。

5. **Provider 健康检查（pre-flight）**
   - 文件：`packages/pi-cli-bootstrap/src/doctor.ts`
   - 当前 doctor 只检查 API key 是否存在，不发请求。
   - 计划：用 `GET /v1/models`（OpenAI 兼容）或 Pi 内置的 `getBuiltinModel` ping，每个 provider 跑一次 < 1s 的健康检查。
   - 风险：网络超时需要可配置（`UPUP_HEALTHCHECK_TIMEOUT=3000`）。

6. **Provider failure 重试策略**
   - 文件：`packages/pi-runtime/src/index.ts`（侧效 policy 层）
   - 现状：单一 provider 失败直接 fail。
   - 计划：在 `PiSideEffectPolicyExtension` 增加 `fallbackProviders` 链，按 curated 顺序尝试。
   - 风险：跨 provider 的 token 计费需要单独跟踪。

### P3 — 锦上添花

7. **多 model 注册（`/model` picker）接入 Pi catalog**
   - 文件：`packages/pi-tui-app/src/utils/model.ts`
   - 当前 `RECOMMENDED_MODELS` 仍是手写 dict。
   - 计划：直接调用 `listPiModels(providerId)`，把 Pi catalog 的全部 model 渲染出来，并按 `id` 模糊搜索。

8. **MiniMax-M3 / MiniMax-M2.7 跑通端到端**
   - 当前没在 `verify:pi-real-invest.contract` 里覆盖（凭证缺位），等用户配 `MINIMAX_API_KEY` 后加一条 `600519.SH` / `00700.HK` 投研 case。

## 验证清单（每次改动必跑）

```bash
bun run typecheck                  # 0 errors
bun test                            # 2133 / 2133 pass
bun run check:module-boundaries     # 48 packages / 2 root src
bun run check:pi7                   # single factory
bun run verify:pi7-final            # 22 contracts
bun run dev                         # provider selector renders 41 providers, no overflow
```

## 风险与注意

- **不要再新增 provider 手写数据**。任何新 provider 必须先看 Pi catalog 是否有，没有再考虑自定义注册（Ollama 路线）。
- **不要修改 `detectPiProvider` 之外的旧 import path**。`pi-model-bridge.ts` 仍 re-export 是为了兼容历史代码。
- **不要直接读 `process.env` 拿 API key**。统一走 `getProviderApiKeyEnvVars(providerId)` + `hasPiProviderApiKey(providerId)`，让 Pi 知道我们读了哪些变量。
- **任何 provider 改动都要跑 `bun test packages/utils/src/providers.test.ts`**，确保 legacy alias 仍然 resolve。

## 下次 session 起点

P1-1 (`agentDir`) 与 P1-2 (settings.json) 是阻塞 `/provider` 体验的真正问题。一旦解决，UpUp 就完成了 Pi-Native 投资助手的 provider 接入层收尾。
