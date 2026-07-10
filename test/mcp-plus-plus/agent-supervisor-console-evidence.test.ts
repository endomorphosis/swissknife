/**
 * @vitest-environment node
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const e2ePath = join(evidenceRoot, 'agent-supervisor-console-e2e.json');
const receiptPath = join(evidenceRoot, 'agent-supervisor-console-receipts.json');
const docPath = join(process.cwd(), 'docs/agent-supervisor-console-evidence.md');

const requiredServices = ['ipfs_accelerate_py', 'ipfs_kit_py', 'ipfs_datasets_py'];
const requiredPaths = [
  'success',
  'receipt_resolve',
  'index_search',
  'server_unavailable',
  'denied',
  'stale_state',
  'transport_fallback',
];

describe('SWR-107 Agent Supervisor Console three-server evidence', () => {
  it('covers all server families, visible path states, and correlated receipts', () => {
    expect(existsSync(e2ePath)).toBe(true);
    expect(existsSync(receiptPath)).toBe(true);
    expect(existsSync(docPath)).toBe(true);

    const e2e = readJson<any>(e2ePath);
    const receipts = readJson<any>(receiptPath);
    const doc = readFileSync(docPath, 'utf8');

    expect(e2e).toMatchObject({
      schema: 'swissknife.agent_supervisor_console_e2e.v1',
      task_id: 'SWR-107',
      decision: 'go',
      console_app: {
        app_id: 'agent-supervisor',
        contract_schema: 'swissknife.agent_supervisor_console.v1',
        browser_safe: true,
        destructive_supervisor_action_required: false,
      },
    });
    expect(e2e.validation_commands).toEqual(expect.arrayContaining([
      'node scripts/capture-mcp-live-probe-evidence.cjs',
      'npm run test:e2e:mcp',
      'npm run evidence:mcp-glasses',
    ]));
    expect(e2e.expected_outputs).toEqual(expect.arrayContaining([
      'test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-console-e2e.json',
      'test-results/virtual-desktop-ipfs-mcp-orb/agent-supervisor-console-receipts.json',
      'docs/agent-supervisor-console-evidence.md',
    ]));
    expect(e2e.blockers).toEqual([]);

    for (const service of requiredServices) {
      const row = e2e.service_families.find((entry: any) => entry.service === service);
      expect(row, service).toBeTruthy();
      expect(row.available).toBe(true);
      expect(row.flat_tool_count).toBeGreaterThan(0);
    }

    expect(e2e.service_families.find((entry: any) => entry.service === 'ipfs_accelerate_py')).toMatchObject({
      role: 'state_authority',
      required: true,
    });
    expect(e2e.service_families.find((entry: any) => entry.service === 'ipfs_kit_py')).toMatchObject({
      role: 'receipt_authority',
      required: true,
    });
    expect(e2e.service_families.find((entry: any) => entry.service === 'ipfs_datasets_py')).toMatchObject({
      role: 'search_authority',
      required: true,
    });

    expect(e2e.required_paths.map((entry: any) => entry.path).sort()).toEqual(requiredPaths.sort());
    for (const pathId of requiredPaths) {
      const pathRow = e2e.required_paths.find((entry: any) => entry.path === pathId);
      expect(pathRow, pathId).toBeTruthy();
      expect(pathRow.observed).toBe(true);
      expect(pathRow.correlation_id).toMatch(/^swr-107-/);
      expect(pathRow.visible_selectors.length).toBeGreaterThan(0);
    }

    const scenariosByPath = new Map(e2e.scenarios.map((entry: any) => [entry.required_path, entry]));
    expect(scenariosByPath.get('success')).toMatchObject({
      source_owner: 'ipfs_accelerate_py',
      state: 'available',
      destructive_action: false,
    });
    expect(scenariosByPath.get('receipt_resolve')).toMatchObject({
      source_owner: 'ipfs_kit_py',
      state: 'available',
      receipt_operation: { mode: 'resolve' },
    });
    expect(scenariosByPath.get('index_search')).toMatchObject({
      source_owner: 'ipfs_datasets_py',
      indexed_record: {
        goal_id: 'SWR-107',
        task_id: 'SWR-107-verify-console',
        run_id: 'run-swr-107-live-probe',
      },
    });
    expect(scenariosByPath.get('server_unavailable')).toMatchObject({
      state: 'unavailable',
      reason: 'server_unavailable',
    });
    expect(scenariosByPath.get('denied')).toMatchObject({
      state: 'denied',
      reason: 'policy_denied',
      destructive_action: false,
    });
    expect(scenariosByPath.get('stale_state')).toMatchObject({
      state: 'unavailable',
      reason: 'index_stale',
      source_owner: 'ipfs_datasets_py',
    });
    expect(scenariosByPath.get('transport_fallback')).toMatchObject({
      state: 'available',
      source_owner: 'ipfs_accelerate_py',
    });
    expect(scenariosByPath.get('transport_fallback').transport_fallback.selected).toMatch(/^(mcp|libp2p)$/);

    expect(receipts).toMatchObject({
      schema: 'swissknife.agent_supervisor_console_receipts.v1',
      task_id: 'SWR-107',
      required_receipt_owner: 'ipfs_kit_py',
    });
    expect(receipts.receipt_count).toBe(e2e.scenarios.length);
    expect(receipts.receipts.map((entry: any) => entry.required_path).sort()).toEqual(requiredPaths.sort());

    const receiptByCorrelation = new Map(receipts.receipts.map((entry: any) => [entry.correlation_id, entry]));
    for (const scenario of e2e.scenarios) {
      const receipt = receiptByCorrelation.get(scenario.correlation_id) as any;
      expect(receipt, scenario.scenario_id).toBeTruthy();
      expect(receipt.receipt_owner).toBe('ipfs_kit_py');
      expect(receipt.receipt_cid).toMatch(/^sha256:[0-9a-f]+$/);
      expect(receipt.destructive_action).toBe(false);
      expect(receipt.visible_selectors).toEqual(scenario.visible_selectors);
    }

    expect(doc).toContain('SWR-107');
    expect(doc).toContain('server_unavailable');
    expect(doc).toContain('index_stale');
    expect(doc).toContain('transport_fallback');
    expect(doc).toContain('ipfs_accelerate_py');
    expect(doc).toContain('ipfs_kit_py');
    expect(doc).toContain('ipfs_datasets_py');
  });
});

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}
