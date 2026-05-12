# UpUp Paperclip Adapter 使用指南

> 版本: 4.8 | 更新日期: 2026-05-12

---

## 目录

1. [概述](#概述)
2. [快速开始](#快速开始)
3. [项目结构](#项目结构)
4. [打包部署](#打包部署)
5. [安装配置](#安装配置)
6. [使用说明](#使用说明)
7. [开发调试](#开发调试)
8. [故障排除](#故障排除)
9. [API 参考](#api-参考)

---

## 概述

`@upup/adapter-paperclip` 是 UpUp Agent 的 Paperclip 适配器，使 UpUp 能够作为 Paperclip 公司的 AI 员工（Agent）运行。

### 核心功能

- ✅ 作为 Paperclip 适配器注册和执行
- ✅ 支持 Heartbeat 定时任务
- ✅ 支持手动 Assign Task 任务分配
- ✅ 流式输出日志到 Paperclip UI
- ✅ ACPX 事件格式解析
- ✅ 会话状态持久化
- ✅ Token 使用统计

### 系统要求

- Node.js >= 18
- Bun >= 1.0 (推荐)
- Paperclip Server (本地开发或云端)
- DeepSeek API Key 或其他支持的 LLM API

---

## 快速开始

### 1. 安装依赖

```bash
cd packages/adapter-paperclip
bun install
```

### 2. 打包 Standalone 版本

```bash
# 方式一：使用 esbuild 打包
node build-standalone-v3.mjs

# 方式二：使用 pnpm workspace (如配置)
pnpm --filter @upup/adapter-paperclip build
```

### 3. 配置 Paperclip

1. 打开 Paperclip Dashboard
2. 进入 Agents 页面
3. 创建新 Agent 或选择现有 Agent
4. 选择 "Upup (local)" 适配器类型
5. 配置默认模型（默认：deepseek-v4-flash）

### 4. 运行测试

```bash
# 在 Agent 配置页面点击 "Run Heartbeat"
# 或通过 API 触发任务
```

---

## 项目结构

```
packages/adapter-paperclip/
├── src/
│   ├── index.ts              # 主入口（TypeScript 源码）
│   ├── standalone-adapter.ts # Standalone 适配器入口
│   ├── bundled-runner.ts     # 打包的 Agent 运行器
│   ├── ui-parser.ts          # UI 解析器
│   └── ...
├── standalone/               # 打包输出目录
│   ├── index.js              # 适配器主文件
│   ├── agent-bundle.js      # 打包的 Agent 代码
│   ├── ui-parser.js         # UI 解析器
│   └── package.json         # 发布配置
├── ui-parser.js             # 根目录 UI 解析器（Paperclip 加载）
├── package.json              # 包配置
├── build-standalone-v3.mjs    # 打包脚本
└── standalone-package.json    # Standalone 发布配置
```

---

## 打包部署

### 构建 Standalone 版本

```bash
# 进入项目目录
cd packages/adapter-paperclip

# 运行打包脚本
node build-standalone-v3.mjs
```

**输出文件：**
- `standalone/index.js` - 适配器主文件
- `standalone/agent-bundle.js` - 打包的 Agent 代码（~17MB）
- `standalone/ui-parser.js` - UI 解析器
- `standalone/package.json` - 发布配置

### 手动复制文件到插件目录

```bash
# Paperclip 插件目录
PLUGIN_DIR=~/.paperclip/adapter-plugins/node_modules/@upup

# 复制 standalone 目录
cp -r packages/adapter-paperclip/standalone $PLUGIN_DIR/adapter-paperclip
```

### 发布到 npm（可选）

```bash
cd packages/adapter-paperclip/standalone
npm publish --access public
```

---

## 安装配置

### 方式一：本地开发（推荐）

1. **链接本地包**

```bash
cd ~/.paperclip/adapter-plugins/node_modules/@upup
ln -sf /path/to/dexter/packages/adapter-paperclip adapter-paperclip
```

2. **重启 Paperclip Server**

```bash
# 在 Paperclip 项目目录
cd /Users/louloulin/Documents/linchong/code/paperclip
pnpm dev
```

3. **验证安装**

访问 http://localhost:3122，检查控制台是否无错误。

### 方式二：从 npm 安装

```bash
# 安装包
npm install @upup/adapter-paperclip -g

# 或在项目中
npm install @upup/adapter-paperclip
```

### 方式三：手动安装到 Paperclip

```bash
# 1. 克隆项目
git clone https://github.com/lumosaigroup/upup.git
cd upup

# 2. 构建
cd packages/adapter-paperclip
node build-standalone-v3.mjs

# 3. 复制到 Paperclip 插件目录
cp -r standalone/* ~/.paperclip/adapter-plugins/node_modules/@upup/adapter-paperclip/

# 4. 重新加载适配器
curl -X POST http://localhost:3122/api/adapters/upup_local/reload
```

---

## 使用说明

### 创建 Agent

1. 打开 Paperclip Dashboard
2. 进入 **Agents** 页面
3. 点击 **新建智能体**
4. 选择 **Upup (local)** 适配器
5. 配置 Agent 名称和指令
6. 保存

### 配置模型

在 Agent 配置页面的 **Configuration** 标签：

```json
{
  "model": "deepseek-v4-flash",
  "provider": "deepseek",
  "timeoutSec": 1800,
  "maxIterations": 50
}
```

### 运行模式

#### Heartbeat 模式

设置定时心跳检查：

1. 在 Agent 配置页面启用 **Heartbeat on interval**
2. 设置检查间隔（如每 4 小时）
3. Agent 将自动执行心跳任务

#### 手动触发

1. 点击 **Run Heartbeat** 按钮
2. 或分配任务 **Assign Task**

### 查看运行日志

1. 进入 Agent 的 **Runs** 页面
2. 选择具体的 Run 查看详情
3. 查看 **Transcript** 标签页的实时输出

---

## 开发调试

### 本地开发工作流

```bash
# 1. 启动 Paperclip 开发服务器
cd /Users/louloulin/Documents/linchong/code/paperclip
pnpm dev

# 2. 修改代码后重新打包
cd packages/adapter-paperclip
node build-standalone-v3.mjs

# 3. 重新加载适配器
curl -X POST http://localhost:3122/api/adapters/upup_local/reload

# 4. 测试
# 在 Paperclip UI 中触发 Agent 运行
```

### 调试技巧

#### 查看适配器日志

```bash
# 检查 Paperclip 服务器日志
tail -f /path/to/paperclip/logs/server.log
```

#### 测试适配器 API

```bash
# 测试 UI Parser
curl http://localhost:3122/api/adapters/upup_local/ui-parser.js

# 重新加载适配器
curl -X POST http://localhost:3122/api/adapters/upup_local/reload

# 检查适配器状态
curl http://localhost:3122/api/adapters/upup_local
```

#### 检查 agent-bundle.js

```bash
# 验证打包内容
head -50 packages/adapter-paperclip/standalone/agent-bundle.js
```

### 常见开发问题

#### 1. 适配器未加载

```bash
# 检查插件目录
ls -la ~/.paperclip/adapter-plugins/node_modules/@upup/adapter-paperclip/

# 验证 package.json
cat ~/.paperclip/adapter-plugins/node_modules/@upup/adapter-paperclip/package.json
```

#### 2. UI Parser 404

确保 `ui-parser.js` 存在于根目录：
```bash
ls -la packages/adapter-paperclip/ui-parser.js
```

#### 3. 配置警告

检查 `settings.json` 是否存在：
```bash
cat ~/.upup/settings.json
```

---

## 故障排除

### 错误：`[config] Setting 'provider' not found`

**原因**：打包的 agent-bundle.js 中配置处理有问题

**解决**：
1. 确保 `src/utils/config.ts` 中的 `getSetting()` 函数有 try-catch
2. 重新打包：`node build-standalone-v3.mjs`
3. 重新加载适配器

### 错误：`DEEPSEEK_API_KEY not found`

**原因**：环境变量未传递到 agent

**解决**：
1. 确保 `DEFAULT_MODEL` 环境变量已设置
2. 或在 Paperclip Agent 配置中设置模型

### 错误：`ui-parser.js 404`

**原因**：`ui-parser.js` 未在根目录

**解决**：
1. 复制文件：`cp standalone/ui-parser.js .`
2. 更新 `package.json` 添加 `./ui-parser` export
3. 重新加载适配器

### 错误：`Module not found "src/run.ts"`

**原因**：旧版配置路径错误

**解决**：
1. 使用打包后的 `agent-bundle.js`
2. 检查 `build-standalone-v3.mjs` 中的 entry point

---

## API 参考

### AdapterExecutionContext

```typescript
interface AdapterExecutionContext {
  runId: string;              // 运行 ID
  agent: AdapterAgent;         // Agent 信息
  runtime: AdapterRuntime;    // 运行时信息
  config: Record<string, unknown>;  // 配置
  context: Record<string, unknown>; // 上下文
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
  onMeta?: (meta: AdapterInvocationMeta) => Promise<void>;
  onSpawn?: (meta: { pid: number; processGroupId: number | null; startedAt: string }) => Promise<void>;
  authToken?: string;
}
```

### AdapterExecutionResult

```typescript
interface AdapterExecutionResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  errorMessage?: string | null;
  errorCode?: string | null;
  usage?: UsageSummary;
  sessionParams?: Record<string, unknown> | null;
  sessionDisplayId?: string | null;
  provider?: string | null;
  model?: string | null;
  costUsd?: number | null;
  summary?: string | null;
}
```

### ServerAdapterModule

```typescript
interface ServerAdapterModule {
  type: string;  // 'upup_local'
  execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>;
  testEnvironment(ctx): Promise<AdapterEnvironmentTestResult>;
  sessionCodec?: AdapterSessionCodec;
  detectModel?: () => Promise<{ model: string; provider: string }>;
  getConfigSchema?: () => AdapterConfigSchema;
}
```

---

## 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| 4.8 | 2026-05-12 | UI Parser 修复，18 次成功运行验证 |
| 4.7 | 2026-05-12 | Silent Config Fallback，移除警告 |
| 4.6 | 2026-05-12 | UI Parser 模块添加 |
| 4.5 | 2026-05-12 | 完整验证，12 张截图 |
| 4.4 | 2026-05-12 | Bundled Agent 执行成功 |
| 4.3 | 2026-05-12 | Agent Heartbeat 成功 |
| 4.0 | 2026-05-12 | Paperclip 集成验证 |

---

## 相关文档

- [Paperclip Adapter 实现计划](./paperclip1.0.md)
- [Paperclip 官方文档](https://docs.paperclip.com)
- [UpUp Agent 核心](../agent-core/README.md)
- [UpUp SDK](../sdk/README.md)

---

*文档最后更新: 2026-05-12*
