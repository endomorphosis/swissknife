/**
 * Deontic Interface Broker (DIB)
 *
 * Auto-generates a constrained user interface from a *formal-logic description*
 * (an MCP++ Profile-D {@link Policy}) applied to an MCP-IDL {@link InterfaceDescriptor},
 * then conforms that interface to a target device / interaction modality.
 *
 * This module is a thin orchestration layer that builds *on top of* the existing,
 * already-tested SwissKnife pipeline rather than replacing it:
 *
 *   formal logic (Policy, Profile D)  ── PolicyEngine.evaluatePolicy() ─┐
 *   interface contract (Profile A)    ── InterfaceDescriptor ───────────┤
 *                                                                       ▼
 *                                              projectDeonticInterface()
 *                                                                       │
 *                        per-method deontic UI state + policy_decisions │
 *                                                                       ▼
 *   desktop  ── generateSchemaDrivenUI(descriptor, { policy_decisions }) ──▶ React tree
 *   glasses  ── conformProjectionToDevice() ─▶ compileIDLToGlassesDisplay() ──▶ HUD
 *   runtime  ── createDeonticORBEvaluator() ─▶ MCPCapabilityRouter (authorize/invoke)
 *
 * The same {@link PolicyEngine} that gates runtime invocations in the ORB also
 * shapes the *design-time* interface, so what a user is *allowed* to see/do and
 * what they are *allowed* to invoke are derived from one formal-logic source.
 *
 * References:
 *   - mcp-idl.ts            (Profile A — InterfaceDescriptor)
 *   - mcp-policy.ts         (Profile D — Policy / PolicyEngine / obligations)
 *   - mcp-schema-ui-generator.ts (desktop UI model + policy_decisions sink)
 *   - idl-to-glasses-compiler.ts (device-constrained glasses/HUD compiler)
 */

import type { InterfaceDescriptor } from './mcp-idl.js';
import { computeInterfaceCID } from './mcp-idl.js';
import {
  PolicyEngine,
  type Policy,
  type Permission,
  type Prohibition,
  type Obligation,
  type ActiveObligation,
} from '../logic/deontic/mcp-policy.js';
import type { GeneratedUIPolicyDecision } from './mcp-schema-ui-generator.js';

export interface IDLMethodSchema {
  name: string;
  inputSchema: { type: string; properties?: Record<string, unknown>; required?: string[] };
  outputSchema: { type: string; properties?: Record<string, unknown> };
}

export interface IDLProfileDescriptor {
  name: string;
  namespace: string;
  version: string;
  methods: IDLMethodSchema[];
  ui?: {
    primary_template?: string;
    icon?: string;
    display_name?: string;
    category?: string;
  };
}

export interface AutoCompileOptions {
  maxActions?: number;
  maxTextBlocks?: number;
  updateHz?: number;
  priorityMethods?: string[];
  forceTemplate?:
    | 'single-card'
    | 'stack'
    | 'list'
    | 'status'
    | 'progress'
    | 'media'
    | 'confirmation'
    | 'freeform-grid'
    | 'task-progress'
    | 'notification-summary'
    | 'video-preview';
  icon?: string;
}

// ---------------------------------------------------------------------------
// Deontic operation state
// ---------------------------------------------------------------------------

/**
 * The deontic modality projected onto a single interface method for a given
 * actor + moment in time.
 *
 *  - `permitted`               — a matching permission, no obligations
 *  - `obligated`               — permitted, but firing spawns obligations
 *  - `prohibited`              — an explicit prohibition matched (deny)
 *  - `unavailable`             — no matching permission under default-deny
 */
export type DeonticOperationState =
  | 'permitted'
  | 'obligated'
  | 'prohibited'
  | 'unavailable';

export interface DeonticMethodProjection {
  method: string;
  state: DeonticOperationState;
  /** Capability string evaluated (e.g. `mcp++/invoke:pin`). */
  capability: string;
  /** Resource evaluated (defaults to the interface CID). */
  resource: string;
  reasons: string[];
  /** Obligations that firing this method would spawn (empty unless `obligated`). */
  obligations: ActiveObligation[];
  /** Content id of the underlying policy decision. */
  decision_cid: string;
}

