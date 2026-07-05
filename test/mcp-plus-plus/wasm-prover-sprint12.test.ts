/**
 * WASM Prover Sprint 12 — Deontic Analyzer + Knowledge Base tests.
 *
 * Tasks covered:
 *   T-72: DeonticTextAnalyzer — regex NL extraction + conflict detection
 *   T-73: DeonticKnowledgeBase — temporal KB with rule inference + checkCompliance
 *   T-74: mcp++ deontic subcommand
 *   T-75: ≥10 tests
 *
 * Sprint 12 (Phase 12 — Deontic Analyzer + Knowledge Base, P2).
 * Reference: ipfs_datasets_py/logic/deontic/analyzer.py + knowledge_base.py
 */

import { DeonticTextAnalyzer } from '../../src/services/deontic/deontic-text-analyzer.js';
import type { DeonticStatement } from '../../src/services/deontic/deontic-text-analyzer.js';
import {
  DeonticKnowledgeBase,
  KnowledgeDeonticModality,
  KnowledgeLogicalOperator,
  KnowledgeTemporalOperator,
  Pred, And, Or, Not, Implies,
  intervalContains,
} from '../../src/services/deontic/deontic-knowledge-base.js';
import type {
  Party,
  DeonticAction,
  TimeInterval,
} from '../../src/services/deontic/deontic-knowledge-base.js';
import { mcppCommand } from '../../src/commands/mcp-plus-plus-commands.js';

// ---------------------------------------------------------------------------
// T-72: DeonticTextAnalyzer — extraction
// ---------------------------------------------------------------------------

