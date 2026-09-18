# UpUp 性能问题分析与优化方案

> 分析日期：2026-09-18
> 分析范围：market-data / finance-sdk / session / observability / storage / memory 热路径
> 方法：直接读源码 + 在真实进程内实测（每项结论都带可复现的测量命令与数字）
> 环境：Bun 1.4.1 (macOS arm64) · Node 24.16.0 · 实测时 `push2.eastmoney.com` 正处于限流窗口

本文所有数字都是本机实测值，不是估算。评测脚本已固化在 `scripts/perf/`（可从任意 cwd 重跑），
每个结论后面都标了对应的脚本名。

---

## 0. 结论速览

按影响排序，共发现 **11 个性能问题**（3 个高优、5 个中优、3 个低优）：

| # | 问题 | 位置 | 实测影响 | 优先级 |
|---|---|---|---|---|
| P1 | 每主机请求闸门强制串行 + 500ms 间隔，且**全进程共享** | `packages/pi-observability/src/host-request-gate.ts` | 5 个请求 ~2000ms（=4×500ms，实测 2012/2056ms）；5 个独立 50ms 任务被串成 2056ms | 🔴 高 |
| P2 | 闸门串行化**远严于**上游真实容忍度 | 同上 | 镜像主机 8 并发 275~303ms 全成功；同样 5 请求经闸门 2055~2067ms，慢 **2.0x~37.2x**（随网络波动） | 🔴 高 |
| P3 | 闸门冷却**按 host 而非 path** 记，2 次无关 reset 连坐整台主机 180s；`HostThrottleError` 又被判成 `permanent` 掐断重试 | `packages/pi-observability/src/host-request-gate.ts:107`；`provider-retry.ts:92` | 2 次无关失败 → 同主机**所有健康 path** 在 180s 内全部快速失败（实测） | 🔴 高 |
| P4 | `get_sector_data` 对股票代码做**必然失败**的板块解析 | `market-structure-eastmoney.ts:302` | 每次股票查询白打 1 次 `searchapi` suggest（实测返回值 `undefined`） | 🟠 中 |
| P5 | 同一 URL 被重复读取（resolve + 再取一次） | `market-structure-eastmoney.ts:240` / `:264` | 每次股票行业查询重复 1 次 `push2` stock/get（实测 x2） | 🟠 中 |
| P6 | 无 in-flight 请求合并 | `screen-eastmoney.ts` / `quote.ts` | N 个相同并发查询 = N 倍上游调用 | 🟠 中 |
| P7 | `verifyPiResourceTrust` 每次都对全包做 SHA-256，无缓存 | `plugin-trust.ts:36/102` | 冷 cache 实测 0.1~14.2ms/包（全树可达 ~170ms），每次 `createSession` 都重算 | 🟡 低 |
| P8 | 缓存无淘汰上限 | `screen-eastmoney.ts:626`、`quote.ts:107`、`pi-research/src/index.ts:50` | 长驻进程堆持续增长 | 🟡 低 |
| P9 | `canonicalJson` 递归 + 排序 + 重复序列化 | `packages/pi-storage/src/index.ts:5` | 86.6~95.9µs/op，是 `JSON.stringify` 的 **3.7x~4.2x** | 🟡 低 |
| P10 | 每个 session 都重扫用户全局 skill 库（162 个 SKILL.md / 1.3MB） | `@upup/pi-session` → Pi resource loader | `userSkills: include` 39ms vs `whitelist-only` 28ms，**+11ms / session（1.4x）** | 🟠 中 |
| P11 | `getYahooQuote` 的回退解析**绕过注入的 fetcher**，直连真实网络 | `packages/pi-market-data/src/quote.ts:433` | 实测每次 140~5655ms（同一调用 6 次采样），**不可被测试 stub 拦截** | 🟠 中 |

**一句话总结**：UpUp 最大的性能瓶颈不是 CPU，也不是 Bun，而是**一个"防御性过户"的串行网关**——它为了避开东方财富的限流，把整个进程的所有同主机请求（包括互不相关的查询）都压成了 500ms 一格的长队，而实测证明上游其实能吃 8 路并发。

---

## 1. 核心问题：每主机串行闸门（P1 + P2）

### 1.1 问题描述

`packages/pi-observability/src/host-request-gate.ts` 为每个主机建立一个**模块级（进程级）单例**闸门（`:121` `const hostGates = new Map<string, HostRequestGate>()`；注释原文 "Shared per-host gate so every caller in the process paces itself"），其语义是：

- **同一主机同一时刻只允许 1 个请求**（`:89` 的 `acquire()` 用一条 promise 链串起来）
- **相邻两次请求启动间隔至少 500ms**（`:28` `DEFAULT_HOST_MIN_INTERVAL_MS = 500`）
- 连续 2 次 socket reset 后进入 **180 秒**冷却（`:29` `DEFAULT_HOST_COOLDOWN_MS = 180_000`）

消费点有 5 处，全部是 `await gate.run(...)`：

```
packages/pi-market-data/src/quote.ts:531          报价
packages/pi-market-data/src/history.ts:524        日线
packages/pi-market-data/src/screen-eastmoney.ts:184  筛选 / 板块
packages/pi-market-data/src/realtime/eastmoney-feed.ts:138  SSE 建连
packages/pi-finance-sdk/src/eastmoney-datacenter.ts:29    数据中心
```

关键缺陷是**闸门粒度错误**：它按 **host** 串行，但实测的限流是**按 path 作用域**的（源码自己也记录了这个事实，见 `packages/pi-market-data/src/eastmoney.ts:19`）：

> `push2his` reset for minutes (and the reset is *path* scoped: `/api/qt/stock/get` on the same host kept answering)

即：`/api/qt/clist/get` 被限流时，同主机的 `/api/qt/stock/get` 仍然正常。但闸门把两者当成同一条队列，导致**健康接口被不健康接口拖累**。

### 1.2 实测证据

```bash
bun scripts/perf/verify-all.ts
```

```
1. 5 个空操作请求过闸门        : 2012ms   (= 4 × 500ms 纯间隔)
2. 5 个并发 50ms 任务过同一闸门: 2056ms   (并行应约 50ms → 慢 41x)
3. 同一主机 4 请求             : 1505ms
   不同主机 4 请求             : 2ms      ← 证明瓶颈是"同主机共享一条队列"
```

第 2 项最能说明问题：**5 个彼此毫无关系的任务，只因为都访问同一主机，就被强制串成一条 2 秒的队列。**（4 个空操作也要 2 秒，因为它等的不是网络，是那 500ms 的间隔。）

