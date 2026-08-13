/**
 * VGO-061 — controlled Agent Supervisor browser fixtures.
 *
 * Acceptance:
 * - Required scenarios are reproducible without production state
 * - Unexpected network/effectful calls fail
 * - Fixtures cannot issue an authoritative allow decision
 * - Fixture purity, no-network canary, deterministic response and seed snapshots
 */

// @vitest-environment node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CANONICAL_JSON_PROFILE } from '../../../../src/services/gui-optimizer/models.js';
import {
  AGENT_SUPERVISOR_APPLICATION_ID,
  AGENT_SUPERVISOR_CATALOG_ID,
  AGENT_SUPERVISOR_CATALOG_SEED,
  AGENT_SUPERVISOR_DEFAULT_LOCALE,
  AGENT_SUPERVISOR_FROZEN_TIME,
  AGENT_SUPERVISOR_SCREEN_ID,
  AGENT_SUPERVISOR_TIMEZONE,
  EXPECTED_TERMINAL_STATES,
  REQUIRED_SCENARIO_KINDS,
  STABLE_SCENARIO_IDS,
  VIEWPORT_DESKTOP,
  VIEWPORT_MOBILE,
  VIEWPORT_WIDE,
} from '../../../../src/services/gui-optimizer/scenario-catalog.js';

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/gui-optimizer/agent-supervisor',
);
const HOST_PATH = join(FIXTURE_DIR, 'fixture-host.html');
const SERVICES_PATH = join(FIXTURE_DIR, 'fixture-services.js');
const SCENARIOS_PATH = join(FIXTURE_DIR, 'fixture-scenarios.json');

function loadFixtureServices(): FixtureServicesApi {
  const source = readFileSync(SERVICES_PATH, 'utf8');
  const sandbox: {
    module: { exports: Partial<FixtureServicesApi> };
    exports: Partial<FixtureServicesApi>;
    console: Console;
    globalThis?: unknown;
    AgentSupervisorFixtureServices?: FixtureServicesApi;
  } = {
    module: { exports: {} },
    exports: {},
    console,
  };
  sandbox.globalThis = sandbox;
  sandbox.exports = sandbox.module.exports;
  runInContext(source, createContext(sandbox), { filename: SERVICES_PATH });
  const exported = sandbox.module.exports as FixtureServicesApi;
  if (exported && exported.interface) return exported;
  if (sandbox.AgentSupervisorFixtureServices) {
    return sandbox.AgentSupervisorFixtureServices;
  }
  throw new Error('fixture-services.js did not export AgentSupervisorFixtureServices@1');
}

const fixtureServices = loadFixtureServices();

interface FixtureServicesApi {
  readonly interface: string;
  readonly schema_version: string;
  readonly host_interface: string;
  readonly host_schema: string;
  readonly scenarios_interface: string;
  readonly scenarios_schema: string;
  readonly snapshot_interface: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly catalog_id: string;
  readonly seed: string;
  readonly frozen_time: string;
  readonly timezone: string;
  readonly locale: string;
  readonly canonical_json_profile: string;
  readonly uses_production_services: boolean;
  readonly uses_production_credentials: boolean;
  readonly can_issue_authoritative_allow: boolean;
  readonly REQUIRED_SCENARIO_KINDS: readonly string[];
  readonly STABLE_SCENARIO_IDS: Readonly<Record<string, string>>;
  readonly EXPECTED_TERMINAL_STATES: Readonly<Record<string, readonly string[]>>;
  readonly VIEWPORTS: Readonly<Record<string, unknown>>;
  readonly SERVICE_DESCRIPTORS: Readonly<Record<string, string>>;
  readonly NETWORK_POLICY: {
    readonly mode: string;
    readonly allowed_url_prefixes: readonly string[];
    readonly blocked_classes: readonly string[];
  };
  readonly FixtureNetworkError: new (message: string) => Error;
  readonly FixtureEffectError: new (message: string) => Error;
  readonly FixtureAuthorityError: new (message: string) => Error;
  canonicalJson(value: unknown): string;
  getScenarioDocument(): ScenarioDocument;
  listScenarios(document?: ScenarioDocument): readonly ScenarioRow[];
  listCapabilities(): readonly CapabilityRow[];
  getScenarioById(scenarioId: string, document?: ScenarioDocument): ScenarioRow;
  getFixtureById(fixtureId: string, document?: ScenarioDocument): FixtureRow;
  createClock(frozenTime?: string): { iso: string; ms: number; now(): number };
  createIdFactory(seed?: string): (kind?: string) => string;
  installClock(target: Record<string, unknown>, frozenTime?: string): { iso: string };
  installIdFactory(target: Record<string, unknown>, seed?: string): (kind?: string) => string;
  installNetworkCanary(
    target: Record<string, any>,
    options?: { allowRelative?: readonly string[] },
  ): { interface: string; mode: string; calls: unknown[] };
  installGateway(target: Record<string, any>, services: FixtureRuntime): unknown;
  expandRecipe(recipe: string): unknown;
  renderFixtureMarkup(snapshot: FixtureSnapshot): string;
  createServices(options?: { scenarioId?: string; scenarioDocument?: ScenarioDocument }): FixtureRuntime;
  createHost(options?: { scenarioId?: string; scenarioDocument?: ScenarioDocument }): FixtureHost;
  boot(target: Record<string, any>): { interface: string; host: FixtureHost };
}

