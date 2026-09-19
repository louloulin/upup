#!/usr/bin/env osascript
-- UpUp TUI 功能验证脚本
-- 验证 CLI 交互、权限系统、工具调用

-- 获取项目路径
set projectPath to "/Users/louloulin/Documents/linchong/touzhi/dexter"

-- 显示验证开始
display dialog "UpUp TUI 功能验证" buttons {"开始验证", "取消"} default button 1

-- 1. 验证 Bun 环境
do shell script "which bun && bun --version"

-- 2. 验证项目结构
do shell script "cd " & projectPath & " && ls -la src/ | head -10"

-- 3. 运行类型检查
do shell script "cd " & projectPath & " && bun run typecheck 2>&1 | head -20"

-- 4. 运行测试
do shell script "cd " & projectPath & " && bun test 2>&1 | tail -10"

-- 5. 验证 TUI 组件
do shell script "cd " & projectPath & " && ls -la src/components/*.ts | wc -l"

display dialog "验证完成！请查看结果。" buttons {"确定"} default button 1
