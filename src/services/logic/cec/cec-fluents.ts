/**
 * CEC Fluents — T-234
 *
 * Port of ipfs_datasets_py/logic/CEC/native/fluents.py
 *
 * Fluent management for DCEC: FluentType, PersistenceRule, Fluent, FluentManager.
 * Builds on the core Event/Fluent/TimePoint in event-calculus.ts.
 */

import { Event, Fluent as BaseFluent, TimePoint } from './event-calculus';

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Types of fluents. */
export enum FluentType {
  BOOLEAN     = 'boolean',
  NUMERICAL   = 'numerical',
  CATEGORICAL = 'categorical',
  RELATIONAL  = 'relational',
}

/** Rules governing how fluent values persist over time. */
export enum PersistenceRule {
  INERTIAL    = 'inertial',    // persists until explicitly changed
  TRANSIENT   = 'transient',   // holds only at the initiation instant
  DECAYING    = 'decaying',    // persists with gradual weakening
  CONDITIONAL = 'conditional', // conditional on other fluents
}

// ---------------------------------------------------------------------------
// ManagedFluent
// ---------------------------------------------------------------------------

export interface FluentSpec {
  name: string;
  type: FluentType;
  persistenceRule?: PersistenceRule;
  initialValue?: unknown;
  /** For CATEGORICAL: list of allowed values. */
  domain?: unknown[];
  /** For DECAYING: fraction of current value retained each tick (0–1). */
  decayRate?: number;
}

// ---------------------------------------------------------------------------
// FluentManager
// ---------------------------------------------------------------------------

/** Per-time-point snapshot: fluent name → current value. */
export type FluentSnapshot = Map<string, unknown>;

/**
 * Manages a collection of fluents and their values across time.
 *
 * TypeScript port of `FluentManager` from
 * `ipfs_datasets_py/logic/CEC/native/fluents.py`.
 */
export class FluentManager {
  private readonly specs = new Map<string, FluentSpec>();
  /** history[t] = snapshot of all fluent values at time t. */
  private readonly history = new Map<number, FluentSnapshot>();
  /** Pending initiations: { time → { fluentName → value } } */
  private readonly pending_initiations = new Map<number, Map<string, unknown>>();
  /** Pending terminations: { time → Set<fluentName> } */
  private readonly pending_terminations = new Map<number, Set<string>>();

  constructor() {}

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  addFluent(spec: FluentSpec): void {
    this.specs.set(spec.name, {
      persistenceRule: PersistenceRule.INERTIAL,
      initialValue: spec.type === FluentType.BOOLEAN ? false : null,
      ...spec,
    });
    // Seed t=0 if not already seeded
    if (!this.history.has(0)) this.history.set(0, new Map());
    this.history.get(0)!.set(spec.name, spec.initialValue ?? (spec.type === FluentType.BOOLEAN ? false : null));
  }

  // -------------------------------------------------------------------------
  // State mutation
  // -------------------------------------------------------------------------

  /** Initiate a fluent value at time `t`. */
  initiate(fluentName: string, value: unknown, time: TimePoint): void {
    if (!this.pending_initiations.has(time.value)) this.pending_initiations.set(time.value, new Map());
    this.pending_initiations.get(time.value)!.set(fluentName, value);
  }

  /** Terminate a fluent at time `t`. */
  terminate(fluentName: string, time: TimePoint): void {
    if (!this.pending_terminations.has(time.value)) this.pending_terminations.set(time.value, new Set());
    this.pending_terminations.get(time.value)!.add(fluentName);
  }

  /** Directly set a fluent value at a time point (for testing / override). */
  setState(fluentName: string, value: unknown, time: TimePoint): void {
    if (!this.history.has(time.value)) this._buildSnapshot(time);
    this.history.get(time.value)!.set(fluentName, value);
  }

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------

  /**
   * Get the full snapshot at time `t`.
   * Lazily builds the snapshot from the previous time if needed.
   */
  getState(time: TimePoint): FluentSnapshot {
    if (!this.history.has(time.value)) this._buildSnapshot(time);
    return new Map(this.history.get(time.value)!);
  }

  /**
   * Returns the value of a single fluent at time `t`.
   */
  getHoldsAt(fluentName: string, time: TimePoint): unknown {
    return this.getState(time).get(fluentName) ?? null;
  }

  /**
   * Advance time by one step, applying initiations, terminations, and
   * persistence rules.
   *
   * @param event  Optional event that triggers state changes.
   * @param from   Source time point.
   * @param to     Target time point (must be from.next()).
   */
  transition(from: TimePoint, to: TimePoint, _event?: Event): FluentSnapshot {
    const prev = this.getState(from);
    const next = new Map<string, unknown>(prev);

    // Apply terminations
    const terms = this.pending_terminations.get(to.value);
    if (terms) {
      for (const name of terms) {
        const spec = this.specs.get(name);
        if (spec?.persistenceRule === PersistenceRule.INERTIAL) {
          next.set(name, spec.type === FluentType.BOOLEAN ? false : null);
        }
      }
    }

    // Apply initiations
    const inits = this.pending_initiations.get(to.value);
    if (inits) {
      for (const [name, value] of inits) next.set(name, value);
    }

    // Apply persistence/decay for each spec
    for (const [name, spec] of this.specs) {
      if (spec.persistenceRule === PersistenceRule.TRANSIENT && !inits?.has(name)) {
        next.set(name, spec.type === FluentType.BOOLEAN ? false : null);
      } else if (spec.persistenceRule === PersistenceRule.DECAYING) {
        const cur = next.get(name);
        if (typeof cur === 'number' && spec.decayRate !== undefined) {
          next.set(name, cur * spec.decayRate);
        }
      }
    }

    this.history.set(to.value, next);
    return new Map(next);
  }

  // -------------------------------------------------------------------------
  // Snapshot of registered fluents
  // -------------------------------------------------------------------------

  getFluents(): FluentSpec[] {
    return [...this.specs.values()];
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _buildSnapshot(time: TimePoint): void {
    if (time.value === 0) {
      const snap: FluentSnapshot = new Map();
      for (const [name, spec] of this.specs) {
        snap.set(name, spec.initialValue ?? (spec.type === FluentType.BOOLEAN ? false : null));
      }
      this.history.set(0, snap);
      return;
    }
    // Build from previous
    const prev = new TimePoint(time.value - 1);
    this.transition(prev, time);
  }
}
