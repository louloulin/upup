---
name: market-overview
description: Provides comprehensive Chinese market overview including index performance, sector trends, northbound flow (北向资金), and market sentiment. Triggers on 市场概览, 今日行情, 北向资金, 板块涨跌.
description.zh-CN: 中国市场综合概览 — 指数表现、板块涨跌、北向资金、市场情绪。触发关键词: 市场概览, 今日行情, 北向资金, 板块涨跌.
triggers:
  - 市场概览
  - 今日行情
  - 北向资金
  - 板块涨跌
  - market overview
  - sector performance
  - northbound flow
---

# Market Overview (市场概览)

Real-time and historical market overview for Chinese A-shares, including indices, sectors, and cross-border capital flows.

## Step 1: Get Market Structure Data

### 1.1 Northbound Flow (北向资金)
```
get_market_structure({
  type: "hsgt"
})
```
- 沪股通 + 深股通 = 北向资金
- 净买入: 外资增持
- 净卖出: 外资减持

### 1.2 Market Cap Leaders
```
get_astock_price({
  code: "000001.SH"  // 上证指数
})

get_astock_price({
  code: "399001.SZ"  // 深证成指
})
```

## Step 2: Sector Analysis

### 2.1 Get Sector Data
```
get_sector_data({
  code: "[STOCK_CODE]"
})
```

### 2.2 Common Sectors (常用板块)
| 板块 | 代码 | 说明 |
|------|------|------|
| 白酒 | 酿酒行业 | 茅台、五粮液 |
| 新能源 | 新能源车 | 宁德时代、比亚迪 |
| 半导体 | 半导体 | 中芯国际、寒武纪 |
| 银行 | 银行 | 招行、工行 |
| 医药 | 医药制造 | 恒瑞、药明康德 |

## Step 3: Key Metrics to Track

### Index Performance
| 指数 | 代码 | 代表性 |
|------|------|--------|
| 上证指数 | 000001.SH | 全市场 |
| 深证成指 | 399001.SZ | 深圳市场 |
| 创业板 | 399006.SZ | 成长股 |
| 科创50 | 000688.SH | 科创板 |
| 沪深300 | 000300.SH | 大盘股 |

### Market Sentiment Indicators
1. **成交量**: 量能是否放大
2. **涨跌停数**: 涨停>跌停 → 市场活跃
3. **北向资金**: 持续净买入 → 外资看好
4. **融资余额**: 增加 → 杠杆资金入场

## Step 4: Data Interpretation

### 北向资金解读
| 情况 | 信号 |
|------|------|
| 连续净买入 > 3天 | 外资持续看好 |
| 单日净买入 > 100亿 | 外资大幅增持 |
| 连续净卖出 > 3天 | 外资持续看空 |
| 净卖出 > 50亿 | 外资大幅减持 |

### 板块轮动规律
- 行情启动: 券商 → 房地产 → 周期 → 消费 → 科技
- 资金轮动: 从高估值 → 低估值

## Step 5: Output Structure

```
# A股市场概览
日期: [DATE]

## 一、主要指数
| 指数 | 最新 | 涨跌幅 | 成交量 |
|------|------|--------|--------|
| 上证 | XXXX | +X.XX% | X亿 |
| 深证 | XXXX | +X.XX% | X亿 |
| 创业板 | XXXX | +X.XX% | X亿 |
| 科创50 | XXXX | +X.XX% | X亿 |
| 沪深300 | XXXX | +X.XX% | X亿 |

## 二、北向资金 (HSGT)
| 通道 | 今日净流入 | 本月净流入 |
|------|-----------|-----------|
| 沪股通 | X亿 | X亿 |
| 深股通 | X亿 | X亿 |
| **合计** | **X亿** | **X亿** |

**判断**: [外资态度说明]

## 三、热门板块
| 板块 | 涨幅 | 代表股 |
|------|------|--------|
| [板块1] | +X% | [股票] |
| [板块2] | +X% | [股票] |
| [板块3] | -X% | [股票] |

## 四、市场情绪
- 涨停家数: XX家
- 跌停家数: XX家
- 涨跌比: XX:XX
- 融资余额: X万亿 (+X亿)

## 五、综合判断
| 维度 | 状态 | 说明 |
|------|------|------|
| 指数趋势 | [多头/空头/震荡] | [说明] |
| 资金面 | [偏多/偏空/中性] | [说明] |
| 情绪面 | [乐观/中性/谨慎] | [说明] |
| **综合** | **[偏多/中性/偏空]** | [说明] |

## 六、投资建议
- 仓位建议: [X-Y%]
- 操作策略: [逢低买入/高抛低吸/观望]
- 关注方向: [板块1, 板块2]
- 风险提示: [风险因素]
```
