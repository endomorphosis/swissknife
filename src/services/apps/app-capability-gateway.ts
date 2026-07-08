import { computeCID } from '../mcp/mcp-envelope.js';
import type {
  VirtualDesktopAppManifest,
  VirtualDesktopAppManifestEntry,
  VirtualDesktopServiceFamily,
} from './virtual-desktop-app-manifest.js';
import {
  VIRTUAL_DESKTOP_APP_MANIFEST,
} from './virtual-desktop-app-manifest.js';
import {
  buildAppResultEnvelope,
  type AppArtifactRef,
  type AppCapabilityConfirmationPolicy,
  type AppCapabilityExecutionMode,
  type AppCapabilityPolicyClass,
  type AppCapabilityReceiptPolicy,
  type AppEventDagRef,
  type AppReceiptRef,
  type AppResultEnvelope,
  type AppResultPolicyMetadata,
  type AppResultStatus,
  type AppResultTraceMetadata,
} from './app-result-envelope.js';

function createBrowserSafeId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export interface AppCapabilityDefinition {
  capability_id: string;
  app_id: string;
  service_family: VirtualDesktopServiceFamily | 'mcp_plus_plus';
  descriptor_pack_id?: string;
  mcp_tool_name?: string;
  mcp_plus_plus_interface?: string;
  execution_modes: readonly AppCapabilityExecutionMode[];
  default_execution_mode: AppCapabilityExecutionMode;
  input_schema?: Record<string, unknown>;
  result_schema?: Record<string, unknown>;
  policy_class: AppCapabilityPolicyClass;
  confirmation_policy: AppCapabilityConfirmationPolicy;
  receipt_policy: AppCapabilityReceiptPolicy;
  desktop_result_renderer?: string;
  glasses_summary_renderer?: string;
  fallback_strategy?: string;
}

export interface AppCapabilityPolicyDecision {
  decision: 'permit' | 'deny' | 'not_evaluated';
  decision_cid?: string;
  reasons?: string[];
  obligations?: Record<string, unknown>[];
}

export interface AppCapabilityInvocationRequest<TInput = unknown> {
  app_id: string;
  capability_id: string;
  input?: TInput;
  execution_mode?: AppCapabilityExecutionMode;
  correlation_id?: string;
  policy_decision?: AppCapabilityPolicyDecision;
  parent_event_cids?: string[];
  metadata?: Record<string, unknown>;
}

export interface AppCapabilityExecutionRequest<TInput = unknown> {
  app: VirtualDesktopAppManifestEntry;
  capability: AppCapabilityDefinition;
  input: TInput | undefined;
  correlation_id: string;
  execution_mode: AppCapabilityExecutionMode;
  policy: AppResultPolicyMetadata;
  parent_event_cids: string[];
  metadata: Record<string, unknown>;
}

export interface AppCapabilityExecutionResult<TOutput = unknown> {
  status?: Exclude<AppResultStatus, 'denied'>;
  summary?: string;
  output?: TOutput | null;
  artifact_refs?: AppArtifactRef[];
  receipt_refs?: AppReceiptRef[];
  event_dag_refs?: AppEventDagRef[];
  transport?: string;
  warnings?: string[];
}

export interface AppCapabilityTransport {
  readonly mode: AppCapabilityExecutionMode;
  invoke<TInput = unknown, TOutput = unknown>(
    request: AppCapabilityExecutionRequest<TInput>,
  ): Promise<AppCapabilityExecutionResult<TOutput>> | AppCapabilityExecutionResult<TOutput>;
}

export interface AppCapabilityGatewayOptions {
  manifest?: VirtualDesktopAppManifest;
  capabilities?: readonly AppCapabilityDefinition[];
  transports?: readonly AppCapabilityTransport[];
  now?: () => Date;
  idFactory?: () => string;
}

export class AppCapabilityGateway {
  private readonly manifest: VirtualDesktopAppManifest;
  private readonly appById = new Map<string, VirtualDesktopAppManifestEntry>();
  private readonly aliasToId = new Map<string, string>();
  private readonly capabilities = new Map<string, AppCapabilityDefinition>();
  private readonly transports = new Map<AppCapabilityExecutionMode, AppCapabilityTransport>();
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(options: AppCapabilityGatewayOptions = {}) {
    this.manifest = options.manifest ?? VIRTUAL_DESKTOP_APP_MANIFEST;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? createBrowserSafeId;

    for (const app of this.manifest.apps) {
      this.appById.set(app.id, app);
      for (const alias of app.aliases) this.aliasToId.set(alias, app.id);
      for (const capabilityId of app.capabilities) {
        this.registerCapability(defaultCapabilityForApp(app, capabilityId));
      }
    }

    for (const capability of options.capabilities ?? []) {
      this.registerCapability(capability);
    }

    this.registerTransport(new MockAppCapabilityTransport());
    for (const transport of options.transports ?? []) {
      this.registerTransport(transport);
    }
  }

