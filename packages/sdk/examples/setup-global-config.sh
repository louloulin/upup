#!/bin/bash
# 创建全局 upup 配置示例

mkdir -p ~/.upup

cat > ~/.upup/settings.json << 'EOF'
{
  "provider": "anthropic",
  "modelId": "claude-sonnet-4-6",
  "apiKey": "YOUR_API_KEY_HERE"
}
EOF

echo "✅ 已创建 ~/.upup/settings.json"
echo ""
echo "请编辑该文件，填入你的 API key:"
echo "  - provider: anthropic / deepseek / openai / google"
echo "  - modelId: claude-sonnet-4-6 / deepseek-v4-flash / gpt-4"
echo "  - apiKey: 你的 API key"
echo ""
echo "配置后，运行以下命令测试:"
echo "  cd packages/sdk"
echo "  bun run examples/config-loading-test.ts"