### 1.3 真实业务影响

对 `querySectorSnapshot` 做逐请求打点（`bun scripts/perf/bench-chain.ts`）：

```
no code (board list)    :  164 ~  277ms requests=1
sector keyword 白酒     :  296 ~ 1275ms requests=2
stock code 600519.SH    : 1142 ~ 1404ms requests=5
```

一次股票板块查询要走 **5 个 gated 请求**（同一主机上多次请求各排 500ms 队，
实测其中两笔 `push2` stock/get 的**起始间隔恰好 502ms**——这就是闸门在排队；
`push2` 请求本身只要 47~65ms，也就是说 502ms 里有 ~440ms 纯属等待）。
即使上游全部健康，串行闸门也把 N 个请求放大成 `N × 500ms`。

> 上表的三行都跑过多次；耗时随上游抖动，但 **`requests=` 计数恒定**。
> 这正是"瓶颈是排队而不是网络"的证据：网络快慢只影响每格内的几十毫秒，
> 而**格数 × 500ms 是固定的**。

对筛选器（最重的路径），按主机拆开看才能看清排队来源（`bun scripts/perf/bench-screener-hosts.ts`）：

```
screenEastmoneyStocks(cn,limit=20): 2795ms
   data.eastmoney.com    : 1 请求       → 自己的闸门，0ms 排队
   push2.eastmoney.com   : 5 请求       → 自己的闸门，2000ms 排队
```

**闸门按 host 分桶（`host-request-gate.ts:121`），所以跨主机是重叠的；只有同主机的请求排队。**
这一次筛选的 2795ms 里，**2000ms 来自 `push2` 那 5 个请求的内部排队**——而实测该主机
8 路并发 275ms 全成功（见 1.4）。**这是全文档最典型的"防御性过载"：为了安全付出的代价，
远大于安全本身所需。**

### 1.4 与"筛选窗口"相乘

`packages/pi-market-data/src/screen-eastmoney.ts:421` 会按需翻页，最多 `EASTMONEY_SCREEN_WINDOW_ROWS = 500` 行 / 100 行一页 = **最多 5 次上游请求**，每次都过闸门。这 5 次通常落在同一主机上，即 **最多 4 × 500ms = 2s 的纯排队**，还没算真实网络时间和 mirror 重试。

### 1.5 最优解：并发闸门（concurrency limiter）替代串行闸门

上游的真实容忍度已实测：

```
4. 8 路 RAW 并发 fetch 到镜像主机: 8/8 ok in 275~303ms
```

对比同样 5 个请求（`bun scripts/perf/bench-mirror-stable.ts`，两轮）：

```
round 1: 经闸门=2067ms  原始并发=259ms  → 8.0x   原始 5/5 全部成功
round 2: 经闸门=2055ms  原始并发=1026ms → 2.0x   原始 5/5 全部成功
```

> 第二轮的 `raw=1026ms` 说明镜像主机本身也会抖动（同一批 5 个请求，
> 上一轮 259ms、这一轮 1026ms）。因此**倍数不是重点，闸门那条 ~2050ms 的固定长队才是**：
> 它由 `4 × 500ms` 决定，与网络好坏无关。

闸门侧稳定在 ~2050ms（= 4 × 500ms 的确定性排队）；并发侧耗时随网络波动（259~1026ms），
倍数因此在一个区间内浮动（2.0x~37.2x），但**闸门永远是那条 2 秒的固定长队**。

Bun 侧同样证明并发不是问题：

```
  5 concurrent fetches -> ok=5  in 271ms
 10 concurrent fetches -> ok=10 in 163ms
 20 concurrent fetches -> ok=20 in 287ms
```

（这三行是 Bun `fetch` 本身的并发能力测量，见 §10。）

（Bun 自身默认允许 256 路并发 fetch，`BUN_CONFIG_MAX_HTTP_REQUESTS` 可提到 65535。
**上游和运行时都不是瓶颈，闸门才是。**）

**建议改造**（按推荐顺序）：

1. **把闸门粒度从 host 改为 `host + pathPrefix`**，与实测的限流作用域对齐。`/api/qt/stock/get` 不应被 `/api/qt/clist/get` 的失败拖累。
2. **把"串行 + 间隔"换成"信号量 + 令牌桶"**：
   - 并发上限建议 **4~6**（实测 8 路镜像全成功；留安全余量）
   - 令牌桶限速替代 `minIntervalMs=500`（例如 4 req/s 突发容量 6）
   - 这会直接把 5 请求从 2000ms 降到约 300ms
3. **冷却按 path 记录**，而不是整台主机一起 fail-fast 180s。当前行为是：一个被限流的 path 会让同主机所有健康接口在 3 分钟内全部快速失败。
4. **对不同上游给不同策略**：`push2delay`（镜像）实测 8 并发无忧，可以完全不受 500ms 间隔约束；`push2`（live）才需要保守。

参考实现骨架：

```ts
// 用信号量替代串行链；闸门 key 用 host + path 前缀
createHostRequestGate({ key: 'push2.eastmoney.com/api/qt/clist', maxConcurrency: 4, ratePerSecond: 4 })
```

---

## 2. 重试 × 闸门放大（P3）

`packages/pi-market-data/src/quote.ts:531` 的 `eastmoneyGateFor(input).run(request)` 在**每一次 attempt 里**都被调用（`fetchWithRetry` 的 `execute` 闭包），而 `:469` 对东方财富报价传入的是 `EASTMONEY_RETRY = { maxAttempts: 3, baseDelayMs: 600, maxDelayMs: 5000 }`（`:135`）——**不是** `:141` 的 `DEFAULT_PROVIDER_RETRY`（100/2000）。实测两种配置的总耗时几乎相同，但原因不在重试次数。

#### 2.1 实测：真正的失败路径只进闸门 2 次，不是 4 次

对 `getEastmoneyQuote` 的真实形状（`read(live)` → 失败 → `read(mirror)`，各自带一次 `EASTMONEY_RETRY`）打点（`bun scripts/perf/bench-retry-decompose.ts`）：

```
[EASTMONEY_RETRY 600/5000] live+mirror: 1203ms (live=601 mirror=602)
     live   gate-entry#1 @+0ms
     live   gate-entry#2 @+601ms
     live   threw HostThrottleError @+601ms
     mirror gate-entry#1 @+0ms
     mirror gate-entry#2 @+602ms
     mirror threw HostThrottleError @+602ms
```

关键事实（全部实测确认）：

