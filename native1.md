# native1.md — LumosAI invest 代码复用与 Rust 加速开发计划

> 状态：**待实施**（本文件即本计划的唯一交付物与实施规格）
> 编写日期：2026-09-18
> 上游来源：`lumosai0713` @ `3eb2127b5`（`gitcode.com/lumosaigroup/lumosai` / `github.com/louloulin/LumosAI`）
> 本仓基线：`upup` @ `05bd556c5`
> 方法：所有「可复制」结论均由**实际编译验证**得出（临时 probe crate + path 依赖），所有基准数字均为**本机实测**，非估算。

---

## 0. 文档定位

UpUp 的性能优化此前已有两份材料：

- `yh.md` —— market-data / finance-sdk / session / storage 侧的性能缺陷实测（P1–P9，核心是每主机串行闸门）。
- 本文件 —— 聚焦**「LumosAI invest 的 Rust 代码能复制多少进 UpUp」**这一个问题，并把答案落成可执行的实施计划。

两者互补：`yh.md` 修的是**网络 IO 与调度**，本文件修的是**纯计算与记忆检索**，以及一个**中文分词正确性缺陷**。

---

## 1. 结论速览

### 1.1 回答「是否都可以 copy 过来」

**不是全部可复制，也不应该全部复制。** 两层判断：

1. **技术上能不能复制**——实测编译验证：invest 下 14 个 crate 中，**只有 `bridge` 依赖 LumosAI harness**（且 `lumosai_extension_api` 藏在 optional feature 之后），其余 13 个可脱离 LumosAI 独立编译。所以「技术可行性」不是瓶颈。
2. **该不该复制**——`datahub`（12,448 LOC）/ `domain`（18,463 LOC）/ `tools`（30,389 LOC）/ `bridge`（3,220 LOC）虽然能编译，但会引入 `reqwest` / `rusqlite` / `scraper` / `tokio`，并与 UpUp 现有的 TS 数据栈（`pi-market-data` / `pi-finance-sdk` / `pi-research`）**大面积重复**，属于纯粹的架构负债。**明确排除。**

**推荐复制范围 = 6 个纯数值 crate，约 7,100 LOC，零 IO、零网络、零数据库。**

选择依据是「与 UpUp 现有实现互补」，不是体量：

- `math`（909 LOC）是 UpUp **完全缺失**的线性代数底座（Cholesky / QR / solve / `ledoit_wolf_shrink`）。UpUp 的 `pi-quant` / `pi-risk` 全靠手写循环，没有矩阵求解能力。
- `optimizer`（1,389）/ `attribution`（361）/ `backtest`（2,985）补齐 UpUp **没有的能力**：Black-Litterman、Carino 平滑、TWR/MWR、真实 `walk_forward`、`bias_audit`。已验证 UpUp 中 `ledoit_wolf` / `black_litterman` / `walk_forward` / `bias_audit` / `carino` / `adx` 关键词均**零命中**。
- `factor_model`（859）与 `pi-quant` 同构，既作加速内核，也作对拍 oracle。
- `technical`（546）**只取算法、不取签名**（见 §5.3）。

### 1.2 最高优先级不是 Rust，是算法正确性

**发现三个真实缺陷（不只是性能问题）——`packages/memory` 下的三个 tokenizer 全部不支持中文。**

| # | 位置 | 正则 | 纯中文 tokenize 结果 | 后果 |
|---|---|---|---|---|
| T1 | `mmr.ts#tokenize`（:28） | `/[a-z0-9_]+/g` | **空集**（`size = 0`） | `jaccardSimilarity(∅, ∅) === 1` → **所有中文文档被判「完全相似」，MMR 多样性彻底失效** |
| T2 | `search.ts#TFIDFEmbedder.tokenize`（:272） | `/[^\w\s]/g` → 空格 | **空集** | 中文语料 **vocabulary size = 0**，embedding 恒为空向量 → `tfidfSearch` 中文**完全不可用** |
| T3 | `memvid-store.ts#tokenize`（:189） | `/[^\p{L}\p{N}_-]+/u` | **整句 1 个 token** | 中文变成"整句精确匹配"：查询空间几乎不可达，长文档查询几乎必然 0 命中 |

三者相互独立（不是同一个函数被复用的三处），必须**分别修复**。

#### T1 实测（`mmr.ts`）

