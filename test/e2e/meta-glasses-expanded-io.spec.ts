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

const EXPANDED_APP = {
  appId: 'swissknife.meta-glasses.expanded-io',
  title: 'Swissknife Expanded Meta Glasses I/O',
  capabilities: [
    'camera.photo_capture',
    'camera.video_capture',
    'microphone.input',
    'speaker.output',
    'headphone.output',
    'display.output',
    'neural_band.input',
    'captouch.input',
    'motion.orientation',
    'phone_gps.context',
  ],
} as const;

test.describe('expanded Meta glasses I/O Swissknife app', () => {
  test('renders mocked expanded I/O, receipts, app bindings, and blocks unauthorized handoff', async ({ page }) => {
    await openExpandedIoApp(page);

    await expect(page.getByRole('heading', { name: EXPANDED_APP.title })).toBeVisible();
    await expect(page.getByTestId('mock-device')).toContainText('Meta Glasses Expanded I/O Mock');
    await expect(page.getByTestId('mock-device')).toContainText('hardware-free=true');
    await expect(page.getByTestId('permission-state')).toContainText('No active permission prompt');

    for (const capability of EXPANDED_APP.capabilities) {
      await expect(page.getByTestId(`binding-${capability}`)).toContainText(`${capability}.binding`);
    }

    await page.getByTestId('invoke-camera.photo_capture').click();
    await expect(page.getByTestId('permission-state')).toContainText('Prompt: meta_glasses.camera.photo');
    await page.getByTestId('deny-active-permission').click();
    await expect(page.getByTestId('fallback-ui')).toContainText('camera.photo_capture: permission_denied');
    await expect(page.getByTestId('fallback-ui')).toContainText('request_permission_again');
    await expect(page.getByTestId('control-plane-handoffs')).not.toContainText('camera.photo_capture: denied');

    await page.getByTestId('invoke-camera.photo_capture').click();
    await page.getByTestId('grant-active-permission').click();
    await expect(page.getByTestId('visible-state')).toContainText('camera.photo_capture: ready');
    await expect(page.getByTestId('capture-refs')).toContainText('camera.photo_capture: asset_uri=ipfs://bafybeimockphoto');
    await expect(page.getByTestId('capture-refs')).toContainText('sha256:photo-capture-receipt');

    for (const capability of [
      'camera.video_capture',
      'microphone.input',
      'speaker.output',
      'headphone.output',
      'display.output',
      'motion.orientation',
      'phone_gps.context',
    ]) {
      await page.getByTestId(`invoke-${capability}`).click();
      await expect(page.getByTestId('visible-state')).toContainText(`${capability}: ready`);
    }

    await page.getByTestId('input-target').focus();
    await page.keyboard.press('ArrowRight');
    await page.getByTestId('input-target').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('app-interactions')).toContainText('neural_band.input: ArrowRight -> views.navigate_timeline');
    await expect(page.getByTestId('app-interactions')).toContainText('captouch.input: Enter -> commands.confirm_selection');
    await expect(page.getByTestId('visible-state')).toContainText('neural_band.input: ready');
    await expect(page.getByTestId('visible-state')).toContainText('captouch.input: ready');

    await expect(page.getByTestId('capture-refs')).toContainText('camera.video_capture: stream_state=ready');
    await expect(page.getByTestId('capture-refs')).toContainText('microphone.input: transcript=hardware-free microphone route ready');
    await expect(page.getByTestId('capture-refs')).toContainText('speaker.output: audio_cid=sha256:speaker-audio-sample');
    await expect(page.getByTestId('capture-refs')).toContainText('headphone.output: audio_cid=sha256:headphone-audio-sample');
    await expect(page.getByTestId('capture-refs')).toContainText('display.output: widget_id=handsfree.task-progress-widget; widget_cid=sha256:mock-display-widget');
    await expect(page.getByTestId('capture-refs')).toContainText('motion.orientation: yaw=12.5');
    await expect(page.getByTestId('capture-refs')).toContainText('phone_gps.context: source=phone-os-mock; latitude=37.789; longitude=-122.401');
    await expect(page.getByTestId('capture-refs')).not.toContainText('raw_audio');
    await expect(page.getByTestId('capture-refs')).not.toContainText('raw_pixels');

    await expect(page.getByTestId('bridge-route')).toContainText('bluetooth=route-state');
    await expect(page.getByTestId('bridge-route')).toContainText('wifi=app-level-handoff');
    await expect(page.getByTestId('bridge-route')).toContainText('libp2p-mgw-519-playwright');
    await expect(page.getByTestId('bridge-route')).toContainText('edge-session-mgw-519-playwright');

    await expect(page.getByTestId('control-plane-handoffs')).toContainText('swissknife.mobile_orb.publish_glasses_event');
    await expect(page.getByTestId('control-plane-handoffs')).toContainText('Hallucinate App policy handoff outcome=allow');
    await expect(page.getByTestId('control-plane-handoffs')).toContainText('swissknife.mcp++/event-envelope@0.1.0');

    await expect(page.getByTestId('receipt-display')).toContainText('bafy-mgw519-receipt-camera');
    await expect(page.getByTestId('receipt-display')).toContainText('bafy-mgw519-receipt-microphone');
    await expect(page.getByTestId('receipt-display')).toContainText('bafy-mgw519-receipt-headphones');
    await expect(page.getByTestId('receipt-display')).toContainText('bafy-mgw519-receipt-display');
    await expect(page.getByTestId('receipt-display')).toContainText('bafy-mgw519-receipt-neural-band');
    await expect(page.getByTestId('receipt-display')).toContainText('bafy-mgw519-receipt-captouch');
    await expect(page.getByTestId('receipt-display')).toContainText('sha256:display-lifecycle-receipt');

    await page.getByTestId('attempt-unauthorized-handoff').click();
    await expect(page.getByTestId('security-state')).toContainText('unauthorized_control_plane_handoff: blocked');
    await expect(page.getByTestId('security-state')).toContainText('receipt=sha256:blocked-unauthorized-handoff');
    await expect(page.getByTestId('control-plane-handoffs')).not.toContainText('unauthorized-control-plane');
  });

  test('surfaces fallback UI for denied, unsupported, degraded, stale, and recovered expanded I/O routes', async ({ page }) => {
    await openExpandedIoApp(page);

    for (const mode of [
      'permission_denial',
      'unsupported_capability',
      'degraded_capability',
      'stale_session',
      'route_loss',
      'recovery',
    ]) {
      await page.getByTestId(`failure-${mode}`).click();
    }

    await expect(page.getByTestId('fallback-ui')).toContainText('camera.photo_capture: permission_denied');
    await expect(page.getByTestId('fallback-ui')).toContainText('neural_band.input: unsupported');
    await expect(page.getByTestId('fallback-ui')).toContainText('motion.orientation: degraded');
    await expect(page.getByTestId('fallback-ui')).toContainText('display.output: stale_session');
    await expect(page.getByTestId('fallback-ui')).toContainText('microphone.input: route_lost');
    await expect(page.getByTestId('fallback-ui')).toContainText('microphone.input: ready');
    await expect(page.getByTestId('diagnostics')).toContainText('fallback_to_mobile');
    await expect(page.getByTestId('diagnostics')).toContainText('lower_sample_rate');
    await expect(page.getByTestId('diagnostics')).toContainText('reroute_bluetooth_profile');
    await expect(page.getByTestId('receipt-display')).toContainText('sha256:route-recovered-envelope');
  });
});

