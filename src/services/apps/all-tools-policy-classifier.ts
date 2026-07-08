<<<<<<< HEAD
import type {
  AppCapabilityConfirmationPolicy,
  AppCapabilityPolicyClass,
  AppCapabilityReceiptPolicy,
} from './app-result-envelope.js';
import type {
  AppCapabilityFallbackScope,
} from './app-capability-policy.js';

export const ALL_TOOLS_POLICY_MATRIX_ID =
  'org.hallucinate.swissknife.all-mcp-tools-policy-matrix';

export const ALL_TOOLS_POLICY_CLASSES = [
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

export const ALL_TOOLS_OWNER_MODULES = [
  'apps',
  'mcp',
  'glasses',
  'ipfs',
  'platform',
  'integrations',
  'logic.shared',
  'logic.api',
  'logic.nl',
  'logic.fol',
  'logic.tdfol',
  'logic.cec',
  'logic.dcec',
  'logic.deontic',
  'logic.modal',
  'logic.bridges',
  'provers',
  'zkp',
  'proof-engine',
] as const;

export type AllToolsOwnerModule = typeof ALL_TOOLS_OWNER_MODULES[number];

export type AllToolsExposureDisposition =
  | 'app_visible'
  | 'app_visible_with_confirmation'
  | 'desktop_or_mobile_only'
  | 'supervisor_only';

export type AllToolsGlassesExposure =
  | 'native_display_allowed'
  | 'display_webapp_after_confirmation'
  | 'mobile_card_after_confirmation'
  | 'desktop_or_mobile_only'
  | 'not_displayable';
=======
import type { AppRuntimeClass } from './app-manifest.js';
import { textReferencesHostOnlyCapability } from './app-manifest.js';

export interface AllToolsSchemaSummary {
  input_properties?: readonly string[];
  input_required?: readonly string[];
  output_properties?: readonly string[];
  output_required?: readonly string[];
}
>>>>>>> 1569811 (chore: add pending swissknife staged changes)

export interface AllToolsLedgerTool {
  tool_id: string;
  service_id: string;
  name: string;
  unqualified_name?: string;
<<<<<<< HEAD
  category?: string;
=======
  normalized_unqualified_name?: string;
  category: string;
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
  namespace?: string;
  operation?: string;
  surface?: string;
  tool_module?: string;
  description?: string;
  read_only?: boolean;
<<<<<<< HEAD
  stream_kind?: string;
  tags?: readonly string[];
  coverage_status?: string;
  alias_of?: string | null;
  aliases?: readonly { tool_id: string; name: string; reason?: string }[];
  discovery?: {
    live?: boolean;
    static?: boolean;
  };
  source_kinds?: readonly string[];
  sources?: readonly string[];
  schema_hashes?: {
    input?: readonly string[];
    output?: readonly string[];
    raw_payload?: readonly string[];
  };
  schemas?: {
    input?: Record<string, unknown> | null;
    output?: Record<string, unknown> | null;
  };
  schema_summary?: {
    input_properties?: readonly string[];
    input_required?: readonly string[];
    output_properties?: readonly string[];
    output_required?: readonly string[];
  };
=======
  tags?: readonly string[];
  schemas?: {
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
  };
  schema_summary?: AllToolsSchemaSummary;
  policy_classification?: {
    status?: string;
    initial_policy_hint?: string;
    reason?: string;
  };
  coverage_status?: string;
  alias_of?: string | null;
  aliases?: readonly string[];
  [key: string]: unknown;
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
}

export interface AllToolsLedger {
  schema?: string;
  generated_at?: string;
<<<<<<< HEAD
=======
  timeout_ms?: number;
  services?: readonly string[];
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
  summary?: {
    exact_tool_record_count?: number;
    live_exact_tool_count?: number;
    static_exact_tool_count?: number;
<<<<<<< HEAD
  };
  tools: readonly AllToolsLedgerTool[];
=======
    [key: string]: unknown;
  };
  category_counts?: Record<string, number>;
  source_counts?: Record<string, number>;
  tools: readonly AllToolsLedgerTool[];
  [key: string]: unknown;
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
}

