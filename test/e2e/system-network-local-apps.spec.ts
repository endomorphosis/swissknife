import { createServer, type Server } from 'http';
import { existsSync, readFileSync, statSync } from 'fs';
import { extname, join, normalize } from 'path';
import type { AddressInfo } from 'net';
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

let server: Server;
let baseUrl = '';

test.beforeAll(async () => {
  server = await startStaticServer(join(process.cwd(), 'web'));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

test('network, device, system, assistant, settings, and local utility apps expose explicit boundaries', async ({ page }) => {
  const rawIPFSRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/v1/ipfs/')) rawIPFSRequests.push(request.url());
  });

  await page.goto(`${baseUrl}/system-network-local-harness.html`, { waitUntil: 'domcontentloaded' });

  const workflows = await page.evaluate(async () => {
    localStorage.clear();

    const intervalIds: number[] = [];
    const originalSetInterval = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: any[]) => {
      const id = originalSetInterval(handler, timeout, ...args);
      intervalIds.push(id);
      return id;
    }) as typeof window.setInterval;

    class SpeechRecognitionStub {
      continuous = false;
      interimResults = false;
      lang = 'en-US';
      onresult: ((event: any) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      start() { return undefined; }
      stop() {
        this.onend?.();
      }
    }
    (window as any).SpeechRecognition = SpeechRecognitionStub;
    (window as any).webkitSpeechRecognition = SpeechRecognitionStub;
    (window as any).speechSynthesis = (window as any).speechSynthesis || { speak: () => undefined };

    const loadModule = (path: string) => import(path);
    const summarizeEnvelope = (envelope: any) => ({
      schema: envelope.schema,
      status: envelope.status,
      capability_id: envelope.trace.capability_id,
      service_family: envelope.trace.service_family,
      receipt_capability_id: envelope.receipt_refs[0].capability_id,
      event_type: envelope.event_dag_refs[0].event_type,
    });

    const [
      gatewayModule,
      p2pNetworkModule,
      p2pChatModule,
      friendsListModule,
      deviceManagerModule,
      systemMonitorModule,
      naviModule,
      settingsModule,
      calculatorModule,
      clockModule,
    ] = await Promise.all([
      loadModule('/js/core/app-capability-gateway.js'),
      loadModule('/js/apps/p2p-network.js'),
      loadModule('/js/apps/p2p-chat-unified.js'),
      loadModule('/js/apps/friends-list.js'),
      loadModule('/js/apps/device-manager.js'),
      loadModule('/js/apps/system-monitor.js'),
      loadModule('/js/apps/navi.js'),
      loadModule('/js/apps/settings.js'),
      loadModule('/js/apps/calculator.js'),
      loadModule('/js/apps/clock.js'),
    ]);
    void p2pNetworkModule;

    let idCounter = 0;
    const desktop = {
      swissknife: {},
      eventBus: { on: () => undefined },
      p2pManager: null,
      showNotification: () => undefined,
      launchApp: async () => undefined,
    };
    const gateway = new gatewayModule.BrowserAppCapabilityGateway({
      desktop,
      idFactory: () => `system-network-local-${++idCounter}`,
    });
    (window as any).__swissKnifeCapabilityGateway = gateway;
    (window as any).swissKnifeCapabilityGateway = gateway;

    const p2pNetwork = (window as any).createP2PNetworkApp(desktop);
    const p2pChat = new p2pChatModule.UnifiedP2PChatApp(desktop);
    p2pChat.peerId = 'peer-local';
    p2pChat.peers.set('peer-remote', { id: 'peer-remote', status: 'online' });
    p2pChat.conversations.set('peer-remote', [{ id: 'message-1', content: 'hello', read: false }]);

    const friendsList = new friendsListModule.FriendsListApp(desktop);
    const deviceManager = new deviceManagerModule.DeviceManagerApp(desktop);
    const systemMonitor = new systemMonitorModule.SystemMonitorApp(desktop);
    const navi = new naviModule.NAVIApp(desktop);
    navi.conversations.push({ id: 'conversation-1', messages: [] });
    navi.context.apps.push('terminal', 'ipfs-explorer');
    navi.context.p2pPeers.push('peer-remote');
    const settings = new settingsModule.SettingsApp(desktop);
    settings.currentSection = 'p2p';
    const calculator = new calculatorModule.CalculatorApp(desktop);
    calculator.history.push('1 + 1 = 2');
    const clock = new clockModule.ClockApp(desktop);

    const appWorkflows = {
      'p2p-network': await p2pNetwork.exerciseSystemNetworkLocalGateway(),
      'p2p-chat-unified': await p2pChat.exerciseSystemNetworkLocalGateway(),
      'friends-list': await friendsList.exerciseSystemNetworkLocalGateway(),
      'device-manager': await deviceManager.exerciseSystemNetworkLocalGateway(),
      'system-monitor': await systemMonitor.exerciseSystemNetworkLocalGateway(),
      navi: await navi.exerciseSystemNetworkLocalGateway(),
      settings: await settings.exerciseSystemNetworkLocalGateway(),
      calculator: await calculator.exerciseSystemNetworkLocalGateway(),
      clock: await clock.exerciseSystemNetworkLocalGateway(),
    };

    deviceManager.onDestroy?.();
    systemMonitor.cleanup?.();
    navi.onDestroy?.();
    friendsList.cleanup?.();
    clock.cleanup?.();
    intervalIds.forEach(id => clearInterval(id));

    return Object.fromEntries(Object.entries(appWorkflows).map(([appId, workflow]: [string, any]) => [
      appId,
      {
        schema: workflow.schema,
        app_id: workflow.app_id,
        status: workflow.status,
        fallback: workflow.fallback,
        local_state: workflow.local_state,
        receipt_count: workflow.receipt_refs.length,
        event_count: workflow.event_dag_refs.length,
        local_capabilities: workflow.capabilities.local_capabilities,
        remote_capabilities: workflow.capabilities.remote_capabilities,
        service_boundaries: workflow.capabilities.service_boundaries,
        remote_envelopes: Object.fromEntries(Object.entries(workflow.remote_envelopes).map(([key, envelope]: [string, any]) => [
          key,
          summarizeEnvelope(envelope),
        ])),
      },
    ]));
  });

  const expectedRemoteCounts: Record<string, number> = {
    'p2p-network': 3,
    'p2p-chat-unified': 3,
    'friends-list': 3,
    'device-manager': 3,
    'system-monitor': 3,
    navi: 4,
    settings: 3,
    calculator: 0,
    clock: 0,
  };

  for (const [appId, workflow] of Object.entries(workflows as Record<string, any>)) {
    const remoteCount = expectedRemoteCounts[appId];
    expect(workflow.schema, appId).toBe('swissknife.system-network-local-workflow.v1');
    expect(workflow.app_id, appId).toBe(appId);
    expect(workflow.local_capabilities.length, appId).toBeGreaterThan(0);
    expect(workflow.local_capabilities.every((capability: any) => capability.capability_id.startsWith(`local.${appId}.`)), appId).toBe(true);
    expect(workflow.service_boundaries.local, appId).toEqual(['browser-local']);
    expect(Object.keys(workflow.remote_capabilities), appId).toHaveLength(remoteCount);
    expect(workflow.receipt_count, appId).toBe(remoteCount);
    expect(workflow.event_count, appId).toBe(remoteCount);

    if (remoteCount > 0) {
      expect(workflow.status, appId).toBe('degraded');
      expect(workflow.fallback, appId).toBe(true);
      expect(workflow.service_boundaries.remote.length, appId).toBeGreaterThan(0);
      for (const [key, envelope] of Object.entries(workflow.remote_envelopes as Record<string, any>)) {
        expect(envelope.schema, `${appId}:${key}`).toBe('swissknife.app-result-envelope.v1');
        expect(envelope.status, `${appId}:${key}`).toBe('degraded');
        expect(envelope.receipt_capability_id, `${appId}:${key}`).toBe(envelope.capability_id);
        expect(envelope.event_type, `${appId}:${key}`).toBe('app_capability_invocation');
      }
    } else {
      expect(workflow.status, appId).toBe('ok');
      expect(workflow.fallback, appId).toBe(false);
      expect(workflow.service_boundaries.remote, appId).toEqual([]);
      expect(workflow.remote_envelopes, appId).toEqual({});
    }
  }

  expect((workflows as Record<string, any>)['p2p-chat-unified'].remote_capabilities.node_status.capability_id).toBe('ipfs.kit.tool.node_id');
  expect((workflows as Record<string, any>)['friends-list'].remote_capabilities.dataset_browse.capability_id).toBe('ipfs.datasets.operation.browse');
  expect((workflows as Record<string, any>)['device-manager'].remote_capabilities.hardware_profile.capability_id).toBe('ipfs.accelerate.operation.hardware_profile');
  expect((workflows as Record<string, any>)['system-monitor'].remote_capabilities.telemetry.capability_id).toBe('ipfs.accelerate.operation.telemetry');
  expect((workflows as Record<string, any>).navi.remote_capabilities.dataset_browse.capability_id).toBe('ipfs.datasets.operation.browse');
  expect((workflows as Record<string, any>).settings.remote_capabilities.node_status.capability_id).toBe('ipfs.kit.tool.node_id');
  expect((workflows as Record<string, any>).calculator.local_state.mode).toBe('standard');
  expect((workflows as Record<string, any>).clock.local_state.world_clock_count).toBeGreaterThan(0);
  expect(rawIPFSRequests).toEqual([]);
});

async function startStaticServer(webRoot: string): Promise<Server> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    if (pathname === '/system-network-local-harness.html') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end('<!doctype html><html><head><title>System Network Local Harness</title></head><body><main id="harness"></main></body></html>');
      return;
    }

    const filePath = normalize(join(webRoot, pathname));
    if (!filePath.startsWith(webRoot)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': mimeType(filePath),
      'cache-control': 'no-store',
    });
    response.end(readFileSync(filePath));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

function mimeType(filePath: string): string {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    case '.wasm':
      return 'application/wasm';
    default:
      return 'application/octet-stream';
  }
}
