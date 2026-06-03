#!/bin/bash
# UpUp Skills Eval Runner Script

SKILLS_DIR="/Users/louloulin/Documents/linchong/touzhi/upup/.agents/skills"
WORKSPACE="$SKILLS_DIR/workspace"

echo "=== UpUp Skills Evaluation Runner ==="
echo ""

# 列出所有Skills及其Evals
for skill_dir in $SKILLS_DIR/upup-*/; do
  if [ -d "$skill_dir" ] && [ -f "$skill_dir/SKILL.md" ]; then
    skill_name=$(basename "$skill_dir")
    evals_file="$skill_dir/evals/evals.json"
    
    echo "📦 $skill_name"
    if [ -f "$evals_file" ]; then
      eval_count=$(grep -c '"id":' "$evals_file" 2>/dev/null || echo "0")
      echo "   ✅ Evals: $eval_count 个测试用例"
    else
      echo "   ⚠️  无evals配置"
    fi
  fi
done

echo ""
echo "✅ 评估准备完成"
echo "📄 查看评估报告: /tmp/upup-skills-eval-report.html"
echo "   open /tmp/upup-skills-eval-report.html"