export interface AllToolsPolicyRule {
  tool_id: string;
  service_id: string;
  name: string;
  category: string;
<<<<<<< HEAD
  coverage_status: string;
  owner_module: AllToolsOwnerModule;
  owner_reason: string;
  policy_class: AppCapabilityPolicyClass;
  confirmation_policy: AppCapabilityConfirmationPolicy;
  receipt_policy: AppCapabilityReceiptPolicy;
  fallback_rule: AppCapabilityFallbackScope;
  exposure_disposition: AllToolsExposureDisposition;
  glasses_exposure: AllToolsGlassesExposure;
=======
  owner_module: string;
  owner_reason?: string;
  policy_class: string;
  confirmation_policy: string;
  receipt_policy: string;
  fallback_rule: string;
  exposure_disposition: string;
  glasses_exposure: string;
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
  side_effectful: boolean;
  sensitive: boolean;
  high_risk: boolean;
  app_visible: boolean;
<<<<<<< HEAD
  live_discovered: boolean;
  static_described: boolean;
  alias_of?: string | null;
  aliases: readonly string[];
  schema_hashes: {
    input: readonly string[];
    output: readonly string[];
  };
  reasons: readonly string[];
}

export interface AllToolsPolicyMatrix {
  matrix_id: typeof ALL_TOOLS_POLICY_MATRIX_ID;
  schema: 'swissknife.all-mcp-tools-policy-matrix.v1';
  version: string;
  generated_from: readonly string[];
  generated_at?: string;
  ledger_generated_at?: string;
  tool_count: number;
  class_counts: Record<AppCapabilityPolicyClass, number>;
  owner_counts: Record<string, number>;
  exposure_counts: Record<string, number>;
  service_counts: Record<string, number>;
  rules: readonly AllToolsPolicyRule[];
}

export interface AllToolsPolicyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface ClassificationContext {
  text: string;
  tokens: Set<string>;
  tool: AllToolsLedgerTool;
}

export function buildAllToolsPolicyMatrix(
  ledger: AllToolsLedger,
  options: { generatedAt?: string; version?: string } = {},
): AllToolsPolicyMatrix {
  const rules = ledger.tools
    .map(classifyLedgerTool)
    .sort((left, right) => left.tool_id.localeCompare(right.tool_id));

  return {
    matrix_id: ALL_TOOLS_POLICY_MATRIX_ID,
    schema: 'swissknife.all-mcp-tools-policy-matrix.v1',
    version: options.version ?? '2026-07-08',
    generated_from: [
      ledger.schema ?? 'unknown-ledger-schema',
      ledger.generated_at ?? 'unknown-ledger-generation',
    ],
    generated_at: options.generatedAt,
    ledger_generated_at: ledger.generated_at,
    tool_count: rules.length,
    class_counts: countByPolicyClass(rules),
    owner_counts: countBy(rules, rule => rule.owner_module),
    exposure_counts: countBy(rules, rule => rule.exposure_disposition),
    service_counts: countBy(rules, rule => rule.service_id),
    rules,
  };
}