| 输入 | 实测结果 |
|---|---|
| `tokenize('贵州茅台三季报营收同比增长毛利率白酒行业景气度边际改善')` | `size = 0` |
| `jaccardSimilarity(tokenize('贵州茅台…'), tokenize('宁德时代…'))` | `1`（不相关文档被判完全相同） |
| `jaccardSimilarity(tokenize('贵州茅台…'), tokenize('英伟达…'))` | `1` |
| 4 文档中文集（3 近重复 @1.00/0.98/0.96 + 1 不相似 @0.90），λ=0.7 | 顺序 `m0,m1,m2,m3` —— **多样性被完全忽略** |

#### T2 实测（`search.ts` TF-IDF）

| 语料 | vocabulary size | 查询 embedding |
|---|---|---|
| 中文 `['贵州茅台三季报营收增长','宁德时代动力电池出货量下滑']` | **0** | `[]`（恒空） |
| 英文 `['maotai revenue growth','catl battery shipments']` | 6 | `[0.5,0.5,0,0,0,0]` ✅ |

#### T3 实测（`memvid-store.ts`）

`scoreRecord` 用 `title.includes(term)` 子串匹配，因此中文查询**必须整句命中**：

| 查询 | 得分 |
|---|---|
| `贵州茅台`（与文档子串相同） | **4.000** |
| `贵州 茅台 营收`（空格分词） | 3.000 |
| `茅台营收增长`（语义完全匹配、字面错位） | **0.000** ❌ |

`tokenize('贵州茅台')` → `["贵州茅台"]`（整串未切分）。

#### 修复来源

`lumosai-agent-harness/src/memory/mmr.rs`（151 LOC，**零依赖**，仅 `use std::collections::HashSet`）的 CJK 感知 tokenizer（ASCII 词 + CJK unigram + CJK bigram，`is_cjk` 覆盖 `4E00-9FFF` / `3400-4DBF` / 平假名 / 片假名 / 谚文）。该文件已单独编译验证（0.62s）。

**三条修复必须先用纯 TS 落地（§4 P0），Rust 只是同一算法的加速副本。** UpUp 是中文优先产品，且记忆语料 100% 为中文——这不是边缘场景。

### 1.3 落地机制

napi-rs 预编译 `.node` + TS 静默回退。缺 `.node` 时退化为纯 TS，**功能等价、仅性能下降**。

---

## 2. 实测证据

### 2.1 复制可行性（逐个 crate 实际编译）

probe 方式：在 `/tmp/upup-rust-probe*` 建独立 crate，以 path 依赖指向 invest 目录，`cargo build` 实测。

| crate | LOC | 独立编译 | 编译耗时 | 引入依赖 |
|---|---|---|---|---|
| `math` | 909 | ✅ | 4.8s | `serde` `thiserror` |
| `technical` | 546 | ✅ | — | + `math` |
| `optimizer` | 1,389 | ✅ | — | + `math` |
| `attribution` | 361 | ✅ | — | `serde` `thiserror` |
| `factor_model` | 859 | ✅ | — | + `math` |
| `backtest` | 2,985 | ✅ | 5.4s | + `math` `chrono` |
| `types` | 3,056 | ✅ | — | `serde` `chrono` |
| `runtime` | 309 | ✅ | — | `dirs` `log` |
| `datahub` | 12,448 | ✅ | 17.9s | `reqwest` `rusqlite` `scraper` `tokio` |
| `domain` | 18,463 | ✅ | 17.9s（合并） | `rusqlite` |
| `tools` | 30,389 | ✅ | 36.1s | 全量传递依赖 |
| `bridge` | 3,220 | ⚠️ | — | `lumosai_extension_api`（optional feature）—— **唯一 harness 耦合点** |
| `analytics` | — | 排除 | — | `duckdb`（bundled 编译峰值 ~2.6GB 磁盘） |
| `sdk` | — | 排除 | — | facade crate |

**关键发现：除 `bridge` 外，invest 没有任何 crate 依赖 LumosAI harness。** 即「LumosAI 的 invest 域」在架构上本就是一个可独立剥离的纯 Rust 数值库——这正是它可以被 UpUp 复用的根本原因。

### 2.2 性能基准（验收基线）

