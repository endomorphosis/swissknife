import {
  getIPFSAccelerateDescriptorPack,
  type IPFSAccelerateDescriptorPack,
} from '../mcp/mcp-ipfs-accelerate-descriptor-pack.js';
import {
  getIPFSDatasetsDescriptorPack,
  type IPFSDatasetsDescriptorPack,
} from '../mcp/mcp-ipfs-datasets-descriptor-pack.js';
import {
  getIPFSKitDescriptorPack,
  getIPFSKitInterfaceDescriptors,
  type IPFSKitDescriptorPack,
} from '../mcp/mcp-ipfs-kit-descriptor-pack.js';
import { generateSchemaDrivenUI } from '../mcp/mcp-schema-ui-generator.js';
import type {
  GeneratedRendererKind,
  GeneratedSchemaDrivenUI,
} from '../mcp/mcp-schema-ui-generator.js';
import type {
  MCPUIOperationContract,
  MCPUIProfileDescriptor,
  TemplateKind,
} from '../mcp/mcp-ui-profile.js';
import type { AppCapabilityDefinition } from './app-capability-gateway.js';
import type {
  AppCapabilityConfirmationPolicy,
  AppCapabilityExecutionMode,
  AppCapabilityPolicyClass,
  AppCapabilityReceiptPolicy,
} from './app-result-envelope.js';
import {
  VIRTUAL_DESKTOP_APP_MANIFEST,
  type VirtualDesktopAppManifest,
  type VirtualDesktopAppManifestEntry,
} from './virtual-desktop-app-manifest.js';

export const IPFS_APP_CAPABILITY_REGISTRY_ID =
  'org.hallucinate.swissknife.ipfs-app-capability-registry';

export type IPFSAppCapabilityServiceFamily =
  | 'ipfs_kit_py'
  | 'ipfs_datasets_py'
  | 'ipfs_accelerate_py';

export interface IPFSDescriptorOperationBinding {
  service_family: IPFSAppCapabilityServiceFamily;
  descriptor_pack_id: string;
  source_repository: string;
  operation: string;
  surface?: string;
  category?: string;
  tool_module?: string;
  tool_function: string;
  input_schema: Record<string, unknown>;
  result_schema: Record<string, unknown>;
  policy_class: AppCapabilityPolicyClass;
  read_only: boolean;
  stream_kind?: string;
  template_kind: TemplateKind | 'tool';
  renderer_kind: GeneratedRendererKind | 'object';
  ui_section_ids: readonly string[];
  mcp_plus_plus_interface: string;
}

export interface IPFSAppCapabilityFamilySummary {
  service_family: IPFSAppCapabilityServiceFamily;
  descriptor_pack_id: string;
  source_repository: string;
  operation_count: number;
  app_count: number;
  capability_count: number;
}

export interface IPFSAppCapabilityMatrixRow {
  app_id: string;
  app_title: string;
  capability_id: string;
  service_family: IPFSAppCapabilityServiceFamily;
  descriptor_pack_id: string;
  mcp_tool_name?: string;
  mcp_plus_plus_interface?: string;
  policy_class: AppCapabilityPolicyClass;
  execution_modes: readonly AppCapabilityExecutionMode[];
  default_execution_mode: AppCapabilityExecutionMode;
  desktop_result_renderer: string;
  glasses_summary_renderer: string;
  fallback_strategy: string;
  input_schema_required: readonly string[];
  result_schema_keys: readonly string[];
}

export interface IPFSAppCapabilityRegistry {
  registry_id: typeof IPFS_APP_CAPABILITY_REGISTRY_ID;
  version: string;
  generated_from: readonly string[];
  capabilities: readonly AppCapabilityDefinition[];
  families: readonly IPFSAppCapabilityFamilySummary[];
  matrix: readonly IPFSAppCapabilityMatrixRow[];
}

export interface IPFSAppCapabilityRegistryValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface DescriptorContext {
  kit: IPFSKitDescriptorPack;
  datasets: IPFSDatasetsDescriptorPack;
  accelerate: IPFSAccelerateDescriptorPack;
  operations: readonly IPFSDescriptorOperationBinding[];
}

