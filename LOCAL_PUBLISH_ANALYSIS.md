# UpUp 本地发布分析

> 发布可运行 UpUp 的完整方案

---

## 1. 当前状态分析

### 1.1 包结构

```
upup/
├── package.json          # 主包配置
├── src/
│   ├── index.tsx        # 主入口 (CLI)
│   └── ...
├── packages/
│   ├── types/           # @upup/types
│   ├── utils/           # @upup/utils
│   ├── llm/             # @upup/llm
│   ├── agent-core/      # @upup/agent-core
│   ├── skills/          # @upup/skills
│   ├── plugin-sdk/      # @upup/plugin-sdk
│   ├── mcp/             # @upup/mcp
│   ├── memory/          # @upup/memory
│   ├── sdk/             # @upup/sdk
│   └── ...              # 其他子包
├── dist/                # 构建产物
│   ├── upup              # Bun 可执行文件 (~12MB)
│   ├── upup.exe         # Windows 可执行文件
│   └── index-*.node     # 原生模块 (~39MB)
└── workspace packages   # 子包
```

### 1.2 已发布到 Verdaccio 的包

| 包名 | 版本 | 说明 |
|------|------|------|
| @upup/types | 0.1.0 | 类型定义 |
| @upup/utils | 0.1.0 | 工具函数 |
| @upup/llm | 0.1.0 | LLM 封装 |
| @upup/state | 0.1.0 | 状态管理 |
| @upup/hooks | 0.1.0 | Hooks |
| @upup/memory | 0.1.0 | 记忆系统 |
| @upup/plugin-sdk | 0.1.0 | Plugin SDK |
| @upup/mcp | 0.1.0 | MCP 客户端 |
| @upup/agent-core | 0.1.0 | Agent 核心 |
| @upup/commands | 0.1.0 | 命令系统 |
| @upup/keybindings | 0.1.0 | 快捷键 |
| @upup/skills | 0.1.0 | Skills 系统 |
| @upup/sdk | 0.1.0 | SDK |
| @upup/daemon | 0.1.0 | 守护进程 |
| @upup/cron | 0.1.0 | 定时任务 |
| @upup/gateway | 0.1.0 | 网关 |
| @upup/plugins | 0.1.0 | 插件集合 |
| @upup/adapter-paperclip | 1.0.0 | Paperclip 适配器 |

### 1.3 当前构建产物

| 文件 | 大小 | 说明 |
|------|------|------|
| dist/upup | ~12MB | Bun 可执行文件 |
| dist/upup.exe | ~37MB | Windows 可执行文件 |
| dist/index.js | ~12MB | Node.js 入口 |
| dist/index-*.node | ~39MB | DuckDB WASM 原生模块 |

---

## 2. 发布方案对比

### 2.1 方案对比表

| 方案 | 可运行 | 跨平台 | 包大小 | 依赖 | 复杂度 |
|------|--------|--------|--------|------|--------|
| **A. npm 包 + postinstall** | ✅ | ✅ | 小 | 需要 bun | 低 |
| **B. pkg 打包二进制** | ✅ | ✅ | 大 | 无 | 中 |
| **C. tarball 直接发布** | ❌ | ✅ | 中 | 需要 bun | 低 |
| **D. 分发可执行文件** | ✅ | ⚠️ | 大 | 无 | 高 |

### 2.2 推荐方案：A - npm 包 + postinstall

```
npm 包 (@upup/upup)
├── package.json           # bin 配置
├── dist/
│   ├── index.js          # 主入口 (打包后)
│   └── index-*.node      # 原生模块
├── bin/
│   └── upup              # CLI 入口脚本
├── postinstall.js         # 安装后脚本
└── README.md
```

**优点：**
- ✅ 跨平台支持 (Linux/macOS/Windows)
- ✅ 包大小适中 (~50MB)
- ✅ 依赖自动处理
- ✅ 可以发布到 Verdaccio

**缺点：**
- 需要用户安装 bun 或 node
- postinstall 脚本可能需要编译原生模块

---

## 3. 实施方案

### 3.1 创建 upup 分发包

```
dist-upup/
├── package.json
├── bin/
│   └── upup              # CLI 入口
├── dist/
│   ├── index.js          # 打包后的代码
│   └── index-*.node      # 原生模块
├── postinstall.js         # 安装后处理
└── README.md
```

### 3.2 package.json 配置

