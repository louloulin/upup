# @upup/upup-web

UpUp's web overlay on top of the npm-published
[`@agegr/pi-web`](https://www.npmjs.com/package/@agegr/pi-web) (MIT,
v0.9.1). Adds three things and changes nothing upstream:

1. **HTTP proxy** on the public port (`upup web --port 9000`) that owns
   every `/api/upup/*` route.
2. **Sidecar injection** — one `<script defer src="/api/upup/sidecar.js">`
   is appended to every `text/html` response so the vanilla JS widget
   bundle runs inside the upstream React tree.
3. **Investment routes** that delegate to `@upup/pi-investment-workflow`
   so MCP clients, TradingAgents, Claude Code, and Codex get the same
   dossier / watchlist / run surface the TUI uses.

The web UI itself — Next.js 16 dev server, React tree, theme, hot
reload — is consumed verbatim from the npm dependency. We do not vendor,
fork, or rebuild it.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/upup/sidecar.js` | Sidecar bundle (5 KB) |
| GET | `/api/upup/state` | Read persistent investment state |
| PATCH | `/api/upup/state` | Merge update on investment state |
| GET | `/api/upup/watchlist` | Current watchlist |
| POST | `/api/upup/run/:cmd` | Run `/invest` style command, return text |

## CLI

```sh
upup web                          # default: public 9000, upstream 30141
upup web --port 8080              # custom public port
upup web --no-browser             # do not open browser automatically
```

## Architecture

```
┌────────────┐    HTTP    ┌─────────────────┐   HTTP    ┌──────────────────────┐
│  browser   │ ◀────────▶ │ upup-web proxy  │ ◀───────▶ │ @agegr/pi-web Next.js│
│  + sidecar │  port 9000 │ /api/upup/* +   │  port     │ (npm dep, unmodified)│
└────────────┘            │ script inject   │  30141    └──────────────────────┘
                          └─────────────────┘
                                    │
                                    ▼
                          ┌──────────────────────┐
                          │ @upup/pi-investment- │
                          │ workflow (sop/       │
                          │ dossier/watchlist)   │
                          └──────────────────────┘
```

The proxy is the only place where investment behaviour is added. The
upstream React tree never receives a code change.