| 热点 | 现状 | 目标 |
|---|---|---|
| MMR 重排 n=200 / 500 / 1000 | 981ms / 10.2s / 78.8s | <20ms / <50ms / <100ms |
| 向量全扫 20k×1536 | 454ms | <20ms |
| Memvid BM25 20k 条 | 270ms | <10ms |
| 技术指标 20k bars（MACD / KDJ / BOLL） | 4.5 / 4.2 / 8.6ms | <1ms |
| Spearman IC 800 标的 × 500 期 | 125ms | <15ms |
| IC 序列 800×500（250 期 Spearman） | 403ms | <40ms |
| `scoreUniverse` 5000×6 因子 | 16.7ms | <3ms |
| 启动总计 | ~2.7s | <1.2s |
| ecosystem mount | 2.18s | <700ms |

> MMR 现状的 78.8s（n=1000）说明**当前瓶颈是算法复杂度 O(n²) 而非 JS 本身**。这也是为什么 §4 P0 必须先行。

---

## 3. 复制清单与排除项

### 3.1 复制（6 个 crate → `crates/`）

| crate | LOC | `#[test]` 数 | 处置 |
|---|---|---|---|
| `math` | 909 | 17 | 原样复制 |
| `technical` | 546 | 10 | 原样复制；**调用时只取算法，不取返回值形状** |
| `optimizer` | 1,389 | 16 | 原样复制 |
| `attribution` | 361 | 7 | 原样复制 |
| `factor_model` | 859 | 11 | 原样复制 |
| `backtest` | 2,985 | 30 | 原样复制 |

合计 **7,049 LOC / 91 个内联单测**。6 个 crate 均为 `src/` 单层结构（无 `tests/` 目录、无 `build.rs`、无 `vendor/`），复制面干净。

### 3.2 排除项与理由

| 排除对象 | 理由 |
|---|---|
| `types` `runtime` | 与 UpUp 自有 TS 类型（`@upup/types` / `@upup/pi-market-data` 的 `IndicatorBar` 等）重复；只为 native 层引入 `chrono` / `dirs`。native 层需要的 `Bar` 等结构**在 Rust 内本地定义**（见 §5.1）。 |
| `datahub` `domain` | 与 `pi-market-data` / `pi-finance-sdk` / `pi-research` 大面积重复；引入 `reqwest` / `rusqlite` / `scraper` / `tokio`，把纯数值库污染成 IO 库。 |
| `tools` `bridge` `analytics` `sdk` | `bridge` 是唯一 harness 耦合点；`tools` 的 416 个 `invest__*` 工具命名空间与 UpUp 的 280 个工具**零交集**，无复用价值；`analytics` 的 DuckDB bundled 编译峰值 ~2.6GB，与 UpUp 现有 `pi-portfolio/src/duckdb.ts` 职责重叠。 |

### 3.3 落地规范：workspace shim

6 个 crate 全部使用 `license.workspace = true` / `authors.workspace = true` / `repository.workspace = true` / `edition.workspace = true` / `[lints] workspace = true` 以及 `serde.workspace = true` 等继承写法。**不能逐 crate 改写**（否则每次上游同步都要手工重写），而是新建独立 Cargo workspace 补齐继承源。

**已实测验证：补齐 shim 后零源码改动即可编译通过**（用 `math` + `technical` + `backtest` 三 crate 实测，`cargo build -p lumosai-extension-invest-backtest` → `Finished dev profile in 6.87s`，退出码 0）。

目录结构：

```
upup/
├── Cargo.toml              # 新增：独立 workspace 根
├── crates/
│   ├── .cargo/config.toml  # 新增：macOS 链接参数（见 §8.2）
│   ├── README.md           # 新增：上游 commit + 同步方式
│   ├── math/               # 逐字复制
│   ├── technical/
│   ├── optimizer/
│   ├── attribution/
│   ├── factor_model/
│   ├── backtest/
│   └── pi-native-core/     # 新增：napi-rs 绑定层（§5）
└── packages/pi-native-core/  # 新增：TS 包壳（§5.1）
```

根 `Cargo.toml` 必须包含三节（缺任一节都会在 manifest 解析阶段硬失败，报 `error inheriting ... from workspace root manifest's workspace...`）：