export function classifyLedgerTool(tool: AllToolsLedgerTool): AllToolsPolicyRule {
  const context = buildContext(tool);
  const policyClass = classifyPolicy(context);
  const owner = ownerForTool(context, policyClass);
  const sensitive = isSensitivePolicy(policyClass);
  const sideEffectful = policyClass !== 'read';
  const highRisk = sideEffectful || sensitive;
  const confirmationPolicy = confirmationPolicyForClass(policyClass);
  const receiptPolicy = receiptPolicyForClass(policyClass);
  const fallbackRule = fallbackRuleForClass(policyClass);
  const exposureDisposition = exposureDispositionForClass(policyClass);
  const glassesExposure = glassesExposureForClass(policyClass);

  return {
    tool_id: tool.tool_id,
    service_id: tool.service_id,
    name: tool.name,
    category: tool.category ?? 'uncategorized',
    coverage_status: tool.coverage_status ?? 'unknown',
    owner_module: owner.module,
    owner_reason: owner.reason,
    policy_class: policyClass,
    confirmation_policy: confirmationPolicy,
    receipt_policy: receiptPolicy,
    fallback_rule: fallbackRule,
    exposure_disposition: exposureDisposition,
    glasses_exposure: glassesExposure,
    side_effectful: sideEffectful,
    sensitive,
    high_risk: highRisk,
    app_visible: exposureDisposition === 'app_visible' || exposureDisposition === 'app_visible_with_confirmation',
    live_discovered: Boolean(tool.discovery?.live),
    static_described: Boolean(tool.discovery?.static),
    alias_of: tool.alias_of ?? null,
    aliases: (tool.aliases ?? []).map(alias => alias.tool_id).sort(),
    schema_hashes: {
      input: [...(tool.schema_hashes?.input ?? [])],
      output: [...(tool.schema_hashes?.output ?? [])],
    },
    reasons: reasonsForTool(context, policyClass, owner.module),
  };
}

