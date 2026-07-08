import {
  getAppCapabilityPolicyCatalog,
  getAppCapabilityPolicyRule,
  REQUIRED_APP_CAPABILITY_POLICY_CLASSES,
  validateAppCapabilityPolicyCatalog,
} from '../../src/services/apps/app-capability-policy';
import { getIPFSAppCapabilityRegistry } from '../../src/services/apps/ipfs-app-capability-registry';
import { VIRTUAL_DESKTOP_APP_MANIFEST } from '../../src/services/apps/virtual-desktop-app-manifest';

describe('app capability policy catalog', () => {
  const registry = getIPFSAppCapabilityRegistry();
  const catalog = getAppCapabilityPolicyCatalog(VIRTUAL_DESKTOP_APP_MANIFEST, registry);

  it('covers every manifest capability and descriptor-derived operation capability', () => {
    const expectedKeys = new Set<string>();
    for (const app of VIRTUAL_DESKTOP_APP_MANIFEST.apps) {
      for (const capability of app.capabilities) {
        expectedKeys.add(`${app.id}::${capability}`);
      }
    }
    for (const capability of registry.capabilities) {
      expectedKeys.add(`${capability.app_id}::${capability.capability_id}`);
    }

    expect(catalog.app_count).toBe(VIRTUAL_DESKTOP_APP_MANIFEST.apps.length);
    expect(catalog.rule_count).toBe(expectedKeys.size);
    expect(new Set(catalog.rules.map(rule => `${rule.app_id}::${rule.capability_id}`))).toEqual(expectedKeys);
  });

  it('validates policy metadata, side-effect receipt rules, and class coverage', () => {
    const result = validateAppCapabilityPolicyCatalog(catalog);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    for (const policyClass of REQUIRED_APP_CAPABILITY_POLICY_CLASSES) {
      expect(catalog.class_counts[policyClass]).toBeGreaterThan(0);
    }
  });

  it('classifies representative app capabilities into each required security class', () => {
    expect(rule('settings', 'local.settings').policy_class).toBe('read');
    expect(rule('file-manager', 'ipfs.kit.storage').policy_class).toBe('write');
    expect(rule('terminal', 'ipfs.kit.tool.pin_rm').policy_class).toBe('destructive');
    expect(rule('api-keys', 'policy.credentials').policy_class).toBe('credential');
    expect(rule('oauth-login', 'external.oauth').policy_class).toBe('oauth');
    expect(rule('huggingface', 'external.huggingface').policy_class).toBe('external_network');
    expect(rule('ai-chat', 'ipfs.accelerate.inference').policy_class).toBe('heavy_compute');
    expect(rule('image-viewer', 'local.media.image').policy_class).toBe('media_capture');
    expect(rule('p2p-chat', 'ipfs.kit.pubsub').policy_class).toBe('communication');
    expect(rule('cron', 'local.scheduler').policy_class).toBe('autonomous_action');
  });

  it('requires confirmation, receipts, and event DAG refs for side-effectful capabilities', () => {
    const sideEffectful = catalog.rules.filter(rule => rule.side_effectful);

    expect(sideEffectful.length).toBeGreaterThan(0);
    for (const rule of sideEffectful) {
      expect(rule.confirmation_policy).not.toBe('none');
      expect(rule.receipt_policy).toBe('required_for_side_effects');
      expect(rule.metadata_requirements.policy_metadata_required).toBe(true);
      expect(rule.metadata_requirements.receipt_refs_required).toBe(true);
      expect(rule.metadata_requirements.event_dag_refs_required).toBe(true);
    }
  });

  it('gates sensitive capabilities to desktop/mobile-only fallback paths', () => {
    for (const sensitive of [
      rule('api-keys', 'policy.credentials'),
      rule('oauth-login', 'external.oauth'),
      rule('image-viewer', 'local.media.image'),
    ]) {
      expect(sensitive.sensitive).toBe(true);
      expect(sensitive.confirmation_policy).toBe('desktop_or_mobile_only');
      expect(sensitive.fallback_scope).toBe('desktop_or_mobile_only');
      expect(sensitive.reasons).toContain('sensitive:desktop_or_mobile_only');
    }
  });

  function rule(appId: string, capabilityId: string) {
    const found = getAppCapabilityPolicyRule(appId, capabilityId, catalog);
    if (!found) throw new Error(`Missing rule ${appId}::${capabilityId}`);
    return found;
  }
});