  registerCapability(capability: AppCapabilityDefinition): void {
    this.capabilities.set(capabilityKey(capability.app_id, capability.capability_id), capability);
  }

  registerTransport(transport: AppCapabilityTransport): void {
    this.transports.set(transport.mode, transport);
  }

  listCapabilities(appIdOrAlias?: string): AppCapabilityDefinition[] {
    if (!appIdOrAlias) return Array.from(this.capabilities.values());
    const app = this.resolveApp(appIdOrAlias);
    if (!app) return [];
    return Array.from(this.capabilities.values()).filter(capability => capability.app_id === app.id);
  }

  getCapability(appIdOrAlias: string, capabilityId: string): AppCapabilityDefinition | null {
    const app = this.resolveApp(appIdOrAlias);
    if (!app) return null;
    return this.capabilities.get(capabilityKey(app.id, capabilityId)) ?? null;
  }

  async invoke<TInput = unknown, TOutput = unknown>(
    request: AppCapabilityInvocationRequest<TInput>,
  ): Promise<AppResultEnvelope<TOutput>> {
    const startedAt = this.now();
    const correlationId = request.correlation_id ?? this.idFactory();
    const requestedAppId = request.app_id;
    const app = this.resolveApp(request.app_id);

    if (!app) {
      return this.errorEnvelope<TOutput>({
        startedAt,
        correlationId,
        requestedAppId,
        canonicalAppId: requestedAppId,
        capabilityId: request.capability_id,
        executionMode: request.execution_mode ?? 'mock',
        serviceFamily: 'unknown',
        summary: `Unknown app: ${request.app_id}`,
        code: 'APP_NOT_FOUND',
      });
    }

    const capability = this.getCapability(app.id, request.capability_id);
    if (!capability) {
      return this.errorEnvelope<TOutput>({
        startedAt,
        correlationId,
        requestedAppId,
        canonicalAppId: app.id,
        capabilityId: request.capability_id,
        executionMode: request.execution_mode ?? 'mock',
        serviceFamily: app.service_families[0] ?? 'unknown',
        summary: `Capability ${request.capability_id} is not declared for app ${app.id}`,
        code: 'CAPABILITY_NOT_FOUND',
      });
    }

    const executionMode = request.execution_mode ?? capability.default_execution_mode;
    if (!capability.execution_modes.includes(executionMode)) {
      return this.errorEnvelope<TOutput>({
        startedAt,
        correlationId,
        requestedAppId,
        canonicalAppId: app.id,
        capabilityId: capability.capability_id,
        executionMode,
        serviceFamily: capability.service_family,
        summary: `Execution mode ${executionMode} is not allowed for ${capability.capability_id}`,
        code: 'EXECUTION_MODE_NOT_ALLOWED',
      });
    }

    const policy = policyMetadata(capability, request.policy_decision);
    if (policy.decision === 'deny') {
      const finishedAt = this.now();
      const trace = traceMetadata({
        correlationId,
        requestedAppId,
        canonicalAppId: app.id,
        capability,
        executionMode,
        startedAt,
        finishedAt,
        warnings: [],
      });
      const refs = fallbackRefs(trace, policy, request.parent_event_cids ?? []);
      return buildAppResultEnvelope<TOutput>({
        status: 'denied',
        summary: policy.reasons[0] ?? `Policy denied ${capability.capability_id}`,
        output: null,
        policy,
        trace,
        receipt_refs: refs.receipts,
        event_dag_refs: refs.events,
      });
    }

    const transport = this.transports.get(executionMode);
    if (!transport) {
      return this.errorEnvelope<TOutput>({
        startedAt,
        correlationId,
        requestedAppId,
        canonicalAppId: app.id,
        capabilityId: capability.capability_id,
        executionMode,
        serviceFamily: capability.service_family,
        summary: `No transport registered for execution mode ${executionMode}`,
        code: 'TRANSPORT_NOT_FOUND',
      });
    }

    try {
      const result = await transport.invoke<TInput, TOutput>({
        app,
        capability,
        input: request.input,
        correlation_id: correlationId,
        execution_mode: executionMode,
        policy,
        parent_event_cids: request.parent_event_cids ?? [],
        metadata: request.metadata ?? {},
      });
      const finishedAt = this.now();
      const warnings = result.warnings ?? [];
      const trace = traceMetadata({
        correlationId,
        requestedAppId,
        canonicalAppId: app.id,
        capability,
        executionMode,
        startedAt,
        finishedAt,
        transport: result.transport ?? transport.mode,
        warnings,
      });
      const refs = fallbackRefs(trace, policy, request.parent_event_cids ?? [], result.output);
      return buildAppResultEnvelope<TOutput>({
        status: result.status ?? 'ok',
        summary: result.summary ?? `Invoked ${capability.capability_id}`,
        output: result.output ?? null,
        artifact_refs: result.artifact_refs ?? [],
        receipt_refs: result.receipt_refs ?? refs.receipts,
        event_dag_refs: result.event_dag_refs ?? refs.events,
        policy,
        trace,
      });
    } catch (error) {
      return this.errorEnvelope<TOutput>({
        startedAt,
        correlationId,
        requestedAppId,
        canonicalAppId: app.id,
        capabilityId: capability.capability_id,
        executionMode,
        serviceFamily: capability.service_family,
        summary: error instanceof Error ? error.message : String(error),
        code: 'TRANSPORT_ERROR',
      });
    }
  }

