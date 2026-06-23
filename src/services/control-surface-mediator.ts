import { computeCID } from './mcp-idl.js';

export const CONTROL_SURFACE_CONTRACT_SCHEMA_REF = 'control_surface_contract';
export const INTERACTION_ENVELOPE_SCHEMA_REF = 'interaction_envelope';
export const POLICY_DECISION_SCHEMA_REF = 'policy_decision';
export const MEDIATION_RECEIPT_SCHEMA_REF = 'mediation_receipt';
export const HALLUCINATE_APP_POLICY_BUNDLE_EVALUATOR = 'hallucinate_app.control_surface_mediator.evaluate_control_surface_interaction';
export const DEFAULT_FAIL_CLOSED_OUTCOME = 'require_confirmation';

export const CONTROL_SURFACE_IDS = ['voice', 'gesture', 'mouse', 'agent'] as const;
export type ControlSurfaceId = (typeof CONTROL_SURFACE_IDS)[number] | string;

export type ControlSurfaceOutcome =
  | 'allow'
  | 'deny'
  | 'require_confirmation'
  | 'defer'
  | 'rewrite'
  | 'fallback_surface'
  | 'rate_limit';

const BLOCKING_CONTROL_SURFACE_OUTCOMES = new Set<ControlSurfaceOutcome>([
  'deny',
  'require_confirmation',
  'defer',
  'rate_limit',
]);
const CONTROL_SURFACE_OUTCOME_SET = new Set<string>([
  'allow',
  'deny',
  'require_confirmation',
  'defer',
  'rewrite',
  'fallback_surface',
  'rate_limit',
]);

export interface ControlSurfacePolicyBundleRef {
  policy_id: string;
  policy_cid: string;
  version?: string;
  scope?: string;
  source?: 'descriptor' | 'operator_profile' | 'runtime_override' | 'remote_client' | 'system_default';
}

export interface ControlSurfaceLogicBinding {
  binding_id: string;
  policy_bundle_ref: ControlSurfacePolicyBundleRef;
  compiled_policy_cid: string;
  ir_version?: string;
  frame_fact_kinds?: Array<'actor' | 'surface' | 'event' | 'method' | 'target' | 'context' | 'device'>;
  surface_refs?: string[];
  method_refs?: string[];
  norm_refs?: string[];
  interaction_envelope_schema_ref?: typeof INTERACTION_ENVELOPE_SCHEMA_REF;
  policy_decision_schema_ref?: typeof POLICY_DECISION_SCHEMA_REF;
  mediation_receipt_schema_ref?: typeof MEDIATION_RECEIPT_SCHEMA_REF;
  mediation_required?: boolean;
}

export interface ControlSurfaceDescriptor {
  id: string;
  kind: string;
  event_types: string[];
  intent_resolver: string;
  confidence_policy?: {
    min_confidence?: number;
    clarify_below?: number;
  };
  logic_bindings: ControlSurfaceLogicBinding[];
}

export interface ControlSurfaceIntentBinding {
  intent: string;
  method: string;
  target_ref?: string;
  allowed_surfaces: string[];
  required_context_facts?: string[];
  logic_bindings: ControlSurfaceLogicBinding[];
}

export interface ControlSurfaceContract {
  version: string;
  control_surfaces: ControlSurfaceDescriptor[];
  intent_bindings: ControlSurfaceIntentBinding[];
  policy_hooks: {
    compile_api: string;
    evaluate_api: string;
    decision_receipt: boolean;
    compiled_artifact_types?: string[];
  };
  context_schema: {
    state_frames?: string[];
    time_context?: boolean;
    location_context?: boolean;
    device_context?: boolean;
    agent_identity?: boolean;
  };
  conflict_resolution: {
    default: 'deny_over_permit' | 'highest_priority' | 'require_confirmation' | 'most_specific_binding';
    requires_explanation?: boolean;
    requires_user_confirmation_for?: string[];
  };
  logic_bindings: ControlSurfaceLogicBinding[];
  mediation_receipts: {
    decision_schema_ref: typeof POLICY_DECISION_SCHEMA_REF;
    receipt_schema_ref: typeof MEDIATION_RECEIPT_SCHEMA_REF;
    emit_for_outcomes: ControlSurfaceOutcome[];
    store?: 'audit_log' | 'operator_profile' | 'session_memory' | 'disabled';
  };
}

export interface ControlSurfaceEnvelopeDescriptor {
  name: string;
  namespace?: string;
  version: string;
  meta?: {
    app_id?: string;
    title?: string;
  };
  methods?: Array<{ name: string }>;
  data_contracts?: {
    operations?: Array<{ method: string }>;
  };
  control_surface_contract?: unknown;
}

export interface ControlSurfaceORBLikeBinding {
  interface_cid: string;
  descriptor: ControlSurfaceEnvelopeDescriptor;
  service: {
    id: string;
  };
  operation: {
    method: string;
  };
}

export interface ControlSurfaceInvocationContext {
  correlation_id?: string;
  caller_did?: string;
  metadata?: Record<string, unknown>;
  control_surface?: Record<string, unknown>;
}

export interface ControlSurfaceMediationRequest {
  binding: ControlSurfaceORBLikeBinding;
  input: unknown;
  context: ControlSurfaceInvocationContext;
}

export interface ControlSurfaceInteractionEnvelope {
  interaction_id: string;
  surface: string;
  surface_event: string;
  raw_payload: Record<string, unknown>;
  normalized_intent: {
    intent: string;
    method: string;
    target_ref: string;
    arguments: Record<string, unknown>;
    confidence: number;
  };
  actor: {
    type: 'user' | 'agent' | 'system' | 'remote_client';
    id: string;
    delegation_chain: string[];
  };
  context: {
    local_time: string;
    state_frames: string[];
    device_mode: string;
    platform: string;
    location_context: Record<string, unknown>;
    device_context: Record<string, unknown>;
  };
  control_surface_contract_ref: string;
  policy_bundle_ref: ControlSurfacePolicyBundleRef;
  compiled_policy_cid: string;
  logic_bindings: Array<{
    binding_id: string;
    policy_bundle_ref: ControlSurfacePolicyBundleRef;
    compiled_policy_cid: string;
    surface_ref?: string;
    method_ref?: string;
    norm_refs?: string[];
  }>;
}

