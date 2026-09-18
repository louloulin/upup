/**
 * UPUP branding constants — injected into every HTML response served by
 * the upup-web proxy. Keep this module dependency-free so it stays
 * trivially unit-testable.
 */
export const UPUP_TITLE = 'UpUp — 投资助手';
export const UPUP_APP_NAME = 'UpUp';
export const UPUP_DESCRIPTION = 'UpUp — 中文 AI 投资研究助手，基于 Pi 生态 / Pi Native / 5-phase /invest workflow';

export const UPUP_FAVICON_TAGS = [
  '<link rel="icon" type="image/svg+xml" href="/api/upup/favicon.svg"/>',
  '<link rel="shortcut icon" type="image/svg+xml" href="/api/upup/favicon.svg"/>',
  '<link rel="apple-touch-icon" href="/api/upup/favicon.svg"/>',
].join('');

/**
 * Rewrite <title>, application-name, apple-mobile-web-app-title, description
 * meta tags, and strip upstream favicon <link> tags so the upstream Next.js
 * page renders under the UpUp brand. Idempotent — calling on already
 * rebranded HTML is a no-op.
 */
export function rebrandHtml(html: string): string {
  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${UPUP_TITLE}</title>`);
  out = out.replace(
    /<meta\s+name="application-name"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="application-name" content="${UPUP_APP_NAME}"/>`,
  );
  out = out.replace(
    /<meta\s+name="apple-mobile-web-app-title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="apple-mobile-web-app-title" content="${UPUP_APP_NAME}"/>`,
  );
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${UPUP_DESCRIPTION}"/>`,
  );
  out = out.replace(/<link\s+rel="icon"[^>]*>/gi, '');
  out = out.replace(/<link\s+rel="shortcut[^"]*icon"[^>]*>/gi, '');
  out = out.replace(/<link\s+rel="apple-touch-icon"[^>]*>/gi, '');
  return out;
}

/**
 * Inject the sidecar script + UpUp favicon link tags into the HTML head.
 * - If `</head>` is present, inject just before it.
 * - Else if `<body` is present, inject just before it.
 * - Else prepend to the document.
 *
 * Idempotent — re-injection is skipped if both pieces are already present.
 */
export function injectIntoHtml(
  html: string,
  sidecarScript: string,
  faviconTags: string = UPUP_FAVICON_TAGS,
): string {
  const hasSidecar = html.includes(sidecarScript);
  const hasFavicon = html.includes('api/upup/favicon.svg');
  if (hasSidecar && hasFavicon) return html;
  const rebranded = rebrandHtml(html);
  const head = sidecarScript + faviconTags;
  if (rebranded.includes('</head>')) return rebranded.replace('</head>', `${head}</head>`);
  if (rebranded.includes('<body')) return rebranded.replace('<body', `${head}<body`);
  return `${head}${rebranded}`;
}
