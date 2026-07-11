/**
 * Deontic UI Manifest — the headless bridge between the formal-logic layer and
 * any front-end (Hallucinate dashboards, SwissKnife desktop, glasses HUD).
 *
 * Rounds 50–51 built the machinery that turns a formal-logic (Profile-D) policy
 * + an interface contract into a device-constrained interface model
 * (`buildConstrainedInterfaceModel`) and, when the fragment is hard/temporal,
 * delegates the proof to the real Python TDFOL engine
 * (`checkPolicyConsistencyRemote`). But that output is a rich in-memory model —
 * nothing serialises it into something a UI can render, and nothing binds a
 * rendered control back to a real MCP++ tool call.
 *
 * This module closes that loop **without** a browser, React, or a running
 * backend, so it is fully unit-testable:
 *
 *   1. `buildDeonticUIManifest(descriptor, policy, opts)` → a plain,
 *      JSON-serialisable {@link DeonticUIManifest}: one panel per device (or a
 *      single default panel), each panel a list of {@link DeonticUIControl}s
 *      resolved to `enabled | obligated | disabled | hidden` with the reason,
 *      the obligation payload, the input schema (for form rendering) and a
 *      stable render order (obligated pinned first). Prohibited methods never
 *      appear as controls — they are recorded in `hidden_methods` for audit.
 *   2. `invokeControl(control, connector, args, opts?)` binds a rendered control
 *      to the live MCP++ connector and **re-enforces the deontic state at the
 *      invocation boundary** (defence in depth: a `hidden`/`disabled` control
 *      refuses to fire even if a UI mistakenly surfaced it).
 *   3. `interfaceDescriptorFromToolList(...)` turns a hierarchical
 *      `<category>.<tool>` tool listing (what the connector discovers from
 *      kit/datasets/accelerate) into an IDL {@link InterfaceDescriptor} so the
 *      whole pipeline can run straight off a live server.
 */

import type { InterfaceDescriptor, MethodSignature } from '../mcp/mcp-idl.js';
import type { Policy, ActiveObligation, PolicyEngine } from '../mcp/mcp-mcp-policy.js';
import {
  buildConstrainedInterfaceModel,
  type ConstrainedInterfaceModel,
  type DeonticInterfaceProjection,
  type DeonticMethodProjection,
  type DeviceConformedInterface,
  type ConformedAction,
  type DeviceInteractionProfile,
  type DeonticProjectionContext,
  type DeonticConflict,
  type InteractionModality,
} from '../mcp/mcp-deontic-interface-broker.js';
import {
  checkPolicyConsistencyRemote,
  type RemoteDeonticEngine,
} from '../mcp/mcp-remote-deontic-engine.js';

// --- Serialisable manifest types ------------------------------------------

/**
 * Render state of a single control, collapsed from the deontic operation state
 * into the four states a UI actually needs.
 *
 *   - `enabled`   — permitted; the control is live and clickable.
 *   - `obligated` — permitted AND the actor is obliged to act; pin + badge it.
 *   - `disabled`  — currently unavailable (e.g. missing capability / temporal
 *                   window closed); shown greyed-out with a reason tooltip.
 *   - `hidden`    — prohibited; never rendered (kept only in `hidden_methods`).
 */
export type DeonticControlState = 'enabled' | 'obligated' | 'disabled' | 'hidden';

export interface DeonticControlObligation {
  description: string;
  /** Unix epoch seconds deadline, when the obligation is time-bounded. */
  deadline?: number;
}

/** A single rendered control. Plain data — safe to `JSON.stringify`. */
export interface DeonticUIControl {
  /** Method / tool name (may be a hierarchical `<category>.<tool>` id). */
  method: string;
  /** Human-readable label derived from the method name. */
  label: string;
  /** Capability string the deontic engine evaluated. */
  capability: string;
  state: DeonticControlState;
  /** Why the control is disabled/hidden/obligated (empty for plain enabled). */
  reason?: string;
  /** True when acting on this control discharges an outstanding obligation. */
  required: boolean;
  obligations: DeonticControlObligation[];
  /** Chosen input modality for a device panel, else null (device-agnostic). */
  input_modality: InteractionModality | null;
  /** Compact JSON Schema for the tool arguments (for auto-form rendering). */
  input_schema?: Record<string, unknown>;
  /** Stable render order within the panel (obligated first). */
  order: number;
}

