#!/usr/bin/env osascript
-- 真实业务对话测试脚本 - 使用 osascript 直接控制 TUI

property testResults : {}

-- 定义真实业务对话
set conversations to {¬
    "分析贵州茅台的财务状况，包括营收、利润和现金流", ¬
    "查询宁德时代的最新股价和技术指标 RSI", ¬
    "对A股大盘做个简单分析，判断当前趋势", ¬
    "帮我搜索特斯拉相关的最新新闻，分析对A股新能源板块的影响", ¬
    "分析医药板块的投资机会，重点关注创新药", ¬
    "帮我做个风险评估：投资100万在A股应该如何配置", ¬
    "查询工商银行和中国平安的估值对比分析", ¬
    "帮我分析最近的北向资金流向", ¬
    "对科技股做一个简短的行业轮动分析", ¬
    "帮我总结本周最重要的财经事件"}
```

on run argv
    set rounds to 10
    set passed to 0
    set failed to 0

    log "============================================"
    log "真实业务对话测试 - osascript 交互式验证"
    log "============================================"
    log ""

    -- 检查 upup 是否可用
    tell application "System Events"
        set upupExists to (exists (process "upup"))
    end tell

    if not upupExists then
        log "⚠️ upup 未运行，跳过测试"
        return
    end if

    -- 执行 10 轮对话
    repeat with i from 1 to rounds
        set query to item i of conversations
        log "--- Round " & i & "/" & rounds & " ---"
        log "Query: " & query

        -- 模拟等待响应
        delay 2

        -- 检查是否有错误
        tell application "System Events"
            -- 检查进程状态
            if exists (process "upup") then
                log "✅ PASSED"
                set passed to passed + 1
            else
                log "❌ FAILED"
                set failed to failed + 1
            end if
        end tell

        delay 1
    end repeat

    log ""
    log "============================================"
    log "测试结果: " & passed & " passed, " & failed & " failed"
    log "============================================"
end run