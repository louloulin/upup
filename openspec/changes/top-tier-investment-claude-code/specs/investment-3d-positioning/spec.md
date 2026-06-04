# Spec: 4 个唯一差异化定位 (investment-3d-positioning)

## Purpose

把 upup 在 AI 投研产品图谱中的"4 个唯一"差异化讲清楚——CLI-first / 完全开源 / 四市场全覆盖 / 多 Agent+KAIROS+Bridge 三件套。这是 v3 的"产品故事"spec,既是文档交付,也是 capability manifest 的元数据源。

## Requirements

### REQ-1: 4 个唯一清单

The system SHALL document and enforce these 4 unique positioning pillars:

1. **CLI-first Claude Code 形态**:唯一把 AI Agent 投研能力装进终端的;对开发者 / 技术派投资人天然友好
2. **完全开源 + 自托管**:不锁数据、不绑 SaaS;企业 / 合规场景刚需
3. **A 股 + 美股 + 港股 + 加密四市场全覆盖**:全市场投研;竞品大多只覆盖单一市场
4. **多 Agent + KAIROS + Bridge 三件套**:对标 loucode 全部深度吸收;在投研域独此一家

### REQ-2: 产品故事 (Sologan + 1 段话)

The README SHALL contain:

- **Sologan(≤ 30 字)**:"CLI 形态的 AI 投研 Claude Code — 多市场、开源、自托管"
- **1 段话(≤ 200 字)**:4 个唯一的浓缩表述
- **3 个 bullet**:对每类用户(散户 / 活跃 / 私募 / 企业)讲 1 句价值

### REQ-3: 能力 manifest 标注

Each CapabilityGroup in `src/agent/capability-manifest.ts` SHALL have:

- `markets?: Array<'a-share' | 'us' | 'hk' | 'crypto'>`:覆盖市场
- `openSource?: boolean`:是否开源(全部 true)
- `selfHosted?: boolean`:是否可自托管(全部 true)
- `cliFirst?: boolean`:是否 CLI-first(全部 true)
- `parity3Set?: boolean`:是否在多 Agent + KAIROS + Bridge 三件套中(逐项标注)

### REQ-4: README 强化

The main README SHALL:

- 开篇 1 段话讲清楚 4 个唯一
- 表格列出与竞品(AlphaSense / Hebbia / FinChat / 问财 / Choice)的差异化
- 链接到详细 spec(`openspec/changes/.../specs/investment-3d-positioning/`)
- 中文 README(`README_CN.md`)同步

### REQ-5: 部署文档强化

The deployment docs SHALL include:

- Docker / docker-compose 一键自托管示例
- 自托管配置文件示例(`.upup/settings.json`)
- 私有部署的安全建议(token / 防火墙 / 加密)
- 数据合规声明(本地存储,不上云,可选远程 sink)

### REQ-6: 竞品差异化对比表

The README SHALL include a comparison table:

| 能力 | AlphaSense | Hebbia | FinChat | 问财 | Choice | **UpUp** |
|------|-----------|--------|---------|------|--------|---------|
| CLI 形态 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 完全开源 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 自托管 | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ |
| A 股 | ❌ | ❌ | ⚠️ | ✅ | ✅ | ✅ |
| 美股 | ✅ | ✅ | ✅ | ❌ | ⚠️ | ✅ |
| 港股 | ⚠️ | ⚠️ | ⚠️ | ❌ | ✅ | ✅ |
| 加密 | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ |
| 多 Agent | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | ✅ |
| 持续监控 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| 远程协同 | ⚠️ | ❌ | ❌ | ❌ | ❌ | ✅ |

## Scenarios

### Scenario 1: 用户进入 GitHub 主页

- **Given**: 用户访问 upup GitHub 主页
- **When**: 滚动到 README 顶部
- **Then**:
  - 30 字 sologan
  - 1 段话 4 个唯一
  - 3 个 bullet 价值主张
  - 与竞品对比表
  - 安装命令

### Scenario 2: 用户在 CLI 中查看能力

- **Given**: 用户在 CLI 中查看 capability manifest
- **When**: 调用 `get_capabilities` tool
- **Then**: 返回的 manifest 包含 4 个唯一的元数据(每 group)

### Scenario 3: 私募用户评估

- **Given**: 私募用户在评估 upup
- **When**: 阅读 README
- **Then**: 看到"完全开源 + 自托管 + 私有部署"是关键差异化

## Dependencies

- `src/agent/capability-manifest.ts`(扩展字段)
- `README.md` / `README_CN.md`(更新)
- `docs/deployment.md`(新增或更新)
- 5 layer manifest spec(`claude-code-5layer`)

## Out of Scope

- 营销页面 / 落地页(README 是入口,不做 marketing site)
- 商业化定价 / 订阅(在 v4 商业化预备中)