/** One rendering surface — a device, or the synthetic default panel. */
export interface DeonticUIPanel {
  device_id: string;
  /** Visible, ordered controls (never includes prohibited methods). */
  controls: DeonticUIControl[];
  /** Methods deliberately suppressed because policy prohibits them. */
  hidden_methods: string[];
  /** Methods dropped only because the device action budget was exhausted. */
  over_budget_methods: string[];
  /** Output modality chosen for prompts/renders (device panels only). */
  primary_output: InteractionModality | null;
  fallback_output: InteractionModality | null;
  /** Conformance warnings (e.g. an obligation dropped over budget). */
  warnings: string[];
}

export interface DeonticUIManifest {
  interface: { name: string; namespace: string; version: string };
  interface_cid: string;
  policy_cid: string;
  /** ISO-8601 instant the manifest was generated. */
  generated_at: string;
  /** False when the policy has a genuine deontic conflict. */
  consistent: boolean;
  conflicts: DeonticConflict[];
  /** True when a remote TDFOL prover was consulted for consistency. */
  remote_checked: boolean;
  /** Present when the remote prover found an inconsistency the local pass missed. */
  remote_inconsistent?: boolean;
  panels: DeonticUIPanel[];
  /** device_id of the panel a UI should show first (first device, else default). */
  default_device_id: string | null;
}

export interface BuildDeonticUIManifestOptions {
  /** Devices to conform the interface to. Omit for a single default panel. */
  devices?: DeviceInteractionProfile[];
  context?: DeonticProjectionContext;
  /** Reuse a specific engine for the projection (default: throwaway). */
  engine?: PolicyEngine;
  /**
   * When supplied, the manifest also runs the remote TDFOL consistency check
   * (Round 51) and folds any additional `theory` conflicts into the manifest.
   */
  remoteEngine?: RemoteDeonticEngine;
  /** Deterministic timestamp override (tests). Default: `new Date()`. */
  now?: Date;
}

const DEFAULT_PANEL_ID = '__default__';

// --- Public API ------------------------------------------------------------

/**
 * Build a fully serialisable UI manifest from a formal-logic policy + an
 * interface contract. This is the single entry point a front-end calls to learn
 * *what to render and in what state* for a given actor at a given time.
 */
export async function buildDeonticUIManifest(
  descriptor: InterfaceDescriptor,
  policy: Policy,
  options: BuildDeonticUIManifestOptions = {},
): Promise<DeonticUIManifest> {
  const model: ConstrainedInterfaceModel = buildConstrainedInterfaceModel(descriptor, policy, {
    context: options.context,
    devices: options.devices,
    engine: options.engine,
  });

  const schemaByMethod = indexInputSchemas(descriptor);
  const projectionByMethod = new Map<string, DeonticMethodProjection>();
  for (const m of model.projection.methods) projectionByMethod.set(m.method, m);

  // Consistency: start from the local check, optionally augment via the prover.
  let consistent = model.consistency.consistent;
  let conflicts: DeonticConflict[] = model.consistency.conflicts;
  let remoteChecked = false;
  let remoteInconsistent: boolean | undefined;
  if (options.remoteEngine) {
    const remote = await checkPolicyConsistencyRemote(policy, options.remoteEngine);
    remoteChecked = remote.remoteChecked;
    remoteInconsistent = remote.remoteInconsistent;
    consistent = remote.consistent;
    conflicts = remote.conflicts;
  }

  const panels: DeonticUIPanel[] = [];
  if (options.devices && options.devices.length > 0) {
    for (const device of options.devices) {
      const conformed = model.devices[device.device_id];
      if (conformed) panels.push(panelFromConformed(conformed, projectionByMethod, schemaByMethod));
    }
  } else {
    panels.push(panelFromProjection(model.projection, projectionByMethod, schemaByMethod));
  }

  const now = options.now ?? new Date();
  return {
    interface: {
      name: descriptor.name,
      namespace: descriptor.namespace,
      version: descriptor.version,
    },
    interface_cid: model.interface_cid,
    policy_cid: model.policy_cid,
    generated_at: now.toISOString(),
    consistent,
    conflicts,
    remote_checked: remoteChecked,
    ...(remoteInconsistent !== undefined ? { remote_inconsistent: remoteInconsistent } : {}),
    panels,
    default_device_id: panels.length > 0 ? panels[0].device_id : null,
  };
}

