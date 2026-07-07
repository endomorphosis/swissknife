/**
 * ComplianceChecker — pluggable rule-based compliance framework for MCP++.
 *
 * Runs named predicate rules against an invocation context and accumulates
 * per-rule pass/fail results into a `ComplianceReport`.  Integrates with
 * `PolicyEngine`, `DelegationManager`, and `PolicyAuditLog`.
 *
 * Reference parity: `ipfs_datasets_py.mcp_server.compliance_checker.ComplianceChecker`
 */

import { PolicyAuditLog, type AuditEntry } from '../../policy-audit-log.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Severity of a compliance violation. */
export type ViolationSeverity = 'error' | 'warning' | 'info';

/** A single rule violation. */
export interface ComplianceViolation {
  rule_id: string;
  message: string;
  severity: ViolationSeverity;
  details?: unknown;
}

/** Status of a single rule evaluation. */
export type ComplianceStatus = 'compliant' | 'non_compliant' | 'warning' | 'skipped';

/** Result of running one rule against an invocation. */
export interface ComplianceResult {
  rule_id: string;
  status: ComplianceStatus;
  violations: ComplianceViolation[];
  checked_at: number;
  /** True iff status is 'compliant' or 'skipped'. */
  is_compliant: boolean;
}

/** Aggregated report across all rules for one invocation. */
export interface ComplianceReport {
  passed: boolean;
  summary: 'pass' | 'fail' | 'warn';
  results: ComplianceResult[];
  all_violations: ComplianceViolation[];
  failed_rules: string[];
  passed_rules: string[];
  checked_at: number;
  /** Number of rules executed. */
  rule_count: number;
}

/**
 * A callable compliance rule.
 *
 * Must return `true` (compliant), `false` (non-compliant), a
 * `ComplianceResult`, or throw (treated as non-compliant with error message).
 */
export type ComplianceRuleFn<TContext = unknown> =
  (context: TContext) => boolean | ComplianceResult | Promise<boolean | ComplianceResult>;

/** Registered rule metadata. */
export interface ComplianceRuleEntry<TContext = unknown> {
  rule_id: string;
  description: string;
  check: ComplianceRuleFn<TContext>;
  removable: boolean;
}

// ---------------------------------------------------------------------------
// ComplianceChecker
// ---------------------------------------------------------------------------

/**
 * Rule-based compliance checker.
 *
 * ```ts
 * const checker = new ComplianceChecker();
 *
 * checker.addRule('require-auth', 'Invocation must carry a delegation', ctx => {
 *   return ctx.delegation_cid != null;
 * });
 *
 * const report = await checker.check({ delegation_cid: 'sha256:...' });
 * if (!report.passed) {
 *   console.error('Compliance failed:', report.failed_rules);
 * }
 * ```
 */
export class ComplianceChecker<TContext = unknown> {
  private readonly rules = new Map<string, ComplianceRuleEntry<TContext>>();
  private readonly ruleOrder: string[] = [];
  private readonly auditLog?: PolicyAuditLog;

  constructor(opts?: {
    /** Optional audit log to record compliance check outcomes. */
    auditLog?: PolicyAuditLog;
  }) {
    this.auditLog = opts?.auditLog;
  }

  // ---------------------------------------------------------------------------
  // Rule management
  // ---------------------------------------------------------------------------

  /**
   * Register a named compliance rule.
   *
   * @param ruleId      Unique string identifier.
   * @param description Human-readable description.
   * @param check       Predicate function.
   * @param removable   Set `false` to prevent `removeRule()` from removing it.
   */
  addRule(
    ruleId: string,
    description: string,
    check: ComplianceRuleFn<TContext>,
    removable = true,
  ): this {
    if (!ruleId) throw new Error('ComplianceChecker.addRule: ruleId must be non-empty');
    if (!this.rules.has(ruleId)) {
      this.ruleOrder.push(ruleId);
    }
    this.rules.set(ruleId, { rule_id: ruleId, description, check, removable });
    return this;
  }

  /**
   * Remove a rule by ID.
   *
   * @returns `true` if the rule existed and was removed; `false` if it was
   *          not found or was marked `removable: false`.
   */
  removeRule(ruleId: string): boolean {
    const entry = this.rules.get(ruleId);
    if (!entry || !entry.removable) return false;
    this.rules.delete(ruleId);
    const idx = this.ruleOrder.indexOf(ruleId);
    if (idx >= 0) this.ruleOrder.splice(idx, 1);
    return true;
  }

