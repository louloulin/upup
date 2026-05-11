# @upup/memory

Memvid-based memory storage with BM25 search. No external embedding API dependency.

## Installation

```bash
npm install @upup/memory
# or
bun add @upup/memory
```

## Features

- **MV2 Storage**: Single-file, append-optimized storage
- **BM25 Search**: Fast keyword search without external APIs
- **RAG Synthesis**: Question answering with LLM (requires API key)
- **PII Masking**: Built-in PII detection and masking
- **Timeline**: Chronological memory retrieval

## Quick Start

```typescript
import { MemoryStore } from '@upup/memory';

const store = new MemoryStore({ path: './memory' });

// Store a memory
await store.put('Hello world', { name: 'greeting' });

// Search memories
const results = await store.search('hello');
console.log(results);

// Semantic search
const semantic = await store.semanticSearch('greetings', { minScore: 0.5 });

// Timeline
const timeline = await store.timeline(10);

// Close
await store.close();
```

## API Reference

### MemoryStore

```typescript
const store = new MemoryStore({
  path: './memory',      // Storage directory
  enableLex: true,      // Enable BM25 index
});

// Initialize
await store.initialize();

// Store
await store.put(content, { type: 'user', name: 'title' });
await store.putMany([{ content: '...' }]);

// Search
await store.search(query, { maxResults: 10 });
await store.semanticSearch(query, { minScore: 0.5 });

// RAG
await store.ask(question, { apiKey: 'sk-...' });

// Utility
await store.timeline(50);
store.maskPii(text);
await store.view(frameId);
await store.stats();
await store.close();
```

## License

MIT