export interface ControlSurfacePolicyDecision {
  decision_id: string;
  interaction_id: string;
  interaction_envelope: ControlSurfaceInteractionEnvelope;
  outcome: ControlSurfaceOutcome;
  policy_bundle_ref: ControlSurfacePolicyBundleRef;
  compiled_policy_cid: string;
  decided_at: string;
  matched_norms: Array<{
    norm_id: string;
    outcome: ControlSurfaceOutcome;
    priority?: number;
    policy_bundle_ref: ControlSurfacePolicyBundleRef;
    logic_clause_refs?: string[];
    guard_refs?: string[];
    explanation?: string;
  }>;
  effects: Array<{
    outcome: ControlSurfaceOutcome;
    method: string;
    target_ref: string;
    arguments: Record<string, unknown>;
    rewrite_method?: string;
    fallback_surface?: string;
    confirmation_required: boolean;
    rate_limit_key?: string;
    reason?: string;
  }>;
  frame_facts: Array<{
    fact_id: string;
    kind: 'actor' | 'surface' | 'event' | 'method' | 'target' | 'context' | 'device';
    subject: string;
    predicate: string;
    value: unknown;
    attrs: Record<string, unknown>;
  }>;
  reasons: string[];
  explanation: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface ControlSurfaceMediationReceipt {
  receipt_id: string;
  emitted_at: string;
  control_surface_contract_ref: string;
  interaction_envelope: ControlSurfaceInteractionEnvelope;
  policy_decision: ControlSurfacePolicyDecision;
  policy_refs: Array<{
    policy_bundle_ref: ControlSurfacePolicyBundleRef;
    compiled_policy_cid: string;
    matched_norm_refs?: string[];
  }>;
  mediation_result: {
    outcome: ControlSurfaceOutcome;
    invoked: boolean;
    final_method: string;
    final_target_ref: string;
    fallback_surface?: string;
    confirmation_required?: boolean;
    rate_limit_key?: string;
  };
  explanation?: string;
  metadata: Record<string, unknown>;
}

export interface ControlSurfaceMediationResult {
  control_surface_contract_ref: string;
  interaction_envelope: ControlSurfaceInteractionEnvelope;
  policy_decision: ControlSurfacePolicyDecision;
  mediation_receipt: ControlSurfaceMediationReceipt;
  can_invoke: boolean;
  invocation_input: unknown;
}

export interface ControlSurfacePolicyEvaluationRequest {
  evaluate_api: string;
  control_surface_contract_ref: string;
  control_surface_contract: ControlSurfaceContract;
  interaction_envelope: ControlSurfaceInteractionEnvelope;
  policy_bundle_ref: ControlSurfacePolicyBundleRef;
  compiled_policy_cid: string;
  logic_bindings: ControlSurfaceInteractionEnvelope['logic_bindings'];
  binding: ControlSurfaceORBLikeBinding;
  input: unknown;
  context: ControlSurfaceInvocationContext;
}

export type ControlSurfacePolicyEvaluator =
  (request: ControlSurfacePolicyEvaluationRequest) => Promise<unknown> | unknown;

export interface ControlSurfaceMediationOptions {
  policy_evaluator?: ControlSurfacePolicyEvaluator;
  fail_closed_outcome?: Extract<ControlSurfaceOutcome, 'deny' | 'require_confirmation'>;
}

const HALLUCINATE_APP_POLICY_EVALUATE_API = 'hallucinate_app.control_surface_mediator.evaluate_control_surface_interaction';
const BLOCKING_CONTROL_SURFACE_OUTCOMES = new Set<ControlSurfaceOutcome>([
  'deny',
  'require_confirmation',
  'defer',
  'rate_limit',
]);

const DEFAULT_SURFACE_EVENTS: Record<string, string> = {
  voice: 'utterance',
  gesture: 'tap',
  mouse: 'click',
  agent: 'autonomous_invoke',
};

const DEFAULT_CONTROL_SURFACES: Array<Omit<ControlSurfaceDescriptor, 'logic_bindings'>> = [
  {
    id: 'voice',
    kind: 'voice_command',
    event_types: ['utterance', 'confirm', 'cancel'],
    intent_resolver: 'nl_policy_compiler',
    confidence_policy: { min_confidence: 0.85, clarify_below: 0.92 },
  },
  {
    id: 'gesture',
    kind: 'captouch_or_wrist',
    event_types: ['tap', 'swipe', 'hold', 'wrist_raise'],
    intent_resolver: 'gesture_mapping_table',
  },
  {
    id: 'mouse',
    kind: 'pointer',
    event_types: ['click', 'double_click', 'hover', 'focus'],
    intent_resolver: 'pointer_mapping_table',
  },
  {
    id: 'agent',
    kind: 'ai_agent',
    event_types: ['proposal', 'autonomous_invoke', 'scheduled_action'],
    intent_resolver: 'structured_agent_intent',
  },
];

export function createDefaultControlSurfaceContract(
  descriptor: ControlSurfaceEnvelopeDescriptor,
): ControlSurfaceContract {
  const appId = descriptor.meta?.app_id ?? descriptor.name;
  const methodNames = descriptorMethods(descriptor);
  const rootBinding = createLogicBinding(appId, {
    binding_id: `${appId}.control_surface_contract.default`,
    surface_refs: [...CONTROL_SURFACE_IDS],
    method_refs: methodNames,
  });

  return {
    version: '0.1.0',
    control_surfaces: DEFAULT_CONTROL_SURFACES.map(surface => ({
      ...surface,
      logic_bindings: [
        createLogicBinding(appId, {
          binding_id: `${appId}.surface.${surface.id}`,
          surface_refs: [surface.id],
          method_refs: methodNames,
        }),
      ],
    })),
    intent_bindings: methodNames.map(method => ({
      intent: `${appId}.${method}`,
      method,
      target_ref: `${descriptor.name}.${method}`,
      allowed_surfaces: [...CONTROL_SURFACE_IDS],
      logic_bindings: [
        createLogicBinding(appId, {
          binding_id: `${appId}.intent.${method}`,
          surface_refs: [...CONTROL_SURFACE_IDS],
          method_refs: [method],
        }),
      ],
    })),
    policy_hooks: {
      compile_api: 'hallucinate_app.control_surface_policy.compile_control_surface_policy_rule',
      evaluate_api: HALLUCINATE_APP_POLICY_EVALUATE_API,
      decision_receipt: true,
      compiled_artifact_types: ['frame_logic', 'event_calculus', 'deontic_policy', 'ucan', 'explanation', 'source_text'],
    },
    context_schema: {
      state_frames: ['sleeping', 'driving', 'meeting', 'screen_locked'],
      time_context: true,
      location_context: true,
      device_context: true,
      agent_identity: true,
    },
    conflict_resolution: {
      default: 'deny_over_permit',
      requires_explanation: true,
      requires_user_confirmation_for: ['destructive', 'financial', 'communication.send'],
    },
    logic_bindings: [rootBinding],
    mediation_receipts: {
      decision_schema_ref: POLICY_DECISION_SCHEMA_REF,
      receipt_schema_ref: MEDIATION_RECEIPT_SCHEMA_REF,
      emit_for_outcomes: ['allow', 'deny', 'require_confirmation', 'defer', 'rewrite', 'fallback_surface', 'rate_limit'],
      store: 'audit_log',
    },
  };
}

export function ensureControlSurfaceContract<T extends ControlSurfaceEnvelopeDescriptor>(descriptor: T): T {
  if (isControlSurfaceContract(descriptor.control_surface_contract)) {
    return descriptor;
  }
  return {
    ...descriptor,
    control_surface_contract: createDefaultControlSurfaceContract(descriptor),
  };
}

export async function control_surface_mediator(
  request: ControlSurfaceMediationRequest,
  options: ControlSurfaceMediationOptions = {},
): Promise<ControlSurfaceMediationResult> {
  const descriptor = ensureControlSurfaceContract(request.binding.descriptor);
  const contract = descriptor.control_surface_contract as ControlSurfaceContract;
  const method = request.binding.operation.method;
  const surfaceContext = resolveSurfaceContext(request.context, request.input);
  const surface = contract.control_surfaces.find(candidate => candidate.id === surfaceContext.surface);
  const intentBinding = contract.intent_bindings.find(candidate => candidate.method === method);
  const selectedLogicBindings = selectedLogicBindingsFor(contract, surface, intentBinding, surfaceContext.surface, method);
  const policyBundleRef = selectedLogicBindings[0]?.policy_bundle_ref ?? defaultPolicyBundleRef(descriptor.meta?.app_id ?? descriptor.name);
  const compiledPolicyCid = selectedLogicBindings[0]?.compiled_policy_cid ?? defaultCompiledPolicyCid(descriptor.meta?.app_id ?? descriptor.name);
  const controlSurfaceContractRef = `${request.binding.interface_cid}#${CONTROL_SURFACE_CONTRACT_SCHEMA_REF}`;
  const args = objectPayload(request.input);
  const targetRef = intentBinding?.target_ref ?? `${descriptor.name}.${method}`;
  const reasons = controlSurfaceDenialReasons(contract, surface, intentBinding, surfaceContext.surface, surfaceContext.surface_event, method);
  const now = new Date().toISOString();
  const interactionEnvelope: ControlSurfaceInteractionEnvelope = {
    interaction_id: surfaceContext.interaction_id
      ?? request.context.correlation_id
      ?? computeCID(stableStringify({ method, input: request.input, now })),
    surface: surfaceContext.surface,
    surface_event: surfaceContext.surface_event,
    raw_payload: args,
    normalized_intent: {
      intent: surfaceContext.intent ?? intentBinding?.intent ?? `${descriptor.meta?.app_id ?? descriptor.name}.${method}`,
      method,
      target_ref: targetRef,
      arguments: args,
      confidence: surfaceContext.confidence,
    },
    actor: surfaceContext.actor,
    context: surfaceContext.runtime_context,
    control_surface_contract_ref: controlSurfaceContractRef,
    policy_bundle_ref: policyBundleRef,
    compiled_policy_cid: compiledPolicyCid,
    logic_bindings: selectedLogicBindings.map(binding => ({
      binding_id: binding.binding_id,
      policy_bundle_ref: binding.policy_bundle_ref,
      compiled_policy_cid: binding.compiled_policy_cid,
      surface_ref: surfaceContext.surface,
      method_ref: method,
      norm_refs: binding.norm_refs ?? [],
    })),
  };

  const evaluateApi = contract.policy_hooks.evaluate_api || HALLUCINATE_APP_POLICY_EVALUATE_API;
  const policyDecision = reasons.length > 0
    ? descriptorDenyPolicyDecision({
      interactionEnvelope,
      policyBundleRef,
      compiledPolicyCid,
      reasons,
      now,
      method,
      targetRef,
      args,
      selectedLogicBindings,
      contract,
    })
    : await evaluateRuntimeControlSurfacePolicy({
      request,
      contract,
      interactionEnvelope,
      policyBundleRef,
      compiledPolicyCid,
      selectedLogicBindings,
      evaluateApi,
      method,
      targetRef,
      args,
      now,
      failClosedOutcome: options.fail_closed_outcome ?? 'deny',
      policyEvaluator: options.policy_evaluator,
    });
  const canInvoke = !BLOCKING_CONTROL_SURFACE_OUTCOMES.has(policyDecision.outcome);
  const invocationInput = policyDecision.outcome === 'rewrite'
    ? policyDecision.effects[0]?.arguments ?? request.input
    : request.input;
  const mediationReceipt: ControlSurfaceMediationReceipt = {
    receipt_id: computeCID(stableStringify({
      interaction_id: policyDecision.interaction_id,
      decision_id: policyDecision.decision_id,
      control_surface_contract_ref: controlSurfaceContractRef,
    })),
    emitted_at: emittedAt,
    control_surface_contract_ref: controlSurfaceContractRef,
    interaction_envelope: policyDecision.interaction_envelope,
    policy_decision: policyDecision,
    policy_refs: [{
      policy_bundle_ref: policyDecision.policy_bundle_ref,
      compiled_policy_cid: policyDecision.compiled_policy_cid,
      matched_norm_refs: policyDecision.matched_norms.map(norm => norm.norm_id),
    }],
    mediation_result: {
      outcome: policyDecision.outcome,
      invoked: canInvoke,
      final_method: policyDecision.effects[0]?.rewrite_method ?? policyDecision.effects[0]?.method ?? method,
      final_target_ref: policyDecision.effects[0]?.target_ref ?? targetRef,
      fallback_surface: policyDecision.effects[0]?.fallback_surface,
      confirmation_required: policyDecision.outcome === 'require_confirmation',
      rate_limit_key: policyDecision.effects[0]?.rate_limit_key,
    },
    explanation: policyDecision.explanation,
    metadata: {
      source,
      service_id: request.binding.service.id,
      descriptor_name: descriptor.name,
      evaluate_api: evaluateApi,
      policy_evaluator_registered: typeof options.policy_evaluator === 'function',
      schema_refs: [
        CONTROL_SURFACE_CONTRACT_SCHEMA_REF,
        INTERACTION_ENVELOPE_SCHEMA_REF,
        POLICY_DECISION_SCHEMA_REF,
        MEDIATION_RECEIPT_SCHEMA_REF,
      ],
    },
  };
}

