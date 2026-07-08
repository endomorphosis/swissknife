export const APP_RESULT_ENVELOPE_SCHEMA = 'swissknife.app-result-envelope.v1';

export type AppCapabilityExecutionMode =
  | 'mock'
  | 'direct_import'
  | 'direct_cli'
  | 'mcp_remote'
  | 'mcp_plus_plus_remote';

export type AppCapabilityPolicyClass =
  | 'read'
  | 'write'
  | 'destructive'
  | 'credential'
  | 'oauth'
  | 'external_network'
  | 'heavy_compute'
  | 'media_capture'
  | 'communication'
  | 'autonomous_action';

export type AppCapabilityConfirmationPolicy =
  | 'none'
  | 'confirm'
  | 'confirm_destructive'
  | 'desktop_or_mobile_only';

export type AppCapabilityReceiptPolicy =
  | 'none'
  | 'optional'
  | 'required'
  | 'required_for_side_effects';

export type AppResultStatus = 'ok' | 'degraded' | 'denied' | 'error';

export interface AppArtifactRef {
  kind: 'cid' | 'ipfs' | 'file' | 'url' | 'media' | 'dataset' | 'model' | 'job' | 'other';
  uri: string;
  cid?: string;
  media_type?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface AppReceiptRef {
  receipt_cid: string;
  receipt_schema: string;
  service_family?: string;
  capability_id?: string;
  decision_cid?: string;
  metadata?: Record<string, unknown>;
}

export interface AppEventDagRef {
  event_cid: string;
  parents: string[];
  event_type: string;
  metadata?: Record<string, unknown>;
}

export interface AppResultPolicyMetadata {
  policy_class: AppCapabilityPolicyClass;
  confirmation_policy: AppCapabilityConfirmationPolicy;
  receipt_policy: AppCapabilityReceiptPolicy;
  decision: 'permit' | 'deny' | 'not_evaluated';
  decision_cid?: string;
  reasons: string[];
  obligations?: Record<string, unknown>[];
}

export interface AppResultTraceMetadata {
  correlation_id: string;
  app_id: string;
  requested_app_id: string;
  capability_id: string;
  execution_mode: AppCapabilityExecutionMode;
  service_family: string;
  descriptor_pack_id?: string;
  mcp_tool_name?: string;
  mcp_plus_plus_interface?: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  transport?: string;
  warnings: string[];
}

export interface AppResultError {
  code: string;
  message: string;
  details?: unknown;
}

export interface AppResultEnvelope<TOutput = unknown> {
  schema: typeof APP_RESULT_ENVELOPE_SCHEMA;
  status: AppResultStatus;
  summary: string;
  output: TOutput | null;
  error?: AppResultError;
  artifact_refs: AppArtifactRef[];
  receipt_refs: AppReceiptRef[];
  event_dag_refs: AppEventDagRef[];
  policy: AppResultPolicyMetadata;
  trace: AppResultTraceMetadata;
}

export interface BuildAppResultEnvelopeInput<TOutput = unknown> {
  status: AppResultStatus;
  summary: string;
  output?: TOutput | null;
  error?: AppResultError;
  artifact_refs?: AppArtifactRef[];
  receipt_refs?: AppReceiptRef[];
  event_dag_refs?: AppEventDagRef[];
  policy: AppResultPolicyMetadata;
  trace: AppResultTraceMetadata;
}

export function buildAppResultEnvelope<TOutput = unknown>(
  input: BuildAppResultEnvelopeInput<TOutput>,
): AppResultEnvelope<TOutput> {
  return {
    schema: APP_RESULT_ENVELOPE_SCHEMA,
    status: input.status,
    summary: input.summary,
    output: input.output ?? null,
    ...(input.error ? { error: input.error } : {}),
    artifact_refs: input.artifact_refs ?? [],
    receipt_refs: input.receipt_refs ?? [],
    event_dag_refs: input.event_dag_refs ?? [],
    policy: input.policy,
    trace: input.trace,
  };
}
