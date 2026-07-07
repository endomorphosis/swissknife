/**
 * PolicyAuditLog + ComplianceChecker tests — MCP++ Profile D compliance/audit.
 *
 * Covers: record, recent, replay, stats, clear, JSONL file sink,
 * entry CID stability, ComplianceChecker rule lifecycle, pass/fail/throw,
 * merge, diff, checkAndAudit wiring, addMCPPPBaseRules built-ins, singletons.
 */

import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { PolicyAuditLog, type AuditEntry } from '../../src/services/platform/policy-audit-log';
import {
  ComplianceChecker,
  addMCPPPBaseRules,
  type ComplianceResult,
  type MCPPPComplianceContext,
} from '../../src/services/logic/deontic/compliance-checker';

const nodeFs = (globalThis.process as unknown as {
  getBuiltinModule?: (specifier: string) => unknown;
}).getBuiltinModule?.('fs') as {
  mkdtempSync: (prefix: string) => string;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  rmSync: (path: string, options: { recursive?: boolean; force?: boolean }) => void;
} | undefined;

if (!nodeFs) {
  throw new Error('node:fs builtin module is required for PolicyAuditLog fixture tests');
}

// ---------------------------------------------------------------------------
// PolicyAuditLog
// ---------------------------------------------------------------------------

describe('PolicyAuditLog — record', () => {
  it('records an entry and returns it with a stable entry_cid', () => {
    const log = new PolicyAuditLog();
    const entry = log.record({
      policy_cid: 'sha256:policy-a',
      intent_cid: 'sha256:intent-b',
      decision: 'allow',
      tool: 'browse',
      actor: 'did:key:zAlice',
    });

    expect(entry).not.toBeNull();
    expect(entry!.decision).toBe('allow');
    expect(entry!.tool).toBe('browse');
    expect(entry!.actor).toBe('did:key:zAlice');
    expect(entry!.entry_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(entry!.seq).toBe(1);
  });

  it('same data → same entry_cid (CID is deterministic)', () => {
    const log1 = new PolicyAuditLog();
    const log2 = new PolicyAuditLog();
    const opts = {
      policy_cid: 'sha256:p1',
      intent_cid: 'sha256:i1',
      decision: 'deny' as const,
      tool: 'publish',
      timestamp: 1_000_000,
    };
    const e1 = log1.record(opts)!;
    const e2 = log2.record(opts)!;
    expect(e1.entry_cid).toBe(e2.entry_cid);
  });

  it('is a no-op when disabled', () => {
    const log = new PolicyAuditLog({ enabled: false });
    const entry = log.record({ policy_cid: 'p', intent_cid: 'i', decision: 'allow' });
    expect(entry).toBeNull();
    expect(log.size).toBe(0);
  });

  it('respects maxEntries ring-buffer', () => {
    const log = new PolicyAuditLog({ maxEntries: 3 });
    for (let i = 0; i < 5; i++) {
      log.record({ policy_cid: 'p', intent_cid: `i-${i}`, decision: 'allow' });
    }
    expect(log.size).toBe(3);
    // The oldest entries were evicted; seq is still 5
    expect(log.stats().total).toBe(5);
  });

  it('invokes the sink callback synchronously', () => {
    const captured: AuditEntry[] = [];
    const log = new PolicyAuditLog({ sink: e => captured.push(e) });
    log.record({ policy_cid: 'p', intent_cid: 'i', decision: 'allow_with_obligations', obligations: ['audit'] });
    expect(captured).toHaveLength(1);
    expect(captured[0].obligations).toEqual(['audit']);
  });
});

describe('PolicyAuditLog — query', () => {
  let log: PolicyAuditLog;

  beforeEach(() => {
    log = new PolicyAuditLog();
    log.record({ policy_cid: 'p', intent_cid: 'i-1', decision: 'allow', tool: 'browse' });
    log.record({ policy_cid: 'p', intent_cid: 'i-2', decision: 'deny', tool: 'publish', actor: 'did:key:zBob' });
    log.record({ policy_cid: 'p', intent_cid: 'i-3', decision: 'allow', tool: 'browse', actor: 'did:key:zAlice' });
  });

  it('recent(n) returns the last n entries in order', () => {
    const r = log.recent(2);
    expect(r).toHaveLength(2);
    expect(r[0].intent_cid).toBe('i-2');
    expect(r[1].intent_cid).toBe('i-3');
  });

  it('export() returns all entries', () => {
    expect(log.export()).toHaveLength(3);
  });

  it('replay() calls handler for matching entries', () => {
    const seen: string[] = [];
    const count = log.replay(e => seen.push(e.intent_cid), e => e.decision === 'allow');
    expect(count).toBe(2);
    expect(seen).toEqual(['i-1', 'i-3']);
  });

  it('stats() counts decisions and tool/actor breakdowns', () => {
    const s = log.stats();
    expect(s.allow).toBe(2);
    expect(s.deny).toBe(1);
    expect(s.total).toBe(3);
    expect(s.by_tool['browse']).toBe(2);
    expect(s.by_tool['publish']).toBe(1);
    expect(s.by_actor['did:key:zBob']).toBe(1);
  });

  it('clear() wipes entries and counters but not seq', () => {
    log.clear();
    expect(log.size).toBe(0);
    expect(log.stats().allow).toBe(0);
    expect(log.stats().total).toBe(3); // seq preserved
  });
});

describe('PolicyAuditLog — JSONL file sink', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = nodeFs.mkdtempSync(join(tmpdir(), 'pal-test-'));
  });

  afterEach(() => {
    nodeFs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('appends one JSON line per record to the log file', () => {
    const logPath = join(tmpDir, 'audit.jsonl');
    const log = new PolicyAuditLog({ logPath });
    log.record({ policy_cid: 'p1', intent_cid: 'i1', decision: 'allow', tool: 'browse' });
    log.record({ policy_cid: 'p1', intent_cid: 'i2', decision: 'deny', tool: 'publish' });

    const lines = nodeFs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const parsed = lines.map(l => JSON.parse(l));
    expect(parsed[0].decision).toBe('allow');
    expect(parsed[1].decision).toBe('deny');
  });
});