  return {
    control_surface_contract_ref: controlSurfaceContractRef,
    interaction_envelope: interactionEnvelope,
    policy_decision: policyDecision,
    mediation_receipt: mediationReceipt,
    can_invoke: canInvoke,
    invocation_input: invocationInput,
  };
}

function descriptorDenyPolicyDecision(options: {
  interactionEnvelope: ControlSurfaceInteractionEnvelope;
  policyBundleRef: ControlSurfacePolicyBundleRef;
  compiledPolicyCid: string;
  reasons: string[];
  now: string;
  method: string;
  targetRef: string;
  args: Record<string, unknown>;
  selectedLogicBindings: ControlSurfaceLogicBinding[];
  contract: ControlSurfaceContract;
}): ControlSurfacePolicyDecision {
  const explanation = options.reasons.join('; ');
  return {
    decision_id: computeCID(stableStringify({
      interaction_id: options.interactionEnvelope.interaction_id,
      outcome: 'deny',
      reasons: options.reasons,
      compiled_policy_cid: options.compiledPolicyCid,
    })),
    interaction_id: options.interactionEnvelope.interaction_id,
    interaction_envelope: options.interactionEnvelope,
    outcome: 'deny',
    policy_bundle_ref: options.policyBundleRef,
    compiled_policy_cid: options.compiledPolicyCid,
    decided_at: options.now,
    matched_norms: [{
      norm_id: 'descriptor_control_surface_binding',
      outcome: 'deny',
      priority: 700,
      policy_bundle_ref: options.policyBundleRef,
      logic_clause_refs: options.selectedLogicBindings.map(binding => binding.binding_id),
      guard_refs: [],
      explanation,
    }],
    effects: [defaultEffect('deny', options.method, options.targetRef, options.args, explanation)],
    frame_facts: frameFacts(options.interactionEnvelope),
    reasons: options.reasons,
    explanation,
    confidence: options.interactionEnvelope.normalized_intent.confidence,
    metadata: {
      control_surface_mediator: 'swissknife.control_surface_mediator',
      policy_hooks: options.contract.policy_hooks,
      descriptor_gate: 'deny',
    },
  };
}

