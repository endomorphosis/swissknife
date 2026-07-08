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

test('media and creative apps store generated artifacts with media refs, progress, and provenance', async ({ page }) => {
  const rawIPFSRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/v1/ipfs/')) rawIPFSRequests.push(request.url());
  });

  await page.goto(`${baseUrl}/media-artifact-harness.html`, { waitUntil: 'domcontentloaded' });

  const workflows = await page.evaluate(async () => {
    localStorage.clear();

    const gainParam = () => ({
      value: 1,
      setValueAtTime: () => undefined,
      exponentialRampToValueAtTime: () => undefined,
      linearRampToValueAtTime: () => undefined,
      cancelScheduledValues: () => undefined,
    });
    class AudioContextStub {
      state = 'running';
      currentTime = 0;
      sampleRate = 44100;
      destination = {};
      createGain() {
        return { gain: gainParam(), connect: () => undefined, disconnect: () => undefined };
      }
      createAnalyser() {
        return {
          fftSize: 0,
          smoothingTimeConstant: 0,
          frequencyBinCount: 32,
          connect: () => undefined,
          disconnect: () => undefined,
          getByteFrequencyData: () => undefined,
          getByteTimeDomainData: () => undefined,
        };
      }
      createBiquadFilter() {
        return {
          type: 'lowpass',
          frequency: gainParam(),
          Q: gainParam(),
          gain: gainParam(),
          connect: () => undefined,
          disconnect: () => undefined,
        };
      }
      createDynamicsCompressor() {
        return { connect: () => undefined, disconnect: () => undefined };
      }
      createConvolver() {
        return { buffer: null, connect: () => undefined, disconnect: () => undefined };
      }
      createBuffer(_channels: number, length: number) {
        return { getChannelData: () => new Float32Array(length) };
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
    }
    class AudioElementStub {
      crossOrigin = '';
      preload = '';
      src = '';
      duration = 0;
      currentTime = 0;
      volume = 1;
      addEventListener() { return undefined; }
      removeEventListener() { return undefined; }
      pause() { return undefined; }
      play() { return Promise.resolve(); }
      load() { return undefined; }
    }
    (window as any).AudioContext = AudioContextStub;
    (window as any).webkitAudioContext = AudioContextStub;
    (window as any).Audio = AudioElementStub;

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
      neuralPhotoshopModule,
      cinemaModule,
      mediaPlayerModule,
      imageViewerModule,
      musicStudioModule,
      strudelModule,
      strudelAIDAWModule,
    ] = await Promise.all([
      loadModule('/js/core/app-capability-gateway.js'),
      loadModule('/js/apps/neural-photoshop.js'),
      loadModule('/js/apps/cinema.js'),
      loadModule('/js/apps/media-player.js'),
      loadModule('/js/apps/image-viewer.js'),
      loadModule('/js/apps/music-studio-unified.js'),
      loadModule('/js/apps/strudel.js'),
      loadModule('/js/apps/strudel-ai-daw.js'),
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
      idFactory: () => `media-artifact-${++idCounter}`,
    });
    (window as any).__swissKnifeCapabilityGateway = gateway;
    (window as any).swissKnifeCapabilityGateway = gateway;

    const neuralPhotoshop = new neuralPhotoshopModule.NeuralPhotoshopApp(null, desktop);
    neuralPhotoshop.currentProject = { id: 'photo-project-1', name: 'Demo Composite' };
    neuralPhotoshop.layers = [
      { id: 'background', name: 'Background', visible: true },
      { id: 'subject', name: 'Subject', visible: true },
    ];

    const cinema = new cinemaModule.CinemaApp(desktop);
    cinema.currentProject = { id: 'cinema-project-1', name: 'Demo Trailer' };
    cinema.timeline.tracks.push({
      id: 'video-track-1',
      type: 'video',
      clips: [{ id: 'clip-1', name: 'Intro', duration: 8 }],
    });

    const mediaPlayer = new mediaPlayerModule.MediaPlayer(desktop);
    mediaPlayer.playlist = [{
      id: 'track-1',
      title: 'Demo Track',
      artist: 'SwissKnife',
      type: 'audio',
      duration: 120,
    }];

    const imageViewer = new imageViewerModule.ImageViewerApp(desktop);
    imageViewer.currentImage = imageViewer.images[0] || imageViewer.sampleImages[0];

    const musicStudio = new musicStudioModule.UnifiedMusicStudioApp(desktop);
    musicStudio.currentPattern = 'sound("bd sd").slow(2)';
    musicStudio.tracks.set('track-1', { id: 'track-1', name: 'Drums', type: 'instrument' });

    const strudel = new strudelModule.StrudelApp(desktop);
    strudel.patterns.set('pattern1', {
      id: 'pattern1',
      name: 'Pattern 1',
      code: 'sound("bd sd").slow(2)',
    });

    const strudelAIDAW = new strudelAIDAWModule.StrudelAIDAW(desktop);
    strudelAIDAW.currentCode = 'sound("bd sd").slow(2)';
    strudelAIDAW.codeContext = 'demo rhythm';
    strudelAIDAW.patterns.set('main', { id: 'main', code: strudelAIDAW.currentCode });

    const appWorkflows = {
      'neural-photoshop': await neuralPhotoshop.exerciseMediaArtifactGateway(),
      cinema: await cinema.exerciseMediaArtifactGateway(),
      'media-player': await mediaPlayer.exerciseMediaArtifactGateway(),
      'image-viewer': await imageViewer.exerciseMediaArtifactGateway(),
      'music-studio-unified': await musicStudio.exerciseMediaArtifactGateway(),
      strudel: await strudel.exerciseMediaArtifactGateway(),
      'strudel-ai-daw': await strudelAIDAW.exerciseMediaArtifactGateway(),
    };
    mediaPlayer.destroy?.();
    (window as any).mediaPlayer?.destroy?.();

    return Object.fromEntries(Object.entries(appWorkflows).map(([appId, workflow]: [string, any]) => [
      appId,
      {
        schema: workflow.schema,
        app_id: workflow.app_id,
        status: workflow.status,
        fallback: workflow.fallback,
        media_type: workflow.media_type,
        operation: workflow.operation,
        job_id: workflow.job_id,
        media_refs: workflow.media_refs,
        progress_count: workflow.progress_envelopes.length,
        receipt_count: workflow.receipt_refs.length,
        event_count: workflow.event_dag_refs.length,
        capabilities: workflow.capabilities,
        inference_job: summarizeEnvelope(workflow.inference_job),
        job_status: summarizeEnvelope(workflow.job_status),
        telemetry: summarizeEnvelope(workflow.telemetry),
        artifact_storage: summarizeEnvelope(workflow.artifact_storage),
        artifact_pin: summarizeEnvelope(workflow.artifact_pin),
        provenance: summarizeEnvelope(workflow.provenance),
      },
    ]));
  });

  for (const [appId, workflow] of Object.entries(workflows as Record<string, any>)) {
    expect(workflow.schema, appId).toBe('swissknife.media-artifact-workflow.v1');
    expect(workflow.app_id, appId).toBe(appId);
    expect(['ok', 'degraded'], appId).toContain(workflow.status);
    expect(workflow.fallback, appId).toBe(true);
    expect(workflow.job_id, appId).toBeTruthy();
    expect(workflow.progress_count, appId).toBe(2);
    expect(workflow.receipt_count, appId).toBe(6);
    expect(workflow.event_count, appId).toBe(6);
    expect(workflow.media_refs, appId).toHaveLength(1);
    expect(workflow.media_refs[0].cid, appId).toContain('browser:');
    expect(workflow.media_refs[0].job_id, appId).toBe(workflow.job_id);
    expect(workflow.media_refs[0].media_type, appId).toBe(workflow.media_type);

    expect(workflow.capabilities.app_id, appId).toBe(appId);
    expect(workflow.capabilities.inference_job, appId).toBe('ipfs.accelerate.operation.run_inference_job');
    expect(workflow.capabilities.job_status, appId).toBe('ipfs.accelerate.operation.job_status');
    expect(workflow.capabilities.telemetry, appId).toBe('ipfs.accelerate.operation.telemetry');
    expect(workflow.capabilities.artifact_storage, appId).toBe('ipfs.kit.tool.ipfs_add');
    expect(workflow.capabilities.artifact_pin, appId).toBe('ipfs.kit.tool.pin_add');
    expect(workflow.capabilities.provenance, appId).toBe('ipfs.datasets.operation.record_provenance');

    expect(workflow.inference_job.capability_id, appId).toBe('ipfs.accelerate.operation.run_inference_job');
    expect(workflow.job_status.capability_id, appId).toBe('ipfs.accelerate.operation.job_status');
    expect(workflow.telemetry.capability_id, appId).toBe('ipfs.accelerate.operation.telemetry');
    expect(workflow.artifact_storage.capability_id, appId).toBe('ipfs.kit.tool.ipfs_add');
    expect(workflow.artifact_pin.capability_id, appId).toBe('ipfs.kit.tool.pin_add');
    expect(workflow.provenance.capability_id, appId).toBe('ipfs.datasets.operation.record_provenance');
    expect(workflow.artifact_storage.receipt_capability_id, appId).toBe('ipfs.kit.tool.ipfs_add');
    expect(workflow.artifact_pin.receipt_capability_id, appId).toBe('ipfs.kit.tool.pin_add');
    expect(workflow.job_status.event_type, appId).toBe('app_capability_invocation');
    expect(workflow.telemetry.event_type, appId).toBe('app_capability_invocation');
    expect(workflow.provenance.event_type, appId).toBe('app_capability_invocation');
  }

  expect((workflows as Record<string, any>)['neural-photoshop'].media_type).toBe('image');
  expect((workflows as Record<string, any>).cinema.media_type).toBe('video');
  expect((workflows as Record<string, any>)['media-player'].media_type).toBe('audio');
  expect((workflows as Record<string, any>)['image-viewer'].media_type).toBe('image');
  expect((workflows as Record<string, any>)['music-studio-unified'].media_type).toBe('audio');
  expect((workflows as Record<string, any>).strudel.media_type).toBe('audio');
  expect((workflows as Record<string, any>)['strudel-ai-daw'].media_type).toBe('audio');
  expect(rawIPFSRequests).toEqual([]);
});

async function startStaticServer(webRoot: string): Promise<Server> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    if (pathname === '/media-artifact-harness.html') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end('<!doctype html><html><head><title>Media Artifact Harness</title></head><body><main id="harness"></main></body></html>');
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
