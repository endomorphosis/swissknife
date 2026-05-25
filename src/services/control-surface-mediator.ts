import { computeCID } from './mcp-idl.js';

export const CONTROL_SURFACE_CONTRACT_SCHEMA_REF = 'control_surface_contract';
export const INTERACTION_ENVELOPE_SCHEMA_REF = 'interaction_envelope';
export const POLICY_DECISION_SCHEMA_REF = 'policy_decision';
export const MEDIATION_RECEIPT_SCHEMA_REF = 'mediation_receipt';
export const HALLUCINATE_POLICY_EVALUATE_API = 'hallucinate_app.control_surface_mediator.evaluate_control_surface_interaction';

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

export const DEFAULT_FAIL_CLOSED_OUTCOME: ControlSurfaceOutcome = 'require_confirmation';

export const BLOCKING_CONTROL_SURFACE_OUTCOMES = new Set<ControlSurfaceOutcome>([
  'deny',
  'require_confirmation',
  'defer',
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
  policy_evaluator?: ControlSurfacePolicyEvaluator;
}

export interface ControlSurfacePolicyEvaluationRequest {
  evaluate_api: typeof HALLUCINATE_POLICY_EVALUATE_API;
  control_surface_contract_ref: string;
  control_surface_contract: ControlSurfaceContract;
  interaction_envelope: ControlSurfaceInteractionEnvelope;
  policy_bundle_ref: ControlSurfacePolicyBundleRef;
  compiled_policy_cid: string;
  binding: ControlSurfaceORBLikeBinding;
  input: unknown;
  context: ControlSurfaceInvocationContext;
  descriptor_reasons: string[];
}

export type ControlSurfacePolicyEvaluator =
  (request: ControlSurfacePolicyEvaluationRequest) =>
    Promise<Partial<ControlSurfacePolicyDecision> | { policy_decision?: Partial<ControlSurfacePolicyDecision> }>
    | Partial<ControlSurfacePolicyDecision>
    | { policy_decision?: Partial<ControlSurfacePolicyDecision> };

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
      evaluate_api: 'hallucinate_app.control_surface_mediator.evaluate_control_surface_interaction',
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
  const descriptorReasons = controlSurfaceDenialReasons(contract, surface, intentBinding, surfaceContext.surface, surfaceContext.surface_event, method);
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

  const policyDecisionContext = {
    request,
    contract,
    interactionEnvelope,
    policyBundleRef,
    compiledPolicyCid,
    controlSurfaceContractRef,
    selectedLogicBindings,
    descriptorReasons,
    method,
    targetRef,
    args,
    now,
    confidence: surfaceContext.confidence,
  };
  const policyDecision = await evaluatePolicyDecision(policyDecisionContext);
  const mediationReceipt = buildControlSurfaceMediationReceipt(policyDecision, {
    request,
    descriptor,
    interactionEnvelope,
    policyBundleRef,
    compiledPolicyCid,
    controlSurfaceContractRef,
    method,
    targetRef,
    now,
  });

  return {
    control_surface_contract_ref: controlSurfaceContractRef,
    interaction_envelope: interactionEnvelope,
    policy_decision: policyDecision,
    mediation_receipt: mediationReceipt,
    can_invoke: canInvokeControlSurfaceOutcome(policyDecision.outcome),
    invocation_input: request.input,
  };
}

interface PolicyDecisionContext {
  request: ControlSurfaceMediationRequest;
  contract: ControlSurfaceContract;
  interactionEnvelope: ControlSurfaceInteractionEnvelope;
  policyBundleRef: ControlSurfacePolicyBundleRef;
  compiledPolicyCid: string;
  controlSurfaceContractRef: string;
  selectedLogicBindings: ControlSurfaceLogicBinding[];
  descriptorReasons: string[];
  method: string;
  targetRef: string;
  args: Record<string, unknown>;
  now: string;
  confidence: number;
}

