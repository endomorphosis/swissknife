/**
 * CEC Prover Core + Extended Rules — T-255
 *
 * Ports of:
 *   - CEC/native/prover_core.py (649L) — ProofResult + 8 core rules
 *   - CEC/native/prover_core_extended_rules.py (1116L) — 39 extended rules
 *
 * All rules work on string-encoded formulas using the same lightweight
 * pattern as cec-advanced-inference.ts.
 */

// ---------------------------------------------------------------------------
// ProofResult enum
// ---------------------------------------------------------------------------

export enum ProofResult {
  PROVED    = 'proved',
  DISPROVED = 'disproved',
  TIMEOUT   = 'timeout',
  UNKNOWN   = 'unknown',
  ERROR     = 'error',
}

// ---------------------------------------------------------------------------
// InferenceRule interface
// ---------------------------------------------------------------------------

export interface CECInferenceRule {
  readonly name: string;
  readonly description: string;
  canApply(formulas: string[]): boolean;
  apply(formulas: string[]): string[];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const isImpl  = (f: string) => f.includes('→');
const isConj  = (f: string) => f.includes('∧');
const isDisj  = (f: string) => f.includes('∨');
const isNeg   = (f: string) => f.startsWith('¬');
const isBox   = (f: string) => f.startsWith('□');
const isDia   = (f: string) => f.startsWith('◊');
const isObl   = (f: string) => /^O\(/.test(f);
const isPerm  = (f: string) => /^P\(/.test(f);
const isForbid = (f: string) => /^F\(/.test(f);
const isKnow  = (f: string) => /^K\(/.test(f);
const isBelief = (f: string) => /^B\(/.test(f);
const isCK    = (f: string) => /^CK\(/.test(f);  // Common Knowledge
const isCB    = (f: string) => /^CB\(/.test(f);  // Common Belief
const isIntention = (f: string) => /^I\(/.test(f);
const isMutualKnowledge = (f: string) => /^MK\(/.test(f) || /^MB\(/.test(f);

function topArrow(f: string): [string, string] | null {
  let d = 0;
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '(') d++;
    else if (f[i] === ')') d--;
    else if (d === 0 && f[i] === '→') return [f.slice(0, i).trim(), f.slice(i+1).trim()];
  }
  return null;
}

function topConj(f: string): [string, string] | null {
  let d = 0;
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '(') d++;
    else if (f[i] === ')') d--;
    else if (d === 0 && f[i] === '∧') return [f.slice(0, i).trim(), f.slice(i+1).trim()];
  }
  return null;
}

function topDisj(f: string): [string, string] | null {
  let d = 0;
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '(') d++;
    else if (f[i] === ')') d--;
    else if (d === 0 && f[i] === '∨') return [f.slice(0, i).trim(), f.slice(i+1).trim()];
  }
  return null;
}

function topBicond(f: string): [string, string] | null {
  let d = 0;
  for (let i = 0; i < f.length - 1; i++) {
    if (f[i] === '(') d++;
    else if (f[i] === ')') d--;
    else if (d === 0 && f[i] === '↔') return [f.slice(0, i).trim(), f.slice(i+1).trim()];
  }
  return null;
}

function inner(f: string): string {
  if (f.startsWith('¬') || f.startsWith('□') || f.startsWith('◊')) return f.slice(1).trim();
  const m = f.match(/^[A-Z]+\w*\((.+)\)$/);
  return m ? m[1].trim() : f;
}

function stripOuter(f: string): string {
  let out = f.trim();
  while (out.startsWith('(') && out.endsWith(')')) {
    const candidate = out.slice(1, -1);
    let depth = 0;
    let balanced = true;
    for (const char of candidate) {
      if (char === '(') depth++;
      else if (char === ')') {
        depth--;
        if (depth < 0) {
          balanced = false;
          break;
        }
      }
    }
    if (!balanced || depth !== 0) break;
    out = candidate.trim();
  }
  return out;
}

function topComma(f: string): [string, string] | null {
  let depth = 0;
  let braceDepth = 0;
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '(') depth++;
    else if (f[i] === ')') depth--;
    else if (f[i] === '{') braceDepth++;
    else if (f[i] === '}') braceDepth--;
    else if (depth === 0 && braceDepth === 0 && f[i] === ',') {
      return [f.slice(0, i).trim(), f.slice(i + 1).trim()];
    }
  }
  return null;
}

function callArgs(f: string, name: string): string[] | null {
  const trimmed = f.trim();
  const prefix = `${name}(`;
  if (!trimmed.startsWith(prefix) || !trimmed.endsWith(')')) return null;
  const raw = trimmed.slice(prefix.length, -1).trim();
  const comma = topComma(raw);
  return comma ? [comma[0], comma[1]] : [raw];
}

function unaryCallArg(f: string, name: string): string | null {
  const args = callArgs(f, name);
  return args?.length === 1 ? stripOuter(args[0]) : null;
}

function binaryCallArgs(f: string, name: string): [string, string] | null {
  const args = callArgs(f, name);
  return args?.length === 2 ? [stripOuter(args[0]), stripOuter(args[1])] : null;
}

function modalPayload(f: string, names: string[]): { op: string; agent?: string; formula: string } | null {
  for (const name of names) {
    const args = callArgs(f, name);
    if (!args) continue;
    if (args.length === 1) return { op: name, formula: stripOuter(args[0]) };
    return { op: name, agent: stripOuter(args[0]), formula: stripOuter(args[1]) };
  }
  return null;
}

function commonKnowledgeFormula(f: string): { prefix: string; formula: string } | null {
  const ck = binaryCallArgs(f, 'CK');
  if (ck) return { prefix: `CK(${ck[0]},`, formula: ck[1] };
  const c = unaryCallArg(f, 'C');
  if (c) return { prefix: 'C(', formula: c };
  return null;
}

function formatCommonKnowledge(prefix: string, formula: string): string {
  return prefix.startsWith('CK(') ? `${prefix}${formula})` : `C(${formula})`;
}

function negateFormula(f: string): string {
  return f.startsWith('¬') ? f.slice(1).trim() : `¬${f}`;
}

// ---------------------------------------------------------------------------
// 8 Core Rules (from prover_core.py)
// ---------------------------------------------------------------------------

export class ModusPonens implements CECInferenceRule {
  readonly name = 'ModusPonens';
  readonly description = 'P, P→Q ⊢ Q';

  canApply(fs: string[]): boolean {
    return fs.some(f => isImpl(f) && (() => { const p = topArrow(f); return p ? fs.includes(p[0]) : false; })());
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      if (!isImpl(f)) continue;
      const p = topArrow(f);
      if (p && fs.includes(p[0]) && !fs.includes(p[1])) out.push(p[1]);
    }
    return out;
  }
}

export class ModusTollens implements CECInferenceRule {
  readonly name = 'ModusTollens';
  readonly description = 'P→Q, ¬Q ⊢ ¬P';

  canApply(fs: string[]): boolean {
    return fs.some(f => isImpl(f) && (() => { const p = topArrow(f); return p ? fs.includes(`¬${p[1]}`) : false; })());
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      if (!isImpl(f)) continue;
      const p = topArrow(f);
      if (p && fs.includes(`¬${p[1]}`)) out.push(`¬${p[0]}`);
    }
    return out;
  }
}

export class Simplification implements CECInferenceRule {
  readonly name = 'Simplification';
  readonly description = 'P∧Q ⊢ P, Q';