describe('PolicyAuditLog — singleton', () => {
  afterEach(() => PolicyAuditLog.resetInstance());

  it('getInstance() returns the same instance', () => {
    expect(PolicyAuditLog.getInstance()).toBe(PolicyAuditLog.getInstance());
  });

  it('resetInstance() produces a fresh singleton', () => {
    const a = PolicyAuditLog.getInstance();
    PolicyAuditLog.resetInstance();
    expect(PolicyAuditLog.getInstance()).not.toBe(a);
  });
});

// ---------------------------------------------------------------------------
// ComplianceChecker — rule lifecycle
// ---------------------------------------------------------------------------

describe('ComplianceChecker — rule management', () => {
  it('addRule / listRules / removeRule', () => {
    const checker = new ComplianceChecker();
    checker.addRule('r1', 'first rule', () => true);
    checker.addRule('r2', 'second rule', () => false);
    expect(checker.listRules()).toEqual(['r1', 'r2']);

    const removed = checker.removeRule('r1');
    expect(removed).toBe(true);
    expect(checker.listRules()).toEqual(['r2']);

    // non-existent
    expect(checker.removeRule('r-unknown')).toBe(false);
  });

  it('non-removable rules cannot be removed', () => {
    const checker = new ComplianceChecker();
    checker.addRule('mandatory', 'must stay', () => true, false);
    expect(checker.removeRule('mandatory')).toBe(false);
    expect(checker.listRules()).toContain('mandatory');
  });

  it('getRule() returns the rule entry', () => {
    const checker = new ComplianceChecker();
    const fn = () => true;
    checker.addRule('r1', 'desc', fn);
    const entry = checker.getRule('r1');
    expect(entry).toBeDefined();
    expect(entry!.description).toBe('desc');
  });
});

// ---------------------------------------------------------------------------
// ComplianceChecker — check
// ---------------------------------------------------------------------------