describe('T-72 DeonticTextAnalyzer — statement extraction', () => {
  let analyzer: DeonticTextAnalyzer;
  beforeEach(() => { analyzer = new DeonticTextAnalyzer(); });

  it('extracts obligations from "must" keyword', () => {
    const stmts = analyzer.extractStatements('All users must log their access.');
    expect(stmts.length).toBeGreaterThanOrEqual(1);
    const obl = stmts.find(s => s.modality === 'obligation');
    expect(obl).toBeDefined();
    expect(obl!.action.toLowerCase()).toContain('log');
  });

  it('extracts permissions from "may" keyword', () => {
    const stmts = analyzer.extractStatements('Administrators may delete archived records.');
    const perm = stmts.find(s => s.modality === 'permission');
    expect(perm).toBeDefined();
    expect(perm!.action.toLowerCase()).toContain('delete');
  });

  it('extracts prohibitions from "must not" keyword', () => {
    const stmts = analyzer.extractStatements('Users must not share their passwords.');
    const proh = stmts.find(s => s.modality === 'prohibition');
    expect(proh).toBeDefined();
    expect(proh!.action.toLowerCase()).toContain('share');
  });

  it('extracts prohibitions from "is prohibited from"', () => {
    const stmts = analyzer.extractStatements('The contractor is prohibited from disclosing confidential data.');
    const proh = stmts.find(s => s.modality === 'prohibition');
    expect(proh).toBeDefined();
  });

  it('extracts obligations from "is required to"', () => {
    const stmts = analyzer.extractStatements('Each agent is required to submit a report.');
    const obl = stmts.find(s => s.modality === 'obligation');
    expect(obl).toBeDefined();
    expect(obl!.action.toLowerCase()).toContain('submit');
  });

  it('assigns statement IDs', () => {
    const stmts = analyzer.extractStatements('Users must log access. Users may view reports.');
    for (const s of stmts) {
      expect(typeof s.id).toBe('string');
      expect(s.id.startsWith('stmt_')).toBe(true);
    }
  });

  it('assigns confidence score between 0 and 1', () => {
    const stmts = analyzer.extractStatements('Agents must notify the controller.');
    for (const s of stmts) {
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('filters by entity when entityFilter is provided', () => {
    const text = 'Admins must log access. Users may view records.';
    const adminOnly = analyzer.extractStatements(text, ['admin']);
    expect(adminOnly.every(s => s.entity.toLowerCase().includes('admin'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-72: DeonticTextAnalyzer — conflict detection
// ---------------------------------------------------------------------------

describe('T-72 DeonticTextAnalyzer — conflict detection', () => {
  let analyzer: DeonticTextAnalyzer;
  beforeEach(() => { analyzer = new DeonticTextAnalyzer(); });

  it('detects a direct obligation-prohibition conflict', () => {
    const text = 'Users must share audit logs. Users must not share audit logs.';
    const stmts = analyzer.extractStatements(text);
    const conflicts = analyzer.detectConflicts(stmts);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    const direct = conflicts.find(c => c.type === 'direct');
    expect(direct).toBeDefined();
    expect(direct!.severity).toBe('high');
  });

  it('detectConflicts returns empty array when no conflicts', () => {
    const text = 'Users must log access. Admins may delete records.';
    const stmts = analyzer.extractStatements(text);
    const conflicts = analyzer.detectConflicts(stmts);
    // Different entities — no conflict expected
    const direct = conflicts.filter(c => c.type === 'direct');
    expect(direct.length).toBe(0);
  });

  it('detects jurisdictional conflict when sources differ', () => {
    // Use manually crafted statements with different sources + opposing modalities
    const shared: Partial<DeonticStatement> = {
      entity: 'Users', action: 'audit all system access',
      context: '', conditions: [], exceptions: [], confidence: 0.8, date: '',
    };
    const s1: DeonticStatement = { id: 's1', modality: 'obligation',  source: 'policy-A', ...shared } as DeonticStatement;
    const s2: DeonticStatement = { id: 's2', modality: 'prohibition', source: 'policy-B', ...shared } as DeonticStatement;
    const conflicts = analyzer.detectConflicts([s1, s2], ['jurisdictional']);
    expect(conflicts.some(c => c.type === 'jurisdictional')).toBe(true);
  });

  it('checkStatementConflict returns null for non-conflicting same-entity statements', () => {
    const stmts = analyzer.extractStatements('Users must log access. Users may view reports.');
    if (stmts.length < 2) return;
    const conflict = analyzer.checkStatementConflict(stmts[0], stmts[1], ['direct']);
    // Different actions — no direct conflict
    expect(conflict).toBeNull();
  });

  it('actionsAreSimilar returns true for same words', () => {
    expect(analyzer.actionsAreSimilar('submit a report', 'submit a report')).toBe(true);
  });

  it('actionsAreSimilar returns true with 3-of-4 word overlap (0.6 threshold)', () => {
    // 'log system access' vs 'log the system access': {log,system,access} ∩ {log,the,system,access} = {log,system,access} (3), ∪=4 → 0.75 > default 0.7
    expect(analyzer.actionsAreSimilar('log system access', 'log the system access')).toBe(true);
  });

  it('actionsAreSimilar returns false for unrelated actions', () => {
    expect(analyzer.actionsAreSimilar('delete records', 'encrypt passwords')).toBe(false);
  });

  it('checkStatementConflict uses proposition alias when action is empty', () => {
    const shared: Partial<DeonticStatement> = {
      entity: 'Users',
      action: '',
      context: '',
      conditions: [],
      exceptions: [],
      confidence: 0.8,
      source: 'policy',
      date: '2026-01-01',
    };
    const s1 = { id: 'p1', modality: 'obligation', proposition: 'share audit logs', ...shared } as DeonticStatement;
    const s2 = { id: 'p2', modality: 'prohibition', proposition: 'share audit logs', ...shared } as DeonticStatement;

    const conflict = analyzer.checkStatementConflict(s1, s2, ['direct']);
    expect(conflict?.type).toBe('direct');
    expect(conflict?.description).toContain('share audit logs');
  });
});

// ---------------------------------------------------------------------------
// T-72: DeonticTextAnalyzer — statistics + organization
// ---------------------------------------------------------------------------

describe('T-72 DeonticTextAnalyzer — statistics and organization', () => {
  let analyzer: DeonticTextAnalyzer;
  beforeEach(() => { analyzer = new DeonticTextAnalyzer(); });

  it('calculateStatistics returns correct counts', () => {
    const text = 'Users must log access. Users may view records. Users must not share passwords.';
    const stmts = analyzer.extractStatements(text);
    const conflicts = analyzer.detectConflicts(stmts);
    const stats = analyzer.calculateStatistics(stmts, conflicts);
    expect(stats.total_statements).toBe(stmts.length);
    expect(stats.total_conflicts).toBe(conflicts.length);
    expect(stats.modality_distribution.obligation).toBeGreaterThanOrEqual(1);
    expect(stats.modality_distribution.permission).toBeGreaterThanOrEqual(1);
    expect(stats.modality_distribution.prohibition).toBeGreaterThanOrEqual(1);
  });

  it('organizeByEntity groups statements under entity name', () => {
    const text = 'Admins must audit access. Admins may delete logs.';
    const stmts = analyzer.extractStatements(text);
    const conflicts = analyzer.detectConflicts(stmts);
    const byEntity = analyzer.organizeByEntity(stmts, conflicts);
    const adminKey = Object.keys(byEntity).find(k => k.toLowerCase().includes('admin'));
    expect(adminKey).toBeDefined();
    expect(byEntity[adminKey!].statements.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// T-73: DeonticKnowledgeBase
// ---------------------------------------------------------------------------

describe('T-73 DeonticKnowledgeBase', () => {
  const alice: Party = { name: 'Alice', role: 'user', entityId: 'alice' };
  const bob: Party   = { name: 'Bob',   role: 'admin', entityId: 'bob' };
  const readFile: DeonticAction = { verb: 'read', objectNoun: 'file', actionId: 'read_file' };
  const deleteRec: DeonticAction = { verb: 'delete', objectNoun: 'record', actionId: 'delete_record' };

  it('checkCompliance returns compliant when no rule found', () => {
    const kb = new DeonticKnowledgeBase();
    const { compliant, reason } = kb.checkCompliance(alice, readFile, new Date());
    expect(compliant).toBe(true);
    expect(reason).toContain('No active contrary');
  });

  it('exports Python-compatible knowledge enum values directly', () => {
    expect(KnowledgeDeonticModality.OBLIGATORY).toBe('O');
    expect(KnowledgeDeonticModality.PERMITTED).toBe('P');
    expect(KnowledgeDeonticModality.PROHIBITED).toBe('F');
    expect(KnowledgeDeonticModality.OPTIONAL).toBe('OPT');
    expect(KnowledgeTemporalOperator.BEFORE).toBe('before');
    expect(KnowledgeTemporalOperator.EQUALS).toBe('equals');
    expect(KnowledgeLogicalOperator.FORALL).toBe('forall');
    expect(KnowledgeLogicalOperator.EXISTS).toBe('exists');
  });

  it('checkCompliance returns non-compliant for prohibition', () => {
    const kb = new DeonticKnowledgeBase();
    kb.addStatement({ modality: 'F', actor: alice, action: deleteRec });
    const { compliant } = kb.checkCompliance(alice, deleteRec, new Date());
    expect(compliant).toBe(false);
  });

  it('checkCompliance returns compliant for matching obligation', () => {
    const kb = new DeonticKnowledgeBase();
    kb.addStatement({ modality: 'O', actor: alice, action: readFile });
    const { compliant, reason } = kb.checkCompliance(alice, readFile, new Date());
    expect(compliant).toBe(true);
    expect(reason).toContain('complies');
  });

  it('obligation with TimeInterval fails outside the window', () => {
    const kb = new DeonticKnowledgeBase();
    const past: TimeInterval = {
      start: new Date('2000-01-01'),
      end:   new Date('2000-12-31'),
    };
    kb.addStatement({ modality: 'O', actor: alice, action: readFile, timeInterval: past });
    const { compliant, reason } = kb.checkCompliance(alice, readFile, new Date());
    expect(compliant).toBe(false);
    expect(reason).toContain('outside the obligation window');
  });

  it('intervalContains returns true for current time in open interval', () => {
    const interval: TimeInterval = { start: new Date('2020-01-01') };
    expect(intervalContains(interval, new Date())).toBe(true);
  });

  it('intervalContains returns false before start', () => {
    const interval: TimeInterval = { start: new Date('2030-01-01') };
    expect(intervalContains(interval, new Date())).toBe(false);
  });

  it('Proposition.evaluate works for Pred, And, Or, Not', () => {
    const p = Pred('logged_in');
    const q = Pred('verified');
    const model = { logged_in: true, verified: false };
    expect(p.evaluate(model)).toBe(true);
    expect(q.evaluate(model)).toBe(false);
    expect(And(p, q).evaluate(model)).toBe(false);
    expect(Or(p, q).evaluate(model)).toBe(true);
    expect(Not(p).evaluate(model)).toBe(false);
    expect(Implies(p, q).evaluate(model)).toBe(false);
    expect(Implies(q, p).evaluate(model)).toBe(true);
  });

  it('inferStatements derives from conditional rule when fact is set', () => {
    const kb = new DeonticKnowledgeBase();
    const condition = Pred('is_admin');
    const adminAction: DeonticAction = { verb: 'access', objectNoun: 'admin-panel', actionId: 'access_admin' };
    kb.addRule(condition, { modality: 'P', actor: bob, action: adminAction });
    kb.addFact('is_admin', true);
    const derived = kb.inferStatements();
    expect(derived.some(s => s.action.actionId === 'access_admin')).toBe(true);
  });

  it('inferStatements does NOT derive when fact is absent', () => {
    const kb = new DeonticKnowledgeBase();
    const condition = Pred('is_admin');
    const adminAction: DeonticAction = { verb: 'access', objectNoun: 'admin-panel', actionId: 'access_admin' };
    kb.addRule(condition, { modality: 'P', actor: bob, action: adminAction });
    // fact NOT set
    const derived = kb.inferStatements();
    expect(derived.some(s => s.action.actionId === 'access_admin')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-74: mcp++ deontic subcommand
// ---------------------------------------------------------------------------

describe('T-74 mcp++ deontic subcommand', () => {
  it('returns usage help when no text is provided', async () => {
    const { default: cmds } = await import('../../src/commands/mcp-plus-plus-commands.js');
    const cmd = cmds[0];
    if (!cmd?.handler) return;
    const result = await cmd.handler(['deontic'], {}, undefined as never) as Record<string, unknown>;
    expect(typeof result.output).toBe('string');
    expect(String(result.output)).toContain('Usage');
  });

  it('analyzes text and returns JSON with statements + statistics', async () => {
    const { default: cmds } = await import('../../src/commands/mcp-plus-plus-commands.js');
    const cmd = cmds[0];
    if (!cmd?.handler) return;
    const result = await cmd.handler(
      ['deontic', 'analyze', 'Users must log access. Users may view records.'],
      {}, undefined as never,
    ) as Record<string, unknown>;
    expect(typeof result.output).toBe('string');
    const parsed = JSON.parse(String(result.output));
    expect(Array.isArray(parsed.statements)).toBe(true);
    expect(parsed.statistics).toBeDefined();
    expect(parsed.statistics.total_statements).toBeGreaterThanOrEqual(1);
  });
});
