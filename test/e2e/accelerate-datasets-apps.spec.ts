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

test('AI and compute-heavy apps exercise accelerate and datasets gateway progress workflows', async ({ page }) => {
  const rawIPFSRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/v1/ipfs/')) rawIPFSRequests.push(request.url());
  });

  await page.goto(`${baseUrl}/accelerate-datasets-harness.html`, { waitUntil: 'domcontentloaded' });

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
      aiChatModule,
      modelBrowserModule,
      huggingFaceModule,
      openRouterModule,
      taskManagerModule,
      trainingManagerModule,
      neuralNetworkDesignerModule,
    ] = await Promise.all([
      loadModule('/js/core/app-capability-gateway.js'),
      loadModule('/js/apps/ai-chat.js'),
      loadModule('/js/apps/model-browser.js'),
      loadModule('/js/apps/huggingface.js'),
      loadModule('/js/apps/openrouter.js'),
      loadModule('/js/apps/task-manager.js'),
      loadModule('/js/apps/training-manager.js'),
      loadModule('/js/apps/neural-network-designer.js'),
    ]);

    let idCounter = 0;
    const desktop = {
      swissknife: {},
      eventBus: { on: () => undefined },
      p2pManager: null,
      showNotification: () => undefined,
    };
    const gateway = new gatewayModule.BrowserAppCapabilityGateway({
      desktop,
      idFactory: () => `accelerate-datasets-${++idCounter}`,
    });
    (window as any).__swissKnifeCapabilityGateway = gateway;
    (window as any).swissKnifeCapabilityGateway = gateway;

    const aiChat = new aiChatModule.AIChatApp(desktop);
    aiChat.currentConversation = {
      id: 'conversation-1',
      messages: [{ role: 'user', content: 'Summarize model telemetry with citations.' }],
    };

    const modelBrowser = new modelBrowserModule.ModelBrowserApp(desktop);
    modelBrowser.models = [{
      id: 'bert-base-uncased',
      name: 'BERT Base Uncased',
      provider: 'huggingface',
      category: 'text-embedding',
    }];
    modelBrowser.selectedModel = modelBrowser.models[0];

    const huggingFace = new huggingFaceModule.HuggingFaceApp(desktop);
    huggingFace.models.set('gpt2', { id: 'gpt2', name: 'GPT-2', pipeline_tag: 'text-generation' });
    huggingFace.datasets.set('squad', { id: 'squad', name: 'SQuAD 2.0' });

    const openRouter = new openRouterModule.OpenRouterApp(desktop);
    openRouter.models.set('openai/gpt-4', { id: 'openai/gpt-4', name: 'GPT-4', provider: 'openai' });
    openRouter.providers.set('openai', { name: 'OpenAI', models: ['openai/gpt-4'] });

    const taskManager = new taskManagerModule.TaskManagerApp(desktop);
    taskManager.distributedTasks.set('job-1', {
      id: 'job-1',
      name: 'Inference monitor',
      status: 'running',
      progress: 50,
      model: 'llama-3.1-8b',
    });

    const trainingManager = new trainingManagerModule.TrainingManagerApp(desktop);
    trainingManager.trainingJobs.push({
      id: 'training-job-1',
      name: 'Demo classifier',
      architecture: 'vit-base',
      dataset: 'demo-images',
      status: 'running',
      progress: 38,
      config: { epochs: 8, batchSize: 16 },
    });

    const neuralDesigner = new neuralNetworkDesignerModule.NeuralNetworkDesignerApp(desktop);
    neuralDesigner.networkConfig.layers.push(
      { id: 'input-1', type: 'input', name: 'Input' },
      { id: 'dense-1', type: 'dense', name: 'Dense' },
    );
    neuralDesigner.networkConfig.connections.push({ from: 'input-1', to: 'dense-1' });

    const appWorkflows = {
      'ai-chat': await aiChat.exerciseAccelerateDatasetsGateway(),
      'model-browser': await modelBrowser.exerciseAccelerateDatasetsGateway(),
      huggingface: await huggingFace.exerciseAccelerateDatasetsGateway(),
      openrouter: await openRouter.exerciseAccelerateDatasetsGateway(),
      'task-manager': await taskManager.exerciseAccelerateDatasetsGateway(),
      'training-manager': await trainingManager.exerciseAccelerateDatasetsGateway(),
      'neural-network-designer': await neuralDesigner.exerciseAccelerateDatasetsGateway(),
    };
    taskManager.onDestroy?.();

    return Object.fromEntries(Object.entries(appWorkflows).map(([appId, workflow]: [string, any]) => [
      appId,
      {
        schema: workflow.schema,
        status: workflow.status,
        fallback: workflow.fallback,
        job_id: workflow.job_id,
        progress_count: workflow.progress_envelopes.length,
        receipt_count: workflow.receipt_refs.length,
        event_count: workflow.event_dag_refs.length,
        capabilities: workflow.capabilities,
        model_discovery: summarizeEnvelope(workflow.model_discovery),
        hardware_profile: summarizeEnvelope(workflow.hardware_profile),
        dataset_discovery: summarizeEnvelope(workflow.dataset_discovery),
        embedding: summarizeEnvelope(workflow.embedding),
        vector_search: summarizeEnvelope(workflow.vector_search),
        semantic_search: summarizeEnvelope(workflow.semantic_search),
        inference_job: summarizeEnvelope(workflow.inference_job),
        job_status: summarizeEnvelope(workflow.job_status),
        telemetry: summarizeEnvelope(workflow.telemetry),
        provenance: summarizeEnvelope(workflow.provenance),
      },
    ]));
  });

  for (const [appId, workflow] of Object.entries(workflows as Record<string, any>)) {
    expect(workflow.schema, appId).toBe('swissknife.accelerate-datasets-workflow.v1');
    expect(['ok', 'degraded'], appId).toContain(workflow.status);
    expect(workflow.fallback, appId).toBe(true);
    expect(workflow.job_id, appId).toBeTruthy();
    expect(workflow.progress_count, appId).toBe(2);
    expect(workflow.receipt_count, appId).toBe(10);
    expect(workflow.event_count, appId).toBe(10);

    expect(workflow.capabilities.model_discovery, appId).toBe('ipfs.accelerate.operation.list_models');
    expect(workflow.capabilities.hardware_profile, appId).toBe('ipfs.accelerate.operation.hardware_profile');
    expect(workflow.capabilities.inference_job, appId).toBe('ipfs.accelerate.operation.run_inference_job');
    expect(workflow.capabilities.job_status, appId).toBe('ipfs.accelerate.operation.job_status');
    expect(workflow.capabilities.telemetry, appId).toBe('ipfs.accelerate.operation.telemetry');
    expect(workflow.capabilities.dataset_discovery, appId).toBe('ipfs.datasets.operation.list_datasets');
    expect(workflow.capabilities.embedding, appId).toBe('ipfs.datasets.operation.embed');
    expect(workflow.capabilities.vector_search, appId).toBe('ipfs.datasets.operation.vector_search');
    expect(workflow.capabilities.semantic_search, appId).toBe('ipfs.datasets.operation.semantic_search');
    expect(workflow.capabilities.provenance, appId).toBe('ipfs.datasets.operation.record_provenance');

    expect(workflow.model_discovery.capability_id, appId).toBe('ipfs.accelerate.operation.list_models');
    expect(workflow.hardware_profile.capability_id, appId).toBe('ipfs.accelerate.operation.hardware_profile');
    expect(workflow.dataset_discovery.capability_id, appId).toBe('ipfs.datasets.operation.list_datasets');
    expect(workflow.embedding.capability_id, appId).toBe('ipfs.datasets.operation.embed');
    expect(workflow.vector_search.capability_id, appId).toBe('ipfs.datasets.operation.vector_search');
    expect(workflow.semantic_search.capability_id, appId).toBe('ipfs.datasets.operation.semantic_search');
    expect(workflow.inference_job.capability_id, appId).toBe('ipfs.accelerate.operation.run_inference_job');
    expect(workflow.job_status.capability_id, appId).toBe('ipfs.accelerate.operation.job_status');
    expect(workflow.telemetry.capability_id, appId).toBe('ipfs.accelerate.operation.telemetry');
    expect(workflow.provenance.capability_id, appId).toBe('ipfs.datasets.operation.record_provenance');
    expect(workflow.job_status.event_type, appId).toBe('app_capability_invocation');
    expect(workflow.telemetry.event_type, appId).toBe('app_capability_invocation');
  }

  expect(rawIPFSRequests).toEqual([]);
});

async function startStaticServer(webRoot: string): Promise<Server> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    if (pathname === '/accelerate-datasets-harness.html') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end('<!doctype html><html><head><title>Accelerate Datasets Harness</title></head><body><main id="harness"></main></body></html>');
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