1. **每个主机只进闸门 2 次，`maxAttempts: 3` 是死配置。** 第 1 次 reset 使 `consecutiveResets=1`（小于 `resetsBeforeCooldown=2`），闸门抛出原始错误；第 2 次 reset 使 `consecutiveResets=2`，**闸门武装 180s 冷却并改抛 `HostThrottleError`**。实测 `bench-counter.ts`：
   ```
   A. fail, fail -> #1 TypeError (throttle=false) | #2 HostThrottleError (throttle=true)
   ```
2. **`HostThrottleError` 被归类为 `permanent`，所以重试链在这里就断了。** 实测 `bench-classify.ts`：
   ```
   HostThrottleError: {"classification":"permanent"}
   TypeError("The socket connection was closed unexpectedly"): {"classification":"transient"}
   ```
   它的中文提示语匹配不上 `TRANSIENT_NETWORK_PATTERN`（`provider-retry.ts:92`），因此不再重试。**第 3 次 attempt 永远不会发生。**
3. **重试退避与闸门间隔是重叠的（取较长者），不是相加。** 实测（`bun scripts/perf/bench-overlap.ts`）：
   ```
   baseDelayMs=100: total=502ms    ← 闸门 500ms 主导
   baseDelayMs=300: total=503ms    ← 闸门 500ms 主导
   baseDelayMs=600: total=601ms    ← 退避 600ms 主导
   ```
4. 因此 1203ms 的真实分解是：**live 闸门 ~600ms + mirror 闸门 ~600ms（两个主机串行，各自 2 次入场）**，而不是"4 × 500ms"。

#### 2.2 真正的危害：冷却的爆炸半径是整台主机

比"重试多花 1 秒"严重得多的是第 1 条事实的推论：**任意 2 个无关请求各 reset 一次，就会让同一主机上所有健康接口在 180 秒内全部快速失败。**

实测 `bun scripts/perf/bench-cooldown-shared.ts`（两个不同 caller 各失败一次，然后发两个完全健康的请求）：

```
  caller-A (fails):     TypeError
  caller-B (fails):     HostThrottleError (throttle)      ← 第 2 次 reset 武装冷却
  caller-C (healthy):   HostThrottleError (throttle)      ← 无关查询被连坐
  caller-D (healthy):   HostThrottleError (throttle)
  gate.retryAfterMs() = 180000ms
```

更关键的是**冷却跨 path 生效**（`bench-counter.ts` C 组）——这正好否定了闸门自己的设计前提：

```
C. 同一主机两个不同 path，各 reset 一次:
   /api/qt/clist/get: TypeError (throttle=false)
   /api/qt/stock/get: HostThrottleError (throttle=true)
   之后访问 healthy path: HostThrottleError (throttle=true) retryAfter=180000ms
```

而 `eastmoney.ts:19` 的注释明确记录了限流是 **path 作用域**的（"the reset is *path* scoped: `/api/qt/stock/get` on the same host kept answering"）。**闸门自己知道粒度错了，但冷却仍然按 host 记。**

**建议**：
- **冷却键从 `host` 改成 `host + path`**（或至少让冷却只影响触发它的 path），这是收益最高、改动最小的一条。
- 重试放到闸门**外层**，让一次逻辑请求的重试共享一次入场。
- `HostThrottleError` 应显式携带 `retryAfterMs` 并按 `transient` 分类（或让调用方在冷却期**立即**短路返回可操作错误），而不是伪装成 `permanent` 静默终结重试链。
- 若要保留 `maxAttempts: 3`，就需要让冷却武装阈值与重试策略一致，否则该配置永远无效。

---

## 3. `get_sector_data` 的冗余请求（P4 + P5）

### 3.1 对股票代码做必然失败的板块解析（P4）

`market-structure-eastmoney.ts:302`：

```ts
const board = await resolveEastmoneyBoard(code, options);   // 对 600519.SH 也先查一次
if (board) { ... }
const stock = await fetchEastmoneyStockIndustry(code, options);
```

`resolveEastmoneyBoard`（`screen-eastmoney.ts:392`）走 `suggest` 接口，再由
`parseEastmoneyBoardSuggestions`（`:354`）**只保留 `Classify === 'BK'` 的行**（`:360`）。
6 位股票代码的 suggest 结果里 `Classify` 是 `AStock`，**永远不可能匹配**——
这次请求（含它的 500ms 排队）是纯浪费。

**实测（stub fetcher，排除网络抖动）**：喂一份只含 `Classify: 'AStock'` 行的真实形状 suggest 响应
（`bun scripts/perf/bench-board-undefined.ts`）：

```
resolveEastmoneyBoard("600519.SH") -> undefined  (  1ms)  ← 首次调用，未排队
resolveEastmoneyBoard("600519")    -> undefined  (500ms)
resolveEastmoneyBoard("白酒")       -> undefined  (502ms)
resolveEastmoneyBoard("BK0477")    -> undefined  (500ms)
```

> **这个 stub 只证明"股票代码必然跑不出板块"这一点**，不能用来证明关键词解析的行为——
> stub 里没有 `Classify: 'BK'` 的行，所以后三行返回 `undefined` 是 stub 构造使然，
> 真实环境里 `白酒` 是能解析出板块的（见下面 `bench-dup2.ts` 的真实响应）。
>
> 唯一有信息量的是耗时列：**除首次免排队外，每次 `resolveEastmoneyBoard` 都实打实付 500ms**。
> 这就是"一次无用请求 = 500ms"的最小证据。

端到端实测（`bun scripts/perf/bench-dup2.ts`，stub 会把真实响应形状回放：
股票代码返回 `Classify: 'AStock'`，中文关键词返回 `Classify: 'BK'`）：

```
querySectorSnapshot("600519.SH"): 1011ms | 4 distinct / 5 total requests
   x1  searchapi.../suggest/get  input=600519.SH    ← 必然失败，浪费
   x2  push2.../api/qt/stock/get secid=1.600519     ← 重复
   x1  searchapi.../suggest/get  input=白酒Ⅱ
   x1  push2.../api/qt/clist/get
```

**建议**：当 `code` 匹配 `^\d{5,6}(\.(SH|SZ|BJ|HK))?$` 时，跳过板块解析，直接走股票分支。

### 3.2 同一 URL 重复读取（P5）

`fetchEastmoneyStockIndustry` 先 `resolveEastmoneySecurity(code)`（`:262`），内部对 6 位数字代码会在 `:240` 通过 `readEastmoneyDocument(eastmoneyStockDetailUrl(secid))` 读一次 `stock/get`；**拿到 secid 后，`:264` 又读一次完全相同的 URL**：