```json
{
  "name": "@upup/upup",
  "version": "2026.05.12",
  "description": "UpUp - AI Agent for Deep Financial Research",
  "type": "module",
  "bin": {
    "upup": "./bin/upup"
  },
  "main": "./dist/index.js",
  "files": [
    "dist",
    "bin"
  ],
  "scripts": {
    "postinstall": "node postinstall.js"
  },
  "dependencies": {
    "@upup/agent-core": "0.1.0",
    "@upup/types": "0.1.0",
    "@upup/utils": "0.1.0",
    "@upup/llm": "0.1.0",
    "@upup/memory": "0.1.0",
    "@upup/skills": "0.1.0",
    "@upup/plugin-sdk": "0.1.0",
    "@upup/mcp": "0.1.0",
    "@upup/sdk": "0.1.0",
    "@upup/commands": "0.1.0",
    "@upup/keybindings": "0.1.0",
    "@upup/hooks": "0.1.0",
    "@upup/state": "0.1.0",
    "@upup/daemon": "0.1.0",
    "@upup/cron": "0.1.0",
    "@upup/gateway": "0.1.0",
    "@upup/plugins": "0.1.0"
  },
  "optionalDependencies": {
    "@upup/adapter-paperclip": "1.0.0"
  },
  "engines": {
    "node": ">=18",
    "bun": ">=1.0"
  }
}
```

### 3.3 CLI 入口脚本 (bin/upup)

```bash
#!/usr/bin/env node

/**
 * UpUp CLI Entry Point
 * Supports both Node.js and Bun runtimes
 */

const path = require('path');
const { spawn } = require('child_process');

const isBun = process.argv[0].includes('bun');
const distDir = path.dirname(__filename);

async function main() {
  const script = path.join(distDir, 'dist', 'index.js');

  const args = [script, ...process.argv.slice(2)];

  if (isBun) {
    const { Command } = require('bun');
    const proc = new Command();
    await proc.parse(args).spawn();
  } else {
    const child = spawn('bun', args, {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', (code) => {
      process.exit(code);
    });
  }
}

main().catch((err) => {
  console.error('Failed to start UpUp:', err);
  process.exit(1);
});
```

### 3.4 postinstall.js

```javascript
/**
 * Post-install script for @upup/upup
 * Handles native module compilation if needed
 */

const fs = require('fs');
const path = require('path');

console.log('📦 Setting up UpUp...');

// Check for native modules
const distDir = path.join(__dirname, 'dist');
const nodeModules = fs.readdirSync(distDir)
  .filter(f => f.endsWith('.node'));

if (nodeModules.length > 0) {
  console.log('✅ Native modules ready');
}

// Check for bun
try {
  require('child_process').execSync('bun --version', { stdio: 'pipe' });
  console.log('✅ Bun runtime detected');
} catch {
  console.log('⚠️  Bun not found. For best experience, install:');
  console.log('   curl -fsSL https://bun.sh/install | bash');
}

console.log('✅ UpUp installed successfully!');
console.log('   Run: upup --help');
```

---

## 4. 发布流程

### 4.1 构建步骤

```bash
# 1. 安装 pkg (用于打包)
npm install -g pkg

# 2. 构建 Bun 版本
bun run build:compile

# 3. 构建 Node.js 版本
bun run build:node

# 4. 复制原生模块
cp dist/index-*.node dist-upup/dist/

# 5. 打包 tarball
cd dist-upup && npm pack

# 6. 发布到 Verdaccio
npm publish --registry http://localhost:4873
```

### 4.2 用户安装

```bash
# 添加到 npmrc
echo "@upup:registry=http://localhost:4873" >> ~/.npmrc

# 安装
npm install @upup/upup -g

# 运行
upup --help
```

---

## 5. 替代方案：直接发布可执行文件

### 5.1 GitHub Release 方式

```bash
# 构建各平台版本
bun run build:compile          # macOS/Linux
bun run build:compile:win      # Windows

# 创建 release
gh release create v2026.05.12 \
  --title "UpUp v2026.05.12" \
  --notes "Release notes" \
  dist/upup \
  dist/upup.exe
```

### 5.2 本地文件分发

```bash
# 创建分发目录
mkdir -p release
cp dist/upup release/upup-macos
cp dist/upup.exe release/upup-windows.exe

# 创建安装脚本
cat > release/install.sh << 'EOF'
#!/bin/bash
curl -fsSL http://localhost:4873/-/binary/upup/latest/upup -o upup
chmod +x upup
./upup --version
EOF
```

---

## 6. 总结与建议

### 6.1 推荐方案

**短期：** npm 包 + postinstall
- 快速实现
- 复用现有 Verdaccio
- 需要用户安装 bun

**长期：** pkg 打包二进制
- 完全独立
- 无需运行时
- 包体积较大 (~100MB)

### 6.2 实施优先级

1. ✅ 已完成：发布子包到 Verdaccio
2. 🔄 进行中：创建 @upup/upup 主包
3. ⏳ 待完成：配置 bin 入口和 postinstall
4. ⏳ 待完成：测试安装和运行

---

## 7. 测试清单

- [ ] 创建 dist-upup 目录结构
- [ ] 配置 package.json 和 bin
- [ ] 测试 `npm install @upup/upup -g`
- [ ] 测试 `upup --help`
- [ ] 测试 `upup setup`
- [ ] 测试 `upup --version`
- [ ] 验证所有子包依赖正确解析

