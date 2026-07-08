<<<<<<< HEAD
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
=======
import {
  buildAppRuntimeClassificationSummary,
  classifyAppRuntimeClassFromPolicyRule,
  validateAppRuntimeClassificationExposure,
  type AllToolsPolicyMatrix,
  type AllToolsPolicyRule,
} from '../../src/services/apps/all-tools-policy-classifier';
import { APP_RUNTIME_CLASSES } from '../../src/services/apps/app-manifest';

function policyRule(overrides: Partial<AllToolsPolicyRule> = {}): AllToolsPolicyRule {
  return {
    tool_id: 'tool.example',
    service_id: 'example-service',
    name: 'Example Tool',
    category: 'utilities',
    owner_module: 'service-apps',
    policy_class: 'low_risk',
    confirmation_policy: 'none',
    receipt_policy: 'none',
    fallback_rule: 'none',
    exposure_disposition: 'allow',
    glasses_exposure: 'visible',
    side_effectful: false,
    sensitive: false,
    high_risk: false,
    app_visible: true,
    ...overrides,
  };
}

function policyMatrix(rules: AllToolsPolicyRule[]): AllToolsPolicyMatrix {
  return {
    matrix_id: 'test-policy-matrix',
    schema: 'swissknife.all-mcp-tools-policy-matrix.v1',
    tool_count: rules.length,
    rules,
  };
}

describe('SWR-023 app runtime classification from the all-tools policy classifier', () => {
  it('classifies an ordinary low-risk rule as browser-safe regardless of app_visible', () => {
    expect(classifyAppRuntimeClassFromPolicyRule(policyRule({ app_visible: true }))).toBe('browser-safe');
    expect(classifyAppRuntimeClassFromPolicyRule(policyRule({ app_visible: false }))).toBe('browser-safe');
  });

  it('classifies a rule bound to a host-only-flavored capability as host-only, independent of app_visible', () => {
    expect(classifyAppRuntimeClassFromPolicyRule(policyRule({ category: 'hardware', app_visible: true }))).toBe('host-only');
    expect(classifyAppRuntimeClassFromPolicyRule(policyRule({ category: 'filesystem', app_visible: false }))).toBe('host-only');
    expect(classifyAppRuntimeClassFromPolicyRule(policyRule({ policy_class: 'subprocess_exec' }))).toBe('host-only');
  });

  it('classifies high-risk/sensitive/side-effectful rules as host-only even without a category keyword match', () => {
    const rule = policyRule({
      high_risk: true,
      sensitive: true,
      side_effectful: true,
      category: 'workflow',
      policy_class: 'high_risk',
    });
    expect(classifyAppRuntimeClassFromPolicyRule(rule)).toBe('host-only');
  });

  it('does not classify a rule as host-only unless all three of high_risk/sensitive/side_effectful hold', () => {
    expect(classifyAppRuntimeClassFromPolicyRule(policyRule({ high_risk: true }))).toBe('browser-safe');
    expect(classifyAppRuntimeClassFromPolicyRule(policyRule({ high_risk: true, sensitive: true }))).toBe('browser-safe');
  });

  it('summarizes runtime-class distribution across a policy matrix, split by app_visible', () => {
    const matrix = policyMatrix([
      policyRule({ tool_id: 'tool.a', app_visible: true }),
      policyRule({ tool_id: 'tool.b', app_visible: false, category: 'device' }),
      policyRule({ tool_id: 'tool.c', app_visible: false, category: 'subprocess' }),
      policyRule({
        tool_id: 'tool.d',
        app_visible: false,
        high_risk: true,
        sensitive: true,
        side_effectful: true,
      }),
    ]);

    const summary = buildAppRuntimeClassificationSummary(matrix);

    expect(summary.tool_count).toBe(4);
    expect(summary.class_counts).toEqual({
      'browser-safe': 1,
      hybrid: 0,
      'remote-capability': 0,
      'host-only': 3,
    });
    expect(summary.app_visible_class_counts).toEqual({
      'browser-safe': 1,
      hybrid: 0,
      'remote-capability': 0,
      'host-only': 0,
    });
    expect(summary.rows).toHaveLength(4);
    expect(summary.rows.map(row => row.runtime_class)).toEqual([
      'browser-safe', 'host-only', 'host-only', 'host-only',
    ]);
    for (const row of summary.rows) {
      expect(APP_RUNTIME_CLASSES).toContain(row.runtime_class);
    }
  });

  it('passes exposure validation when no host-only-classified rule is app_visible', () => {
    const matrix = policyMatrix([
      policyRule({ tool_id: 'tool.a', app_visible: true }),
      policyRule({ tool_id: 'tool.b', app_visible: false, category: 'subprocess' }),
    ]);
    expect(validateAppRuntimeClassificationExposure(matrix)).toEqual({ valid: true, errors: [] });
  });

  it('fails exposure validation when a host-only-classified rule is (incorrectly) marked app_visible', () => {
    const matrix = policyMatrix([
      policyRule({ tool_id: 'tool.leaked-hardware', app_visible: true, category: 'hardware' }),
      policyRule({
        tool_id: 'tool.leaked-high-risk',
        app_visible: true,
        high_risk: true,
        sensitive: true,
        side_effectful: true,
      }),
      policyRule({ tool_id: 'tool.fine', app_visible: true }),
    ]);

    const result = validateAppRuntimeClassificationExposure(matrix);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.join('\n')).toMatch(/tool\.leaked-hardware/);
    expect(result.errors.join('\n')).toMatch(/tool\.leaked-high-risk/);
    expect(result.errors.join('\n')).not.toMatch(/tool\.fine/);
    for (const error of result.errors) {
      expect(error).toMatch(/host-only/);
    }
  });
});
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