interface ScenarioDocument {
  readonly interface: string;
  readonly schema_version: string;
  readonly host_interface: string;
  readonly services_interface: string;
  readonly catalog_id: string;
  readonly application_id: string;
  readonly screen_id: string;
  readonly seed: string;
  readonly frozen_time: string;
  readonly timezone: string;
  readonly locale: string;
  readonly canonical_json_profile: string;
  readonly uses_production_services: boolean;
  readonly uses_production_credentials: boolean;
  readonly can_issue_authoritative_allow: boolean;
  readonly network_policy: {
    readonly mode: string;
    readonly allowed_url_prefixes: readonly string[];
    readonly blocked_classes: readonly string[];
  };
  readonly required_scenario_kinds: readonly string[];
  readonly stable_scenario_ids: Readonly<Record<string, string>>;
  readonly expected_terminal_states: Readonly<Record<string, readonly string[]>>;
  readonly recipes: Readonly<Record<string, unknown>>;
  readonly fixtures: readonly FixtureRow[];
  readonly scenarios: readonly ScenarioRow[];
}

interface ScenarioRow {
  readonly kind: string;
  readonly scenario_id: string;
  readonly name: string;
  readonly fixture_id: string;
  readonly viewport: string;
  readonly locale: string;
  readonly color_scheme: string;
  readonly text_scale_percent: number;
  readonly reduced_motion: boolean;
  readonly tags: readonly string[];
  readonly expected_terminal_states: readonly string[];
}

interface FixtureRow {
  readonly fixture_id: string;
  readonly recipe: string;
  readonly service_mode: string;
  readonly animation: string;
}

interface CapabilityRow {
  readonly id: string;
  readonly access: string;
  readonly owner: string;
  readonly method: string;
  readonly policy_class: string;
}

interface FixtureSnapshot {
  readonly interface: string;
  readonly scenario_id: string;
  readonly fixture_id: string;
  readonly kind: string;
  readonly seed: string;
  readonly frozen_time: string;
  readonly terminal_state: string;
  readonly expected_terminal_states: readonly string[];
  readonly network_outcome: string;
  readonly uses_production_services: boolean;
  readonly uses_production_credentials: boolean;
  readonly can_issue_authoritative_allow: boolean;
  readonly confirmation: {
    readonly required: boolean;
    readonly decision: string | null;
    readonly authoritative: boolean;
  };
  readonly last_invocation: GatewayResult | null;
  readonly application_data: {
    readonly health: { readonly status: string };
    readonly goals: readonly unknown[];
    readonly queue: readonly unknown[];
    readonly steering: { readonly prompt: string; readonly valid: boolean };
  };
}

interface GatewayResult {
  readonly state: string;
  readonly capability_id: string;
  readonly reason?: string;
  readonly required_confirmation?: boolean;
  readonly data?: {
    readonly accepted?: boolean;
    readonly authoritative?: boolean;
    readonly decision_authority?: string;
    readonly fixture_only?: boolean;
  };
  readonly runtime?: {
    readonly policy_outcome?: string;
    readonly authoritative?: boolean;
    readonly fixture_disposition?: string;
    readonly decision_authority?: string;
  };
}

