# Security Policy

> **UpUp is a research tool, not a financial advisor.** It can execute shell commands, access the filesystem, and call external APIs on your behalf. Treat its permission system with the same care you would give `sudo`.

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| latest  | ✅ Active          |
| older   | ⚠️ Best-effort     |

UpUp is currently in active development on `main`. We recommend running the latest commit. Tagged releases (see [Releases](https://github.com/louloulin/upup/releases)) are tested and stable.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

We follow a coordinated disclosure process:

1. **Email** `security@upup.dev` (placeholder — see [repository owners](https://github.com/louloulin/upup) for current contact)
2. **Subject**: `[SECURITY] <short description>`
3. **Body**:
   - Description of the vulnerability
   - Reproduction steps
   - Impact assessment (what can an attacker do?)
   - Suggested fix (if any)
   - Your contact info for follow-up

You should receive an acknowledgment within **72 hours**. We will keep you informed of progress and credit you in the fix commit (unless you prefer to remain anonymous).

## Threat Model

UpUp has a large surface area by design — it's a terminal agent that touches the filesystem, network, and your API keys. Major threat vectors:

| Vector | Description | Mitigation in UpUp |
|---|---|---|
| **Prompt injection** | Untrusted content (web pages, PDF filings, CSV) might contain instructions that override the agent | `src/agent/prompts.ts` explicit guardrails; `citation` tool counts claim density; `--safe` mode strips tool calls |
| **Secret leakage** | API keys in `.env` could leak to logs, telemetry, or prompts | `src/utils/redact.ts` automatic redaction; never logged in plain text |
| **Tool overreach** | `bash` tool could run `rm -rf` or exfiltrate data | Multi-layer permission system (session mode + tool mode + bypass rules); default is `ask` |
| **MCP supply chain** | Third-party MCP servers could be malicious | `src/mcp/auth-tool.ts` token check; signature verification (planned) |
| **Plugin supply chain** | Third-party plugins from `bun` / `jiti` runtime run in-process | `wasm` runtime is the recommended isolation boundary; plugin manifest declares sandbox |
| **Memory poisoning** | Long-term memory (`packages/memory`) might persist manipulated facts | `src/memory/extraction.ts` provenance tracking; `audit-signing.ts` tamper-evident chain |
| **Dependency confusion** | npm package name squatting | `bun install` with `bunfig.toml` lockfile; CI runs `bun audit` |

## Permission System (Defense in Depth)

UpUp uses a Claude Code-inspired multi-layer permission system. **Default is `ask`**, never `bypass`.

```
Session mode       →  default | accept-all | bypassPermissions | dangerously
Bash tool mode     →  bypass | allow | ask | deny
Bypass rules       →  static allowlist (cat, ls, git status, …)
```

See [docs/session-and-permissions.md](./docs/session-and-permissions.md) for the full reference.

### Recommended Hardening

```jsonc
// .upup/settings.json
{
  "permissions": {
    "defaultMode": "ask",
    "allow": [
      "Bash(git status)",
      "Bash(git diff)",
      "Bash(bun test:*)",
      "Read(README.md)",
      "Read(CLAUDE.md)"
    ],
    "deny": [
      "Bash(sudo *)",
      "Bash(rm -rf /*)",
      "Bash(chmod 777 *)",
      "Bash(curl * | bash)",
      "WebFetch(*)"
    ],
    "dangerouslyAllow": false
  }
}
```

### `UPUP_DANGEROUSLY_MODE` — Use with Extreme Caution

Setting `UPUP_DANGEROUSLY_MODE=true` disables most permission checks. **Only enable in ephemeral sandboxes** (Docker / VM) when you fully understand the consequences. Never use it on a workstation with access to production data, secrets, or SSH keys.

## API Key Hygiene

- **Never commit `.env`** — `.gitignore` includes it; verify with `git status` before every commit
- **Use the smallest scope** — e.g., a Tushare read-only token, not an admin token
- **Rotate regularly** — at least every 90 days for production keys
- **Prefer env-var over file** — many CI systems support per-job secrets
- **Audit key usage** — most providers (OpenAI, Anthropic, Tushare) have usage dashboards

## Telemetry

UpUp optionally integrates with LangSmith for tracing. This sends prompts, tool calls, and outputs to your configured LangSmith project.

- **Disabled by default** — only active when `LANGSMITH_API_KEY` is set
- **Your data, your project** — we never proxy telemetry through UpUp servers
- **Disable any time** — unset the env var

## Data Handling

UpUp is a **local-first** CLI. The agent runs on your machine. The only outbound traffic is to the LLM provider, the financial data provider, and (optionally) the search/browser tool. We do not run any central server.

| Data | Where it goes | How to opt out |
|---|---|---|
| Your prompts | LLM provider (OpenAI / Anthropic / etc.) | Choose a self-hosted Ollama model |
| Tool results (prices, filings) | LLM provider | Use local data sources (DuckDB plugin) |
| Long-term memory | Local SQLite (`.upup/memory.db`) | `rm .upup/memory.db` |
| Session history | Local JSONL (`.upup/sessions/`) | `rm -rf .upup/sessions/` |
| Telemetry | Your LangSmith project (if configured) | Unset `LANGSMITH_API_KEY` |
| Browser screenshots | Local temp dir | `--no-screenshots` flag |

## Vulnerability Disclosure Timeline

We aim for:

| Phase | Target |
|---|---|
| Acknowledgment | 72 hours |
| Triage & severity assessment | 1 week |
| Fix & coordinated disclosure | 30 days for high-severity |
| Public CVE (if applicable) | After fix is released |

## Hall of Fame

We thank the following security researchers for responsible disclosure (none yet — be the first!):

<!-- Add entries as: - @username (year) -->

## Out of Scope

- Bugs in the upstream LLM provider (OpenAI, Anthropic, etc.) — report to them
- Bugs in upstream dexter — report to https://github.com/virattt/dexter
- Theoretical attacks requiring physical access to the machine
- Self-inflicted issues from `--dangerously` mode usage

---

<p align="center">
  <strong>UpUp (涨涨) — Security is a feature, not a footnote.</strong>
</p>