const EXECUTION_MODES: readonly AppCapabilityExecutionMode[] = [
  'mock',
  'direct_import',
  'direct_cli',
  'mcp_remote',
  'mcp_plus_plus_remote',
];

const KIT_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    ok: { type: 'boolean' },
    cid: { type: 'string' },
    path: { type: 'string' },
    bytes: { type: 'number' },
    result: { type: ['object', 'array', 'string', 'number', 'boolean', 'null'] },
  },
};

export function getIPFSAppCapabilityRegistry(
  manifest: VirtualDesktopAppManifest = VIRTUAL_DESKTOP_APP_MANIFEST,
): IPFSAppCapabilityRegistry {
  const context = buildDescriptorContext();
  const capabilities = [
    ...buildManifestCapabilities(manifest, context),
    ...buildConcreteOperationCapabilities(manifest, context),
  ];
  const deduped = dedupeCapabilities(capabilities);

  return {
    registry_id: IPFS_APP_CAPABILITY_REGISTRY_ID,
    version: manifest.version,
    generated_from: [
      context.kit.id,
      context.datasets.id,
      context.accelerate.id,
      manifest.manifest_id,
    ],
    capabilities: deduped,
    families: familySummaries(deduped, context.operations),
    matrix: buildCapabilityMatrix(deduped, manifest),
  };
}

export function getIPFSAppCapabilitiesForApp(
  appId: string,
  manifest: VirtualDesktopAppManifest = VIRTUAL_DESKTOP_APP_MANIFEST,
): AppCapabilityDefinition[] {
  return getIPFSAppCapabilityRegistry(manifest).capabilities
    .filter(capability => capability.app_id === appId)
    .map(cloneCapability);
}

export function getIPFSAppCapabilityMatrix(
  manifest: VirtualDesktopAppManifest = VIRTUAL_DESKTOP_APP_MANIFEST,
): IPFSAppCapabilityMatrixRow[] {
  return getIPFSAppCapabilityRegistry(manifest).matrix.map(row => clone(row));
}