```toml
[workspace]
members = ["crates/math", "crates/technical", "crates/optimizer",
           "crates/attribution", "crates/factor_model", "crates/backtest",
           "crates/pi-native-core"]
resolver = "2"

# 迁移自 lumosai Cargo.toml @ 3eb2127b5 [workspace.package]
[workspace.package]
license = "MIT"
authors = ["lumosai"]
repository = "https://github.com/louloulin/LumosAI"
edition = "2021"

# 迁移自 lumosai Cargo.toml @ 3eb2127b5 [workspace.dependencies]（仅取被复制 crate 用到的子集）
[workspace.dependencies]
serde = { version = "1.0", features = ["derive", "rc"] }
serde_json = "1.0"
chrono = { version = "0.4", features = ["serde"] }

# 迁移自 lumosai Cargo.toml @ 3eb2127b5 [workspace.lints.clippy]（全量 39 条 allow）
[workspace.lints.clippy]
# ... 39 条逐字照抄，勿增删
```

**约束**：

- 源码与各 crate 的 `Cargo.toml` **逐字保留**，唯一改动是在根 `Cargo.toml` 提供继承源。
- **不复制** `[patch.crates-io]`（那条 `strong-xml` vendor 补丁只服务于被排除的 `docx` 依赖链）。
- `crates/README.md` 必须记录上游 commit hash（`3eb2127b5`）、同步命令、以及「本目录文件禁止手工修改，改动一律走上游 + 重新同步」的规则。
- `cargo build -p lumosai-extension-invest-math` 必须**离线可跑**（无 git/db 依赖）。
- `crates/` 与 `packages/` **物理隔离**：Rust 产物不参与 `bun install`。

新增 release profile（性能关键，复制默认值会失去跨 crate 内联）：

```toml
[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1
strip = "symbols"
panic = "unwind"
incremental = false
```

---

## 4. P0 —— 算法修正（独立于 Rust，先行落地）

**这一阶段不依赖 Rust，可立即执行，且收益最高。**

### 4.1 新增共享 CJK tokenizer（修复 T1 / T2 / T3）

- **新增一个内部共享模块**（如 `packages/memory/src/cjk-tokenize.ts`），导出两套切分策略，供三处复用：
  - `tokenizeToSet(text): Set<string>` —— 用于 T1（Jaccard）。ASCII 词 + CJK unigram + CJK bigram。
  - `tokenizeToTerms(text): string[]` —— 用于 T2 / T3（词频 / 子串匹配）。在 set 的基础上返回数组形式。
- `is_cjk` 覆盖：`4E00-9FFF`（统一表意文字）、`3400-4DBF`（扩展 A）、`3040-309F`（平假名）、`30A0-30FF`（片假名）、`AC00-D7AF`（谚文音节）。
- 参照实现：`lumosai-agent-harness/src/memory/mmr.rs`。
- **T1 —— `mmr.ts#tokenize`**：改为调用共享 `tokenizeToSet`。**保留 `jaccardSimilarity(∅, ∅) === 1` 的现有语义不动**——只修「中文不再落入空集」，不改英文路径行为。注意上游 ASCII 词要求 `word.len() > 1`，而 UpUp 当前正则会收单字符；**UpUp 侧保持现行为，只追加 CJK 分支**，避免改变既有英文结果。
- **T2 —— `search.ts#TFIDFEmbedder.tokenize`**：改为调用共享 `tokenizeToTerms`。**保留 `w.length > 2` 与 `TFIDF_STOP_WORDS` 过滤**，只让中文不再产出空集。修复后中文语料 vocabulary 必须非空。
- **T3 —— `memvid-store.ts#tokenize`**：改为调用共享 `tokenizeToTerms`。**保留 `term.length > 1` 过滤**。修复后 `tokenize('贵州茅台')` 必须切出多个 CJK token，使 `茅台营收增长` 这类字面错位但语义匹配的查询能命中。

### 4.2 `packages/memory/src/mmr.ts` — 复杂度

- 每轮重扫全部 `remaining` 改为**增量维护 `maxSim` 上界 + 提前剪枝**。
- token set 只算一次并缓存（当前已在 `tokenCache`，需确认无重复 tokenize 路径）。
- 保持排序与 tie-break 语义不变。

### 4.3 `packages/memory/src/memvid-store.ts` — 倒排索引

- `initialize()` 时建倒排索引（`term → recordIds`）。
- `rank()` 走倒排取交集候选，**只对候选打分排序**；不再每次查询重建全量 tokenize 字符串（当前 `scoreRecord` 每次查询对每条记录重复 `tokenize(title/content/tags)` 三遍）。
- 与 §4.1 T3 是**同一文件的两处独立改动**，需一并落地。

