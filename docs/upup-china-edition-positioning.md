# UpUp (涨涨) — 中国版定位白皮书 v1.0

> **本文件是 UpUp "中国版 dexter" 定位的权威表述。**
> 任何与本文件冲突的旧描述,以本文件为准。
> 发布日期:2026-06-12 · 最近复核:2026-06-12
> 引用源: [openspec/changes/upup-vs-dexter-comprehensive-audit-and-doc-refresh/docs/upup-vs-dexter-audit.md](./openspec/changes/upup-vs-dexter-comprehensive-audit-and-doc-refresh/docs/upup-vs-dexter-audit.md)
> 反馈: 仓库 issue / PR / `security@upup.dev`

---

## 1. 为什么是"中国版"

UpUp (涨涨) 不是 dexter 的中文化翻译,也不是 dexter 的换皮。它从 [virattt/dexter](https://github.com/virattt/dexter) fork,但经过 8 轮 Sprint 持续打磨后,已经成为一个**针对中文投研场景独立构建**的 AI 智能体。之所以需要"中国版",基于以下三个不可调和的现实:

### 1.1 市场现实:A 股 / 港股 / 中文研报是独立的数据与表达体系

- 上游 dexter 的数据源是 [Financial Datasets](https://financialdatasets.ai),以美股为主,A 股 / 港股覆盖极弱;
- A 股有独立的财报披露规则(沪深北三所)、行业分类(申万 / 中信 / Wind)、估值口径(PE-TTM / PB / PS)、资金流向(北向 / 龙虎榜 / 大宗交易);
- 中文研报有独特的句法与体例(同比 / 环比、毛利率拆解、合同负债、扣非净利),英文 prompt 直接套用会丢失这些语义。

**UpUp 的解法**:自建 A 股数据栈(Tushare Pro + AKShare + 东方财富 fallback),覆盖 5000+ 标的,50 个投资分析 skill 全部支持中英双语描述,所有 prompt 默认中文目标语言。

### 1.2 语言现实:终端用户、监管语境、社区交流都以中文为主

- 个人投研用户主要在中文环境(终端 `LANG=zh-CN.UTF-8`)使用;
- 监管语境、券商研报、社交媒体讨论全部是中文;
- LLM 在中文金融场景的"地气"远胜英文 prompt 直接套用。

**UpUp 的解法**:全栈双语(`src/i18n/strings.ts`, 56+ 强类型 key,缺译编译 fail),组件 / Prompt / Skill 描述 / 命令文案 100% 双语覆盖;默认 LLM provider 推荐 DeepSeek(中文金融场景性价比高)。

### 1.3 监管现实:不做真金白银的自动交易

- 中国境内对"投资顾问""证券咨询""自动化交易"均有牌照要求;
- 个人 CLI 工具如果默认对接券商 / 自动下单,会触碰合规红线;
- 上游 dexter 的 README 自带"教育 / 娱乐用途"免责条款,UpUp 沿用并加强。

**UpUp 的解法**:`/invest` 5 阶段工作流产生的是**研究结论 + 数据卡片 + 风险提示**,不直接产生交易指令;`src/tools/trading/` 仅用于回测、模拟盘、信号生成,不接真券商 API。

---

## 2. "中国版"意味着什么 —— 三项明确承诺

### 承诺 1:A 股原生数据栈

- Tushare Pro 作为主数据源(`TUSHARE_TOKEN` 环境变量启用)
- AKShare 作为免费 fallback(无需 token,自动启用)
- 东方财富作为兜底
- 覆盖 5000+ A 股 / 港股 / 美股 / 加密标的
- 北向资金、龙虎榜、大宗交易、融资融券、ETF、REITs、债券全维度支持

### 承诺 2:中文优先 + 双语对称

- `src/i18n/strings.ts` 强类型 key,EN + zh-CN 必须同时存在,缺一个测试 fail
- 所有 skill 描述、组件文案、prompt 模板、命令帮助 100% 双语
- 默认 locale 从 `LANG` / `LC_ALL` 推断,可用 `UPSTREAM_LOCALE` 覆盖
- README 默认入口是中文(`README_CN.md`),README.md 作为英文用户入口

### 承诺 3:研究输出,不替用户做投决

- `/invest` 5 阶段工作流产出"数据 + 估值 + 回测 + 风险 + 引用"
- Plan Mode 在执行前先展示 2-10 步 plan,等用户确认再跑
- 默认 3 层权限防护(静态白名单 + 工具级模式 + 会话级模式,默认 `ask`)
- 永不下真单、永不写持仓文件到券商、永不接 IB / 同花顺 / 雪球交易接口
- 免责条款与上游 dexter 保持一致,本仓库 RESEARCH-ONLY 立场

---

## 3. "中国版"明确**不做**的事

为了避免误用,以下边界**必须**被外部读者理解:

### 3.1 不做专有 LLM

- UpUp 不会自建 / 微调 / 训练自有 LLM
- 全部对话、规划、推理都委托给上游 LLM provider(OpenAI / Anthropic / Google / xAI / Moonshot / DeepSeek / OpenRouter / Ollama — 默认 provider 翻转为 DeepSeek
- 这与上游 dexter 的策略一致

### 3.2 不做付费 tier / SaaS 锁定

- 仓库 MIT 协议,可自由 fork / 二次开发 / 商用 / 卖服务
- 不卖云端 SaaS,不锁用户数据
- 所有数据(自选股 / 持仓 / 计划 / 记忆)默认存本地 `~/.upup/`

### 3.3 不做真金白银交易

- 永不下真单
- 永不在用户的券商账户内做任何动作
- 永不为任何券商 / 资管 / 投顾机构承担合规责任
- 永不在没有用户确认的情况下产生交易信号以外的任何"指令"

### 3.4 不复刻上游 dexter 的所有内容

- 我们**尊重**上游的 MIT 协议与归属
- 我们**不**镜像上游的所有 issue / PR / discussion
- 我们**不**改写上游已经写好的 prompt
- 我们**只**对中文投研场景真正需要的部分做扩展

---

## 4. 与上游的关系

| 维度 | 立场 |
|---|---|
| 协议 | MIT(同上游) |
| 归属 | 显著标注 "Forked from [virattt/dexter](https://github.com/virattt/dexter)",保留 LICENSE |
| 上游贡献 | 整体金融研究框架、Tool registry、Agent loop、SKILL.md 协议、Ink + pi-tui 渲染层 |
| UpUp 独立贡献 | A 股数据栈、50 投资 skill、5 阶段工作流、4 runtime 插件、EN+zh-CN i18n、多 Agent、Session 2.0、Memory、16 workspace package |
| 上游同步 | 上游发布新版本时,在 PR 中评估 cherry-pick(详见 `docs/sync-plan.md`) |
| 上游 issue | 不镜像;只在新功能/重大 bug 时通知上游 |

---

## 5. 合规与免责

UpUp 是**研究工具**,不是投资顾问。所有输出仅供学习与决策辅助,不构成投资建议。

- 不构成 financial / investment / tax / legal advice
- 不保证准确性、完整性、适用性
- 输出可能错误、不完整、过期
- 作者与贡献者不对任何投资损失负责
- 决策前请咨询持牌投资顾问
- 过往业绩不代表未来表现

完整免责条款见 [README.md#-disclaimer](./README.md#-disclaimer) 与 [SOUL.md](./SOUL.md)。

---

## 6. 8 维度中国版优势速查

详细数据与可复现命令见 [upup-vs-dexter-audit.md](./openspec/changes/upup-vs-dexter-comprehensive-audit-and-doc-refresh/docs/upup-vs-dexter-audit.md)。以下是 8 维度速查:

| # | 维度 | UpUp | 上游 dexter | 倍数 |
|---|---|---:|---:|---:|
| 1 | 代码体量 (src 行数) | 237,914 | 21,899 | 10.9× |
| 2 | 工具数 (src/tools/*.ts) | 296 | 53 | 5.6× |
| 3 | 投资 skill (SKILL.md + bundled) | 50 + 14 | 3 + 0 | 21.3× |
| 4 | 5 阶段 /invest 工作流 | ✅ | ❌ | n/a |
| 5 | 4 runtime 插件 | ✅ (bun/jiti/wasm/mcp) | ❌ | n/a |
| 6 | i18n (EN + zh-CN) | ✅ | ❌ | n/a |
| 7 | Session 2.0 / Plan Mode | ✅ | ❌ | n/a |
| 8 | Workspace 生态 (multi-agent / KAIROS / Bridge / 15 packages) | ✅ | ❌ | n/a |

---

## 7. 反馈与贡献

- 仓库: <https://github.com/louloulin/upup>
- 镜像: <https://gitcode.com/lumosaigroup/upup>
- 文档: [docs/index.md](./docs/index.md)
- 安全: [SECURITY.md](./SECURITY.md)
- 贡献: [CONTRIBUTING.md](./CONTRIBUTING.md)
- 行为准则: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