  /** Return rule IDs in insertion order. */
  listRules(): string[] {
    return [...this.ruleOrder];
  }

  /** Return full rule metadata in insertion order. */
  listRuleDetails(): Array<{ rule_id: string; description: string; removable: boolean }> {
    return this.ruleOrder.map(id => {
      const e = this.rules.get(id)!;
      return { rule_id: e.rule_id, description: e.description, removable: e.removable };
    });
  }

  /** Return a rule entry by ID, or `undefined`. */
  getRule(ruleId: string): ComplianceRuleEntry<TContext> | undefined {
    return this.rules.get(ruleId);
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  /**
   * Run all registered rules against `context` and return a `ComplianceReport`.
   *
   * Rules are executed in insertion order.  A thrown exception is caught and
   * recorded as a non-compliant result with severity 'error'.
   */
  async check(context: TContext): Promise<ComplianceReport> {
    const results: ComplianceResult[] = [];
    const now = Date.now();

    for (const ruleId of this.ruleOrder) {
      const entry = this.rules.get(ruleId)!;
      results.push(await runRule(entry, context, now));
    }

    const report = buildReport(results, now);
    return report;
  }

  // ---------------------------------------------------------------------------
  // Merge
  // ---------------------------------------------------------------------------

  /**
   * Incorporate all rules from `other` into this checker.
   *
   * Rules already present (by ID) are overwritten with the other's version.
   */
  merge(other: ComplianceChecker<TContext>): { added: number; overwritten: number } {
    let added = 0;
    let overwritten = 0;
    for (const ruleId of other.ruleOrder) {
      const entry = other.rules.get(ruleId)!;
      if (this.rules.has(ruleId)) {
        overwritten++;
      } else {
        this.ruleOrder.push(ruleId);
        added++;
      }
      this.rules.set(ruleId, entry);
    }
    return { added, overwritten };
  }

  /**
   * Return a diff of rule IDs between this checker and `other`.
   */
  diff(other: ComplianceChecker<TContext>): {
    only_in_this: string[];
    only_in_other: string[];
    in_both: string[];
  } {
    const thisSet = new Set(this.ruleOrder);
    const otherSet = new Set(other.ruleOrder);
    return {
      only_in_this: [...thisSet].filter(id => !otherSet.has(id)),
      only_in_other: [...otherSet].filter(id => !thisSet.has(id)),
      in_both: [...thisSet].filter(id => otherSet.has(id)),
    };
  }

  // ---------------------------------------------------------------------------
  // Audit integration
  // ---------------------------------------------------------------------------

  /**
   * Run `check()` and additionally record the outcome in the audit log (if
   * one was provided at construction time).
   *
   * @param context         Invocation context to check.
   * @param auditOpts       Optional fields for the audit log entry.
   */
  async checkAndAudit(
    context: TContext,
    auditOpts: {
      policy_cid: string;
      intent_cid: string;
      actor?: string;
      tool?: string;
    },
  ): Promise<{ report: ComplianceReport; auditEntry: AuditEntry | null }> {
    const report = await this.check(context);
    let auditEntry: AuditEntry | null = null;

    if (this.auditLog) {
      const decision = report.passed ? 'allow' : 'deny';
      const violations = report.all_violations.map(v => v.message);
      auditEntry = this.auditLog.record({
        policy_cid: auditOpts.policy_cid,
        intent_cid: auditOpts.intent_cid,
        decision,
        actor: auditOpts.actor,
        tool: auditOpts.tool,
        justification: report.passed
          ? `All ${report.rule_count} rules passed`
          : `${report.failed_rules.length}/${report.rule_count} rules failed: ${report.failed_rules.join(', ')}`,
        obligations: [],
        extra: { violations, summary: report.summary },
      });
    }

    return { report, auditEntry };
  }

  // ---------------------------------------------------------------------------
  // Singleton
  // ---------------------------------------------------------------------------

  private static _instance: ComplianceChecker<unknown> | null = null;

  static getInstance(): ComplianceChecker<unknown> {
    if (!ComplianceChecker._instance) {
      ComplianceChecker._instance = new ComplianceChecker({
        auditLog: PolicyAuditLog.getInstance(),
      });
    }
    return ComplianceChecker._instance;
  }

  static resetInstance(): void {
    ComplianceChecker._instance = null;
  }
}

// ---------------------------------------------------------------------------
// Built-in rules (MCP++ specific)
// ---------------------------------------------------------------------------

/**
 * A pre-built rule set for common MCP++ invocation compliance checks.
 *
 * Usage:
 * ```ts
 * const checker = new ComplianceChecker();
 * addMCPPPBaseRules(checker);
 * ```
 */
export function addMCPPPBaseRules(
  checker: ComplianceChecker<MCPPPComplianceContext>,
): void {
  checker.addRule(
    'require-correlation-id',
    'Every invocation must carry a correlation_id for audit traceability',
    ctx => {
      const ok = typeof ctx.correlation_id === 'string' && ctx.correlation_id.length > 0;
      if (!ok) {
        return makeResult('require-correlation-id', false, 'correlation_id is missing or empty', 'error');
      }
      return makeResult('require-correlation-id', true, '');
    },
    false, // not removable: this is a baseline requirement
  );

  checker.addRule(
    'require-policy-cid',
    'A policy CID must be present when the policy hook is active',
    ctx => {
      // Skip if the invocation declares no policy_required flag
      if (!ctx.policy_required) return makeResult('require-policy-cid', true, '');
      const ok = typeof ctx.policy_cid === 'string' && ctx.policy_cid.length > 0;
      if (!ok) {
        return makeResult('require-policy-cid', false, 'policy_cid required but missing', 'error');
      }
      return makeResult('require-policy-cid', true, '');
    },
  );

  checker.addRule(
    'no-expired-context',
    'The invocation context must not be past its stated TTL',
    ctx => {
      if (!ctx.expires_at) return makeResult('no-expired-context', true, '');
      const ok = ctx.expires_at > Date.now();
      if (!ok) {
        return makeResult('no-expired-context', false, `Invocation context expired at ${new Date(ctx.expires_at).toISOString()}`, 'error');
      }
      return makeResult('no-expired-context', true, '');
    },
  );
}

/** Context shape expected by the base MCP++ compliance rules. */
export interface MCPPPComplianceContext {
  correlation_id?: string;
  policy_cid?: string;
  policy_required?: boolean;
  expires_at?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function runRule<TContext>(
  entry: ComplianceRuleEntry<TContext>,
  context: TContext,
  now: number,
): Promise<ComplianceResult> {
  try {
    const raw = await entry.check(context);
    if (typeof raw === 'boolean') {
      return {
        rule_id: entry.rule_id,
        status: raw ? 'compliant' : 'non_compliant',
        violations: raw ? [] : [{
          rule_id: entry.rule_id,
          message: `Rule '${entry.rule_id}' returned false`,
          severity: 'error',
        }],
        checked_at: now,
        is_compliant: raw,
      };
    }
    return {
      ...raw,
      rule_id: raw.rule_id || entry.rule_id,
      // Trust explicit is_compliant if provided; otherwise derive from status.
      // 'warning' and 'skipped' are both considered compliant (pass-through).
      is_compliant: raw.is_compliant ?? (raw.status === 'compliant' || raw.status === 'skipped' || raw.status === 'warning'),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      rule_id: entry.rule_id,
      status: 'non_compliant',
      violations: [{ rule_id: entry.rule_id, message: `Rule threw: ${msg}`, severity: 'error' }],
      checked_at: now,
      is_compliant: false,
    };
  }
}

function buildReport(results: ComplianceResult[], now: number): ComplianceReport {
  const all_violations = results.flatMap(r => r.violations);
  const failed_rules = results.filter(r => !r.is_compliant).map(r => r.rule_id);
  const passed_rules = results.filter(r => r.is_compliant).map(r => r.rule_id);
  const passed = failed_rules.length === 0;
  const hasWarnings = results.some(r => r.status === 'warning');
  const summary: 'pass' | 'fail' | 'warn' = !passed ? 'fail' : hasWarnings ? 'warn' : 'pass';

  return {
    passed,
    summary,
    results,
    all_violations,
    failed_rules,
    passed_rules,
    checked_at: now,
    rule_count: results.length,
  };
}

function makeResult(
  rule_id: string,
  ok: boolean,
  message: string,
  severity: ViolationSeverity = 'error',
): ComplianceResult {
  return {
    rule_id,
    status: ok ? 'compliant' : 'non_compliant',
    violations: ok ? [] : [{ rule_id, message, severity }],
    checked_at: Date.now(),
    is_compliant: ok,
  };
}