export interface DeonticProjectionContext {
  caller_did?: string;
  /** Capabilities the actor already holds. */
  capabilities?: string[];
  /** ISO-8601 instant to evaluate temporal constraints at (defaults to now). */
  timestamp?: string;
  /** Maps a method name to the capability to evaluate. Default `mcp++/invoke:<method>`. */
  invokeCapability?: (method: string) => string;
  /** Resource id to evaluate against. Default: the interface CID. */
  resource?: string;
}

export interface DeonticInterfaceProjection {
  interface_cid: string;
  policy_cid: string;
  methods: DeonticMethodProjection[];
  /** Ready to hand to `generateSchemaDrivenUI(descriptor, { policy_decisions })`. */
  policy_decisions: Record<string, GeneratedUIPolicyDecision>;
  permitted: string[];
  obligated: string[];
  prohibited: string[];
  unavailable: string[];
}

/** Default capability template: `mcp++/invoke:<method>`. */
export function defaultInvokeCapability(method: string): string {
  return `mcp++/invoke:${method}`;
}

// ---------------------------------------------------------------------------
// Stage 1 + 3: project a formal-logic policy onto an interface's methods
// ---------------------------------------------------------------------------

/**
 * Evaluate every method of `descriptor` against the formal-logic `policy` for a
 * given actor/time and produce a per-method deontic projection plus a
 * `policy_decisions` map directly consumable by the desktop UI generator.
 *
 * This is *side-effect free*: it evaluates against a throwaway
 * {@link PolicyEngine} (or a caller-supplied one) so it never mutates the
 * runtime obligation ledger or rate-limit counters used during real invocation.
 */
export function projectDeonticInterface(
  descriptor: InterfaceDescriptor,
  policy: Policy,
  context: DeonticProjectionContext = {},
  engine: PolicyEngine = new PolicyEngine(),
): DeonticInterfaceProjection {
  const interfaceCid = computeInterfaceCID(descriptor);
  const policyCid = engine.registerPolicy(policy);
  const invokeCap = context.invokeCapability ?? defaultInvokeCapability;
  const resource = context.resource ?? interfaceCid;
  const timestamp = context.timestamp;

  const methods: DeonticMethodProjection[] = [];
  const policyDecisions: Record<string, GeneratedUIPolicyDecision> = {};
  const permitted: string[] = [];
  const obligated: string[] = [];
  const prohibited: string[] = [];
  const unavailable: string[] = [];

  for (const method of descriptor.methods) {
    const capability = invokeCap(method.name);
    const decision = engine.evaluatePolicy(policyCid, {
      cap: capability,
      rsc: resource,
      timestamp,
    });

    let state: DeonticOperationState;
    let ui: GeneratedUIPolicyDecision;

    if (decision.outcome === 'DENY') {
      const prohibitedMatch = decision.reasons.some(r => r.startsWith('Prohibited:'));
      if (prohibitedMatch) {
        state = 'prohibited';
        // An explicit prohibition hides the affordance entirely.
        ui = { outcome: 'deny', reasons: decision.reasons, visibility: 'hidden' };
        prohibited.push(method.name);
      } else {
        state = 'unavailable';
        // No permission under default-deny: keep the affordance visible but disabled.
        ui = { outcome: 'unavailable', reasons: decision.reasons, visibility: 'disabled' };
        unavailable.push(method.name);
      }
    } else if (decision.outcome === 'OBLIGATION_SPAWNED') {
      state = 'obligated';
      ui = {
        outcome: 'permit',
        reasons: decision.obligations.map(o => `Obligation: ${o.description}`),
        visibility: 'enabled',
      };
      obligated.push(method.name);
    } else {
      state = 'permitted';
      ui = { outcome: 'permit', visibility: 'enabled' };
      permitted.push(method.name);
    }

    methods.push({
      method: method.name,
      state,
      capability,
      resource,
      reasons: decision.reasons,
      obligations: decision.obligations,
      decision_cid: decision.decision_cid,
    });
    policyDecisions[method.name] = ui;
  }

  return {
    interface_cid: interfaceCid,
    policy_cid: policyCid,
    methods,
    policy_decisions: policyDecisions,
    permitted,
    obligated,
    prohibited,
    unavailable,
  };
}