/** Structural view of the MCP++ connector this module can invoke through. */
export interface ManifestToolInvoker {
  /** Preferred: hierarchical dispatch that unwraps the CallToolResult envelope. */
  dispatch?(category: string, tool: string, params?: Record<string, unknown>): Promise<unknown>;
  /** Fallback: raw `tools/call` returning a CallToolResult envelope. */
  callTool?(name: string, args?: Record<string, unknown>): Promise<unknown>;
}

export interface InvokeControlOptions {
  /**
   * Category for hierarchical `dispatch(category, tool)`. If omitted and the
   * method is a dotted `<category>.<tool>` id, the category is parsed from it.
   */
  category?: string;
}

/**
 * Invoke the tool behind a rendered control through the live connector, while
 * **re-enforcing the deontic decision** at the call boundary. A `hidden`
 * (prohibited) or `disabled` (unavailable) control throws instead of firing —
 * so the policy is honoured even if a UI surfaced a control it should not have.
 */
export async function invokeControl(
  control: DeonticUIControl,
  connector: ManifestToolInvoker,
  args: Record<string, unknown> = {},
  options: InvokeControlOptions = {},
): Promise<unknown> {
  if (control.state === 'hidden') {
    throw new Error(
      `Refusing to invoke prohibited operation '${control.method}'` +
        (control.reason ? `: ${control.reason}` : ''),
    );
  }
  if (control.state === 'disabled') {
    throw new Error(
      `Refusing to invoke unavailable operation '${control.method}'` +
        (control.reason ? `: ${control.reason}` : ''),
    );
  }

  const { category, tool } = resolveCategoryTool(control.method, options.category);
  if (category && typeof connector.dispatch === 'function') {
    return connector.dispatch(category, tool, args);
  }
  if (typeof connector.callTool === 'function') {
    return connector.callTool(control.method, args);
  }
  if (typeof connector.dispatch === 'function') {
    // No category resolvable but only dispatch is available: dispatch bare tool.
    return connector.dispatch('', tool, args);
  }
  throw new Error(`Connector exposes neither dispatch() nor callTool() for '${control.method}'`);
}

/**
 * Build an IDL {@link InterfaceDescriptor} from a hierarchical tool listing (the
 * flat `<category>.<tool>` surface a connector discovers). Lets the whole
 * manifest pipeline run directly off a live MCP++ server's `tools/list`.
 */
export function interfaceDescriptorFromToolList(
  meta: { name: string; namespace: string; version?: string; requires?: string[] },
  tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown>; input_schema?: Record<string, unknown> }>,
): InterfaceDescriptor {
  const methods: MethodSignature[] = tools.map(t => ({
    name: t.name,
    ...(t.inputSchema || t.input_schema
      ? { input_schema: t.inputSchema ?? t.input_schema }
      : {}),
  }));
  return {
    name: meta.name,
    namespace: meta.namespace,
    version: meta.version ?? '1.0.0',
    methods,
    errors: [],
    requires: meta.requires ?? [],
    compatibility: {},
  };
}

// --- Internal helpers ------------------------------------------------------

function indexInputSchemas(descriptor: InterfaceDescriptor): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const m of descriptor.methods ?? []) {
    const schema = m.inputSchema ?? m.input_schema;
    if (schema) map.set(m.name, schema);
  }
  return map;
}