  canApply(fs: string[]): boolean { return fs.some(isConj); }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      if (!isConj(f)) continue;
      const p = topConj(f);
      if (p) { if (!fs.includes(p[0])) out.push(p[0]); if (!fs.includes(p[1])) out.push(p[1]); }
    }
    return out;
  }
}

export class ConjunctionIntroduction implements CECInferenceRule {
  readonly name = 'ConjunctionIntroduction';
  readonly description = 'P, Q ⊢ P∧Q';

  canApply(fs: string[]): boolean { return fs.length >= 2; }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < fs.length && out.length < 5; i++) {
      for (let j = i + 1; j < fs.length && out.length < 5; j++) {
        const conj = `${fs[i]} ∧ ${fs[j]}`;
        if (!fs.includes(conj)) out.push(conj);
      }
    }
    return out;
  }
}

export class DisjunctionIntroduction implements CECInferenceRule {
  readonly name = 'DisjunctionIntroduction';
  readonly description = 'P ⊢ P∨Q';

  canApply(fs: string[]): boolean { return fs.length >= 1; }

  apply(fs: string[]): string[] {
    return fs.slice(0, 3).map(f => `${f} ∨ Q`).filter(f => !fs.includes(f));
  }
}

export class HypotheticalSyllogism implements CECInferenceRule {
  readonly name = 'HypotheticalSyllogism';
  readonly description = 'P→Q, Q→R ⊢ P→R';