// ---------------------------------------------------------------------------
// Stage 2: formal-logic consistency of the policy itself
// ---------------------------------------------------------------------------

export interface DeonticConflict {
  kind: 'permission_prohibition' | 'obligation_prohibition';
  capability: string;
  resource: string;
  detail: string;
}

export interface DeonticConsistencyResult {
  consistent: boolean;
  conflicts: DeonticConflict[];
}

function capOverlap(a: string, b: string): boolean {
  return capMatches(a, b) || capMatches(b, a);
}

function capMatches(pattern: string, actual: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('/*')) return actual.startsWith(pattern.slice(0, -2));
  return pattern === actual;
}

/**
 * Detect deontic conflicts within a single policy *before* it is used to shape
 * a UI. Mirrors the datasets `DeonticGraph.detect_conflicts()` consistency
 * check for the fragment expressible as Profile-D clauses:
 *
 *   - a permission and a prohibition covering the same cap+resource
 *   - an obligation whose `requiredCap`/`rsc` is prohibited (impossible to fulfil)
 *
 * Temporal-operator and first-order conflicts beyond this fragment should be
 * delegated to the Python TDFOL prover; this covers the common, cheap cases.
 */
export function checkPolicyConsistency(policy: Policy): DeonticConsistencyResult {
  const conflicts: DeonticConflict[] = [];

  for (const permission of policy.permissions) {
    for (const prohibition of policy.prohibitions) {
      // Prohibitions always override permissions at evaluation time, so a broad
      // permission with a narrower prohibition is a valid *exception*, not a
      // contradiction. Only an exactly-coincident permit+prohibit pair is a
      // genuine dead-permission contradiction worth flagging.
      if (permission.rsc === prohibition.rsc && permission.cap === prohibition.cap) {
        conflicts.push({
          kind: 'permission_prohibition',
          capability: permission.cap,
          resource: permission.rsc,
          detail: `Permission (${permission.cap} on ${permission.rsc}) is fully overridden by an identical prohibition; the permission can never take effect.`,
        });
      }
    }
  }

  for (const obligation of policy.obligations) {
    if (!obligation.requiredCap) continue;
    for (const prohibition of policy.prohibitions) {
      const obligationRsc = obligation.rsc ?? '*';
      if (
        resourceOverlap(obligationRsc, prohibition.rsc) &&
        capOverlap(obligation.requiredCap, prohibition.cap)
      ) {
        conflicts.push({
          kind: 'obligation_prohibition',
          capability: obligation.requiredCap,
          resource: obligationRsc,
          detail: `Obligation "${obligation.description}" requires ${obligation.requiredCap} on ${obligationRsc}, which is prohibited.`,
        });
      }
    }
  }

  return { consistent: conflicts.length === 0, conflicts };
}

function resourceOverlap(a: string, b: string): boolean {
  return resourceMatches(a, b) || resourceMatches(b, a);
}

function resourceMatches(pattern: string, actual: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('/*')) return actual.startsWith(pattern.slice(0, -2));
  return pattern === actual;
}

// ---------------------------------------------------------------------------
// Stage 4: conform the deontic projection to a device / interaction profile
// ---------------------------------------------------------------------------

export type InteractionModality =
  | 'display'
  | 'voice'
  | 'gesture'
  | 'neural_band'
  | 'mouse'
  | 'agent'
  | 'audio';

/**
 * A minimal device / interaction constraint set. Deliberately structural so it
 * can be adapted from `MetaGlassesDisplayProfile`, a mobile profile, or a plain
 * desktop profile without coupling the broker to any one device module.
 */