### 4.4 `packages/memory/src/database.ts#searchVector` — 去物化

- 去掉 `Array.from(Float32Array)` 物化（当前 `fromBlob` 会为每行分配一个 JS `number[]`）。
- 直接在 `Float32Array` 视图上算 cosine。
- 一次性预取列并按行流式打分，避免 20k×1536 的 intermediate 数组。

### 4.5 `packages/pi-quant/src/factors.ts` — 消除重复排序

15 处 `[...bars].sort((a, b) => a.date.localeCompare(b.date))`（行号 37/45/54/63/72/81/90/99/109/125/134/143/153/172/221）改为调用方排序一次或索引化访问；`computeAllFactors` 复用单次排序结果。

### 4.6 `packages/pi-quant/src/ic.ts` — 索引排序

`rank()` 的 `{v, i}` 对象数组排序改为索引排序，消除 500 期 × 800 标的的对象分配。

> ⚠️ `correlation()` 中 Spearman 的并列判定当前是**严格 `===`**（`indexed[j+1].v === indexed[i].v`）。这是 UpUp 的既有契约，**Rust 侧必须与之逐位一致**（上游 LumosAI 用 `abs() < 1e-12`，不可照抄）。详见 §5.3。

---

## 5. P1 —— Rust 加速第一批（量化计算）

### 5.1 结构

新增 **`packages/pi-native-core`**（napi-rs，`crate-type = ["cdylib"]`），Rust 侧依赖 §3.1 的 6 个 vendored crate。

它**不引入** `types` / `runtime`，因此自带的入参结构在 Rust 内本地定义：

```rust
// crates/pi-native-core/src/types.rs
#[napi(object)]
pub struct NativeBar { pub open: f64, pub high: f64, pub low: f64, pub close: f64, pub volume: f64 }
```

**对外仍是 Pi Package**，遵守 AGENTS.md「新增业务代码必须以 Pi Package 形式接入」：`packages/pi-native-core/package.json` 声明 `exports`（带 `"bun": "./src/*.ts"` 条件）、`pi` manifest 块（**不新增任何 tool**）、`files` 含 `!dist/*.node`。

### 5.2 导出面（严格限定为纯数值函数）

入参 `Float64Array`，出参 `Float64Array`。

| 类别 | 函数 |
|---|---|
| 统计 / 线性代数 | `pearson` `spearman` `rank` `zscore` `winsorize` `regress` `solve` `cholesky` `qr` `computeFactorStats` `scoreUniverse` |
| 技术指标（**全序列**） | `sma` `ema` `macd` `kdj` `boll` `atr` `rsi` `obv` `cci` `adx` |
| 回测 | `runFactorBacktest` 主循环、`maxDrawdown`、`sharpe`、`sortino`、`walk_forward`、`bias_audit` |
| 组合 | `risk_parity` `min_vol` `max_sharpe` `markowitz` `black_litterman`、`brinson` `carino` `twr` `mwr` |

TS 侧新增统一 loader（**不新增对外导出**，满足 `check:no-self-impl`）：

- `packages/pi-quant/src/native.ts`
- `packages/pi-technical/src/native.ts`

语义：`try { require('@upup/pi-native-core') } catch { fallback to TS }`，每次调用做形状/前缀校验；失败即**整体回退 TS**（fail-open，因为结果等价）。

### 5.3 三条必须遵守的一致性红线

**现有 TS 实现全部保留**为回退路径与对拍 oracle。以下三条是实测发现的、**照抄上游就会破坏逐位一致**的陷阱：

#### 红线 1 —— 取算法，不取返回值形状

LumosAI `technical::macd` 返回**最新标量**：

```rust
pub struct MacdResult { pub dif: f64, pub dea: f64, pub hist: f64 }
```

UpUp `computeMACD` 返回**全序列**：

```ts
export interface MACDResult { readonly dif: (number|null)[]; readonly dea: (number|null)[]; readonly histogram: (number|null)[]; }
```

同理 `sma` / `ema` / `bollinger` 上游都是 `Option<f64>`（最新值），UpUp 全是全序列。**实现必须按 UpUp 契约输出全序列**，不得照搬上游返回值形状。

> 一致性点（已核对）：`bollinger` 上游用总体方差（`/ n`），与 UpUp `computeBOLL` 一致。`histogram = (dif - dea) * 2` 两边一致。

