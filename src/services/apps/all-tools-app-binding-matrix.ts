import {
  buildAllToolsPolicyMatrix,
  type AllToolsLedger,
  type AllToolsLedgerTool,
  type AllToolsPolicyMatrix,
  type AllToolsPolicyRule,
} from './all-tools-policy-classifier.js';
import type { AppCapabilityDefinition } from './app-capability-gateway.js';
import {
  getIPFSAppCapabilityRegistry,
  type IPFSAppCapabilityRegistry,
} from './ipfs-app-capability-registry.js';
import {
  VIRTUAL_DESKTOP_APP_MANIFEST,
  type VirtualDesktopAppManifest,
} from './virtual-desktop-app-manifest.js';

export const ALL_TOOLS_APP_BINDING_MATRIX_ID =
  'org.hallucinate.swissknife.all-mcp-tools-app-binding-matrix';

export type AllToolsAppBindingDisposition =
  | 'existing_app_capability'
  | 'generated_descriptor_app_capability'
  | 'desktop_mobile_only'
  | 'supervisor_only_internal'
  | 'blocked_non_app';

export type AllToolsNormalizedDisposition =
  | 'app_surface'
  | 'admin_only'
  | 'server_internal'
  | 'deprecated'
  | 'unsafe_without_human_review'
  | 'not_app_surface';

export interface AllToolsAppBindingRow {
  tool_id: string;
  service_id: string;
  name: string;
  category: string;
  owner_module: string;
  policy_class: string;
  policy_ref: string;
  confirmation_policy: string;
  receipt_policy: string;
  disposition: AllToolsAppBindingDisposition;
  normalized_disposition: AllToolsNormalizedDisposition;
  app_visible: boolean;
  app_id?: string;
  capability_id?: string;
  capability_source: 'registry' | 'generated' | 'none';
  mcp_tool_name?: string;
  input_schema_available: boolean;
  input_schema_source: 'ledger' | 'default_object_schema';
  result_renderer?: string;
  glasses_fallback?: string;
  glasses_exposure: string;
  binding_reason: string;
  non_app_reason?: string;
}

export interface AllToolsAppBindingMatrix {
  matrix_id: typeof ALL_TOOLS_APP_BINDING_MATRIX_ID;
  schema: 'swissknife.all-mcp-tools-app-binding-matrix.v1';
  version: string;
  generated_from: readonly string[];
  generated_at?: string;
  tool_count: number;
  disposition_counts: Record<AllToolsAppBindingDisposition, number>;
  app_counts: Record<string, number>;
  service_counts: Record<string, number>;
  rows: readonly AllToolsAppBindingRow[];
}

export interface AllToolsAppBindingValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface BindingContext {
  ledger: AllToolsLedger;
  policyMatrix: AllToolsPolicyMatrix;
  manifest: VirtualDesktopAppManifest;
  registry: IPFSAppCapabilityRegistry;
  toolById: Map<string, AllToolsLedgerTool>;
  policyById: Map<string, AllToolsPolicyRule>;
  manifestAppIds: Set<string>;
}

const DISPOSITIONS = [
  'existing_app_capability',
  'generated_descriptor_app_capability',
  'desktop_mobile_only',
  'supervisor_only_internal',
  'blocked_non_app',
] as const satisfies readonly AllToolsAppBindingDisposition[];

export function buildAllToolsAppBindingMatrix(
  ledger: AllToolsLedger,
  policyMatrix: AllToolsPolicyMatrix = buildAllToolsPolicyMatrix(ledger),
  manifest: VirtualDesktopAppManifest = VIRTUAL_DESKTOP_APP_MANIFEST,
  registry: IPFSAppCapabilityRegistry = getIPFSAppCapabilityRegistry(manifest),
  options: { generatedAt?: string; version?: string } = {},
): AllToolsAppBindingMatrix {
  const context: BindingContext = {
    ledger,
    policyMatrix,
    manifest,
    registry,
    toolById: new Map(ledger.tools.map(tool => [tool.tool_id, tool])),
    policyById: new Map(policyMatrix.rules.map(rule => [rule.tool_id, rule])),
    manifestAppIds: new Set(manifest.apps.map(app => app.id)),
  };
  const rows = policyMatrix.rules
    .map(rule => bindPolicyRule(rule, context))
    .sort((left, right) => left.tool_id.localeCompare(right.tool_id));

  return {
    matrix_id: ALL_TOOLS_APP_BINDING_MATRIX_ID,
    schema: 'swissknife.all-mcp-tools-app-binding-matrix.v1',
    version: options.version ?? '2026-07-08',
    generated_from: [
      ledger.schema ?? 'unknown-ledger-schema',
      policyMatrix.matrix_id,
      registry.registry_id,
      manifest.manifest_id,
    ],
    generated_at: options.generatedAt,
    tool_count: rows.length,
    disposition_counts: countDispositions(rows),
    app_counts: countBy(rows.filter(row => row.app_id), row => row.app_id ?? 'none'),
    service_counts: countBy(rows, row => row.service_id),
    rows,
  };
}