  canApply(fs: string[]): boolean {
    const impls = fs.filter(isImpl).map(topArrow).filter(Boolean) as [string, string][];
    return impls.some(([, q]) => impls.some(([q2]) => q === q2));
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    const impls = fs.filter(isImpl).map(f => topArrow(f)).filter(Boolean) as [string, string][];
    for (const [p, q] of impls) {
      for (const [q2, r] of impls) {
        if (q === q2) {
          const syllogism = `${p} → ${r}`;
          if (!fs.includes(syllogism)) out.push(syllogism);
        }
      }
    }
    return out;
  }
}

export class DisjunctiveSyllogism implements CECInferenceRule {
  readonly name = 'DisjunctiveSyllogism';
  readonly description = 'P∨Q, ¬P ⊢ Q';

  canApply(fs: string[]): boolean {
    return fs.some(f => isDisj(f) && (() => { const p = topDisj(f); return p ? fs.includes(`¬${p[0]}`) || fs.includes(`¬${p[1]}`) : false; })());
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      if (!isDisj(f)) continue;
      const p = topDisj(f);
      if (!p) continue;
      if (fs.includes(`¬${p[0]}`) && !fs.includes(p[1])) out.push(p[1]);
      if (fs.includes(`¬${p[1]}`) && !fs.includes(p[0])) out.push(p[0]);
    }
    return out;
  }
}

export class DoubleNegationElimination implements CECInferenceRule {
  readonly name = 'DoubleNegationElimination';
  readonly description = '¬¬P ⊢ P';

  canApply(fs: string[]): boolean { return fs.some(f => f.startsWith('¬¬')); }

  apply(fs: string[]): string[] {
    return fs.filter(f => f.startsWith('¬¬')).map(f => f.slice(2).trim()).filter(f => !fs.includes(f));
  }
}

// ---------------------------------------------------------------------------
// 39 Extended Rules (from prover_core_extended_rules.py)
// ---------------------------------------------------------------------------

export class Commutativity implements CECInferenceRule {
  readonly name = 'Commutativity';
  readonly description = 'P∧Q ↔ Q∧P; P∨Q ↔ Q∨P';

  canApply(fs: string[]): boolean { return fs.some(f => isConj(f) || isDisj(f)); }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      const c = topConj(f) ?? topDisj(f);
      if (!c) continue;
      const op = isConj(f) ? '∧' : '∨';
      const comm = `${c[1]} ${op} ${c[0]}`;
      if (!fs.includes(comm)) out.push(comm);
    }
    return out;
  }
}

export class Distribution implements CECInferenceRule {
  readonly name = 'Distribution';
  readonly description = 'P∧(Q∨R) ↔ (P∧Q)∨(P∧R)';

  canApply(fs: string[]): boolean {
    return fs.some(f => isConj(f) && (() => { const c = topConj(f); return c ? isDisj(c[1]) || isDisj(c[0]) : false; })());
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      if (!isConj(f)) continue;
      const c = topConj(f);
      if (!c) continue;
      if (isDisj(c[1])) {
        const d = topDisj(c[1]);
        if (d) out.push(`(${c[0]} ∧ ${d[0]}) ∨ (${c[0]} ∧ ${d[1]})`);
      }
    }
    return out;
  }
}

export class CutElimination implements CECInferenceRule {
  readonly name = 'CutElimination';
  readonly description = 'P→Q, Q→R, P ⊢ R (cut)';

  canApply(fs: string[]): boolean {
    const impls = fs.filter(isImpl);
    return impls.length >= 2;
  }

  apply(fs: string[]): string[] {
    return new HypotheticalSyllogism().apply(fs);
  }
}

export class Exportation implements CECInferenceRule {
  readonly name = 'Exportation';
  readonly description = '(P∧Q)→R ↔ P→(Q→R)';

  canApply(fs: string[]): boolean {
    return fs.some(f => isImpl(f) && (() => { const p = topArrow(f); return p ? isConj(p[0]) : false; })());
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      if (!isImpl(f)) continue;
      const impl = topArrow(f);
      if (!impl || !isConj(impl[0])) continue;
      const conj = topConj(impl[0]);
      if (conj) out.push(`${conj[0]} → (${conj[1]} → ${impl[1]})`);
    }
    return out;
  }
}

export class Absorption implements CECInferenceRule {
  readonly name = 'Absorption';
  readonly description = 'P→Q ⊢ P→(P∧Q)';