async function openExpandedIoApp(page: Page): Promise<void> {
  const expandedIo = JSON.parse(fs.readFileSync(EXPANDED_IO_FIXTURE, 'utf8'));
  const controlPlane = JSON.parse(fs.readFileSync(CONTROL_PLANE_FIXTURE, 'utf8'));

  await page.setContent(renderExpandedIoHtml());
  await page.evaluate(
    ({ app, expandedIoFixture, controlPlaneFixture }) => {
      type Capability = {
        kind: string;
        readiness: string;
        route: string;
        permission_scope: string;
        sample?: Record<string, unknown>;
      };
      type Binding = {
        binding_id: string;
        method: string;
        interaction: string;
      };
      type FailureMode = {
        id: string;
        capability: string;
        readiness: string;
        recovery: string;
      };

      const root = document.getElementById('root') as HTMLElement;
      const capabilities = expandedIoFixture.capabilities as Capability[];
      const bindings = expandedIoFixture.swissknife_app_bindings as Binding[];
      const failures = expandedIoFixture.failure_modes as FailureMode[];
      const state = {
        pendingPermission: '' as string,
        permissionScope: '' as string,
        visible: [] as string[],
        refs: [] as string[],
        routes: [] as string[],
        handoffs: [] as string[],
        receipts: [] as string[],
        fallbacks: [] as string[],
        diagnostics: [] as string[],
        interactions: [] as string[],
        security: [] as string[],
      };

      function findCapability(kind: string): Capability {
        const capability = capabilities.find(item => item.kind === kind);
        if (!capability) {
          throw new Error(`Unknown capability: ${kind}`);
        }
        return capability;
      }

      function eventTypeFor(kind: string): string {
        const eventTypes: Record<string, string> = {
          'camera.photo_capture': 'camera.photo_ref',
          'camera.video_capture': 'camera.photo_ref',
          'microphone.input': 'microphone.transcript_ref',
          'speaker.output': 'headphones.playback_state',
          'headphone.output': 'headphones.playback_state',
          'display.output': 'display.action',
          'neural_band.input': 'Neural Band.intent',
          'captouch.input': 'captouch.intent',
        };
        return eventTypes[kind] || 'camera.photo_ref';
      }

      function controlEventFor(kind: string) {
        return controlPlaneFixture.events.find((event: any) => event.event_type === eventTypeFor(kind))
          || controlPlaneFixture.events[0];
      }

      function render() {
        root.innerHTML = `
          <main>
            <h1>${app.title}</h1>
            <p data-testid="mock-device">
              ${expandedIoFixture.mock_device.device_name};
              session=${expandedIoFixture.mock_device.session_id};
              hardware-free=${expandedIoFixture.hardware_free}
            </p>
            <section aria-label="Swissknife app bindings">
              ${app.capabilities.map((kind: string) => {
                const binding = bindings.find(item => item.binding_id === `${kind}.binding`);
                return `
                  <p data-testid="binding-${kind}">
                    ${kind}: ${binding?.binding_id}; method=${binding?.method}; interaction=${binding?.interaction}
                  </p>
                `;
              }).join('')}
            </section>
            <section aria-label="Expanded I/O controls">
              ${app.capabilities.map((kind: string) => `<button data-testid="invoke-${kind}" data-invoke="${kind}">Invoke ${kind}</button>`).join('')}
              <button data-testid="attempt-unauthorized-handoff" data-unauthorized="true">Unauthorized handoff</button>
              <button data-testid="input-target">Meta glasses input target</button>
            </section>
            <section data-testid="permission-state">
              ${state.pendingPermission
                ? `Prompt: ${state.permissionScope}
                   <button data-testid="deny-active-permission" data-deny="${state.pendingPermission}">Deny</button>
                   <button data-testid="grant-active-permission" data-grant="${state.pendingPermission}">Grant</button>`
                : 'No active permission prompt'}
            </section>
            <section data-testid="fallback-ui">${state.fallbacks.join('\n')}</section>
            <section data-testid="visible-state">${state.visible.join('\n')}</section>
            <section data-testid="capture-refs">${state.refs.join('\n')}</section>
            <section data-testid="app-interactions">${state.interactions.join('\n')}</section>
            <section data-testid="bridge-route">${state.routes.join('\n')}</section>
            <section data-testid="control-plane-handoffs">${state.handoffs.join('\n')}</section>
            <section data-testid="receipt-display">${state.receipts.join('\n')}</section>
            <section data-testid="security-state">${state.security.join('\n')}</section>
            <section data-testid="diagnostics">
              physical_hardware_required=${expandedIoFixture.physical_hardware_required}
              paired_glasses_required=${expandedIoFixture.paired_glasses_required}
              ${state.diagnostics.join('\n')}
            </section>
            <section aria-label="Fallback routes">
              ${failures.map(failure => `<button data-testid="failure-${failure.id}" data-failure="${failure.id}">${failure.id}</button>`).join('')}
            </section>
          </main>
        `;
      }

      function requestCapability(kind: string) {
        const capability = findCapability(kind);
        if (kind === 'camera.photo_capture') {
          state.pendingPermission = kind;
          state.permissionScope = capability.permission_scope;
          render();
          return;
        }
        recordCapability(kind);
        render();
      }

      function denyCapability(kind: string) {
        const failure = failures.find(item => item.id === 'permission_denial');
        state.fallbacks.push(`${kind}: ${failure?.readiness}; recovery=${failure?.recovery}`);
        state.diagnostics.push(`${kind}: permission denied before control-plane handoff`);
        state.pendingPermission = '';
        state.permissionScope = '';
        render();
      }

      function grantCapability(kind: string) {
        state.pendingPermission = '';
        state.permissionScope = '';
        recordCapability(kind);
        render();
      }

      function recordCapability(kind: string, interaction?: string) {
        const capability = findCapability(kind);
        const binding = bindings.find(item => item.binding_id === `${kind}.binding`);
        const event = controlEventFor(kind);
        state.visible.push(`${kind}: ${capability.readiness}; route=${capability.route}`);
        state.refs.push(`${kind}: ${formatSample(capability.sample || {})}`);
        if (interaction) {
          state.interactions.push(interaction);
        }
        for (const receipt of [capability.sample?.receipt_cid, ...(event.receipts || [])]) {
          if (receipt) state.receipts.push(String(receipt));
        }
        state.routes.push(
          `${kind}: edge=${event.edge_session_id}; app_binding=${event.app_binding_id}; ` +
          `bluetooth=${event.transport?.bluetooth}; wifi=${event.transport?.wifi}; ` +
          `peer=${event.handoff?.libp2p_peer_id}; session=${event.handoff?.libp2p_session_id}`,
        );
        state.handoffs.push(
          `${kind}: ${event.control_plane?.route}; profile=${event.handoff?.mcp_plus_plus_profile}; ` +
          `Hallucinate App policy handoff outcome=${event.policy?.outcome}; binding=${binding?.binding_id}`,
        );
        state.fallbacks.push(`${kind}: ${event.fallback?.state}; ${event.fallback?.reason}`);
        state.diagnostics.push(`${kind}: ${capability.permission_scope}; raw_payload_forwarded=false`);
      }

      function formatSample(sample: Record<string, unknown>): string {
        return Object.entries(sample)
          .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
          .join('; ');
      }

      function recordFailure(id: string) {
        const failure = failures.find(item => item.id === id);
        if (!failure) return;
        state.fallbacks.push(`${failure.capability}: ${failure.readiness}; recovery=${failure.recovery}`);
        state.diagnostics.push(`${id}: ${failure.recovery}`);
        const envelope = expandedIoFixture.control_plane_envelopes.find((item: any) => item.capability === failure.capability);
        if (envelope?.receipt?.receipt_cid) {
          state.receipts.push(envelope.receipt.receipt_cid);
        }
        render();
      }

      function blockUnauthorizedHandoff() {
        state.security.push('unauthorized_control_plane_handoff: blocked; route=swissknife.mobile_orb.publish_glasses_event; receipt=sha256:blocked-unauthorized-handoff');
        render();
      }

      root.addEventListener('click', event => {
        const target = event.target as HTMLElement;
        if (target.dataset.invoke) requestCapability(target.dataset.invoke);
        if (target.dataset.deny) denyCapability(target.dataset.deny);
        if (target.dataset.grant) grantCapability(target.dataset.grant);
        if (target.dataset.failure) recordFailure(target.dataset.failure);
        if (target.dataset.unauthorized) blockUnauthorizedHandoff();
      });

      root.addEventListener('keydown', event => {
        if ((event.target as HTMLElement).dataset.testid !== 'input-target') {
          return;
        }
        if (event.key === 'ArrowRight') {
          recordCapability('neural_band.input', 'neural_band.input: ArrowRight -> views.navigate_timeline');
          render();
        }
        if (event.key === 'Enter') {
          recordCapability('captouch.input', 'captouch.input: Enter -> commands.confirm_selection');
          render();
        }
      });

      render();
    },
    {
      app: EXPANDED_APP,
      expandedIoFixture: expandedIo,
      controlPlaneFixture: controlPlane,
    },
  );
}

function renderExpandedIoHtml(): string {
  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Swissknife Expanded Meta Glasses I/O</title>
        <style>
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            color: #1c252d;
            background: #f4f7f9;
          }
          main {
            max-width: 1160px;
            margin: 0 auto;
            padding: 24px;
          }
          section {
            margin: 12px 0;
            padding: 12px;
            border: 1px solid #d4dce5;
            background: #fff;
            white-space: pre-wrap;
          }
          button {
            margin: 4px 8px 4px 0;
            padding: 8px 10px;
          }
        </style>
      </head>
      <body>
        <div id="root"></div>
      </body>
    </html>`;
}
