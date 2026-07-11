/**
 * Sprint 61 tests — OTel Integration, Syntax Tree, Language Detector,
 *                   DCEC Namespace, NL Policy Compiler
 */

import { OTelTracer, SpanStatus, EventType, Span, Trace, setupOtelTracer } from '../../src/services/platform/otel-integration.js';
import { SyntaxTree, SyntaxNode, NodeType } from '../../src/services/logic/cec/cec-syntax-tree.js';
import { LanguageDetector, Language } from '../../src/services/logic/cec/cec-language-detector.js';
import { DCECNamespace, DCECContainer, compileDcecToClause, NLToPolicyCompiler } from '../../src/services/logic/cec/cec-dcec-namespace.js';
import { makeSort } from '../../src/services/logic/dcec/dcec-core-types.js';

// ---------------------------------------------------------------------------
// OTelTracer tests
// ---------------------------------------------------------------------------
describe('OTelTracer', () => {
  test('startSpan creates a span', () => {
    const tracer = new OTelTracer();
    const span = tracer.startSpan('test-op');
    expect(span.name).toBe('test-op');
    expect(span.traceId).toBeDefined();
    expect(span.spanId).toBeDefined();
  });

  test('endSpan marks span as finished', () => {
    const tracer = new OTelTracer();
    const span = tracer.startSpan('op');
    tracer.endSpan(span);
    expect(span.isFinished).toBe(true);
    expect(span.status).toBe(SpanStatus.OK);
  });

  test('span.addEvent stores events', () => {
    const tracer = new OTelTracer();
    const span = tracer.startSpan('op');
    span.addEvent('step1', { formula: 'P' });
    expect(span['events']).toHaveLength(1);
  });

  test('span.setAttribute stores attributes', () => {
    const tracer = new OTelTracer();
    const span = tracer.startSpan('op');
    span.setAttribute('prover', 'z3');
    expect(span['attributes']['prover']).toBe('z3');
  });

  test('span.toDict is JSON-serialisable', () => {
    const tracer = new OTelTracer();
    const span = tracer.startSpan('op');
    tracer.endSpan(span);
    expect(() => JSON.stringify(span.toDict())).not.toThrow();
  });

  test('getTrace returns trace', () => {
    const tracer = new OTelTracer();
    const span = tracer.startSpan('op');
    const trace = tracer.getTrace(span.traceId);
    expect(trace).not.toBeNull();
    expect(trace!.getSpan(span.spanId)).toBe(span);
  });

  test('stats increment correctly', () => {
    const tracer = new OTelTracer();
    const s1 = tracer.startSpan('op1');
    const s2 = tracer.startSpan('op2');
    tracer.endSpan(s1);
    const stats = tracer.getStats();
    expect(stats.totalSpans).toBe(2);
    expect(stats.activeSpans).toBe(1);
  });

  test('setupOtelTracer returns an OTelTracer', () => {
    expect(setupOtelTracer('test-service')).toBeInstanceOf(OTelTracer);
  });
});

// ---------------------------------------------------------------------------
// SyntaxTree tests
// ---------------------------------------------------------------------------
describe('SyntaxNode', () => {
  test('addChild and findByType', () => {
    const root = new SyntaxNode(NodeType.ROOT);
    const noun = new SyntaxNode(NodeType.NOUN, 'Alice');
    root.addChild(noun);
    const found = root.findByType(NodeType.NOUN);
    expect(found).toHaveLength(1);
    expect(found[0].value).toBe('Alice');
  });

  test('isLeaf returns true for leaf', () => {
    expect(new SyntaxNode(NodeType.NOUN, 'x').isLeaf()).toBe(true);
  });

  test('depth returns 0 for leaf', () => {
    expect(new SyntaxNode(NodeType.ATOM, 'P').depth()).toBe(0);
  });

  test('toDict is JSON-serialisable', () => {
    const n = new SyntaxNode(NodeType.FORMULA, 'P∧Q');
    expect(() => JSON.stringify(n.toDict())).not.toThrow();
  });
});