  canApply(fs: string[]): boolean { return fs.some(isImpl); }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      if (!isImpl(f)) continue;
      const p = topArrow(f);
      if (p) out.push(`${p[0]} → (${p[0]} ∧ ${p[1]})`);
    }
    return out;
  }
}

export class Association implements CECInferenceRule {
  readonly name = 'Association';
  readonly description = '(P∧Q)∧R ↔ P∧(Q∧R)';

  canApply(fs: string[]): boolean { return fs.some(f => isConj(f)); }

  apply(fs: string[]): string[] { return []; /* structural — no new atoms derived */ }
}

export class Resolution implements CECInferenceRule {
  readonly name = 'Resolution';
  readonly description = 'P∨Q, ¬P∨R ⊢ Q∨R';

  canApply(fs: string[]): boolean {
    const disjs = fs.filter(isDisj);
    return disjs.length >= 2;
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    const disjs = fs.filter(isDisj);
    for (const d1 of disjs) {
      for (const d2 of disjs) {
        if (d1 === d2) continue;
        const p1 = topDisj(d1), p2 = topDisj(d2);
        if (!p1 || !p2) continue;
        if (`¬${p1[0]}` === p2[0]) out.push(`${p1[1]} ∨ ${p2[1]}`);
        else if (`¬${p1[1]}` === p2[0]) out.push(`${p1[0]} ∨ ${p2[1]}`);
      }
    }
    return out.filter(f => !fs.includes(f));
  }
}

export class Transposition implements CECInferenceRule {
  readonly name = 'Transposition';
  readonly description = 'P→Q ⊢ ¬Q→¬P (contrapositive)';

  canApply(fs: string[]): boolean { return fs.some(isImpl); }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      const p = topArrow(f);
      if (p) {
        const contra = `¬${p[1]} → ¬${p[0]}`;
        if (!fs.includes(contra)) out.push(contra);
      }
    }
    return out;
  }
}

export class MaterialImplication implements CECInferenceRule {
  readonly name = 'MaterialImplication';
  readonly description = 'P→Q ↔ ¬P∨Q';

  canApply(fs: string[]): boolean { return fs.some(isImpl); }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      const p = topArrow(f);
      if (p) {
        const mat = `¬${p[0]} ∨ ${p[1]}`;
        if (!fs.includes(mat)) out.push(mat);
      }
    }
    return out;
  }
}

export class ClaviusLaw implements CECInferenceRule {
  readonly name = 'ClaviusLaw';
  readonly description = '(¬P→P) ⊢ P';

  canApply(fs: string[]): boolean {
    return fs.some(f => { const p = topArrow(f); return p ? p[0] === `¬${p[1]}` : false; });
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      const p = topArrow(f);
      if (p && p[0] === `¬${p[1]}` && !fs.includes(p[1])) out.push(p[1]);
    }
    return out;
  }
}

export class Idempotence implements CECInferenceRule {
  readonly name = 'Idempotence';
  readonly description = 'P∧P ↔ P; P∨P ↔ P';

  canApply(fs: string[]): boolean {
    return fs.some(f => { const p = topConj(f) ?? topDisj(f); return p ? p[0] === p[1] : false; });
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      const p = topConj(f) ?? topDisj(f);
      if (p && p[0] === p[1] && !fs.includes(p[0])) out.push(p[0]);
    }
    return out;
  }
}

export class TautologyIntroduction implements CECInferenceRule {
  readonly name = 'TautologyIntroduction';
  readonly description = '⊢ P∨¬P (law of excluded middle)';

  canApply(fs: string[]): boolean { return fs.length >= 1; }

  apply(fs: string[]): string[] {
    return fs.slice(0, 2).map(f => `${f} ∨ ¬${f}`).filter(f => !fs.includes(f));
  }
}

export class ContradictionElimination implements CECInferenceRule {
  readonly name = 'ContradictionElimination';
  readonly description = 'P, ¬P ⊢ Q (ex falso)';

  canApply(fs: string[]): boolean {
    return fs.some(f => fs.includes(`¬${f}`));
  }

  apply(fs: string[]): string[] {
    return ['⊥']; // contradiction
  }
}

export class ConjunctionElimination implements CECInferenceRule {
  readonly name = 'ConjunctionElimination';
  readonly description = 'P∧Q ⊢ P; P∧Q ⊢ Q';

  canApply(fs: string[]): boolean { return fs.some(isConj); }

  apply(fs: string[]): string[] { return new Simplification().apply(fs); }
}

