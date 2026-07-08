/**
 * @vitest-environment node
 */

import { dirname, join } from 'path';
import {
  ALL_TOOLS_OWNER_MODULES,
  ALL_TOOLS_POLICY_CLASSES,
  buildAllToolsPolicyMatrix,
  validateAllToolsPolicyMatrix,
  type AllToolsLedger,
  type AllToolsPolicyMatrix,
} from '../../src/services/apps/all-tools-policy-classifier';

const evidenceRoot = join(process.cwd(), 'test-results/virtual-desktop-ipfs-mcp-orb');
const ledgerPath = join(evidenceRoot, 'all-tools-ledger.json');
const matrixPath = join(evidenceRoot, 'all-tools-policy-matrix.json');
const actualFs = jest.requireActual<typeof import('fs')>('fs');

let ledger: AllToolsLedger;
let matrix: AllToolsPolicyMatrix;

describe('all MCP/MCP++ tools policy classifier', () => {
  beforeAll(() => {
    ledger = JSON.parse(actualFs.readFileSync(ledgerPath, 'utf8')) as AllToolsLedger;
    matrix = buildAllToolsPolicyMatrix(ledger, {
      generatedAt: '2026-07-08T00:00:00.000Z',
    });
    actualFs.mkdirSync(dirname(matrixPath), { recursive: true });
    actualFs.writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`);
  });

  it('classifies every ledger tool exactly once and writes the policy matrix artifact', () => {
    expect(matrix.tool_count).toBe(ledger.tools.length);
    expect(matrix.rules).toHaveLength(ledger.tools.length);
    expect(new Set(matrix.rules.map(rule => rule.tool_id)).size).toBe(ledger.tools.length);
    expect(actualFs.existsSync(matrixPath)).toBe(true);
  });

  it('validates required owner, policy, confirmation, receipt, fallback, and exposure fields', () => {
    const result = validateAllToolsPolicyMatrix(matrix);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    for (const rule of matrix.rules) {
      expect(ALL_TOOLS_POLICY_CLASSES).toContain(rule.policy_class);
      expect(ALL_TOOLS_OWNER_MODULES).toContain(rule.owner_module);
      expect(rule.confirmation_policy).toBeTruthy();
      expect(rule.receipt_policy).toBeTruthy();
      expect(rule.fallback_rule).toBeTruthy();
      expect(rule.exposure_disposition).toBeTruthy();
      expect(rule.glasses_exposure).toBeTruthy();
      expect(rule.reasons.length).toBeGreaterThan(0);
    }
  });

  it('gates side-effectful and sensitive tools away from direct glasses exposure', () => {
    const highRisk = matrix.rules.filter(rule => rule.high_risk);

    expect(highRisk.length).toBeGreaterThan(0);
    for (const rule of highRisk) {
      expect(rule.glasses_exposure).not.toBe('native_display_allowed');
      expect(rule.confirmation_policy).not.toBe('none');
      expect(rule.receipt_policy).toBe('required_for_side_effects');
    }

    for (const rule of matrix.rules.filter(rule => rule.sensitive)) {
      expect(rule.confirmation_policy).toBe('desktop_or_mobile_only');
      expect(rule.fallback_rule).toBe('desktop_or_mobile_only');
      expect(rule.glasses_exposure).toBe('desktop_or_mobile_only');
    }
  });

  it('classifies representative tools into stable policy classes', () => {
    expect(rule('ipfs_kit_py:IPFS.ipfs_cat').policy_class).toBe('read');
    expect(rule('ipfs_kit_py:Files.files_rm').policy_class).toBe('destructive');
    expect(rule('ipfs_datasets_py:dataset_tools.save_dataset').policy_class).toBe('write');
    expect(rule('ipfs_datasets_py:bespoke_tools.create_vector_store').policy_class).toBe('heavy_compute');
    expect(rule('ipfs_datasets_py:wallet_tools.wallet_create').policy_class).toBe('credential');
    expect(rule('ipfs_datasets_py:media_tools.ffmpeg_convert').policy_class).toBe('media_capture');
    expect(rule('ipfs_datasets_py:discord_tools.discord_export').policy_class).toBe('communication');
    expect(rule('ipfs_datasets_py:web_archive_tools.brave_search').policy_class).toBe('external_network');
    expect(rule('ipfs_accelerate_py:tools_dispatch').policy_class).toBe('autonomous_action');
  });

  it('assigns exactly one owner module to representative service families and risk surfaces', () => {
    expect(rule('ipfs_kit_py:IPFS.ipfs_cat').owner_module).toBe('ipfs');
    expect(rule('ipfs_accelerate_py:hardware_recommend').owner_module).toBe('platform');
    expect(rule('ipfs_datasets_py:policy_evaluate').owner_module).toBe('mcp');
    expect(rule('ipfs_datasets_py:logic_tools.temporal_deontic_logic_tools').owner_module).toBe('logic.deontic');
    expect(rule('ipfs_datasets_py:discord_tools.discord_export').owner_module).toBe('integrations');
  });

  it('keeps autonomous dispatcher tools supervisor-only', () => {
    for (const dispatcher of [
      rule('ipfs_kit_py:tools_dispatch'),
      rule('ipfs_datasets_py:tools_dispatch'),
      rule('ipfs_accelerate_py:tools_dispatch'),
    ]) {
      expect(dispatcher.policy_class).toBe('autonomous_action');
      expect(dispatcher.exposure_disposition).toBe('supervisor_only');
      expect(dispatcher.glasses_exposure).toBe('desktop_or_mobile_only');
    }
  });
});

function rule(toolId: string) {
  const found = matrix.rules.find(candidate => candidate.tool_id === toolId);
  if (!found) throw new Error(`Missing policy rule ${toolId}`);
  return found;
}