```ts
:240  const payload = (await readEastmoneyDocument(eastmoneyStockDetailUrl(secid), options)).payload;   // resolve 内部
      ...
:264  const payload = (await readEastmoneyDocument(eastmoneyStockDetailUrl(resolved.secid), options)).payload;  // 又一次
```

实测（stub fetcher，排除网络抖动）确认 `x2 push2.../api/qt/stock/get secid=1.600519`：

**建议**：`resolveEastmoneySecurity` 对数字代码分支直接返回 industry 字段，或让 `fetchEastmoneyStockIndustry` 复用第一次的 payload。两处合起来能把股票板块查询从 5 次请求降到 2~3 次。

---

## 4. 缺少 in-flight 请求合并（P6）

`screen-eastmoney.ts` 的缓存只在**请求完成后**写入（`:626` `const cache = new Map<...>()`，`:631` 命中判断）。并发场景下：

```ts
// 两个并发调用，缓存都是空的 → 都会真正打上游
await Promise.all([loader(req), loader(req)]);
```

`quote.ts` 的 `InMemoryMarketQuoteCache`（`:107`）同理，只有 `get`/`set`，没有"进行中"占位。

**实测影响**（`bun scripts/perf/bench-inflight.ts`，5 个并发相同查询）：

```
5 CONCURRENT identical queries -> 10 upstream calls in 2077ms
  => WASTE: 9 redundant upstream calls
```

（一次 screen 会打 2 个上游，5 个并发各打 2 次 = 10 次；若做 in-flight 合并只需 2 次。）

`get_sector_data` + `screen_astocks` 在同一个 LLM turn 里并发下发时（**正是本次事故日志里的模式**），相同查询就会这样成倍放大，且每次还要各排 500ms 队——
10 次上游 = 约 2 秒纯排队，换来的是同一份数据。

**建议**：缓存里存 `Promise` 而不是最终值（promise memoization）：

```ts
const cache = new Map<string, { at: number; pending?: Promise<T>; result?: T }>();
// 命中 pending 就直接 await 同一个 promise
```

这也是所有 5 个闸门消费点的共性优化。

> 注意：由于闸门是**进程级单例**，in-flight 合并的收益会被进一步放大——多个 Pi session、
> gateway 通道、cron 任务如果同时查询同一标的，它们共享同一条队列，也共享同一份浪费。

---

## 5. 会话级开销（P7）

`packages/pi-resource-composition/src/plugin-trust.ts:36` 的 `hashPath()` 会对包内**每个文件**做 SHA-256，且 `:102` 每次 `verifyPiResourceTrust` 都重算，**没有任何缓存**。

实测（`bun scripts/perf/bench-trust.ts`）。**这个数字极度依赖 page cache，波动达 50x**，
所以只报区间、不做单点结论：

```
                          files   size     多次实测区间
pi-market-data             36    0.4MB      0.1  ~ 12.9ms
pi-finance-sdk             63    0.4MB      1.6  ~ 14.2ms
pi-session                 27    0.2MB      0.5  ~  5.0ms
packages (all)                            24.6  ~ 173.1ms
```

> 判断：**冷 cache 时 3 个包合计可达 ~30ms、全树可达 ~170ms；热 cache 时降到几毫秒。**
> 由于单点数字不可信，这里刻意只给区间——任何"优化前/后"的对比都必须在同一 cache 状态下交错测量。
>
> 另外该脚本原先依赖"必须在仓库根运行"才能看到文件数（在别处会静默打印 `0 files`）。
> 现已改为基于 `import.meta.url` 解析路径，**可从任意 cwd 运行**。

单次不足为患，但它发生在**每次 `createSession`** 上。实测会话创建（`bun scripts/perf/bench-session.ts`）：

```
createSession #1: 337 ~ 991ms   ← 冷启动（首次含模块图 JIT，波动大）
createSession #2:  33 ~ 131ms   ← 热
createSession #3:  34 ~  78ms
```

> 冷启动那一格波动很大（338ms ~ 991ms），取决于是否刚跑过别的 session；
> **热路径稳定在 33~40ms**，这才是稳态数值。

**建议**：按 `(path, mtimeMs, size)` 缓存 contentHash；已实测 `Bun.file(path).size` 只需 **4.4µs/4 文件**，
而真正读这 4 个文件要 43~45µs——**stat 预检比全量读取快约 10x**，正好用来判断"内容没变，跳过重算"。

---

## 6. 缓存无淘汰上限（P8）

| 位置 | 现状 |
|---|---|
| `screen-eastmoney.ts:626` | `Map`，只在 TTL 过期时被覆盖，**无大小上限、无 LRU** |
| `quote.ts:107` `InMemoryMarketQuoteCache` | 同上，只在 `expiresAt` 过期时删除 |
| `pi-research/src/index.ts:50` | 有 `size > 100` 保护（`:236`）✅ |
| `mcp/src/upup-resources.ts:119/147` | 无自动淘汰；`clear` 仅标注 `For tests only`（`:132`/`:183`） |

`screen-eastmoney.ts:638` 的 `defaultLoader` 是**进程级单例**，长驻进程（`upup daemon`、gateway）里这个 Map 会持续增长。

**建议**：统一用一个有界 LRU（或按条目数上限 + TTL 双条件淘汰）。仓库里已有正确的范例可参考（`pi-research` 的 `size > 100` 保护，`pi-research/src/index.ts:236`），应把它抽成共享工具。

> `mcp` 的两个缓存键分别是 `queryId` 与 `ticker`，基数天然有限，风险低于前两者；列为低优即可。

---

## 7. 会话级 skill 扫描（P10）

AGENTS.md 的 "Known Pi-Integration Gaps" 已记录"每个 session 默认从 `~/.agents/skills` 加载全局 skills"，
但此前没有量化过代价。实测（`bun scripts/perf/bench-skillscope.ts`，预热后交错采样 6 次）：

```
userSkills=include        : 44, 38, 42, 36, 41, 35   avg=39ms   (4 次独立运行: 39/40/41/39)
userSkills=whitelist-only : 28, 29, 28, 27, 26, 29   avg=28ms   (4 次独立运行: 28/30/28/27)
```

即 **+11~13ms / session（约 1.4x）**，且这只是在单包（`pi-market-data` + `pi-finance-sdk`）下测的。

> 首次运行（冷文件缓存）会看到两档数字同时偏高（如 113ms vs 72ms），
> 差额（~41ms）比稳态的 ~11ms 大得多。**以稳态为准**，不要用冷启动那一轮下结论。
底层扫描成本（`bun scripts/perf/bench-skillscan.ts`）：

