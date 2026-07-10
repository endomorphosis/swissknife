import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildMetaGlassesSimulatorHandoffEvidence,
  validateMetaGlassesSimulatorHandoffEvidence,
  type MetaGlassesSimulatorHandoffEvidence,
} from '../../src/services/glasses/meta-glasses-simulator-handoff';

const EVIDENCE_ROOT = path.join(
  process.cwd(),
  'test-results',
  'virtual-desktop-ipfs-mcp-orb',
);
const EVIDENCE_PATH = path.join(EVIDENCE_ROOT, 'glasses-simulator-handoff.json');
const SCREENSHOT_DIR = path.join(EVIDENCE_ROOT, 'glasses-simulator-screenshots');
const SCREENSHOT_PATH = path.join(SCREENSHOT_DIR, 'swr-086-simulator-handoff.png');

test.describe('Meta glasses simulator ORB/IDL handoff evidence', () => {
  test('renders simulator-visible display, camera, speaker, microphone, and handoff states', async ({ page }) => {
    const initialEvidence = await buildMetaGlassesSimulatorHandoffEvidence({
      generatedAt: '2026-07-10T00:00:00.000Z',
    });
    await openSimulator(page, initialEvidence);

    await expect(page.getByRole('heading', { name: 'SWR-086 Meta Glasses Simulator' })).toBeVisible();
    await expect(page.getByTestId('boundary')).toContainText('hardware_free=true');
    await expect(page.getByTestId('boundary')).toContainText('physical_glasses_required=false');
    await expect(page.getByTestId('boundary')).toContainText('direct_desktop_pairing_required=false');

    await expect(page.getByTestId('display-states')).toContainText('rendered');
    await expect(page.getByTestId('display-states')).toContainText('updated');
    await expect(page.getByTestId('display-states')).toContainText('focused');
    await expect(page.getByTestId('display-states')).toContainText('activated');
    await expect(page.getByTestId('display-states')).toContainText('cleared');

    await expect(page.getByTestId('camera-states')).toContainText('permission_denied');
    await expect(page.getByTestId('camera-states')).toContainText('fallback');
    await expect(page.getByTestId('camera-states')).toContainText('accepted');
    await expect(page.getByTestId('camera-states')).toContainText('mobile-fallback');

    await expect(page.getByTestId('audio-states')).toContainText('microphone.input');
    await expect(page.getByTestId('audio-states')).toContainText('speaker.output');
    await expect(page.getByTestId('audio-states')).toContainText('require_confirmation');
    await expect(page.getByTestId('audio-states')).toContainText('simulator.hardware-free');

    await expect(page.getByTestId('handoff-paths')).toContainText('desktop_to_mobile_orb_to_simulator');
    await expect(page.getByTestId('handoff-paths')).toContainText('mobile_to_desktop_resume');
    await expect(page.getByTestId('handoff-paths')).toContainText('direct_desktop_pairing=false');
    await expect(page.getByTestId('idl-projection')).toContainText('display_interface_cid=sha256:');
    await expect(page.getByTestId('idl-projection')).toContainText('mobile_orb_interface_cid=sha256:');

    await page.getByTestId('handoff-mobile').click();
    await expect(page.getByTestId('active-route')).toContainText('mobile_to_desktop_resume');
    await page.getByTestId('handoff-desktop').click();
    await expect(page.getByTestId('active-route')).toContainText('desktop_to_mobile_orb_to_simulator');
    await page.getByTestId('deny-camera').click();
    await expect(page.getByTestId('active-camera')).toContainText('permission_denied');
    await page.getByTestId('grant-camera').click();
    await expect(page.getByTestId('active-camera')).toContainText('accepted');

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

    const finalEvidence = await buildMetaGlassesSimulatorHandoffEvidence({
      generatedAt: '2026-07-10T00:00:00.000Z',
      playwrightProbe: {
        status: 'passed',
        screenshot: path.relative(process.cwd(), SCREENSHOT_PATH),
        visible_dom_assertions: [
          'display states rendered, updated, focused, activated, cleared',
          'camera permission_denied, fallback, accepted states visible',
          'microphone and speaker simulator policy states visible',
          'desktop/mobile handoff paths visible without direct desktop pairing',
          'ORB/IDL interface CIDs visible',
        ],
      },
    });
    const validation = validateMetaGlassesSimulatorHandoffEvidence(finalEvidence);
    expect(validation).toMatchObject({ valid: true, errors: [] });

    fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
    fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(finalEvidence, null, 2)}\n`);
  });
});

async function openSimulator(
  page: Page,
  evidence: MetaGlassesSimulatorHandoffEvidence,
): Promise<void> {
  await page.setContent(renderSimulatorHtml());
  await page.evaluate((handoffEvidence) => {
    const root = document.getElementById('root') as HTMLElement;
    const evidence = handoffEvidence as MetaGlassesSimulatorHandoffEvidence;
    const display = evidence.capability_evidence.find(item => item.capability === 'display.output');
    const camera = evidence.capability_evidence.find(item => item.capability === 'camera.photo_capture');
    const microphone = evidence.capability_evidence.find(item => item.capability === 'microphone.input');
    const speaker = evidence.capability_evidence.find(item => item.capability === 'speaker.output');
    const state = {
      activeRoute: evidence.handoff_paths[0]?.scenario ?? '',
      activeCamera: camera?.camera_permission_states?.[0]?.state ?? '',
    };

    function render() {
      root.innerHTML = `
        <main>
          <h1>SWR-086 Meta Glasses Simulator</h1>
          <section data-testid="boundary">
            hardware_free=${evidence.hardware_free};
            simulator_driven=${evidence.simulator_driven};
            physical_glasses_required=${evidence.physical_glasses_required};
            direct_desktop_pairing_required=${evidence.direct_desktop_pairing_required};
            paired_physical_glasses=${evidence.simulator.paired_physical_glasses}
          </section>
          <section data-testid="idl-projection">
            display_interface_cid=${evidence.orb_idl_projection.display_interface_cid}
            camera_interface_cid=${evidence.orb_idl_projection.camera_interface_cid}
            audio_interface_cid=${evidence.orb_idl_projection.audio_interface_cid}
            mobile_orb_interface_cid=${evidence.orb_idl_projection.mobile_orb_interface_cid}
          </section>
          <section data-testid="display-states">
            ${(display?.simulator_visible_states ?? []).map(item => [
              item.state,
              item.operation,
              item.mobile_action_type,
              item.receipt_cid,
            ].join(' | ')).join('\n')}
          </section>
          <section data-testid="camera-states">
            ${(camera?.camera_permission_states ?? []).map(item => [
              item.state,
              item.outcome,
              item.policy_outcome,
              item.selected_surface,
              item.receipt_cids.join(','),
            ].join(' | ')).join('\n')}
          </section>
          <section data-testid="audio-states">
            ${[
              ...(microphone?.audio_policy_states ?? []),
              ...(speaker?.audio_policy_states ?? []),
            ].map(item => [
              item.capability,
              item.state,
              item.policy_outcome,
              item.route_provider,
              item.route_bridge,
              `raw_audio_redacted=${item.raw_audio_redacted}`,
            ].join(' | ')).join('\n')}
          </section>
          <section data-testid="handoff-paths">
            ${evidence.handoff_paths.map(item => [
              item.scenario,
              `${item.from_surface}->${item.to_surface}`,
              `direct_desktop_pairing=${item.direct_desktop_pairing}`,
              `physical_glasses_required=${item.physical_glasses_required}`,
              item.through.join(' > '),
            ].join(' | ')).join('\n')}
          </section>
          <section data-testid="active-route">${state.activeRoute}</section>
          <section data-testid="active-camera">${state.activeCamera}</section>
          <button data-testid="handoff-mobile" data-route="mobile_to_desktop_resume">Mobile resume</button>
          <button data-testid="handoff-desktop" data-route="desktop_to_mobile_orb_to_simulator">Desktop handoff</button>
          <button data-testid="deny-camera" data-camera="permission_denied">Deny camera</button>
          <button data-testid="grant-camera" data-camera="accepted">Grant camera</button>
        </main>
      `;
    }

    root.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      const route = target.getAttribute('data-route');
      const cameraState = target.getAttribute('data-camera');
      if (route) state.activeRoute = route;
      if (cameraState) state.activeCamera = cameraState;
      if (route || cameraState) render();
    });

    render();
  }, evidence);
}

function renderSimulatorHtml(): string {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>SWR-086 Meta Glasses Simulator</title>
        <style>
          body {
            margin: 0;
            background: #111;
            color: #f5f5f5;
            font-family: system-ui, sans-serif;
          }
          main {
            max-width: 960px;
            margin: 0 auto;
            padding: 24px;
            display: grid;
            gap: 14px;
          }
          section {
            border: 1px solid #555;
            border-radius: 8px;
            padding: 12px;
            white-space: pre-wrap;
            background: #1d1f24;
          }
          button {
            min-height: 40px;
            border: 1px solid #888;
            border-radius: 6px;
            background: #f5f5f5;
            color: #111;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div id="root"></div>
      </body>
    </html>
  `;
}
