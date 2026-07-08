import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createBrowserIPFSTransport,
  detectBrowserIPFSCapabilities,
  summarizeBrowserIPFSCapabilityGaps,
} from '../../src/services/ipfs/browser.js';
import { createHostIPFSTransport } from '../../src/services/ipfs/host.js';

const ROOT = resolve(__dirname, '../..');

function makeResponse(body: BodyInit, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, ...init });
}

describe('IPFS browser transport strategy', () => {
  it('uses gateway reads without a host daemon default', async () => {
    const calls: string[] = [];
    const transport = createBrowserIPFSTransport({
      gateway: { baseUrl: 'https://gateway.example' },
      fetch: async input => {
        calls.push(String(input));
        return makeResponse('hello');
      },
    });

    await expect(transport.catText('bafybeigdyrzt/path.txt')).resolves.toBe('hello');
    expect(calls).toEqual(['https://gateway.example/ipfs/bafybeigdyrzt/path.txt']);
    expect(transport.report.hostOnly.map(capability => capability.name)).toEqual([
      'daemon',
      'filesystem',
      'python',
      'native-ipfs',
    ]);
    expect(transport.report.capabilities.find(capability => capability.name === 'http-api-write')?.enabled)
      .toBe(false);
  });

  it('uses explicit browser HTTP API endpoints for writes and pins', async () => {
    const calls: string[] = [];
    const transport = createBrowserIPFSTransport({
      httpApi: { baseUrl: 'https://ipfs-api.example/api/v0' },
      fetch: async input => {
        calls.push(String(input));
        if (String(input).includes('/add?')) {
          return makeResponse(JSON.stringify({ Hash: 'bafyadd', Size: '5', Name: 'file.txt' }));
        }
        return makeResponse(JSON.stringify({ Pins: ['bafyadd'] }));
      },
    });

    await expect(transport.add('hello', { filename: 'file.txt', pin: true })).resolves.toEqual({
      cid: 'bafyadd',
      size: 5,
      path: 'file.txt',
    });
    await expect(transport.pin('bafyadd')).resolves.toBe(true);
    expect(calls[0]).toContain('https://ipfs-api.example/api/v0/add?pin=true');
    expect(calls[1]).toContain('https://ipfs-api.example/api/v0/pin/add?arg=bafyadd');
  });

  it('reports libp2p package gaps instead of substituting local transports', async () => {
    const report = await detectBrowserIPFSCapabilities({
      libp2p: {
        importModule: async specifier => {
          throw new Error(`missing ${specifier}`);
        },
      },
    });

    expect(report.libp2p?.gaps.length).toBeGreaterThan(0);
    expect(summarizeBrowserIPFSCapabilityGaps(report).join('\n')).toContain('missing @libp2p/webrtc');
  });

  it('keeps host-only operations behind the host entrypoint', async () => {
    const browserSource = readFileSync(resolve(ROOT, 'src/services/ipfs/browser.ts'), 'utf8');
    expect(browserSource).not.toMatch(/from ['"]node:/);
    expect(browserSource).not.toMatch(/from ['"](?:fs|child_process|stream|..\/..\/ipfs\/client)/);

    const host = createHostIPFSTransport({
      apiUrl: 'http://127.0.0.1:5001/api/v0',
      apiKey: 'test',
      timeout: 1,
      enableDaemon: false,
      enableFilesystem: false,
      enablePython: false,
      enableNativeIpfs: false,
    });

    expect(host.report.runtime).toBe('host');
    expect(host.report.browserSafe).toBe(false);
    await expect(host.addFile('/tmp/missing')).rejects.toThrow('Filesystem capability is disabled');
    await expect(host.runNativeIPFS(['id'])).rejects.toThrow('Native IPFS capability is disabled');
  });
});
