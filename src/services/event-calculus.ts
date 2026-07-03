/**
 * Event Calculus — T-230 (Sprint 51)
 *
 * Port of ipfs_datasets_py/logic/CEC/native/event_calculus.py
 *
 * Core predicates and reasoning for Event Calculus:
 *   happens(e, t), initiates(e, f, t), terminates(e, f, t), holdsAt(f, t).
 */

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

/** An instantaneous occurrence that can initiate or terminate fluents. */
export class Event {
  constructor(
    public readonly name: string,
    public readonly parameters: readonly unknown[] = [],
  ) {}

  toString(): string {
    if (this.parameters.length === 0) return this.name;
    return `${this.name}(${this.parameters.join(', ')})`;
  }

  equals(other: Event): boolean {
    return this.name === other.name &&
      this.parameters.length === other.parameters.length &&
      this.parameters.every((p, i) => p === other.parameters[i]);
  }
}

// ---------------------------------------------------------------------------
// Fluent
// ---------------------------------------------------------------------------

/** A time-varying property (holds or doesn't hold at each time point). */
export class Fluent {
  constructor(
    public readonly name: string,
    public readonly parameters: readonly unknown[] = [],
  ) {}

  toString(): string {
    if (this.parameters.length === 0) return this.name;
    return `${this.name}(${this.parameters.join(', ')})`;
  }

  equals(other: Fluent): boolean {
    return this.name === other.name &&
      this.parameters.length === other.parameters.length &&
      this.parameters.every((p, i) => p === other.parameters[i]);
  }
}

// ---------------------------------------------------------------------------
// TimePoint
// ---------------------------------------------------------------------------

/** A discrete, non-negative time point. */
export class TimePoint {
  readonly value: number;

  constructor(value: number) {
    if (value < 0) throw new Error('Time cannot be negative');
    this.value = value;
  }

  lt(other: TimePoint): boolean  { return this.value < other.value; }
  le(other: TimePoint): boolean  { return this.value <= other.value; }
  gt(other: TimePoint): boolean  { return this.value > other.value; }
  ge(other: TimePoint): boolean  { return this.value >= other.value; }
  eq(other: TimePoint): boolean  { return this.value === other.value; }

  toString(): string { return `t${this.value}`; }

  /** Next time point. */
  next(): TimePoint { return new TimePoint(this.value + 1); }
}

// ---------------------------------------------------------------------------
// EventCalculus axiom stores
// ---------------------------------------------------------------------------

interface HappensAxiom   { event: Event; time: TimePoint }
interface InitiatesAxiom { event: Event; fluent: Fluent; time: TimePoint }
interface TerminatesAxiom { event: Event; fluent: Fluent; time: TimePoint }

// ---------------------------------------------------------------------------
// EventCalculus
// ---------------------------------------------------------------------------

/**
 * Event Calculus reasoning system.
 *
 * TypeScript port of `EventCalculus` from
 * `ipfs_datasets_py/logic/CEC/native/event_calculus.py`.
 *
 * Predicates implemented:
 *  - `happens(e, t)`: event e occurs at time t
 *  - `initiates(e, f, t)`: event e initiates fluent f at time t
 *  - `terminates(e, f, t)`: event e terminates fluent f at time t
 *  - `holdsAt(f, t)`: fluent f holds at time t (derived)
 *  - `clipped(t1, f, t2)`: fluent f is clipped between t1 and t2
 */
export class EventCalculus {
  private readonly _happens:    HappensAxiom[]    = [];
  private readonly _initiates:  InitiatesAxiom[]  = [];
  private readonly _terminates: TerminatesAxiom[] = [];
  /** Fluents that hold initially (at time 0). */
  private readonly _initiallyHolds = new Set<string>();

  // -------------------------------------------------------------------------
  // Axiom assertion
  // -------------------------------------------------------------------------

  happens(event: Event, time: TimePoint): void {
    this._happens.push({ event, time });
  }

  initiates(event: Event, fluent: Fluent, time: TimePoint): void {
    this._initiates.push({ event, fluent, time });
  }

  terminates(event: Event, fluent: Fluent, time: TimePoint): void {
    this._terminates.push({ event, fluent, time });
  }

  /** Assert that `fluent` holds at time 0. */
  initiallyHolds(fluent: Fluent): void {
    this._initiallyHolds.add(fluent.toString());
  }

  // -------------------------------------------------------------------------
  // Query predicates
  // -------------------------------------------------------------------------

  /**
   * Returns `true` if `fluent` holds at `time`.
   *
   * A fluent holds at t if:
   *  1. It was initiated before t and not clipped between initiation and t.
   *  2. OR it initially holds (t = 0 variant).
   */
  holdsAt(fluent: Fluent, time: TimePoint): boolean {
    const fKey = fluent.toString();

    // Base case: initially holds at t=0
    if (time.value === 0) return this._initiallyHolds.has(fKey);

    // Check every initiation event
    for (const init of this._initiates) {
      if (!init.fluent.equals(fluent)) continue;

      // Find a happens axiom for the initiating event at init.time
      const eventHappens = this._happens.some(h => h.event.equals(init.event) && h.time.eq(init.time));
      if (!eventHappens) continue;

      // Initiation must be before or at the query time
      if (!init.time.le(time)) continue;

      // Check not clipped between init.time and time
      if (!this.clipped(init.time, fluent, time)) return true;
    }

    // Also check if it initially holds and was never clipped up to time
    if (this._initiallyHolds.has(fKey)) {
      return !this.clipped(new TimePoint(0), fluent, time);
    }

    return false;
  }

  /**
   * Returns `true` if `fluent` is terminated (clipped) at any point
   * strictly between `t1` and `t2`.
   */
  clipped(t1: TimePoint, fluent: Fluent, t2: TimePoint): boolean {
    for (const term of this._terminates) {
      if (!term.fluent.equals(fluent)) continue;
      // The terminating event must happen strictly between t1 and t2
      const eventTime = this._happens.find(h => h.event.equals(term.event) && h.time.eq(term.time));
      if (!eventTime) continue;
      if (eventTime.time.gt(t1) && eventTime.time.le(t2)) return true;
    }
    return false;
  }

  /**
   * Query whether `event` happens at `time`.
   */
  doesHappen(event: Event, time: TimePoint): boolean {
    return this._happens.some(h => h.event.equals(event) && h.time.eq(time));
  }

  // -------------------------------------------------------------------------
  // Snapshot
  // -------------------------------------------------------------------------

  /** All fluents that hold at time `t`. */
  holdsAtTime(time: TimePoint): Fluent[] {
    const all = new Set<string>();
    for (const ax of this._initiates) all.add(ax.fluent.toString());
    for (const k of this._initiallyHolds) all.add(k);

    const result: Fluent[] = [];
    for (const key of all) {
      const [name, ...rest] = key.replace(')', '').split('(');
      const params = rest.length > 0 ? rest.join('(').split(', ') : [];
      const f = new Fluent(name, params);
      if (this.holdsAt(f, time)) result.push(f);
    }
    return result;
  }
}
