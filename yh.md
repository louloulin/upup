# UpUp 性能问题分析与优化方案

> 分析日期：2026-09-18
> 分析范围：market-data / finance-sdk / session / observability / storage / memory 热路径
> 方法：直接读源码 + 在真实进程内实测（每项结论都带可复现的测量命令与数字）
> 环境：Bun 1.4.1 (macOS arm64) · Node 24.16.0 · 实测时 `push2.eastmoney.com` 正处于限流窗口

本文所有数字都是本机实测值，不是估算。评测脚本放在 `/tmp/upup-perf/`，可重跑。

---

## 0. 结论速览

按影响排序，共发现 **10 个性能问题**（3 个高优、4 个中优、3 个低优）：

| # | 问题 | 位置 | 实测影响 | 优先级 |
|---|---|---|---|---|
| P1 | 每主机请求闸门强制串行 + 500ms 间隔，且**全进程共享** | `packages/pi-observability/src/host-request-gate.ts` | 5 个请求 ~2000ms（=4×500ms，实测 2012/2056ms）；5 个独立 50ms 任务被串成 2056ms | 🔴 高 |
| P2 | 闸门串行化**远严于**上游真实容忍度 | 同上 | 镜像主机 8 并发 275~303ms 全成功；同样 5 请求经闸门 2055~2067ms，慢 **2.0x~37.2x**（随网络波动） | 🔴 高 |
| P3 | 闸门冷却**按 host 而非 path** 记，2 次无关 reset 连坐整台主机 180s；`HostThrottleError` 又被判成 `permanent` 掐断重试 | `packages/pi-observability/src/host-request-gate.ts:107`；`provider-retry.ts:92` | 2 次无关失败 → 同主机**所有健康 path** 在 180s 内全部快速失败（实测） | 🔴 高 |
| P4 | `get_sector_data` 对股票代码做**必然失败**的板块解析 | `market-structure-eastmoney.ts:302` | 每次股票查询白打 1 次 `searchapi` suggest（实测返回值 `undefined`） | 🟠 中 |
| P5 | 同一 URL 被重复读取（resolve + 再取一次） | `market-structure-eastmoney.ts:240` / `:264` | 每次股票行业查询重复 1 次 `push2` stock/get（实测 x2） | 🟠 中 |
| P6 | 无 in-flight 请求合并 | `screen-eastmoney.ts` / `quote.ts` | N 个相同并发查询 = N 倍上游调用 | 🟠 中 |
| P7 | `verifyPiResourceTrust` 每次都对全包做 SHA-256，无缓存 | `plugin-trust.ts:36/102` | 实测 0.5~8.4ms/包（随文件系统缓存波动），每次 `createSession` 都重算 | 🟡 低 |
| P8 | 缓存无淘汰上限 | `screen-eastmoney.ts:626`、`quote.ts:107`、`pi-research/src/index.ts:50` | 长驻进程堆持续增长 | 🟡 低 |
| P9 | `canonicalJson` 递归 + 排序 + 重复序列化 | `packages/pi-storage/src/index.ts:5` | 86.6~95.9µs/op，是 `JSON.stringify` 的 **3.7x~4.2x** | 🟡 低 |
| P10 | 每个 session 都重扫用户全局 skill 库（162 个 SKILL.md / 1.3MB） | `@upup/pi-session` → Pi resource loader | `userSkills: include` 41ms vs `whitelist-only` 28ms，**+13ms / session（1.46x）** | 🟠 中 |

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
bun /tmp/upup-perf/verify-all.ts
```

```
1. 5 个空操作请求过闸门        : 2012ms   (= 4 × 500ms 纯间隔)
2. 5 个并发 50ms 任务过同一闸门: 2056ms   (并行应约 50ms → 慢 41x)
3. 同一主机 4 请求             : 1505ms
   不同主机 4 请求             : 2ms      ← 证明瓶颈是"同主机共享一条队列"
