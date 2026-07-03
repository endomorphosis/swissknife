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

export interface CounterModel {
  formula: string;
  kripke: KripkeStructure;
  falseInWorld: number;
}

// ---------------------------------------------------------------------------
// Box-drawing constants
// ---------------------------------------------------------------------------

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