export interface DeviceInteractionProfile {
  device_id: string;
  /** Maximum simultaneously-exposed primary actions (e.g. glasses HUD == 3). */
  max_actions: number;
  /** Maximum text/content regions. */
  max_text_blocks?: number;
  /** Refresh budget in Hz. */
  update_hz?: number;
  /** Input modalities the device can source intents from, in preference order. */
  input_modalities: InteractionModality[];
  /** Output modalities available (display, audio, …), in preference order. */
  output_modalities: InteractionModality[];
  /** True when the device can render a visual surface. */
  has_display?: boolean;
  /** True when the device can render audio. */
  has_audio?: boolean;
}

export interface ConformedAction {
  method: string;
  state: DeonticOperationState;
  /** Chosen input modality for this action, or null when nothing is available. */
  input_modality: InteractionModality | null;
  /** True when the action must be confirmed / completed to satisfy an obligation. */
  required: boolean;
  obligations: ActiveObligation[];
}

export interface DeviceConformedInterface {
  device_id: string;
  /** Actions surfaced on the device, capped and prioritized. */
  actions: ConformedAction[];
  /** Methods dropped because they are prohibited. */
  excluded_prohibited: string[];
  /** Methods dropped only because the device action budget was exhausted. */
  excluded_over_budget: string[];
  /** Obligation actions that must be honored (obligated methods that survived). */
  required_actions: string[];
  /** Output modality chosen for prompts/renders. */
  primary_output: InteractionModality | null;
  /** Fallback output modality when the primary is unavailable. */
  fallback_output: InteractionModality | null;
  /** Warnings produced while conforming (e.g. obligation dropped over budget). */
  warnings: string[];
  /** Ready-made options for `compileIDLToGlassesDisplay`. */
  auto_compile_options: AutoCompileOptions;
}

/**
 * Conform a {@link DeonticInterfaceProjection} to a device profile.
 *
 * Rules (formal-logic first, then device constraints):
 *   1. Prohibited methods are removed outright (deontic hard constraint).
 *   2. Obligated methods are pinned to the front (must remain reachable so the
 *      user can discharge the obligation) before merely-permitted methods.
 *   3. `unavailable` methods are surfaced only if the device has display budget
 *      to show them disabled; otherwise dropped to save the action budget.
 *   4. The surviving, ordered actions are capped at `device.max_actions`.
 *   5. Each action is bound to the best available *input* modality; a `null`
 *      binding means the device cannot drive it (e.g. audio-only + a gesture-only
 *      action) and it is surfaced as a warning.
 *   6. Primary/fallback *output* modalities are chosen from the device profile.
 */