```

第 2 项最能说明问题：**5 个彼此毫无关系的任务，只因为都访问同一主机，就被强制串成一条 2 秒的队列。**（4 个空操作也要 2 秒，因为它等的不是网络，是那 500ms 的间隔。）

### 1.3 真实业务影响

对 `querySectorSnapshot` 做逐请求打点（`bun /tmp/upup-perf/bench-chain.ts`）：

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

对筛选器（最重的路径），按主机拆开看才能看清排队来源（`bun /tmp/upup-perf/bench-screener-hosts.ts`）：

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

对比同样 5 个请求（`bun /tmp/upup-perf/bench-mirror-stable.ts`，两轮）：

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

（这三行是 Bun `fetch` 本身的并发能力测量，见 §8。）

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

对 `getEastmoneyQuote` 的真实形状（`read(live)` → 失败 → `read(mirror)`，各自带一次 `EASTMONEY_RETRY`）打点（`bun /tmp/upup-perf/bench-retry-decompose.ts`）：

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
3. **重试退避与闸门间隔是重叠的（取较长者），不是相加。** 实测（`bun /tmp/upup-perf/bench-overlap.ts`）：
   ```
   baseDelayMs=100: total=502ms    ← 闸门 500ms 主导
   baseDelayMs=300: total=503ms    ← 闸门 500ms 主导
   baseDelayMs=600: total=601ms    ← 退避 600ms 主导
   ```
4. 因此 1203ms 的真实分解是：**live 闸门 ~600ms + mirror 闸门 ~600ms（两个主机串行，各自 2 次入场）**，而不是"4 × 500ms"。

#### 2.2 真正的危害：冷却的爆炸半径是整台主机

比"重试多花 1 秒"严重得多的是第 1 条事实的推论：**任意 2 个无关请求各 reset 一次，就会让同一主机上所有健康接口在 180 秒内全部快速失败。**

实测 `bun /tmp/upup-perf/bench-cooldown-shared.ts`（两个不同 caller 各失败一次，然后发两个完全健康的请求）：

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
（`bun /tmp/upup-perf/bench-board-undefined.ts`）：

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

端到端实测（`bun /tmp/upup-perf/bench-dup2.ts`，stub 会把真实响应形状回放：
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

**实测影响**（`bun /tmp/upup-perf/bench-inflight.ts`，5 个并发相同查询）：

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

实测（`bun /tmp/upup-perf/bench-trust.ts`，多次运行显示数值随文件系统/page cache 波动）：

```
                  files   size     多次实测区间