export function validateIPFSAppCapabilityRegistry(
  registry: IPFSAppCapabilityRegistry = getIPFSAppCapabilityRegistry(),
): IPFSAppCapabilityRegistryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const serviceFamilies = new Set<string>();

  for (const capability of registry.capabilities) {
    const key = `${capability.app_id}::${capability.capability_id}`;
    if (seen.has(key)) {
      errors.push(`Duplicate capability registration: ${key}`);
    }
    seen.add(key);

    if (!capability.app_id) errors.push(`${key}: missing app_id`);
    if (!capability.capability_id) errors.push(`${key}: missing capability_id`);
    if (!capability.descriptor_pack_id) errors.push(`${key}: missing descriptor_pack_id`);
    if (!capability.input_schema || capability.input_schema.type !== 'object') {
      errors.push(`${key}: input_schema must be an object schema`);
    }
    if (!capability.result_schema || capability.result_schema.type !== 'object') {
      errors.push(`${key}: result_schema must be an object schema`);
    }
    if (capability.execution_modes.length === 0) {
      errors.push(`${key}: missing execution_modes`);
    }
    if (!capability.execution_modes.includes(capability.default_execution_mode)) {
      errors.push(`${key}: default_execution_mode is not in execution_modes`);
    }
    if (!capability.policy_class) errors.push(`${key}: missing policy_class`);
    if (!capability.desktop_result_renderer) errors.push(`${key}: missing desktop_result_renderer`);
    if (!capability.glasses_summary_renderer) errors.push(`${key}: missing glasses_summary_renderer`);
    if (!capability.fallback_strategy) errors.push(`${key}: missing fallback_strategy`);
    serviceFamilies.add(capability.service_family);
  }

  for (const family of ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py']) {
    if (!serviceFamilies.has(family)) {
      errors.push(`Missing service family: ${family}`);
    }
  }

  const matrixKeys = new Set(registry.matrix.map(row => `${row.app_id}::${row.capability_id}`));
  for (const capability of registry.capabilities) {
    const key = `${capability.app_id}::${capability.capability_id}`;
    if (!matrixKeys.has(key)) {
      warnings.push(`${key}: missing matrix row`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function buildDescriptorContext(): DescriptorContext {
  const kit = getIPFSKitDescriptorPack();
  const datasets = getIPFSDatasetsDescriptorPack();
  const accelerate = getIPFSAccelerateDescriptorPack();

  return {
    kit,
    datasets,
    accelerate,
    operations: [
      ...kitOperationBindings(kit),
      ...profileOperationBindings({
        packId: datasets.id,
        sourceRepository: datasets.source_repository,
        serviceFamily: 'ipfs_datasets_py',
        descriptor: datasets.descriptors[0],
        bindings: datasets.backend_bindings,
      }),
      ...profileOperationBindings({
        packId: accelerate.id,
        sourceRepository: accelerate.source_repository,
        serviceFamily: 'ipfs_accelerate_py',
        descriptor: accelerate.descriptors[0],
        bindings: accelerate.backend_bindings,
      }),
    ],
  };
}

function kitOperationBindings(pack: IPFSKitDescriptorPack): IPFSDescriptorOperationBinding[] {
  const interfaces = new Map(getIPFSKitInterfaceDescriptors().map(descriptor => [
    descriptor.name,
    `${descriptor.namespace}.${descriptor.name}`,
  ]));

  return pack.backend_bindings.map(binding => ({
    service_family: 'ipfs_kit_py',
    descriptor_pack_id: pack.id,
    source_repository: pack.source_repository,
    operation: binding.tool_function,
    category: binding.category,
    tool_function: binding.tool_function,
    input_schema: clone(binding.inputSchema),
    result_schema: clone(KIT_RESULT_SCHEMA),
    policy_class: policyForKitBinding(binding.tool_function, binding.category, binding.read_only),
    read_only: binding.read_only,
    template_kind: 'tool',
    renderer_kind: 'object',
    ui_section_ids: [`kit-${binding.category}`],
    mcp_plus_plus_interface: interfaces.get(binding.tool_function)
      ?? `ipfs_kit/${binding.category}.${binding.tool_function}`,
  }));
}

function profileOperationBindings(input: {
  packId: string;
  sourceRepository: string;
  serviceFamily: Exclude<IPFSAppCapabilityServiceFamily, 'ipfs_kit_py'>;
  descriptor: MCPUIProfileDescriptor;
  bindings: ReadonlyArray<{
    surface: string;
    operation: string;
    tool_module: string;
    tool_function: string;
    payload_contracts: readonly string[];
    stream?: { kind: string };
  }>;
}): IPFSDescriptorOperationBinding[] {
  const ui = generateSchemaDrivenUI(input.descriptor);
  const operationsByMethod = new Map(input.descriptor.data_contracts.operations.map(operation => [
    operation.method,
    operation,
  ]));
  const firstBindingByOperation = new Map<string, typeof input.bindings[number]>();

  for (const binding of input.bindings) {
    if (!firstBindingByOperation.has(binding.operation)) {
      firstBindingByOperation.set(binding.operation, binding);
    }
  }

  return Array.from(firstBindingByOperation.values()).map(binding => {
    const operation = operationsByMethod.get(binding.operation);
    const renderer = rendererForOperation(ui, binding.operation);
    return {
      service_family: input.serviceFamily,
      descriptor_pack_id: input.packId,
      source_repository: input.sourceRepository,
      operation: binding.operation,
      surface: binding.surface,
      tool_module: binding.tool_module,
      tool_function: binding.tool_function,
      input_schema: clone(operation?.input_schema ?? { type: 'object' }),
      result_schema: clone(operation?.output_schema ?? schemaForPayloadContracts(binding.payload_contracts)),
      policy_class: policyForProfileOperation(input.serviceFamily, binding.operation, operation),
      read_only: Boolean(operation?.idempotent),
      stream_kind: binding.stream?.kind ?? operation?.stream?.kind,
      template_kind: ui.template,
      renderer_kind: renderer,
      ui_section_ids: ui.regions
        .filter(region => region.operation === binding.operation)
        .map(region => region.id),
      mcp_plus_plus_interface: `${input.descriptor.namespace}.${binding.operation}`,
    };
  });
}

function buildManifestCapabilities(
  manifest: VirtualDesktopAppManifest,
  context: DescriptorContext,
): AppCapabilityDefinition[] {
  const capabilities: AppCapabilityDefinition[] = [];

  for (const app of manifest.apps) {
    for (const capabilityId of app.capabilities) {
      const serviceFamily = serviceFamilyForCapabilityId(capabilityId);
      if (!serviceFamily) continue;

      const operations = operationsForManifestCapability(capabilityId, context.operations);
      const primary = operations[0] ?? fallbackOperationForFamily(serviceFamily, context.operations);
      if (!primary) continue;

      capabilities.push(capabilityForApp({
        app,
        capabilityId,
        serviceFamily,
        primary,
        operations,
        concrete: false,
      }));
    }
  }

  return capabilities;
}

function buildConcreteOperationCapabilities(
  manifest: VirtualDesktopAppManifest,
  context: DescriptorContext,
): AppCapabilityDefinition[] {
  const apps = new Map(manifest.apps.map(app => [app.id, app]));
  const concrete: AppCapabilityDefinition[] = [];
  const kitApps = ['terminal', 'ipfs-explorer'];
  const datasetsApps = ['datasets-browser'];
  const accelerateApps = ['accelerate-panel'];

  for (const appId of kitApps) {
    const app = apps.get(appId);
    if (!app) continue;
    for (const operation of context.operations.filter(op => op.service_family === 'ipfs_kit_py')) {
      concrete.push(capabilityForApp({
        app,
        capabilityId: `ipfs.kit.tool.${operation.operation}`,
        serviceFamily: 'ipfs_kit_py',
        primary: operation,
        operations: [operation],
        concrete: true,
      }));
    }
  }

  for (const appId of datasetsApps) {
    const app = apps.get(appId);
    if (!app) continue;
    for (const operation of context.operations.filter(op => op.service_family === 'ipfs_datasets_py')) {
      concrete.push(capabilityForApp({
        app,
        capabilityId: `ipfs.datasets.operation.${operation.operation}`,
        serviceFamily: 'ipfs_datasets_py',
        primary: operation,
        operations: [operation],
        concrete: true,
      }));
    }
  }

  for (const appId of accelerateApps) {
    const app = apps.get(appId);
    if (!app) continue;
    for (const operation of context.operations.filter(op => op.service_family === 'ipfs_accelerate_py')) {
      concrete.push(capabilityForApp({
        app,
        capabilityId: `ipfs.accelerate.operation.${operation.operation}`,
        serviceFamily: 'ipfs_accelerate_py',
        primary: operation,
        operations: [operation],
        concrete: true,
      }));
    }
  }

  return concrete;
}

function capabilityForApp(input: {
  app: VirtualDesktopAppManifestEntry;
  capabilityId: string;
  serviceFamily: IPFSAppCapabilityServiceFamily;
  primary: IPFSDescriptorOperationBinding;
  operations: readonly IPFSDescriptorOperationBinding[];
  concrete: boolean;
}): AppCapabilityDefinition {
  const policyClass = input.concrete
    ? input.primary.policy_class
    : policyForManifestCapability(input.capabilityId, input.operations);
  const operations = input.operations.length ? input.operations : [input.primary];

  return {
    capability_id: input.capabilityId,
    app_id: input.app.id,
    service_family: input.serviceFamily,
    descriptor_pack_id: input.primary.descriptor_pack_id,
    mcp_tool_name: input.primary.tool_function,
    mcp_plus_plus_interface: input.primary.mcp_plus_plus_interface,
    execution_modes: EXECUTION_MODES,
    default_execution_mode: 'mock',
    input_schema: input.concrete
      ? clone(input.primary.input_schema)
      : aggregateInputSchema(operations),
    result_schema: input.concrete
      ? clone(input.primary.result_schema)
      : aggregateResultSchema(operations),
    policy_class: policyClass,
    confirmation_policy: confirmationPolicyForClass(policyClass),
    receipt_policy: receiptPolicyForClass(policyClass),
    desktop_result_renderer: desktopRendererHint(input.primary, operations),
    glasses_summary_renderer: glassesSummaryHint(input.app, input.primary, operations),
    fallback_strategy: fallbackStrategy(input.app, input.primary, operations),
  };
}

function operationsForManifestCapability(
  capabilityId: string,
  operations: readonly IPFSDescriptorOperationBinding[],
): IPFSDescriptorOperationBinding[] {
  if (capabilityId === 'ipfs.kit.storage') {
    return operations.filter(op => op.service_family === 'ipfs_kit_py' && [
      'ipfs_tools',
      'pin_tools',
      'car_tools',
      'block_tools',
      'stats_tools',
      'bitswap_tools',
    ].includes(op.category ?? ''));
  }
  if (capabilityId === 'ipfs.kit.vfs') {
    return operations.filter(op => op.service_family === 'ipfs_kit_py' && op.category === 'mfs_tools');
  }
  if (capabilityId === 'ipfs.kit.dag') {
    return operations.filter(op => op.service_family === 'ipfs_kit_py' && op.category === 'dag_tools');
  }
  if (capabilityId === 'ipfs.kit.swarm' || capabilityId === 'ipfs.kit.pubsub') {
    return operations.filter(op => op.service_family === 'ipfs_kit_py' && [
      'swarm_tools',
      'bitswap_tools',
      'cluster_tools',
    ].includes(op.category ?? ''));
  }
  if (capabilityId === 'ipfs.datasets.discovery') {
    return operations.filter(op => op.service_family === 'ipfs_datasets_py' && [
      'browse',
      'get',
      'sync_status',
    ].includes(op.operation));
  }
  if (capabilityId === 'ipfs.datasets.vector') {
    return operations.filter(op => op.service_family === 'ipfs_datasets_py' && [
      'index',
      'pin',
    ].includes(op.operation));
  }
  if (capabilityId === 'ipfs.datasets.provenance') {
    return operations.filter(op => op.service_family === 'ipfs_datasets_py' && [
      'publish',
      'sync_status',
    ].includes(op.operation));
  }
  if (capabilityId === 'ipfs.accelerate.models') {
    return operations.filter(op => op.service_family === 'ipfs_accelerate_py' && [
      'hardware_profile',
      'telemetry',
    ].includes(op.operation));
  }
  if (capabilityId === 'ipfs.accelerate.inference') {
    return operations.filter(op => op.service_family === 'ipfs_accelerate_py' && [
      'run_inference_job',
      'job_status',
    ].includes(op.operation));
  }
  if (capabilityId === 'ipfs.accelerate.jobs') {
    return operations.filter(op => op.service_family === 'ipfs_accelerate_py' && [
      'run_inference_job',
      'job_status',
      'telemetry',
    ].includes(op.operation));
  }
  if (capabilityId === 'ipfs.accelerate.hardware') {
    return operations.filter(op => op.service_family === 'ipfs_accelerate_py' && op.operation === 'hardware_profile');
  }
  if (capabilityId === 'ipfs.accelerate.telemetry') {
    return operations.filter(op => op.service_family === 'ipfs_accelerate_py' && op.operation === 'telemetry');
  }

  const family = serviceFamilyForCapabilityId(capabilityId);
  return family ? operations.filter(op => op.service_family === family) : [];
}

function serviceFamilyForCapabilityId(capabilityId: string): IPFSAppCapabilityServiceFamily | null {
  if (capabilityId.startsWith('ipfs.kit.')) return 'ipfs_kit_py';
  if (capabilityId.startsWith('ipfs.datasets.')) return 'ipfs_datasets_py';
  if (capabilityId.startsWith('ipfs.accelerate.')) return 'ipfs_accelerate_py';
  return null;
}

function fallbackOperationForFamily(
  serviceFamily: IPFSAppCapabilityServiceFamily,
  operations: readonly IPFSDescriptorOperationBinding[],
): IPFSDescriptorOperationBinding | undefined {
  return operations.find(operation => operation.service_family === serviceFamily);
}

function policyForKitBinding(
  toolFunction: string,
  category: string,
  readOnly: boolean,
): AppCapabilityPolicyClass {
  if (toolFunction.includes('_rm') || toolFunction.endsWith('_remove')) return 'destructive';
  if (category === 'swarm_tools' || category === 'bitswap_tools') return 'external_network';
  return readOnly ? 'read' : 'write';
}

function policyForProfileOperation(
  serviceFamily: IPFSAppCapabilityServiceFamily,
  operation: string,
  contract?: MCPUIOperationContract,
): AppCapabilityPolicyClass {
  if (serviceFamily === 'ipfs_accelerate_py' && operation === 'run_inference_job') return 'heavy_compute';
  if (serviceFamily === 'ipfs_datasets_py' && operation === 'index') return 'heavy_compute';
  if (operation.includes('publish') || operation === 'pin') return 'write';
  if (operation.includes('status') || operation.includes('telemetry') || contract?.idempotent) return 'read';
  return 'write';
}

function policyForManifestCapability(
  capabilityId: string,
  operations: readonly IPFSDescriptorOperationBinding[],
): AppCapabilityPolicyClass {
  if (capabilityId.includes('inference') || capabilityId.includes('jobs') || capabilityId.includes('vector')) {
    return 'heavy_compute';
  }
  if (capabilityId.includes('pubsub')) return 'communication';
  if (capabilityId.includes('swarm')) return 'external_network';
  if (operations.some(operation => operation.policy_class === 'destructive')) return 'write';
  if (operations.some(operation => operation.policy_class === 'write' || operation.policy_class === 'heavy_compute')) {
    return operations.some(operation => operation.policy_class === 'heavy_compute') ? 'heavy_compute' : 'write';
  }
  return 'read';
}

function confirmationPolicyForClass(policyClass: AppCapabilityPolicyClass): AppCapabilityConfirmationPolicy {
  if (policyClass === 'credential' || policyClass === 'oauth') return 'desktop_or_mobile_only';
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

function aggregateInputSchema(operations: readonly IPFSDescriptorOperationBinding[]): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: true,
    properties: {
      operation: {
        type: 'string',
        enum: operations.map(operation => operation.operation),
      },
      payload: schemaOneOf(operations.map(operation => operation.input_schema)),
    },
    required: ['operation'],
  };
}

function aggregateResultSchema(operations: readonly IPFSDescriptorOperationBinding[]): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: true,
    properties: {
      operation: {
        type: 'string',
        enum: operations.map(operation => operation.operation),
      },
      result: schemaOneOf(operations.map(operation => operation.result_schema)),
      receipt_refs: { type: 'array', items: { type: 'object' } },
      event_dag_refs: { type: 'array', items: { type: 'object' } },
    },
    required: ['operation'],
  };
}