async function evaluateRuntimeControlSurfacePolicy(options: {
  request: ControlSurfaceMediationRequest;
  contract: ControlSurfaceContract;
  interactionEnvelope: ControlSurfaceInteractionEnvelope;
  policyBundleRef: ControlSurfacePolicyBundleRef;
  compiledPolicyCid: string;
  selectedLogicBindings: ControlSurfaceLogicBinding[];
  evaluateApi: string;
  method: string;
  targetRef: string;
  args: Record<string, unknown>;
  now: string;
  failClosedOutcome: Extract<ControlSurfaceOutcome, 'deny' | 'require_confirmation'>;
  policyEvaluator?: ControlSurfacePolicyEvaluator;
}): Promise<ControlSurfacePolicyDecision> {
  if (typeof options.policyEvaluator !== 'function') {
    return failClosedPolicyDecision({
      ...options,
      reason: 'control_surface_mediator fail_closed: no Hallucinate App policy bundle evaluator is registered.',
      error: undefined,
    });
  }

  const evaluationRequest: ControlSurfacePolicyEvaluationRequest = {
    evaluate_api: options.evaluateApi,
    control_surface_contract_ref: options.interactionEnvelope.control_surface_contract_ref,
    control_surface_contract: options.contract,
    interaction_envelope: options.interactionEnvelope,
    policy_bundle_ref: options.policyBundleRef,
    compiled_policy_cid: options.compiledPolicyCid,
    logic_bindings: options.interactionEnvelope.logic_bindings,
    binding: options.request.binding,
    input: options.request.input,
    context: options.request.context,
  };

  try {
    const rawDecision = await options.policyEvaluator(evaluationRequest);
    const normalized = normalizeRuntimePolicyDecision(rawDecision, options);
    if (normalized) {
      return normalized;
    }
    return failClosedPolicyDecision({
      ...options,
      reason: 'control_surface_mediator fail_closed: Hallucinate App policy bundle evaluator returned no usable policy_decision.',
      error: undefined,
    });
  } catch (error) {
    return failClosedPolicyDecision({
      ...options,
      reason: `control_surface_mediator fail_closed: Hallucinate App policy bundle evaluator failed: ${errorMessage(error)}.`,
      error: errorMessage(error),
    });
  }
}