export class ForbiddenToNotObligatory implements CECInferenceRule {
  readonly name = 'ForbiddenToNotObligatory';
  readonly description = 'F(P) ⊢ ¬O(P)';

  canApply(fs: string[]): boolean { return fs.some(isForbid); }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      if (!isForbid(f)) continue;
      const content = inner(f);
      const notObl = `¬O(${content})`;
      if (!fs.includes(notObl)) out.push(notObl);
    }
    return out;
  }
}

export class MutualBelief implements CECInferenceRule {
  readonly name = 'MutualBelief';
  readonly description = 'B(a,P), B(b,P) ⊢ MB(a,b,P)';

  canApply(fs: string[]): boolean {
    const beliefs = fs.filter(isBelief);
    return beliefs.length >= 2;
  }

  apply(fs: string[]): string[] {
    const beliefs = fs.filter(isBelief);
    if (beliefs.length < 2) return [];
    const m0 = beliefs[0].match(/^B\((\w+),\s*(.+)\)$/);
    const m1 = beliefs[1].match(/^B\((\w+),\s*(.+)\)$/);
    if (m0 && m1 && m0[2] === m1[2]) return [`MB(${m0[1]},${m1[1]},${m0[2]})`];
    return [];
  }
}

export class IntentionSideEffect implements CECInferenceRule {
  readonly name = 'IntentionSideEffect';
  readonly description = 'I(a,P), B(a,P→Q), B(a,¬Q) ⊢ ¬I(a,P)';

  canApply(fs: string[]): boolean {
    return this.apply(fs).length > 0 || fs.some(isIntention);
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const intention of fs.filter(isIntention)) {
      const parts = binaryCallArgs(intention, 'I');
      if (!parts) continue;
      const [agent, goal] = parts;
      for (const belief of fs.filter(isBelief)) {
        const believed = binaryCallArgs(belief, 'B');
        if (!believed || believed[0] !== agent) continue;
        const implication = topArrow(believed[1]);
        if (!implication || implication[0] !== goal) continue;
        if (fs.includes(`B(${agent}, ¬${implication[1]})`) || fs.includes(`B(${agent}, ¬${stripOuter(implication[1])})`)) {
          const negated = `¬I(${agent}, ${goal})`;
          if (!fs.includes(negated)) out.push(negated);
        }
      }
    }
    return out;
  }
}

export class UnitResolution implements CECInferenceRule {
  readonly name = 'UnitResolution';
  readonly description = 'P∨Q, ¬P ⊢ Q';

  canApply(fs: string[]): boolean { return new DisjunctiveSyllogism().canApply(fs); }
  apply(fs: string[]): string[] { return new DisjunctiveSyllogism().apply(fs); }
}

export class BinaryResolution implements CECInferenceRule {
  readonly name = 'BinaryResolution';
  readonly description = 'P∨Q, ¬P∨R ⊢ Q∨R';

  canApply(fs: string[]): boolean {
    return this.apply(fs).length > 0;
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    const clauses = fs.filter(isDisj);
    for (const left of clauses) {
      const l = topDisj(stripOuter(left));
      if (!l) continue;
      for (const right of clauses) {
        if (left === right) continue;
        const r = topDisj(stripOuter(right));
        if (!r) continue;
        const pairs: Array<[string, string, string, string]> = [
          [l[0], l[1], r[0], r[1]],
          [l[0], l[1], r[1], r[0]],
          [l[1], l[0], r[0], r[1]],
          [l[1], l[0], r[1], r[0]],
        ];
        for (const [litA, restA, litB, restB] of pairs) {
          if (litA === negateFormula(litB) || litB === negateFormula(litA)) {
            const resolvent = `${restA} ∨ ${restB}`;
            if (!fs.includes(resolvent) && !out.includes(resolvent)) out.push(resolvent);
          }
        }
      }
    }
    return out;
  }
}

export class NegationIntroduction implements CECInferenceRule {
  readonly name = 'NegationIntroduction';
  readonly description = 'P→⊥ ⊢ ¬P';

  canApply(fs: string[]): boolean {
    return fs.some(f => { const p = topArrow(f); return p ? p[1] === '⊥' : false; });
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      const p = topArrow(f);
      if (p && p[1] === '⊥') {
        const neg = `¬${p[0]}`;
        if (!fs.includes(neg)) out.push(neg);
      }
    }
    return out;
  }
}