function schemaOneOf(schemas: readonly Record<string, unknown>[]): Record<string, unknown> {
  const unique = dedupeSchemas(schemas);
  if (unique.length === 0) return { type: 'object' };
  if (unique.length === 1) return clone(unique[0]);
  return { oneOf: unique.map(schema => clone(schema)) };
}

function schemaForPayloadContracts(contracts: readonly string[]): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: true,
    properties: {
      payload_contracts: {
        type: 'array',
        items: { type: 'string' },
        default: contracts,
      },
    },
  };
}

function rendererForOperation(
  ui: GeneratedSchemaDrivenUI,
  operation: string,
): GeneratedRendererKind {
  return ui.result_renderers.find(renderer => renderer.operation === operation)?.kind ?? 'object';
}

function desktopRendererHint(
  primary: IPFSDescriptorOperationBinding,
  operations: readonly IPFSDescriptorOperationBinding[],
): string {
  const streamKinds = Array.from(new Set(operations.map(operation => operation.stream_kind).filter(Boolean)));
  return [
    'schema-ui',
    primary.template_kind,
    primary.renderer_kind,
    streamKinds.length ? `streams:${streamKinds.join('+')}` : 'streams:none',
  ].join(':');
}

function glassesSummaryHint(
  app: VirtualDesktopAppManifestEntry,
  primary: IPFSDescriptorOperationBinding,
  operations: readonly IPFSDescriptorOperationBinding[],
): string {
  const operationNames = operations.map(operation => operation.operation).slice(0, 4).join(',');
  return [
    'glasses-summary',
    app.glasses_strategy.profile_id ?? app.glasses_strategy.kind,
    primary.service_family,
    operationNames,
  ].filter(Boolean).join(':');
}

