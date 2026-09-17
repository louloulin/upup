/**
 * Unit tests for the UPUP branding rewriter used by the proxy.
 *
 * The rewriter is pure-function (no I/O), so these tests do not need
 * the upup web server running — they exercise the HTML transformation
 * directly via @upup/upup-web/src/rebrand.
 */
import { describe, expect, it } from 'bun:test';
import {
  UPUP_TITLE,
  UPUP_APP_NAME,
  UPUP_DESCRIPTION,
  UPUP_FAVICON_TAGS,
  rebrandHtml,
  injectIntoHtml,
} from '../src/rebrand';

const SIDECAR = '<script defer src="/api/upup/sidecar.js"></script>';

describe('rebrand constants', () => {
  it('exposes the locked UPUP_TITLE / UPUP_APP_NAME / UPUP_DESCRIPTION', () => {
    expect(UPUP_TITLE).toBe('UpUp — 投资助手');
    expect(UPUP_APP_NAME).toBe('UpUp');
    expect(UPUP_DESCRIPTION).toContain('UpUp');
    expect(UPUP_DESCRIPTION).toContain('Pi');
  });

  it('UPUP_FAVICON_TAGS points at /api/upup/favicon.svg', () => {
    expect(UPUP_FAVICON_TAGS).toContain('/api/upup/favicon.svg');
    expect(UPUP_FAVICON_TAGS).toMatch(/<link rel="icon"/);
    expect(UPUP_FAVICON_TAGS).toMatch(/<link rel="shortcut icon"/);
    expect(UPUP_FAVICON_TAGS).toMatch(/<link rel="apple-touch-icon"/);
  });
});

describe('rebrandHtml — title + meta tags', () => {
  it('rewrites the <title> tag', () => {
    const html = '<html><head><title>Pi Web — Coding Agent</title></head><body></body></html>';
    const out = rebrandHtml(html);
    expect(out).toContain(`<title>${UPUP_TITLE}</title>`);
    expect(out).not.toContain('Pi Web — Coding Agent');
  });

  it('rewrites the application-name meta tag', () => {
    const html = '<meta name="application-name" content="Pi Web"/>';
    const out = rebrandHtml(html);
    expect(out).toContain(`<meta name="application-name" content="${UPUP_APP_NAME}"/>`);
  });

  it('rewrites the apple-mobile-web-app-title meta tag', () => {
    const html = '<meta name="apple-mobile-web-app-title" content="Pi Web"/>';
    const out = rebrandHtml(html);
    expect(out).toContain(`<meta name="apple-mobile-web-app-title" content="${UPUP_APP_NAME}"/>`);
  });

  it('rewrites the description meta tag', () => {
    const html = '<meta name="description" content="A coding agent for Pi"/>';
    const out = rebrandHtml(html);
    expect(out).toContain(`<meta name="description" content="${UPUP_DESCRIPTION}"/>`);
  });

  it('is idempotent — re-running on already-rebranded HTML stays the same', () => {
    const once = rebrandHtml('<html><head><title>Pi Web</title><meta name="application-name" content="Pi Web"/></head></html>');
    const twice = rebrandHtml(once);
    expect(twice).toBe(once);
  });
});

describe('rebrandHtml — strip upstream favicon links', () => {
  it('removes <link rel="icon" href="...">', () => {
    const html = '<link rel="icon" href="/favicon.ico"/>';
    const out = rebrandHtml(html);
    expect(out).not.toMatch(/<link\s+rel="icon"/);
  });

  it('removes <link rel="shortcut icon" href="...">', () => {
    const html = '<link rel="shortcut icon" href="/favicon.ico"/>';
    const out = rebrandHtml(html);
    expect(out).not.toMatch(/<link\s+rel="shortcut[^"]*icon"/);
  });

  it('removes <link rel="apple-touch-icon" href="...">', () => {
    const html = '<link rel="apple-touch-icon" href="/apple-touch.png"/>';
    const out = rebrandHtml(html);
    expect(out).not.toMatch(/<link\s+rel="apple-touch-icon"/);
  });
});

describe('injectIntoHtml', () => {
  it('injects sidecar + favicon just before </head>', () => {
    const html = '<html><head><title>Pi Web</title></head><body></body></html>';
    const out = injectIntoHtml(html, SIDECAR);
    expect(out).toContain(SIDECAR);
    expect(out).toContain('api/upup/favicon.svg');
    // Order: script + favicon must come before </head>
    const headIdx = out.indexOf('</head>');
    const scriptIdx = out.indexOf(SIDECAR);
    expect(scriptIdx).toBeLessThan(headIdx);
  });

  it('injects both script and all 3 favicon link tags', () => {
    const html = '<html><head><title>x</title></head><body></body></html>';
    const out = injectIntoHtml(html, SIDECAR);
    const linkCount = (out.match(/<link\s+rel="[^"]*icon"[^>]*>/g) ?? []).length;
    expect(linkCount).toBeGreaterThanOrEqual(3);
  });

  it('rewrites title to UPUP_TITLE as a side effect', () => {
    const html = '<html><head><title>Pi Web</title></head><body></body></html>';
    const out = injectIntoHtml(html, SIDECAR);
    expect(out).toContain(`<title>${UPUP_TITLE}</title>`);
    expect(out).not.toContain('<title>Pi Web</title>');
  });

  it('falls back to <body> injection when no </head>', () => {
    const html = '<html><body><div>content</div></body></html>';
    const out = injectIntoHtml(html, SIDECAR);
    expect(out).toContain(SIDECAR);
    const bodyIdx = out.indexOf('<body');
    const scriptIdx = out.indexOf(SIDECAR);
    expect(scriptIdx).toBeLessThan(bodyIdx);
  });

  it('prepends when no </head> and no <body>', () => {
    const html = '<div>raw fragment</div>';
    const out = injectIntoHtml(html, SIDECAR);
    expect(out.indexOf(SIDECAR)).toBe(0);
  });

  it('is idempotent — second call is a no-op (script + favicon already present)', () => {
    const html = '<html><head></head><body></body></html>';
    const once = injectIntoHtml(html, SIDECAR);
    const twice = injectIntoHtml(once, SIDECAR);
    expect(twice).toBe(once);
    const scriptCount = (twice.match(/\/api\/upup\/sidecar\.js/g) ?? []).length;
    expect(scriptCount).toBe(1);
    const faviconCount = (twice.match(/api\/upup\/favicon\.svg/g) ?? []).length;
    expect(faviconCount).toBe(3);
  });
});
