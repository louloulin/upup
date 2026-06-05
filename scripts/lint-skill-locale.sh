#!/usr/bin/env bash
# scripts/lint-skill-locale.sh (P3.a.2)
#
# 强制: 所有 SKILL.md 必须有 `description.zh-CN` 字段(中英双语对齐)。
# 漏一个 → CI fail。设计动机见 design.md D-CTG-1(跨阶段 CI 门禁) +
# tasks.md P3.a.2。
#
# 调用方:
#   bash scripts/lint-skill-locale.sh             # 扫描 src/skills/**
#   bash scripts/lint-skill-locale.sh path/to/skill.md   # 单文件检查
#
# 退出码:
#   0 — 全部 SKILL.md 都有 zh-CN
#   1 — 有 SKILL.md 漏 zh-CN(打印文件名 + 行号)

set -euo pipefail

if [[ $# -eq 0 ]]; then
  # 扫描 src/skills/ 全部 SKILL.md
  files=$(find src/skills -name 'SKILL.md' -type f | sort)
else
  files="$@"
fi

if [[ -z "$files" ]]; then
  echo "✓ no SKILL.md files to check"
  exit 0
fi

missing=0
total=0
for f in $files; do
  total=$((total + 1))
  if ! grep -qE '^description\.zh-CN:' "$f"; then
    echo "ERROR: $f 缺少 description.zh-CN 字段" >&2
    missing=$((missing + 1))
  fi
done

if [[ $missing -gt 0 ]]; then
  echo "" >&2
  echo "✗ $missing / $total SKILL.md 缺 zh-CN 描述" >&2
  echo "  修复: 在 frontmatter 加 'description.zh-CN: <中文翻译>'" >&2
  echo "  参考: src/skills/dcf/SKILL.md" >&2
  exit 1
fi

echo "✓ $total SKILL.md 全部含 description.zh-CN"