function humanizeMethod(method: string): string {
  const base = method.includes('.') ? method.slice(method.lastIndexOf('.') + 1) : method;
  return base
    .replace(/[_\-/]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function mapObligations(obligations: ActiveObligation[]): DeonticControlObligation[] {
  return obligations.map(o => ({
    description: o.description,
    ...(o.deadline !== undefined ? { deadline: o.deadline } : {}),
  }));
}

function reasonFor(
  state: DeonticControlState,
  projection: DeonticMethodProjection | undefined,
  obligations: DeonticControlObligation[],
): string | undefined {
  if (state === 'obligated') {
    const descs = obligations.map(o => o.description).filter(Boolean);
    if (descs.length > 0) return descs.join('; ');
  }
  if (state === 'disabled' || state === 'hidden') {
    const reasons = projection?.reasons?.filter(Boolean) ?? [];
    if (reasons.length > 0) return reasons.join('; ');
    return state === 'hidden' ? 'Prohibited by policy' : 'Currently unavailable';
  }
  return undefined;
}

function controlStateFor(op: DeonticMethodProjection['state']): DeonticControlState {
  switch (op) {
    case 'obligated':
      return 'obligated';
    case 'permitted':
      return 'enabled';
    case 'prohibited':
      return 'hidden';
    case 'unavailable':
    default:
      return 'disabled';
  }
}

/** Ordering weight so obligated pins first, then enabled, then disabled. */
function stateOrderWeight(state: DeonticControlState): number {
  switch (state) {
    case 'obligated':
      return 0;
    case 'enabled':
      return 1;
    case 'disabled':
      return 2;
    default:
      return 3;
  }
}

/** Default (device-agnostic) panel built straight from the projection. */
function panelFromProjection(
  projection: DeonticInterfaceProjection,
  projectionByMethod: Map<string, DeonticMethodProjection>,
  schemaByMethod: Map<string, Record<string, unknown>>,
): DeonticUIPanel {
  const hidden: string[] = [];
  const controls: DeonticUIControl[] = [];

  for (const m of projection.methods) {
    const state = controlStateFor(m.state);
    if (state === 'hidden') {
      hidden.push(m.method);
      continue;
    }
    const obligations = mapObligations(m.obligations);
    controls.push({
      method: m.method,
      label: humanizeMethod(m.method),
      capability: m.capability,
      state,
      reason: reasonFor(state, projectionByMethod.get(m.method), obligations),
      required: state === 'obligated',
      obligations,
      input_modality: null,
      ...(schemaByMethod.has(m.method) ? { input_schema: schemaByMethod.get(m.method) } : {}),
      order: 0,
    });
  }

  sortAndNumber(controls);
  return {
    device_id: DEFAULT_PANEL_ID,
    controls,
    hidden_methods: hidden,
    over_budget_methods: [],
    primary_output: null,
    fallback_output: null,
    warnings: [],
  };
}

/** Device panel built from a conformed interface (respects action budget). */
function panelFromConformed(
  conformed: DeviceConformedInterface,
  projectionByMethod: Map<string, DeonticMethodProjection>,
  schemaByMethod: Map<string, Record<string, unknown>>,
): DeonticUIPanel {
  const controls: DeonticUIControl[] = conformed.actions.map((a: ConformedAction) => {
    const state = controlStateFor(a.state);
    const obligations = mapObligations(a.obligations);
    const projection = projectionByMethod.get(a.method);
    return {
      method: a.method,
      label: humanizeMethod(a.method),
      capability: projection?.capability ?? a.method,
      state,
      reason: reasonFor(state, projection, obligations),
      required: a.required,
      obligations,
      input_modality: a.input_modality,
      ...(schemaByMethod.has(a.method) ? { input_schema: schemaByMethod.get(a.method) } : {}),
      order: 0,
    };
  });

  sortAndNumber(controls);
  return {
    device_id: conformed.device_id,
    controls,
    hidden_methods: conformed.excluded_prohibited,
    over_budget_methods: conformed.excluded_over_budget,
    primary_output: conformed.primary_output,
    fallback_output: conformed.fallback_output,
    warnings: conformed.warnings,
  };
}

/**
 * Stable-sort by (state weight, original index) then assign the `order` field.
 * Preserves the DIB's within-group ordering (device panels are already pinned
 * obligated-first) while guaranteeing obligated < enabled < disabled globally.
 */
function sortAndNumber(controls: DeonticUIControl[]): void {
  const indexed = controls.map((c, i) => ({ c, i }));
  indexed.sort((a, b) => {
    const w = stateOrderWeight(a.c.state) - stateOrderWeight(b.c.state);
    return w !== 0 ? w : a.i - b.i;
  });
  controls.length = 0;
  indexed.forEach(({ c }, idx) => {
    c.order = idx;
    controls.push(c);
  });
}

function resolveCategoryTool(
  method: string,
  explicitCategory?: string,
): { category: string | null; tool: string } {
  if (explicitCategory) {
    const tool = method.includes('.') ? method.slice(method.lastIndexOf('.') + 1) : method;
    return { category: explicitCategory, tool };
  }
  const dot = method.indexOf('.');
  if (dot > 0) {
    return { category: method.slice(0, dot), tool: method.slice(dot + 1) };
  }
  return { category: null, tool: method };
}