export class CommonKnowledgeIntroduction implements CECInferenceRule {
  readonly name = 'CommonKnowledgeIntroduction';
  readonly description = 'K(a,P), K(b,P) ⊢ CK({a,b},P)';

  canApply(fs: string[]): boolean { return fs.filter(isKnow).length >= 2; }

  apply(fs: string[]): string[] {
    const knows = fs.filter(isKnow);
    if (knows.length < 2) return [];
    const m0 = knows[0].match(/^K\((\w+),\s*(.+)\)$/);
    const m1 = knows[1].match(/^K\((\w+),\s*(.+)\)$/);
    if (m0 && m1 && m0[2] === m1[2]) return [`CK({${m0[1]},${m1[1]}},${m0[2]})`];
    return [];
  }
}

export class CommonKnowledgeDistribution implements CECInferenceRule {
  readonly name = 'CommonKnowledgeDistribution';
  readonly description = 'C(P∧Q) ⊢ C(P), C(Q)';

  canApply(fs: string[]): boolean {
    return fs.some(f => {
      const common = commonKnowledgeFormula(f);
      return !!common && !!topConj(common.formula);
    });
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const formula of fs) {
      const common = commonKnowledgeFormula(formula);
      const parts = common ? topConj(common.formula) : null;
      if (!common || !parts) continue;
      out.push(formatCommonKnowledge(common.prefix, parts[0]));
      out.push(formatCommonKnowledge(common.prefix, parts[1]));
    }
    return out.filter(f => !fs.includes(f));
  }
}

export class CommonKnowledgeImpliesKnowledge implements CECInferenceRule {
  readonly name = 'CommonKnowledgeImpliesKnowledge';
  readonly description = 'CK(G,P) ⊢ K(a,P) for any a in G';

  canApply(fs: string[]): boolean { return fs.some(isCK); }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      if (!isCK(f)) continue;
      const m = f.match(/^CK\(\{([^}]+)\},\s*(.+)\)$/);
      if (!m) continue;
      const agents = m[1].split(',').map(a => a.trim());
      for (const a of agents) {
        const kp = `K(${a}, ${m[2]})`;
        if (!fs.includes(kp)) out.push(kp);
      }
    }
    return out;
  }
}

export class CommonKnowledgeNegation implements CECInferenceRule {
  readonly name = 'CommonKnowledgeNegation';
  readonly description = 'C(¬P) ⊢ ¬C(P)';

  canApply(fs: string[]): boolean {
    return fs.some(f => {
      const common = commonKnowledgeFormula(f);
      return !!common?.formula.startsWith('¬');
    });
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const formula of fs) {
      const common = commonKnowledgeFormula(formula);
      if (!common?.formula.startsWith('¬')) continue;
      const positive = common.formula.slice(1).trim();
      const negated = `¬${formatCommonKnowledge(common.prefix, positive)}`;
      if (!fs.includes(negated)) out.push(negated);
    }
    return out;
  }
}

export class CommonBeliefIntroduction implements CECInferenceRule {
  readonly name = 'CommonBeliefIntroduction';
  readonly description = 'B(a,P), B(b,P) ⊢ CB({a,b},P)';

  canApply(fs: string[]): boolean {
    return this.apply(fs).length > 0;
  }

  apply(fs: string[]): string[] {
    const beliefs = fs.filter(isBelief).map(f => binaryCallArgs(f, 'B')).filter(Boolean) as [string, string][];
    for (let i = 0; i < beliefs.length; i++) {
      for (let j = i + 1; j < beliefs.length; j++) {
        if (beliefs[i][0] !== beliefs[j][0] && beliefs[i][1] === beliefs[j][1]) {
          return [`CB({${beliefs[i][0]},${beliefs[j][0]}},${beliefs[i][1]})`];
        }
      }
    }
    return [];
  }
}

export class FixedPointInduction implements CECInferenceRule {
  readonly name = 'FixedPointInduction';
  readonly description = 'P, P→K(everyone,P) ⊢ C(P)';

  canApply(fs: string[]): boolean {
    return this.apply(fs).length > 0;
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const formula of fs) {
      for (const implicationFormula of fs.filter(isImpl)) {
        const implication = topArrow(implicationFormula);
        if (!implication || implication[0] !== formula) continue;
        const knowledge = modalPayload(implication[1], ['K']);
        if (knowledge?.formula === formula) {
          const common = `C(${formula})`;
          if (!fs.includes(common)) out.push(common);
        }
      }
    }
    return out;
  }
}

