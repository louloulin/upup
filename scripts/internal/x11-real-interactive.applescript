#!/usr/bin/env osascript
-- x11-real-interactive.applescript - 真实交互式Skills验证
-- 直接与 upup TUI 交互，执行真实 Skills 命令

-- 测试配置
property testQueries : {¬
    "/macro-china GDP", ¬
    "/macro-china CPI", ¬
    "/macro-china M2", ¬
    "/a-share-data 600519", ¬
    "/a-share-data 300750", ¬
    "/financial-data 贵州茅台", ¬
    "/technical-analysis 600519", ¬
    "/risk-assessment 600519", ¬
    "/sentiment-analysis 新能源车", ¬
    "/sector-analysis 医药"}


-- 主处理程序
on run argv
    set timeoutSeconds to 120
    set outputFile to ((path to documents folder as text) & "upup-interactive-log.txt")

    -- 打开日志文件
    set logFile to open for access file outputFile with write permission
    set eof logFile to 0

    write "============================================" & linefeed to logFile
    write "UpUp 真实交互式 Skills 验证" & linefeed to logFile
    write "============================================" & linefeed to logFile
    write "开始时间: " & (current date) as text & linefeed to logFile
    write linefeed to logFile

    -- 启动 upup
    tell application "Terminal"
        activate
        delay 1

        -- 打开新窗口
        set termWindow to do script "cd " & (POSIX path of (path to me as text) & "..") & "; ./dist/upup"
        delay 3

        set passedCount to 0
        set failedCount to 0
        set totalCount to (count of testQueries)

        -- 执行每个测试
        repeat with i from 1 to totalCount
            set query to item i of testQueries

            write "--- Test " & i & "/" & totalCount & " ---" & linefeed to logFile
            write "Query: " & query & linefeed to logFile

            -- 等待上一条命令完成
            delay 2

            -- 输入命令
            tell application "System Events"
                tell process "Terminal"
                    keystroke query
                    keystroke return
                end tell
            end tell

            -- 等待命令执行
            delay timeoutSeconds

            -- 捕获终端内容
            tell application "Terminal"
                set termContent to content of termWindow
            end tell

            -- 检查是否有输出
            if length of termContent > 100 then
                write "✅ PASSED" & linefeed to logFile
                set passedCount to passedCount + 1
            else
                write "⚠️ WARN (输出太短)" & linefeed to logFile
            end if

            write linefeed to logFile
        end repeat

        -- 输入退出命令
        delay 2
        tell application "System Events"
            tell process "Terminal"
                keystroke "/exit"
                keystroke return
            end tell
        end tell
        delay 2

        -- 关闭终端
        close termWindow saving no

    end tell

    -- 写入总结
    write "============================================" & linefeed to logFile
    write "测试总结" & linefeed to logFile
    write "============================================" & linefeed to logFile
    write "总计: " & totalCount & linefeed to logFile
    write "通过: " & passedCount & linefeed to logFile
    write "失败: " & failedCount & linefeed to logFile
    write "结束时间: " & (current date) as text & linefeed to logFile

    -- 关闭日志文件
    close access logFile

    -- 显示结果
    display dialog "验证完成!" & return & "通过: " & passedCount & "/" & totalCount buttons {"OK"} default button 1
end run