```
/Users/louloulin/.agents/skills: 162 skills, 1331KB SKILL.md read in 4.9ms
/Users/louloulin/.codex/skills:   2 skills,   40KB SKILL.md read in 0.8ms
```

**注意**：39ms vs 28ms 的差额（~11ms）明显大于纯文件读取的 4.9ms，因为 Pi 还要为每个 skill
解析 YAML frontmatter、构造 metadata 并注入 system prompt。**这是"扫描 + 解析 + 组 prompt"的总和。**

影响面取决于调用密度：

- CLI 交互式：每个 session 一次，~11ms 无感。
- `upup daemon` / gateway / cron / eval 批量跑：session 数越多越明显（1000 个 session ≈ 11 秒）。

**建议**：
- 短生命周期、批量场景（cron / eval / gateway 的每个请求各建一个 session）显式传 `userSkills: 'whitelist-only'` 或 `spec.skills` 白名单。
- 若要保留全局 skill，可在 Pi resource loader 之上加一层**按目录 `mtime` 的记忆化**，避免每次重新解析 YAML。

---

## 8. 注入点被绕过：一次"不可拦截"的真实网络调用（P11）

这是分析过程中**由一次 flaky 测试反推出来的真实缺陷**，不是理论问题。

### 8.1 现象

`bun test` 全量运行时，`packages/pi-market-data/src/provider-sla.test.ts`
的 `retries transient quote responses and does not retry forbidden responses`
会**偶发超时**（用例上限 5000ms）：

```
(fail) native provider retry integration > retries transient quote responses
       and does not retry forbidden responses [5003.71ms]
  ^ this test timed out after 5000ms.
```

单独重跑该文件时 4 次里有 1 次失败，全量套件里也会命中——**典型的与真实网络耦合的 flaky**。

### 8.2 根因

`quote.ts:433`（`getYahooQuote` 的 fallback 分支）调用 `resolveEastmoneyUsSecid(symbol)`
时**没有把 `this.fetcher` 传下去**：

```ts
// quote.ts:433  —— 没有传 { fetcher: this.fetcher }
const resolved = await resolveEastmoneyUsSecid(symbol);

// screen-eastmoney.ts:405
export async function resolveEastmoneyUsSecid(ticker: string, options: EastmoneyScreenOptions = {}) {
  ...
  const payload = await readEastmoneyJson(eastmoneySuggestUrl(wanted), options);  // options.fetcher ?? fetch
```

而 `resolveEastmoneyUsSecid` 的第二参 `options` 默认是 `{}`，于是
`readEastmoneyJson`（`screen-eastmoney.ts:183`）里的 `options.fetcher ?? fetch` 落到了**全局 `fetch`**。

**实测证据**（`bun scripts/perf/repro-test-seam-bypass.ts`）——注入的 fetcher 与真实出网被同时记录：

```
--- what the INJECTED fetcher received ---
  INJECT @+    8ms https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=5d
  INJECT @+  197ms https://push2.eastmoney.com/api/qt/stock/get?secid=105.AAPL
  THREW  eastmoney market quote request failed: 403
--- what actually hit the NETWORK (bypassing the injected fetcher) ---
  REAL   @+    9ms https://searchapi.eastmoney.com/api/suggest/get?input=AAPL&type=14
```

**调用方注入了 fetcher，但测试无法拦截这次请求**——它绕过了测试的 seam，真的打到了公网。

### 8.3 影响

这不是"测试写得不好"，而是**生产代码的依赖注入契约被破坏**。三个后果：

1. **可测试性**：任何把 `fetcher` 换成 stub 的调用方，都无法约束美股的 fallback 路径。
2. **性能 / 稳定性**：这条路径的耗时**完全不受调用方控制**，实测同一调用 6 次采样
   （`bun scripts/perf/bench-seam-bypass-latency.ts`）：

   ```
   call 1:  280ms
   call 2:  140ms
   call 3: 5294ms
   call 4: 1116ms
   call 5: 5655ms
   call 6: 2107ms

   min=140ms  max=5655ms   <-- 测试超时是 5000ms
   ```

   **最大值（5655ms）直接跨过了 5000ms 的测试超时线**——这就是 flaky 的全部解释。
   而且它还是**走闸门的**（`searchapi.eastmoney.com` 有自己的 host 闸门），
   所以真实用户路径上这次调用还会再叠加 500ms 的排队。

3. **与 P1/P2 联动**：该请求经 `searchapi` 的 host 闸门，会在 500ms 间隔的队列里占一格。
   `getYahooQuote` 是**美股报价的常规回退路径**，所以这个"隐藏的额外请求"在美股查询里是常态。

### 8.4 建议

- **把 fetcher 透传下去**（一行修复）：
  ```ts
  const resolved = await resolveEastmoneyUsSecid(symbol, { fetcher: this.fetcher, ...(signal ? { signal } : {}) });
  ```
  注意 `getEastmoneyQuote` 的 `override` 参数已经接收了 `secid`，所以修复后
  `getYahooQuote` 的整条回退链都会走注入的 fetcher。

  **该修复已实测验证**（`bun scripts/perf/verify-seam-fix.ts`）：
  ```
  with { fetcher } passthrough: resolved=105.AAPL stubCalls=1 realEgress=0
  ✅ no real network egress — the seam holds
  ```
  传参后 stub 被命中 1 次、真实出网 0 次，说明 seam 恢复。
- **顺带加一条守门测试**：断言"注入 fetcher 后，没有任何请求经由全局 `fetch` 出网"
  （`repro-test-seam-bypass.ts` 已经是现成的检测形状）。
- 同类风险点建议一并审计：`market-structure-eastmoney.ts:245/302/308` 都调用了
  解析函数——它们**传了** `options`（正确），可作为对照确认 `quote.ts:433` 是遗漏而非设计。

---

## 9. 序列化与哈希（P9）

`packages/pi-storage/src/index.ts:5` 的 `canonicalJson` 是递归 + 每层 `Object.keys().sort()` + 字符串拼接，且在 `hashDossier`、审计链 `append`、`verify` 里被反复调用。

实测（`bun scripts/perf/bench-stable.ts`，含 200 条 metrics 的 dossier，预热 + 交错计时取均值）：

```
canonicalJson (200 metrics)   : 86.6 ~ 95.9 µs/op    (三次独立运行)
JSON.stringify (same object)  :             20.5 ~ 23.3 µs/op
                                ← 稳定快 3.7x ~ 4.2x
```

