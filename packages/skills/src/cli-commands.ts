/**
 * CLI 投资命令扩展
 * Plan32.md M3: CLI 体验优化
 */

/**
 * 投资相关命令定义
 */
export const INVESTMENT_COMMANDS = {
  research: {
    name: '/research',
    alias: '/r',
    description: '深度投资研究',
    usage: '/research <股票代码或名称>',
    example: '/research 600519.SH 或 /r 贵州茅台',
  },
  compare: {
    name: '/compare',
    alias: '/c',
    description: '股票对比分析',
    usage: '/compare <股票1> <股票2>',
    example: '/compare 600519.SH 000858.SZ',
  },
  screen: {
    name: '/screen',
    alias: '/s',
    description: '条件选股',
    usage: '/screen <条件>',
    example: '/screen PE<20 股息率>3%',
  },
  report: {
    name: '/report',
    alias: '/rp',
    description: '生成投资报告',
    usage: '/report <股票>',
    example: '/report 贵州茅台',
  },
  alert: {
    name: '/alert',
    alias: '/a',
    description: '设置价格提醒',
    usage: '/alert <股票> <价格>',
    example: '/alert 600519.SH 1500',
  },
};

/**
 * 命令帮助文本
 */
export const INVESTMENT_HELP = `
📊 **投资助手命令**

| 命令 | 说明 | 示例 |
|------|------|------|
| /research | 深度投资研究 | /research 贵州茅台 |
| /compare | 股票对比 | /compare 茅台 五粮液 |
| /screen | 条件选股 | /screen PE<20 |
| /report | 生成投资报告 | /report 比亚迪 |
| /alert | 设置价格提醒 | /alert 600519.SH 1500 |

💡 **快捷命令**
- /r = /research
- /c = /compare
- /s = /screen
`;

/**
 * 获取命令列表
 */
export function getInvestmentCommands() {
  return Object.entries(INVESTMENT_COMMANDS).map(([key, cmd]) => ({
    key,
    ...cmd,
  }));
}
