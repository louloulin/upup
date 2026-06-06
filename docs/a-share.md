# A 股 / Chinese-Market Features

> **UpUp is purpose-built for the Chinese A-share market, but works just as well for HK, US, and crypto.** This page covers the A-share-specific tooling, data sources, and conventions.

---

## Why A-share first?

UpUp (涨涨) was forked from [virattt/dexter](https://github.com/virattt/dexter), which targets US equities. The Chinese market has different conventions, data sources, and edge cases — so A-share is UpUp's primary focus:

- Different ticker format: `600519.SH` (Shanghai) vs `000001.SZ` (Shenzhen) vs `002594.SZ` (ChiNext)
- T+1 trading rule (no day-trade selling)
- 涨跌停板 (price limits): ±10% main board, ±20% ChiNext / STAR
- Different reporting cadence: 季报 + 半年报 + 年报, no quarterly US-style
- Different indices: 上证综指, 深证成指, 创业板指, 科创 50
- A-share-specific concepts: 限售股, 股权激励, 北向资金, 龙虎榜

---

## Data Sources (Priority Order)

UpUp automatically picks the best available source based on your env vars:

| Priority | Source | Setup | Coverage |
|---|---|---|---|
| 1 | **Tushare Pro** | `TUSHARE_TOKEN` env var | 5000+ A-share + HK + US + ETF + index + fund + futures + option |
| 2 | **AKShare** | None (auto) | A-share + HK + US + macro + futures + crypto + … 200+ data interfaces |
| 3 | **东方财富** (via web) | None (auto, via `browser` tool) | Real-time prices, news, 龙虎榜 |
| 4 | **Financial Datasets API** | `FINANCIAL_DATASETS_API_KEY` | US 10-K/10-Q, fundamentals |
| 5 | **Web search** | `EXASEARCH_API_KEY` or `TAVILY_API_KEY` | Anything else |

### Tushare token (recommended)

1. Register at https://tushare.pro
2. 完成实名认证 (real-name verification — required for premium data)
3. 个人中心 → 接口 TOKEN → copy to `.env`:

```env
TUSHARE_TOKEN=your_40_char_token
```

Free tier covers most fundamentals + daily prices. Premium unlocks minute bars, financial statements, fund holdings, etc.

### AKShare (zero-config fallback)

```bash
pip install akshare
```

UpUp auto-detects and uses it when Tushare is missing or rate-limited. AKShare's data is scraped from public sources — slower, but very comprehensive.

---

## A-Share-Specific Skills

| Skill | What it does |
|---|---|
| `a-share-analysis` | 标的画像 + 行业对比 + 资金流 + 风险 |
| `a-share-data` | Tushare / AKShare 工具调用封装 |
| `a-share-screening` | 多因子选股（PE/PB/ROE/营收增速/资金流…） |
| `a-share-filings` | 公告与监管文件检索（巨潮资讯） |
| `a-share-fund` | 公募/私募基金筛选与对比 |
| `a-share-market-structure` | 龙虎榜 / 大宗交易 / 融资融券 |
| `a-share-fund` (skill) | 基金产品分析与组合 |

Plus the 45+ other investment skills that work across markets.

---

## Ticker Conventions

| Market | Format | Example |
|---|---|---|
| 上证主板 | `XXXXXX.SH` | `600519.SH` (贵州茅台) |
| 深证主板 | `XXXXXX.SZ` | `000001.SZ` (平安银行) |
| 创业板 | `XXXXXX.SZ` | `300750.SZ` (宁德时代) |
| 科创板 | `XXXXXX.SH` | `688981.SH` (中芯国际) |
| 北证 | `XXXXXX.BJ` | `830799.BJ` |
| 港股 | `XXXX.HK` | `00700.HK` (腾讯) |
| 美股 | `TICKER` | `AAPL`, `TSLA` |
| 加密 | `TICKER-USD` | `BTC-USD` |

UpUp accepts bare `600519` or `贵州茅台` and resolves the canonical ticker automatically.

---

## Trading-Calendar Awareness

UpUp knows about:

- **A股交易日历** — 周末、节假日、调休 (e.g. 春节、国庆)
- **财报披露窗口** — 一季报 (4 月)、半年报 (8 月)、三季报 (10 月)、年报 (4 月)
- **解禁 / 减持窗口** — 大股东解禁、减持公告
- **指数调样** — 上证 50 / 沪深 300 / 中证 500 调整日
- **宏观数据发布** — CPI / PPI / PMI / M2 / 社融 / GDP

The KAIROS proactive runtime (`src/kairos/`) scans these and pushes notifications.

---

## Investment-Workflow Phases (A-share Examples)

### `/invest 600519.SH 2025Q3`

```
[Phase 1/5] detect    A 股个股深度研究 — 消费 / 白酒
[Phase 2/5] plan      财报 + 估值 + 行业 + 资金 + 风险 + 公告
[Phase 3/5] execute   Tushare 财务表 + AKShare 资金流 + 巨潮公告
[Phase 4/5] verify    Tushare vs 东财 财务数据交叉验证
[Phase 5/5] report    Markdown 报告 + 数据卡片 + 风险提示
```

### `/screen "PE<30 AND ROE>15% AND 营收增速>20%"`

```sql
-- (logical) 转译后:
SELECT code, name, pe_ttm, roe, revenue_yoy
FROM astock
WHERE pe_ttm < 30
  AND roe > 0.15
  AND revenue_yoy > 0.20
ORDER BY roe DESC
LIMIT 50
```

UpUp will return a markdown table with codes, names, and a one-line thesis for each.

### `/dossier 000001.SZ`

Generates a one-pager:

```
# 平安银行 (000001.SZ)

## 公司画像
- 成立：1987年
- 主营：商业银行业务
- 实际控制人：…
- 总股本：194 × 10⁹ 股
- 流通市值：…

## 财务速览 (2025 Q3)
| 指标 | 数值 | YoY |
|---|---|---|
| 营业收入 | 1234 亿 | -3.2% |
| 归母净利润 | 456 亿 | +1.8% |
| 不良率 | 1.06% | -5 bps |
| 拨备覆盖率 | 245% | +12 pp |

## 资金流 (近 30 日)
- 北向净流入：+12.3 亿
- 主力净流入：-3.4 亿
- 散户净流入：-8.9 亿

## 近期公告
- 2025-10-25：三季报披露
- 2025-09-12：发行 500 亿二级资本债

## 风险提示
- 净息差收窄
- 房地产敞口
- 监管政策

## 数据来源
- 财报：Tushare (income / balance / cashflow)
- 资金流：AKShare (北向 / 主力)
- 公告：巨潮资讯网
```

---

## A-Share-Specific Tools

Under `src/tools/finance/`:

| File | Purpose |
|---|---|
| `api.ts` | 通用金融数据 API 入口 |
| `stock-price.ts` | 日 / 周 / 月 / 分钟 K 线 |
| `fundamentals.ts` | 三大报表 + 关键指标 |
| `get-financials.ts` | 财报历史 + TTM |
| `insider_trades.ts` | 高管 / 大股东增减持 |
| `screen-stocks.ts` | 多因子选股 |
| `key-ratios.ts` | PE / PB / ROE / 杠杆 / 流动性 |
| `news.ts` | 个股新闻 + 公告 |
| `filings.ts` + `read-filings.ts` | 巨潮公告抓取与解析 |
| `earnings-transcripts.ts` | 业绩说明会纪要（如有） |
| `segments.ts` | 业务分部 |
| `estimates.ts` | 一致预期 |
| `crypto.ts` | 加密货币（数字货币板块） |

---

## Gotchas

- **复权方式** — Tushare 默认返回前复权 (`adj='qfq'`)，查询时注意
- **ST 股票** — 涨跌停为 ±5%，UpUp 在 risk 模块会标记
- **停牌 / 退市** — KAIROS 会告警；查询会返回空数据 + 解释
- **新上市股票** — 上市首日不设涨跌幅，UpUp 在回测中会标记
- **北交所** — `8XXXXX.BJ`，部分接口（Tushare）需要升级积分

---

## See Also

- [docs/investment-workflow.md](./investment-workflow.md) — 5-phase workflow deep dive
- [docs/commands.md](./commands.md) — all 47+ slash commands
- [docs/skills.md](./skills.md) — all 50+ skills
- [Tushare docs](https://tushare.pro/document/2)
- [AKShare docs](https://akshare.akfamily.xyz)

---

<p align="center"><strong>UpUp — A-share 研究，因你而快。</strong></p>