哈希算法本身也有更快的选择（同样预热 + 交错计时）：

```
hash 200KB: Bun.hash 0.0059ms vs node sha256 0.0662ms  (11.2x)
hash 200KB: Bun.CryptoHasher vs node sha256            ( 1.0x, 完全持平)
```

同一脚本还顺带量到一条与 §3/§4 相关的结论：`JSON.parse` 500 行行情是 **0.0665ms**，
而 `structuredClone(JSON.parse(...))` 是 **0.1974ms（3.0x）**——**热路径上不要用 `structuredClone` 拷贝上游 JSON**。

> ⚠️ 注意：单次冷测会把 `Bun.hash` 的低估/高估拉大（实测单跑 ratio 在 3x~72x 之间大幅跳动）。
> 上表是预热 100 次后交错采样 300 次取均值的稳定值，以此为准。

`Bun.hash`（wyhash）**不可用于签名/审计链**（非密码学安全），但很适合做缓存键、变更检测、去重键这类用途——`plugin-trust.ts` 的 `contentHash`（若仅用于变更检测）与内存缓存的 key 都可以换。

**建议**：
- 缓存键 / 去重键 / 变更检测 → 用 `Bun.hash`（**11.2x**）
- 审计链 / 签名 → **保持** `node:crypto` sha256（这是安全要求，不要为了速度降级）
- `canonicalJson` 对已在同一 tick 内计算过的对象做 memo（审计 `append` 里同一个 record 被连续序列化多次）

---

## 10. Bun 最佳性能优化方案

以下为 Bun 官方文档（bun.com/docs，经 Context7 `/oven-sh/bun` 核对）确认的能力，结合 UpUp 现状给出可落地建议。
每条都在本机 Bun 1.4.1 上实测过，**"无收益"的项已明确标出，不要为了"用上 Bun 特性"去迁移。**

### 10.1 立刻可用的运行时能力

| 能力 | 用途 | UpUp 现状 |
|---|---|---|
| `Bun.hash`（wyhash） | 非密码学哈希，实测 **11.2x** 快于 sha256（0.0059ms vs 0.0662ms / 200KB） | 未使用；可替换缓存键/变更检测 |
| `Bun.CryptoHasher` | 密码学哈希；实测与 `node:crypto` **完全持平**（0.0676 vs 0.0669ms） | **无需迁移（零收益）** |
| `Bun.file(path).size` | stat-only，实测 **4.1~4.4µs/4 文件**（比真正读这 4 个文件快 ~11x） | 可用于 trust 缓存的 mtime/size 预检 |
| `Promise.all` + `Bun.file().arrayBuffer()` | 并发读，实测 **45~50µs/4 文件** = 与 `readFileSync`（48~52µs）持平 | 已是最快路径；**注意 `await Bun.file().text()` 逐个 `await` 读反而慢到 105~131µs（~2.4x）**——多文件不要串行 `await` |
| `Bun.sleep()` | 等价于 `setTimeout` promise，无性能差异 | 保持现状即可（`host-request-gate.ts:84`） |
| `Bun.serve()` | 内置 HTTP server | `pi-management/src/server.ts:30` **已在用** ✅ |
| `--smol` | 降低堆增长，代价是**更频繁 GC、降低吞吐** | **不建议**用于常规 CLI；仅 sandbox/容器场景 |
| `BUN_CONFIG_MAX_HTTP_REQUESTS` | 默认 256 并发 fetch 上限，最大 65535；超出时 Bun 排队 | 无需调整（UpUp 并发远低于 256） |
| `fetch.preconnect(url)` / `dns.prefetch(host, port)` | 提前做 DNS + TCP + TLS | **可用**：闸门排队那 500ms 里正好可以预热下一个主机 |
| `Bun.peek(promise)` | 同步读取已 settle 的 promise，省掉 microtick | 缓存命中判断可用（收益微小，非重点） |

> **关于 `fetch.preconnect` / `dns.prefetch`**：这是唯一一条能与 §1 闸门改造**正交叠加**的优化。
> 既然闸门会强制等待 500ms，那这段时间完全可以用来预连下一个目标主机，把
> 串行化的一部分成本"藏"进等待里。Bun 自己已经给 `fetch` 做了 DNS 缓存
> （256 条 / 30s，同主机并发共享一次解析）与 TCP keepalive（`TCP_KEEPIDLE=60s`），
> 所以零连接的收益主要看冷启动与跨主机切换。

### 10.2 构建产物

当前构建命令**没有 minify**（`package.json:15`）：

```
bun build --compile --target=bun --outfile=dist/upup src/index.tsx --external=playwright ...
```

**实测结论（不是估算）**：对同一份源码编译两个二进制，各跑 20 次取均值，共 4 轮交错：

```
                      体积            4 轮启动耗时（每轮 20 次均值）
plain  (现状)    79,432,418 B   207.9 / 175.9 / 186.4 / 186.8 ms   (avg 189.3)
--minify         72,612,962 B   191.6 / 160.6 / 172.5 / 170.8 ms   (avg 173.9)
                → −6,819,456 B (−8.6%)          → −15.4 ms (−8.1%)
```

**每一轮 `--minify` 都更快**（−15~−21ms），方向一致、无翻转，所以这不是噪声。

**建议加 `--minify`**：零风险，稳定省 8.6% 体积 + ~8% 启动时间。`--sourcemap=external` 可另外保留可调试性。

#### ⚠️ `--bytecode` 目前在 UpUp 上**不可用**（实测发现的真实阻塞）

Bun 文档推荐的 `--bytecode`（把 JS 解析从运行时挪到构建期）在 UpUp 入口上**直接构建失败**：

```
$ bun build --compile --bytecode --target=bun --outfile=/tmp/x src/index.tsx --external=playwright ...
error: Failed to generate bytecode for ./x
```

最小复现（`scripts/perf/tla/`，可直接跑）证实根因是 **`--bytecode` 不支持顶层 `await`（TLA）**。
真实入口只打印上面那一行 `Failed to generate bytecode`（不指出具体文件），
而在最小 TLA 文件上能看到更直白的诊断：

```bash
# 失败：顶层 await
bun build --compile --bytecode --outfile=/tmp/x scripts/perf/tla/tla-fails.ts
#   error: "await" can only be used inside an "async" function
#   error: Unexpected .

# 成功：同样的 await 包在 async IIFE 里
bun build --compile --bytecode --outfile=/tmp/x scripts/perf/tla/iife-works.ts
#   → compile OK, runs and prints "iife 42"

# 对照：普通 --compile 对顶层 await 完全正常
bun build --compile --outfile=/tmp/x scripts/perf/tla/tla-fails.ts
#   → compile OK
```

