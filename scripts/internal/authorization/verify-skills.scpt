#!/usr/bin/env osascript
-- UpUp SKILL.md 验证脚本
-- 验证个性化技能扩展

-- 显示验证开始
display dialog "UpUp SKILL.md 验证" buttons {"开始", "取消"} default button 1 with title "Skills 验证"

-- 项目路径
set projectPath to "/Users/louloulin/Documents/linchong/touzhi/dexter"

-- 验证 1: research-report Skill
try
    do shell script "ls " & projectPath & "/src/skills/research-report/SKILL.md"
    display dialog "✅ research-report SKILL.md 存在" buttons {"继续"} default button 1
on error errMsg
    display dialog "❌ research-report 错误: " & errMsg buttons {"退出"} default button 1
end try

-- 验证 2: stock-comparison Skill
try
    do shell script "ls " & projectPath & "/src/skills/stock-comparison/SKILL.md"
    display dialog "✅ stock-comparison SKILL.md 存在" buttons {"继续"} default button 1
on error errMsg
    display dialog "❌ stock-comparison 错误: " & errMsg buttons {"退出"} default button 1
end try

-- 验证 3: sentiment-analysis Skill
try
    do shell script "ls " & projectPath & "/src/skills/sentiment-analysis/SKILL.md"
    display dialog "✅ sentiment-analysis SKILL.md 存在" buttons {"继续"} default button 1
on error errMsg
    display dialog "❌ sentiment-analysis 错误: " & errMsg buttons {"退出"} default button 1
end try

-- 验证 4: Skill 数量统计
try
    set skillCount to do shell script "ls " & projectPath & "/src/skills/ | grep -c SKILL.md || find " & projectPath & "/src/skills -name SKILL.md | wc -l"
    display dialog "✅ Skills 总数: " & skillCount buttons {"继续"} default button 1
on error errMsg
    display dialog "❌ Skill 统计错误: " & errMsg buttons {"退出"} default button 1
end try

-- 验证完成
display dialog "🎉 SKILL.md 验证完成！" buttons {"完成"} default button 1 with title "验证结果"