pi-market-data     36    0.4MB     0.1 ~ 8.4ms
pi-finance-sdk     63    0.4MB     3.0 ~ 3.3ms
pi-session         27    0.2MB     0.5 ~ 4.0ms
packages (all)                     24.6 ~ 65.6ms
```

> 该脚本必须在**仓库根目录**下运行才能看到文件数（在别处 `packages/...` 路径不存在，
> 会静默打印 `0 files`）。这是脚本的相对路径依赖，不是测量误差。

单次不足为患，但它发生在**每次 `createSession`** 上。实测会话创建（`bun /tmp/upup-perf/bench-session.ts`）：

```
createSession #1: 377ms   ← 冷启动
createSession #2:  42ms   ← 热
createSession #3:  37ms
```

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

## 6.5 会话级 skill 扫描（P10）

AGENTS.md 的 "Known Pi-Integration Gaps" 已记录"每个 session 默认从 `~/.agents/skills` 加载全局 skills"，
但此前没有量化过代价。实测（`bun /tmp/upup-perf/bench-skillscope.ts`，预热后交错采样 6 次）：

```
userSkills=include        : 49, 39, 42, 40, 39, 37   avg=41ms
userSkills=whitelist-only : 31, 28, 27, 27, 29, 27   avg=28ms
```

即 **+13ms / session（1.46x）**，且这只是在单包（`pi-market-data` + `pi-finance-sdk`）下测的。
底层扫描成本（`bun /tmp/upup-perf/bench-skillscan.ts`）：

```
/Users/louloulin/.agents/skills: 162 skills, 1331KB SKILL.md read in 4.9ms
/Users/louloulin/.codex/skills:   2 skills,   40KB SKILL.md read in 0.8ms
```

**注意**：41ms vs 28ms 的差额（13ms）明显大于纯文件读取的 4.9ms，因为 Pi 还要为每个 skill
解析 YAML frontmatter、构造 metadata 并注入 system prompt。**这是"扫描 + 解析 + 组 prompt"的总和。**

影响面取决于调用密度：

- CLI 交互式：每个 session 一次，13ms 无感。
- `upup daemon` / gateway / cron / eval 批量跑：session 数越多越明显（1000 个 session ≈ 13 秒）。

**建议**：
- 短生命周期、批量场景（cron / eval / gateway 的每个请求各建一个 session）显式传 `userSkills: 'whitelist-only'` 或 `spec.skills` 白名单。
- 若要保留全局 skill，可在 Pi resource loader 之上加一层**按目录 `mtime` 的记忆化**，避免每次重新解析 YAML。

---

## 7. 序列化与哈希（P9）

`packages/pi-storage/src/index.ts:5` 的 `canonicalJson` 是递归 + 每层 `Object.keys().sort()` + 字符串拼接，且在 `hashDossier`、审计链 `append`、`verify` 里被反复调用。

实测（`bun /tmp/upup-perf/bench-stable.ts`，含 200 条 metrics 的 dossier，预热 + 交错计时取均值）：

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

## 8. Bun 最佳性能优化方案

以下为 Bun 官方文档（bun.com/docs，经 Context7 `/oven-sh/bun` 核对）确认的能力，结合 UpUp 现状给出可落地建议。
每条都在本机 Bun 1.4.1 上实测过，**"无收益"的项已明确标出，不要为了"用上 Bun 特性"去迁移。**

### 8.1 立刻可用的运行时能力

| 能力 | 用途 | UpUp 现状 |
|---|---|---|
| `Bun.hash`（wyhash） | 非密码学哈希，实测 **11.2x** 快于 sha256（0.0059ms vs 0.0662ms / 200KB） | 未使用；可替换缓存键/变更检测 |
| `Bun.CryptoHasher` | 密码学哈希；实测与 `node:crypto` **完全持平**（0.0676 vs 0.0669ms） | **无需迁移（零收益）** |
| `Bun.file(path).size` | stat-only，实测 **4.4µs/4 文件**（比真正读文件快 ~10x） | 可用于 trust 缓存的 mtime/size 预检 |
| `Promise.all` + `Bun.file().arrayBuffer()` | 并发读，实测 **43.0µs/4 文件** = 与 `readFileSync`（44.8µs）持平 | 已是最快路径；**注意 `await Bun.file().text()` 逐个读反而慢到 124µs（2.8x）**——不要用串行 `await` 读多文件 |
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

### 8.2 构建产物

当前构建命令**没有 minify**（`package.json:15`）：

```
bun build --compile --target=bun --outfile=dist/upup src/index.tsx --external=playwright ...
```

**实测结论（不是估算）**：对同一份源码编译两个二进制，各跑 20 次取均值——

```
upup-plain (现状)     : 81.0MB   180.0 / 181.0 ms/run   (两轮)
upup-min  (--minify)  : 72.6MB   169.7 / 168.0 ms/run   (两轮)
                                   → 体积 −8.4MB (−10.4%)，启动 −11ms (−6%)