function normalizeRuntimePolicyDecision(
  rawDecision: unknown,
  defaults: {
    contract: ControlSurfaceContract;
    interactionEnvelope: ControlSurfaceInteractionEnvelope;
    policyBundleRef: ControlSurfacePolicyBundleRef;
    compiledPolicyCid: string;
    selectedLogicBindings: ControlSurfaceLogicBinding[];
    evaluateApi: string;
    method: string;
    targetRef: string;
    args: Record<string, unknown>;
    now: string;
  },
): ControlSurfacePolicyDecision | undefined {
  const payload = isRecord(rawDecision) && isRecord(rawDecision.policy_decision)
    ? rawDecision.policy_decision
    : rawDecision;
  if (!isRecord(payload)) {
    return undefined;
  }

  const outcome = controlSurfaceOutcomeFrom(payload.outcome ?? payload.result ?? payload.effect);
  if (!outcome) {
    return undefined;
  }

  const reasons = arrayOfStrings(payload.reasons);
  const explanation = stringFrom(payload.explanation)
    ?? (reasons.length > 0 ? reasons.join('; ') : `Hallucinate App policy bundle evaluator returned ${outcome}.`);
  const policyBundleRef = policyBundleRefFrom(payload.policy_bundle_ref) ?? defaults.policyBundleRef;
  const compiledPolicyCid = stringFrom(payload.compiled_policy_cid) ?? defaults.compiledPolicyCid;
  const effects = effectsFrom(payload.effects, outcome, defaults.method, defaults.targetRef, defaults.args, explanation);

  return {
    decision_id: stringFrom(payload.decision_id)
      ?? stringFrom(payload.decision_cid)
      ?? computeCID(stableStringify({
        interaction_id: defaults.interactionEnvelope.interaction_id,
        outcome,
        reasons,
        compiled_policy_cid: compiledPolicyCid,
      })),
    interaction_id: stringFrom(payload.interaction_id) ?? defaults.interactionEnvelope.interaction_id,
    interaction_envelope: isRecord(payload.interaction_envelope)
      ? payload.interaction_envelope as unknown as ControlSurfaceInteractionEnvelope
      : defaults.interactionEnvelope,
    outcome,
    policy_bundle_ref: policyBundleRef,
    compiled_policy_cid: compiledPolicyCid,
    decided_at: stringFrom(payload.decided_at) ?? defaults.now,
    matched_norms: Array.isArray(payload.matched_norms)
      ? payload.matched_norms as ControlSurfacePolicyDecision['matched_norms']
      : [],
    effects,
    frame_facts: Array.isArray(payload.frame_facts)
      ? payload.frame_facts as ControlSurfacePolicyDecision['frame_facts']
      : frameFacts(defaults.interactionEnvelope),
    reasons: reasons.length > 0 ? reasons : [`Hallucinate App policy bundle evaluator returned ${outcome}.`],
    explanation,
    confidence: numberFrom(payload.confidence) ?? defaults.interactionEnvelope.normalized_intent.confidence,
    metadata: {
      control_surface_mediator: 'swissknife.control_surface_mediator',
      evaluate_api: defaults.evaluateApi,
      policy_hooks: defaults.contract.policy_hooks,
      policy_evaluator_registered: true,
      ...objectPayload(payload.metadata),
    },
  };
}

function failClosedPolicyDecision(options: {
  contract: ControlSurfaceContract;
  interactionEnvelope: ControlSurfaceInteractionEnvelope;
  policyBundleRef: ControlSurfacePolicyBundleRef;
  compiledPolicyCid: string;
  selectedLogicBindings: ControlSurfaceLogicBinding[];
  evaluateApi: string;
  method: string;
  targetRef: string;
  args: Record<string, unknown>;
  now: string;
  failClosedOutcome: Extract<ControlSurfaceOutcome, 'deny' | 'require_confirmation'>;
  reason: string;
  error?: string;
}): ControlSurfacePolicyDecision {
  return {
    decision_id: computeCID(stableStringify({
      interaction_id: options.interactionEnvelope.interaction_id,
      outcome: options.failClosedOutcome,
      reason: options.reason,
      compiled_policy_cid: options.compiledPolicyCid,
    })),
    interaction_id: options.interactionEnvelope.interaction_id,
    interaction_envelope: options.interactionEnvelope,
    outcome: options.failClosedOutcome,
    policy_bundle_ref: options.policyBundleRef,
    compiled_policy_cid: options.compiledPolicyCid,
    decided_at: options.now,
    matched_norms: [],
    effects: [defaultEffect(options.failClosedOutcome, options.method, options.targetRef, options.args, options.reason)],
    frame_facts: frameFacts(options.interactionEnvelope),
    reasons: [options.reason],
    explanation: options.reason,
    confidence: options.interactionEnvelope.normalized_intent.confidence,
    metadata: {
      control_surface_mediator: 'swissknife.control_surface_mediator',
      evaluate_api: options.evaluateApi,
      policy_hooks: options.contract.policy_hooks,
      policy_evaluator_registered: false,
      fail_closed: true,
      evaluator_error: options.error ?? '',
    },
  };
}

function defaultEffect(
  outcome: ControlSurfaceOutcome,
  method: string,
  targetRef: string,
  args: Record<string, unknown>,
  reason: string,
): ControlSurfacePolicyDecision['effects'][number] {
  return {
    outcome,
    method,
    target_ref: targetRef,
    arguments: args,
    confirmation_required: outcome === 'require_confirmation',
    reason,
  };
}

