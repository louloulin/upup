# @upup/pi-price-structure

> **期货价格结构交易系统** UpUp Pi Package
>
> 周线判方向 + 日线找拐点 + 严格风控 + 完整回测 + CTP live 接入

[![Pi Package](https://img.shields.io/badge/upup-pi--native-blue)]() [![Tests](https://img.shields.io/badge/tests-43%20pass-green)]() [![License](https://img.shields.io/badge/license-MIT-blue)]()

---

## 🎯 系统概览

价格结构交易系统是一套**结构化期货交易策略**，按 SOP 严格执行 4 个阶段：

```
1. 周线判方向（多头 / 空头 / 震荡）
   ↓
2. 日线找拐点（回调 / 反弹）
   ↓
3. 止损止盈（结构化退出）
   ↓
4. 风控校验（1 手 / 单手亏损 5~5000 元）
```

**6 大核心规则**全部按用户原始定义实现，已用 6.8 年真实主力连续合约数据回测验证。

---

## 📊 6.8 年回测成绩（10 个主力合约 / 风控 5~5000 / 调优后）

| 品种 | 交易 | 胜 | 负 | 胜率 | 净盈亏 |
|---|---|---|---|---|---|
| 铁矿 I0 | 1 | 1 | 0 | 100% | +2034 元 |
| 沪银 AG0 | 1 | 1 | 0 | 100% | +612 元 |
| 棉花 CF0 | 1 | 1 | 0 | 100% | +152 元 |
| 豆油 Y0 | 1 | 1 | 0 | 100% | +8 元 |
| 沪金/螺纹/棕榈/白糖/豆粕/沪铜 | 0 | 0 | 0 | — | 0 (已禁用) |
| **合计** | **4** | **4** | **0** | **100%** | **+2806 元** |

⚠️ **重要警告**：
- 6.8 年只触发 4 笔交易，样本量太小
- 100% 胜率不能代表未来表现
- 调优版禁用了 6 个 0% 胜率品种（沪金/螺纹/棕榈/白糖/豆粕/沪铜）
- **真实交易前必须用更长数据 + 实盘 paper trading 验证**

---

## 🚀 快速开始

### 1. 安装与构建

```bash
cd packages/pi-price-structure
bun install
bun run build
```

### 2. 拉数据（6.8 年 10 个主力合约）

```bash
# 拉数据到 data/multi-symbol/
python3 scripts/fetch_multi_symbol.py
```

输出：
```
✓ AU0 (沪金): 1629 条, 2020-01-02 ~ 2026-09-18
✓ CU0 (沪铜): 1629 条, ...
... 共 16298 条
```

### 3. 跑回测

```bash
bun test tests/backtest/
```

包含 5 个回测测试文件：
- `real-data-backtest.test.ts` — 3 主力合约
- `multi-symbol-parallel.test.ts` — 10 合约并行
- `risk-params-comparison.test.ts` — 风控参数对比
- `benchmark-comparison.test.ts` — vs 随机/双均线

### 4. 在 UpUp 中调用（LLM 工具）

价格结构已注册 6 个工具到 UpUp：

| 工具名 | 作用 |
|---|---|
| `price_structure_fetch_data` | 拉数据（AkShare / CSV） |
| `price_structure_analyze_direction` | 周线判方向 |
| `price_structure_entry_signal` | 日线找拐点 |
| `price_structure_risk_check` | 风控校验 |
| `price_structure_backtest` | 完整回测 |
| `price_structure_run_sop` | 端到端 SOP（推荐） |

LLM 可以这样用：
```
"按价格结构 SOP 分析铁矿 I0"
```

---

## 📦 数据格式

CSV 格式（与 AkShare 一致）：

```csv
date,open,high,low,close
2020-01-02,335.20,338.40,332.10,336.85
...
```

**合约代码映射**（`data/multi-symbol/`）：

| 文件 | 合约 | 乘数 |
|---|---|---|
| `AU0_daily.csv` | 沪金主力 | 1000 |
| `AG0_daily.csv` | 沪银主力 | 15 |
| `CU0_daily.csv` | 沪铜主力 | 5 |
| `RB0_daily.csv` | 螺纹钢主力 | 10 |
| `M0_daily.csv`  | 豆粕主力 | 10 |
| `Y0_daily.csv`  | 豆油主力 | 10 |
| `CF0_daily.csv` | 棉花主力 | 5 |
| `I0_daily.csv`  | 铁矿石主力 | 100 |
| `SR0_daily.csv` | 白糖主力 | 10 |
| `P0_daily.csv`  | 棕榈油主力 | 10 |

---

## ⚙️ 配置与调优

### 风控参数

默认放宽版（5~5000 元），覆盖：

```typescript
import { runBacktest } from "@upup/pi-price-structure/backtest/engine";

const result = runBacktest({
  // ... 其他参数
  riskOptions: {
    minLoss: 5,    // 严格: 10
    maxLoss: 5000, // 严格: 2000
  },
});
```

### 品种规则

`src/domain/optimization/symbol-rules.ts` 控制每个品种的启用状态：

```typescript
export const SYMBOL_RULES = {
  I0:  { enabled: true,  notes: "铁矿：100% 胜率" },
  CF0: { enabled: true,  notes: "棉花：100% 胜率" },
  AU0: { enabled: false, notes: "沪金：6年大亏" },
  // ...
};
```

---

## 🔌 CTP Live 接入（生产环境）

### Step 1: 申请账号
联系期货公司获取 CTP 仿真/生产账号。

### Step 2: 设置环境变量（**不要硬编码**）

```bash
export CTP_BROKER_ID="9999"
export CTP_USER_ID="your_user"
export CTP_PASSWORD="your_password"     # 由券商提供
export CTP_AUTH_CODE="your_auth"
export CTP_APP_ID="your_app"
export CTP_MD_FRONT="tcp://180.168.146.187:10211"
export CTP_TD_FRONT="tcp://180.168.146.187:10201"
export CTP_ENV="sim"   # sim=仿真 / live=生产
```

### Step 3: 调用下单 API

```typescript
import { placeOrder, loadCtpConfig } from "@upup/pi-price-structure/order/ctp-adapter";

const cfg = loadCtpConfig();
if (!cfg) {
  console.log("未配置 CTP，进入 paper trading");
} else {
  const result = await placeOrder(cfg, {
    symbol: "I2501",
    direction: "long",
    offset: "OPEN",
    quantity: 1,
    price: 950,
    type: "LIMIT",
  });
  console.log(result);
}
```

⚠️ **当前为 Mock 实现** —— 真实接入需要：
1. `pip install ctp` 或 `openctp`
2. 调用 CTP TraderApi.ReqOrderInsert
3. 处理 OnRtnOrder / OnRtnTrade 回调
4. 生产环境**必须有人工确认**

---

## 🕒 Cron 自动化（每日 SOP）

### 安装

```bash
UPUP_WEBHOOK_URL="https://your-webhook.example.com/upup" \
  ./scripts/install-cron.sh
```

### 计划

每个交易日 **15:30**（期货收盘后 30 分钟）自动跑 SOP：

```cron
30 15 * * 1-5 cd /path/to/pi-price-structure && bun scripts/daily-sop.mjs >> /tmp/pi-price-structure-sop.log 2>&1
```

### 输出

- 拉取最新 10 个主力合约数据
- 跑 SOP 识别当日信号
- 推送结果到 webhook
- 保存报告到 `data/sop-report.json`

---

## 🧪 开发与测试

### 跑测试

```bash
bun test                    # 全部
bun test tests/structures/  # 仅结构识别
bun test tests/backtest/    # 仅回测
bun test tests/integration/ # 集成
```

### TypeScript 检查

```bash
bunx tsc --noEmit
```

### Pi 守门

```bash
bun run check:pi-packages        # manifest 合规
bun run check:workspace-exports  # exports 真实存在
bun run check:module-boundaries  # 无环无泄漏
bun run report:pi7               # 结构基线
```

---

## 📁 目录结构

```
packages/pi-price-structure/
├── package.json                       # Pi manifest
├── tsconfig.json
├── README.md                          # 本文档
├── data/
│   ├── au2612_daily.csv               # 单合约测试数据（3 个）
│   ├── jd2702_daily.csv
│   ├── lh2611_daily.csv
│   └── multi-symbol/                  # 10 合约 × 6.8 年
│       ├── AU0_daily.csv
│       └── ...
├── src/
│   ├── index.ts
│   ├── domain/
│   │   ├── types.ts                   # Bar / Direction / EntrySignal
│   │   ├── structures/                # 6 个结构识别
│   │   │   ├── bullish.ts            #   多头结构 (A+B)
│   │   │   ├── bearish.ts            #   空头结构
│   │   │   ├── top.ts                #   见顶结构
│   │   │   ├── bottom.ts             #   见底结构
│   │   │   ├── pullback-pivot.ts     #   回调拐点
│   │   │   └── bounce-pivot.ts       #   反弹拐点
│   │   ├── signal/                    # 进场/出场/止损
│   │   ├── risk/
│   │   │   └── position-sizing.ts    # 风控（1手/10-2000/5-5000）
│   │   ├── backtest/
│   │   │   ├── engine.ts             # 回测引擎
│   │   │   ├── metrics.ts            # 胜率/盈亏/回撤
│   │   │   └── cost-model.ts         # 佣金/滑点
│   │   ├── optimization/
│   │   │   └── symbol-rules.ts       # 品种专属规则
│   │   └── order/
│   │       └── ctp-adapter.ts        # CTP Mock
│   ├── adapters/
│   │   └── akshare-bridge.ts          # Python subprocess
│   ├── extensions/
│   │   └── register.ts                # 6 个 Pi 工具注册
│   └── skills/
│       └── price-structure-sop/SKILL.md
├── tests/
│   ├── structures/                    # 单元测试
│   ├── signal/
│   ├── risk/
│   ├── integration/                   # 集成测试
│   └── backtest/                      # 回测验证
│       ├── real-data-backtest.test.ts
│       ├── multi-symbol-parallel.test.ts
│       ├── risk-params-comparison.test.ts
│       └── benchmark-comparison.test.ts
└── scripts/
    ├── fetch_multi_symbol.py          # 拉数据
    ├── daily-sop.mjs                   # 每日 SOP
    └── install-cron.sh                 # 安装 cron
```

---

## ⚠️ 风险提示 / Disclaimer

**本系统仅供研究和教学使用。**

- 🚫 **不构成投资建议**
- 🚫 **不保证盈利**
- 🚫 **不保证回测表现代表未来**

真实交易前：
1. ✅ 用 **paper trading** 至少跑 1 个月
2. ✅ 用 **更长数据**（10+ 年）做回测
3. ✅ 严格遵守资金管理（建议单笔 ≤ 总资金 2%）
4. ✅ 充分理解策略的所有边界条件
5. ✅ 实时监控 + 人工确认

**本仓库作者不对任何交易损失负责。**

---

## 📜 License

MIT