function fallbackStrategy(
  app: VirtualDesktopAppManifestEntry,
  primary: IPFSDescriptorOperationBinding,
  operations: readonly IPFSDescriptorOperationBinding[],
): string {
  const fallbacks = app.glasses_strategy.fallback?.join('>') ?? app.glasses_strategy.handoff;
  const backend = operations.length > 1
    ? `${operations.length}-descriptor-operations`
    : primary.tool_function;
  return `mock-envelope>descriptor-preview>${backend}>${fallbacks}`;
}

function buildCapabilityMatrix(
  capabilities: readonly AppCapabilityDefinition[],
  manifest: VirtualDesktopAppManifest,
): IPFSAppCapabilityMatrixRow[] {
  const apps = new Map(manifest.apps.map(app => [app.id, app]));

  return capabilities.map(capability => {
    const app = apps.get(capability.app_id);
    return {
      app_id: capability.app_id,
      app_title: app?.title ?? capability.app_id,
      capability_id: capability.capability_id,
      service_family: capability.service_family as IPFSAppCapabilityServiceFamily,
      descriptor_pack_id: capability.descriptor_pack_id ?? '',
      mcp_tool_name: capability.mcp_tool_name,
      mcp_plus_plus_interface: capability.mcp_plus_plus_interface,
      policy_class: capability.policy_class,
      execution_modes: capability.execution_modes,
      default_execution_mode: capability.default_execution_mode,
      desktop_result_renderer: capability.desktop_result_renderer ?? 'default',
      glasses_summary_renderer: capability.glasses_summary_renderer ?? 'default',
      fallback_strategy: capability.fallback_strategy ?? 'mock-envelope',
      input_schema_required: requiredFields(capability.input_schema),
      result_schema_keys: schemaKeys(capability.result_schema),
    };
  });
}

