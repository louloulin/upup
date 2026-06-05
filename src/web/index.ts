/**
 * src/web/ placeholder (P2.b.1 / D-CTG-8).
 *
 * C3 Web UI is intentionally a stub in this change. The real Vite+React
 * app, Playwright e2e, and read-only UI surfaces are deferred to a
 * follow-up change (P2.b.3-P2.b.8 in tasks.md).
 *
 * What's shipped here:
 *   - This file (so the package has a build entry)
 *   - package.json declaring the @upup/web workspace package
 *   - scripts/lint-web-boundary.sh — the CI guard that locks the
 *     boundary until the real UI lands
 *
 * The lint allows imports from src/bridge/ + react/react-dom only.
 * The intentional absence of any import here is a self-test: the
 * lint passes because there are no imports at all.
 */
export const WEB_STUB_VERSION = '0.0.0';