  private resolveApp(appIdOrAlias: string): VirtualDesktopAppManifestEntry | null {
    const canonical = this.appById.has(appIdOrAlias)
      ? appIdOrAlias
      : this.aliasToId.get(appIdOrAlias);
    return canonical ? this.appById.get(canonical) ?? null : null;
  }

  private errorEnvelope<TOutput>(input: {
    startedAt: Date;
    correlationId: string;
    requestedAppId: string;
    canonicalAppId: string;
    capabilityId: string;
    executionMode: AppCapabilityExecutionMode;
    serviceFamily: string;
    summary: string;
    code: string;
  }): AppResultEnvelope<TOutput> {
    const finishedAt = this.now();
    const policy: AppResultPolicyMetadata = {
      policy_class: 'read',
      confirmation_policy: 'none',
      receipt_policy: 'optional',
      decision: 'not_evaluated',
      reasons: [],
    };
    const trace: AppResultTraceMetadata = {
      correlation_id: input.correlationId,
      app_id: input.canonicalAppId,
      requested_app_id: input.requestedAppId,
      capability_id: input.capabilityId,
      execution_mode: input.executionMode,
      service_family: input.serviceFamily,
      started_at: input.startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: Math.max(0, finishedAt.getTime() - input.startedAt.getTime()),
      warnings: [],
    };
    const refs = fallbackRefs(trace, policy, []);
    return buildAppResultEnvelope<TOutput>({
      status: 'error',
      summary: input.summary,
      output: null,
      error: { code: input.code, message: input.summary },
      policy,
      trace,
      receipt_refs: refs.receipts,
      event_dag_refs: refs.events,
    });
  }
}

class MockAppCapabilityTransport implements AppCapabilityTransport {
  readonly mode = 'mock' as const;

  invoke<TInput = unknown, TOutput = unknown>(
    request: AppCapabilityExecutionRequest<TInput>,
  ): AppCapabilityExecutionResult<TOutput> {
    return {
      status: 'degraded',
      summary: `Mock result for ${request.capability.capability_id}`,
      output: {
        app_id: request.app.id,
        capability_id: request.capability.capability_id,
        input: request.input ?? null,
        mocked: true,
      } as TOutput,
      transport: 'mock',
      warnings: ['No live transport was registered; returning mock output.'],
    };
  }
}

function defaultCapabilityForApp(
  app: VirtualDesktopAppManifestEntry,
  capabilityId: string,
): AppCapabilityDefinition {
  const serviceFamily = inferServiceFamily(app, capabilityId);
  const policyClass = inferPolicyClass(capabilityId);
  return {
    capability_id: capabilityId,
    app_id: app.id,
    service_family: serviceFamily,
    descriptor_pack_id: descriptorPackForServiceFamily(serviceFamily),
    mcp_tool_name: capabilityId,
    mcp_plus_plus_interface: capabilityId.startsWith('mcp.') ? capabilityId : undefined,
    execution_modes: ['mock', 'direct_import', 'direct_cli', 'mcp_remote', 'mcp_plus_plus_remote'],
    default_execution_mode: 'mock',
    input_schema: { type: 'object' },
    result_schema: { type: 'object' },
    policy_class: policyClass,
    confirmation_policy: confirmationPolicyForClass(policyClass),
    receipt_policy: receiptPolicyForClass(policyClass),
    desktop_result_renderer: 'default',
    glasses_summary_renderer: app.glasses_strategy.profile_id ?? app.glasses_strategy.kind,
    fallback_strategy: app.glasses_strategy.fallback?.join(',') ?? app.glasses_strategy.handoff,
  };
}

function inferServiceFamily(
  app: VirtualDesktopAppManifestEntry,
  capabilityId: string,
): VirtualDesktopServiceFamily | 'mcp_plus_plus' {
  if (capabilityId.startsWith('ipfs.kit.')) return 'ipfs_kit_py';
  if (capabilityId.startsWith('ipfs.datasets.')) return 'ipfs_datasets_py';
  if (capabilityId.startsWith('ipfs.accelerate.')) return 'ipfs_accelerate_py';
  if (capabilityId.startsWith('mcp.')) return 'mcp_plus_plus';
  if (capabilityId.startsWith('glasses.')) return 'meta_glasses';
  if (capabilityId.startsWith('orb.')) return 'orb';
  return app.service_families[0] ?? 'local';
}

