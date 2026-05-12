# UpUp Paperclip Adapter 快速开始

> 5 分钟快速上手

---

## TL;DR

```bash
# 1. 打包
cd packages/adapter-paperclip && node build-standalone-v3.mjs

# 2. 链接
ln -sf $(pwd)/standalone ~/.paperclip/adapter-plugins/node_modules/@upup/adapter-paperclip

# 3. 重启 Paperclip
cd /Users/louloulin/Documents/linchong/code/paperclip && pnpm dev

# 4. 打开 http://localhost:3122 创建 Agent 选择 Upup (local)
```

---

## 详细步骤

### Step 1: 打包

```bash
cd packages/adapter-paperclip
node build-standalone-v3.mjs
```

输出：
```
✓ Build complete!
  Output: packages/adapter-paperclip/standalone/
  - index.js (adapter with embedded paths)
  - agent-bundle.js (self-contained agent code)
  - package.json
```

### Step 2: 安装到 Paperclip

**方式 A：链接本地开发版**
```bash
# 创建链接
ln -sf /path/to/dexter/packages/adapter-paperclip/standalone \
       ~/.paperclip/adapter-plugins/node_modules/@upup/adapter-paperclip

# 或复制
cp -r packages/adapter-paperclip/standalone/* \
      ~/.paperclip/adapter-plugins/node_modules/@upup/adapter-paperclip/
```

**方式 B：从 npm 安装**
```bash
npm install @upup/adapter-paperclip
```

### Step 3: 启动 Paperclip

```bash
cd /Users/louloulin/Documents/linchong/code/paperclip
pnpm dev
```

访问 http://localhost:3122

### Step 4: 创建 Agent

1. 点击 **新建智能体**
2. 选择适配器：**Upup (local)**
3. 输入 Agent 名称：如 `CEO`
4. 编写指令（Instructions）
5. 保存

### Step 5: 运行测试

点击 **Run Heartbeat** 按钮触发测试运行。

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `node build-standalone-v3.mjs` | 打包适配器 |
| `curl -X POST http://localhost:3122/api/adapters/upup_local/reload` | 重新加载适配器 |
| `curl http://localhost:3122/api/adapters/upup_local/ui-parser.js` | 检查 UI Parser |

---

## 验证清单

- [ ] 打包成功（无错误）
- [ ] 链接/安装成功
- [ ] Paperclip 启动无错误
- [ ] Agent 页面显示 Upup (local)
- [ ] Run Heartbeat 执行成功
- [ ] 控制台无红色错误

---

## 故障自检

```bash
# 1. 检查文件存在
ls ~/.paperclip/adapter-plugins/node_modules/@upup/adapter-paperclip/

# 2. 检查 UI Parser
curl -s http://localhost:3122/api/adapters/upup_local/ui-parser.js | head -5

# 3. 检查适配器加载
curl -s http://localhost:3122/api/adapters | grep upup

# 4. 检查 agent-bundle 大小
ls -lh packages/adapter-paperclip/standalone/agent-bundle.js
```

---

## 获取帮助

- 📖 [完整文档](./PAPERCLIP_ADAPTER_README.md)
- 📋 [实现计划](./paperclip1.0.md)
- 🐛 [报告问题](https://github.com/lumosaigroup/upup/issues)