**根因实测定位（修正先前猜测）**：先前草稿声称"`packages/pi-app/src/entry.ts` 有 34 处顶层 await"——
这一说法**经实测证伪**：

- `entry.ts` 共 10 个 await，**全部在 `async function main()` 里**（`main()` 由文件末尾
  `main().catch(...)` 调用，**0 个 col-0 await**）。
- 在 Bun 1.4.1 打出的真实 17MB bundle 上验证：
  - `grep -cE "^await " bundle.js = 0`
  - `grep -cE "^(let|const|var) [A-Za-z_$]\w* = await " bundle.js = 0`
  - `grep -cE "^async function" bundle.js = 0`（说明 main() 已被 bundle 收起，源码 col-0
    与编译产物 col-0 一致）

**真实根因**：Bun 1.4.1 的 bytecode 生成器对**默认 cjs 输出格式**不友好——加 `--format=esm`
就能直接构建成功并正常运行：

```
$ bun build --compile --bytecode --target=bun --format=esm \
    --outfile=/tmp/upup-bc-esm.bin src/index.tsx \
    --external=playwright --external=playwright-core
  [692ms]  bundle  2888 modules
  [322ms] compile  /tmp/upup-bc-esm.bin     ← OK

$ /tmp/upup-bc-esm.bin --help
  UpUp v2026.6.12 · 涨涨 · Pi Runtime
  ... banner / help 正常输出
```

**对照**：同样的源码去掉 `--format=esm`：

```
$ bun build --compile --bytecode --target=bun \
    --outfile=/tmp/upup-bc-real.bin src/index.tsx \
    --external=playwright --external=playwright-core
  [350ms]  bundle  2892 modules
  [411ms] compile  /tmp/upup-bc-real.bin
error: Failed to generate bytecode for ./upup-bc-real.bin
```

Bun 在 cjs 路径下不打印文件位置，只一行 `Failed to generate bytecode`，所以先前
误把"任何 bytecode 失败 = TLA 阻断"归因。这条经验值得记一笔：**Bun 1.4.1 的 bytecode
错误信息缺文件位置，定位时要先排除 `--format` / `--external` / `--sourcemap` 等
flags 的影响再猜语法**。

**收益是否值得？** 在等价无 TLA 合成入口上对比 `--bytecode` 与普通编译：

```
synth-plain   (无 bytecode) : 冷 0.47s / 热 0.00~0.01s
synth-bytecode              : 冷 0.44s / 热 0.00s
                              → 差异在测量噪声内，**没有可观测收益**
```

**所以结论分两层**：

1. **修法**：发布脚本里加 `--format=esm --bytecode` 即可解锁（产物体积从 79MB 涨到
   107MB = +36%，因为 bytecode cache + JSC 内核都打进了二进制）。
2. **值不值**：UpUp 当前 TTI 不在 bundle 解析上（实测 minify 单独省 8% 启动时间，bytecode
   在等价合成入口上几乎无差异），所以 **不建议**为生产 release 启用 `--bytecode`。
   这条经验作为"未来如果 TTI 出现明显差距时的备选"保留即可。

`--compile` 已经把 ~170MB 的运行时内存基线固定下来（见 10.3），是合理的发布形态。

### 10.3 内存基线（实测）

```
startup RSS: 170 ~ 172MB
after session #1: 336 ~ 339MB   (heapUsed 50~52MB)
after session #5: 370 ~ 386MB   (heapUsed 57~60MB)
after disposing all: 370 ~ 386MB   ← 释放后 RSS 不回落（JSC 保留页）
```

**观察**：RSS 从 ~170MB 涨到 ~376MB，增量（~206MB）里大头是 **session #1 的 ~167MB**
（Pi runtime + package 图 + skill/package 解析的一次性成本），之后每个 session 只增 ~7MB（3 次独立运行一致）。
`dispose()` 后 RSS 不回落属于正常 GC 行为，不是泄漏。

但结合 P7/P8，长驻进程（daemon/gateway）值得加一个定期 RSS 观测——因为**缓存无上限（P8）
叠加这个 ~7MB/session 的增量**，长期才是真正需要盯的地方。

### 10.4 CPU 密集路径

仓库里唯一的 worker 用法是 `pi-portfolio/src/duckdb.ts:95`（DuckDB wasm worker）。实测向量检索（memory 的 `cosineSim`，`packages/memory/src/search.ts:301`）**并不慢**：

```
cosine over 5000 x 1536d:
  重算两个范数      : 6.0 ~ 6.2ms
  提升 query 范数   : 5.3 ~ 5.5ms   (1.08x ~ 1.14x)
```

**6ms / 5000 文档完全不需要 worker 化**，也不值得改算法。

`packages/memory/src/search.ts:301` 的 `cosineSim(a, b)` 确实把 `a` 的范数在每个文档里重算了（共 5000 次），理论上可把它提到循环外（`search.ts:324` 调用处）。但实测收益只有 **1.08x~1.14x**（6.0ms → 5.5ms）——因为 `nb` 仍要算、`sqrt` 本身很便宜。**这项可以顺手做，但不值得单独立项。**

> 另有一条更省事的观察：把整条向量改成 `Float32Array` 路径**实测 1.01x，等于没有收益**
> （`bun scripts/perf/bench-vector.ts`：两条路径都是 10.9ms）。不要在向量表示上做文章。

---

## 11. 优先级与实施路线

### 第零阶段（一行修复，可立刻合入）

0. **修掉 fetcher 注入点被绕过**（P11）——`quote.ts:433` 一行透传 `{ fetcher: this.fetcher }`。
   实测这条隐藏调用最长 5655ms，是 `bun test` 偶发超时的直接原因，**修复方案已实测验证有效**
   （`scripts/perf/verify-seam-fix.ts`：传参后真实出网 0 次）。改动一行，收益是 CI 不再 flaky。

### 第一阶段（高优，预计 3~5 天，收益最大）

