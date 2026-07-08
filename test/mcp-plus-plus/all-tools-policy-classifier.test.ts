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
