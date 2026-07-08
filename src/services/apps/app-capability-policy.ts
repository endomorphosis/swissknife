import {
  AppCapabilityGateway,
  type AppCapabilityDefinition,
} from './app-capability-gateway.js';
import {
  getIPFSAppCapabilityRegistry,
  type IPFSAppCapabilityRegistry,
} from './ipfs-app-capability-registry.js';
import type {
  AppCapabilityConfirmationPolicy,
  AppCapabilityPolicyClass,
  AppCapabilityReceiptPolicy,
} from './app-result-envelope.js';
import {
  VIRTUAL_DESKTOP_APP_MANIFEST,
  type VirtualDesktopAppManifest,
  type VirtualDesktopAppManifestEntry,
} from './virtual-desktop-app-manifest.js';

export const APP_CAPABILITY_POLICY_CATALOG_ID =
  'org.hallucinate.swissknife.app-capability-policy-catalog';

export const REQUIRED_APP_CAPABILITY_POLICY_CLASSES = [
  'read',
  'write',
  'destructive',
  'credential',
  'oauth',
  'external_network',
  'heavy_compute',
  'media_capture',
  'communication',
  'autonomous_action',
] as const satisfies readonly AppCapabilityPolicyClass[];

export type AppCapabilityFallbackScope =
  | 'desktop_or_mobile_only'
  | 'native_display'
  | 'display_webapp'
  | 'mobile_card'
  | 'notification'
  | 'audio_summary'
  | 'not_displayable';

export interface AppCapabilityPolicyRule {
  app_id: string;
  app_title: string;
  capability_id: string;
  service_family: string;
  descriptor_pack_id?: string;
  policy_class: AppCapabilityPolicyClass;
  confirmation_policy: AppCapabilityConfirmationPolicy;
  receipt_policy: AppCapabilityReceiptPolicy;
  side_effectful: boolean;
  sensitive: boolean;
  fallback_scope: AppCapabilityFallbackScope;
  fallback_strategy?: string;
  metadata_requirements: {
    policy_metadata_required: boolean;
    receipt_refs_required: boolean;
    event_dag_refs_required: boolean;
    confirmation_required: boolean;
  };
  source: 'manifest' | 'descriptor-registry';
  reasons: readonly string[];
}

export interface AppCapabilityPolicyCatalog {
  catalog_id: typeof APP_CAPABILITY_POLICY_CATALOG_ID;
  version: string;
  generated_from: readonly string[];
  app_count: number;
  rule_count: number;
  class_counts: Record<AppCapabilityPolicyClass, number>;
  rules: readonly AppCapabilityPolicyRule[];
}

export interface AppCapabilityPolicyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function getAppCapabilityPolicyCatalog(
  manifest: VirtualDesktopAppManifest = VIRTUAL_DESKTOP_APP_MANIFEST,
  registry: IPFSAppCapabilityRegistry = getIPFSAppCapabilityRegistry(manifest),
): AppCapabilityPolicyCatalog {
  const appById = new Map(manifest.apps.map(app => [app.id, app]));
  const registryKeys = new Set(registry.capabilities.map(capabilityKey));
  const gateway = new AppCapabilityGateway({
    manifest,
    capabilities: registry.capabilities,
  });
  const rules = gateway.listCapabilities()
    .sort((left, right) => capabilityKey(left).localeCompare(capabilityKey(right)))
    .map(capability => {
      const app = appById.get(capability.app_id);
      return policyRuleForCapability({
        app,
        capability,
        source: registryKeys.has(capabilityKey(capability)) ? 'descriptor-registry' : 'manifest',
      });
    });

  return {
    catalog_id: APP_CAPABILITY_POLICY_CATALOG_ID,
    version: manifest.version,
    generated_from: [
      manifest.manifest_id,
      registry.registry_id,
    ],
    app_count: manifest.apps.length,
    rule_count: rules.length,
    class_counts: countPolicyClasses(rules),
    rules,
  };
}

