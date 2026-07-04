/**
 * kripke-structure.ts
 *
 * Kripke structure (possible-worlds model) for modal logic + ASCII visualizer.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/TDFOL/countermodels.py
 *   ipfs_datasets_py/logic/TDFOL/countermodel_visualizer.py
 *
 * Provides:
 *   KripkeStructure        — possible worlds + accessibility + valuation
 *   CountermodelVisualizer — ASCII/compact rendering
 *   createVisualizer()     — convenience factory
 */

import { writeFileSync } from 'node:fs';

import { ModalLogicType } from './modal-tableaux.js';

// ---------------------------------------------------------------------------
// KripkeStructure
// ---------------------------------------------------------------------------

/**
 * A Kripke structure (model) for modal logic.
 *
 * W  — set of possible worlds (integer ids)
 * R  — accessibility relation W × W
 * V  — valuation  world → {true atom names}
 * w0 — designated initial world
 */
export class KripkeStructure {
  worlds: Set<number> = new Set();
  accessibility: Map<number, Set<number>> = new Map();
  valuation: Map<number, Set<string>> = new Map();
  initialWorld = 0;
  logicType: ModalLogicType;

  constructor(logicType: ModalLogicType = ModalLogicType.K) {
    this.logicType = logicType;
  }

  addWorld(worldId: number): void {
    this.worlds.add(worldId);
    if (!this.accessibility.has(worldId)) this.accessibility.set(worldId, new Set());
    if (!this.valuation.has(worldId)) this.valuation.set(worldId, new Set());
  }

  addAccessibility(from: number, to: number): void {
    if (!this.accessibility.has(from)) this.accessibility.set(from, new Set());
    this.accessibility.get(from)!.add(to);
  }

  setAtomTrue(worldId: number, atom: string): void {
    if (!this.valuation.has(worldId)) this.valuation.set(worldId, new Set());
    this.valuation.get(worldId)!.add(atom);
  }

  isAtomTrue(worldId: number, atom: string): boolean {
    return this.valuation.get(worldId)?.has(atom) ?? false;
  }

  getAccessibleWorlds(worldId: number): Set<number> {
    return new Set(this.accessibility.get(worldId) ?? []);
  }

  totalRelations(): number {
    let n = 0;
    for (const s of this.accessibility.values()) n += s.size;
    return n;
  }

  toDict(): Record<string, unknown> {
    const acc: Record<string, number[]> = {};
    for (const [k, v] of this.accessibility) acc[String(k)] = [...v].sort((a, b) => a - b);
    const val: Record<string, string[]> = {};
    for (const [k, v] of this.valuation) val[String(k)] = [...v].sort();
    return {
      worlds: [...this.worlds].sort((a, b) => a - b),
      accessibility: acc,
      valuation: val,
      initial_world: this.initialWorld,
      logic_type: this.logicType,
    };
  }

  toJson(indent = 2): string {
    return JSON.stringify(this.toDict(), null, indent);
  }
}

// ---------------------------------------------------------------------------
// CounterModel (extracted from an open TableauxBranch)
// ---------------------------------------------------------------------------

export class CounterModel {
  readonly formula: string;
  readonly kripke: KripkeStructure;
  readonly explanation: string[];
  readonly falseInWorld: number;

  constructor(input: {
    formula: string;
    kripke: KripkeStructure;
    explanation?: string[];
    falseInWorld?: number;
  }) {
    this.formula = input.formula;
    this.kripke = input.kripke;
    this.explanation = [...(input.explanation ?? [])];
    this.falseInWorld = input.falseInWorld ?? this.kripke.initialWorld;
  }

  toString(): string {
    const lines = [
      `Countermodel for: ${this.formula}`,
      `Logic: ${this.kripke.logicType}`,
      `Worlds: ${JSON.stringify([...this.kripke.worlds].sort((a, b) => a - b))}`,
      `Initial: w${this.kripke.initialWorld}`,
      '',
      'Valuation (true atoms):',
    ];
    for (const worldId of [...this.kripke.worlds].sort((a, b) => a - b)) {
      const atoms = [...(this.kripke.valuation.get(worldId) ?? [])].sort();
      lines.push(`  w${worldId}: ${atoms.length ? atoms.join(', ') : '(none)'}`);
    }
    lines.push('', 'Accessibility:');
    for (const worldId of [...this.kripke.worlds].sort((a, b) => a - b)) {
      const accessible = [...(this.kripke.accessibility.get(worldId) ?? [])].sort((a, b) => a - b);
      if (accessible.length) lines.push(`  w${worldId} → ${accessible.map(w => `w${w}`).join(', ')}`);
    }
    if (this.explanation.length) {
      lines.push('', 'Explanation:');
      for (const line of this.explanation) lines.push(`  ${line}`);
    }
    return lines.join('\n');
  }

