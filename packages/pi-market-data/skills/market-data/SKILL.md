---
name: market-data
description: Read market quotes, historical bars, and trading calendars with explicit as-of dates and evidence.
---

# Market Data

Use the market-data Package tools for quotes, historical bars, and trading-day checks.

- Always state symbol, market, currency, as-of date, freshness, and source.
- Treat historical or cached data as non-realtime and never imply live execution.
- Keep the original evidence ID in downstream valuation, risk, and report outputs.
- If a source or date is missing, stop and report the missing evidence instead of inventing a value.