```

**建议加 `--minify`**：零风险，稳定省 10% 体积 + 6% 启动时间。`--sourcemap=external` 可另外保留可调试性。

#### ⚠️ `--bytecode` 目前在 UpUp 上**不可用**（实测发现的真实阻塞）

Bun 文档推荐的 `--bytecode`（把 JS 解析从运行时挪到构建期）在 UpUp 入口上**直接构建失败**：

```
$ bun build --compile --bytecode --target=bun --outfile=/tmp/x src/index.tsx --external=playwright ...
error: Failed to generate bytecode for ./x
```

最小复现（`/tmp/upup-perf/tla/`）证实根因是 **`--bytecode` 不支持顶层 `await`（TLA）**。
真实入口只打印上面那一行 `Failed to generate bytecode`（不指出具体文件），
而在最小 TLA 文件上能看到更直白的诊断：

```
const x = await Promise.resolve(1);                     → --bytecode 报错
const main = async () => { await ... }; void main();    → --bytecode 成功 ✅
```

```
error: "await" can only be used inside an "async" function
error: Unexpected .
```

**只有 `--bytecode` 构建会触发失败**——普通 `--compile` 与 `--compile --minify`
在同样的 TLA 入口上都能成功（`upup-min` 就是带 TLA 构建出来的）。
而 `packages/pi-app/src/entry.ts` 有 **34 处顶层 await**
（`await applyProperLockfileBunShim()`、各处 `await runPiNativeCli(...)` 等）。

**已实测：不值得为此重构。** 在一个等价的、无 TLA 的合成入口上对比 `--bytecode` 与普通编译：

```
synth-plain   (无 bytecode) : 冷 0.47s / 热 0.00~0.01s
synth-bytecode              : 冷 0.44s / 热 0.00s
                              → 差异在测量噪声内，**没有可观测收益**
```

所以正确结论是：**跳过 `--bytecode`，只加 `--minify`。** 若将来 Pi runtime 把入口改成
async IIFE（去掉 TLA），可以再测一次——但按现有数据，收益预计仍然很小。

`--compile` 已经把 ~184MB 的运行时内存基线固定下来（见 8.3），是合理的发布形态。

### 8.3 内存基线（实测）

```
startup RSS: 204MB
after session #1: 348MB   (heapUsed 55MB)
after session #2: 355MB   (heapUsed 55MB)
after session #3: 374MB   (heapUsed 58MB)
after session #4: 378MB   (heapUsed 58MB)
after session #5: 382MB   (heapUsed 60MB)
after disposing all: 382MB   ← 释放后 RSS 不回落（JSC 保留页）
```

**观察**：RSS 从 204MB 涨到 382MB，增量（178MB）里大头是 **session #1 的 144MB**
（Pi runtime + package 图 + skill/package 解析的一次性成本），之后每个 session 只增 ~7MB。
`dispose()` 后 RSS 不回落属于正常 GC 行为，不是泄漏。

但结合 P7/P8，长驻进程（daemon/gateway）值得加一个定期 RSS 观测——因为**缓存无上限（P8）
叠加这个 ~7MB/session 的增量**，长期才是真正需要盯的地方。

### 8.4 CPU 密集路径

仓库里唯一的 worker 用法是 `pi-portfolio/src/duckdb.ts:95`（DuckDB wasm worker）。实测向量检索（memory 的 `cosineSim`，`packages/memory/src/search.ts:301`）**并不慢**：

```
cosine over 5000 x 1536d:
  重算两个范数      : 6.0 ~ 6.2ms
  提升 query 范数   : 5.3 ~ 5.5ms   (1.08x ~ 1.14x)