function createLogicBinding(
  appId: string,
  options: {
    binding_id: string;
    surface_refs: string[];
    method_refs: string[];
  },
): ControlSurfaceLogicBinding {
  const policy_bundle_ref = defaultPolicyBundleRef(appId);
  return {
    binding_id: options.binding_id,
    policy_bundle_ref,
    compiled_policy_cid: defaultCompiledPolicyCid(appId),
    ir_version: '0.1.0',
    frame_fact_kinds: ['actor', 'surface', 'event', 'method', 'target', 'context', 'device'],
    surface_refs: options.surface_refs,
    method_refs: options.method_refs,
    norm_refs: [`${options.binding_id}.allow_by_default`],
    interaction_envelope_schema_ref: INTERACTION_ENVELOPE_SCHEMA_REF,
    policy_decision_schema_ref: POLICY_DECISION_SCHEMA_REF,
    mediation_receipt_schema_ref: MEDIATION_RECEIPT_SCHEMA_REF,
    mediation_required: true,
  };
}

function defaultPolicyBundleRef(appId: string): ControlSurfacePolicyBundleRef {
  return {
    policy_id: `policy:${appId}:control-surface-default`,
    policy_cid: `local:${appId}:control-surface-default`,
    version: '0.1.0',
    scope: 'descriptor',
    source: 'descriptor',
  };
}

function defaultCompiledPolicyCid(appId: string): string {
  return `local:${appId}:compiled-control-surface-default`;
}

function descriptorMethods(descriptor: ControlSurfaceEnvelopeDescriptor): string[] {
  const methods = descriptor.data_contracts?.operations
    ?.map(operation => operation.method)
    .filter(isNonEmptyString);
  if (methods?.length) {
    return methods;
  }
  return (descriptor.methods ?? [])
    .map(method => method.name)
    .filter(isNonEmptyString);
}

function selectedLogicBindingsFor(
  contract: ControlSurfaceContract,
  surface: ControlSurfaceDescriptor | undefined,
  intentBinding: ControlSurfaceIntentBinding | undefined,
  surfaceId: string,
  method: string,
): ControlSurfaceLogicBinding[] {
  return [
    ...contract.logic_bindings,
    ...(surface?.logic_bindings ?? []),
    ...(intentBinding?.logic_bindings ?? []),
  ].filter(binding => {
    const surfaceMatch = !binding.surface_refs?.length || binding.surface_refs.includes(surfaceId);
    const methodMatch = !binding.method_refs?.length || binding.method_refs.includes(method);
    return surfaceMatch && methodMatch;
  });
}

function controlSurfaceDenialReasons(
  contract: ControlSurfaceContract,
  surface: ControlSurfaceDescriptor | undefined,
  intentBinding: ControlSurfaceIntentBinding | undefined,
  surfaceId: string,
  surfaceEvent: string,
  method: string,
): string[] {
  const reasons: string[] = [];
  if (!surface) {
    reasons.push(`Surface ${surfaceId} is not declared in control_surface_contract.`);
  } else if (!surface.event_types.includes(surfaceEvent)) {
    reasons.push(`Surface event ${surfaceEvent} is not allowed for ${surfaceId}.`);
  }
  if (!intentBinding) {
    reasons.push(`Method ${method} has no control_surface_contract intent binding.`);
  } else if (!intentBinding.allowed_surfaces.includes(surfaceId)) {
    reasons.push(`Surface ${surfaceId} is not allowed to invoke ${method}.`);
  }
  if (contract.mediation_receipts.store === 'disabled') {
    reasons.push('control_surface_contract disables mediation_receipt emission.');
  }
  return reasons;
}

function rawPolicyDecision(value: unknown): Record<string, unknown> {
  const payload = objectPayload(value);
  const nested = objectPayload(payload.policy_decision);
  return Object.keys(nested).length > 0 ? nested : payload;
}

function hasPolicyOutcome(value: unknown): boolean {
  const raw = rawPolicyDecision(value);
  return Boolean(stringFrom(raw.outcome) ?? stringFrom(raw.result) ?? stringFrom(raw.effect));
}

function normalizeControlSurfaceOutcome(value: unknown): ControlSurfaceOutcome {
  const rawOutcome = stringFrom(value)?.toLowerCase();
  if (rawOutcome === 'permit' || rawOutcome === 'permitted') {
    return 'allow';
  }
  if (rawOutcome === 'block' || rawOutcome === 'blocked') {
    return 'deny';
  }
  return CONTROL_SURFACE_OUTCOME_SET.has(rawOutcome ?? '')
    ? rawOutcome as ControlSurfaceOutcome
    : DEFAULT_FAIL_CLOSED_OUTCOME;
}

function blockingControlSurfaceOutcome(value: unknown): ControlSurfaceOutcome {
  const outcome = normalizeControlSurfaceOutcome(value);
  return BLOCKING_CONTROL_SURFACE_OUTCOMES.has(outcome) ? outcome : DEFAULT_FAIL_CLOSED_OUTCOME;
}

function defaultDecisionReason(outcome: ControlSurfaceOutcome): string {
  if (outcome === 'allow') {
    return `Hallucinate App policy bundle evaluator ${HALLUCINATE_APP_POLICY_BUNDLE_EVALUATOR} allowed invocation.`;
  }
  return `control_surface_mediator fail_closed: ${HALLUCINATE_APP_POLICY_BUNDLE_EVALUATOR} must allow descriptor-built envelopes before transport invocation.`;
}

function policyBundleRefFrom(value: unknown, fallback: ControlSurfacePolicyBundleRef): ControlSurfacePolicyBundleRef {
  const candidate = objectPayload(value);
  return {
    policy_id: stringFrom(candidate.policy_id) ?? fallback.policy_id,
    policy_cid: stringFrom(candidate.policy_cid) ?? fallback.policy_cid,
    version: stringFrom(candidate.version) ?? fallback.version,
    scope: stringFrom(candidate.scope) ?? fallback.scope,
    source: policySourceFrom(candidate.source) ?? fallback.source,
  };
}

