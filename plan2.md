# Dexter A 股支持完整改造计划 (Pure TypeScript)

> 更新: 2026-05-06 | 状态: Phase 1-5 已完成 ✅ | Phase 6-7 待实施

---

## 一、完整架构图 (ASCII)

```
╔══════════════════════════════════════════════════════════════════════╗
║                           DEXTER 架构全景                            ║
╚══════════════════════════════════════════════════════════════════════╝

                              ┌─────────────────┐
                              │   User Query     │
                              │ "分析比亚迪"     │
                              │ "贵州茅台的PE"   │
                              └────────┬────────┘
                                       │
                                       ▼
╔══════════════════════════════════════════════════════════════════════╗
║ 1. LAYER: AGENT LOOP (src/agent/agent.ts)                        ║
║    buildSystemPrompt → streamLlm → executeTools → handleResponse   ║
╚══════════════════════════════════════════════════════════════════════╝
                    │                    │                    │
                    │ tools description   │ skills description  │ memory
                    ▼                    ▼                    ▼
╔══════════════════════════════════════════════════════════════════════╗
║ 2. LAYER: TOOL REGISTRY (src/tools/registry.ts)                   ║
║                                                                          ║
║  ┌─────────────────────────────────────────────────────────────┐         ║
║  │  US STOCK TOOLS (api.financialdatasets.ai)                  │         ║
║  │  get_financials | get_market_data | read_filings          │         ║
║  │  stock_screener                                            │         ║
║  └─────────────────────────────────────────────────────────────┘         ║
║                              │                                        ║
║                              ▼                                        ║
║  ┌─────────────────────────────────────────────────────────────┐         ║
║  │  A-SHARE + HK TOOLS (NEW - Pure TypeScript)               │         ║
║  │                                                              │         ║
║  │  get_astock_price        ←── Real-time + Historical price  │         ║
║  │  get_astock_financials  ←── Income/Balance/Cashflow      │         ║
║  │  get_astock_news         ←── Announcements/News           │         ║
║  │  screen_astocks          ←── Filter by PE/ROE/MarketCap  │         ║
║  │  get_sector_data         ←── Industry/Concept boards       │         ║
║  │  get_technical_data      ←── K-line/MA/MACD/RSI          │         ║
║  │  get_market_structure    ←── Dragon-tiger/HSGT/Flow      │         ║
║  └─────────────────────────────────────────────────────────────┘         ║
╚══════════════════════════════════════════════════════════════════════╝
                                       │
                                       ▼
╔══════════════════════════════════════════════════════════════════════╗
║ 3. LAYER: DATA SOURCE ROUTER (src/utils/stock-code.ts)             ║
║                                                                          ║
║  Input: "比亚迪" / "002594.SZ" / "00700.HK" / "AAPL"              ║
║                              │                                        ║
║          ┌──────────────────┼──────────────────┐                      ║
║          │                  │                  │                      ║
║          ▼                  ▼                  ▼                      ║
║    ┌──────────┐     ┌──────────┐     ┌──────────┐                  ║
║    │  A-SHARE │     │    HK    │     │    US    │                  ║
║    │ 6-digit  │     │ 5-digit  │     │ Ticker   │                  ║
║    │ 600xxx   │     │ HK00700  │     │ AAPL     │                  ║
║    │ 000xxx   │     │ 1211.HK  │     │ TSLA     │                  ║
║    │ 002xxx   │     └────┬─────┘     └────┬─────┘                  ║
║    │ 300xxx   │          │               │                          ║
║    │ 688xxx   │          │               │                          ║
║    └────┬─────┘          │               │                          ║
║         │                ▼               ▼                          ║
╚══════════════════════════════════════════════════════════════════════╝
                                       │
                                       ▼
╔══════════════════════════════════════════════════════════════════════╗
║ 4. LAYER: DATA SOURCE STACK (Pure TypeScript HTTP, No npm packages)  ║
║                                                                          ║
║  ┌─────────────────────────────────────────────────────────────┐         ║
║  │  tushare-client.ts  (TUSHARE_TOKEN required)               │         ║
║  │  Direct HTTP POST to api.tushare.pro                        │         ║
║  │                                                             │         ║
║  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │         ║
║  │  │ daily/weekly │ │ income/      │ │ top_list/    │       │         ║
║  │  │ monthly K-line│ │ balancesheet/ │ │ hsgt_top10/  │       │         ║
║  │  │              │ │ cashflow     │ │ moneyflow    │       │         ║
║  │  └──────────────┘ └──────────────┘ └──────────────┘       │         ║
║  │                                                             │         ║
║  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │         ║
║  │  │ announcement │ │ stock_basic/ │ │ margin_detail│       │         ║
║  │  │ (公告)       │ │ concept_detail│ │ (融资融券)   │       │         ║
║  │  │              │ │ (概念板块)   │ │              │       │         ║
║  │  └──────────────┘ └──────────────┘ └──────────────┘       │         ║
║  └─────────────────────────────────────────────────────────────┘         ║
║                              │                                        ║
║                              ▼                                        ║
║  ┌─────────────────────────────────────────────────────────────┐         ║
║  │  realtime-client.ts  (No API key required)                 │         ║
║  │                                                             │         ║
║  │  ┌──────────────┐ ┌──────────────┐                         │         ║
║  │  │ Tencent       │ │ Sina         │                         │         ║
║  │  │ qt.gtimg.cn   │ │ hq.sinajs.cn │                         │         ║
║  │  │ 实时行情     │ │ 实时行情     │                         │         ║
║  │  └──────────────┘ └──────────────┘                         │         ║
║  └─────────────────────────────────────────────────────────────┘         ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## 二、研究发现

### 实际方案: 纯 TS HTTP 直调 (零 npm 依赖)

| 数据源 | 实现方式 | API Key | 说明 |
|--------|---------|---------|------|
| Tushare Pro | `fetch()` POST to `api.tushare.pro` | ✅ TUSHARE_TOKEN | 历史K线/财报/龙虎榜/公告 |
| 腾讯行情 | `fetch()` GET `qt.gtimg.cn` | ❌ | 实时行情 fallback |
| 新浪行情 | `fetch()` GET `hq.sinajs.cn` | ❌ | 实时行情 fallback |

> **Note**: npm packages `@hestudy/tushare-sdk`, `stock-sdk`, `stock-api` returned 403 from registry.
> Built pure TypeScript HTTP client instead - zero external dependencies, more reliable.

---

## 三、真实实施计划

### Step 1: 纯 TS HTTP 客户端 (无 npm 依赖)

**文件**: `src/tools/astock/tushare-client.ts`

```typescript
// 纯 TS HTTP 直调 Tushare Pro API，无外部依赖
export class TushareClient {
  private async call(apiName, params, fields?) {
    const response = await fetch('http://api.tushare.pro', {
      method: 'POST',
      body: JSON.stringify({ api_name: apiName, token: this.token, params }),
    });
    return response.json();
  }
  async daily(params) { return this.call('daily', params); }
  async income(params) { return this.call('income', params); }
  // ... 20+ API methods
}
```

**文件**: `src/tools/astock/realtime-client.ts`

```typescript
// 腾讯/新浪实时行情，无 API Key
export async function getRealtimeQuote(symbol: string) {
  const res = await fetch(`https://qt.gtimg.cn/q=${symbol}`);
  // 解析腾讯行情数据格式
}
```

### Step 2: 实现工具

| 工具 | 文件 | 数据源 | 状态 |
|------|------|--------|------|
| `get_astock_price` | `get-astock-price.ts` | Tushare + Tencent/Sina | ✅ 已实现 |
| `get_astock_financials` | `get-astock-financials.ts` | Tushare | ✅ 已实现 |
| `get_astock_news` | `get-astock-news.ts` | Tushare | ✅ 已实现 |
| `screen_astocks` | `screen-astocks.ts` | Tushare | ✅ 已实现 |
| `get_sector_data` | `get-sector-data.ts` | Tushare | ✅ 已实现 |
| `get_technical_data` | `get-technical-data.ts` | Tushare + 本地计算 | ✅ 已实现 |
| `get_market_structure` | `get-market-structure.ts` | Tushare | ✅ 已实现 |

### Step 3: 注册工具

**文件**: `src/tools/registry.ts`

```typescript
// 在 getToolRegistry 中添加:
{
  name: 'get_astock_price',
  tool: getAStockPrice,
  description: GET_ASTOCK_PRICE_DESCRIPTION,
  compactDescription: 'Real-time + historical price for A-share/HK stocks.',
  concurrencySafe: true,
},
// ... 其他 6 个工具
```

### Step 4: 自动路由

**文件**: `src/tools/finance/get-market-data.ts`

```typescript
// 在工具内部添加:
if (isAShare(input.ticker) || isHKStock(input.ticker)) {
  return getAStockPrice.run({ code: input.ticker });
}
// 否则走原有 US 数据源
```

---

## 四、完整 Todo List (已细化)

### Phase 1: 基础设施 ⭐ P0 ✅ DONE

- [x] **Step 1.1**: ~~`npm install @hestudy/tushare-sdk stock-sdk stock-api`~~ → 改为纯 TS HTTP 直调 (npm 包 403)
- [x] **Step 1.2**: 重写 `src/tools/astock/tushare-client.ts` (纯 TS HTTP POST to api.tushare.pro)
- [x] **Step 1.3**: 创建 `src/tools/astock/realtime-client.ts` (Tencent/Sina 实时行情)
- [x] **Step 1.4**: 更新 `src/utils/stock-code.ts` 公司名映射 (100+ 公司)
- [x] 删除 `scripts/astock-fetch.py` (不再需要 Python subprocess)

### Phase 2: 核心工具 ⭐ P0 ✅ DONE

- [x] **Step 2.1**: 重写 `src/tools/astock/get-astock-price.ts`
  - [x] Tushare daily/weekly/monthly K-line
  - [x] Fallback 到 Tencent/Sina 实时行情 (无 token)
  - [x] 支持 period 参数 (日K/周K/月K)

- [x] **Step 2.2**: 重写 `src/tools/astock/get-astock-financials.ts`
  - [x] 收入表 + 资产负债表 + 现金流量表

- [x] **Step 2.3**: 创建 `src/tools/astock/get-astock-news.ts`
  - [x] `client.announcement({ ts_code })` 公告
  - [x] `client.news()` 市场新闻

- [x] **Step 2.4**: 创建 `src/tools/astock/screen-astocks.ts`
  - [x] 按行业筛选 (`stock_basic`)

- [x] **Step 2.5**: 创建 `src/tools/astock/get-sector-data.ts`
  - [x] 行业/板块查询

- [x] **Step 2.6**: 创建 `src/tools/astock/get-technical-data.ts`
  - [x] K线数据 + MA5/MA10/MA20 + MACD + RSI

- [x] **Step 2.7**: 创建 `src/tools/astock/get-market-structure.ts`
  - [x] 龙虎榜 / 北向资金 / 资金流 / 融资融券

### Phase 3: 工具注册 ⭐ P0 ✅ DONE

- [x] **Step 3.1**: 更新 `src/tools/registry.ts` 注册所有 7 个 A 股工具
- [x] **Step 3.2**: 添加工具描述常量 (GET_ASTOCK_*_DESCRIPTION)
- [x] **Step 3.3**: 更新 compact 描述

### Phase 4: 自动路由 ⭐ P1 ✅ DONE

- [x] **Step 4.1**: 更新 `get-market-data.ts` 检测 A/HK 股自动路由
- [x] **Step 4.2**: 更新 `get-financials.ts` 检测 A/HK 股自动路由
- [x] **Step 4.3**: 更新 `src/agent/prompts.ts` 注入 A 股代码映射

### Phase 5: Skill 层 ⭐ P1 ✅ DONE

- [x] **Step 5.1**: 创建 `a-share-analysis` Skill (综合分析工作流)
  - [x] 触发词: "分析比亚迪", "A股分析", "analyze A-share"
  - [x] 工作流: 识别代码 → 并行获取数据 → 综合分析

### Phase 6: 搜索 ⭐ P2

- [ ] **Step 6.1**: 更新 `src/tools/search/index.ts` fallback 链
- [ ] **Step 6.2**: 添加 A 股新闻专用搜索

### Phase 7: 测试 ⭐ P2

- [ ] **Step 7.1**: 添加 A 股测试用例到 `src/evals/run.ts`
- [ ] **Step 7.2**: 手动测试: "分析比亚迪"
- [ ] **Step 7.3**: 手动测试: "帮我筛选 PE < 15 的 A 股"

---

## 五、文件清单

### 新增文件 (9 个) ✅ ALL CREATED

```
src/tools/astock/
├── tushare-client.ts        ✅ 纯 TS HTTP POST to api.tushare.pro
├── realtime-client.ts        ✅ Tencent/Sina 实时行情
├── get-astock-price.ts      ✅ 日/周/月 K线 + 实时行情
├── get-astock-financials.ts ✅ 三大报表 (利润表/资产负债表/现金流量表)
├── get-astock-news.ts       ✅ 公告 + 市场新闻
├── screen-astocks.ts        ✅ 行业/市值筛选
├── get-sector-data.ts       ✅ 行业/板块数据
├── get-technical-data.ts    ✅ MA/MACD/RSI 技术指标
└── get-market-structure.ts  ✅ 龙虎榜/北向/资金流/融资融券
```

### 修改文件 (3 个) ✅ ALL UPDATED

```
src/tools/registry.ts              ✅ 注册 7 个 A 股工具
src/utils/stock-code.ts            ✅ 100+ 公司名映射
.env.example                       ✅ TUSHARE_TOKEN 说明
```

### 删除文件 (1 个) ✅ DELETED

```
scripts/astock-fetch.py            ✅ Python subprocess 已删除
```

---

## 六、Tushare Pro API 端点映射

| 工具 | Tushare API | 返回字段 |
|------|------------|---------|
| `get_astock_price` | `daily` | date, open, high, low, close, vol, amount |
| `get_astock_financials` | `income` + `balancesheet` + `cashflow` | revenue, net_profit, total_assets... |
| `get_astock_news` | `announcement` + `news` | title, content, pub_date |
| `screen_astocks` | `stock_basic` | code, name, industry, market |
| `get_sector_data` | `concept_detail` + `industry_cons` | concept_name, stock_code |
| `get_technical_data` | `daily` (计算) | close, ma5, ma10, ma20, macd |
| `get_market_structure` | `top_list` + `hsgt_top10` + `moneyflow` | buy/sell, net_amount |

---

## 七、验证

### TypeScript 编译 ✅ PASS

```bash
npx tsc --noEmit
# 0 errors in src/ files (node_modules pre-existing warnings only)
```

### 功能验证 (需要网络访问)

```bash
# 设置 Tushare Token
echo "TUSHARE_TOKEN=your_token_here" >> .env

# 实时行情测试 (无需 Token)
npx tsx -e "
import { getRealtimeQuote, toTencentSymbol } from './src/tools/astock/realtime-client.ts';
getRealtimeQuote(toTencentSymbol('002594.SZ')).then(console.log);
"

# Tushare 历史数据测试 (需要 Token)
npx tsx -e "
import { TushareClient } from './src/tools/astock/tushare-client.ts';
const c = new TushareClient({ token: process.env.TUSHARE_TOKEN });
c.daily({ ts_code: '002594.SZ', trade_date: '20260506' }).then(console.log);
"
```

---

## 八、预期效果

**Before:**
```
分析比亚迪 → Exa 失败 → Web Fetch 403 → 达到最大迭代 → 失败
```

**After:**
```
分析比亚迪
  → get_astock_price({ code: '002594.SZ' })
    → Tushare: { close: 298.50, change: +2.3% }
  → get_astock_financials({ code: '002594.SZ' })
    → Tushare: { revenue: 602B, net_profit: 20B }
  → get_astock_news({ code: '002594.SZ' })
    → Tushare: { announcements: [...] }
  → 生成分析报告 ✅
```