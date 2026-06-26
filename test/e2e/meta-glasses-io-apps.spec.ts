import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const EXPANDED_IO_FIXTURE = path.join(
  process.cwd(),
  'test',
  'fixtures',
  'meta-glasses-io',
  'hardware-free-expanded-io.json',
);
const CONTROL_PLANE_FIXTURE = path.join(
  process.cwd(),
  'test',
  'e2e',
  'fixtures',
  'mgw-519-meta-glasses-control-plane.json',
);

const APP_SURFACES = [
  {
    appId: 'capture-review',
    title: 'Capture Review',
    capabilities: ['camera.photo_capture', 'camera.video_capture'],
  },
  {
    appId: 'audio-console',
    title: 'Audio Console',
    capabilities: ['microphone.input', 'speaker.output', 'headphone.output'],
  },
  {
    appId: 'input-lab',
    title: 'Input Lab',
    capabilities: ['neural_band.input', 'captouch.input', 'motion.orientation', 'phone_gps.context'],
  },
  {
    appId: 'display-diagnostics',
    title: 'Display Diagnostics',
    capabilities: ['display.output'],
  },
] as const;

test.describe('Swissknife apps with mocked Meta glasses I/O', () => {
  test('opens apps and routes camera, audio, input, motion, GPS, and display through mocked control plane', async ({ page }) => {
    await openHarness(page);

    await expect(page.getByRole('heading', { name: 'Swissknife Meta Glasses I/O Harness' })).toBeVisible();
    await expect(page.getByTestId('mock-boundary')).toContainText('hardware-free');
    await expect(page.getByTestId('device-session')).toContainText('mock-session-expanded-io');

    for (const app of APP_SURFACES) {
      await page.getByTestId(`open-${app.appId}`).click();
      await expect(page.getByTestId('active-app')).toContainText(app.title);
      for (const capability of app.capabilities) {
        await expect(page.getByTestId(`binding-${capability}`)).toContainText(`${capability}.binding`);
      }
    }

    await page.getByTestId('open-capture-review').click();
    await page.getByTestId('invoke-camera.photo_capture').click();
    await expect(page.getByTestId('permission-prompt')).toContainText('meta_glasses.camera.photo');
    await page.getByTestId('deny-camera.photo_capture').click();
    await expect(page.getByTestId('fallback-ui')).toContainText('permission_denied');
    await expect(page.getByTestId('fallback-ui')).toContainText('request_permission_again');
    await page.getByTestId('invoke-camera.photo_capture').click();
    await page.getByTestId('grant-camera.photo_capture').click();
    await expect(page.getByTestId('capture-refs')).toContainText('ipfs://bafybeimockphoto');
    await expect(page.getByTestId('capture-refs')).toContainText('sha256:photo-capture-receipt');

    await invokeCapability(page, 'camera.video_capture');
    await invokeCapability(page, 'microphone.input');
    await invokeCapability(page, 'speaker.output');
    await invokeCapability(page, 'headphone.output');
    await invokeCapability(page, 'neural_band.input');
    await invokeCapability(page, 'captouch.input');
    await invokeCapability(page, 'motion.orientation');
    await invokeCapability(page, 'phone_gps.context');
    await invokeCapability(page, 'display.output');

    await expect(page.getByTestId('visible-state')).toContainText('camera.video_capture: ready');
    await expect(page.getByTestId('visible-state')).toContainText('microphone.input: ready');
    await expect(page.getByTestId('visible-state')).toContainText('speaker.output: ready');
    await expect(page.getByTestId('visible-state')).toContainText('headphone.output: ready');
    await expect(page.getByTestId('visible-state')).toContainText('neural_band.input: ready');
    await expect(page.getByTestId('visible-state')).toContainText('captouch.input: ready');
    await expect(page.getByTestId('visible-state')).toContainText('motion.orientation: ready');
    await expect(page.getByTestId('visible-state')).toContainText('phone_gps.context: ready');
    await expect(page.getByTestId('visible-state')).toContainText('display.output: ready');

    await expect(page.getByTestId('capture-refs')).toContainText('sha256:speaker-audio-sample');
    await expect(page.getByTestId('capture-refs')).toContainText('sha256:headphone-audio-sample');
    await expect(page.getByTestId('capture-refs')).toContainText('sha256:mock-display-widget');
    await expect(page.getByTestId('capture-refs')).toContainText('hardware-free microphone route ready');
    await expect(page.getByTestId('capture-refs')).toContainText('latitude: 37.789');

    await expect(page.getByTestId('bridge-route')).toContainText('bluetooth=route-state');
    await expect(page.getByTestId('bridge-route')).toContainText('wifi=app-level-handoff');
    await expect(page.getByTestId('bridge-route')).toContainText('libp2p-mgw-519-playwright');
    await expect(page.getByTestId('bridge-route')).toContainText('swissknife.mobile_orb.publish_glasses_event');

    await expect(page.getByTestId('control-plane-handoff')).toContainText('Hallucinate App policy handoff');
    await expect(page.getByTestId('control-plane-handoff')).toContainText('12D3KooWMgw519FixturePeer');
    await expect(page.getByTestId('control-plane-handoff')).toContainText('swissknife.mcp++/event-envelope@0.1.0');

    await expect(page.getByTestId('receipt-display')).toContainText('sha256:display-lifecycle-receipt');
    await expect(page.getByTestId('receipt-display')).toContainText('bafy-mgw519-receipt-camera');
    await expect(page.getByTestId('receipt-display')).toContainText('bafy-mgw519-receipt-display');
    await expect(page.getByTestId('diagnostics')).toContainText('Meta Glasses Expanded I/O Mock');
    await expect(page.getByTestId('diagnostics')).toContainText('physical_hardware_required=false');
  });

  test('shows fallback diagnostics for denied, unsupported, degraded, stale, and recovered routes', async ({ page }) => {
    await openHarness(page);

    for (const mode of ['permission_denial', 'unsupported_capability', 'degraded_capability', 'stale_session', 'route_loss', 'recovery']) {
      await page.getByTestId(`failure-${mode}`).click();
    }

    await expect(page.getByTestId('fallback-ui')).toContainText('permission_denied');
    await expect(page.getByTestId('fallback-ui')).toContainText('unsupported');
    await expect(page.getByTestId('fallback-ui')).toContainText('degraded');
    await expect(page.getByTestId('fallback-ui')).toContainText('stale_session');
    await expect(page.getByTestId('fallback-ui')).toContainText('route_lost');
    await expect(page.getByTestId('fallback-ui')).toContainText('route_recovered');
    await expect(page.getByTestId('diagnostics')).toContainText('fallback_to_mobile');
    await expect(page.getByTestId('diagnostics')).toContainText('lower_sample_rate');
    await expect(page.getByTestId('diagnostics')).toContainText('reroute_bluetooth_profile');
    await expect(page.getByTestId('receipt-display')).toContainText('sha256:route-recovered-envelope');
  });
});