interface FixtureRuntime {
  readonly interface: string;
  readonly uses_production_services: boolean;
  readonly uses_production_credentials: boolean;
  readonly can_issue_authoritative_allow: boolean;
  invoke(invocation: Record<string, unknown>): Promise<GatewayResult>;
  invokeSync(invocation: Record<string, unknown>): GatewayResult;
  applyScenario(scenarioId: string): FixtureSnapshot;
  snapshot(): FixtureSnapshot;
  recordConfirmation(decision: string): { authoritative: boolean };
  issueAuthoritativeAllow(): never;
  allow(): never;
  listInvocations(): readonly GatewayResult[];
  getScenario(): ScenarioRow;
}

interface FixtureHost {
  readonly interface: string;
  readonly can_issue_authoritative_allow: boolean;
  readonly services: FixtureRuntime;
  snapshot(): FixtureSnapshot;
  applyScenario(scenarioId: string): string;
  recordConfirmation(decision: string): { authoritative: boolean };
  issueAuthoritativeAllow(): never;
  render(): string;
}

function loadScenarioDocument(): ScenarioDocument {
  return JSON.parse(readFileSync(SCENARIOS_PATH, 'utf8')) as ScenarioDocument;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(fixtureServices.canonicalJson(value))
    .digest('hex')}`;
}

function readInvocation(
  capabilityId: string,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  const capability = fixtureServices
    .listCapabilities()
    .find((item) => item.id === capabilityId);
  if (!capability) throw new Error(`missing capability ${capabilityId}`);
  return {
    capability_id: capability.id,
    owner: capability.owner,
    method: capability.method,
    access: capability.access,
    policy_class: capability.policy_class,
    payload: {},
    ...extras,
  };
}

function assertNonAuthoritative(result: GatewayResult): void {
  expect(result.runtime?.authoritative).not.toBe(true);
  expect(result.runtime?.policy_outcome).not.toBe('allow');
  expect(result.data?.authoritative).not.toBe(true);
  expect((result as { browser_policy_authoritative?: boolean }).browser_policy_authoritative).not.toBe(
    true,
  );
}

const PRODUCTION_LEAK = /https?:\/\/|sk-[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._-]+|api[_-]?key\s*[:=]|password\s*[:=]|-----BEGIN |mcp:\/\//i;

describe('AgentSupervisorFixtureHost@1 / AgentSupervisorFixtureServices@1 (VGO-061)', () => {
  it('exports sealed host, services, and scenario identities', () => {
    expect(fixtureServices.interface).toBe('AgentSupervisorFixtureServices@1');
    expect(fixtureServices.schema_version).toBe(
      'agent-supervisor-fixture-services/v1',
    );
    expect(fixtureServices.host_interface).toBe('AgentSupervisorFixtureHost@1');
    expect(fixtureServices.host_schema).toBe('agent-supervisor-fixture-host/v1');
    expect(fixtureServices.scenarios_interface).toBe(
      'AgentSupervisorFixtureScenarios@1',
    );
    expect(fixtureServices.scenarios_schema).toBe(
      'agent-supervisor-fixture-scenarios/v1',
    );
    expect(fixtureServices.snapshot_interface).toBe(
      'AgentSupervisorFixtureSnapshot@1',
    );
    expect(fixtureServices.canonical_json_profile).toBe(CANONICAL_JSON_PROFILE);
    expect(fixtureServices.application_id).toBe(AGENT_SUPERVISOR_APPLICATION_ID);
    expect(fixtureServices.screen_id).toBe(AGENT_SUPERVISOR_SCREEN_ID);
    expect(fixtureServices.catalog_id).toBe(AGENT_SUPERVISOR_CATALOG_ID);
    expect(fixtureServices.seed).toBe(AGENT_SUPERVISOR_CATALOG_SEED);
    expect(fixtureServices.frozen_time).toBe(AGENT_SUPERVISOR_FROZEN_TIME);
    expect(fixtureServices.timezone).toBe(AGENT_SUPERVISOR_TIMEZONE);
    expect(fixtureServices.locale).toBe(AGENT_SUPERVISOR_DEFAULT_LOCALE);
    expect(fixtureServices.uses_production_services).toBe(false);
    expect(fixtureServices.uses_production_credentials).toBe(false);
    expect(fixtureServices.can_issue_authoritative_allow).toBe(false);
  });

  it('keeps the on-disk scenario document byte-identical to the services generator', () => {
    const fromDisk = loadScenarioDocument();
    const fromServices = fixtureServices.getScenarioDocument();
    expect(fixtureServices.canonicalJson(fromDisk)).toBe(
      fixtureServices.canonicalJson(fromServices),
    );
    expect(digest(fromDisk)).toBe(digest(fromServices));
    expect(fromDisk.interface).toBe('AgentSupervisorFixtureScenarios@1');
    expect(fromDisk.host_interface).toBe('AgentSupervisorFixtureHost@1');
    expect(fromDisk.services_interface).toBe('AgentSupervisorFixtureServices@1');
    expect(fromDisk.can_issue_authoritative_allow).toBe(false);
    expect(fromDisk.uses_production_services).toBe(false);
    expect(fromDisk.uses_production_credentials).toBe(false);
  });

  it('declares every required catalog scenario exactly once with stable IDs', () => {
    const document = loadScenarioDocument();
    expect(document.required_scenario_kinds).toEqual([...REQUIRED_SCENARIO_KINDS]);
    expect(document.scenarios).toHaveLength(REQUIRED_SCENARIO_KINDS.length);
    expect(document.stable_scenario_ids).toEqual({ ...STABLE_SCENARIO_IDS });
    expect(document.expected_terminal_states).toEqual({
      ...EXPECTED_TERMINAL_STATES,
    });

    const ids = document.scenarios.map((row) => row.scenario_id);
    expect(new Set(ids).size).toBe(ids.length);

    for (let index = 0; index < REQUIRED_SCENARIO_KINDS.length; index += 1) {
      const kind = REQUIRED_SCENARIO_KINDS[index];
      const row = document.scenarios[index];
      expect(row.kind).toBe(kind);
      expect(row.scenario_id).toBe(STABLE_SCENARIO_IDS[kind]);
      expect(row.expected_terminal_states).toEqual([
        ...EXPECTED_TERMINAL_STATES[kind],
      ]);
      expect(document.fixtures.some((fixture) => fixture.fixture_id === row.fixture_id)).toBe(
        true,
      );
    }
  });

  it('binds compact recipes instead of production envelopes or live service URLs', () => {
    const document = loadScenarioDocument();
    expect(Object.keys(document.recipes).length).toBeGreaterThan(0);
    for (const fixture of document.fixtures) {
      expect(document.recipes[fixture.recipe]).toBeTruthy();
      expect(fixture.service_mode).toBeTruthy();
    }
    for (const prefix of document.network_policy.allowed_url_prefixes) {
      expect(prefix.startsWith('synthetic://')).toBe(true);
    }
    for (const descriptor of Object.values(fixtureServices.SERVICE_DESCRIPTORS)) {
      expect(descriptor.startsWith('synthetic://agent-supervisor/')).toBe(true);
    }
    expect(document.network_policy.mode).toBe('fail-closed');
    expect(document.network_policy.blocked_classes).toEqual(
      expect.arrayContaining(['fetch', 'xhr', 'websocket', 'mcp', 'credentials']),
    );
  });

  it('aligns viewport presets with the deterministic catalog', () => {
    expect(fixtureServices.VIEWPORTS.mobile).toEqual(VIEWPORT_MOBILE);
    expect(fixtureServices.VIEWPORTS.desktop).toEqual(VIEWPORT_DESKTOP);
    expect(fixtureServices.VIEWPORTS.wide).toEqual(VIEWPORT_WIDE);
    const mobile = fixtureServices.getScenarioById('scenario:viewport-mobile');
    const desktop = fixtureServices.getScenarioById('scenario:viewport-desktop');
    const wide = fixtureServices.getScenarioById('scenario:viewport-wide');
    const zoom = fixtureServices.getScenarioById('scenario:text-scale-200');
    const dark = fixtureServices.getScenarioById('scenario:dark-mode');
    const reduced = fixtureServices.getScenarioById('scenario:reduced-motion');
    expect(mobile.viewport).toBe('mobile');
    expect(desktop.viewport).toBe('desktop');
    expect(wide.viewport).toBe('wide');
    expect(zoom.text_scale_percent).toBe(200);
    expect(dark.color_scheme).toBe('dark');
    expect(reduced.reduced_motion).toBe(true);
  });

  it('reproduces every required scenario without production state', () => {
    const first = fixtureServices.createServices();
    const second = fixtureServices.createServices();
    const snapshots = [];
    for (const kind of REQUIRED_SCENARIO_KINDS) {
      const scenarioId = STABLE_SCENARIO_IDS[kind];
      const left = first.applyScenario(scenarioId);
      const right = second.applyScenario(scenarioId);
      expect(left.scenario_id).toBe(scenarioId);
      expect(left.kind).toBe(kind);
      expect(left.terminal_state).toBe(EXPECTED_TERMINAL_STATES[kind][0]);
      expect(left.expected_terminal_states).toEqual([
        ...EXPECTED_TERMINAL_STATES[kind],
      ]);
      expect(left.uses_production_services).toBe(false);
      expect(left.uses_production_credentials).toBe(false);
      expect(left.can_issue_authoritative_allow).toBe(false);
      expect(left.seed).toBe(AGENT_SUPERVISOR_CATALOG_SEED);
      expect(left.frozen_time).toBe(AGENT_SUPERVISOR_FROZEN_TIME);
      expect(left.confirmation.authoritative).toBe(false);
      expect(fixtureServices.canonicalJson(left)).toBe(
        fixtureServices.canonicalJson(right),
      );
      snapshots.push(left);
    }
    expect(snapshots).toHaveLength(REQUIRED_SCENARIO_KINDS.length);
  });

  it('emits deterministic response and seed snapshots for identical inputs', async () => {
    const services = fixtureServices.createServices({
      scenarioId: 'scenario:initial-load',
    });
    const firstRead = services.invokeSync(readInvocation('supervisor.goals.read'));
    const secondRead = services.invokeSync(readInvocation('supervisor.goals.read'));
    expect(fixtureServices.canonicalJson(firstRead)).toBe(
      fixtureServices.canonicalJson(secondRead),
    );
    assertNonAuthoritative(firstRead);

    const firstSnapshot = services.snapshot();
    const replay = fixtureServices.createServices({
      scenarioId: 'scenario:initial-load',
    });
    replay.invokeSync(readInvocation('supervisor.goals.read'));
    replay.invokeSync(readInvocation('supervisor.goals.read'));
    expect(digest(replay.snapshot())).toBe(digest(firstSnapshot));
    expect(digest(firstSnapshot)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('freezes clock and ID factories to the catalog seed', () => {
    const clock = fixtureServices.createClock();
    expect(clock.iso).toBe(AGENT_SUPERVISOR_FROZEN_TIME);
    expect(clock.now()).toBe(Date.parse(AGENT_SUPERVISOR_FROZEN_TIME));
    const ids = fixtureServices.createIdFactory();
    expect(ids('corr')).toBe(
      `corr:${AGENT_SUPERVISOR_CATALOG_SEED}:0001`,
    );
    expect(ids('corr')).toBe(
      `corr:${AGENT_SUPERVISOR_CATALOG_SEED}:0002`,
    );
    const target: Record<string, any> = {};
    fixtureServices.installClock(target);
    fixtureServices.installIdFactory(target);
    expect(target.Date.now()).toBe(Date.parse(AGENT_SUPERVISOR_FROZEN_TIME));
    expect(target.__agentSupervisorFixtureIdFactory('id')).toBe(
      `id:${AGENT_SUPERVISOR_CATALOG_SEED}:0001`,
    );
  });

  it('fails unexpected network and effectful calls through the no-network canary', async () => {
    const target: Record<string, any> = { navigator: {} };
    const canary = fixtureServices.installNetworkCanary(target);
    expect(canary.interface).toBe('AgentSupervisorFixtureNetworkCanary@1');
    expect(canary.mode).toBe('fail-closed');

    await expect(target.fetch('https://example.invalid/health')).rejects.toThrow(
      /unexpected fetch/,
    );
    expect(() => new target.XMLHttpRequest().open('GET', 'https://example.invalid/x')).toThrow(
      /unexpected xhr/,
    );
    expect(() => new target.WebSocket('wss://example.invalid/mcp')).toThrow(
      /unexpected websocket/,
    );
    expect(() => new target.EventSource('https://example.invalid/events')).toThrow(
      /unexpected eventsource/,
    );
    expect(() => target.navigator.sendBeacon('https://example.invalid/collect')).toThrow(
      /unexpected beacon/,
    );

    const services = fixtureServices.createServices();
    expect(() =>
      services.invokeSync({
        capability_id: 'supervisor.unknown.explode',
        method: 'agent_supervisor.unknown.explode',
        owner: 'ipfs_accelerate_py',
        access: 'governed-write',
        policy_class: 'confirm',
        payload: {},
      }),
    ).toThrow(/unexpected effectful call/);
    expect(() =>
      services.invokeSync({
        capability_id: 'supervisor.health.read',
        method: 'mcp.tools/call',
        owner: 'ipfs_accelerate_py',
        access: 'read',
        policy_class: 'read',
        payload: {},
      }),
    ).toThrow(/unexpected method/);
  });

  it('cannot issue an authoritative allow decision from services or host', async () => {
    const services = fixtureServices.createServices({
      scenarioId: 'scenario:confirmation-grant',
    });
    expect(() => services.issueAuthoritativeAllow()).toThrow(
      /cannot issue an authoritative allow decision/,
    );
    expect(() => services.allow()).toThrow(
      /cannot issue an authoritative allow decision/,
    );

    const granted = await services.invoke(
      readInvocation('supervisor.prompt-steering.request', {
        payload: {
          target_type: 'task',
          target_id: 'task:synthetic-1',
          prompt: 'Synthetic governed prompt',
          dry_run: false,
          confirmation_token: 'confirm-agent-supervisor:task:task:synthetic-1:fixture',
        },
      }),
    );
    expect(granted.state).toBe('available');
    expect(granted.data?.accepted).toBe(true);
    expect(granted.data?.authoritative).toBe(false);
    expect(granted.data?.decision_authority).toBe('fixture-simulated');
    expect(granted.data?.fixture_only).toBe(true);
    expect(granted.runtime?.policy_outcome).toBe('require_confirmation');
    expect(granted.runtime?.authoritative).toBe(false);
    expect(granted.runtime?.fixture_disposition).toBe('simulated_confirmation_grant');
    assertNonAuthoritative(granted);

    const denied = fixtureServices
      .createServices({ scenarioId: 'scenario:confirmation-deny' })
      .invokeSync(
        readInvocation('supervisor.prompt-steering.request', {
          payload: {
            target_type: 'task',
            target_id: 'task:synthetic-1',
            prompt: 'Synthetic governed prompt',
            dry_run: false,
            confirmation_token: 'confirm-agent-supervisor:task:task:synthetic-1:fixture',
          },
        }),
      );
    expect(denied.state).toBe('denied');
    expect(denied.reason).toBe('policy_denied');
    assertNonAuthoritative(denied);

    const unconfirmed = fixtureServices
      .createServices({ scenarioId: 'scenario:initial-load' })
      .invokeSync(
        readInvocation('supervisor.task-control.request', {
          payload: {
            task_id: 'task:synthetic-1',
            action: 'claim',
            reason: 'fixture',
            dry_run: false,
          },
        }),
      );
    expect(unconfirmed.state).toBe('denied');
    expect(unconfirmed.reason).toBe('confirmation_required');
    expect(unconfirmed.required_confirmation).toBe(true);
    assertNonAuthoritative(unconfirmed);

    const host = fixtureServices.createHost({
      scenarioId: 'scenario:confirmation-grant',
    });
    expect(host.can_issue_authoritative_allow).toBe(false);
    expect(() => host.issueAuthoritativeAllow()).toThrow(
      /cannot issue an authoritative allow decision/,
    );
    expect(host.recordConfirmation('granted').authoritative).toBe(false);
  });

  it('keeps confirmation grant and deny paths distinct and non-authoritative', () => {
    const grant = fixtureServices
      .createServices({ scenarioId: 'scenario:confirmation-grant' })
      .snapshot();
    const deny = fixtureServices
      .createServices({ scenarioId: 'scenario:confirmation-deny' })
      .snapshot();
    expect(grant.terminal_state).toBe('state:success');
    expect(deny.terminal_state).toBe('state:ready');
    expect(grant.confirmation.decision).toBe('granted');
    expect(deny.confirmation.decision).toBe('denied');
    expect(grant.confirmation.authoritative).toBe(false);
    expect(deny.confirmation.authoritative).toBe(false);
    expect(digest(grant)).not.toBe(digest(deny));
  });

  it('surfaces loading, empty, recovery, failure, and unavailable as distinct modes', () => {
    const loading = fixtureServices
      .createServices({ scenarioId: 'scenario:loading' })
      .invokeSync(readInvocation('supervisor.health.read'));
    const empty = fixtureServices
      .createServices({ scenarioId: 'scenario:empty' })
      .snapshot();
    const recoverable = fixtureServices
      .createServices({ scenarioId: 'scenario:recoverable-failure' })
      .invokeSync(readInvocation('supervisor.queue.read'));
    const failure = fixtureServices
      .createServices({ scenarioId: 'scenario:unrecoverable-failure' })
      .invokeSync(readInvocation('supervisor.goals.read'));
    const unavailable = fixtureServices
      .createServices({ scenarioId: 'scenario:service-unavailable' })
      .invokeSync(readInvocation('supervisor.health.read'));

    expect(loading.state).toBe('unavailable');
    expect(loading.runtime?.fixture_disposition).toBe('loading');
    expect(empty.application_data.goals).toEqual([]);
    expect(empty.application_data.queue).toEqual([]);
    expect(recoverable.state).toBe('unavailable');
    expect(recoverable.reason).toBe('timeout');
    expect(failure.state).toBe('unavailable');
    expect(failure.reason).toBe('capability_unavailable');
    expect(unavailable.state).toBe('unavailable');
    expect(unavailable.reason).toBe('server_unavailable');
    for (const result of [loading, recoverable, failure, unavailable]) {
      assertNonAuthoritative(result);
    }
  });

  it('rejects invalid submissions and accepts only fixture-simulated valid submissions', () => {
    const invalid = fixtureServices
      .createServices({ scenarioId: 'scenario:invalid-submission' })
      .invokeSync(
        readInvocation('supervisor.prompt-steering.request', {
          payload: {
            target_type: 'task',
            target_id: 'task:synthetic-1',
            prompt: '',
            dry_run: false,
            confirmation_token: 'confirm-agent-supervisor:task:task:synthetic-1:fixture',
          },
        }),
      );
    expect(invalid.state).toBe('denied');
    expect(invalid.reason).toBe('scope_not_allowed');
    assertNonAuthoritative(invalid);

    const valid = fixtureServices
      .createServices({ scenarioId: 'scenario:valid-submission' })
      .invokeSync(
        readInvocation('supervisor.prompt-steering.request', {
          payload: {
            target_type: 'task',
            target_id: 'task:synthetic-1',
            prompt: 'Synthetic governed prompt',
            dry_run: false,
            confirmation_token: 'confirm-agent-supervisor:task:task:synthetic-1:fixture',
          },
        }),
      );
    expect(valid.state).toBe('available');
    expect(valid.data?.decision_authority).toBe('fixture-simulated');
    assertNonAuthoritative(valid);
  });

  it('renders a host page that loads fixture services and the public console surface', () => {
    const html = readFileSync(HOST_PATH, 'utf8');
    expect(html).toContain('data-interface="AgentSupervisorFixtureHost@1"');
    expect(html).toContain('data-services-interface="AgentSupervisorFixtureServices@1"');
    expect(html).toContain('data-can-issue-authoritative-allow="false"');
    expect(html).toContain('data-uses-production-services="false"');
    expect(html).toContain('src="fixture-services.js"');
    expect(html).toContain('id="fixture-host"');
    expect(html).toContain('api.boot(globalThis)');
    expect(html).not.toMatch(PRODUCTION_LEAK);

    const markup = fixtureServices
      .createHost({ scenarioId: 'scenario:initial-load' })
      .render();
    expect(markup).toContain('data-testid="agent-supervisor-app"');
    expect(markup).toContain('data-testid="goals-tree"');
    expect(markup).toContain('data-testid="task-queue"');
    expect(markup).toContain('data-testid="active-task"');
    expect(markup).toContain('data-testid="steering-panel"');
    expect(markup).toContain('data-testid="steering-prompt"');
    expect(markup).toContain('data-testid="steering-submit"');
    expect(markup).toContain('data-testid="receipt-view"');
    expect(markup).toContain('data-testid="backend-health"');
    expect(markup).toContain('data-testid="contract-view"');
    expect(markup).toContain('data-can-issue-authoritative-allow="false"');
    expect(markup).toContain('data-state="ready"');
    expect(markup).toContain('goal:synthetic-A');
    expect(markup).toContain('task:synthetic-1');

    const loadingMarkup = fixtureServices
      .createHost({ scenarioId: 'scenario:loading' })
      .render();
    expect(loadingMarkup).toContain('data-testid="supervisor-loading"');
    expect(loadingMarkup).toContain('data-state="loading"');

    const confirmMarkup = fixtureServices
      .createHost({ scenarioId: 'scenario:confirmation-grant' })
      .render();
    expect(confirmMarkup).toContain('data-testid="confirmation-dialog"');
    expect(confirmMarkup).toContain('data-testid="confirmation-grant"');
    expect(confirmMarkup).toContain('authoritative=false');
  });

  it('installs the inert gateway on the same public window slots as the live app', () => {
    const target: Record<string, any> = {};
    const services = fixtureServices.createServices();
    fixtureServices.installGateway(target, services);
    expect(target.__agentSupervisorGateway).toBeTruthy();
    expect(target.agentSupervisorGateway).toBe(target.__agentSupervisorGateway);
    expect(target.swissknifeAgentSupervisorGateway).toBe(
      target.__agentSupervisorGateway,
    );
    const result = target.__agentSupervisorGateway.invoke(
      readInvocation('supervisor.health.read'),
    );
    return Promise.resolve(result).then((value: GatewayResult) => {
      expect(value.state).toBe('available');
      assertNonAuthoritative(value);
    });
  });

  it('boots a fail-closed host that still cannot allow or reach a network', async () => {
    const target: Record<string, any> = {
      document: undefined,
      location: { search: '?scenario=scenario:empty' },
      navigator: {},
    };
    const booted = fixtureServices.boot(target);
    expect(booted.interface).toBe('AgentSupervisorFixtureHost@1');
    expect(target.__agentSupervisorFixtureHost.snapshot().scenario_id).toBe(
      'scenario:empty',
    );
    expect(target.Date.now()).toBe(Date.parse(AGENT_SUPERVISOR_FROZEN_TIME));
    await expect(target.fetch('https://example.invalid')).rejects.toThrow(/unexpected fetch/);
    expect(() => target.__agentSupervisorFixtureHost.issueAuthoritativeAllow()).toThrow(
      /cannot issue an authoritative allow decision/,
    );
  });

  it('has fixture-purity: no credentials, production hosts, or MCP tool invocations', () => {
    const sources = [
      readFileSync(HOST_PATH, 'utf8'),
      readFileSync(SERVICES_PATH, 'utf8'),
      readFileSync(SCENARIOS_PATH, 'utf8'),
    ];
    for (const source of sources) {
      expect(source).not.toMatch(PRODUCTION_LEAK);
      expect(source).not.toMatch(/Authorization\s*:/i);
      expect(source).not.toMatch(/process\.env/);
      expect(source).not.toMatch(/child_process|spawnSync|execFileSync/);
    }
    expect(readFileSync(SERVICES_PATH, 'utf8')).toContain(
      'fixtures cannot issue an authoritative allow decision',
    );

    const snapshot = fixtureServices
      .createServices({ scenarioId: 'scenario:initial-load' })
      .snapshot();
    const encoded = fixtureServices.canonicalJson(snapshot);
    expect(encoded).not.toMatch(PRODUCTION_LEAK);
    expect(encoded).toContain('synthetic://agent-supervisor/');
    expect(encoded).toContain('"can_issue_authoritative_allow":false');
  });

  it('mirrors the public live capability set used by the console gateway', () => {
    const ids = fixtureServices.listCapabilities().map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([
      'supervisor.health.read',
      'supervisor.queue.read',
      'supervisor.goals.read',
      'supervisor.subgoals.read',
      'supervisor.taskboard.links.read',
      'supervisor.logs.read',
      'supervisor.receipts.read',
      'supervisor.policy.assist',
      'supervisor.semantic-goal.assist',
      'supervisor.content.retrieve',
      'supervisor.run-history.search',
      'supervisor.prompt-steering.request',
      'supervisor.task-control.request',
      'supervisor.receipts.persist',
      'supervisor.event-dag.checkpoint',
    ]));
    const steering = fixtureServices
      .listCapabilities()
      .find((item) => item.id === 'supervisor.prompt-steering.request');
    expect(steering).toMatchObject({
      access: 'governed-write',
      owner: 'ipfs_accelerate_py',
      policy_class: 'confirm',
      method: 'agent_supervisor.prompt_steering.request',
    });
  });
});
