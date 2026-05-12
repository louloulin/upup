# Paperclip Adapter 命令参考

> 开发、部署、调试常用命令

---

## 打包命令

### 构建 Standalone 版本

```bash
# 标准打包
cd packages/adapter-paperclip
node build-standalone-v3.mjs

# 输出到 standalone/ 目录
```

### 验证打包

```bash
# 检查文件大小
ls -lh packages/adapter-paperclip/standalone/

# 检查关键文件存在
ls -la packages/adapter-paperclip/standalone/index.js
ls -la packages/adapter-paperclip/standalone/agent-bundle.js
ls -la packages/adapter-paperclip/standalone/ui-parser.js
ls -la packages/adapter-paperclip/ui-parser.js
```

---

## Paperclip 服务命令

### 启动 Paperclip

```bash
# 本地开发
cd /Users/louloulin/Documents/linchong/code/paperclip
pnpm dev

# 或指定端口
PORT=3000 pnpm dev
```

### 重启 Paperclip

```bash
# 停止当前服务
# Ctrl+C

# 重新启动
pnpm dev
```

---

## 适配器管理命令

### 检查适配器状态

```bash
# 列出所有适配器
curl http://localhost:3122/api/adapters

# 检查特定适配器
curl http://localhost:3122/api/adapters/upup_local

# 格式：JSON
curl -s http://localhost:3122/api/adapters | jq '.[] | select(.type == "upup_local")'
```

### 重新加载适配器

```bash
# 重载 upup_local 适配器
curl -X POST http://localhost:3122/api/adapters/upup_local/reload

# 预期响应：
# {"type":"upup_local","version":"1.0.0","reloaded":true}
```

### 测试 UI Parser

```bash
# 检查 UI Parser 是否可用
curl -s http://localhost:3122/api/adapters/upup_local/ui-parser.js | head -10

# 预期：返回 JavaScript 代码
```

---

## 文件操作命令

### 链接本地开发版

```bash
# 创建符号链接
ln -sf /Users/louloulin/Documents/linchong/touzhi/dexter/packages/adapter-paperclip/standalone \
       ~/.paperclip/adapter-plugins/node_modules/@upup/adapter-paperclip

# 或复制
cp -r /Users/louloulin/Documents/linchong/touzhi/dexter/packages/adapter-paperclip/standalone/* \
      ~/.paperclip/adapter-plugins/node_modules/@upup/adapter-paperclip/
```

### 检查链接状态

```bash
# 查看链接目标
ls -la ~/.paperclip/adapter-plugins/node_modules/@upup/adapter-paperclip

# 预期输出：
# lrwxr-xrwx adapter-paperclip -> /Users/louloulin/.../dexter/packages/adapter-paperclip/standalone
```

### 删除并重新链接

```bash
# 删除旧链接
rm -rf ~/.paperclip/adapter-plugins/node_modules/@upup/adapter-paperclip

# 重新创建
ln -s /path/to/new/version ~/.paperclip/adapter-plugins/node_modules/@upup/adapter-paperclip
```

---

## 日志命令

### 查看 Paperclip 日志

```bash
# 如果使用 systemd
journalctl -u paperclip -f

# 如果直接运行
# 查看终端输出
```

### 检查浏览器控制台

1. 打开 http://localhost:3122
2. 按 F12 打开开发者工具
3. 切换到 Console 标签
4. 执行 Agent 操作查看日志

### 检查网络请求

```bash
# 查找 api/adapters 请求
curl -v http://localhost:3122/api/adapters/upup_local 2>&1 | grep -E "HTTP|< "
```

---

## 测试命令

### 本地运行 Agent

```bash
# 直接运行 bundled agent
cd packages/adapter-paperclip/standalone
bun agent-bundle.js

# 或指定参数
DEFAULT_MODEL=deepseek-v4-flash bun agent-bundle.js
```

### API 测试

```bash
# 健康检查
curl http://localhost:3122/api/health

# 适配器列表
curl http://localhost:3122/api/adapters

# 重新加载
curl -X POST http://localhost:3122/api/adapters/upup_local/reload
```

---

## Git 命令

### 提交更改

```bash
# 添加文件
git add packages/adapter-paperclip/

# 提交
git commit -m "fix(adapter): 描述更改"

# 推送
git push origin feature/20260512-paperclip
```

### 创建 Pull Request

```bash
# 推送到远程
git push origin feature/20260512-paperclip

# 创建 PR（通过 GitHub/Gitea UI）
```

---

## 调试命令

### 检查 Node 进程

```bash
# 查看 Paperclip 进程
ps aux | grep -E "paperclip|tsx|node" | grep -v grep

# 查看端口占用
lsof -i :3122
```

### 检查 ESBuild 输出

```bash
# 查看打包警告/错误
node build-standalone-v3.mjs 2>&1

# 检查是否有新警告
node build-standalone-v3.mjs 2>&1 | grep -i warn
```

### 验证配置

```bash
# 检查 config.ts
cat src/utils/config.ts | grep -A5 "getSetting"

# 检查 agent-bundle 中的配置
grep -A3 "function getSetting" packages/adapter-paperclip/standalone/agent-bundle.js
```

---

## 清理命令

### 清理构建产物

```bash
# 删除 standalone 目录
rm -rf packages/adapter-paperclip/standalone

# 删除临时文件
rm -f packages/adapter-paperclip/*.log

# 清理 node_modules（谨慎使用）
rm -rf packages/adapter-paperclip/node_modules
```

### 清理 Git

```bash
# 查看未跟踪文件
git status --short

# 清理截图（不需要的）
rm -f *.png
```

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DEFAULT_MODEL` | 默认模型 | `deepseek-v4-flash` |
| `DEFAULT_PROVIDER` | 默认 Provider | `deepseek` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | - |
| `PAPERCLIP_AGENT_ID` | Paperclip Agent ID | - |
| `PAPERCLIP_COMPANY_ID` | Paperclip Company ID | - |

### 设置环境变量

```bash
# 临时设置
DEFAULT_MODEL=deepseek-v4 bun run packages/adapter-paperclip/standalone/index.js

# 或在 .env 文件
echo "DEFAULT_MODEL=deepseek-v4-flash" > .env
```