async function evaluatePolicyDecision(context: PolicyDecisionContext): Promise<ControlSurfacePolicyDecision> {
  if (context.descriptorReasons.length > 0) {
    const explanation = context.descriptorReasons.join('; ');
    return buildPolicyDecision(context, {
      outcome: 'deny',
      reasons: context.descriptorReasons,
      explanation,
      norm_id: 'descriptor_control_surface_binding',
      priority: 700,
      metadata: {
        descriptor_binding_denied: true,
        runtime_policy_evaluator_registered: Boolean(context.request.policy_evaluator),
        fail_closed: true,
      },
    });
  }

  if (!context.request.policy_evaluator) {
    const reason = `No runtime policy evaluator registered for ${HALLUCINATE_POLICY_EVALUATE_API}; fail_closed before ORB transport invocation.`;
    return buildPolicyDecision(context, {
      outcome: DEFAULT_FAIL_CLOSED_OUTCOME,
      reasons: [reason],
      explanation: reason,
      norm_id: 'runtime_policy_evaluator_missing',
      priority: 800,
      metadata: {
        runtime_policy_evaluator_registered: false,
        fail_closed: true,
      },
    });
  }

  try {
    const rawDecision = await context.request.policy_evaluator({
      evaluate_api: HALLUCINATE_POLICY_EVALUATE_API,
      control_surface_contract_ref: context.controlSurfaceContractRef,
      control_surface_contract: context.contract,
      interaction_envelope: context.interactionEnvelope,
      policy_bundle_ref: context.policyBundleRef,
      compiled_policy_cid: context.compiledPolicyCid,
      binding: context.request.binding,
      input: context.request.input,
      context: context.request.context,
      descriptor_reasons: [],
    });
    return normalizeRuntimePolicyDecision(rawDecision, context);
  } catch (error) {
    const reason = `Runtime policy evaluator ${HALLUCINATE_POLICY_EVALUATE_API} failed: ${errorMessage(error)}; fail_closed before ORB transport invocation.`;
    return buildPolicyDecision(context, {
      outcome: 'deny',
      reasons: [reason],
      explanation: reason,
      norm_id: 'runtime_policy_evaluator_error',
      priority: 900,
      metadata: {
        runtime_policy_evaluator_registered: true,
        fail_closed: true,
      },
    });
  }
}

function normalizeRuntimePolicyDecision(
  rawDecision: unknown,
  context: PolicyDecisionContext,
): ControlSurfacePolicyDecision {
  const candidate = isRecord(rawDecision) && isRecord(rawDecision.policy_decision)
    ? rawDecision.policy_decision
    : rawDecision;
  const raw = objectPayload(candidate);
  if (Object.keys(raw).length === 0) {
    const reason = `Runtime policy evaluator ${HALLUCINATE_POLICY_EVALUATE_API} returned no policy_decision; fail_closed before ORB transport invocation.`;
    return buildPolicyDecision(context, {
      outcome: 'deny',
      reasons: [reason],
      explanation: reason,
      norm_id: 'runtime_policy_evaluator_invalid',
      priority: 900,
      metadata: {
        runtime_policy_evaluator_registered: true,
        fail_closed: true,
      },
    });
  }

  const outcome = normalizeControlSurfaceOutcome(raw.outcome);
  if (!outcome) {
    const reason = `Runtime policy evaluator ${HALLUCINATE_POLICY_EVALUATE_API} returned no executable outcome; fail_closed before ORB transport invocation.`;
    return buildPolicyDecision(context, {
      outcome: 'deny',
      reasons: [reason],
      explanation: reason,
      norm_id: 'runtime_policy_evaluator_invalid',
      priority: 900,
      metadata: {
        runtime_policy_evaluator_registered: true,
        fail_closed: true,
      },
    });
  }

  const rawReasons = arrayOfStrings(raw.reasons);
  const reasons = rawReasons.length > 0
    ? rawReasons
    : [`Hallucinate App policy bundle evaluator returned ${outcome} before ORB transport invocation.`];
  const explanation = stringFrom(raw.explanation) ?? reasons.join('; ');
  const policyBundleRef = policyBundleRefFrom(raw.policy_bundle_ref, context.policyBundleRef);
  const compiledPolicyCid = stringFrom(raw.compiled_policy_cid) ?? context.compiledPolicyCid;
  const effects = Array.isArray(raw.effects) && raw.effects.length > 0
    ? raw.effects as ControlSurfacePolicyDecision['effects']
    : [defaultDecisionEffect(context, outcome, explanation)];
  const matchedNorms = Array.isArray(raw.matched_norms)
    ? raw.matched_norms as ControlSurfacePolicyDecision['matched_norms']
    : [];
  const frameFactPayload = Array.isArray(raw.frame_facts) && raw.frame_facts.length > 0
    ? raw.frame_facts as ControlSurfacePolicyDecision['frame_facts']
    : frameFacts(context.interactionEnvelope);
  const metadata = {
    control_surface_mediator: 'swissknife.control_surface_mediator',
    policy_hooks: context.contract.policy_hooks,
    evaluate_api: HALLUCINATE_POLICY_EVALUATE_API,
    runtime_policy_evaluator_registered: true,
    fail_closed: Boolean(isRecord(raw.metadata) ? raw.metadata.fail_closed : false),
    ...objectPayload(raw.metadata),
  };

  return {
    decision_id: stringFrom(raw.decision_id) ?? computeCID(stableStringify({
      interaction_id: context.interactionEnvelope.interaction_id,
      outcome,
      reasons,
      compiled_policy_cid: compiledPolicyCid,
    })),
    interaction_id: context.interactionEnvelope.interaction_id,
    interaction_envelope: context.interactionEnvelope,
    outcome,
    policy_bundle_ref: policyBundleRef,
    compiled_policy_cid: compiledPolicyCid,
    decided_at: stringFrom(raw.decided_at) ?? context.now,
    matched_norms: matchedNorms,
    effects,
    frame_facts: frameFactPayload,
    reasons,
    explanation,
    confidence: numberFrom(raw.confidence) ?? context.confidence,
    metadata,
  };
}