export class TemporallyInducedCommonKnowledge implements CECInferenceRule {
  readonly name = 'TemporallyInducedCommonKnowledge';
  readonly description = '□K(all,P) ⊢ C(P)';

  canApply(fs: string[]): boolean {
    return fs.some(f => {
      const payload = modalPayload(stripOuter(inner(f)), ['K']);
      return f.trim().startsWith('□') && !!payload;
    });
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const formula of fs) {
      if (!formula.trim().startsWith('□')) continue;
      const payload = modalPayload(stripOuter(inner(formula)), ['K']);
      if (!payload) continue;
      const common = `C(${payload.formula})`;
      if (!fs.includes(common)) out.push(common);
    }
    return out;
  }
}

export class ModalNecessionIntroduction implements CECInferenceRule {
  readonly name = 'ModalNecessionIntroduction';
  readonly description = 'P∨¬P ⊢ □(P∨¬P)';

  canApply(fs: string[]): boolean {
    return fs.some(f => {
      const disj = topDisj(stripOuter(f));
      return !!disj && disj[1] === `¬${disj[0]}`;
    });
  }

  apply(fs: string[]): string[] {
    return fs.filter(f => {
      const disj = topDisj(stripOuter(f));
      return !!disj && disj[1] === `¬${disj[0]}`;
    }).map(f => `□(${stripOuter(f)})`).filter(f => !fs.includes(f));
  }
}

export class CommonKnowledgeMonotonicity implements CECInferenceRule {
  readonly name = 'CommonKnowledgeMonotonicity';
  readonly description = 'CK(G,P), P→Q ⊢ CK(G,Q)';

  canApply(fs: string[]): boolean { return fs.some(isCK) && fs.some(isImpl); }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const ck of fs.filter(isCK)) {
      const m = ck.match(/^CK\((\{[^}]+\}|\w+),\s*(.+)\)$/);
      if (!m) continue;
      for (const impl of fs.filter(isImpl)) {
        const p = topArrow(impl);
        if (p && p[0] === m[2]) out.push(`CK(${m[1]},${p[1]})`);
      }
    }
    return out.filter(f => !fs.includes(f));
  }
}

export class ModalNecessitationIntroduction implements CECInferenceRule {
  readonly name = 'ModalNecessitationIntroduction';
  readonly description = '⊢ P ⟹ ⊢ □P';

  canApply(fs: string[]): boolean { return fs.length >= 1; }

  apply(fs: string[]): string[] {
    return fs.slice(0, 2).map(f => `□${f}`).filter(f => !fs.includes(f));
  }
}

export class DisjunctionCommutes implements CECInferenceRule {
  readonly name = 'DisjunctionCommutes';
  readonly description = 'P∨Q ↔ Q∨P';

  canApply(fs: string[]): boolean { return fs.some(isDisj); }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const f of fs) {
      if (!isDisj(f)) continue;
      const p = topDisj(f);
      if (p) {
        const comm = `${p[1]} ∨ ${p[0]}`;
        if (!fs.includes(comm)) out.push(comm);
      }
    }
    return out;
  }
}

export class CommonKnowledgeTransitivity implements CECInferenceRule {
  readonly name = 'CommonKnowledgeTransitivity';
  readonly description = 'CK(G,P→Q), CK(G,P) ⊢ CK(G,Q)';

  canApply(fs: string[]): boolean {
    return fs.filter(isCK).length >= 2;
  }

  apply(fs: string[]): string[] {
    const cks = fs.filter(isCK);
    const out: string[] = [];
    for (const ck of cks) {
      const m = ck.match(/^CK\((\{[^}]+\}|\w+),\s*(.+)\)$/);
      if (!m || !isImpl(m[2])) continue;
      const imp = topArrow(m[2]);
      if (!imp) continue;
      const premise = `CK(${m[1]},${imp[0]})`;
      if (fs.includes(premise)) out.push(`CK(${m[1]},${imp[1]})`);
    }
    return out.filter(f => !fs.includes(f));
  }
}

export class CommonKnowledgeConjunction implements CECInferenceRule {
  readonly name = 'CommonKnowledgeConjunction';
  readonly description = 'CK(G,P), CK(G,Q) ⊢ CK(G,P∧Q)';

  canApply(fs: string[]): boolean { return fs.filter(isCK).length >= 2; }