#### 红线 2 —— 取算法，不取并列判定语义

LumosAI `spearman_corr` 用 `abs() < 1e-12` 判并列；UpUp `ic.ts#rank` 用**严格 `===`**。Rust 侧必须用严格相等，否则 IC 并列场景逐位不一致。

#### 红线 3 —— `round` 必须重写

UpUp：`round(v, 4) = Math.round(v * 1e4) / 1e4` —— **半值向上**，且保留 `-0`。
Rust：`f64::round` 是**半值远离零**，与 JS 不同。

实测差异：

| 输入 | JS `Math.round` | Rust `f64::round` |
|---|---|---|
| `-0.5` | `-0` | `-1` ❌ |
| `-1.5` | `-1` | `-2` ❌ |
| `-2.5` | `-2` | `-3` ❌ |
| `2.5` | `3` | `3` ✅ |

Rust 侧必须实现**与 JS 逐位一致的 shim**：

```rust
/// JS `Math.round` parity: floor(x + 0.5), 且保留 -0。
#[inline]
fn js_round(x: f64) -> f64 {
    if !x.is_finite() { return x; }
    let r = (x + 0.5).floor();
    if r == 0.0 && (x < 0.0 || (x == 0.0 && x.is_sign_negative())) { return -0.0; }
    r
}
#[inline]
fn js_round4(x: f64) -> f64 { js_round(x * 1e4) / 1e4 }
```

已实测该 shim 与 JS 在 `±0.5` / `±1.5` / `±2.5` / `±0.00005` / `-0.0` 上**完全一致**（含 `-0` 符号位）。

---

## 6. P2 —— Rust 加速第二批（记忆检索）

**触发条件：仅当 §4 完成后，MMR 或向量检索仍未达 §2.2 目标时才执行。** 不预先实施。

- 下沉对象：`jaccardSimilarity` 批量矩阵、倒排索引打分、cosine 全扫。
- 向量检索**优先工程方案**：预归一化 + `Float32Array` 直接点积 + top-K 堆，其次才是 Rust，最后才考虑 `sqlite-vec`。
- `sqlite-vec` 候选性已探明：本机 `bun:sqlite` 支持 `loadExtension()`（`typeof === 'function'`），SQLite `3.43.2` 且编译含 **FTS5**。但 `sqlite-vec` 属原生扩展分发问题，**一期只记录为候选，不引入**。
- 参照物（本期**不实现**）：`lumosai-agent-harness/src/vault/hybrid_search.rs` 的 RRF（k=60）+ `vault/search.rs` 的 BM25 打分（k1=1.2, b=0.75）。UpUp 当前**没有 RRF**（`packages/memory/src/*.ts` 零命中），属独立后续提案。

---

## 7. P3 —— 启动优化

启动 ~2.7s 中 **2.18s 来自 ecosystem mount**，是 UpUp 可控的最大单项：

| 包 | 耗时 |
|---|---|
| `pi-subagents` | 1.29s |
| `rolebox` | 394ms |
| `pi-lens` | 269ms |

- 改为「**首次实际使用其工具时再 mount**」；`mountUpUpEcosystemPackages` 增加 `eager` / `lazy` 分组与就绪报告。**挂载失败隔离语义不变**。
- 扩展 `PI_TIMING`（`packages/pi-app/src/entry.ts:58` 已在设），新增 UpUp 侧 **`UPUP_TIMING`** 段，覆盖 ecosystem mount / skill load / prompt 组装。
- 明确一期**不改** Pi runtime 内部（`createAgentSessionRuntime` 2.2s 属 Pi 自身），仅记录并上报。

---

## 8. P4 —— 分发与门禁

### 8.1 分发

`packages/pi-native-core` 以 napi-rs 多平台预编译产物分发（darwin / linux × x64 / arm64，win32 x64），目录约定与 `@earendil-works/pi-tui` 一致：

```
prebuilds/<platform>-<arch>/pi-native-core.node
```

作为根 `package.json` 的 `optionalDependencies`。本地参考：`node_modules/@earendil-works/pi-tui/native/darwin/prebuilds/darwin-arm64/darwin-modifiers.node`。

### 8.2 已验证的构建 / 加载约束（必须进 CI）