function familySummaries(
  capabilities: readonly AppCapabilityDefinition[],
  operations: readonly IPFSDescriptorOperationBinding[],
): IPFSAppCapabilityFamilySummary[] {
  return ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'].map(serviceFamily => {
    const familyCapabilities = capabilities.filter(capability => capability.service_family === serviceFamily);
    const familyOperations = operations.filter(operation => operation.service_family === serviceFamily);
    return {
      service_family: serviceFamily as IPFSAppCapabilityServiceFamily,
      descriptor_pack_id: familyOperations[0]?.descriptor_pack_id ?? '',
      source_repository: familyOperations[0]?.source_repository ?? '',
      operation_count: familyOperations.length,
      app_count: new Set(familyCapabilities.map(capability => capability.app_id)).size,
      capability_count: familyCapabilities.length,
    };
  });
}

function dedupeCapabilities(
  capabilities: readonly AppCapabilityDefinition[],
): AppCapabilityDefinition[] {
  const byKey = new Map<string, AppCapabilityDefinition>();
  for (const capability of capabilities) {
    byKey.set(`${capability.app_id}::${capability.capability_id}`, cloneCapability(capability));
  }
  return Array.from(byKey.values());
}

function requiredFields(schema: Record<string, unknown> | undefined): string[] {
  return Array.isArray(schema?.required)
    ? schema.required.filter((field): field is string => typeof field === 'string')
    : [];
}

function schemaKeys(schema: Record<string, unknown> | undefined): string[] {
  if (!schema || typeof schema !== 'object') return [];
  const properties = schema.properties;
  return properties && typeof properties === 'object' && !Array.isArray(properties)
    ? Object.keys(properties)
    : Object.keys(schema);
}

function dedupeSchemas(schemas: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const unique: Record<string, unknown>[] = [];
  for (const schema of schemas) {
    const key = JSON.stringify(schema);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(schema);
  }
  return unique;
}

function cloneCapability(capability: AppCapabilityDefinition): AppCapabilityDefinition {
  return clone(capability);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const IPFS_APP_DESCRIPTOR_PACK_IDS: Record<IPFSAppCapabilityServiceFamily, string> = {
  ipfs_kit_py: getIPFSKitDescriptorPack().id,
  ipfs_datasets_py: getIPFSDatasetsDescriptorPack().id,
  ipfs_accelerate_py: getIPFSAccelerateDescriptorPack().id,
};

export const ipfsAppCapabilityRegistry = getIPFSAppCapabilityRegistry();
