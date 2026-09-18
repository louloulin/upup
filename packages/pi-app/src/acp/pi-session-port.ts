/**
 * Bind UpUp's Pi session runtime to the ACP front-end.
 *
 * `AcpSessionFactoryPort` is deliberately narrow (`createSession`,
 * `prompt`, `abort`, `subscribe`, `dispose`) so the ACP server can be tested
 * against a fake. This adapter is the production implementation: it creates
 * real sessions through the **same** `PiAgentSessionFactory` the TUI and every
 * headless surface use, so `upup --acp` gets the identical finance tools,
 * `/invest` workflow, skills and policies.
 */

import type { UpUpAgentEvent, UpUpAgentSession } from '@upup/pi-runtime';
import { createPiNativeAgentSpec } from '@upup/pi-session';
import { createPiNativeSessionOptions, getPiNativeApp } from '../default';
import type { AcpSessionFactoryPort, AcpSessionPort } from './server';

/** Adapt one `UpUpAgentSession` to the ACP port. */
function toAcpSession(session: UpUpAgentSession): AcpSessionPort {
  return {
    id: session.id,
    prompt: (input, options) => session.prompt(input, options),
    abort: () => session.abort(),
    subscribe: (listener: (event: UpUpAgentEvent) => void) => session.subscribe(listener),
    dispose: () => session.dispose(),
  };
}

/**
 * Create the Pi-backed session factory ACP sessions are created from.
 *
 * `cwd` comes from ACP's `session/new` so a host can point UpUp at a
 * different project; everything else (finance providers, Pi packages,
 * policies, skills) comes from the shared Pi-native session options.
 */
export function createPiAcpSessionFactory(): AcpSessionFactoryPort {
  return {
    async createSession(options) {
      // Same spec the Pi-native TUI session reports, so ACP clients see the
      // identical agent identity and capability set.
      const spec = createPiNativeAgentSpec();
      const factory = getPiNativeApp().getSessionFactory();
      const session = await factory.createSession(spec, {
        ...createPiNativeSessionOptions(),
        ...(options.cwd ? { cwd: options.cwd } : {}),
      });
      return toAcpSession(session);
    },
  };
}
