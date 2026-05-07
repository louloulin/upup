# Debugging Guide

Common issues and solutions.

## API Key Issues

### Error: "API key not found"
```bash
# Check keys are set
bash .claude/hooks/validate-api-keys.sh

# Set a key
export DEEPSEEK_API_KEY="your-key"
```

### Error: "Tushare rate limit exceeded"
```bash
# Reset rate limit
bash .claude/hooks/rate-limit.sh reset tushare
```

## Tool Errors

### Error: "Tool not found"
- Check tool is registered in `src/tools/registry.ts`
- Ensure export is added to tool category index

### Error: "Tool execution failed"
- Check tool implementation
- Verify API credentials
- Check network connectivity

## Skill Errors

### Error: "Skill not found"
- Verify SKILL.md exists in `.claude/skills/` or `src/skills/`
- Check skill name matches in frontmatter

### Error: "Skill not triggered"
- Check skill description includes relevant keywords
- Verify skill is discovered by `discoverSkills()`

## Memory Issues

### Memory not persisting
- Check `.claude/memory/` directory exists
- Verify write permissions

### Memory selection poor
- Improve skill descriptions
- Add more relevant keywords

## Test Failures

### Run specific test
```bash
bun test src/path/to/test.ts
```

### Run with verbose output
```bash
bun test --reporter=verbose
```

## Performance Issues

### Slow responses
- Check cache is working
- Review rate limit settings
- Check network latency

### High token usage
- Use `haiku` model for simple queries
- Enable response caching

## Development

### Start dev server
```bash
bun run src/index.tsx
# or with watch mode
bun --watch run src/index.tsx
```

### Clear all caches
```bash
bash .claude/hooks/cache.sh clear
bash .claude/hooks/rate-limit.sh reset
```

### Check system status
```bash
bash .claude/hooks/validate-api-keys.sh --env
```

## Logging

### Enable debug output
Set environment variable:
```bash
export DEXTER_DEBUG=true
```

### View recent logs
Check console output for:
- `[Tool]` - Tool execution
- `[Agent]` - Agent actions
- `[Skill]` - Skill invocations
- `[Cache]` - Cache operations

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `ENOTFOUND` | Network error | Check internet connection |
| `401 Unauthorized` | Invalid API key | Verify API key |
| `429 Too Many Requests` | Rate limited | Wait and retry |
| `ECONNREFUSED` | Server down | Check service status |
| `timeout` | Request timeout | Retry or increase timeout |

Last Updated: 2026-05-07