function buildPolicyDecision(
  context: PolicyDecisionContext,
  options: {
    outcome: ControlSurfaceOutcome;
    reasons: string[];
    explanation: string;
    norm_id: string;
    priority: number;
    metadata: Record<string, unknown>;
  },
): ControlSurfacePolicyDecision {
  const effect = defaultDecisionEffect(context, options.outcome, options.explanation);
  return {
    decision_id: computeCID(stableStringify({
      interaction_id: context.interactionEnvelope.interaction_id,
      outcome: options.outcome,
      reasons: options.reasons,
      compiled_policy_cid: context.compiledPolicyCid,
      norm_id: options.norm_id,
    })),
    interaction_id: context.interactionEnvelope.interaction_id,
    interaction_envelope: context.interactionEnvelope,
    outcome: options.outcome,
    policy_bundle_ref: context.policyBundleRef,
    compiled_policy_cid: context.compiledPolicyCid,
    decided_at: context.now,
    matched_norms: options.outcome === 'allow' ? [] : [{
      norm_id: options.norm_id,
      outcome: options.outcome,
      priority: options.priority,
      policy_bundle_ref: context.policyBundleRef,
      logic_clause_refs: context.selectedLogicBindings.map(binding => binding.binding_id),
      guard_refs: [],
      explanation: options.explanation,
    }],
    effects: [effect],
    frame_facts: frameFacts(context.interactionEnvelope),
    reasons: options.reasons,
    explanation: options.explanation,
    confidence: context.confidence,
    metadata: {
      control_surface_mediator: 'swissknife.control_surface_mediator',
      policy_hooks: context.contract.policy_hooks,
      evaluate_api: HALLUCINATE_POLICY_EVALUATE_API,
      ...options.metadata,
    },
  };
}

function defaultDecisionEffect(
  context: PolicyDecisionContext,
  outcome: ControlSurfaceOutcome,
  reason: string,
): ControlSurfacePolicyDecision['effects'][number] {
  return {
    outcome,
    method: context.method,
    target_ref: context.targetRef,
    arguments: context.args,
    confirmation_required: outcome === 'require_confirmation',
    reason,
  };
}

