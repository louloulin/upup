---
name: personalized-recommendation
description: Personalized investment recommendation skill based on user preferences, risk tolerance, and portfolio. Triggers on 推荐股票, 个性化推荐, investment recommendation, 投资建议, portfolio recommendation.
triggers:
  - personalized recommendation
  - 推荐股票
  - 个性化推荐
  - investment recommendation
  - 投资建议
  - portfolio recommendation
  - stock picks
  - 选股建议
---

# Personalized Investment Recommendation (个性化投资推荐)

Generate personalized stock recommendations based on user preferences, risk tolerance, and portfolio composition.

## User Profile Assessment

### Risk Tolerance Levels

| Level | Description | Suitable Stocks |
|-------|-------------|------------------|
| **Conservative** | Low risk, stable returns | 银行、电力、消费品龙头 |
| **Moderate** | Balanced risk/return | 蓝筹股、行业龙头 |
| **Aggressive** | High risk, growth potential | 成长股、新兴行业 |

### Investment Themes

| Theme | Focus | Examples |
|-------|-------|----------|
| **Value** | Undervalued stocks | Low P/E, Low P/B |
| **Growth** | High growth potential | Tech, Emerging |
| **Dividend** | Income generation | High dividend yield |
| **Quality** | Strong fundamentals | ROE > 15% |

## Recommendation Process

### Step 1: Profile Analysis

Collect user preferences:
```
Risk Tolerance: [Conservative/Moderate/Aggressive]
Investment Horizon: [Short/Medium/Long]
Preferred Themes: [Value/Growth/Dividend/Quality]
Preferred Sectors: [Technology/Healthcare/etc.]
```

### Step 2: Stock Screening

Based on profile, apply filters:

#### Conservative Profile
```
P/E < 15
P/B < 2
Dividend Yield > 2%
Debt Ratio < 60%
Market Cap > 100B CNY
```

#### Moderate Profile
```
P/E < 25
P/B < 4
Dividend Yield > 1%
ROE > 10%
Market Cap > 50B CNY
```

#### Aggressive Profile
```
Revenue Growth > 20%
Net Profit Growth > 15%
ROE > 15%
P/E < 50 (growth premium acceptable)
```

### Step 3: Scoring Model

Score each candidate:

```
Total Score = 
  Valuation Score (30%) +
  Growth Score (30%) +
  Quality Score (25%) +
  Momentum Score (15%)
```

### Step 4: Diversification Check

Ensure portfolio diversification:
- No single sector > 30%
- No single stock > 15%
- Mix of large/mid/small cap

## Recommendation Output

```
# 个性化投资推荐

## 用户画像
- 风险偏好: [等级]
- 投资期限: [期限]
- 投资主题: [主题]

## 推荐股票

### 核心持仓 (3-5只)
| 股票 | 代码 | 理由 | 建议仓位 |
|------|------|------|----------|
| XXX | XXXX.SH | [理由] | 10-15% |

### 卫星配置 (2-3只)
| 股票 | 代码 | 理由 | 建议仓位 |
|------|------|------|----------|

## 风险提示
[具体风险因素]

## 免责声明
[法律声明]
```

## Screening Criteria by Theme

### Value Investing
- P/E < 15 (or below industry average)
- P/B < 2
- EV/EBITDA < 10
- Price/FCF < 20

### Growth Investing
- Revenue Growth > 20%
- Net Profit Growth > 15%
- PEG < 1
- R&D intensity > 5%

### Dividend Investing
- Dividend Yield > 3%
- Dividend Payout < 60%
- 5-Year dividend growth > 5%
- Consistent dividend history

### Quality Investing
- ROE > 15%
- ROIC > 10%
- Gross Margin > 30%
- Net Margin > 10%

## Implementation Tools

Use these tools for screening:

```
# Get sector data
get_sector_data({ code: "[SECTOR]" })

# Screen A-shares
screen_stocks_multi({
  market: "A",
  sector: "[SECTOR]",
  limit: 50
})

# Get financials
get_astock_financials({
  code: "[STOCK_CODE]"
})

# Technical check
get_technical_data({
  code: "[STOCK_CODE]"
})
```

## Example Recommendations

### Conservative + Value
```
推荐:
- 招商银行 (600036.SH) - 低估值银行，稳定分红
- 中国平安 (601318.SH) - 综合金融，价值投资
- 长江电力 (600900.SH) - 稳定现金流，高分红
```

### Moderate + Growth
```
推荐:
- 宁德时代 (300750.SZ) - 新能源龙头，高成长
- 比亚迪 (002594.SZ) - 新能源汽车，全球竞争力
- 中芯国际 (688981.SH) - 半导体国产替代
```

### Aggressive + Quality
```
推荐:
- 贵州茅台 (600519.SH) - 白酒龙头，高ROE
- 腾讯控股 (00700.HK) - 互联网龙头
- 恒瑞医药 (600276.SH) - 创新药龙头
```

## Disclaimer

⚠️ **重要提示**:
- 本推荐仅供参考，不构成投资建议
- 投资有风险，入市需谨慎
- 请根据自身情况做出投资决策
- 过去表现不代表未来收益
