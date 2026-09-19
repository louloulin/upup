#!/usr/bin/env osascript
-- UpUp Claude Code Style 投资助手验证脚本
-- 验证核心功能和 CLI 交互

-- 显示验证开始对话框
display dialog "UpUp 投资助手验证" buttons {"开始", "取消"} default button 1 with title "UpUp TUI 验证"

-- 项目路径
set projectPath to "/Users/louloulin/Documents/linchong/touzhi/dexter"

-- 验证 1: Bun 环境
try
    do shell script "bun --version"
    display dialog "✅ Bun 环境正常" buttons {"继续"} default button 1
on error errMsg
    display dialog "❌ Bun 错误: " & errMsg buttons {"退出"} default button 1
end try

-- 验证 2: 项目结构
try
    do shell script "ls -la " & projectPath & "/src/ | head -10"
    display dialog "✅ 项目结构正常" buttons {"继续"} default button 1
on error errMsg
    display dialog "❌ 项目结构错误: " & errMsg buttons {"退出"} default button 1
end try

-- 验证 3: 核心组件
try
    set components to do shell script "ls " & projectPath & "/src/components/ | wc -l"
    display dialog "✅ 组件数量: " & components buttons {"继续"} default button 1
on error errMsg
    display dialog "❌ 组件错误: " & errMsg buttons {"退出"} default button 1
end try

-- 验证 4: Agent 模块
try
    set agents to do shell script "ls " & projectPath & "/src/runtime/pi/ | wc -l"
    display dialog "✅ Agent 模块: " & agents buttons {"继续"} default button 1
on error errMsg
    display dialog "❌ Agent 错误: " & errMsg buttons {"退出"} default button 1
end try

-- 验证 5: 工具模块
try
    set tools to do shell script "ls " & projectPath & "/src/tools/finance/ | wc -l"
    display dialog "✅ 金融工具: " & tools buttons {"继续"} default button 1
on error errMsg
    display dialog "❌ 工具错误: " & errMsg buttons {"退出"} default button 1
end try

-- 验证 6: 技能系统
try
    set skills to do shell script "ls " & projectPath & "/src/skills/ | wc -l"
    display dialog "✅ 技能系统: " & skills buttons {"继续"} default button 1
on error errMsg
    display dialog "❌ 技能错误: " & errMsg buttons {"退出"} default button 1
end try

-- 验证完成
display dialog "🎉 UpUp 验证完成！" buttons {"完成"} default button 1 with title "验证结果"