  toAsciiArt(): string {
    const lines = [`Countermodel for: ${this.formula}`, ''];
    for (const worldId of [...this.kripke.worlds].sort((a, b) => a - b)) {
      const atoms = [...(this.kripke.valuation.get(worldId) ?? [])].sort();
      const prefix = worldId === this.kripke.initialWorld ? '→ ' : '  ';
      lines.push(`${prefix}w${worldId}: {${atoms.length ? atoms.join(', ') : '∅'}}`);
      for (const target of [...(this.kripke.accessibility.get(worldId) ?? [])].sort((a, b) => a - b)) {
        lines.push(`  ├─→ w${target}`);
      }
    }
    return lines.join('\n');
  }

  toDot(): string {
    const lines = [
      'digraph Countermodel {',
      `  label="Countermodel for ${this.formula}";`,
      '  labelloc="t";',
      '  node [shape=circle];',
      '',
    ];
    for (const worldId of [...this.kripke.worlds].sort((a, b) => a - b)) {
      const atoms = [...(this.kripke.valuation.get(worldId) ?? [])].sort();
      const atomStr = atoms.length ? atoms.join('\\n') : '∅';
      if (worldId === this.kripke.initialWorld) {
        lines.push(`  w${worldId} [label="w${worldId}\\n${atomStr}", style=filled, fillcolor=lightblue];`);
      } else {
        lines.push(`  w${worldId} [label="w${worldId}\\n${atomStr}"];`);
      }
    }
    lines.push('');
    for (const worldId of [...this.kripke.worlds].sort((a, b) => a - b)) {
      for (const target of [...(this.kripke.accessibility.get(worldId) ?? [])].sort((a, b) => a - b)) {
        lines.push(`  w${worldId} -> w${target};`);
      }
    }
    lines.push('}');
    return lines.join('\n');
  }

  toJson(indent = 2): string {
    return JSON.stringify({
      formula: this.formula,
      kripke_structure: this.kripke.toDict(),
      explanation: this.explanation,
    }, null, indent);
  }

  to_ascii_art = this.toAsciiArt.bind(this);
  to_dot = this.toDot.bind(this);
  to_json = this.toJson.bind(this);
}

// ---------------------------------------------------------------------------
// Box-drawing constants
// ---------------------------------------------------------------------------

export class BoxChars {
  static readonly HORIZONTAL = '─';
  static readonly VERTICAL = '│';
  static readonly TOP_LEFT = '┌';
  static readonly TOP_RIGHT = '┐';
  static readonly BOTTOM_LEFT = '└';
  static readonly BOTTOM_RIGHT = '┘';
  static readonly T_RIGHT = '├';
  static readonly T_LEFT = '┤';
  static readonly T_DOWN = '┬';
  static readonly T_UP = '┴';
  static readonly CROSS = '┼';
  static readonly ARROW_RIGHT = '→';
  static readonly ARROW_DOWN = '↓';
  static readonly DOUBLE_ARROW_RIGHT = '⇒';
  static readonly BULLET = '•';
  static readonly CHECK = '✓';
  static readonly CROSS_MARK = '✗';
}

export class GraphLayout {
  readonly positions: Record<number, [number, number]>;
  readonly width: number;
  readonly height: number;

  constructor(positions: Record<number, [number, number]> = {}, width = 800, height = 600) {
    this.positions = { ...positions };
    this.width = width;
    this.height = height;
  }
}

const BOX = {
  H: '─', V: '│',
  TL: '┌', TR: '┐', BL: '└', BR: '┘',
  TR_SIDE: '├', TL_SIDE: '┤',
  T_DOWN: '┬', T_UP: '┴',
  CROSS: '┼',
  ARR: '→', ARR2: '⇒',
  BULLET: '•', CHECK: '✓', X_MARK: '✗',
} as const;

// ---------------------------------------------------------------------------
// CountermodelVisualizer
// ---------------------------------------------------------------------------

/**
 * ASCII renderer for a Kripke structure countermodel.
 *
 * Supports two styles:
 *   'expanded' — box-bordered worlds + explicit accessibility list
 *   'compact'  — single-line-per-world summary
 */
export class CountermodelVisualizer {
  constructor(private kripke: KripkeStructure) {}

  /**
   * Render the Kripke structure as ASCII art.
   * @param style 'expanded' (default) or 'compact'
   */
  renderAscii(style: 'expanded' | 'compact' = 'expanded'): string {
    if (style === 'compact') return this._renderCompact();
    return this._renderExpanded();
  }

