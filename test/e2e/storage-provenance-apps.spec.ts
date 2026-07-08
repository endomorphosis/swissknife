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

test('productivity apps exercise storage, CID, dataset discovery, and provenance through gateway fallbacks', async ({ page }) => {
  const rawIPFSRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/v1/ipfs/')) rawIPFSRequests.push(request.url());
  });

  await page.goto(`${baseUrl}/storage-provenance-harness.html`, { waitUntil: 'domcontentloaded' });

  const workflows = await page.evaluate(async () => {
    localStorage.clear();
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
      fileManagerModule,
      notesModule,
      calendarModule,
      todoModule,
      githubModule,
    ] = await Promise.all([
      loadModule('/js/core/app-capability-gateway.js'),
      loadModule('/js/apps/file-manager.js'),
      loadModule('/js/apps/notes.js'),
      loadModule('/js/apps/calendar.js'),
      loadModule('/js/apps/todo.js'),
      loadModule('/js/apps/github.js'),
    ]);
    let idCounter = 0;
    const desktop = {
      swissknife: {},
      p2pManager: null,
      showNotification: () => undefined,
    };
    const gateway = new gatewayModule.BrowserAppCapabilityGateway({
      desktop,
      idFactory: () => `storage-provenance-${++idCounter}`,
    });
    (window as any).__swissKnifeCapabilityGateway = gateway;
    (window as any).swissKnifeCapabilityGateway = gateway;

    const fileManager = new fileManagerModule.FileManagerApp(desktop);
    fileManager.files = fileManager.exampleFiles.map((file: Record<string, unknown>, index: number) => ({
      ...file,
      path: `/${file.name}`,
      index,
    }));
    fileManager.selectedFiles.add(3);

    const notes = new notesModule.NotesApp(desktop);
    notes.currentNote = notes.notes[0];

    const calendar = new calendarModule.CalendarApp(desktop);

    const todo = new todoModule.TodoApp(desktop);

    const github = new githubModule.GitHubApp(desktop);
    github.repositories.set(1, {
      id: 1,
      name: 'swissknife',
      full_name: 'hallucinate-llc/swissknife',
      description: 'SwissKnife virtual desktop',
      private: false,
      owner: { login: 'hallucinate-llc' },
      updated_at: new Date().toISOString(),
      language: 'TypeScript',
      stargazers_count: 7,
      forks_count: 1,
    });

    const appWorkflows = {
      'file-manager': await fileManager.exerciseStorageProvenanceGateway(),
      notes: await notes.exerciseStorageProvenanceGateway(),
      calendar: await calendar.exerciseStorageProvenanceGateway(),
      todo: await todo.exerciseStorageProvenanceGateway(),
      github: await github.exerciseStorageProvenanceGateway(),
    };

    return Object.fromEntries(Object.entries(appWorkflows).map(([appId, workflow]: [string, any]) => [
      appId,
      {
        schema: workflow.schema,
        status: workflow.status,
        fallback: workflow.fallback,
        cid_ref: workflow.cid_ref,
        capabilities: workflow.capabilities,
        receipt_count: workflow.receipt_refs.length,
        event_count: workflow.event_dag_refs.length,
        storage: summarizeEnvelope(workflow.storage),
        dataset_discovery: summarizeEnvelope(workflow.dataset_discovery),
        provenance: summarizeEnvelope(workflow.provenance),
      },
    ]));
  });

  for (const [appId, workflow] of Object.entries(workflows as Record<string, any>)) {
    expect(workflow.schema, appId).toBe('swissknife.storage-provenance-workflow.v1');
    expect(['ok', 'degraded'], appId).toContain(workflow.status);
    expect(workflow.fallback, appId).toBe(true);
    expect(workflow.cid_ref, appId).toContain('browser:');
    expect(workflow.receipt_count, appId).toBe(3);
    expect(workflow.event_count, appId).toBe(3);
    expect(workflow.capabilities.dataset_discovery, appId).toBe('ipfs.datasets.operation.browse');
    expect(workflow.capabilities.provenance, appId).toBe('ipfs.datasets.operation.record_provenance');
    expect(workflow.storage.capability_id, appId).toMatch(/^ipfs\.kit\.tool\.(ipfs_add|dag_put)$/);
    expect(workflow.dataset_discovery.capability_id, appId).toBe('ipfs.datasets.operation.browse');
    expect(workflow.provenance.capability_id, appId).toBe('ipfs.datasets.operation.record_provenance');
    expect(workflow.storage.receipt_capability_id, appId).toBe(workflow.storage.capability_id);
    expect(workflow.dataset_discovery.event_type, appId).toBe('app_capability_invocation');
    expect(workflow.provenance.event_type, appId).toBe('app_capability_invocation');
  }

  expect(rawIPFSRequests).toEqual([]);
});

async function startStaticServer(webRoot: string): Promise<Server> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    if (pathname === '/storage-provenance-harness.html') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end('<!doctype html><html><head><title>Storage Provenance Harness</title></head><body><main id="harness"></main></body></html>');
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
