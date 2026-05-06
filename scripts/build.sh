#!/bin/bash
# Dexter Build Script
# Usage: ./scripts/build.sh [target]
#
# Targets:
#   bun      - Bun 原生格式 (默认)
#   node     - Node.js 兼容格式
#   compile  - 编译为独立二进制

set -e

TARGET=${1:-bun}
BUILD_DIR="./dist"

echo "🔨 Building Dexter ($TARGET)..."

case $TARGET in
  "bun")
    echo "📦 Bun 原生格式..."
    mkdir -p $BUILD_DIR
    # TypeScript 类型检查
    bun run typecheck
    echo "✅ Bun 构建完成"
    echo "   运行: bun start"
    ;;

  "node")
    echo "📦 Node.js 兼容格式..."
    mkdir -p $BUILD_DIR
    bun build src/index.tsx \
      --target=node \
      --outfile=$BUILD_DIR/dexter.js \
      --external=dotenv \
      --external=zod
    echo "✅ Node.js 构建完成"
    echo "   运行: node dist/dexter.js"
    ;;

  "compile")
    echo "📦 编译为独立二进制..."
    bun build --compile \
      --target=bun \
      --outfile=dexter \
      src/index.tsx
    chmod +x dexter
    echo "✅ 编译完成"
    echo "   运行: ./dexter"
    echo "   文件大小: $(du -h dexter | cut -f1)"
    ;;

  "all")
    echo "📦 构建所有格式..."
    ./scripts/build.sh bun
    ./scripts/build.sh node
    ./scripts/build.sh compile
    echo "✅ 所有格式构建完成"
    ;;

  *)
    echo "❌ 未知目标: $TARGET"
    echo "   可用目标: bun, node, compile, all"
    exit 1
    ;;
esac

echo "🎉 构建完成!"
