/**
 * Phase 0.3 — `@earendil-works/pi-protocol` CBOR transport smoke test.
 *
 * First UpUp end-to-end exercise of the Pi canonical wire protocol. Proves:
 *   - pi-server can host an in-memory CBOR connection,
 *   - pi-client completes the ClientHello → ServerHello handshake,
 *   - a ServiceCall round-trips through the codec back as the typed
 *     JsonValue payload,
 *   - the codec produces real CBOR bytes (verified by feeding the bytes
 *     through ClientMessageDecoder / ServerMessageDecoder).
 *
 * Transport is an in-memory `PassThrough` byte pair so no real socket is
 * involved; once this passes, swapping the pair for a real `net` /
 * `WebSocket` transport in `pi-bridge` is a transport-only change.
 */

import { describe, expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { randomUUID } from 'node:crypto';
import type { Context, JsonValue, ServiceCall } from '@earendil-works/chord';
import type { ByteConnection, ByteConnectionHandler } from '@earendil-works/pi-server';
import type { RoutedServerServiceAttachment, ServerHost, ServerListener } from '@earendil-works/pi-server';
import { Server } from '@earendil-works/pi-server';
import { Client } from '@earendil-works/pi-client';
import type { ByteTransportHandlers } from '@earendil-works/pi-client';
import {
  ClientMessageDecoder,
  ServerMessageDecoder,
  encodeClientMessage,
  encodeServerMessage,
  PROTOCOL_VERSION,
  type ClientHello,
  type ServerMessage,
} from '@earendil-works/pi-protocol';

interface BytePair {
  /** Hands the server-side `ByteConnection` to the listener after wiring it up. */
  readonly acceptOn: (accept: (conn: ByteConnection) => ByteConnectionHandler) => void;
  /** Wires the client-side transport handler once `Client.connect` calls it. */
  readonly clientFactory: (handlers: ByteTransportHandlers) => void;
  /** Client-side writer: feed it into the `ByteTransport.send` implementation. */
  readonly clientSend: (chunk: Uint8Array) => Promise<void>;
  /** Client-side closer for `ByteTransport.close`. */
  readonly clientClose: () => void;
  readonly close: () => void;
}

/**
 * Build a connected byte pair. The caller must wire both ends: feed the
 * server's `ByteConnection` into the listener via `acceptOn`, and supply
 * the client's `ByteTransportHandlers` via `clientFactory`. Once both are
 * in place, the in-memory pipe delivers bytes bidirectionally.
 */
function makeBytePair(): BytePair {
  const clientToServer = new PassThrough();
  const serverToClient = new PassThrough();
  let connHandler: ByteConnectionHandler | undefined;
  let clientHandlers: ByteTransportHandlers | undefined;
  let closed = false;
  let clientClosed = false;

  clientToServer.on('data', (buf: Buffer) => connHandler?.onData(new Uint8Array(buf)));
  clientToServer.on('end', () => connHandler?.onClose());
  clientToServer.on('error', (err: Error) => connHandler?.onError(err));
  serverToClient.on('data', (buf: Buffer) => clientHandlers?.onData(new Uint8Array(buf)));
  serverToClient.on('end', () => clientHandlers?.onClose());
  serverToClient.on('error', (err: Error) => clientHandlers?.onError(err));

  const serverConnection: ByteConnection = {
    async send(chunk: Uint8Array): Promise<void> {
      if (closed) return;
      if (!serverToClient.write(Buffer.from(chunk))) {
        await new Promise<void>((resolve) => serverToClient.once('drain', resolve));
      }
    },
    get closed(): boolean {
      return closed;
    },
    close(): void {
      if (closed) return;
      closed = true;
      clientToServer.end();
      serverToClient.end();
    },
  };

  return {
    acceptOn(accept): void {
      connHandler = accept(serverConnection);
    },
    clientFactory(handlers): void {
      clientHandlers = handlers;
    },
    async clientSend(chunk: Uint8Array): Promise<void> {
      if (clientClosed) throw new Error('client transport closed');
      if (!clientToServer.write(Buffer.from(chunk))) {
        await new Promise<void>((resolve) => clientToServer.once('drain', resolve));
      }
    },
    clientClose(): void {
      if (clientClosed) return;
      clientClosed = true;
      clientToServer.end();
    },
    close(): void {
      if (closed) return;
      closed = true;
      clientToServer.end();
      serverToClient.end();
    },
  };
}

/** A `ServerListener` that hands a pre-built `ByteConnection` to the server. */
function makeOneShotListener(): { listener: ServerListener; feed: (conn: ByteConnection) => void } {
  let acceptor: ((conn: ByteConnection) => ByteConnectionHandler) | undefined;
  return {
    listener: {
      async start(accept): Promise<void> {
        acceptor = accept;
      },
      async close(): Promise<void> {
        acceptor = undefined;
      },
    },
    feed(conn: ByteConnection): void {
      if (!acceptor) throw new Error('listener not started');
      acceptor(conn);
    },
  };
}

describe('Pi protocol CBOR transport (Phase 0.3 smoke)', () => {
  test('ClientHello + ServiceCall round-trip through the codec', async () => {
    const PING_SERVICE_ID = 'pi.cbor.ping';
    const serverId = randomUUID();

    const serverHost: ServerHost = {
      serverServices: {
        attachClient(): RoutedServerServiceAttachment {
          return {
            async invokeService(call: ServiceCall, _publish, _context: Context): Promise<JsonValue | undefined> {
              if (call.serviceId !== PING_SERVICE_ID || call.member !== 'ping') {
                throw new Error(`unknown ${call.serviceId}/${call.member}`);
              }
              return { ok: true, echoed: call.args, at: 1 };
            },
            async release(): Promise<void> {
              /* smoke */
            },
          };
        },
      },
      async resolveSession(): Promise<never> {
        throw new Error('not used by this smoke');
      },
      async openSession(): Promise<never> {
        throw new Error('not used by this smoke');
      },
    };

    const pair = makeBytePair();
    const { listener, feed } = makeOneShotListener();
    const server = new Server(serverHost, { listeners: [listener], serverId });
    await server.start();
    feed(pair.serverConnection);
    // After `feed`, the server handed back a connection handler via its
    // internal `accept`. Now that handler must see inbound bytes from the
    // pipe. The pair stores the handler at this point so `clientToServer.on
    // ('data')` (set up in `makeBytePair`) can dispatch into it.
    // Note: `acceptOn` is wired in this order deliberately: after `feed`,
    // the pipe's `on('data')` listener (registered by `makeBytePair`)
    // routes to `connHandler` which is set inside `acceptOn`.
    // The order is: feed → accept → connHandler set. The pipe listener
    // already exists and references the closure variable `connHandler`; once
    // `acceptOn` assigns it, data starts flowing correctly.
    pair.acceptOn((conn) => server.accept(conn));

    const client = await Client.connect({
      transportFactory: (handlers) => {
        pair.clientFactory(handlers);
        return {
          async send(chunk: Uint8Array): Promise<void> {
            await pair.clientSend(chunk);
          },
          close(): void {
            pair.clientClose();
          },
        };
      },
      serverId,
    });
    expect(client.connected).toBe(true);
    expect(client.serverId).toBe(serverId);
    expect(client.hello?.version).toBe(PROTOCOL_VERSION);

    // Codec round-trip — ClientHello bytes must decode back to ClientHello.
    const hello: ClientHello = { type: 'hello', version: PROTOCOL_VERSION };
    const helloBytes = encodeClientMessage(hello);
    const helloMessages = new ClientMessageDecoder().push(helloBytes);
    expect(helloMessages[0]?.type).toBe('hello');

    // ServiceCall round-trip through the live wire.
    const call: ServiceCall = { serviceId: PING_SERVICE_ID, member: 'ping', args: [] };
    const result = await client.request({ serverId }, call);
    expect(result).toEqual({ ok: true, echoed: [], at: 1 });

    // Server-side encode/decode round-trip.
    const serverBytes = encodeServerMessage({
      type: 'response',
      id: 'probe',
      ok: true,
      result: { hi: 'there' },
    } as ServerMessage);
    const decoded = new ServerMessageDecoder().push(serverBytes);
    expect(decoded[0]?.type).toBe('response');

    await client.dispose();
    pair.close();
    await server.close();
  }, { timeout: 10_000 });

  test('non-hello bytes do not decode to a hello (codec is strict)', () => {
    const garbage = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const decoded = new ClientMessageDecoder().push(garbage);
    expect(decoded.some((m) => m.type === 'hello')).toBe(false);
  });
});