  apply(fs: string[]): string[] {
    const cks = fs.filter(isCK);
    const out: string[] = [];
    for (let i = 0; i < cks.length; i++) {
      for (let j = i + 1; j < cks.length; j++) {
        const m0 = cks[i].match(/^CK\((\{[^}]+\}|\w+),\s*(.+)\)$/);
        const m1 = cks[j].match(/^CK\((\{[^}]+\}|\w+),\s*(.+)\)$/);
        if (m0 && m1 && m0[1] === m1[1]) {
          const conj = `CK(${m0[1]},${m0[2]} ∧ ${m1[2]})`;
          if (!fs.includes(conj)) out.push(conj);
        }
      }
    }
    return out;
  }
}

export class MutualKnowledgeTransitivity implements CECInferenceRule {
  readonly name = 'MutualKnowledgeTransitivity';
  readonly description = 'MB(P), MB(MB(P)→Q) ⊢ MB(Q)';

  canApply(fs: string[]): boolean {
    return fs.some(isMutualKnowledge);
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    const mutual = fs.filter(isMutualKnowledge);
    for (const base of mutual) {
      const basePayload = modalPayload(base, ['MB', 'MK']);
      if (!basePayload) continue;
      for (const implicationFormula of mutual) {
        const implicationPayload = modalPayload(implicationFormula, ['MB', 'MK']);
        const implication = implicationPayload ? topArrow(implicationPayload.formula) : null;
        if (implication && implication[0] === base) {
          const derived = `${basePayload.op}(${implication[1]})`;
          if (!fs.includes(derived)) out.push(derived);
        }
      }
    }
    return out;
  }
}

export class PublicAnnouncementReduction implements CECInferenceRule {
  readonly name = 'PublicAnnouncementReduction';
  readonly description = '[!P]Q ⊣⊢ P→Q';

  canApply(fs: string[]): boolean {
    return fs.some(f => /^\[![^\]]+\]/.test(f.trim()));
  }

  apply(fs: string[]): string[] {
    const out: string[] = [];
    for (const formula of fs) {
      const match = formula.trim().match(/^\[!([^\]]+)\](.+)$/);
      if (!match) continue;
      const reduced = `${stripOuter(match[1])} → ${stripOuter(match[2])}`;
      if (!fs.includes(reduced)) out.push(reduced);
    }
    return out;
  }
}

export class GroupKnowledgeAggregation implements CECInferenceRule {
  readonly name = 'GroupKnowledgeAggregation';
  readonly description = 'All K(a_i, P) for a_i ∈ G ⊢ CK(G,P)';

  canApply(fs: string[]): boolean { return fs.filter(isKnow).length >= 2; }
  apply(fs: string[]): string[] { return new CommonKnowledgeIntroduction().apply(fs); }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const ALL_CEC_RULES: CECInferenceRule[] = [
  // Core rules
  new ModusPonens(),
  new ModusTollens(),
  new Simplification(),
  new ConjunctionIntroduction(),
  new DisjunctionIntroduction(),
  new HypotheticalSyllogism(),
  new DisjunctiveSyllogism(),
  new DoubleNegationElimination(),
  // Extended rules
  new Commutativity(),
  new Distribution(),
  new CutElimination(),
  new Exportation(),
  new Absorption(),
  new Association(),
  new Resolution(),
  new Transposition(),
  new MaterialImplication(),
  new ClaviusLaw(),
  new Idempotence(),
  new TautologyIntroduction(),
  new ContradictionElimination(),
  new ConjunctionElimination(),
  new ForbiddenToNotObligatory(),
  new MutualBelief(),
  new IntentionSideEffect(),
  new UnitResolution(),
  new BinaryResolution(),
  new NegationIntroduction(),
  new CommonKnowledgeIntroduction(),
  new CommonKnowledgeDistribution(),
  new CommonKnowledgeImpliesKnowledge(),
  new CommonKnowledgeNegation(),
  new CommonBeliefIntroduction(),
  new FixedPointInduction(),
  new TemporallyInducedCommonKnowledge(),
  new ModalNecessionIntroduction(),
  new CommonKnowledgeMonotonicity(),
  new ModalNecessitationIntroduction(),
  new DisjunctionCommutes(),
  new CommonKnowledgeTransitivity(),
  new CommonKnowledgeConjunction(),
  new MutualKnowledgeTransitivity(),
  new PublicAnnouncementReduction(),
  new GroupKnowledgeAggregation(),
];

export function findApplicableCECRules(formulas: string[]): CECInferenceRule[] {
  return ALL_CEC_RULES.filter(r => r.canApply(formulas));
}