```

**6ms / 5000 文档完全不需要 worker 化**，也不值得改算法。

`packages/memory/src/search.ts:301` 的 `cosineSim(a, b)` 确实把 `a` 的范数在每个文档里重算了（共 5000 次），理论上可把它提到循环外（`search.ts:324` 调用处）。但实测收益只有 **1.08x~1.14x**（6.0ms → 5.5ms）——因为 `nb` 仍要算、`sqrt` 本身很便宜。**这项可以顺手做，但不值得单独立项。**

> 另有一条更省事的观察：把整条向量改成 `Float32Array` 路径**实测 1.01x，等于没有收益**
> （`bun /tmp/upup-perf/bench-vector.ts`：两条路径都是 10.9ms）。不要在向量表示上做文章。

---

## 9. 优先级与实施路线

### 第一阶段（高优，预计 3~5 天，收益最大）

1. **闸门改并发闸门**（P1/P2）——把 host 粒度改成 `host+path`，串行+500ms 间隔改成并发 4~6 + 令牌桶。预期：板块/筛选类工具从 2~2.5s 降到 0.3~0.6s。
2. **冷却键从 host 改成 `host+path`**（P3），并让 `HostThrottleError` 按 `transient` 分类或携带 `retryAfterMs` 短路。预期：单条被限流的 path 不再连坐整台主机 180s，这是本阶段**改动最小、收益最大**的一条。
3. **重试移到闸门外层**（P3），让一次逻辑请求的重试共享一次入场；同时修掉 `maxAttempts: 3` 因冷却武装而永远只跑 2 次的死配置。
4. **`get_sector_data` 跳过股票代码的板块解析**（P4）+ 复用重复 payload（P5）。预期：股票板块查询 5 请求 → 2~3 请求。

### 第二阶段（中优，预计 2~3 天）

5. **in-flight 合并**（P6）——缓存存 Promise；对同 turn 的重复查询只打一次上游（实测 5 并发相同查询 = 10 次上游 → 应为 2 次）。
6. **缓存加边界**（P8）——抽一个共享的 bounded LRU。
7. **批量场景关掉全局 skill 扫描**（P10）——cron / eval / gateway 每请求建 session 的地方传 `userSkills: 'whitelist-only'`，每 session 省 ~13ms。

### 第三阶段（低优，可随手做）

8. `Bun.hash` 替换非密码学哈希（P9）；`canonicalJson` memo；热路径去掉 `structuredClone`。
9. trust 层按 mtime/size 缓存（P7）。
10. 构建加 `--minify`（实测 −10.4% 体积 / −6% 启动）；`cosineSim` 的 query 范数提到循环外。

### 验收方式

每个改动都应配套可复现的基线对比。本次分析建立的脚本可直接复用：

```bash
bun /tmp/upup-perf/verify-all.ts            # 闸门串行化 / 并发容忍度 / 哈希（已改用预热+交错）
bun /tmp/upup-perf/bench-chain.ts           # 板块查询逐请求打点
bun /tmp/upup-perf/bench-screener-hosts.ts  # 筛选器按主机拆分的排队来源
bun /tmp/upup-perf/bench-mirror-stable.ts   # 闸门 vs 原始并发对比
bun /tmp/upup-perf/bench-retry-decompose.ts # 真实失败路径的闸门入场次数与耗时分解
bun /tmp/upup-perf/bench-cooldown-shared.ts # 冷却按 host 连坐的爆炸半径
bun /tmp/upup-perf/bench-counter.ts         # resetsBeforeCooldown 的武装语义
bun /tmp/upup-perf/bench-classify.ts        # HostThrottleError → permanent 的分类后果
bun /tmp/upup-perf/bench-overlap.ts         # 退避与闸门间隔是重叠还是相加
bun /tmp/upup-perf/bench-inflight.ts        # in-flight 缺失造成的重复上游调用
bun /tmp/upup-perf/bench-skillscope.ts      # 全局 skill 扫描的 session 开销
bun /tmp/upup-perf/bench-stable.ts          # 哈希 / 序列化的稳定测量（预热+交错）
bun /tmp/upup-perf/bench-trust.ts           # 包哈希成本（须在仓库根运行）
```

建议把这些脚本固化进 `scripts/`，并加两条守门测试：

1. **同一主机的 N 个独立请求不应被串行化**（当前的 `host-request-gate.ts` 会失败这条）。
2. **一条 path 的 reset 不应让同主机的其他 path 进入冷却**（当前会失败，见 `bench-counter.ts` C 组）。

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
| `packages/pi-app/src/entry.ts` | 34 处顶层 await → `--bytecode` 不可用的原因（§8.2） |
| `package.json:15` | `build` 脚本（未加 `--minify`） |
