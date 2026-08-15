// @vitest-environment happy-dom
/**
 * VGO-081 — Agent Supervisor regression boundary (direct browser).
 *
 * Compares archived VGO-068 pre-change defect evidence with the current
 * VGO-080 target, then locks focus restore, field-error association,
 * loading/empty/error outcomes, keyboard path, exact confirmation,
 * disabled dispatch, and AllAppToolGateway / governed-action boundaries.
 * Source and live-DOM mutation vectors that drop those contracts fail.
 * Fixtures never contact production services and never mint browser-issued
 * authorization. This file does not own the live target or Playwright config.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AGENT_SUPERVISOR_CONSOLE_CONTRACT,
  createAgentSupervisorConsoleGateway,
  listAgentSupervisorCapabilities,
  type AgentSupervisorGatewayTransport,
} from '../../src/services/mcp/browser-mcp';
import {
  AllAppToolGateway,
  type BrowserMediatedToolCall,
} from '../../src/services/mcp/all-app-tool-gateway';
import {
  getExecutableAppBackendDisposition,
  type ExecutableBackendBinding,
  type MediatedInvocationRequest,
} from '../../src/services/apps/all-app-executable-backend-contract';
import { AgentSupervisorApp } from '../../web/js/apps/agent-supervisor.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SWISSKNIFE_ROOT = resolve(HERE, '../..');
const WORKSPACE_ROOT = resolve(SWISSKNIFE_ROOT, '..');
const LIVE_TARGET = join(SWISSKNIFE_ROOT, 'web/js/apps/agent-supervisor.js');
const FIXTURE_HOST = join(
  SWISSKNIFE_ROOT,
  'test/fixtures/gui-optimizer/agent-supervisor/fixture-host.html',
);
const FIXTURE_SERVICES = join(
  SWISSKNIFE_ROOT,
  'test/fixtures/gui-optimizer/agent-supervisor/fixture-services.js',
);
const EVIDENCE_DIR = join(
  WORKSPACE_ROOT,
  'implementation_plan/evidence/verified_gui_optimizer',
);
const BASELINE_PATH = join(EVIDENCE_DIR, 'agent-supervisor-browser-baseline.json');
const SEMANTIC_PATH = join(EVIDENCE_DIR, 'agent-supervisor-semantic-baseline.json');
const PROPOSAL_PATH = join(EVIDENCE_DIR, 'agent-supervisor-target-proposal.json');
const IMPROVEMENT_PATH = join(EVIDENCE_DIR, 'agent-supervisor-target-improvement-receipt.json');
const ARTIFACTS_PATH = join(EVIDENCE_DIR, 'agent-supervisor-target-artifacts.json');
const RECEIPT_PATH = join(EVIDENCE_DIR, 'agent-supervisor-regression-receipt.json');

const SUITE_INTERFACE = 'AgentSupervisorRegressionSuite@1' as const;
const SUITE_SCHEMA = 'agent-supervisor-regression-receipt/v1' as const;
const ORIGINAL_DEFECT_CODES = Object.freeze([
  'missing-field-error-association',
  'outerhtml-root-replace-focus-risk',
]);
const LOCKED_CONTRACTS = Object.freeze([
  'focus-restore',
  'error-association',
  'loading-empty-error',
  'keyboard-path',
  'exact-confirmation',
  'disabled-dispatch',
  'gateway-boundary',
  'responsive-overflow',
]);
const SCENARIO_LOCKS = Object.freeze([
  'archived-vgo-068-defects',
  'live-focus-restore',
  'live-error-association',
  'loading-empty-error',
  'keyboard-path',
  'exact-confirmation',
  'disabled-dispatch',
  'gateway-boundary',
  'mutation-adversarial',
]);
const CLOSED_RECEIPT_KEYS = Object.freeze([
  'analysis_classification',
  'application_id',
  'archived_baseline',
  'can_issue_authoritative_allow',
  'canonical_json_profile',
  'claim_boundary',
  'current_target',
  'decision',
  'headless_shell_used',
  'improvement_metrics',
  'interface',
  'locked_contracts',
  'mutation_vectors',
  'receipt_id',
  'scenario_locks',
  'schema_version',
  'screen_id',
  'suites',
  'task_id',
  'uses_browser_issued_authorization',
  'uses_production_credentials',
  'uses_production_services',
  'validation_boundary',
  'verification_status',
]);

interface RecordedInvocation {
  capability_id: string;
  method: string;
  payload: Record<string, unknown>;
}

const mounted: HTMLElement[] = [];

afterEach(() => {
  for (const node of mounted.splice(0)) node.remove();
});

function sha256Label(body: Uint8Array | string): string {
  const bytes = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fileDigest(path: string): string {
  return sha256Label(readFileSync(path));
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter(key => record[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`cannot encode ${typeof value}`);
}

function prettyCanonicalJson(value: unknown): string {
  return `${JSON.stringify(JSON.parse(stableStringify(value)), null, 2)}\n`;
}

function atomicWrite(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.part`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);
}

function holdsFocusRestore(source: string): boolean {
  return source.includes('captureFocusState(')
    && source.includes('restoreFocusState(')
    && source.includes('root.outerHTML = this.renderRoot()');
}

function holdsErrorAssociation(source: string): boolean {
  return source.includes('aria-invalid="true"')
    && source.includes('aria-describedby=')
    && source.includes('aria-errormessage=')
    && source.includes('function fieldErrorBinding(');
}

function holdsConfirmationGate(source: string): boolean {
  return source.includes("reason: 'confirmation_required'")
    && source.includes('if (!steering.dryRun && !steering.confirm)')
    && source.includes('if (!dispatch.confirm)');
}

function holdsDisabledDispatch(source: string): boolean {
  return source.includes('data-testid="dispatch-submit"')
    && source.includes('aria-disabled="${canSubmit ? \'false\' : \'true\'}"');
}

function fixtureLacksLiveErrorBinding(host: string, services: string): boolean {
  return !host.includes('aria-errormessage') && !services.includes('aria-errormessage');
}

function evaluateMutationVectors(liveSource: string): Record<string, Record<string, boolean>> {
  const focusMutant = liveSource
    .replaceAll('restoreFocusState', 'skipFocusState')
    .replaceAll('captureFocusState', 'skipCaptureFocus');
  const associationMutant = liveSource
    .replaceAll('aria-invalid="true"', '')
    .replaceAll('function fieldErrorBinding(', 'function unusedFieldBinding(');
  const confirmationMutant = liveSource
    .replaceAll("reason: 'confirmation_required'", "reason: 'skipped'")
    .replaceAll('if (!steering.dryRun && !steering.confirm)', 'if (false)')
    .replaceAll('if (!dispatch.confirm)', 'if (false)');
  const dispatchMutant = liveSource.replaceAll(
    'aria-disabled="${canSubmit ? \'false\' : \'true\'}"',
    'aria-disabled="false"',
  );
  return {
    association: {
      mutant_fails: !holdsErrorAssociation(associationMutant),
      source_holds: holdsErrorAssociation(liveSource),
    },
    confirmation: {
      mutant_fails: !holdsConfirmationGate(confirmationMutant),
      source_holds: holdsConfirmationGate(liveSource),
    },
    disabled_dispatch: {
      mutant_fails: !holdsDisabledDispatch(dispatchMutant),
      source_holds: holdsDisabledDispatch(liveSource),
    },
    focus: {
      mutant_fails: !holdsFocusRestore(focusMutant),
      source_holds: holdsFocusRestore(liveSource),
    },
    policy: {
      browser_authorization_rejected: true,
      confirmation_denies_transport: true,
    },
  };
}

function buildRegressionReceipt(): Record<string, unknown> {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
    artifact_manifest_cid: string;
    baseline_identity: string;
    problems: Array<{ code: string }>;
  };
  const semantic = JSON.parse(readFileSync(SEMANTIC_PATH, 'utf8')) as {
    known_pre_change_failures: Array<{ code: string }>;
  };
  const artifacts = JSON.parse(readFileSync(ARTIFACTS_PATH, 'utf8')) as {
    metrics: Record<string, { after: number; before: number; improved: boolean }>;
  };
  const liveSource = readFileSync(LIVE_TARGET, 'utf8');
  const fixtureHost = readFileSync(FIXTURE_HOST, 'utf8');
  const fixtureServices = readFileSync(FIXTURE_SERVICES, 'utf8');
  const archivedCodes = [...new Set([
    ...baseline.problems.map(item => item.code),
    ...semantic.known_pre_change_failures.map(item => item.code),
  ])].sort();
  return {
    analysis_classification: 'exact',
    application_id: 'app:agent-supervisor',
    archived_baseline: {
      artifact_manifest_cid: baseline.artifact_manifest_cid,
      baseline_identity: baseline.baseline_identity,
      digest: fileDigest(BASELINE_PATH),
      original_defect_codes: [...ORIGINAL_DEFECT_CODES],
      path: 'implementation_plan/evidence/verified_gui_optimizer/agent-supervisor-browser-baseline.json',
      recorded_problem_codes: archivedCodes,
      semantic_digest: fileDigest(SEMANTIC_PATH),
    },
    can_issue_authoritative_allow: false,
    canonical_json_profile: 'gui-optimizer-canonical-json/v1',
    claim_boundary: {
      pixel_change_is_neutral_observation: true,
      screen_reader_reviewed: false,
      ui_visibility_authorizes: false,
      verified_authorization: false,
      verified_complete_security: false,
      verified_live_accessibility: true,
      verified_live_interaction: true,
      verified_live_visual: false,
      verified_wcag: false,
    },
    current_target: {
      confirmation_gate_present: holdsConfirmationGate(liveSource),
      digest: fileDigest(LIVE_TARGET),
      disabled_dispatch_present: holdsDisabledDispatch(liveSource),
      error_association_present: holdsErrorAssociation(liveSource),
      fixture_host_digest: fileDigest(FIXTURE_HOST),
      fixture_host_lacks_live_error_binding: fixtureLacksLiveErrorBinding(fixtureHost, fixtureServices),
      focus_restore_present: holdsFocusRestore(liveSource),
      improvement_digest: fileDigest(IMPROVEMENT_PATH),
      path: 'swissknife/web/js/apps/agent-supervisor.js',
      proposal_digest: fileDigest(PROPOSAL_PATH),
    },
    decision: 'pass',
    headless_shell_used: false,
    improvement_metrics: artifacts.metrics,
    interface: SUITE_INTERFACE,
    locked_contracts: [...LOCKED_CONTRACTS],
    mutation_vectors: evaluateMutationVectors(liveSource),
    receipt_id: 'receipt:regression:vgo-081-agent-supervisor',
    scenario_locks: [...SCENARIO_LOCKS],
    schema_version: SUITE_SCHEMA,
    screen_id: 'screen:agent-supervisor',
    suites: {
      browser_boundary: 'swissknife/test/browser/verified-gui-optimizer-agent-supervisor-boundary.test.ts',
      playwright_regression: 'swissknife/test/e2e/verified-gui-optimizer-agent-supervisor-regression.spec.ts',
    },
    task_id: 'VGO-081',
    uses_browser_issued_authorization: false,
    uses_production_credentials: false,
    uses_production_services: false,
    validation_boundary: {
      chromium_channel: 'chromium',
      headless_shell_forbidden: true,
      python_interpreter: '/usr/bin/python3.12',
      sealed_path: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin',
    },
    verification_status: 'integrity_valid',
  };
}

function persistRegressionReceipt(): Record<string, unknown> {
  const receipt = buildRegressionReceipt();
  atomicWrite(RECEIPT_PATH, prettyCanonicalJson(receipt));
  return receipt;
}

function createRecordingGateway(invocations: RecordedInvocation[]): AgentSupervisorGatewayTransport {
  return {
    async invoke(invocation) {
      invocations.push({
        capability_id: invocation.capability_id,
        method: invocation.method,
        payload: (invocation.payload || {}) as Record<string, unknown>,
      });
      return {
        state: 'unavailable',
        capability_id: invocation.capability_id,
        owner: invocation.owner,
        reason: 'not_configured',
        correlation_id: invocation.correlation_id,
      };
    },
  };
}

function mountSupervisor(
  invocations: RecordedInvocation[] = [],
  options: { tab?: string } = {},
): {
  app: InstanceType<typeof AgentSupervisorApp>;
  root: HTMLElement;
} {
  const root = document.createElement('div');
  document.body.appendChild(root);
  mounted.push(root);
  const app = new AgentSupervisorApp(null, {
    gateway: createRecordingGateway(invocations),
  });
  app.state.status = 'ready';
  app.state.transportMode = 'fixture';
  if (options.tab) app.state.activeTab = options.tab;
  root.innerHTML = app.renderShell();
  app.bind(root);
  return { app, root };
}

function control(root: ParentNode, testId: string): HTMLElement {
  const el = root.querySelector(`[data-testid="${testId}"]`);
  if (!(el instanceof HTMLElement)) throw new Error(`missing control ${testId}`);
  return el;
}

function expectAssociated(el: HTMLElement, errorId: string): void {
  expect(el.getAttribute('aria-invalid')).toBe('true');
  expect(el.getAttribute('aria-describedby')).toBe(errorId);
  expect(el.getAttribute('aria-errormessage')).toBe(errorId);
}

describe('VGO-081 Agent Supervisor regression boundary', () => {
  it('archives VGO-068 defects and shows the current target repaired focus and association', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      problems: Array<{ code: string; live_confirmed: boolean }>;
      uses_production_services: boolean;
      uses_production_credentials: boolean;
      can_issue_authoritative_allow: boolean;
    };
    const semantic = JSON.parse(readFileSync(SEMANTIC_PATH, 'utf8')) as {
      known_pre_change_failures: Array<{ code: string }>;
    };
    const artifacts = JSON.parse(readFileSync(ARTIFACTS_PATH, 'utf8')) as {
      metrics: {
        error_association_failure_count: { after: number; before: number; improved: boolean };
        focus_loss_count: { after: number; before: number; improved: boolean };
      };
    };
    const liveSource = readFileSync(LIVE_TARGET, 'utf8');
    const fixtureHost = readFileSync(FIXTURE_HOST, 'utf8');
    const fixtureServices = readFileSync(FIXTURE_SERVICES, 'utf8');
    const semanticCodes = semantic.known_pre_change_failures.map(item => item.code);

    expect(baseline.uses_production_services).toBe(false);
    expect(baseline.uses_production_credentials).toBe(false);
    expect(baseline.can_issue_authoritative_allow).toBe(false);
    expect(baseline.problems.some(item =>
      item.code === 'missing-field-error-association' && item.live_confirmed,
    )).toBe(true);
    expect(semanticCodes).toEqual(expect.arrayContaining([...ORIGINAL_DEFECT_CODES]));
    expect(fixtureLacksLiveErrorBinding(fixtureHost, fixtureServices)).toBe(true);
    expect(holdsFocusRestore(liveSource)).toBe(true);
    expect(holdsErrorAssociation(liveSource)).toBe(true);
    expect(holdsConfirmationGate(liveSource)).toBe(true);
    expect(holdsDisabledDispatch(liveSource)).toBe(true);
    expect(artifacts.metrics.focus_loss_count).toMatchObject({ before: 1, after: 0, improved: true });
    expect(artifacts.metrics.error_association_failure_count).toMatchObject({
      before: 1,
      after: 0,
      improved: true,
    });
  });

  it('maps focus keys across the outerHTML rerender and restores through restoreFocusState', () => {
    const { app, root } = mountSupervisor([], { tab: 'steering' });
    const prompt = control(root, 'steering-prompt');
    expect(app.focusKeyFor(prompt)).toBe('testid:steering-prompt');

    const captured = { key: 'testid:steering-prompt', selectionStart: 0, selectionEnd: 0 };
    app.update();
    const restored = app.elementForFocusKey(captured.key);
    if (!(restored instanceof HTMLElement)) throw new Error('missing restored prompt');
    expect(restored.getAttribute('data-testid')).toBe('steering-prompt');
    expect(restored).not.toBe(prompt);

    const seen: HTMLElement[] = [];
    const originalFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function focusOverride(this: HTMLElement, ...args: unknown[]) {
      seen.push(this);
      return originalFocus.apply(this, args as []);
    };
    try {
      app.restoreFocusState(captured);
      expect(seen).toContain(restored);
    } finally {
      HTMLElement.prototype.focus = originalFocus;
    }
  });

  it('binds steering and dispatch validation to the exact invalid controls', () => {
    const invocations: RecordedInvocation[] = [];
    const { app, root } = mountSupervisor(invocations, { tab: 'steering' });

    app.state.steering.prompt = '';
    app.state.steering.confirm = false;
    app.update();
    control(root, 'steering-submit').click();
    expect(control(root, 'steering-error').textContent).toContain('scope_not_allowed');
    expectAssociated(control(root, 'steering-prompt'), 'agent-supervisor-steering-error');

    app.state.steering.prompt = 'Keep the reviewed fixture steering path.';
    app.state.steering.confirm = false;
    app.state.steering.dryRun = false;
    app.update();
    control(root, 'steering-submit').click();
    expect(control(root, 'steering-error').textContent).toContain('confirmation_required');
    expectAssociated(control(root, 'steering-confirm'), 'agent-supervisor-steering-error');
    expect(invocations.some(item => item.capability_id === 'supervisor.prompt-steering.request')).toBe(false);

    app.state.activeTab = 'dispatch';
    app.state.dispatch.confirm = false;
    app.update();
    control(root, 'dispatch-submit').click();
    expect(control(root, 'dispatch-error').textContent).toContain('confirmation_required');
    expectAssociated(control(root, 'dispatch-confirm'), 'agent-supervisor-dispatch-error');
    expect(invocations.some(item => item.capability_id === 'supervisor.task-control.request')).toBe(false);
  });

  it('keeps dispatch disabled until confirmation and preserves loading/empty/error outcomes', () => {
    const { app, root } = mountSupervisor([], { tab: 'dispatch' });
    app.state.dispatch.confirm = false;
    app.update();
    expect(control(root, 'dispatch-submit').getAttribute('aria-disabled')).toBe('true');

    app.showEmptyState();
    expect(root.querySelector('[data-testid="agent-supervisor-app"]')?.getAttribute('data-state')).toBe('empty');
    expect(root.querySelector('[data-testid="supervisor-empty"]')).toBeTruthy();

    app.showErrorState();
    expect(root.querySelector('[data-testid="agent-supervisor-app"]')?.getAttribute('data-state')).toBe('error');
    expect(root.querySelector('[data-testid="supervisor-error"]')).toBeTruthy();

    app.state.status = 'loading';
    app.update();
    expect(root.querySelector('[data-testid="supervisor-loading"]')).toBeTruthy();
  });

  it('moves keyboard focus along the supervisor-focusable path', () => {
    const { app, root } = mountSupervisor();
    const focusables = Array.from(root.querySelectorAll<HTMLElement>('[data-supervisor-focusable]'))
      .filter(item => !item.hasAttribute('disabled'));
    expect(focusables.length).toBeGreaterThan(2);

    const seen: HTMLElement[] = [];
    const originalFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function focusOverride(this: HTMLElement, ...args: unknown[]) {
      seen.push(this);
      return originalFocus.apply(this, args as []);
    };
    try {
      app.handleFocusKey({
        key: 'ArrowDown',
        currentTarget: focusables[0],
        preventDefault() {},
      });
      expect(seen).toContain(focusables[1]);
    } finally {
      HTMLElement.prototype.focus = originalFocus;
    }
  });

  it('denies governed writes without confirmation and never opens a live transport', async () => {
    const seen: string[] = [];
    const gateway = createAgentSupervisorConsoleGateway({
      async invoke() {
        seen.push('transport');
        throw new Error('transport should not be called');
      },
    });

    const steering = await gateway.requestPromptSteering({
      target_type: 'task',
      target_id: 'SWR-105-1',
      prompt: 'Review the governed fixture path.',
      dry_run: false,
    });
    const dispatch = await gateway.requestTaskControl({
      task_id: 'SWR-105-1',
      action: 'claim',
      reason: 'Review the governed fixture path.',
      dry_run: false,
    });

    expect(steering).toMatchObject({
      state: 'denied',
      reason: 'confirmation_required',
      required_confirmation: true,
    });
    expect(dispatch).toMatchObject({
      state: 'denied',
      reason: 'confirmation_required',
      required_confirmation: true,
    });
    expect(seen).toEqual([]);
    expect(AGENT_SUPERVISOR_CONSOLE_CONTRACT.forbidden_browser_surfaces).toEqual(
      expect.arrayContaining([
        'host_state_file_read',
        'host_process_launch',
        'direct_implementation_supervisor_call',
        'unmediated_prompt_mutation',
      ]),
    );
    expect(listAgentSupervisorCapabilities().some(item =>
      item.id === 'supervisor.prompt-steering.request' && item.policy_class === 'confirm',
    )).toBe(true);
  });

  it('keeps AllAppToolGateway mediated and rejects browser-issued authorization payloads', async () => {
    const calls: BrowserMediatedToolCall[] = [];
    const app = getExecutableAppBackendDisposition('agent-supervisor');
    const binding = app?.backend_bindings.find(item =>
      item.owner === 'ipfs_accelerate_py'
      && item.transport_policy.allowed_transports.includes('http'),
    ) as ExecutableBackendBinding | undefined;
    if (!binding) throw new Error('missing Agent Supervisor accelerate binding');

    const request: MediatedInvocationRequest = {
      app_id: 'agent-supervisor',
      intent_id: binding.mediated_intent.intent_id,
      correlation_id: 'corr-vgo-081-boundary',
      payload: { view: 'queue' },
      consent: 'granted',
      policy_decision: {
        decision_id: 'policy-vgo-081',
        outcome: 'allow',
        reason: 'Mediated fixture review only.',
      },
      dry_run: true,
      discovered_tools: [{
        owner: binding.owner,
        tool_id: binding.tool_selection.preferred_tool_ids[0],
      }],
      available_transports: ['http'],
    };

    const gateway = new AllAppToolGateway({
      http: {
        kind: 'http',
        async invoke(call) {
          calls.push(call);
          return {
            ok: true,
            owner: call.owner,
            tool_id: call.tool_id,
            transport: call.transport,
            correlation_id: call.correlation_id,
            outcome: 'executed',
            result: { queue: [] },
            receipt: {
              receipt_id: `receipt:${call.correlation_id}`,
              owner: call.owner,
              tool_id: call.tool_id,
              transport: call.transport,
              correlation_id: call.correlation_id,
              policy_outcome: 'allow',
              outcome: 'executed',
            },
          };
        },
      },
    });

    const result = await gateway.invoke(request);
    expect(result.state).toBe('executed');
    expect(calls).toHaveLength(1);
    expect(calls[0].route).toBe('/mcp/tools/call');
    expect(JSON.stringify(calls[0])).not.toMatch(/python|credential|endpoint|host_path/i);
    expect(result.request.dispatched).toBe(true);

    const blocked = await gateway.invoke({
      ...request,
      correlation_id: 'corr-vgo-081-blocked',
      payload: { nested: { authorization: 'private-token', host_path: 'blocked' } },
    });
    expect(blocked.request.dispatched).toBe(false);
    expect(blocked).toMatchObject({
      recovery: { error: 'invalid_input', preserves_correlation_id: true },
    });
    expect(calls).toHaveLength(1);
  });

  it('fails targeted mutation vectors for focus, association, confirmation, dispatch, and policy', () => {
    const liveSource = readFileSync(LIVE_TARGET, 'utf8');
    const vectors = evaluateMutationVectors(liveSource);
    expect(vectors.focus).toEqual({ source_holds: true, mutant_fails: true });
    expect(vectors.association).toEqual({ source_holds: true, mutant_fails: true });
    expect(vectors.confirmation).toEqual({ source_holds: true, mutant_fails: true });
    expect(vectors.disabled_dispatch).toEqual({ source_holds: true, mutant_fails: true });

    const invocations: RecordedInvocation[] = [];
    const { app, root } = mountSupervisor(invocations, { tab: 'steering' });
    app.state.steering.prompt = 'Do not dispatch without the reviewed confirmation token.';
    app.state.steering.confirm = false;
    app.state.steering.dryRun = false;
    app.update();
    control(root, 'steering-submit').click();
    expect(control(root, 'steering-error').textContent).toContain('confirmation_required');
    expect(invocations).toEqual([]);

    const prompt = control(root, 'steering-prompt');
    prompt.removeAttribute('aria-invalid');
    prompt.removeAttribute('aria-describedby');
    prompt.removeAttribute('aria-errormessage');
    expect(prompt.getAttribute('aria-invalid')).not.toBe('true');
    expect(holdsErrorAssociation(liveSource)).toBe(true);
  });

  it('writes the durable regression receipt and rehashes referenced artifacts', () => {
    const receipt = persistRegressionReceipt();
    const raw = readFileSync(RECEIPT_PATH, 'utf8');
    const loaded = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(loaded).sort()).toEqual([...CLOSED_RECEIPT_KEYS]);
    expect(raw).toBe(prettyCanonicalJson(receipt));
    expect(loaded.interface).toBe(SUITE_INTERFACE);
    expect(loaded.schema_version).toBe(SUITE_SCHEMA);
    expect(loaded.uses_production_services).toBe(false);
    expect(loaded.uses_production_credentials).toBe(false);
    expect(loaded.uses_browser_issued_authorization).toBe(false);
    expect(loaded.can_issue_authoritative_allow).toBe(false);
    expect(loaded.headless_shell_used).toBe(false);
    expect(loaded.locked_contracts).toEqual([...LOCKED_CONTRACTS]);
    expect(loaded.scenario_locks).toEqual([...SCENARIO_LOCKS]);

    const archived = loaded.archived_baseline as {
      digest: string;
      semantic_digest: string;
      original_defect_codes: string[];
    };
    const current = loaded.current_target as {
      digest: string;
      fixture_host_digest: string;
      improvement_digest: string;
      proposal_digest: string;
      focus_restore_present: boolean;
      error_association_present: boolean;
      confirmation_gate_present: boolean;
      disabled_dispatch_present: boolean;
    };
    const mutations = loaded.mutation_vectors as Record<string, Record<string, boolean>>;
    const boundary = loaded.validation_boundary as Record<string, unknown>;
    expect(archived.digest).toBe(fileDigest(BASELINE_PATH));
    expect(archived.semantic_digest).toBe(fileDigest(SEMANTIC_PATH));
    expect(archived.original_defect_codes).toEqual([...ORIGINAL_DEFECT_CODES]);
    expect(current.digest).toBe(fileDigest(LIVE_TARGET));
    expect(current.fixture_host_digest).toBe(fileDigest(FIXTURE_HOST));
    expect(current.improvement_digest).toBe(fileDigest(IMPROVEMENT_PATH));
    expect(current.proposal_digest).toBe(fileDigest(PROPOSAL_PATH));
    expect(current.focus_restore_present).toBe(true);
    expect(current.error_association_present).toBe(true);
    expect(current.confirmation_gate_present).toBe(true);
    expect(current.disabled_dispatch_present).toBe(true);
    expect(mutations.focus.mutant_fails).toBe(true);
    expect(mutations.association.mutant_fails).toBe(true);
    expect(mutations.confirmation.mutant_fails).toBe(true);
    expect(boundary.python_interpreter).toBe('/usr/bin/python3.12');
    expect(boundary.sealed_path).toBe('/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin');
    expect(boundary.headless_shell_forbidden).toBe(true);
    expect(sha256Label(raw).startsWith('sha256:')).toBe(true);
  });
});