function policySourceFrom(value: unknown): ControlSurfacePolicyBundleRef['source'] | undefined {
  return value === 'descriptor'
    || value === 'operator_profile'
    || value === 'runtime_override'
    || value === 'remote_client'
    || value === 'system_default'
    ? value
    : undefined;
}

function normalizedMatchedNorms(
  value: unknown,
  outcome: ControlSurfaceOutcome,
  policyBundleRef: ControlSurfacePolicyBundleRef,
  defaults: RuntimeDecisionDefaults,
  explanation: string,
): ControlSurfacePolicyDecision['matched_norms'] {
  const rawNorms = Array.isArray(value) ? value.filter(isRecord) : [];
  if (rawNorms.length === 0) {
    return outcome === 'allow' ? [] : [{
      norm_id: 'runtime_policy_decision',
      outcome,
      priority: 800,
      policy_bundle_ref: policyBundleRef,
      logic_clause_refs: defaults.selectedLogicBindings.map(binding => binding.binding_id),
      guard_refs: [],
      explanation,
    }];
  }
  return rawNorms.map(norm => ({
    norm_id: stringFrom(norm.norm_id) ?? 'runtime_policy_decision',
    outcome: normalizeControlSurfaceOutcome(norm.outcome ?? outcome),
    priority: numberValue(norm.priority),
    policy_bundle_ref: policyBundleRefFrom(norm.policy_bundle_ref, policyBundleRef),
    logic_clause_refs: arrayOfStrings(norm.logic_clause_refs),
    guard_refs: arrayOfStrings(norm.guard_refs),
    explanation: stringFrom(norm.explanation) ?? explanation,
  }));
}

function normalizedEffects(
  value: unknown,
  outcome: ControlSurfaceOutcome,
  defaults: RuntimeDecisionDefaults,
  explanation: string,
): ControlSurfacePolicyDecision['effects'] {
  const rawEffects = Array.isArray(value) ? value.filter(isRecord) : [];
  const sources = rawEffects.length > 0 ? rawEffects : [{
    outcome,
    method: defaults.method,
    target_ref: defaults.targetRef,
    arguments: defaults.args,
    confirmation_required: outcome === 'require_confirmation',
    reason: explanation,
  }];
  return sources.map(effect => {
    const effectOutcome = normalizeControlSurfaceOutcome(effect.outcome ?? outcome);
    const effectArguments = objectPayload(effect.arguments);
    return {
      outcome: effectOutcome,
      method: stringFrom(effect.method) ?? defaults.method,
      target_ref: stringFrom(effect.target_ref) ?? defaults.targetRef,
      arguments: Object.keys(effectArguments).length > 0 ? effectArguments : defaults.args,
      rewrite_method: stringFrom(effect.rewrite_method),
      fallback_surface: stringFrom(effect.fallback_surface),
      confirmation_required: effect.confirmation_required === true || effectOutcome === 'require_confirmation',
      rate_limit_key: stringFrom(effect.rate_limit_key),
      reason: stringFrom(effect.reason) ?? explanation,
    };
  });
}

function normalizedFrameFacts(
  value: unknown,
  interactionEnvelope: ControlSurfaceInteractionEnvelope,
): ControlSurfacePolicyDecision['frame_facts'] {
  const rawFacts = Array.isArray(value) ? value.filter(isRecord) : [];
  if (rawFacts.length === 0) {
    return frameFacts(interactionEnvelope);
  }
  return rawFacts.map(fact => ({
    fact_id: stringFrom(fact.fact_id) ?? computeCID(stableStringify(fact)),
    kind: frameFactKindFrom(fact.kind) ?? 'context',
    subject: stringFrom(fact.subject) ?? interactionEnvelope.interaction_id,
    predicate: stringFrom(fact.predicate) ?? 'runtime_policy_fact',
    value: fact.value,
    attrs: objectPayload(fact.attrs),
  }));
}

function frameFactKindFrom(value: unknown): ControlSurfacePolicyDecision['frame_facts'][number]['kind'] | undefined {
  return value === 'actor'
    || value === 'surface'
    || value === 'event'
    || value === 'method'
    || value === 'target'
    || value === 'context'
    || value === 'device'
    ? value
    : undefined;
}

function resolveSurfaceContext(
  context: ControlSurfaceInvocationContext,
  input: unknown,
): {
  surface: string;
  surface_event: string;
  interaction_id?: string;
  intent?: string;
  confidence: number;
  actor: ControlSurfaceInteractionEnvelope['actor'];
  runtime_context: ControlSurfaceInteractionEnvelope['context'];
} {
  const metadataSurface = isRecord(context.metadata?.control_surface)
    ? context.metadata.control_surface
    : undefined;
  const inputSurface = isRecord(input) && isRecord(input.control_surface)
    ? input.control_surface
    : undefined;
  const controlSurface = context.control_surface ?? metadataSurface ?? inputSurface ?? {};
  const surface = stringFrom(controlSurface.surface)
    ?? stringFrom(controlSurface.id)
    ?? stringFrom(context.metadata?.surface)
    ?? (stringFrom(controlSurface.actor_type) === 'agent' ? 'agent' : 'agent');
  const surfaceEvent = stringFrom(controlSurface.surface_event)
    ?? stringFrom(controlSurface.event)
    ?? stringFrom(context.metadata?.surface_event)
    ?? DEFAULT_SURFACE_EVENTS[surface]
    ?? 'autonomous_invoke';
  const actorType = actorTypeFrom(controlSurface.actor_type)
    ?? actorTypeFrom(isRecord(controlSurface.actor) ? controlSurface.actor.type : undefined)
    ?? (surface === 'agent' ? 'agent' : 'user');
  const actorId = stringFrom(isRecord(controlSurface.actor) ? controlSurface.actor.id : undefined)
    ?? stringFrom(controlSurface.actor_id)
    ?? context.caller_did
    ?? (actorType === 'agent' ? 'swissknife-agent' : 'local-user');
  const delegationChain = arrayOfStrings(
    isRecord(controlSurface.actor) ? controlSurface.actor.delegation_chain : controlSurface.delegation_chain,
  );
  const runtimeContext = isRecord(controlSurface.context) ? controlSurface.context : {};
  return {
    surface,
    surface_event: surfaceEvent,
    interaction_id: stringFrom(controlSurface.interaction_id),
    intent: stringFrom(controlSurface.intent),
    confidence: numberFrom(controlSurface.confidence) ?? 1,
    actor: {
      type: actorType,
      id: actorId,
      delegation_chain: delegationChain,
    },
    runtime_context: {
      local_time: stringFrom(runtimeContext.local_time) ?? new Date().toISOString(),
      state_frames: arrayOfStrings(runtimeContext.state_frames ?? context.metadata?.state_frames),
      device_mode: stringFrom(runtimeContext.device_mode) ?? stringFrom(context.metadata?.device_mode) ?? 'active',
      platform: stringFrom(runtimeContext.platform) ?? 'swissknife',
      location_context: objectPayload(runtimeContext.location_context),
      device_context: objectPayload(runtimeContext.device_context ?? context.metadata?.device_context),
    },
  };
}