export function conformProjectionToDevice(
  projection: DeonticInterfaceProjection,
  device: DeviceInteractionProfile,
): DeviceConformedInterface {
  const byMethod = new Map(projection.methods.map(m => [m.method, m]));
  const warnings: string[] = [];

  const excludedProhibited = [...projection.prohibited];

  // Priority: obligated first, then permitted, then (only if display) unavailable.
  const showUnavailable = device.has_display !== false;
  const ordered: string[] = [
    ...projection.obligated,
    ...projection.permitted,
    ...(showUnavailable ? projection.unavailable : []),
  ];

  const primaryInput = device.input_modalities[0] ?? null;
  const chooseInput = (state: DeonticOperationState): InteractionModality | null => {
    if (state === 'prohibited') return null;
    return primaryInput;
  };

  const capped = ordered.slice(0, Math.max(0, device.max_actions));
  const excludedOverBudget = ordered.slice(Math.max(0, device.max_actions));

  // Any obligated method that fell outside the action budget is a real problem:
  // the user could not discharge the obligation. Warn loudly.
  for (const method of excludedOverBudget) {
    if (projection.obligated.includes(method)) {
      warnings.push(
        `Obligated action "${method}" exceeds device action budget (${device.max_actions}); obligation may be undischargeable on ${device.device_id}.`,
      );
    }
  }

  const actions: ConformedAction[] = capped.map(method => {
    const projected = byMethod.get(method)!;
    const inputModality = chooseInput(projected.state);
    if (inputModality === null && projected.state !== 'prohibited') {
      warnings.push(`No input modality available for "${method}" on ${device.device_id}.`);
    }
    return {
      method,
      state: projected.state,
      input_modality: inputModality,
      required: projected.state === 'obligated',
      obligations: projected.obligations,
    };
  });

  const primaryOutput =
    device.output_modalities.find(m => m === 'display' && device.has_display !== false) ??
    device.output_modalities[0] ??
    null;
  const fallbackOutput =
    device.output_modalities.find(m => m !== primaryOutput && (m !== 'audio' || device.has_audio)) ??
    (device.has_audio ? 'audio' : null);

  const autoCompileOptions: AutoCompileOptions = {
    maxActions: device.max_actions,
    maxTextBlocks: device.max_text_blocks,
    updateHz: device.update_hz,
    // Obligated first, then permitted — mirrors the surfaced order so the
    // glasses compiler promotes the same actions the deontic layer requires.
    priorityMethods: [...projection.obligated, ...projection.permitted],
  };

  return {
    device_id: device.device_id,
    actions,
    excluded_prohibited: excludedProhibited,
    excluded_over_budget: excludedOverBudget,
    required_actions: actions.filter(a => a.required).map(a => a.method),
    primary_output: primaryOutput,
    fallback_output: fallbackOutput ?? null,
    warnings,
    auto_compile_options: autoCompileOptions,
  };
}

// ---------------------------------------------------------------------------
// Adapters: InterfaceDescriptor <-> IDLProfileDescriptor (glasses compiler)
// ---------------------------------------------------------------------------

/**
 * Adapt an MCP-IDL {@link InterfaceDescriptor} to the {@link IDLProfileDescriptor}
 * shape the glasses compiler consumes, optionally restricting to a subset of
 * methods (e.g. only the non-prohibited ones from a deontic projection).
 */
export function interfaceToIDLProfile(
  descriptor: InterfaceDescriptor,
  options: { methods?: string[]; ui?: IDLProfileDescriptor['ui'] } = {},
): IDLProfileDescriptor {
  const allow = options.methods ? new Set(options.methods) : null;
  const methods: IDLMethodSchema[] = descriptor.methods
    .filter(m => (allow ? allow.has(m.name) : true))
    .map(m => ({
      name: m.name,
      inputSchema: normalizeObjectSchema(m.inputSchema ?? m.input_schema),
      outputSchema: normalizeObjectSchema(m.outputSchema ?? m.output_schema),
    }));
  return {
    name: descriptor.name,
    namespace: descriptor.namespace,
    version: descriptor.version,
    methods,
    ui: options.ui,
  };
}

function normalizeObjectSchema(
  schema: Record<string, unknown> | undefined,
): IDLMethodSchema['inputSchema'] {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object' };
  }
  const type = typeof schema.type === 'string' ? (schema.type as string) : 'object';
  const out: IDLMethodSchema['inputSchema'] = { type };
  if (schema.properties && typeof schema.properties === 'object') {
    out.properties = schema.properties as Record<string, unknown>;
  }
  if (Array.isArray(schema.required)) {
    out.required = schema.required as string[];
  }
  return out;
}

// ---------------------------------------------------------------------------
// ORB runtime evaluator: the SAME formal logic gates real invocations
// ---------------------------------------------------------------------------

/**
 * Structural shape the ORB expects from a deontic evaluator. `PolicyEngine`
 * satisfies this without the ORB importing this module (keeps the ORB decoupled
 * and testable with a stub).
 */
export interface ORBDeonticEvaluation {
  outcome: 'PERMIT' | 'DENY' | 'OBLIGATION_SPAWNED';
  reasons: string[];
  obligations: Array<{
    description: string;
    deadline?: number;
    requiredCap?: string;
    rsc?: string;
  }>;
  decision_cid: string;
}