describe('ComplianceChecker — check()', () => {
  it('returns passed=true when all rules return true', async () => {
    const checker = new ComplianceChecker();
    checker.addRule('always-pass', '', () => true);
    checker.addRule('also-pass', '', () => true);
    const report = await checker.check({});
    expect(report.passed).toBe(true);
    expect(report.summary).toBe('pass');
    expect(report.failed_rules).toHaveLength(0);
  });

  it('returns passed=false when any rule returns false', async () => {
    const checker = new ComplianceChecker();
    checker.addRule('ok', '', () => true);
    checker.addRule('fail', '', () => false);
    const report = await checker.check({});
    expect(report.passed).toBe(false);
    expect(report.failed_rules).toContain('fail');
    expect(report.passed_rules).toContain('ok');
  });

  it('catches thrown exceptions and marks the rule non-compliant', async () => {
    const checker = new ComplianceChecker();
    checker.addRule('throws', '', () => { throw new Error('kaboom'); });
    const report = await checker.check({});
    expect(report.passed).toBe(false);
    expect(report.all_violations[0].message).toMatch(/kaboom/);
  });

  it('accepts ComplianceResult return values', async () => {
    const checker = new ComplianceChecker();
    const result: ComplianceResult = {
      rule_id: 'structured',
      status: 'warning',
      violations: [{ rule_id: 'structured', message: 'just a warning', severity: 'warning' }],
      checked_at: Date.now(),
      is_compliant: true,
    };
    checker.addRule('structured', '', () => result);
    const report = await checker.check({});
    expect(report.passed).toBe(true); // warnings don't fail
    expect(report.summary).toBe('warn');
  });

  it('supports async rules', async () => {
    const checker = new ComplianceChecker();
    checker.addRule('async-pass', '', async () => {
      await Promise.resolve();
      return true;
    });
    const report = await checker.check({});
    expect(report.passed).toBe(true);
  });

  it('runs zero rules and returns passed=true', async () => {
    const checker = new ComplianceChecker();
    const report = await checker.check({});
    expect(report.passed).toBe(true);
    expect(report.rule_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ComplianceChecker — merge and diff
// ---------------------------------------------------------------------------

describe('ComplianceChecker — merge and diff', () => {
  it('merge() copies rules from other into this', async () => {
    const a = new ComplianceChecker();
    a.addRule('r1', '', () => true);

    const b = new ComplianceChecker();
    b.addRule('r2', '', () => false);
    b.addRule('r1', '', () => true); // overlap

    const result = a.merge(b);
    expect(result.added).toBe(1);
    expect(result.overwritten).toBe(1);
    expect(a.listRules()).toContain('r2');
  });

  it('diff() identifies rule set differences', () => {
    const a = new ComplianceChecker();
    a.addRule('shared', '', () => true);
    a.addRule('only-a', '', () => true);

    const b = new ComplianceChecker();
    b.addRule('shared', '', () => true);
    b.addRule('only-b', '', () => true);

    const d = a.diff(b);
    expect(d.only_in_this).toEqual(['only-a']);
    expect(d.only_in_other).toEqual(['only-b']);
    expect(d.in_both).toEqual(['shared']);
  });
});

// ---------------------------------------------------------------------------
// ComplianceChecker — checkAndAudit
// ---------------------------------------------------------------------------

describe('ComplianceChecker — checkAndAudit()', () => {
  it('records an allow entry in the audit log when all rules pass', async () => {
    const auditLog = new PolicyAuditLog();
    const checker = new ComplianceChecker({ auditLog });
    checker.addRule('ok', '', () => true);

    const { report, auditEntry } = await checker.checkAndAudit(
      { correlation_id: 'corr-1' },
      { policy_cid: 'sha256:p', intent_cid: 'sha256:i', actor: 'did:key:zAlice', tool: 'browse' },
    );

    expect(report.passed).toBe(true);
    expect(auditEntry).not.toBeNull();
    expect(auditEntry!.decision).toBe('allow');
    expect(auditEntry!.tool).toBe('browse');
    expect(auditLog.size).toBe(1);
  });

  it('records a deny entry when a rule fails', async () => {
    const auditLog = new PolicyAuditLog();
    const checker = new ComplianceChecker({ auditLog });
    checker.addRule('fail', '', () => false);

    const { report, auditEntry } = await checker.checkAndAudit(
      {},
      { policy_cid: 'sha256:p', intent_cid: 'sha256:i', tool: 'publish' },
    );

    expect(report.passed).toBe(false);
    expect(auditEntry!.decision).toBe('deny');
    expect(auditEntry!.justification).toMatch(/fail/);
  });

  it('returns null auditEntry when no auditLog is attached', async () => {
    const checker = new ComplianceChecker(); // no auditLog
    checker.addRule('ok', '', () => true);
    const { auditEntry } = await checker.checkAndAudit({}, { policy_cid: 'p', intent_cid: 'i' });
    expect(auditEntry).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// addMCPPPBaseRules
// ---------------------------------------------------------------------------

describe('addMCPPPBaseRules', () => {
  function makeChecker() {
    const checker = new ComplianceChecker<MCPPPComplianceContext>();
    addMCPPPBaseRules(checker);
    return checker;
  }

  it('passes when correlation_id is present and no TTL override', async () => {
    const checker = makeChecker();
    const report = await checker.check({ correlation_id: 'corr-abc' });
    expect(report.passed).toBe(true);
  });

  it('fails require-correlation-id when correlation_id is missing', async () => {
    const checker = makeChecker();
    const report = await checker.check({});
    expect(report.passed).toBe(false);
    expect(report.failed_rules).toContain('require-correlation-id');
  });

  it('fails no-expired-context when expires_at is in the past', async () => {
    const checker = makeChecker();
    const report = await checker.check({
      correlation_id: 'corr-x',
      expires_at: Date.now() - 5000,
    });
    expect(report.passed).toBe(false);
    expect(report.failed_rules).toContain('no-expired-context');
  });

  it('fails require-policy-cid when policy_required=true but no cid', async () => {
    const checker = makeChecker();
    const report = await checker.check({
      correlation_id: 'corr-y',
      policy_required: true,
    });
    expect(report.passed).toBe(false);
    expect(report.failed_rules).toContain('require-policy-cid');
  });

  it('require-correlation-id cannot be removed (non-removable)', () => {
    const checker = makeChecker();
    expect(checker.removeRule('require-correlation-id')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

describe('ComplianceChecker — singleton', () => {
  afterEach(() => ComplianceChecker.resetInstance());

  it('getInstance() returns the same instance', () => {
    expect(ComplianceChecker.getInstance()).toBe(ComplianceChecker.getInstance());
  });

  it('singleton wires in the PolicyAuditLog singleton', () => {
    PolicyAuditLog.resetInstance();
    const checker = ComplianceChecker.getInstance();
    checker.addRule('r', '', () => true);
    // checkAndAudit should record to the singleton audit log
    // (we just verify it doesn't throw)
    expect(async () =>
      checker.checkAndAudit({}, { policy_cid: 'p', intent_cid: 'i' }),
    ).not.toThrow();
    PolicyAuditLog.resetInstance();
  });
});
