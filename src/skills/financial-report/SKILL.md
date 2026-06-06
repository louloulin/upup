---
name: financial-report-analysis
description: Analyzes Chinese A-share financial reports (annual reports, quarterly reports) to extract key insights. Triggers on 财报分析, 年报解读, 季报分析, financial report review, 业绩预告.
description.zh-CN: A 股财报(年报、季报)分析, 提取关键洞察。触发关键词: 财报分析, 年报解读, 季报分析, financial report review, 业绩预告.
triggers:
  - 财报分析
  - 年报解读
  - 季报分析
  - financial report
  - 业绩预告
  - earnings analysis
---

# Financial Report Analysis (财报分析)

Deep analysis of Chinese A-share financial reports including annual reports (年报), quarterly reports (季报), and earnings forecasts (业绩预告).

## Step 1: Gather Financial Data

### 1.1 Get Financial Statements
```
get_astock_financials({
  code: "[STOCK_CODE]",
  period: "[YYYY]",  // e.g., "2024" for annual
  start_date: "[START_DATE]",  // e.g., "20230101"
  end_date: "[END_DATE]"  // e.g., "20241231"
})
```

### 1.2 Get Recent Announcements
```
get_astock_news({
  code: "[STOCK_CODE]",
  limit: 10
})
```

## Step 2: Extract Key Metrics

### Income Statement (利润表)
| 指标 | 英文 | 重要性 |
|------|------|--------|
| 营业收入 | Revenue | ⭐⭐⭐⭐⭐ |
| 净利润 | Net Profit | ⭐⭐⭐⭐⭐ |
| 扣非净利润 | Non-GAAP Profit | ⭐⭐⭐⭐⭐ |
| 毛利率 | Gross Margin | ⭐⭐⭐⭐ |
| 净利率 | Net Margin | ⭐⭐⭐⭐ |
| EPS | Earnings Per Share | ⭐⭐⭐⭐ |

### Balance Sheet (资产负债表)
| 指标 | 英文 | 重要性 |
|------|------|--------|
| 总资产 | Total Assets | ⭐⭐⭐ |
| 净资产 | Net Assets | ⭐⭐⭐ |
| 资产负债率 | Debt Ratio | ⭐⭐⭐⭐ |
| 流动比率 | Current Ratio | ⭐⭐⭐ |

### Cash Flow (现金流量表)
| 指标 | 英文 | 重要性 |
|------|------|--------|
| 经营现金流 | Operating CF | ⭐⭐⭐⭐⭐ |
| 投资现金流 | Investing CF | ⭐⭐⭐ |
| 筹资现金流 | Financing CF | ⭐⭐⭐ |
| 自由现金流 | Free Cash Flow | ⭐⭐⭐⭐⭐ |

## Step 3: Calculate Key Ratios

### Profitability Ratios
```
ROE = 净利润 / 净资产 × 100%
ROA = 净利润 / 总资产 × 100%
毛利率 = (营业收入 - 营业成本) / 营业收入 × 100%
净利率 = 净利润 / 营业收入 × 100%
```

### Growth Ratios
```
营收增速 = (本期营收 - 上期营收) / 上期营收 × 100%
净利润增速 = (本期净利润 - 上期净利润) / 上期净利润 × 100%
```

### Financial Health
```
资产负债率 = 总负债 / 总资产 × 100%
流动比率 = 流动资产 / 流动负债
```

## Step 4: Trend Analysis

Compare metrics across periods (3-5 years):

| 指标 | 2022 | 2023 | 2024 | 趋势 |
|------|------|------|------|------|
| 营收(亿) | X | Y | Z | ↑↓→ |
| 净利(亿) | X | Y | Z | ↑↓→ |
| ROE(%) | X | Y | Z | ↑↓→ |
| 毛利率(%) | X | Y | Z | ↑↓→ |

## Step 5: Quality Assessment

### Revenue Quality
- 经营现金流 > 净利润 → 高质量盈利
- 经营现金流 < 净利润 → 需警惕

### Growth Quality
- 内生增长 vs 并购增长
- 营收增速 vs 应收账款增速

### Consistency
- 利润是否持续增长
- 季节性波动是否合理

## Step 6: Output Structure

```
# [股票名称] 财报分析报告
生成日期: [DATE]

## 一、核心指标摘要
| 指标 | 数值 | 同比 | 环比 |
|------|------|------|------|
| 营收 | X亿 | +X% | +X% |
| 净利润 | X亿 | +X% | +X% |
| 扣非净利 | X亿 | +X% | +X% |
| EPS | X元 | +X% | - |
| ROE | X% | +Xpp | - |
| 毛利率 | X% | +Xpp | +Xpp |

## 二、盈利能力分析
[详细分析]

## 三、成长性分析
[详细分析]

## 四、财务健康度
[详细分析]

## 五、现金流分析
[详细分析]

## 六、业绩质量评估
✅ 亮点:
- [亮点1]
- [亮点2]

⚠️ 关注:
- [问题1]
- [问题2]

## 七、综合评价
| 维度 | 评分 | 说明 |
|------|------|------|
| 盈利能力 | X/10 | [说明] |
| 成长性 | X/10 | [说明] |
| 财务安全 | X/10 | [说明] |
| 现金流 | X/10 | [说明] |
| **综合评分** | **X/10** | [说明] |

## 八、投资建议
- 当前估值: [PE/PB]
- 估值水平: [低估/合理/高估]
- 操作建议: [买入/持有/卖出]
```