1. **闸门改并发闸门**（P1/P2）——把 host 粒度改成 `host+path`，串行+500ms 间隔改成并发 4~6 + 令牌桶。预期：板块/筛选类工具从 2~2.5s 降到 0.3~0.6s。
2. **冷却键从 host 改成 `host+path`**（P3），并让 `HostThrottleError` 按 `transient` 分类或携带 `retryAfterMs` 短路。预期：单条被限流的 path 不再连坐整台主机 180s，这是本阶段**改动最小、收益最大**的一条。
3. **重试移到闸门外层**（P3），让一次逻辑请求的重试共享一次入场；同时修掉 `maxAttempts: 3` 因冷却武装而永远只跑 2 次的死配置。
4. **`get_sector_data` 跳过股票代码的板块解析**（P4）+ 复用重复 payload（P5）。预期：股票板块查询 5 请求 → 2~3 请求。

### 第二阶段（中优，预计 2~3 天）

5. **in-flight 合并**（P6）——缓存存 Promise；对同 turn 的重复查询只打一次上游（实测 5 并发相同查询 = 10 次上游 → 应为 2 次）。
6. **缓存加边界**（P8）——抽一个共享的 bounded LRU。
7. **批量场景关掉全局 skill 扫描**（P10）——cron / eval / gateway 每请求建 session 的地方传 `userSkills: 'whitelist-only'`，每 session 省 ~11ms。

### 第三阶段（低优，可随手做）

8. `Bun.hash` 替换非密码学哈希（P9）；`canonicalJson` memo；热路径去掉 `structuredClone`。
9. trust 层按 mtime/size 缓存（P7）。
10. 构建加 `--minify`（实测 −8.6% 体积 / ~−8% 启动，4 轮无一翻转）；`cosineSim` 的 query 范数提到循环外。

### 验收方式

每个改动都应配套可复现的基线对比。本次分析建立的脚本可直接复用：

```bash
bun scripts/perf/verify-all.ts            # 闸门串行化 / 并发容忍度 / 哈希（已改用预热+交错）
bun scripts/perf/bench-chain.ts           # 板块查询逐请求打点
bun scripts/perf/bench-screener-hosts.ts  # 筛选器按主机拆分的排队来源
bun scripts/perf/bench-mirror-stable.ts   # 闸门 vs 原始并发对比
bun scripts/perf/bench-retry-decompose.ts # 真实失败路径的闸门入场次数与耗时分解
bun scripts/perf/bench-cooldown-shared.ts # 冷却按 host 连坐的爆炸半径
bun scripts/perf/bench-counter.ts         # resetsBeforeCooldown 的武装语义
bun scripts/perf/bench-classify.ts        # HostThrottleError → permanent 的分类后果
bun scripts/perf/bench-overlap.ts         # 退避与闸门间隔是重叠还是相加
bun scripts/perf/bench-inflight.ts        # in-flight 缺失造成的重复上游调用
bun scripts/perf/bench-skillscope.ts      # 全局 skill 扫描的 session 开销
bun scripts/perf/bench-skillscan.ts       # 底层 SKILL.md 扫描成本
bun scripts/perf/bench-dup2.ts            # get_sector_data 的请求去重（stub 回放真实响应）
bun scripts/perf/bench-board-undefined.ts # 股票代码做板块解析必然失败
bun scripts/perf/bench-session.ts         # createSession 耗时 + 内存基线
bun scripts/perf/bench-mem.ts             # session 数 × RSS 增长
bun scripts/perf/bench-fs.ts              # 文件读取策略对比（stat vs 全读）
bun scripts/perf/bench-vec2.ts            # 向量检索能否省掉 query 范数
bun scripts/perf/bench-vector.ts          # Float32Array 路径是否更快（实测无收益）
bun scripts/perf/bench-stable.ts          # 哈希 / 序列化的稳定测量（预热+交错）
bun scripts/perf/bench-trust.ts           # 包哈希成本
bun scripts/perf/tla/                     # --bytecode 不支持顶层 await 的最小复现
bun scripts/perf/repro-test-seam-bypass.ts      # P11：注入的 fetcher 被绕过，真实出网
bun scripts/perf/bench-seam-bypass-latency.ts   # P11：这条绕过路径的耗时分布（140~5655ms）
bun scripts/perf/verify-seam-fix.ts             # P11：透传 fetcher 后 seam 恢复（已实测有效）
```

> 所有脚本都能从**任意 cwd** 运行（路径基于 `import.meta.url` 解析到仓库根），
> 不再依赖 `/tmp` 或"必须在仓库根执行"这类隐含前提。

**尚未自动化的部分**：构建产物体积/启动对比（§10.2）与 `--bytecode` 复现目前靠手工跑，
因为它们需要真实 `bun build --compile`（数十秒级）。若要进 CI，建议单独开一个
`perf` job 而不是塞进现有 20 项 matrix。

**建议补两条守门测试**：

1. **同一主机的 N 个独立请求不应被串行化**（当前的 `host-request-gate.ts` 会失败这条）。
2. **一条 path 的 reset 不应让同主机的其他 path 进入冷却**（当前会失败，见 `bench-counter.ts` C 组）。
3. **注入 fetcher 后不得有任何请求经由全局 `fetch` 出网**（当前的 `quote.ts:433` 会失败这条，
   检测形状见 `repro-test-seam-bypass.ts`）。

---

## 附录：关键文件索引

| 文件 | 关注点 |
|---|---|
| `packages/pi-observability/src/host-request-gate.ts` | 闸门实现（P1/P2/P3 的根因） |
| `packages/pi-market-data/src/market-structure-eastmoney.ts` | 板块查询（P4/P5） |
| `packages/pi-market-data/src/screen-eastmoney.ts` | 筛选器、板块解析、进程级缓存（P6/P8） |
| `packages/pi-market-data/src/quote.ts` | 报价缓存 + 重试（P3/P6/P8） |
| `packages/pi-market-data/src/history.ts` | 日线 + 限流器 |
| `packages/pi-resource-composition/src/plugin-trust.ts` | 会话级哈希（P7） |
| `packages/pi-storage/src/index.ts` | `canonicalJson` / 审计链（P9） |
| `packages/memory/src/search.ts` | 向量检索（轻微优化空间） |
| `packages/pi-management/src/server.ts` | 已在用 `Bun.serve` ✅ |
| `packages/pi-observability/src/provider-retry.ts` | 重试分类（`HostThrottleError` → `permanent`，P3） |
| `packages/pi-session/src/agent-session-factory.ts:352-364` | 每次 `createSession` 的 trust 校验与 skill 扫描（P7/P10） |
| `packages/pi-app/src/entry.ts` | 0 个 col-0 await（实测），`--bytecode` 失败真实根因是 Bun 1.4.1 默认 cjs 格式不兼容，加 `--format=esm` 即可解锁（§10.2） |
| `package.json:15` | `build` 脚本（未加 `--minify`） |