function frameFacts(envelope: ControlSurfaceInteractionEnvelope): ControlSurfacePolicyDecision['frame_facts'] {
  const subject = envelope.interaction_id;
  const base = [
    ['actor', 'actor.type', envelope.actor.type],
    ['surface', 'surface.id', envelope.surface],
    ['event', 'surface_event', envelope.surface_event],
    ['method', 'intent.method', envelope.normalized_intent.method],
    ['target', 'intent.target_ref', envelope.normalized_intent.target_ref],
    ['device', 'device_mode', envelope.context.device_mode],
  ] as const;
  const facts: ControlSurfacePolicyDecision['frame_facts'] = base.map(([kind, predicate, value]) => ({
    fact_id: computeCID(stableStringify({ subject, kind, predicate, value })),
    kind,
    subject,
    predicate,
    value,
    attrs: {},
  }));
  for (const stateFrame of envelope.context.state_frames) {
    facts.push({
      fact_id: computeCID(stableStringify({ subject, kind: 'context', predicate: 'state_frame', value: stateFrame })),
      kind: 'context',
      subject,
      predicate: 'state_frame',
      value: stateFrame,
      attrs: {},
    });
  }
  return facts;
}

function isControlSurfaceContract(value: unknown): value is ControlSurfaceContract {
  return isRecord(value)
    && typeof value.version === 'string'
    && Array.isArray(value.control_surfaces)
    && Array.isArray(value.intent_bindings)
    && isRecord(value.policy_hooks)
    && isRecord(value.conflict_resolution)
    && Array.isArray(value.logic_bindings);
}

function objectPayload(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function policyBundleRefFrom(value: unknown): ControlSurfacePolicyBundleRef | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.policy_id) || !isNonEmptyString(value.policy_cid)) {
    return undefined;
  }
  return {
    policy_id: value.policy_id,
    policy_cid: value.policy_cid,
    version: stringFrom(value.version),
    scope: stringFrom(value.scope),
    source: policyBundleSourceFrom(value.source),
  };
}

function policyBundleSourceFrom(value: unknown): ControlSurfacePolicyBundleRef['source'] | undefined {
  return value === 'descriptor'
    || value === 'operator_profile'
    || value === 'runtime_override'
    || value === 'remote_client'
    || value === 'system_default'
    ? value
    : undefined;
}

function controlSurfaceOutcomeFrom(value: unknown): ControlSurfaceOutcome | undefined {
  const outcome = typeof value === 'string' ? value.toLowerCase() : '';
  if (outcome === 'permit' || outcome === 'permitted') {
    return 'allow';
  }
  if (outcome === 'block' || outcome === 'blocked') {
    return 'deny';
  }
  return outcome === 'allow'
    || outcome === 'deny'
    || outcome === 'require_confirmation'
    || outcome === 'defer'
    || outcome === 'rewrite'
    || outcome === 'fallback_surface'
    || outcome === 'rate_limit'
    ? outcome
    : undefined;
}

function effectsFrom(
  value: unknown,
  outcome: ControlSurfaceOutcome,
  method: string,
  targetRef: string,
  args: Record<string, unknown>,
  explanation: string,
): ControlSurfacePolicyDecision['effects'] {
  if (!Array.isArray(value) || value.length === 0) {
    return [defaultEffect(outcome, method, targetRef, args, explanation)];
  }
  return value.map(effect => {
    if (!isRecord(effect)) {
      return defaultEffect(outcome, method, targetRef, args, explanation);
    }
    const effectOutcome = controlSurfaceOutcomeFrom(effect.outcome) ?? outcome;
    return {
      outcome: effectOutcome,
      method: stringFrom(effect.method) ?? method,
      target_ref: stringFrom(effect.target_ref) ?? targetRef,
      arguments: isRecord(effect.arguments) ? objectPayload(effect.arguments) : args,
      rewrite_method: stringFrom(effect.rewrite_method),
      fallback_surface: stringFrom(effect.fallback_surface),
      confirmation_required: effect.confirmation_required === true || effectOutcome === 'require_confirmation',
      rate_limit_key: stringFrom(effect.rate_limit_key),
      reason: stringFrom(effect.reason) ?? explanation,
    };
  });
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

function actorTypeFrom(value: unknown): 'user' | 'agent' | 'system' | 'remote_client' | undefined {
  return value === 'user' || value === 'agent' || value === 'system' || value === 'remote_client'
    ? value
    : undefined;
}

function numberFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter(key => record[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
