# @upup/hooks

Rate limiting, caching, and API validation utilities.

## Installation

```bash
npm install @upup/hooks
# or
bun add @upup/hooks
```

## Features

- **Rate Limiting**: Track API call intervals and prevent rate limit errors
- **Caching**: TTL-based response caching to reduce API calls
- **API Validation**: Check required environment variables
- **Zero Dependencies**: No external runtime dependencies

## Quick Start

```typescript
import { checkRateLimit, cacheGet, cacheSet, validateRequiredKeys } from '@upup/hooks';

// Rate limit API calls
const wait = await checkRateLimit('openai', 0.5);
if (wait > 0) await new Promise(r => setTimeout(r, wait));
recordRateLimit('openai');

// Cache responses
const cached = cacheGet('api', 'stock-aapl');
if (!cached) {
  const data = await fetchStockData('AAPL');
  cacheSet('api', 'stock-aapl', data, 300); // TTL: 300s
}

// Validate API keys
const { valid, missing } = validateRequiredKeys();
if (!valid) console.error('Missing keys:', missing);
```

## Rate Limiting

```typescript
import { checkRateLimit, recordRateLimit, resetRateLimit } from '@upup/hooks';

// Check before making request
const wait = await checkRateLimit('openai', 0.5); // 0.5s interval
if (wait > 0) {
  await new Promise(r => setTimeout(r, wait));
}

// Record after request
recordRateLimit('openai');

// Reset all limits
resetRateLimit();
```

## Caching

```typescript
import { cacheGet, cacheSet, cacheClear, getCacheStats } from '@upup/hooks';

// Get cached value
const cached = cacheGet('stock', 'AAPL');
if (cached) {
  console.log('From cache:', cached);
} else {
  const data = await fetchStock('AAPL');
  cacheSet('stock', 'AAPL', data, 60); // 60s TTL
}

// Clear namespace
cacheClear('stock');

// Get statistics
const stats = getCacheStats();
console.log(`Total entries: ${stats.totalEntries}`);
```

## API Validation

```typescript
import { checkApiKeys, validateRequiredKeys } from '@upup/hooks';

// Check specific keys
const keys = checkApiKeys();
keys.forEach(({ key, present, required }) => {
  console.log(`${key}: ${present ? '✓' : '✗'} ${required ? '(required)' : '(optional)'}`);
});

// Validate required keys
const { valid, missing } = validateRequiredKeys();
if (!valid) {
  console.error('Missing required keys:', missing);
}
```

## Configuration

```typescript
import { loadHooksConfig, getHooksConfig, setHooksEnabled } from '@upup/hooks';

// Configure
loadHooksConfig({
  enabled: true,
  rateLimit: {
    enabled: true,
    interval: 0.5, // seconds
    providers: ['openai', 'deepseek'],
  },
  cache: {
    enabled: true,
    ttl: 3600, // seconds
    maxSize: '100MB',
  },
  apiValidation: {
    enabled: true,
    requiredKeys: ['OPENAI_API_KEY'],
    optionalKeys: ['DEEPSEEK_API_KEY'],
  },
});

// Disable hooks
setHooksEnabled(false);

// Get current config
const config = getHooksConfig();
```

## License

MIT