| 约束 | 实测结论 |
|---|---|
| **macOS 链接** | 不加 `rustflags` 会 `ld: symbol(s) not found for architecture arm64`（napi 符号未解析）。必须在 `crates/.cargo/config.toml` 加：`[target.'cfg(target_os="darwin")'] rustflags = ["-C","link-arg=-undefined","-C","link-arg=dynamic_lookup"]`。加上后 `cargo build --release` 通过（5.96s），产出 `lib*.dylib`（494KB）。 |
| **Bun 加载** | `createRequire(import.meta.url)('./x.node')` ✅ 实测成功 |
| **Node 加载** | `createRequire` ✅ 实测成功 |
| **`bun build --compile`** | ⚠️ **单文件二进制下 `import.meta.url` 指向 `/$bunfs/root/`，`require` 会失败**（实测报 `Cannot find module '/$bunfs/root/probe.node'`）。**必须改用 `dirname(process.execPath)` 探测**，实测可正确加载同目录 `.node`（`NATIVE OK via /private/tmp/compile-probe/probe.node`）。否则编译版永久静默回退 TS。 |

loader 探测顺序（多候选、逐个 try）：

1. `dirname(process.execPath)/<name>.node`（编译版二进制）
2. `require.resolve('@upup/pi-native-core/prebuilds/<platform>-<arch>/<name>.node')`（npm 安装）
3. `join(dirname(fileURLToPath(import.meta.url)), 'prebuilds/...')`（源码运行）
4. 全部失败 → 回退 TS

### 8.3 门禁与 CI

- 新增 CI job：Rust toolchain + `cargo build --release` + `cargo test`（6 个 vendored crate 的 91 个内联单测）+ TS/Rust 对拍。
- 新增 `scripts/bench-upup.ts`（`bun run bench:upup`）：把 §2.2 全部指标输出为 JSON。
- 新增 `scripts/check-perf-baseline.ts`：跑基准并与阈值比较，超阈值 fail。
- 新增 `scripts/check-native-fallback.ts`：断言 `.node` 缺失时全部路径回退 TS 且行为一致。
- 接入 `verify:pi7-final` 作为 **C18**（当前为 C1–C17，共 17 个 `id: 'C*'`）。
- **workspace 40 → 41 个包**，同步更新 `docs` / `report:pi7` 口径与计数断言。已实测当前基线：
  - `bun run report:pi7` → `workspacePackages: 40`，`piNativePackages: 20`，`rootSourceFiles: 30`，`rootProductionFiles: 2`，`rootProductionLines: 7`
  - `bun run check-module-boundaries` → `Module boundaries passed: 40 workspace packages, 2 root src modules`
  - AGENTS.md 中「37 个 workspace package」等历史口径需一并核对。

---

## 9. Public APIs / Interfaces

- **新增** `@upup/pi-native-core`（napi-rs 包，含 `NativeModule` 类型声明与 `isAvailable()`）。
- **新增（内部）** `packages/pi-quant/src/native.ts`、`packages/pi-technical/src/native.ts` loader —— **不新增对外导出**（满足 `check:no-self-impl`：禁止 UpUp 导出与 Pi canonical 导出同名）。
- **现有导出签名与语义全部不变**：`computeMACD`、`computeKDJ`、`computeBOLL`、`computeAllFactors`、`correlation`、`regress`、`scoreUniverse`、`runFactorBacktest`、`applyMMRToHybridResults`、`MemvidStore.search`、`MemoryDatabase.searchVector`。
- `mmr.ts#tokenize` 保持导出（签名不变：`(text: string) => Set<string>`），仅改变 CJK 输入的输出集合。
- `search.ts#TFIDFEmbedder.tokenize`（private）与 `memvid-store.ts#tokenize`（module-local）**均非对外导出**，改动不触及公开 API。
- 各 `packages/*/package.json` 的 `pi` manifest **不新增工具**；native 加速对 Pi 工具层**完全透明**。

---

## 10. Test Plan

### 新增回归

**T1 —— `packages/memory/src/mmr.test.ts`（新建）**
- CJK tokenize 非空：`tokenize('贵州茅台三季报营收…').size > 0`
- `jaccard(茅台, 宁德) < 1`；`jaccard(茅台, 英伟达) < 1`
- 中文近重复集（3 近重复 @1.00/0.98/0.96 + 1 不相似 @0.90，λ=0.7）MMR **必须把不相似文档提前**
- `jaccard(∅, ∅) === 1` 与英文路径行为**保持不变**（防回归）