function buildControlSurfaceMediationReceipt(
  policyDecision: ControlSurfacePolicyDecision,
  context: {
    request: ControlSurfaceMediationRequest;
    descriptor: ControlSurfaceEnvelopeDescriptor;
    interactionEnvelope: ControlSurfaceInteractionEnvelope;
    policyBundleRef: ControlSurfacePolicyBundleRef;
    compiledPolicyCid: string;
    controlSurfaceContractRef: string;
    method: string;
    targetRef: string;
    now: string;
  },
): ControlSurfaceMediationReceipt {
  const effect = policyDecision.effects[0];
  const invoked = canInvokeControlSurfaceOutcome(policyDecision.outcome);
  return {
    receipt_id: computeCID(stableStringify({
      interaction_id: context.interactionEnvelope.interaction_id,
      decision_id: policyDecision.decision_id,
      control_surface_contract_ref: context.controlSurfaceContractRef,
    })),
    emitted_at: context.now,
    control_surface_contract_ref: context.controlSurfaceContractRef,
    interaction_envelope: context.interactionEnvelope,
    policy_decision: policyDecision,
    policy_refs: [{
      policy_bundle_ref: policyDecision.policy_bundle_ref ?? context.policyBundleRef,
      compiled_policy_cid: policyDecision.compiled_policy_cid ?? context.compiledPolicyCid,
      matched_norm_refs: policyDecision.matched_norms.map(norm => norm.norm_id),
    }],
    mediation_result: {
      outcome: policyDecision.outcome,
      invoked,
      final_method: effect?.rewrite_method ?? effect?.method ?? context.method,
      final_target_ref: effect?.target_ref ?? context.targetRef,
      fallback_surface: effect?.fallback_surface,
      confirmation_required: effect?.confirmation_required ?? policyDecision.outcome === 'require_confirmation',
      rate_limit_key: effect?.rate_limit_key,
    },
    explanation: policyDecision.explanation,
    metadata: {
      service_id: context.request.binding.service.id,
      descriptor_name: context.descriptor.name,
      evaluate_api: HALLUCINATE_POLICY_EVALUATE_API,
      runtime_policy_evaluator_registered: Boolean(policyDecision.metadata.runtime_policy_evaluator_registered),
      fail_closed: Boolean(policyDecision.metadata.fail_closed),
      schema_refs: [
        CONTROL_SURFACE_CONTRACT_SCHEMA_REF,
        INTERACTION_ENVELOPE_SCHEMA_REF,
        POLICY_DECISION_SCHEMA_REF,
        MEDIATION_RECEIPT_SCHEMA_REF,
      ],
    },
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

function canInvokeControlSurfaceOutcome(outcome: ControlSurfaceOutcome): boolean {
  return !BLOCKING_CONTROL_SURFACE_OUTCOMES.has(outcome);
}

function normalizeControlSurfaceOutcome(value: unknown): ControlSurfaceOutcome | undefined {
  const outcome = stringFrom(value)?.toLowerCase();
  if (!outcome) {
    return undefined;
  }
  if (outcome === 'permit' || outcome === 'permitted') {
    return 'allow';
  }
  if (outcome === 'block' || outcome === 'blocked') {
    return 'deny';
  }
  return [
    'allow',
    'deny',
    'require_confirmation',
    'defer',
    'rewrite',
    'fallback_surface',
    'rate_limit',
  ].includes(outcome)
    ? outcome as ControlSurfaceOutcome
    : undefined;
}

function policyBundleRefFrom(
  value: unknown,
  fallback: ControlSurfacePolicyBundleRef,
): ControlSurfacePolicyBundleRef {
  if (!isRecord(value)) {
    return fallback;
  }
  return {
    policy_id: stringFrom(value.policy_id) ?? fallback.policy_id,
    policy_cid: stringFrom(value.policy_cid) ?? fallback.policy_cid,
    version: stringFrom(value.version) ?? fallback.version,
    scope: stringFrom(value.scope) ?? fallback.scope,
    source: policyBundleSourceFrom(value.source) ?? fallback.source,
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

function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
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