describe('SyntaxTree', () => {
  test('insert adds nodes to root', () => {
    const tree = new SyntaxTree();
    const node = new SyntaxNode(NodeType.CLAUSE, 'must pay');
    tree.insert(node);
    expect(tree.find(NodeType.CLAUSE)).toHaveLength(1);
  });

  test('traverse visits all nodes', () => {
    const tree = new SyntaxTree();
    const n1 = new SyntaxNode(NodeType.NOUN, 'Alice');
    const n2 = new SyntaxNode(NodeType.VERB, 'pay');
    tree.insert(n1);
    tree.insert(n2);
    const visited: string[] = [];
    tree.traverse(n => visited.push(n.value));
    expect(visited).toContain('Alice');
    expect(visited).toContain('pay');
  });

  test('leaves returns only leaf nodes', () => {
    const tree = new SyntaxTree();
    tree.insert(new SyntaxNode(NodeType.ATOM, 'P'));
    const leaves = tree.leaves();
    expect(leaves.some(l => l.value === 'P')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LanguageDetector tests
// ---------------------------------------------------------------------------
describe('LanguageDetector', () => {
  const det = new LanguageDetector();

  test('detects English', () => {
    const r = det.detect('The contractor must pay all taxes by the end of the month.');
    expect(r.language).toBe(Language.EN);
    expect(r.confidence).toBeGreaterThan(0);
  });

  test('detects German', () => {
    const r = det.detect('Der Agent muss einhalten und die Regeln beachten.');
    expect(r.language).toBe(Language.DE);
  });

  test('detects French', () => {
    const r = det.detect("L'agent doit payer et peut partir.");
    expect(r.language).toBe(Language.FR);
  });

  test('detectBatch returns array', () => {
    const results = det.detectBatch(['Alice must pay.', 'Der Agent muss.']);
    expect(results).toHaveLength(2);
  });

  test('getConfidence returns numeric value', () => {
    expect(det.getConfidence('Alice must pay.', Language.EN)).toBeGreaterThanOrEqual(0);
  });

  test('scores are in [0, 1]', () => {
    const { scores } = det.detect('Alice must pay.');
    for (const v of Object.values(scores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// DCECNamespace tests
// ---------------------------------------------------------------------------
describe('DCECNamespace', () => {
  const ns = new DCECNamespace('test');

  test('addSort creates a sort', () => {
    const s = ns.addSort('Agent');
    expect(s.name).toBe('Agent');
  });

  test('lookup finds registered sort', () => {
    ns.addSort('Event');
    expect(ns.lookup('Event')).not.toBeNull();
  });

  test('addPredicate creates predicate', () => {
    const agentSort = ns.addSort('AgentX');
    ns.addPredicate('pays', [agentSort]);
    expect(ns.lookup('pays')).not.toBeNull();
  });

  test('addConstant and lookup', () => {
    ns.addConstant('alice', 'Agent');
    expect(ns.lookup('alice')).toBe('Agent');
  });

  test('export returns all registrations', () => {
    const exp = ns.export();
    expect(Array.isArray(exp.sorts)).toBe(true);
    expect(exp.sorts.length).toBeGreaterThan(0);
  });
});

describe('DCECContainer', () => {
  test('getNamespace creates on demand', () => {
    const c = new DCECContainer();
    const ns = c.getNamespace('myNS');
    expect(ns).toBeInstanceOf(DCECNamespace);
    expect(c.getNamespace('myNS')).toBe(ns); // same instance
  });

  test('merge combines namespaces', () => {
    const c = new DCECContainer();
    const other = new DCECNamespace('extra');
    other.addSort('Widget');
    c.merge(other);
    expect(c.getNamespace('extra').lookup('Widget')).not.toBeNull();
  });

  test('toDict is JSON-serialisable', () => {
    expect(() => JSON.stringify(new DCECContainer().toDict())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// NLToPolicyCompiler tests
// ---------------------------------------------------------------------------
describe('compileDcecToClause', () => {
  test('O(...) → obligation', () => {
    const c = compileDcecToClause('O(pay)');
    expect(c.clause_type).toBe('obligation');
    expect(c.action).toBe('pay');
  });

  test('P(...) → permission', () => {
    expect(compileDcecToClause('P(leave)').clause_type).toBe('permission');
  });

  test('F(...) → prohibition', () => {
    expect(compileDcecToClause('F(disclose)').clause_type).toBe('prohibition');
  });

  test('unknown → unknown', () => {
    expect(compileDcecToClause('X(foo)').clause_type).toBe('unknown');
  });
});

describe('NLToPolicyCompiler', () => {
  const comp = new NLToPolicyCompiler();

  test('compile obligation text', () => {
    const r = comp.compile('Contractors must pay taxes.');
    expect(r.clauses.some(c => c.clause_type === 'obligation')).toBe(true);
    expect(r.confidence).toBeGreaterThan(0);
  });

  test('compile permission text', () => {
    const r = comp.compile('Employees may take leave.');
    expect(r.clauses.some(c => c.clause_type === 'permission')).toBe(true);
  });

  test('empty text produces errors', () => {
    const r = comp.compile('');
    expect(r.errors.length).toBeGreaterThan(0);
  });

  test('compileBatch processes multiple texts', () => {
    const results = comp.compileBatch(['A must B.', 'C may D.']);
    expect(results).toHaveLength(2);
  });

  test('stats increment', () => {
    const c2 = new NLToPolicyCompiler();
    c2.compile('P');
    expect(c2.getStats().totalCompiled).toBe(1);
  });
});
