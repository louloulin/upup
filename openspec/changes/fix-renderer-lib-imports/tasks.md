## 1. 列出并分类 22 个 lib 文件

- [ ] 1.1 列出所有 22 个文件名（grep `from '../lib/' src/renderer/src/` 去重）
- [ ] 1.2 对每个文件 grep 引用点（`src/renderer/src/components/` 和 `src/renderer/src/components/chat/`）
- [ ] 1.3 提取每个文件被 import 的符号 + 调用签名（`grep -E "import .* from '\.\./lib/<name>"` 后看使用方式）
- [ ] 1.4 按角色分类（hook / 工具 / 类型 / event-emitter / fetch-wrapper）

## 2. 创建 lib 文件（按依赖顺序）

- [ ] 2.1 创建 **hook 类型** 文件：`useKeyboardShortcutSettings` (`lib/keyboard-shortcut-settings.ts`)
- [ ] 2.2 创建 **event-emitter**：`emitRendererSettingsChanged` (同上文件)
- [ ] 2.3 创建 **hook 类型**：`useImageAttachmentUpload` / `useAttachmentUploadAvailability` (`lib/image-attachment-upload.ts`, `lib/attachment-upload-availability.ts`)
- [ ] 2.4 创建 **格式化工具**：`format-relative-time.ts`, `format-runtime-error.ts`, `format-workspace-picker-error.ts`
- [ ] 2.5 创建 **工作区工具**：`workspace-path.ts`, `workspace-label.ts`, `workspace-file-preview.ts`, `open-workspace-path.ts`
- [ ] 2.6 创建 **主题/预览工具**：`apply-theme.ts`, `dev-preview-detection.ts`, `browser-storage.ts`
- [ ] 2.7 创建 **代码/差异工具**：`diff-stats.ts`, `code-highlighting.ts`
- [ ] 2.8 创建 **编辑器/composer 工具**：`editor-preferences.ts`, `composer-change-summary.ts`, `composer-file-references.ts`
- [ ] 2.9 创建 **文件引用工具**：`file-references.ts`, `file-reference-validation.ts`
- [ ] 2.10 创建 **Skill/Thread 工具**：`skill-root-preference.ts`, `load-kun-diagnostics.ts`, `thread-fork-registry.ts`, `thread-sidebar-visibility.ts`, `thread-title.ts`

## 3. TypeScript 验证

- [ ] 3.1 运行 `cd app && npx tsc --noEmit -p tsconfig.web.json` 验证 `TS2307` 错误清零
- [ ] 3.2 修复任何剩余的 `TS7006 implicit any` 错误（应链式消失）
- [ ] 3.3 运行 `npx tsc --noEmit -p tsconfig.node.json` 确认主进程 0 错误未回归

## 4. 构建验证

- [ ] 4.1 运行 `cd app && npm run build` 验证 electron-vite 渲染层段成功
- [ ] 4.2 确认 `out/renderer/index.html` 和 renderer JS bundle 存在
- [ ] 4.3 确认 `out/main/index.js` 和 `out/preload/index.cjs` 未回归

## 5. 测试不回归

- [ ] 5.1 运行 `cd app && npx vitest run src/main/upup/ src/renderer/src/investment/` 确认 95/95 通过
- [ ] 5.2 如果 lib 文件意外被 vitest 配置 include，记录到 tasks.md 但不阻塞

## 6. 收尾

- [ ] 6.1 提交到 git：`feat(renderer): add 22 lib utility files to satisfy components imports`
- [ ] 6.2 运行 `openspec validate fix-renderer-lib-imports --strict` 验证 change
- [ ] 6.3 文档：在 `app/docs/` 下加 `renderer-lib-utilities.md` 简短说明每个文件的角色（可选）
- [ ] 6.4 用 `comet-archive` 归档（用户手动执行 `/comet-archive`）
