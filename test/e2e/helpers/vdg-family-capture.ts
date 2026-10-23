/** Real desktop capture plus independent /mcp/tools/call response metadata.
 * Payload bodies and credentials are deliberately not persisted here.
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { Page, Response } from '@playwright/test';
import { runLiveClickTarget } from './live-click-session';

const require = createRequire(import.meta.url);
const { captureInputFingerprint } = require('../../../scripts/vdg-capture-fingerprint.cjs');
const { FAMILIES } = require('../../../scripts/vdg-evidence.cjs');
const { assessOwnerResult } = require('../../../scripts/vdg-connector-artifacts.cjs');
const { writeAtomicJson } = require('../../../scripts/vdg-atomic-json.cjs');
const { openCaptureCheckpoint } = require('../../../scripts/vdg-capture-checkpoint.cjs');

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidenceRoot = path.join(projectRoot, 'test-results/virtual-desktop-ipfs-mcp-orb');

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {};
}

export async function runVdgFamilyCapture(page: Page, target: string): Promise<void> {
  const observations: Record<string, unknown>[] = [];
  const pending = new Set<Promise<void>>();
  const context = page.context();
  const transport = process.env.VDG_CAPTURE_TRANSPORT;
  if (transport && !['http', 'libp2p'].includes(transport)) throw new Error(`invalid VDG_CAPTURE_TRANSPORT ${transport}`);
  const captureFamily = `vdg-${target}`;
  const inputFingerprint = captureInputFingerprint(captureFamily, transport || 'preferred', { evidenceRoot, definition: FAMILIES[captureFamily] });
  const checkpoint = transport ? openCaptureCheckpoint({ directory: path.join(evidenceRoot, 'vdg/checkpoints'), target, transport,
    inputFingerprint, fresh: process.env.VDG_CAPTURE_FORCE_FRESH === '1' }) : null;
  if (checkpoint) observations.push(...checkpoint.snapshot.observations);
  const listener = (response: Response): void => {
    const request = response.request();
    if (request.method() !== 'POST' || new URL(response.url()).pathname !== '/mcp/tools/call') return;
    const capture = (async () => {
      let call: Record<string, any>;
      let body: Record<string, any>;
      try {
        call = record(request.postDataJSON());
        body = record(await response.json());
      } catch { return; }
      const result = record(body.result);
      const nested = record(body.response);
      const receipt = record(body.receipt || result.receipt || nested.receipt);
      const policy = record(record(call.input).policy);
      const outcome = body.outcome || result.outcome || receipt.outcome || '';
      const ownerAssessment = assessOwnerResult(body.result || body.response || body, {
        outcome, tool_id: call.tool_id || '', transport: call.transport || '',
        correlation_id: call.correlation_id || '', policy_outcome: policy.outcome || '', dry_run: policy.dry_run === true,
      });
      observations.push({
        method: request.method(),
        route: new URL(response.url()).pathname,
        app_id: call.app_id || '',
        binding_id: call.binding_id || '',
        owner: call.owner || '',
        tool_id: call.tool_id || '',
        transport: call.transport || '',
        correlation_id: call.correlation_id || '',
        policy_outcome: policy.outcome || '',
        dry_run: policy.dry_run === true,
        status: response.status(),
        outcome,
        owner_result_verified: ownerAssessment.verified === true,
        owner_result_verification_reason: ownerAssessment.reason,
        receipt_id: receipt.receipt_id || '',
        event_dag_cid: Array.isArray(receipt.event_dag_refs) ? receipt.event_dag_refs[0] || '' : '',
        source: 'playwright-connector-response',
      });
    })();
    pending.add(capture);
    void capture.finally(() => pending.delete(capture));
  };
  context.on('response', listener);
  // This runtime supports declared transport selection without modifying a
  // request after the owning application has originated it.
  await context.addInitScript(({ selected }) => {
    (globalThis as any).__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ = true;
    if (selected) (globalThis as any).__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__ = selected;
  }, { selected: transport || '' });
  try {
    const runId = `${target}-${transport || 'preferred'}-${Date.now()}`;
    const report = await runLiveClickTarget(page, target, { outputRoot: path.join(evidenceRoot, 'vdg/live-clicks', runId), preferMatrix: true,
      resumeRows: checkpoint?.snapshot.rows, resumePageerrors: checkpoint?.snapshot.pageerrors,
      onCheckpoint: async (rows, pageerrors) => {
        await Promise.allSettled([...pending]);
        checkpoint?.save({ rows, pageerrors, observations });
      },
    });
    await Promise.allSettled([...pending]);
    const connectorRoot = path.join(evidenceRoot, 'vdg/connectors');
    const runRoot = path.join(evidenceRoot, 'vdg/runs');
    fs.mkdirSync(connectorRoot, { recursive: true });
    fs.mkdirSync(runRoot, { recursive: true });
    const relativeReport = `vdg/runs/${runId}.json`;
    const reportBytes = `${JSON.stringify(report, null, 2)}\n`;
    fs.writeFileSync(path.join(evidenceRoot, relativeReport), reportBytes);
    const output = path.join(connectorRoot, `${target}.json`);
    let previous: { observations?: Record<string, unknown>[]; runs?: unknown[] } = {};
    if (fs.existsSync(output)) previous = JSON.parse(fs.readFileSync(output, 'utf8'));
    const indexed = new Map([...previous.observations || [], ...observations].map(item => [JSON.stringify(item), item]));
    writeAtomicJson(output, {
      schema: 'swissknife.virtual-desktop-gui-mcp-connectors.v1',
      generated_at: new Date().toISOString(),
      target,
      observations: [...indexed.values()],
      runs: [...previous.runs || [], {
        run_id: runId, report_path: relativeReport, transport: transport || 'preferred',
        report_sha256: createHash('sha256').update(reportBytes).digest('hex'),
        input_fingerprint: inputFingerprint,
        capture_complete: report.rows.length > 0 && !report.rows.some(row => row.failure_reasons.includes('runner-failed')),
        completed_at: new Date().toISOString(),
      }],
      completion_authority: false,
    });
  } finally {
    context.off('response', listener);
  }
}