export function validateAllToolsAppBindingMatrix(
  matrix: AllToolsAppBindingMatrix,
  ledger: AllToolsLedger,
  policyMatrix: AllToolsPolicyMatrix,
  manifest: VirtualDesktopAppManifest = VIRTUAL_DESKTOP_APP_MANIFEST,
): AllToolsAppBindingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ledgerToolIds = new Set(ledger.tools.map(tool => tool.tool_id));
  const policyToolIds = new Set(policyMatrix.rules.map(rule => rule.tool_id));
  const rowToolIds = new Set<string>();
  const appIds = new Set(manifest.apps.map(app => app.id));

  if (matrix.tool_count !== matrix.rows.length) {
    errors.push(`tool_count ${matrix.tool_count} does not match row length ${matrix.rows.length}`);
  }
  if (matrix.rows.length !== ledger.tools.length) {
    errors.push(`binding row count ${matrix.rows.length} does not match ledger tool count ${ledger.tools.length}`);
  }

  for (const row of matrix.rows) {
    if (rowToolIds.has(row.tool_id)) errors.push(`${row.tool_id}: duplicate binding row`);
    rowToolIds.add(row.tool_id);
    if (!ledgerToolIds.has(row.tool_id)) errors.push(`${row.tool_id}: row has no ledger tool`);
    if (!policyToolIds.has(row.tool_id)) errors.push(`${row.tool_id}: row has no policy rule`);
    if (!row.policy_ref) errors.push(`${row.tool_id}: missing policy_ref`);
    if (!DISPOSITIONS.includes(row.disposition)) errors.push(`${row.tool_id}: unsupported disposition ${row.disposition}`);
    if (!row.normalized_disposition) errors.push(`${row.tool_id}: missing normalized disposition`);

    if (row.app_id && !appIds.has(row.app_id)) {
      errors.push(`${row.tool_id}: app_id ${row.app_id} is not in the virtual desktop manifest`);
    }

    if (
      row.disposition === 'existing_app_capability'
      || row.disposition === 'generated_descriptor_app_capability'
      || row.disposition === 'desktop_mobile_only'
    ) {
      if (!row.app_id) errors.push(`${row.tool_id}: app-bound disposition missing app_id`);
      if (!row.capability_id) errors.push(`${row.tool_id}: app-bound disposition missing capability_id`);
    }

    if (row.app_visible) {
      if (!row.input_schema_available) errors.push(`${row.tool_id}: app-visible tool lacks input schema`);
      if (!row.result_renderer) errors.push(`${row.tool_id}: app-visible tool lacks result renderer`);
      if (!row.glasses_fallback) errors.push(`${row.tool_id}: app-visible tool lacks glasses fallback`);
      if (row.confirmation_policy === 'none' && row.policy_class !== 'read') {
        errors.push(`${row.tool_id}: side-effectful app-visible tool lacks confirmation`);
      }
    }

    if (
      (row.disposition === 'blocked_non_app' || row.disposition === 'supervisor_only_internal')
      && !row.non_app_reason
    ) {
      errors.push(`${row.tool_id}: non-app disposition missing reason`);
    }
  }

  for (const toolId of ledgerToolIds) {
    if (!rowToolIds.has(toolId)) errors.push(`${toolId}: ledger tool missing binding row`);
  }

  for (const disposition of DISPOSITIONS) {
    if ((matrix.disposition_counts[disposition] ?? 0) === 0) {
      warnings.push(`No tools assigned disposition ${disposition}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function renderAllToolsAppBindingsMarkdown(matrix: AllToolsAppBindingMatrix): string {
  const lines: string[] = [];
  lines.push('# All MCP/MCP++ Tools App Bindings');
  lines.push('');
  lines.push(`Generated: ${matrix.generated_at ?? 'not recorded'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Disposition | Count |');
  lines.push('| --- | ---: |');
  for (const disposition of DISPOSITIONS) {
    lines.push(`| ${disposition} | ${matrix.disposition_counts[disposition] ?? 0} |`);
  }
  lines.push('');

  lines.push('## Apps');
  lines.push('');
  lines.push('| App | Bound tools |');
  lines.push('| --- | ---: |');
  for (const [appId, count] of Object.entries(matrix.app_counts).sort()) {
    lines.push(`| ${appId} | ${count} |`);
  }
  lines.push('');

  lines.push('## Bindings');
  lines.push('');
  lines.push('| Tool ID | Disposition | Normalized | App | Capability | Policy | Glasses |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of matrix.rows) {
    lines.push([
      row.tool_id,
      row.disposition,
      row.normalized_disposition,
      row.app_id ?? '',
      row.capability_id ?? '',
      row.policy_class,
      row.glasses_exposure,
    ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function bindPolicyRule(
  rule: AllToolsPolicyRule,
  context: BindingContext,
): AllToolsAppBindingRow {
  const tool = context.toolById.get(rule.tool_id);
  if (!tool) {
    return blockedRow(rule, 'Policy rule has no matching ledger tool.');
  }

  const existingCapability = findExistingCapability(tool, context.registry.capabilities);
  const inputSchemaAvailable = Boolean((tool.schema_hashes?.input ?? []).length > 0);
  const inputSchemaSource = inputSchemaAvailable ? 'ledger' : 'default_object_schema';
  const base = {
    tool_id: rule.tool_id,
    service_id: rule.service_id,
    name: rule.name,
    category: rule.category,
    owner_module: rule.owner_module,
    policy_class: rule.policy_class,
    policy_ref: `${context.policyMatrix.matrix_id}:${rule.tool_id}`,
    confirmation_policy: rule.confirmation_policy,
    receipt_policy: rule.receipt_policy,
    mcp_tool_name: tool.name,
    input_schema_available: true,
    input_schema_source: inputSchemaSource,
    result_renderer: resultRendererForRule(rule),
    glasses_fallback: rule.fallback_rule,
    glasses_exposure: rule.glasses_exposure,
  } satisfies Partial<AllToolsAppBindingRow>;

  if (rule.exposure_disposition === 'supervisor_only') {
    return {
      ...base,
      disposition: 'supervisor_only_internal',
      normalized_disposition: 'server_internal',
      app_visible: false,
      capability_source: 'none',
      binding_reason: 'Autonomous or dispatcher tool is reserved for the agent supervisor.',
      non_app_reason: 'Supervisor-only tools can invoke arbitrary downstream behavior and are not app-routable.',
    } as AllToolsAppBindingRow;
  }

  if (existingCapability) {
    const desktopOnly = rule.exposure_disposition === 'desktop_or_mobile_only';
    return {
      ...base,
      disposition: desktopOnly ? 'desktop_mobile_only' : 'existing_app_capability',
      normalized_disposition: desktopOnly ? 'unsafe_without_human_review' : 'app_surface',
      app_visible: !desktopOnly,
      app_id: existingCapability.app_id,
      capability_id: existingCapability.capability_id,
      capability_source: 'registry',
      binding_reason: desktopOnly
        ? 'Existing capability exists but policy requires desktop/mobile mediation.'
        : 'Matched an existing app capability by MCP tool name, unqualified name, or static alias.',
      ...(desktopOnly
        ? { non_app_reason: 'Policy requires desktop/mobile mediation before app or glasses exposure.' }
        : {}),
    } as AllToolsAppBindingRow;
  }

  if (rule.exposure_disposition === 'desktop_or_mobile_only') {
    const appId = defaultAppIdForTool(tool, rule);
    return {
      ...base,
      disposition: 'desktop_mobile_only',
      normalized_disposition: 'unsafe_without_human_review',
      app_visible: false,
      app_id: appId,
      capability_id: generatedCapabilityId(tool),
      capability_source: 'generated',
      binding_reason: 'Generated desktop/mobile-only binding for a sensitive or destructive tool.',
      non_app_reason: 'Policy requires desktop/mobile mediation before app or glasses exposure.',
    } as AllToolsAppBindingRow;
  }

  if (rule.exposure_disposition === 'app_visible' || rule.exposure_disposition === 'app_visible_with_confirmation') {
    const appId = defaultAppIdForTool(tool, rule);
    return {
      ...base,
      disposition: 'generated_descriptor_app_capability',
      normalized_disposition: 'app_surface',
      app_visible: true,
      app_id: appId,
      capability_id: generatedCapabilityId(tool),
      capability_source: 'generated',
      binding_reason: 'No existing exact app capability matched; assigned to the service-family generated app.',
    } as AllToolsAppBindingRow;
  }

  return blockedRow(rule, 'No app binding rule matched.');
}

function findExistingCapability(
  tool: AllToolsLedgerTool,
  capabilities: readonly AppCapabilityDefinition[],
): AppCapabilityDefinition | null {
  const candidates = candidateToolNames(tool);
  const serviceCapabilities = capabilities.filter(capability => (
    capability.service_family === tool.service_id
    && capability.mcp_tool_name
    && candidates.has(capability.mcp_tool_name)
  ));
  if (serviceCapabilities.length === 0) return null;

  const preferredApps = preferredAppsForService(tool.service_id);
  return [...serviceCapabilities].sort((left, right) => {
    const leftRank = preferredApps.indexOf(left.app_id);
    const rightRank = preferredApps.indexOf(right.app_id);
    return (leftRank === -1 ? 999 : leftRank) - (rightRank === -1 ? 999 : rightRank)
      || capabilitySpecificityRank(left) - capabilitySpecificityRank(right)
      || left.capability_id.localeCompare(right.capability_id);
  })[0] ?? null;
}

function preferredAppsForService(serviceId: string): readonly string[] {
  if (serviceId === 'ipfs_datasets_py') {
    return ['datasets-browser', 'idl-explorer', 'file-manager', 'mcp-control'];
  }
  if (serviceId === 'ipfs_accelerate_py') {
    return ['accelerate-panel', 'task-manager', 'model-browser'];
  }
  if (serviceId === 'ipfs_kit_py') {
    return ['ipfs-explorer', 'file-manager', 'p2p-network', 'mcp-control', 'terminal'];
  }
  return ['orb-auto-ui', 'mcp-control'];
}

function capabilitySpecificityRank(capability: AppCapabilityDefinition): number {
  if (capability.capability_id.includes('.operation.') || capability.capability_id.includes('.tool.')) return 0;
  return 1;
}

function candidateToolNames(tool: AllToolsLedgerTool): Set<string> {
  return new Set([
    tool.name,
    tool.unqualified_name,
    ...((tool.aliases ?? []).map(alias => alias.name)),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0));
}

function defaultAppIdForTool(tool: AllToolsLedgerTool, rule: AllToolsPolicyRule): string {
  if (tool.service_id === 'ipfs_accelerate_py') return 'accelerate-panel';
  if (tool.service_id === 'ipfs_datasets_py') {
    if (rule.owner_module === 'logic.deontic') return 'idl-explorer';
    if (rule.owner_module === 'integrations') return 'datasets-browser';
    return 'datasets-browser';
  }
  if (tool.service_id === 'ipfs_kit_py') {
    const category = tool.category ?? '';
    if (category === 'Files' || category === 'mfs_tools') return 'file-manager';
    if (category === 'Peers' || category === 'swarm_tools' || category === 'cluster_tools') return 'p2p-network';
    if (category === 'mcp_control' || category === 'Backends' || category === 'Config') return 'mcp-control';
    return 'ipfs-explorer';
  }
  return 'orb-auto-ui';
}

function generatedCapabilityId(tool: AllToolsLedgerTool): string {
  const servicePrefix = tool.service_id === 'ipfs_kit_py'
    ? 'ipfs.kit'
    : tool.service_id === 'ipfs_datasets_py'
      ? 'ipfs.datasets'
      : tool.service_id === 'ipfs_accelerate_py'
        ? 'ipfs.accelerate'
        : 'mcp';
  return `${servicePrefix}.generated.${slug(tool.name)}`;
}

function resultRendererForRule(rule: AllToolsPolicyRule): string {
  if (rule.policy_class === 'heavy_compute') return 'job-console';
  if (rule.policy_class === 'external_network') return 'network-result';
  if (rule.policy_class === 'communication') return 'thread-or-message';
  if (rule.policy_class === 'credential' || rule.policy_class === 'oauth') return 'redacted-secret';
  if (rule.policy_class === 'media_capture') return 'media-preview-redacted';
  if (rule.policy_class === 'destructive') return 'receipt-required';
  return 'schema-object';
}

function blockedRow(rule: AllToolsPolicyRule, reason: string): AllToolsAppBindingRow {
  return {
    tool_id: rule.tool_id,
    service_id: rule.service_id,
    name: rule.name,
    category: rule.category,
    owner_module: rule.owner_module,
    policy_class: rule.policy_class,
    policy_ref: `missing-policy-matrix:${rule.tool_id}`,
    confirmation_policy: rule.confirmation_policy,
    receipt_policy: rule.receipt_policy,
    disposition: 'blocked_non_app',
    normalized_disposition: 'not_app_surface',
    app_visible: false,
    capability_source: 'none',
    input_schema_available: false,
    input_schema_source: 'default_object_schema',
    glasses_exposure: rule.glasses_exposure,
    binding_reason: reason,
    non_app_reason: reason,
  };
}

function countDispositions(rows: readonly AllToolsAppBindingRow[]): Record<AllToolsAppBindingDisposition, number> {
  const counts = Object.fromEntries(DISPOSITIONS.map(disposition => [disposition, 0])) as Record<AllToolsAppBindingDisposition, number>;
  for (const row of rows) counts[row.disposition] += 1;
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

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.+/g, '.');
}

function markdownCell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