async function openHarness(page: Page): Promise<void> {
  const expandedIo = JSON.parse(fs.readFileSync(EXPANDED_IO_FIXTURE, 'utf8'));
  const controlPlane = JSON.parse(fs.readFileSync(CONTROL_PLANE_FIXTURE, 'utf8'));
  await page.setContent(renderHarnessHtml());
  await page.evaluate(
    ({ apps, expandedIoFixture, controlPlaneFixture }) => {
      type Capability = {
        kind: string;
        readiness: string;
        route: string;
        permission_scope: string;
        sample?: Record<string, unknown>;
      };
      type Binding = {
        binding_id: string;
        app_id: string;
        method: string;
      };
      type FailureMode = {
        id: string;
        capability: string;
        readiness: string;
        recovery: string;
      };

      const root = document.getElementById('root') as HTMLElement;
      const state = {
        activeApp: apps[0],
        permissions: new Map<string, 'prompt' | 'granted' | 'denied'>(),
        visibleState: [] as string[],
        captureRefs: [] as string[],
        receipts: [] as string[],
        fallbacks: [] as string[],
        diagnostics: [] as string[],
        bridgeRoutes: [] as string[],
        handoffs: [] as string[],
      };
      const capabilities = expandedIoFixture.capabilities as Capability[];
      const bindings = expandedIoFixture.swissknife_app_bindings as Binding[];
      const failures = expandedIoFixture.failure_modes as FailureMode[];

      function controlEventFor(kind: string) {
        const normalized = kind
          .replace('speaker.output', 'headphones.playback_state')
          .replace('headphone.output', 'headphones.playback_state')
          .replace('camera.photo_capture', 'camera.photo_ref')
          .replace('camera.video_capture', 'camera.photo_ref')
          .replace('microphone.input', 'microphone.transcript_ref')
          .replace('display.output', 'display.action')
          .replace('neural_band.input', 'Neural Band.intent')
          .replace('captouch.input', 'captouch.intent');
        return controlPlaneFixture.events.find((event: any) => event.event_type === normalized) || controlPlaneFixture.events[0];
      }

      function render() {
        root.innerHTML = `
          <main>
            <header>
              <h1>Swissknife Meta Glasses I/O Harness</h1>
              <p data-testid="mock-boundary">${controlPlaneFixture.mock_boundary}; hardware-free=${expandedIoFixture.hardware_free}</p>
              <p data-testid="device-session">${expandedIoFixture.mock_device.device_name}; session=${expandedIoFixture.mock_device.session_id}</p>
            </header>
            <nav aria-label="Swissknife applications">
              ${apps.map((app: any) => `<button data-testid="open-${app.appId}" data-open-app="${app.appId}">${app.title}</button>`).join('')}
            </nav>
            <section class="app-window" aria-label="Active Swissknife application">
              <h2 data-testid="active-app">${state.activeApp.title}</h2>
              <div class="bindings">
                ${state.activeApp.capabilities.map((kind: string) => {
                  const binding = bindings.find(item => item.binding_id === `${kind}.binding`);
                  return `<p data-testid="binding-${kind}">${kind}: ${binding?.binding_id || 'missing'} -> ${binding?.method || 'missing'}</p>`;
                }).join('')}
              </div>
              <div class="controls">
                ${state.activeApp.capabilities.map((kind: string) => `<button data-testid="invoke-${kind}" data-invoke="${kind}">Invoke ${kind}</button>`).join('')}
              </div>
            </section>
            <section data-testid="permission-prompt">${renderPermissionPrompt()}</section>
            <section data-testid="fallback-ui">${state.fallbacks.join('\\n')}</section>
            <section data-testid="visible-state">${state.visibleState.join('\\n')}</section>
            <section data-testid="capture-refs">${state.captureRefs.join('\\n')}</section>
            <section data-testid="bridge-route">${state.bridgeRoutes.join('\\n')}</section>
            <section data-testid="control-plane-handoff">${state.handoffs.join('\\n')}</section>
            <section data-testid="receipt-display">${state.receipts.join('\\n')}</section>
            <section data-testid="diagnostics">
              physical_hardware_required=${expandedIoFixture.physical_hardware_required}
              paired_glasses_required=${expandedIoFixture.paired_glasses_required}
              device=${expandedIoFixture.mock_device.device_name}
              ${state.diagnostics.join('\\n')}
            </section>
            <section aria-label="Failure modes">
              ${failures.map(failure => `<button data-testid="failure-${failure.id}" data-failure="${failure.id}">${failure.id}</button>`).join('')}
            </section>
          </main>
        `;
      }

      function renderPermissionPrompt() {
        return Array.from(state.permissions.entries())
          .filter(([, status]) => status === 'prompt')
          .map(([kind]) => {
            const capability = findCapability(kind);
            return `
              <div>
                Permission required: ${capability.permission_scope}
                <button data-testid="deny-${kind}" data-deny="${kind}">Deny</button>
                <button data-testid="grant-${kind}" data-grant="${kind}">Grant</button>
              </div>
            `;
          })
          .join('');
      }

      function findCapability(kind: string): Capability {
        const capability = capabilities.find(item => item.kind === kind);
        if (!capability) {
          throw new Error(`Unknown Meta glasses capability: ${kind}`);
        }
        return capability;
      }

      function openApp(appId: string) {
        state.activeApp = apps.find((app: any) => app.appId === appId) || apps[0];
        render();
      }

      function requestCapability(kind: string) {
        const permission = state.permissions.get(kind);
        if (permission !== 'granted' && kind === 'camera.photo_capture') {
          state.permissions.set(kind, 'prompt');
          state.fallbacks.push(`${kind}: permission prompt pending`);
          render();
          return;
        }
        recordCapability(kind);
        render();
      }

      function denyCapability(kind: string) {
        const failure = failures.find(item => item.id === 'permission_denial');
        state.permissions.set(kind, 'denied');
        state.fallbacks.push(`${kind}: ${failure?.readiness}; recovery=${failure?.recovery}`);
        state.diagnostics.push(`permission denied for ${kind}`);
        render();
      }

      function grantCapability(kind: string) {
        state.permissions.set(kind, 'granted');
        recordCapability(kind);
        render();
      }

      function recordCapability(kind: string) {
        const capability = findCapability(kind);
        const binding = bindings.find(item => item.binding_id === `${kind}.binding`);
        const controlEvent = controlEventFor(kind);
        const sample = capability.sample || {};
        state.visibleState.push(`${kind}: ${capability.readiness}; binding=${binding?.binding_id}; route=${capability.route}`);
        state.captureRefs.push(formatSample(kind, sample));
        state.receipts.push(String(sample.receipt_cid || ''));
        for (const receipt of controlEvent.receipts || []) {
          state.receipts.push(receipt);
        }
        state.bridgeRoutes.push(
          `${kind}: bluetooth=${controlEvent.transport?.bluetooth}; wifi=${controlEvent.transport?.wifi}; ` +
          `libp2p=${controlEvent.handoff?.libp2p_session_id}; route=${controlEvent.control_plane?.route}`,
        );
        state.handoffs.push(
          `${kind}: Hallucinate App policy handoff; peer=${controlEvent.handoff?.libp2p_peer_id}; ` +
          `profile=${controlEvent.handoff?.mcp_plus_plus_profile}; policy=${controlEvent.policy?.outcome}`,
        );
        state.fallbacks.push(`${kind}: ${controlEvent.fallback?.state}; ${controlEvent.fallback?.reason}`);
        state.diagnostics.push(`${kind}: operation=${capability.route}; permission=${capability.permission_scope}`);
      }

      function formatSample(kind: string, sample: Record<string, unknown>) {
        if (kind === 'phone_gps.context') {
          return `${kind}: latitude: ${sample.latitude}; longitude: ${sample.longitude}; receipt=${sample.receipt_cid}`;
        }
        return `${kind}: ${Object.entries(sample).map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`).join('; ')}`;
      }

      function recordFailure(id: string) {
        const failure = failures.find(item => item.id === id);
        if (!failure) {
          return;
        }
        state.fallbacks.push(`${failure.capability}: ${failure.readiness}; recovery=${failure.recovery}`);
        state.diagnostics.push(`${id}: ${failure.recovery}`);
        const envelope = expandedIoFixture.control_plane_envelopes.find((item: any) => item.capability === failure.capability);
        if (envelope?.receipt?.receipt_cid) {
          state.receipts.push(envelope.receipt.receipt_cid);
        }
        render();
      }

      root.addEventListener('click', event => {
        const target = event.target as HTMLElement;
        const openAppId = target.dataset.openApp;
        const invokeKind = target.dataset.invoke;
        const denyKind = target.dataset.deny;
        const grantKind = target.dataset.grant;
        const failureId = target.dataset.failure;
        if (openAppId) {
          openApp(openAppId);
        } else if (invokeKind) {
          requestCapability(invokeKind);
        } else if (denyKind) {
          denyCapability(denyKind);
        } else if (grantKind) {
          grantCapability(grantKind);
        } else if (failureId) {
          recordFailure(failureId);
        }
      });

      render();
    },
    {
      apps: APP_SURFACES,
      expandedIoFixture: expandedIo,
      controlPlaneFixture: controlPlane,
    },
  );
}

async function invokeCapability(page: Page, capability: string): Promise<void> {
  const app = APP_SURFACES.find(surface => surface.capabilities.includes(capability as never));
  if (!app) {
    throw new Error(`No app surface found for ${capability}`);
  }
  await page.getByTestId(`open-${app.appId}`).click();
  await page.getByTestId(`invoke-${capability}`).click();
}

function renderHarnessHtml(): string {
  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Swissknife Meta Glasses I/O Playwright Harness</title>
        <style>
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            color: #172026;
            background: #f6f8fb;
          }
          main {
            max-width: 1120px;
            margin: 0 auto;
            padding: 24px;
          }
          header,
          section,
          nav {
            margin-bottom: 16px;
          }
          button {
            margin: 4px 8px 4px 0;
            padding: 8px 10px;
          }
          .app-window {
            border: 1px solid #b8c1cc;
            background: #fff;
            padding: 16px;
          }
          [data-testid="fallback-ui"],
          [data-testid="visible-state"],
          [data-testid="capture-refs"],
          [data-testid="bridge-route"],
          [data-testid="control-plane-handoff"],
          [data-testid="receipt-display"],
          [data-testid="diagnostics"] {
            white-space: pre-wrap;
            border: 1px solid #d8dee8;
            background: #fff;
            padding: 12px;
            min-height: 24px;
          }
        </style>
      </head>
      <body>
        <div id="root"></div>
      </body>
    </html>`;
}