  // -------------------------------------------------------------------------
  // Expanded rendering
  // -------------------------------------------------------------------------

  private _renderExpanded(): string {
    const lines: string[] = [];
    const headerText = `Kripke Structure (Logic: ${this.kripke.logicType})`;
    const infoText = `Worlds: ${this.kripke.worlds.size}, Relations: ${this.kripke.totalRelations()}`;
    const boxW = Math.max(headerText.length, infoText.length) + 4;
    const inner = boxW - 2;

    lines.push(BOX.TL + BOX.H.repeat(inner) + BOX.TR);
    lines.push(BOX.V + (' ' + headerText).padEnd(inner) + BOX.V);
    lines.push(BOX.V + (' ' + infoText).padEnd(inner) + BOX.V);
    lines.push(BOX.BL + BOX.H.repeat(inner) + BOX.BR);
    lines.push('');

    for (const wid of [...this.kripke.worlds].sort((a, b) => a - b)) {
      const atoms = [...(this.kripke.valuation.get(wid) ?? [])].sort();
      const accessible = [...(this.kripke.accessibility.get(wid) ?? [])].sort((a, b) => a - b);
      const isInitial = wid === this.kripke.initialWorld;
      const worldLabel = isInitial ? `World w${wid} ${BOX.BULLET} (initial)` : `World w${wid}`;

      const rows: string[] = [
        `  Atoms:       ${atoms.length ? atoms.join(', ') : '(none)'}`,
        `  Accessible:  ${accessible.length ? accessible.map(w => `w${w}`).join(' ' + BOX.ARR + ' ') : '(none)'}`,
      ];
      const wBoxW = Math.max(worldLabel.length, ...rows.map(r => r.length)) + 4;
      const wInner = wBoxW - 2;

      lines.push(BOX.TL + BOX.H.repeat(wInner) + BOX.TR);
      lines.push(BOX.V + (' ' + worldLabel).padEnd(wInner) + BOX.V);
      lines.push(BOX.TR_SIDE + BOX.H.repeat(wInner) + BOX.TL_SIDE);
      for (const row of rows) lines.push(BOX.V + row.padEnd(wInner) + BOX.V);
      lines.push(BOX.BL + BOX.H.repeat(wInner) + BOX.BR);
    }

    // Accessibility summary
    lines.push('');
    lines.push('Accessibility relations:');
    let hasAny = false;
    for (const [from, tos] of this.kripke.accessibility) {
      for (const to of [...tos].sort((a, b) => a - b)) {
        lines.push(`  w${from} ${BOX.ARR} w${to}`);
        hasAny = true;
      }
    }
    if (!hasAny) lines.push('  (no relations)');

    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // Compact rendering
  // -------------------------------------------------------------------------

  private _renderCompact(): string {
    const lines: string[] = [
      `[Kripke/${this.kripke.logicType}] ${this.kripke.worlds.size} worlds, ${this.kripke.totalRelations()} relations`,
    ];
    for (const wid of [...this.kripke.worlds].sort((a, b) => a - b)) {
      const atoms = [...(this.kripke.valuation.get(wid) ?? [])].join(',') || '-';
      const accessible = [...(this.kripke.accessibility.get(wid) ?? [])].sort((a, b) => a - b).map(w => `w${w}`).join(',') || '-';
      const init = wid === this.kripke.initialWorld ? '*' : ' ';
      lines.push(`  ${init}w${wid}: atoms=[${atoms}] acc=[${accessible}]`);
    }
    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

export class CounterModelExtractor {
  readonly logicType: ModalLogicType;

  constructor(logicType: ModalLogicType = ModalLogicType.K) {
    this.logicType = logicType;
  }

  extract(formula: unknown, branch: Record<string, unknown>): CounterModel {
    if (Boolean(branch.is_closed ?? branch.isClosed)) {
      throw new Error('Cannot extract countermodel from closed branch');
    }
    const kripke = new KripkeStructure(this.logicType);
    const worlds = mappingEntries(branch.worlds);
    const accessibility = mappingEntries(branch.accessibility);

    for (const [worldId] of worlds) kripke.addWorld(worldId);
    if (kripke.worlds.size === 0) kripke.addWorld(0);
    for (const [from, targets] of accessibility) {
      for (const target of iterableNumbers(targets)) kripke.addAccessibility(from, target);
    }
    for (const [worldId, world] of worlds) {
      const formulas = Array.isArray((world as Record<string, unknown>)?.formulas)
        ? (world as Record<string, unknown>).formulas as unknown[]
        : [];
      for (const value of formulas) {
        const atom = extractAtomName(value);
        if (atom) kripke.setAtomTrue(worldId, atom);
      }
    }

    return new CounterModel({
      formula: formulaToString(formula),
      kripke,
      explanation: this.generateExplanation(formulaToString(formula), kripke),
    });
  }

  private generateExplanation(formula: string, kripke: KripkeStructure): string[] {
    const explanation = [
      `Formula '${formula}' is not ${this.logicType}-valid`,
      `Countermodel has ${kripke.worlds.size} world(s)`,
    ];
    const initAtoms = [...(kripke.valuation.get(kripke.initialWorld) ?? [])].sort();
    explanation.push(initAtoms.length
      ? `At initial world w${kripke.initialWorld}: ${initAtoms.join(', ')} are true`
      : `At initial world w${kripke.initialWorld}: no atoms are true`);
    explanation.push(`Total accessibility relations: ${kripke.totalRelations()}`);
    return explanation;
  }
}

export function extractCountermodel(
  formula: unknown,
  branch: Record<string, unknown>,
  logicType: ModalLogicType = ModalLogicType.K,
): CounterModel {
  return new CounterModelExtractor(logicType).extract(formula, branch);
}

export function visualizeCountermodel(countermodel: CounterModel, format = 'ascii'): string {
  if (format === 'ascii') return countermodel.toAsciiArt();
  if (format === 'dot') return countermodel.toDot();
  if (format === 'json') return countermodel.toJson();
  throw new Error(`Unsupported format: ${format}. Use 'ascii', 'dot', or 'json'`);
}

export function printCountermodelAscii(countermodel: CounterModel): void {
  console.log(countermodel.toAsciiArt());
}

export function saveCountermodelDot(countermodel: CounterModel, filename: string): void {
  writeFileSync(filename, countermodel.toDot(), 'utf8');
}

export function saveCountermodelJson(countermodel: CounterModel, filename: string): void {
  writeFileSync(filename, countermodel.toJson(), 'utf8');
}

/** Create a CountermodelVisualizer from an existing KripkeStructure. */
export function createVisualizer(kripke: KripkeStructure): CountermodelVisualizer {
  return new CountermodelVisualizer(kripke);
}

// PORT-081: ASCII countermodel visualizer (port of countermodel_visualizer.py)
export function visualizeKripkeAscii(worlds: Array<{ id: number; props: string[] }>, accessibility: Map<number, Set<number>>): string {
  const lines: string[] = ['Kripke Structure:', ''];
  for (const w of worlds) {
    lines.push(`  World w${w.id}: {${w.props.join(', ')}}`);
    const succs = [...(accessibility.get(w.id) ?? [])];
    if (succs.length > 0) lines.push(`    → [${succs.map(s => `w${s}`).join(', ')}]`);
  }
  return lines.join('\n');
}

export function visualizeKripkeHtml(worlds: Array<{ id: number; props: string[] }>, accessibility: Map<number, Set<number>>): string {
  const nodes = worlds.map(w => `<div class="world" id="w${w.id}">{${w.props.join(', ')}}</div>`).join('');
  const edges = [...accessibility.entries()].flatMap(([from, tos]) =>
    [...tos].map(to => `<div class="edge">w${from} → w${to}</div>`)
  ).join('');
  return `<div class="kripke">${nodes}${edges}</div>`;
}

export const extract_countermodel = extractCountermodel;
export const visualize_countermodel = visualizeCountermodel;
export const print_countermodel_ascii = printCountermodelAscii;
export const save_countermodel_dot = saveCountermodelDot;
export const save_countermodel_json = saveCountermodelJson;

function mappingEntries(value: unknown): Array<[number, unknown]> {
  if (value instanceof Map) return [...value.entries()].map(([key, nested]) => [Number(key), nested]);
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([key, nested]) => [Number(key), nested]);
  }
  return [];
}

function iterableNumbers(value: unknown): number[] {
  if (value instanceof Set) return [...value].map(Number);
  if (Array.isArray(value)) return value.map(Number);
  return [];
}

function extractAtomName(value: unknown): string | null {
  if (typeof value === 'string') return value.match(/^[A-Z][A-Za-z0-9_]*/)?.[0] ?? null;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.name === 'string') return record.name;
    if (typeof record.toStr === 'function') return extractAtomName(record.toStr());
  }
  return null;
}

function formulaToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { toStr?: unknown }).toStr === 'function') {
    return String((value as { toStr: () => string }).toStr());
  }
  return String(value);
}