export function validateAllToolsPolicyMatrix(
  matrix: AllToolsPolicyMatrix,
): AllToolsPolicyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  if (matrix.tool_count !== matrix.rules.length) {
    errors.push(`tool_count ${matrix.tool_count} does not match rules length ${matrix.rules.length}`);
  }

  for (const rule of matrix.rules) {
    if (seen.has(rule.tool_id)) errors.push(`${rule.tool_id}: duplicate policy rule`);
    seen.add(rule.tool_id);

    if (!ALL_TOOLS_POLICY_CLASSES.includes(rule.policy_class)) {
      errors.push(`${rule.tool_id}: unsupported policy class ${rule.policy_class}`);
    }
    if (!ALL_TOOLS_OWNER_MODULES.includes(rule.owner_module)) {
      errors.push(`${rule.tool_id}: unsupported owner module ${rule.owner_module}`);
    }
    if (!rule.confirmation_policy) errors.push(`${rule.tool_id}: missing confirmation policy`);
    if (!rule.receipt_policy) errors.push(`${rule.tool_id}: missing receipt policy`);
    if (!rule.fallback_rule) errors.push(`${rule.tool_id}: missing fallback rule`);
    if (!rule.exposure_disposition) errors.push(`${rule.tool_id}: missing exposure disposition`);
    if (!rule.glasses_exposure) errors.push(`${rule.tool_id}: missing glasses exposure`);
    if (rule.reasons.length === 0) errors.push(`${rule.tool_id}: missing classification reasons`);

    if (rule.side_effectful) {
      if (rule.confirmation_policy === 'none') {
        errors.push(`${rule.tool_id}: side-effectful tool must require confirmation`);
      }
      if (rule.receipt_policy !== 'required_for_side_effects') {
        errors.push(`${rule.tool_id}: side-effectful tool must require side-effect receipts`);
      }
    }

    if (rule.sensitive) {
      if (rule.confirmation_policy !== 'desktop_or_mobile_only') {
        errors.push(`${rule.tool_id}: sensitive tool must be desktop/mobile gated`);
      }
      if (rule.fallback_rule !== 'desktop_or_mobile_only') {
        errors.push(`${rule.tool_id}: sensitive tool must use desktop/mobile fallback`);
      }
    }

    if (rule.high_risk && rule.glasses_exposure === 'native_display_allowed') {
      errors.push(`${rule.tool_id}: high-risk tool cannot be directly exposed to glasses`);
    }

    if (
      rule.policy_class === 'destructive'
      && rule.confirmation_policy !== 'confirm_destructive'
    ) {
      errors.push(`${rule.tool_id}: destructive tool must use confirm_destructive`);
    }

    if (
      rule.policy_class === 'autonomous_action'
      && rule.exposure_disposition !== 'supervisor_only'
      && rule.exposure_disposition !== 'desktop_or_mobile_only'
    ) {
      errors.push(`${rule.tool_id}: autonomous tool must be supervisor-only or desktop/mobile-only`);
    }
  }

  for (const policyClass of ALL_TOOLS_POLICY_CLASSES) {
    if ((matrix.class_counts[policyClass] ?? 0) === 0) {
      warnings.push(`No ledger tool classified as ${policyClass}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function renderAllToolsPolicyMarkdown(matrix: AllToolsPolicyMatrix): string {
  const lines: string[] = [];
  lines.push('# All MCP/MCP++ Tools Policy Matrix');
  lines.push('');
  lines.push(`Generated from ledger: ${matrix.ledger_generated_at ?? 'unknown'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('| --- | ---: |');
  lines.push(`| Tool policy rules | ${matrix.tool_count} |`);
  for (const policyClass of ALL_TOOLS_POLICY_CLASSES) {
    lines.push(`| ${policyClass} | ${matrix.class_counts[policyClass] ?? 0} |`);
  }
  lines.push('');

  lines.push('## Owners');
  lines.push('');
  lines.push('| Owner module | Count |');
  lines.push('| --- | ---: |');
  for (const [owner, count] of Object.entries(matrix.owner_counts).sort()) {
    lines.push(`| ${owner} | ${count} |`);
  }
  lines.push('');

  lines.push('## Exposure');
  lines.push('');
  lines.push('| Exposure disposition | Count |');
  lines.push('| --- | ---: |');
  for (const [exposure, count] of Object.entries(matrix.exposure_counts).sort()) {
    lines.push(`| ${exposure} | ${count} |`);
  }
  lines.push('');

  lines.push('## Rules');
  lines.push('');
  lines.push('| Tool ID | Policy | Owner | Confirmation | Receipt | Fallback | Glasses |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const rule of matrix.rules) {
    lines.push([
      rule.tool_id,
      rule.policy_class,
      rule.owner_module,
      rule.confirmation_policy,
      rule.receipt_policy,
      rule.fallback_rule,
      rule.glasses_exposure,
    ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function classifyPolicy(context: ClassificationContext): AppCapabilityPolicyClass {
  const { tool, tokens } = context;

  if (hasAny(tokens, ['oauth', 'oidc'])) return 'oauth';
  if (hasAny(tokens, [
    'wallet',
    'auth',
    'credential',
    'credentials',
    'secret',
    'token',
    'tokens',
    'password',
    'key',
    'keys',
    'keystore',
  ])) {
    return 'credential';
  }
  if (hasAny(tokens, ['media', 'camera', 'audio', 'video', 'image', 'images', 'photo', 'photos', 'ocr'])) {
    return 'media_capture';
  }
  if (hasAny(tokens, ['delete', 'remove', 'rm', 'purge', 'destroy', 'revoke', 'unpin', 'drop', 'clear'])) {
    return 'destructive';
  }
  if (hasAny(tokens, ['dispatch', 'execute', 'scheduler', 'daemon', 'agent', 'automated', 'automation'])) {
    return 'autonomous_action';
  }
  if (hasAny(tokens, ['workflow']) && !hasAny(tokens, ['status', 'list'])) {
    return 'autonomous_action';
  }
  if (hasAny(tokens, ['inference', 'accelerate', 'benchmark', 'training', 'embedding', 'vector', 'index', 'model'])) {
    return 'heavy_compute';
  }
  if (hasAny(tokens, ['pubsub', 'chat', 'discord', 'email', 'notification', 'notifications', 'contact', 'contacts', 'message', 'messages'])) {
    return 'communication';
  }
  if (hasAny(tokens, [
    'web',
    'archive',
    'search',
    'scrape',
    'scraper',
    'crawl',
    'crawler',
    'download',
    'upload',
    'github',
    'brave',
    'google',
    'federal',
    'state',
    'municipal',
    'peer',
    'peers',
    'swarm',
    'connect',
    'sync',
  ])) {
    return 'external_network';
  }
  if (hasAny(tokens, [
    'add',
    'create',
    'update',
    'save',
    'pin',
    'publish',
    'import',
    'export',
    'copy',
    'move',
    'mv',
    'mkdir',
    'touch',
    'write',
    'configure',
    'register',
    'record',
    'restore',
    'backup',
    'convert',
    'process',
    'generate',
    'shard',
  ])) {
    return 'write';
  }
  if (tool.read_only === false) return 'write';
  return 'read';
}

function ownerForTool(
  context: ClassificationContext,
  policyClass: AppCapabilityPolicyClass,
): { module: AllToolsOwnerModule; reason: string } {
  const { tool, tokens } = context;

  if (hasAny(tokens, ['mcp', 'interface', 'interfaces', 'policy', 'compliance', 'descriptor'])) {
    return { module: 'mcp', reason: 'MCP control, descriptor, policy, or compliance surface.' };
  }
  if (policyClass === 'credential' || policyClass === 'oauth') {
    return { module: 'integrations', reason: 'Credential and delegated-account surfaces are integration-owned.' };
  }
  if (policyClass === 'media_capture') {
    return { module: 'platform', reason: 'Media-sensitive tools depend on host/browser platform mediation.' };
  }
  if (hasAny(tokens, ['logic', 'legal', 'deontic', 'fol', 'dcec', 'tdfol', 'modal', 'norm', 'normative', 'proof'])) {
    return { module: 'logic.deontic', reason: 'Legal, logic, and deontic tools route through the logic policy stack.' };
  }
  if (tool.service_id === 'ipfs_accelerate_py') {
    return { module: 'platform', reason: 'Accelerate compute and hardware execution is platform-owned.' };
  }
  if (policyClass === 'communication' && hasAny(tokens, ['discord', 'email', 'github'])) {
    return { module: 'integrations', reason: 'Third-party communication tools are integration-owned.' };
  }
  if (tool.service_id === 'ipfs_kit_py' || tool.service_id === 'ipfs_datasets_py') {
    return { module: 'ipfs', reason: 'IPFS service-family tool.' };
  }
  return { module: 'apps', reason: 'Default app capability routing owner.' };
}

function confirmationPolicyForClass(policyClass: AppCapabilityPolicyClass): AppCapabilityConfirmationPolicy {
  if (isSensitivePolicy(policyClass)) return 'desktop_or_mobile_only';
  if (policyClass === 'destructive') return 'confirm_destructive';
  if (policyClass === 'read') return 'none';
  return 'confirm';
}

function receiptPolicyForClass(policyClass: AppCapabilityPolicyClass): AppCapabilityReceiptPolicy {
  return policyClass === 'read' ? 'optional' : 'required_for_side_effects';
}

function fallbackRuleForClass(policyClass: AppCapabilityPolicyClass): AppCapabilityFallbackScope {
  if (isSensitivePolicy(policyClass) || policyClass === 'destructive' || policyClass === 'autonomous_action') {
    return 'desktop_or_mobile_only';
  }
  if (policyClass === 'communication') return 'mobile_card';
  if (policyClass === 'read') return 'native_display';
  return 'display_webapp';
}

function exposureDispositionForClass(policyClass: AppCapabilityPolicyClass): AllToolsExposureDisposition {
  if (policyClass === 'autonomous_action') return 'supervisor_only';
  if (isSensitivePolicy(policyClass) || policyClass === 'destructive') return 'desktop_or_mobile_only';
  if (policyClass === 'read') return 'app_visible';
  return 'app_visible_with_confirmation';
}

function glassesExposureForClass(policyClass: AppCapabilityPolicyClass): AllToolsGlassesExposure {
  if (isSensitivePolicy(policyClass) || policyClass === 'destructive' || policyClass === 'autonomous_action') {
    return 'desktop_or_mobile_only';
  }
  if (policyClass === 'communication') return 'mobile_card_after_confirmation';
  if (policyClass === 'read') return 'native_display_allowed';
  return 'display_webapp_after_confirmation';
}

function isSensitivePolicy(policyClass: AppCapabilityPolicyClass): boolean {
  return policyClass === 'credential' || policyClass === 'oauth' || policyClass === 'media_capture';
}

function reasonsForTool(
  context: ClassificationContext,
  policyClass: AppCapabilityPolicyClass,
  ownerModule: AllToolsOwnerModule,
): readonly string[] {
  const tool = context.tool;
  return [
    `policy:${policyClass}`,
    `owner:${ownerModule}`,
    `service:${tool.service_id}`,
    `coverage:${tool.coverage_status ?? 'unknown'}`,
    ...(tool.alias_of ? ['alias:static-to-live'] : []),
    ...((tool.aliases?.length ?? 0) > 0 ? ['alias:live-target'] : []),
  ];
}

function buildContext(tool: AllToolsLedgerTool): ClassificationContext {
  const text = [
    tool.tool_id,
    tool.service_id,
    tool.name,
    tool.unqualified_name,
    tool.category,
    tool.namespace,
    tool.operation,
    tool.surface,
    tool.tool_module,
    tool.description,
    ...(tool.tags ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
  return {
    text,
    tokens: new Set(text.split(/[^a-z0-9]+/).filter(Boolean)),
    tool,
  };
}

function hasAny(tokens: Set<string>, values: readonly string[]): boolean {
  return values.some(value => tokens.has(value));
}

function countByPolicyClass(rules: readonly AllToolsPolicyRule[]): Record<AppCapabilityPolicyClass, number> {
  const counts = Object.fromEntries(
    ALL_TOOLS_POLICY_CLASSES.map(policyClass => [policyClass, 0]),
  ) as Record<AppCapabilityPolicyClass, number>;
  for (const rule of rules) counts[rule.policy_class] += 1;
  return counts;
}

function countBy<T>(
  values: readonly T[],
  keyForValue: (value: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = keyForValue(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function markdownCell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
=======
  live_discovered?: boolean;
  static_described?: boolean;
  alias_of?: string | null;
  aliases?: readonly string[];
  reasons?: readonly string[];
  [key: string]: unknown;
}

export interface AllToolsPolicyMatrix {
  matrix_id: string;
  schema: string;
  version?: string;
  generated_from?: readonly string[];
  generated_at?: string;
  ledger_generated_at?: string;
  tool_count: number;
  class_counts?: Record<string, number>;
  owner_counts?: Record<string, number>;
  exposure_counts?: Record<string, number>;
  service_counts?: Record<string, number>;
  rules: readonly AllToolsPolicyRule[];
}

// ---------------------------------------------------------------------------
// App runtime classification
//
// Maps a policy rule (one governed MCP/MCP++ tool) onto the AppRuntimeClass
// taxonomy used by app manifests (see ./app-manifest.ts): whether the tool's
// capability can run entirely in the browser, is browser-visible but
// host-degraded, or is host-only and must never be app_visible in a browser
// bundle.
// ---------------------------------------------------------------------------

/**
 * Classifies a single policy rule's *intrinsic* runtime requirement,
 * independent of whether it currently happens to be `app_visible`. This lets
 * {@link validateAppRuntimeClassificationExposure} catch drift: a rule whose
 * capability is inherently host-only but which was (incorrectly) marked
 * `app_visible` in the ledger/matrix.
 *
 *   - Rules referencing a host-only capability keyword (filesystem,
 *     subprocess, native, hardware, ...) are `host-only`: the capability
 *     must never be reachable from a browser bundle, regardless of the
 *     current `app_visible` flag.
 *   - `high_risk` + `sensitive` + `side_effectful` rules are treated as
 *     `host-only` even without a keyword match, since they are deliberately
 *     excluded from browser-reachable surfaces.
 *   - Everything else is `browser-safe`.
 *
 * Note: unlike `inferAppRuntimeClassFromBindingRow` in
 * `all-tools-app-binding-matrix.ts` (which describes an *already bound* app
 * surface and may legitimately report `hybrid` for a host-degraded but
 * bundled app), this classifier answers the upstream question "should this
 * capability ever be app-visible at all?" and is intentionally binary.
 */
export function classifyAppRuntimeClassFromPolicyRule(rule: AllToolsPolicyRule): AppRuntimeClass {
  const referencesHostOnlyCapability = textReferencesHostOnlyCapability(
    rule.category,
    rule.policy_class,
    rule.owner_module,
  );

  const isDeliberatelyExcludedHighRiskRule = rule.high_risk === true
    && rule.sensitive === true
    && rule.side_effectful === true;

  return (referencesHostOnlyCapability || isDeliberatelyExcludedHighRiskRule) ? 'host-only' : 'browser-safe';
}

export interface AppRuntimeClassificationRow {
  tool_id: string;
  service_id: string;
  name: string;
  app_visible: boolean;
  runtime_class: AppRuntimeClass;
}

export interface AppRuntimeClassificationSummary {
  tool_count: number;
  class_counts: Record<AppRuntimeClass, number>;
  app_visible_class_counts: Record<AppRuntimeClass, number>;
  rows: readonly AppRuntimeClassificationRow[];
}

function emptyRuntimeClassCounts(): Record<AppRuntimeClass, number> {
  return {
    'browser-safe': 0,
    hybrid: 0,
    'remote-capability': 0,
    'host-only': 0,
  };
}

/**
 * Classifies every rule in a policy matrix and summarizes the runtime-class
 * distribution, split by overall count and by `app_visible` count. Used to
 * assert that no `host-only` rule is ever counted as `app_visible` in the
 * browser-facing app surface.
 */
export function buildAppRuntimeClassificationSummary(
  matrix: AllToolsPolicyMatrix,
): AppRuntimeClassificationSummary {
  const classCounts = emptyRuntimeClassCounts();
  const appVisibleClassCounts = emptyRuntimeClassCounts();
  const rows: AppRuntimeClassificationRow[] = [];

  for (const rule of matrix.rules) {
    const runtimeClass = classifyAppRuntimeClassFromPolicyRule(rule);
    classCounts[runtimeClass] += 1;
    if (rule.app_visible) {
      appVisibleClassCounts[runtimeClass] += 1;
    }
    rows.push({
      tool_id: rule.tool_id,
      service_id: rule.service_id,
      name: rule.name,
      app_visible: rule.app_visible,
      runtime_class: runtimeClass,
    });
  }

  return {
    tool_count: matrix.rules.length,
    class_counts: classCounts,
    app_visible_class_counts: appVisibleClassCounts,
    rows,
  };
}

export interface AppRuntimeClassificationValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Fails when any rule classified `host-only` is `app_visible`: a host-only
 * capability must never be exposed as a bundled/browser-reachable app
 * surface. `remote-capability` and `hybrid` rules may be `app_visible`.
 */
export function validateAppRuntimeClassificationExposure(
  matrix: AllToolsPolicyMatrix,
): AppRuntimeClassificationValidationResult {
  const errors: string[] = [];

  for (const rule of matrix.rules) {
    const runtimeClass = classifyAppRuntimeClassFromPolicyRule(rule);
    if (runtimeClass === 'host-only' && rule.app_visible) {
      errors.push(
        `Rule "${rule.tool_id}" is classified host-only but is app_visible; host-only capabilities must not be exposed to the browser app surface.`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
}