export interface ORBDeonticEvaluator {
  evaluate(input: {
    policy_cid: string;
    capability: string;
    resource: string;
    timestamp?: string;
  }): ORBDeonticEvaluation | Promise<ORBDeonticEvaluation>;
}

/**
 * Wrap a {@link PolicyEngine} as an {@link ORBDeonticEvaluator} for the capability
 * router. Unlike {@link projectDeonticInterface}, this uses the *shared* engine
 * (default the singleton) so obligations spawned at invoke-time are tracked in
 * the runtime ledger and can be fulfilled / marked overdue.
 */
export function createDeonticORBEvaluator(
  engine: PolicyEngine = PolicyEngine.getInstance(),
): ORBDeonticEvaluator {
  return {
    evaluate({ policy_cid, capability, resource, timestamp }) {
      const decision = engine.evaluatePolicy(policy_cid, {
        cap: capability,
        rsc: resource,
        timestamp,
      });
      return {
        outcome: decision.outcome,
        reasons: decision.reasons,
        obligations: decision.obligations.map(o => ({
          description: o.description,
          deadline: o.deadline,
          requiredCap: o.requiredCap,
          rsc: o.rsc,
        })),
        decision_cid: decision.decision_cid,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Top-level orchestration: formal logic -> constrained, multi-device UI
// ---------------------------------------------------------------------------

export interface ConstrainedInterfaceModelOptions {
  context?: DeonticProjectionContext;
  devices?: DeviceInteractionProfile[];
  /** Reuse a specific engine for the projection (default: throwaway). */
  engine?: PolicyEngine;
  ui?: IDLProfileDescriptor['ui'];
}

export interface ConstrainedInterfaceModel {
  interface_cid: string;
  policy_cid: string;
  consistency: DeonticConsistencyResult;
  projection: DeonticInterfaceProjection;
  /** Per-device conformed interfaces keyed by device_id. */
  devices: Record<string, DeviceConformedInterface>;
  /**
   * IDL profile restricted to non-prohibited methods, ready for
   * `compileIDLToGlassesDisplay` / desktop generation.
   */
  permitted_idl_profile: IDLProfileDescriptor;
}

/**
 * End-to-end: take a formal-logic policy + an interface contract and produce a
 * fully constrained interface model spanning every requested device.
 *
 * The returned `projection.policy_decisions` plugs straight into
 * `generateSchemaDrivenUI(descriptor, { policy_decisions })` for desktop, and
 * each `devices[id].auto_compile_options` + `permitted_idl_profile` plug into
 * `compileIDLToGlassesDisplay(profile, options)` for HUD/glasses — so a single
 * formal-logic description drives every surface.
 */
export function buildConstrainedInterfaceModel(
  descriptor: InterfaceDescriptor,
  policy: Policy,
  options: ConstrainedInterfaceModelOptions = {},
): ConstrainedInterfaceModel {
  const consistency = checkPolicyConsistency(policy);
  const engine = options.engine ?? new PolicyEngine();
  const projection = projectDeonticInterface(descriptor, policy, options.context, engine);

  const devices: Record<string, DeviceConformedInterface> = {};
  for (const device of options.devices ?? []) {
    devices[device.device_id] = conformProjectionToDevice(projection, device);
  }

  const nonProhibited = projection.methods
    .filter(m => m.state !== 'prohibited')
    .map(m => m.method);

  const permittedIdlProfile = interfaceToIDLProfile(descriptor, {
    methods: nonProhibited,
    ui: options.ui,
  });

  return {
    interface_cid: projection.interface_cid,
    policy_cid: projection.policy_cid,
    consistency,
    projection,
    devices,
    permitted_idl_profile: permittedIdlProfile,
  };
}

// Re-export the formal-logic primitives so consumers can build policies without
// importing two modules.
export type { Policy, Permission, Prohibition, Obligation, ActiveObligation };
export { PolicyEngine };
