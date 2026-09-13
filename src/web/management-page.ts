export function renderManagementPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>UpUp Pi 管理中心</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b1020; color: #e5e7eb; }
    body { margin: 0; background: radial-gradient(circle at top right, #172554, #0b1020 48%); min-height: 100vh; }
    main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 48px; }
    header { display: flex; justify-content: space-between; align-items: end; gap: 20px; margin-bottom: 24px; }
    h1 { margin: 0 0 8px; font-size: 30px; } p { color: #94a3b8; margin: 0; }
    #updated { font-size: 13px; color: #94a3b8; text-align: right; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
    .card { background: rgba(15, 23, 42, .86); border: 1px solid #263452; border-radius: 14px; padding: 18px; box-shadow: 0 8px 30px rgba(0,0,0,.18); }
    .card h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .08em; color: #93c5fd; margin: 0 0 14px; }
    .metric { font-size: 28px; font-weight: 700; } .muted { color: #94a3b8; font-size: 13px; }
    .status { display: inline-flex; align-items: center; gap: 8px; } .dot { width: 9px; height: 9px; border-radius: 50%; background: #22c55e; }
    .warn .dot { background: #f59e0b; } .error .dot { background: #ef4444; }
    ul { list-style: none; padding: 0; margin: 0; } li { padding: 8px 0; border-bottom: 1px solid #1e293b; display: flex; justify-content: space-between; gap: 10px; }
    li:last-child { border-bottom: 0; } code { color: #bfdbfe; } button { margin-top: 20px; border: 1px solid #3b82f6; background: #1d4ed8; color: white; border-radius: 8px; padding: 9px 14px; cursor: pointer; }
    #error { color: #fca5a5; margin-top: 16px; white-space: pre-wrap; } @media (max-width: 650px) { header { display: block; } #updated { text-align: left; margin-top: 10px; } }
  </style>
</head>
<body>
<main>
  <header><div><h1>UpUp Pi 管理中心</h1><p>Pi Runtime · 金融投资插件生态 · 只读运行状态</p></div><div id="updated">加载中…</div></header>
  <section class="grid">
    <article class="card"><h2>Runtime</h2><div id="runtime" class="metric">—</div><div id="policy" class="muted">—</div></article>
    <article class="card"><h2>Packages</h2><div id="packages" class="metric">—</div><div class="muted">已加载 Pi 插件包</div></article>
    <article class="card"><h2>Tools</h2><div id="tools" class="metric">—</div><div id="tool-detail" class="muted">—</div></article>
    <article class="card"><h2>Market Providers</h2><div id="providers" class="status"><span class="dot"></span><span>—</span></div><div id="provider-detail" class="muted">—</div></article>
  </section>
  <section class="grid" style="margin-top:14px"><article class="card"><h2>Provider Metrics</h2><ul id="metrics"></ul></article><article class="card"><h2>最近采样</h2><ul id="sample-list"></ul></article><article class="card"><h2>24小时趋势</h2><ul id="trend-list"></ul></article><article class="card"><h2>Provider SLA 调度</h2><ul id="sla-list"></ul></article><article class="card"><h2>Loaded Packages</h2><ul id="package-list"></ul></article></section>
  <button id="refresh">刷新状态</button><div id="error"></div>
</main>
<script>
  const token = new URLSearchParams(location.search).get('token');
  const endpoint = (path) => path + (token ? (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token) : '');
  const text = (value) => document.createTextNode(String(value));
  async function load() {
    document.getElementById('error').textContent = '';
    try {
      const response = await fetch(endpoint('/api/management/snapshot'), { headers: { accept: 'application/json' } });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || '管理快照不可用');
      document.getElementById('runtime').textContent = body.runtime.name + ' ' + body.runtime.version;
      document.getElementById('policy').textContent = body.permissions.policyId + (body.permissions.allowFinancialWrites ? ' · 可写' : ' · 只读');
      document.getElementById('packages').textContent = body.packages.length;
      document.getElementById('tools').textContent = body.tools.available;
      document.getElementById('tool-detail').textContent = '原生 ' + body.tools.native + ' · Package ' + body.tools.packageOwned;
      const configured = body.providers.marketData.providers.filter((p) => p.configured).map((p) => p.name);
      document.getElementById('providers').lastChild.textContent = configured.length ? configured.join(' / ') : '无已配置 Provider';
      document.getElementById('providers').className = 'status' + (configured.length ? '' : ' warn');
      const metrics = body.providers.marketData.metrics;
      const rate = metrics.requests ? Math.round(metrics.successes / metrics.requests * 100) : 0;
      document.getElementById('provider-detail').textContent = 'SLO ' + metrics.sloStatus + ' · 成功率 ' + rate + '% · 最近 ' + (metrics.lastOutcome || '无采样') + (metrics.lastLatencyMs === undefined ? '' : ' · ' + metrics.lastLatencyMs + 'ms');
      document.getElementById('metrics').replaceChildren(...Object.entries(metrics).map(([key, value]) => { const li = document.createElement('li'); li.append(text(key), text(value)); return li; }));
      document.getElementById('sample-list').replaceChildren(...metrics.recentSamples.slice(-8).reverse().map((sample) => { const li = document.createElement('li'); li.append(text(sample.provider + ' · ' + sample.outcome), text(sample.latencyMs + 'ms' + (sample.errorClass ? ' · ' + sample.errorClass : ''))); return li; }));
      document.getElementById('trend-list').replaceChildren(...(metrics.trend || []).slice(-8).reverse().map((bucket) => { const li = document.createElement('li'); li.append(text(new Date(bucket.startAt).toLocaleString() + ' · ' + bucket.sloStatus), text(bucket.requests + '次 · ' + bucket.successRatePct + '%' + (bucket.avgLatencyMs === undefined ? '' : ' · ' + bucket.avgLatencyMs + 'ms')); return li; }));
      document.getElementById('sla-list').replaceChildren(...(body.providers.marketData.providerSla?.jobs || []).map((job) => { const li = document.createElement('li'); const next = job.nextRunAtMs ? new Date(job.nextRunAtMs).toLocaleString() : '未计划'; li.append(text(job.name + ' · ' + job.provider + (job.enabled ? '' : ' · 已停用')), text((job.lastRunStatus || '未运行') + ' · 下次 ' + next)); return li; }));
      document.getElementById('package-list').replaceChildren(...body.packages.map((pkg) => { const li = document.createElement('li'); li.append(text(pkg.name), text(pkg.version)); return li; }));
      document.getElementById('updated').textContent = '采集时间：' + new Date(body.capturedAt).toLocaleString();
    } catch (error) { document.getElementById('error').textContent = error instanceof Error ? error.message : String(error); }
  }
  document.getElementById('refresh').addEventListener('click', load); load();
</script>
</body></html>`;
}

export const WEB_MANAGEMENT_PAGE_VERSION = '1.0.0';
