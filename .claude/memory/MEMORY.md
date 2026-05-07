# Dexter Memory

This file stores persistent knowledge across sessions.

## Project Overview

Dexter is an AI agent specialized for financial research, supporting both US stocks and Chinese A-shares.

### Core Capabilities
- **US Stock Analysis**: Financial data, DCF valuation, SEC filings, stock screening
- **A-Share Analysis**: Real-time prices, market structure, filings, screening
- **Macro Research**: China GDP, CPI, PMI, interest rates, forex
- **Web Search**: Exa, Perplexity, Tavily integration

### Architecture
```
src/
├── agent/           # Agent execution
├── skills/          # Built-in skills
├── tools/          # Tool implementations
├── mcp/            # MCP server integration
├── memory/         # AI-driven memory selection
├── state/          # Centralized state management
├── daemon/         # Background workers
├── hooks/          # Rate limiting, caching, validation
└── cron/           # Scheduled task system
```

## Coding Patterns

### TypeScript ESM
- Use `import` (not `require`)
- Add `.js` extension to imports: `import { x } from './x.js'`
- Use `type` keyword for type imports: `import type { X } from './x.js'`

### Tool Definition
```typescript
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const tool = new DynamicStructuredTool({
  name: 'my-tool',
  description: 'Tool description...',
  schema: z.object({ ... }),
  async func({ param }) { ... }
});
```

### Skill Frontmatter
```yaml
---
name: skill-name
description: When to use this skill...
model: sonnet  # Optional: sonnet, haiku, opus
user-invocable: true
argument-hint: "参数格式"
---
```

## API Keys

### Required
- `DEEPSEEK_API_KEY`: Primary model provider

### Optional
- `TUSHARE_TOKEN`: A-share data (Tushare Pro)
- `EXASEARCH_API_KEY`: Web search
- `PERPLEXITY_API_KEY`: Web search (alternative)
- `TAVILY_API_KEY`: Web search (fallback)
- `X_BEARER_TOKEN`: X/Twitter API

## Common Tasks

### Adding a New Skill
1. Create `.claude/skills/<name>/SKILL.md`
2. Add frontmatter with name, description, model
3. Implement skill logic in markdown

### Adding a New Tool
1. Create `src/tools/<category>/<tool-name>.ts`
2. Export from `src/tools/<category>/index.ts`
3. Register in `src/tools/registry.ts`

### Testing
```bash
bun test          # Run all tests
bun run src/index.tsx  # Start dev server
```

## Debugging

### Check API Keys
```bash
bash .claude/hooks/validate-api-keys.sh --env
```

### View Cache Stats
```bash
bash .claude/hooks/cache.sh stats
```

### Check Rate Limits
```bash
bash .claude/hooks/rate-limit.sh status
```

## Notes

- Skills in `.claude/skills/` override `src/skills/`
- Hook scripts are in `.claude/hooks/`
- Cache is stored in `~/.dexter/cache/`
- Rate limit state is in `~/.dexter/rate-limit.state`

Last Updated: 2026-05-07
