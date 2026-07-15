import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { buildAgentSupervisorExpandedIOEnvelopes } from '../../src/services/apps/agent-supervisor-expanded-io-envelopes';
import {
  buildAgentSupervisorExpandedIOHandoff,
  type AgentSupervisorExpandedIOHandoffCatalog,
} from '../../src/services/glasses/agent-supervisor-expanded-io-handoff';
import { buildAgentSupervisorExpandedIOMap } from '../../src/services/glasses/agent-supervisor-expanded-io-map';
import { buildVirtualDesktopOrbIdlCompleteCoverage } from '../../src/services/glasses/desktop-orb-idl-contract';
import {
  buildMetaGlassesDeviceSimulatorValidation,
  validateMetaGlassesDeviceSimulatorValidation,
  type MetaGlassesDeviceSimulatorValidationReport,
} from '../../src/services/glasses/meta-glasses-expanded-io-simulator-validation';

const GENERATED_AT = '2026-07-15T00:00:00.000Z';
const EVIDENCE_ROOT = path.join(process.cwd(), 'test-results', 'virtual-desktop-ipfs-mcp-orb');
const HANDOFF_PATH = path.join(EVIDENCE_ROOT, 'agent-supervisor-expanded-io-handoff.json');
const REPORT_PATH = path.join(EVIDENCE_ROOT, 'meta-glasses-device-simulator-validation.json');
const MODALITIES = [
  'display.output',
  'camera.photo_capture',
  'camera.video_capture',
  'microphone.input',
  'microphone.transcription',
  'speaker.output',
  'headphone.output',
] as const;

test.describe('SVD-072 expanded Meta glasses I/O simulator validation', () => {
  test('replays final SVD-071 packets through visible route, denial, fallback, and recovery states', async ({ page }) => {
    const handoff = buildFinalHandoff();
    const report = buildMetaGlassesDeviceSimulatorValidation(handoff, { generatedAt: GENERATED_AT });
    expect(validateMetaGlassesDeviceSimulatorValidation(report, handoff)).toEqual({ valid: true, errors: [] });

    await openSimulator(page, report);
    await expect(page.getByRole('heading', { name: 'Expanded Meta glasses I/O simulator' })).toBeVisible();
    await expect(page.getByTestId('boundary')).toContainText('hardware_free=true');
    await expect(page.getByTestId('boundary')).toContainText('physical_hardware_claimed=false');
    await expect(page.getByTestId('handoff')).toContainText('SVD-071');
    await expect(page.getByTestId('handoff')).toContainText(`packet_count=${handoff.packet_count}`);
    await expect(page.getByTestId('handoff')).toContainText('display_webapp_fallback_validated=true');
    await expect(page.getByTestId('operator-decision')).toContainText('raw_audio, raw_pixels, secret_values, inline_asset_bytes');

    for (const modality of MODALITIES) {
      await expect(page.getByTestId(`modality-${modality}`)).toContainText('replayed=');
      await page.getByTestId(`deny-${modality}`).click();
      await expect(page.getByTestId('active-replay')).toContainText(`${modality}: permission_denied`);
      await expect(page.getByTestId('active-replay')).toContainText('receipt_preserved=true');
      await expect(page.getByTestId('active-replay')).toContainText('rollback_preserved=true');
      await expect(page.getByTestId('active-replay')).toContainText('operator_fallback_visible=true');
      await page.getByTestId(`recover-${modality}`).click();
      await expect(page.getByTestId('active-replay')).toContainText(`${modality}: permission_recovered`);
      await expect(page.getByTestId('active-replay')).toContainText('raw_media_captured=false');
    }

    expect(Object.values(report.acceptance).every(Boolean)).toBe(true);
    fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
    fs.writeFileSync(HANDOFF_PATH, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    expect(JSON.parse(fs.readFileSync(HANDOFF_PATH, 'utf8'))).toEqual(handoff);
    expect(JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'))).toEqual(report);
  });
});

function buildFinalHandoff(): AgentSupervisorExpandedIOHandoffCatalog {
  const sourceGeneratedAt = '2026-07-14T00:00:00.000Z';
  const ioMap = buildAgentSupervisorExpandedIOMap(undefined, { generatedAt: sourceGeneratedAt });
  const envelopes = buildAgentSupervisorExpandedIOEnvelopes(ioMap, { generatedAt: sourceGeneratedAt, dryRun: true });
  return buildAgentSupervisorExpandedIOHandoff(
    ioMap,
    envelopes,
    buildVirtualDesktopOrbIdlCompleteCoverage().descriptors,
    { generatedAt: sourceGeneratedAt },
  );
}

async function openSimulator(page: Page, report: MetaGlassesDeviceSimulatorValidationReport): Promise<void> {
  await page.setContent('<!doctype html><html><body><main id="root"></main></body></html>');
  await page.evaluate((validationReport) => {
    const root = document.getElementById('root') as HTMLElement;
    const report = validationReport as MetaGlassesDeviceSimulatorValidationReport;
    const state = { active: '' };
    const examples = Object.fromEntries(Object.entries(report.modality_summary).map(([modality]) => [
      modality,
      report.replays.find(replay => replay.modality === modality),
    ]));

    function render(): void {
      root.innerHTML = `
        <h1>Expanded Meta glasses I/O simulator</h1>
        <p data-testid="boundary">hardware_free=${report.boundary.hardware_free}; physical_hardware_claimed=${report.boundary.physical_hardware_claimed}; physical_device_connected=${report.boundary.physical_device_connected}</p>
        <p data-testid="handoff">${report.source_handoff.task_id}; catalog_cid=${report.source_handoff.catalog_cid}; packet_count=${report.source_handoff.packet_count}; display_webapp_fallback_validated=${report.acceptance.display_webapp_fallback_validated}</p>
        <p data-testid="operator-decision">operator-visible fallback decisions are redacted; excluded: raw_audio, raw_pixels, secret_values, inline_asset_bytes</p>
        <section>${Object.entries(report.modality_summary).map(([modality, count]) => `
          <article data-testid="modality-${modality}">${modality} replayed=${count}
            <button data-testid="deny-${modality}" data-mode="deny" data-modality="${modality}">Deny</button>
            <button data-testid="recover-${modality}" data-mode="recover" data-modality="${modality}">Recover</button>
          </article>`).join('')}</section>
        <output data-testid="active-replay">${state.active}</output>`;
    }

    root.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      const modality = target.dataset.modality;
      const mode = target.dataset.mode;
      if (!modality || !mode) return;
      const replay = examples[modality];
      if (!replay) throw new Error(`No replay example for ${modality}`);
      state.active = mode === 'deny'
        ? `${modality}: permission_denied; fallback=${replay.operator_fallback.target_surface}; receipt_preserved=${replay.receipts.preserved_through_denial}; rollback_preserved=${replay.rollback.preserved}; operator_fallback_visible=${replay.operator_fallback.visible}`
        : `${modality}: permission_recovered; route=${replay.permission.recovery_route}; receipt_preserved=${replay.receipts.preserved_through_recovery}; raw_media_captured=${replay.raw_media_captured}`;
      render();
    });
    render();
  }, report);
}