**T2 —— `packages/memory/src/search-tfidf.test.ts`（扩展现有文件）**
- 中文语料 `buildVocabulary` 后 vocabulary size **> 0**
- 中文查询 `embed()` 结果**不是全零向量**
- 英文结果与修复前逐位一致（防回归）

**T3 —— `packages/memory/src/memvid-store.test.ts`（新建）**
- `tokenize('贵州茅台')` 切出**多个** token（不得再是 1 个整串）
- 语义匹配、字面错位的查询（`茅台营收增长`）对中文文档**得分 > 0**（当前为 0）
- 英文结果与修复前一致（防回归）

### 对拍
每个下沉函数新增 `*.parity.test.ts`：固定种子随机数据同时跑 TS 与 Rust，断言逐位相等（浮点用 `Object.is`，含 `-0` 与 `NaN`）。**必含**：
- `round(x, 4)` 半值边界：`±0.5`、`±1.5`、`±2.5`、`±0.00005`
- Spearman 并列：构造 `abs < 1e-12` 但 `!==` 的样本，断言与 UpUp 严格相等语义一致
- MACD/KDJ/BOLL 全序列（含前导 `null`）与 TS 逐元素相等

### 回归
`packages/pi-quant/src/*.test.ts`、`packages/pi-technical/src/*.test.ts`、`packages/memory/src/*.test.ts` 全绿且**断言不放宽**。

### 契约
`bun test`、`bun run typecheck`、`check:no-self-impl`、`check:module-boundaries`、`check:pi-packages`、`check:js-suffix`。

### 回退
临时移除 `.node` 后跑全量基准与测试，确认功能等价、仅性能下降。

### 性能与启动
`bun run bench:upup` 输出 §2.2 指标表；`check-perf-baseline` 在 CI 守阈值；`PI_TIMING=1` + `UPUP_TIMING=1` 断言 ecosystem mount < 700ms。

### 验收
`bun run verify:pi7-final` —— C1–C17 全绿并新增 C18。

---

## 11. 里程碑与依赖顺序

| 阶段 | 内容 | 依赖 | 可并行 |
|---|---|---|---|
| **M0** | §4 P0 算法修正（含**三个 CJK tokenizer 修复** + 新建 `mmr.test.ts` / `memvid-store.test.ts` + 扩展 `search-tfidf.test.ts`） | 无 | — |
| **M1** | §3.3 建 `crates/` workspace + 复制 6 crate + `cargo test` 全绿 | 无 | 与 M0 并行 |
| **M2** | §5 `pi-native-core` napi 绑定 + loader + 对拍测试 | M1 | — |
| **M3** | §7 启动优化（懒加载 + `UPUP_TIMING`） | 无 | 与 M0/M1 并行 |
| **M4** | §8 分发 / 基准 / 门禁 / C18 / 计数对齐 | M0 M2 M3 | — |
| **M5** | §6 P2 记忆检索 Rust 化（**条件触发**） | M0 达标情况 | — |

**M0 与 M1 无相互依赖，可并行。** M5 只在 M0 未达标时启动。

---

## 12. Assumptions

- 两仓库均为用户自有且 **MIT**，无许可证阻塞。`native1.md` 与新增 Rust 源码中标注来源于 LumosAI invest / lumosai-agent-harness，并记录上游 commit `3eb2127b5`。
- Rust 以 napi-rs 预编译 `.node` 分发，加载失败**静默回退纯 TS**。
- **数值一致性要求逐位相同**（含取整与 tie-break），**不引入容差**。
- 一期**不改动** Pi runtime 内部与 `patches/`，启动优化只做 UpUp 可控部分。
- Rust 首批**只做无 IO 的纯数值计算**；记忆检索先修算法，Rust 化视结果再定。
- 记忆语料当前为空（`~/.upup/memory` 0 个 `.md`），基准按 1k / 5k / 20k 合成语料推进。
- 本地 `cargo` / `rustc` **1.98.0-nightly** 可用；CI 需新增 Rust toolchain 与多平台构建。
- `crates/` 与 `packages/` 物理隔离：Rust 产物不参与 `bun install`，`.node` 缺失时 CI 与本地开发均正常工作。
- `sqlite-vec`、RRF、`datahub`/`domain`/`tools`/`bridge` 的复制**均为本期非目标**，仅在本文档中记录为候选。
