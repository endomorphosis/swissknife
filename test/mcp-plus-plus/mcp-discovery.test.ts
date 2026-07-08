import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MCPDiscovery,
  MCPPubSub,
  TOPIC_INTERFACE_ANNOUNCE,
} from '../../src/services/mcp/mcp-discovery';
import {
  bytesToUtf8,
  utf8ToBytes,
} from '../../src/services/shared/browser-bytes';

describe('MCPDiscovery browser defaults', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults mDNS and DHT off in browser runtimes', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {});

    const discovery = new MCPDiscovery();
    const options = (discovery as unknown as {
      options: { mdns: boolean; dht: boolean };
    }).options;

    expect(options.mdns).toBe(false);
    expect(options.dht).toBe(false);
  });
});

describe('MCPPubSub browser byte path', () => {
  it('publishes Uint8Array payloads and decodes received Uint8Array messages', async () => {
    let messageHandler: ((event: unknown) => void) | undefined;
    let published: { topic: string; data: Uint8Array } | undefined;
    const fakeNode = {
      services: {
        pubsub: {
          subscribe: vi.fn(),
          addEventListener: vi.fn((_event: string, handler: (event: unknown) => void) => {
            messageHandler = handler;
          }),
          publish: vi.fn(async (topic: string, data: Uint8Array) => {
            published = { topic, data };
          }),
        },
      },
    };

    const pubsub = new MCPPubSub({ enabled: true, topics: [TOPIC_INTERFACE_ANNOUNCE] });
    await pubsub.start(fakeNode);
    await pubsub.announceInterface('sha256:abc123');

    expect(fakeNode.services.pubsub.publish).toHaveBeenCalledOnce();
    expect(published?.topic).toBe(TOPIC_INTERFACE_ANNOUNCE);
    expect(published?.data).toBeInstanceOf(Uint8Array);
    expect(bytesToUtf8(published!.data)).toContain('sha256:abc123');

    const received: unknown[] = [];
    pubsub.on('message', message => received.push(message));
    messageHandler?.({
      detail: {
        topic: TOPIC_INTERFACE_ANNOUNCE,
        data: utf8ToBytes(bytesToUtf8(published!.data)),
      },
    });
    await Promise.resolve();

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      topic: TOPIC_INTERFACE_ANNOUNCE,
      payload: { interfaceCid: 'sha256:abc123' },
    });
  });
});