function inferPolicyClass(capabilityId: string): AppCapabilityPolicyClass {
  if (capabilityId.includes('credentials') || capabilityId.includes('oauth')) return 'credential';
  if (capabilityId.includes('external')) return 'external_network';
  if (capabilityId.includes('jobs') || capabilityId.includes('inference')) return 'heavy_compute';
  if (capabilityId.includes('pubsub') || capabilityId.includes('chat')) return 'communication';
  if (capabilityId.includes('storage') || capabilityId.includes('vfs')) return 'write';
  return 'read';
}

function confirmationPolicyForClass(policyClass: AppCapabilityPolicyClass): AppCapabilityConfirmationPolicy {
  if (policyClass === 'credential' || policyClass === 'oauth') return 'desktop_or_mobile_only';
  if (policyClass === 'destructive') return 'confirm_destructive';
  if (policyClass === 'write' || policyClass === 'external_network' || policyClass === 'heavy_compute') return 'confirm';
  return 'none';
}

function receiptPolicyForClass(policyClass: AppCapabilityPolicyClass): AppCapabilityReceiptPolicy {
  if (policyClass === 'read') return 'optional';
  return 'required_for_side_effects';
}

function descriptorPackForServiceFamily(serviceFamily: string): string | undefined {
  if (serviceFamily === 'ipfs_kit_py') return 'ipfs_kit_py.mcp_dashboard.descriptor_pack.v1';
  if (serviceFamily === 'ipfs_datasets_py') return 'ipfs_datasets_py.mcp_dashboard.descriptor_pack.v1';
  if (serviceFamily === 'ipfs_accelerate_py') return 'ipfs_accelerate_py.mcp_dashboard.descriptor_pack.v1';
  if (serviceFamily === 'mcp_plus_plus') return 'mcp-plus-plus.registry.descriptor_pack.v1';
  return undefined;
}

function policyMetadata(
  capability: AppCapabilityDefinition,
  decision?: AppCapabilityPolicyDecision,
): AppResultPolicyMetadata {
  return {
    policy_class: capability.policy_class,
    confirmation_policy: capability.confirmation_policy,
    receipt_policy: capability.receipt_policy,
    decision: decision?.decision ?? 'not_evaluated',
    decision_cid: decision?.decision_cid,
    reasons: decision?.reasons ?? [],
    obligations: decision?.obligations,
  };
}

function traceMetadata(input: {
  correlationId: string;
  requestedAppId: string;
  canonicalAppId: string;
  capability: AppCapabilityDefinition;
  executionMode: AppCapabilityExecutionMode;
  startedAt: Date;
  finishedAt: Date;
  transport?: string;
  warnings: string[];
}): AppResultTraceMetadata {
  return {
    correlation_id: input.correlationId,
    app_id: input.canonicalAppId,
    requested_app_id: input.requestedAppId,
    capability_id: input.capability.capability_id,
    execution_mode: input.executionMode,
    service_family: input.capability.service_family,
    descriptor_pack_id: input.capability.descriptor_pack_id,
    mcp_tool_name: input.capability.mcp_tool_name,
    mcp_plus_plus_interface: input.capability.mcp_plus_plus_interface,
    started_at: input.startedAt.toISOString(),
    finished_at: input.finishedAt.toISOString(),
    duration_ms: Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime()),
    transport: input.transport,
    warnings: input.warnings,
  };
}

function fallbackRefs(
  trace: AppResultTraceMetadata,
  policy: AppResultPolicyMetadata,
  parents: string[],
  output?: unknown,
): { receipts: AppReceiptRef[]; events: AppEventDagRef[] } {
  const receipt_cid = computeCID(JSON.stringify({
    schema: 'swissknife.app-capability-receipt.v1',
    correlation_id: trace.correlation_id,
    app_id: trace.app_id,
    capability_id: trace.capability_id,
    output: output ?? null,
    policy,
  }));
  const event_cid = computeCID(JSON.stringify({
    event_type: 'app_capability_invocation',
    receipt_cid,
    parents,
  }));
  return {
    receipts: [{
      receipt_cid,
      receipt_schema: 'swissknife.app-capability-receipt.v1',
      service_family: trace.service_family,
      capability_id: trace.capability_id,
      decision_cid: policy.decision_cid,
    }],
    events: [{
      event_cid,
      parents,
      event_type: 'app_capability_invocation',
      metadata: {
        correlation_id: trace.correlation_id,
        receipt_cid,
      },
    }],
  };
}

function capabilityKey(appId: string, capabilityId: string): string {
  return `${appId}::${capabilityId}`;
}