export function getAppCapabilityPolicyRule(
  appId: string,
  capabilityId: string,
  catalog: AppCapabilityPolicyCatalog = getAppCapabilityPolicyCatalog(),
): AppCapabilityPolicyRule | null {
  return catalog.rules.find(rule => rule.app_id === appId && rule.capability_id === capabilityId) ?? null;
}

export function validateAppCapabilityPolicyCatalog(
  catalog: AppCapabilityPolicyCatalog = getAppCapabilityPolicyCatalog(),
): AppCapabilityPolicyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const appIds = new Set<string>();

  for (const rule of catalog.rules) {
    const key = `${rule.app_id}::${rule.capability_id}`;
    if (seen.has(key)) errors.push(`Duplicate policy rule: ${key}`);
    seen.add(key);
    appIds.add(rule.app_id);

    if (!REQUIRED_APP_CAPABILITY_POLICY_CLASSES.includes(rule.policy_class)) {
      errors.push(`${key}: unsupported policy class ${rule.policy_class}`);
    }
    if (!rule.confirmation_policy) errors.push(`${key}: missing confirmation policy`);
    if (!rule.receipt_policy) errors.push(`${key}: missing receipt policy`);
    if (!rule.fallback_scope) errors.push(`${key}: missing fallback scope`);
    if (!rule.metadata_requirements.policy_metadata_required) {
      errors.push(`${key}: policy metadata must be required`);
    }

    if (rule.side_effectful) {
      if (rule.confirmation_policy === 'none') {
        errors.push(`${key}: side-effectful capability must require confirmation`);
      }
      if (rule.receipt_policy !== 'required_for_side_effects') {
        errors.push(`${key}: side-effectful capability must require side-effect receipts`);
      }
      if (!rule.metadata_requirements.receipt_refs_required) {
        errors.push(`${key}: side-effectful capability must require receipt refs`);
      }
      if (!rule.metadata_requirements.event_dag_refs_required) {
        errors.push(`${key}: side-effectful capability must require event DAG refs`);
      }
    }

    if (rule.sensitive) {
      if (rule.confirmation_policy !== 'desktop_or_mobile_only') {
        errors.push(`${key}: sensitive capability must be desktop/mobile gated`);
      }
      if (rule.fallback_scope !== 'desktop_or_mobile_only') {
        errors.push(`${key}: sensitive capability must default to desktop/mobile-only fallback`);
      }
    }
  }

  for (const policyClass of REQUIRED_APP_CAPABILITY_POLICY_CLASSES) {
    if ((catalog.class_counts[policyClass] ?? 0) === 0) {
      errors.push(`No capability classified as ${policyClass}`);
    }
  }

  if (appIds.size !== catalog.app_count) {
    warnings.push(`Policy catalog covers ${appIds.size}/${catalog.app_count} manifest apps`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function policyRuleForCapability(input: {
  app?: VirtualDesktopAppManifestEntry;
  capability: AppCapabilityDefinition;
  source: 'manifest' | 'descriptor-registry';
}): AppCapabilityPolicyRule {
  const policyClass = classifyCapability(input.capability, input.app);
  const sensitive = isSensitiveCapability(policyClass, input.capability, input.app);
  const sideEffectful = policyClass !== 'read';
  const confirmationPolicy = sensitive
    ? 'desktop_or_mobile_only'
    : confirmationPolicyForClass(policyClass);
  const receiptPolicy = receiptPolicyForClass(policyClass);
  const fallbackScope = sensitive
    ? 'desktop_or_mobile_only'
    : fallbackScopeForApp(input.app);

  return {
    app_id: input.capability.app_id,
    app_title: input.app?.title ?? input.capability.app_id,
    capability_id: input.capability.capability_id,
    service_family: String(input.capability.service_family),
    descriptor_pack_id: input.capability.descriptor_pack_id,
    policy_class: policyClass,
    confirmation_policy: confirmationPolicy,
    receipt_policy: receiptPolicy,
    side_effectful: sideEffectful,
    sensitive,
    fallback_scope: fallbackScope,
    fallback_strategy: input.capability.fallback_strategy,
    metadata_requirements: {
      policy_metadata_required: true,
      receipt_refs_required: sideEffectful,
      event_dag_refs_required: sideEffectful,
      confirmation_required: confirmationPolicy !== 'none',
    },
    source: input.source,
    reasons: classificationReasons(input.capability, policyClass, sensitive),
  };
}

function classifyCapability(
  capability: AppCapabilityDefinition,
  app?: VirtualDesktopAppManifestEntry,
): AppCapabilityPolicyClass {
  const id = capability.capability_id;
  const appId = app?.id ?? capability.app_id;

  if (id.includes('pin_rm') || id.includes('unpin') || id.includes('delete') || id.endsWith('.rm')) {
    return 'destructive';
  }
  if (id.includes('oauth') || appId === 'oauth-login') return 'oauth';
  if (id.includes('credentials') || id.includes('secure_storage') || id.includes('api-key') || appId === 'api-keys') {
    return 'credential';
  }
  if (id.startsWith('external.') || id.includes('swarm')) return 'external_network';
  if (id.includes('inference') || id.includes('jobs') || id.includes('vector') || id.includes('accelerate.operation.index')) {
    return 'heavy_compute';
  }
  if (id === 'local.media.image' || id === 'local.media.video' || id === 'local.audio') return 'media_capture';
  if (id.includes('pubsub') || id.includes('chat') || id.includes('contacts') || id.includes('notifications')) {
    return 'communication';
  }
  if (id.includes('scheduler') || id.includes('orb.dispatch') || id.includes('orb.auto_ui') || id.includes('mcp.gateway')) {
    return 'autonomous_action';
  }
  if (capability.policy_class === 'credential' && id.includes('oauth')) return 'oauth';
  return capability.policy_class;
}

function isSensitiveCapability(
  policyClass: AppCapabilityPolicyClass,
  capability: AppCapabilityDefinition,
  app?: VirtualDesktopAppManifestEntry,
): boolean {
  return policyClass === 'credential'
    || policyClass === 'oauth'
    || policyClass === 'media_capture'
    || app?.id === 'api-keys'
    || app?.id === 'oauth-login'
    || capability.capability_id.includes('secure_storage');
}

function confirmationPolicyForClass(policyClass: AppCapabilityPolicyClass): AppCapabilityConfirmationPolicy {
  if (policyClass === 'destructive') return 'confirm_destructive';
  if (
    policyClass === 'write'
    || policyClass === 'external_network'
    || policyClass === 'heavy_compute'
    || policyClass === 'communication'
    || policyClass === 'autonomous_action'
  ) {
    return 'confirm';
  }
  return 'none';
}

function receiptPolicyForClass(policyClass: AppCapabilityPolicyClass): AppCapabilityReceiptPolicy {
  return policyClass === 'read' ? 'optional' : 'required_for_side_effects';
}

function fallbackScopeForApp(app?: VirtualDesktopAppManifestEntry): AppCapabilityFallbackScope {
  const handoff = app?.glasses_strategy.handoff;
  if (handoff === 'native-display') return 'native_display';
  if (handoff === 'display-webapp') return 'display_webapp';
  if (handoff === 'mobile-card') return 'mobile_card';
  if (handoff === 'notification') return 'notification';
  if (handoff === 'audio-summary') return 'audio_summary';
  return 'not_displayable';
}

function classificationReasons(
  capability: AppCapabilityDefinition,
  policyClass: AppCapabilityPolicyClass,
  sensitive: boolean,
): readonly string[] {
  return [
    `classified:${policyClass}`,
    `service:${capability.service_family}`,
    ...(sensitive ? ['sensitive:desktop_or_mobile_only'] : []),
  ];
}

function countPolicyClasses(
  rules: readonly AppCapabilityPolicyRule[],
): Record<AppCapabilityPolicyClass, number> {
  const counts = Object.fromEntries(
    REQUIRED_APP_CAPABILITY_POLICY_CLASSES.map(policyClass => [policyClass, 0]),
  ) as Record<AppCapabilityPolicyClass, number>;
  for (const rule of rules) counts[rule.policy_class] += 1;
  return counts;
}

function capabilityKey(capability: Pick<AppCapabilityDefinition, 'app_id' | 'capability_id'>): string {
  return `${capability.app_id}::${capability.capability_id}`;
}
