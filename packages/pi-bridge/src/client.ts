// Minimal CLI proxy: stdin/stdout <-> WebSocket bridge.
// Used by `upup --bridge-attach <url> --token <secret>` to give a remote shell
// the same feel as a local CLI session. Sprint 2.3 will replace this with the
// full REPL bridge from loucode (see replBridge.ts + inboundMessages.ts).
import { decodeMessage, encodeMessage, type BridgeMessage } from './protocol';

export interface BridgeClientOptions {
  url: string;          // ws://host:port/bridge?token=...
  input?: NodeJS.ReadableStream;  // default: process.stdin
  output?: NodeJS.WritableStream; // default: process.stdout
  onMessage?: (msg: BridgeMessage) => void;
}

export interface BridgeClient {
  close(): void;
}

export function startBridgeClient(opts: BridgeClientOptions): BridgeClient {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const ws = new WebSocket(opts.url);
  let seq = 0;
  let sessionId = '';

  ws.addEventListener('open', () => {
    output.write('[bridge] connected\n');
  });
  ws.addEventListener('close', () => {
    output.write('[bridge] disconnected\n');
  });
  ws.addEventListener('error', () => {
    output.write('[bridge] connection error\n');
  });
  ws.addEventListener('message', async (ev) => {
    try {
      const data = ev.data as unknown;
      let bytes: ArrayBuffer;
      if (data instanceof ArrayBuffer) bytes = data;
      else if (data instanceof Blob) bytes = await data.arrayBuffer();
      else if (data instanceof Uint8Array) {
        bytes = new ArrayBuffer(data.byteLength);
        new Uint8Array(bytes).set(data);
      } else if (typeof data === 'string') {
        bytes = new TextEncoder().encode(data).buffer as ArrayBuffer;
      } else {
        output.write(`[bridge] unsupported data type: ${typeof data}\n`);
        return;
      }
      const msg = decodeMessage(new Uint8Array(bytes));
      if (opts.onMessage) opts.onMessage(msg);
      sessionId = msg.sessionId;
      if (msg.kind === 'status') {
        const p = msg.payload as { phase: string };
        output.write(`[bridge] status=${p.phase} session=${msg.sessionId}\n`);
      } else if (msg.kind === 'output') {
        const p = msg.payload as { tool: string; result: string };
        output.write(`[bridge] output tool=${p.tool} result=${p.result}\n`);
      } else if (msg.kind === 'chat') {
        const p = msg.payload as { content: string };
        output.write(`[bridge] echo: ${p.content}\n`);
      } else if (msg.kind === 'approval') {
        const p = msg.payload as { approved: boolean };
        output.write(`[bridge] approval approved=${p.approved}\n`);
      }
    } catch (e) {
      output.write(`[bridge] decode error: ${(e as Error).message}\n`);
    }
  });

  let buffer = '';
  input.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString();
    let nl = buffer.indexOf('\n');
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) {
        seq += 1;
        const msg: BridgeMessage = {
          kind: 'chat',
          seq,
          sessionId,
          timestamp: Date.now(),
          payload: { role: 'user', content: line },
        };
        try {
          ws.send(encodeMessage(msg));
        } catch {
          // best-effort
        }
      }
      nl = buffer.indexOf('\n');
    }
  });

  return {
    close() {
      try { ws.close(); } catch { /* ignore */ }
    },
  };
}
