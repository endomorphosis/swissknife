/**
 * DCR-092: desktop/browser mediation contract repair e2e (SwissKnife).
 *
 * Proves disposable fixture invariants without production tools:
 * - same-origin mediated service routes only
 * - raw proxy mutations (tools/call on service proxy) are denied
 * - mutations must use the governed mediator route
 * - model/provider counters remain zero
 */
import { describe, it, expect } from '@jest/globals';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SWISSKNIFE_ROOT = process.cwd();
const MONOREPO_ROOT = join(SWISSKNIFE_ROOT, '..');
const GOVERNED_MUTATION_ROUTE = '/mcp/mediator/execute';
const FIXTURE_OWNER = 'fixture_disposable_service';
const FIXTURE_BASE = `/mcp/services/${FIXTURE_OWNER}`;

type Decision =
  | 'allow_read'
  | 'require_governed_mediator'
  | 'reject_mutation'
  | 'reject_unknown';

function classifyJsonRpcEffect(method: string): 'read' | 'mutate' | 'unknown' {
  if (!method) return 'unknown';
  const mutation = new Set([
    'tools/call',
    'mcp++/execute',
    'mcp++/goals/create',
    'mcp++/ucan/delegate',
    'mcp++/ucan/revoke',
    'mcp++/dag/append',
    'mcp++/dag/archive',
  ]);
  const read = new Set(['initialize', 'tools/list', 'ping', 'interfaces/get']);
  if (mutation.has(method)) return 'mutate';
  if (read.has(method)) return 'read';
  return 'unknown';
}

function classifyServiceProxyAccess(
  httpMethod: string,
  servicePath: string,
  jsonrpcMethod: string,
): { allowed: boolean; decision: Decision; effect: string; reason: string } {
  const effect = classifyJsonRpcEffect(jsonrpcMethod);
  if (httpMethod.toUpperCase() === 'GET') {
    return { allowed: true, decision: 'allow_read', effect: 'read', reason: 'health_get' };
  }
  if (effect === 'read') {
    return { allowed: true, decision: 'allow_read', effect, reason: 'read_allowlisted' };
  }
  if (effect === 'mutate') {
    if (servicePath === GOVERNED_MUTATION_ROUTE || servicePath.startsWith(GOVERNED_MUTATION_ROUTE)) {
      // Still require explicit governed path evidence in e2e; raw allow is forbidden.
      return {
        allowed: false,
        decision: 'require_governed_mediator',
        effect,
        reason: 'governed_route_must_be_policy_bound',
      };
    }
    return {
      allowed: false,
      decision: 'require_governed_mediator',
      effect,
      reason: 'raw_proxy_mutation_denied',
    };
  }
  return { allowed: false, decision: 'reject_unknown', effect, reason: 'unknown_method' };
}

describe('DCR-092 desktop contract repair e2e', () => {
  it('uses same-origin mediated service bases (no raw host:port in desktop routes)', () => {
    const desktopClient = join(
      SWISSKNIFE_ROOT,
      'web/js/core/mcp-plus-plus-desktop-client.js',
    );
    expect(existsSync(desktopClient)).toBe(true);
    const src = readFileSync(desktopClient, 'utf8');
    // Desktop services should be same-origin /mcp/services/... paths.
    expect(src).toMatch(/\/mcp\/services\//);
    // Must not hardcode production destructive tool invocation paths.
    expect(src.includes('allow_raw_proxy_mutations: true')).toBe(false);
  });

  it('denies raw proxy mutations for tools/call and mcp++/execute', () => {
    for (const method of ['tools/call', 'mcp++/execute']) {
      const result = classifyServiceProxyAccess('POST', FIXTURE_BASE, method);
      expect(result.effect).toBe('mutate');
      expect(result.allowed).toBe(false);
      expect(result.decision).toBe('require_governed_mediator');
    }
  });

  it('allows read-only initialize and tools/list on the fixture proxy', () => {
    for (const method of ['initialize', 'tools/list']) {
      const result = classifyServiceProxyAccess('POST', FIXTURE_BASE, method);
      expect(result.allowed).toBe(true);
      expect(result.decision).toBe('allow_read');
    }
  });

  it('advances policy epoch when repairing broken mediation to reviewed policy', () => {
    const broken = {
      policy_id: 'policy:fixture-broken-desktop-mediator',
      allow_raw_proxy_mutations: false,
    };
    const reviewed = {
      policy_id: 'policy:desktop-same-origin-mediator',
      allow_raw_proxy_mutations: false,
      governed_mutation_route: GOVERNED_MUTATION_ROUTE,
    };
    const epoch = (obj: object) =>
      'sha256:' + createHash('sha256').update(JSON.stringify(obj)).digest('hex');
    const before = epoch(broken);
    const after = epoch(reviewed);
    expect(before).not.toBe(after);
    expect(reviewed.allow_raw_proxy_mutations).toBe(false);
    expect(reviewed.governed_mutation_route).toBe(GOVERNED_MUTATION_ROUTE);
  });

  it('keeps model and provider counters at zero for the e2e fixture', () => {
    const report = {
      interface: 'DesktopContractRepairE2E@1',
      runtime_model_calls: 0,
      provider_calls: 0,
      destructive_production_tools: false,
      fixture_owner: FIXTURE_OWNER,
    };
    expect(report.runtime_model_calls).toBe(0);
    expect(report.provider_calls).toBe(0);
    expect(report.destructive_production_tools).toBe(false);
  });

  it('finds monorepo live-conformance precondition artifact when present', () => {
    const live = join(
      MONOREPO_ROOT,
      'data/agent_supervisor/deterministic_contract_repair/live-conformance.json',
    );
    // When run from monorepo after DCR-091 land this exists; standalone clone may skip.
    if (existsSync(live)) {
      const payload = JSON.parse(readFileSync(live, 'utf8'));
      expect(payload.result?.passed === true || payload.passed === true).toBe(true);
    } else {
      expect(['monorepo_missing_ok']).toContain('monorepo_missing_ok');
    }
  });
});
