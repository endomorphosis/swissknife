/**
 * AgentSupervisorFixtureServices@1
 *
 * Inert deterministic fakes of the public Agent Supervisor console gateway.
 * Controls frozen time, IDs, supervisor/governed-service results, loading,
 * errors, empty data, confirmations, and view preferences. Never contacts
 * production services, copies credentials, invokes MCP tools, or issues an
 * authoritative allow decision.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.AgentSupervisorFixtureServices = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SERVICES_INTERFACE = 'AgentSupervisorFixtureServices@1';
  const SERVICES_SCHEMA = 'agent-supervisor-fixture-services/v1';
  const HOST_INTERFACE = 'AgentSupervisorFixtureHost@1';
  const HOST_SCHEMA = 'agent-supervisor-fixture-host/v1';
  const SCENARIOS_INTERFACE = 'AgentSupervisorFixtureScenarios@1';
  const SCENARIOS_SCHEMA = 'agent-supervisor-fixture-scenarios/v1';
  const SNAPSHOT_INTERFACE = 'AgentSupervisorFixtureSnapshot@1';
  const SNAPSHOT_SCHEMA = 'agent-supervisor-fixture-snapshot/v1';
  const VIEWPORT_INTERFACE = 'ViewportSpec@1';
  const VIEWPORT_SCHEMA = 'gui-viewport-spec/v1';
  const CANONICAL_JSON_PROFILE = 'gui-optimizer-canonical-json/v1';

  const APPLICATION_ID = 'app:agent-supervisor';
  const SCREEN_ID = 'screen:agent-supervisor';
  const CATALOG_ID = 'catalog:agent-supervisor-scenarios';
  const SEED = 'vgo-003-agent-supervisor-deterministic-seed';
  const FROZEN_TIME = '2026-08-11T00:00:00.000Z';
  const TIMEZONE = 'UTC';
  const DEFAULT_LOCALE = 'en-US';
  const FROZEN_MS = Date.parse(FROZEN_TIME);

  const REQUIRED_SCENARIO_KINDS = Object.freeze([
    'initial_load',
    'loading',
    'success',
    'empty',
    'recoverable_failure',
    'unrecoverable_failure',
    'invalid_submission',
    'valid_submission',
    'keyboard_only',
    'viewport_mobile',
    'viewport_desktop',
    'viewport_wide',
    'text_scale_200',
    'reduced_motion',
    'dark_mode',
    'service_unavailable',
    'confirmation_grant',
    'confirmation_deny',
  ]);

  const STABLE_SCENARIO_IDS = Object.freeze({
    initial_load: 'scenario:initial-load',
    loading: 'scenario:loading',
    success: 'scenario:success',
    empty: 'scenario:empty',
    recoverable_failure: 'scenario:recoverable-failure',
    unrecoverable_failure: 'scenario:unrecoverable-failure',
    invalid_submission: 'scenario:invalid-submission',
    valid_submission: 'scenario:valid-submission',
    keyboard_only: 'scenario:keyboard-only',
    viewport_mobile: 'scenario:viewport-mobile',
    viewport_desktop: 'scenario:viewport-desktop',
    viewport_wide: 'scenario:viewport-wide',
    text_scale_200: 'scenario:text-scale-200',
    reduced_motion: 'scenario:reduced-motion',
    dark_mode: 'scenario:dark-mode',
    service_unavailable: 'scenario:service-unavailable',
    confirmation_grant: 'scenario:confirmation-grant',
    confirmation_deny: 'scenario:confirmation-deny',
  });

  const EXPECTED_TERMINAL_STATES = Object.freeze({
    initial_load: Object.freeze(['state:ready']),
    loading: Object.freeze(['state:loading']),
    success: Object.freeze(['state:success']),
    empty: Object.freeze(['state:empty']),
    recoverable_failure: Object.freeze(['state:recovery']),
    unrecoverable_failure: Object.freeze(['state:failure']),
    invalid_submission: Object.freeze(['state:ready']),
    valid_submission: Object.freeze(['state:success']),
    keyboard_only: Object.freeze(['state:ready']),
    viewport_mobile: Object.freeze(['state:ready']),
    viewport_desktop: Object.freeze(['state:ready']),
    viewport_wide: Object.freeze(['state:ready']),
    text_scale_200: Object.freeze(['state:ready']),
    reduced_motion: Object.freeze(['state:ready']),
    dark_mode: Object.freeze(['state:ready']),
    service_unavailable: Object.freeze(['state:unavailable']),
    confirmation_grant: Object.freeze(['state:success']),
    confirmation_deny: Object.freeze(['state:ready']),
  });

  const VIEWPORTS = Object.freeze({
    mobile: Object.freeze({
      interface: VIEWPORT_INTERFACE,
      schema_version: VIEWPORT_SCHEMA,
      width: 390,
      height: 844,
      device_scale_factor: 1,
    }),
    desktop: Object.freeze({
      interface: VIEWPORT_INTERFACE,
      schema_version: VIEWPORT_SCHEMA,
      width: 1280,
      height: 800,
      device_scale_factor: 1,
    }),
    wide: Object.freeze({
      interface: VIEWPORT_INTERFACE,
      schema_version: VIEWPORT_SCHEMA,
      width: 1600,
      height: 1000,
      device_scale_factor: 1,
    }),
  });

  const SERVICE_DESCRIPTORS = Object.freeze({
    supervisor_state: 'synthetic://agent-supervisor/state',
    task_queue: 'synthetic://agent-supervisor/queue',
    goal_index: 'synthetic://agent-supervisor/goals',
    receipt_store: 'synthetic://agent-supervisor/receipts',
    policy_assist: 'synthetic://agent-supervisor/policy',
  });

  const NETWORK_POLICY = Object.freeze({
    mode: 'fail-closed',
    allowed_url_prefixes: Object.freeze(['synthetic://agent-supervisor/']),
    blocked_classes: Object.freeze([
      'fetch',
      'xhr',
      'websocket',
      'eventsource',
      'beacon',
      'mcp',
      'subprocess',
      'credentials',
    ]),
  });

  const CAPABILITIES = Object.freeze({
    'supervisor.health.read': capability('supervisor.health.read', 'read', 'ipfs_accelerate_py', 'read', 'agent_supervisor.health.read'),
    'supervisor.queue.read': capability('supervisor.queue.read', 'read', 'ipfs_accelerate_py', 'read', 'agent_supervisor.queue.read'),
    'supervisor.goals.read': capability('supervisor.goals.read', 'read', 'ipfs_accelerate_py', 'read', 'agent_supervisor.goals.read'),
    'supervisor.subgoals.read': capability('supervisor.subgoals.read', 'read', 'ipfs_accelerate_py', 'read', 'agent_supervisor.subgoals.read'),
    'supervisor.taskboard.links.read': capability('supervisor.taskboard.links.read', 'read', 'ipfs_datasets_py', 'read', 'agent_supervisor.taskboard.links.read'),
    'supervisor.logs.read': capability('supervisor.logs.read', 'read', 'ipfs_accelerate_py', 'read', 'agent_supervisor.logs.read'),
    'supervisor.receipts.read': capability('supervisor.receipts.read', 'read', 'ipfs_kit_py', 'read', 'agent_supervisor.receipts.read'),
    'supervisor.policy.assist': capability('supervisor.policy.assist', 'read', 'ipfs_datasets_py', 'read', 'agent_supervisor.policy.assist'),
    'supervisor.semantic-goal.assist': capability('supervisor.semantic-goal.assist', 'read', 'ipfs_datasets_py', 'read', 'agent_supervisor.semantic_goal.assist'),
    'supervisor.content.retrieve': capability('supervisor.content.retrieve', 'read', 'ipfs_kit_py', 'read', 'agent_supervisor.content.retrieve'),
    'supervisor.run-history.search': capability('supervisor.run-history.search', 'read', 'ipfs_datasets_py', 'read', 'agent_supervisor.run_history.search'),
    'supervisor.receipts.persist': capability('supervisor.receipts.persist', 'governed-write', 'ipfs_kit_py', 'confirm', 'agent_supervisor.receipts.persist'),
    'supervisor.event-dag.checkpoint': capability('supervisor.event-dag.checkpoint', 'governed-write', 'ipfs_kit_py', 'confirm', 'agent_supervisor.event_dag.checkpoint'),
    'supervisor.prompt-steering.request': capability('supervisor.prompt-steering.request', 'governed-write', 'ipfs_accelerate_py', 'confirm', 'agent_supervisor.prompt_steering.request'),
    'supervisor.task-control.request': capability('supervisor.task-control.request', 'governed-write', 'ipfs_accelerate_py', 'privileged-control', 'agent_supervisor.task_control.request'),
  });

  const GOVERNED_CAPABILITY_IDS = Object.freeze(
    Object.keys(CAPABILITIES).filter((id) => CAPABILITIES[id].access === 'governed-write'),
  );

  const RECIPES = Object.freeze({
    populated: Object.freeze({
      goal_count: 2,
      queue_count: 2,
      goal_status: 'running',
      health_status: 'available',
    }),
    completed: Object.freeze({
      goal_count: 2,
      queue_count: 0,
      goal_status: 'completed',
      health_status: 'available',
    }),
    empty: Object.freeze({
      goal_count: 0,
      queue_count: 0,
      goal_status: 'ready',
      health_status: 'available',
    }),
    loading: Object.freeze({
      goal_count: 0,
      queue_count: 0,
      goal_status: 'ready',
      health_status: 'loading',
    }),
    recoverable: Object.freeze({
      goal_count: 2,
      queue_count: 1,
      goal_status: 'running',
      health_status: 'degraded',
      error_code: 'transport_timeout',
      recoverable: true,
    }),
    unrecoverable: Object.freeze({
      goal_count: 0,
      queue_count: 0,
      goal_status: 'failed',
      health_status: 'unavailable',
      error_code: 'schema_mismatch',
      recoverable: false,
    }),
    invalid_submission: Object.freeze({
      goal_count: 2,
      queue_count: 1,
      goal_status: 'running',
      health_status: 'available',
      prompt: '',
      prompt_valid: false,
    }),
    valid_submission: Object.freeze({
      goal_count: 2,
      queue_count: 1,
      goal_status: 'running',
      health_status: 'available',
      prompt: 'Synthetic governed prompt',
      prompt_valid: true,
      confirmed: true,
    }),
    keyboard: Object.freeze({
      goal_count: 2,
      queue_count: 2,
      goal_status: 'running',
      health_status: 'available',
      focus_order: Object.freeze([
        'control:goals-tree',
        'control:queue',
        'control:prompt-input',
        'control:submit',
      ]),
    }),
    reduced_motion: Object.freeze({
      goal_count: 2,
      queue_count: 1,
      goal_status: 'running',
      health_status: 'available',
      prefers_reduced_motion: true,
    }),
    dark_mode: Object.freeze({
      goal_count: 2,
      queue_count: 1,
      goal_status: 'running',
      health_status: 'available',
      color_scheme_support: Object.freeze(['light', 'dark']),
    }),
    unavailable: Object.freeze({
      goal_count: 0,
      queue_count: 0,
      goal_status: 'ready',
      health_status: 'server_unavailable',
    }),
    confirmation_grant: Object.freeze({
      goal_count: 2,
      queue_count: 1,
      goal_status: 'running',
      health_status: 'available',
      confirmation_required: true,
      confirmation_decision: 'granted',
      action_id: 'action:prompt-steering',
    }),
    confirmation_deny: Object.freeze({
      goal_count: 2,
      queue_count: 1,
      goal_status: 'running',
      health_status: 'available',
      confirmation_required: true,
      confirmation_decision: 'denied',
      action_id: 'action:prompt-steering',
    }),
  });

  const FIXTURE_RECIPES = Object.freeze([
    fixtureRecipe('fixture:agent-supervisor:initial-load', 'populated', 'success', 'allowed'),
    fixtureRecipe('fixture:agent-supervisor:loading', 'loading', 'loading', 'allowed'),
    fixtureRecipe('fixture:agent-supervisor:success', 'completed', 'success', 'allowed'),
    fixtureRecipe('fixture:agent-supervisor:empty', 'empty', 'empty', 'allowed'),
    fixtureRecipe('fixture:agent-supervisor:recoverable-failure', 'recoverable', 'recoverable_error', 'allowed'),
    fixtureRecipe('fixture:agent-supervisor:unrecoverable-failure', 'unrecoverable', 'unrecoverable_error', 'allowed'),
    fixtureRecipe('fixture:agent-supervisor:invalid-submission', 'invalid_submission', 'validation_failure', 'allowed'),
    fixtureRecipe('fixture:agent-supervisor:valid-submission', 'valid_submission', 'confirmation_granted', 'allowed'),
    fixtureRecipe('fixture:agent-supervisor:keyboard-only', 'keyboard', 'success', 'reduced'),
    fixtureRecipe('fixture:agent-supervisor:viewport-matrix', 'populated', 'success', 'allowed'),
    fixtureRecipe('fixture:agent-supervisor:reduced-motion', 'reduced_motion', 'success', 'disabled'),
    fixtureRecipe('fixture:agent-supervisor:dark-mode', 'dark_mode', 'success', 'allowed'),
    fixtureRecipe('fixture:agent-supervisor:service-unavailable', 'unavailable', 'service_unavailable', 'allowed'),
    fixtureRecipe('fixture:agent-supervisor:confirmation-grant', 'confirmation_grant', 'confirmation_granted', 'allowed'),
    fixtureRecipe('fixture:agent-supervisor:confirmation-deny', 'confirmation_deny', 'confirmation_denied', 'allowed'),
  ]);

  const SCENARIO_RECIPES = Object.freeze([
    scenarioRecipe('initial_load', 'Initial load', 'fixture:agent-supervisor:initial-load', 'desktop', 'light', 100, false, ['initial', 'load', 'baseline']),
    scenarioRecipe('loading', 'Loading state', 'fixture:agent-supervisor:loading', 'desktop', 'light', 100, false, ['loading', 'async']),
    scenarioRecipe('success', 'Normal success', 'fixture:agent-supervisor:success', 'desktop', 'light', 100, false, ['success', 'baseline']),
    scenarioRecipe('empty', 'Empty data', 'fixture:agent-supervisor:empty', 'desktop', 'light', 100, false, ['empty', 'data']),
    scenarioRecipe('recoverable_failure', 'Recoverable error', 'fixture:agent-supervisor:recoverable-failure', 'desktop', 'light', 100, false, ['error', 'recoverable', 'failure']),
    scenarioRecipe('unrecoverable_failure', 'Unrecoverable error', 'fixture:agent-supervisor:unrecoverable-failure', 'desktop', 'light', 100, false, ['error', 'unrecoverable', 'failure']),
    scenarioRecipe('invalid_submission', 'Invalid steering or dispatch input', 'fixture:agent-supervisor:invalid-submission', 'desktop', 'light', 100, false, ['submission', 'validation', 'invalid']),
    scenarioRecipe('valid_submission', 'Valid confirmed submission', 'fixture:agent-supervisor:valid-submission', 'desktop', 'light', 100, false, ['submission', 'validation', 'valid', 'confirmation']),
    scenarioRecipe('keyboard_only', 'Keyboard-only navigation', 'fixture:agent-supervisor:keyboard-only', 'desktop', 'light', 100, true, ['keyboard', 'a11y']),
    scenarioRecipe('viewport_mobile', 'Narrow mobile viewport 390x844', 'fixture:agent-supervisor:viewport-matrix', 'mobile', 'light', 100, false, ['viewport', 'mobile', 'responsive']),
    scenarioRecipe('viewport_desktop', 'Standard desktop viewport 1280x800', 'fixture:agent-supervisor:viewport-matrix', 'desktop', 'light', 100, false, ['viewport', 'desktop', 'responsive']),
    scenarioRecipe('viewport_wide', 'Wide desktop viewport 1600x1000', 'fixture:agent-supervisor:viewport-matrix', 'wide', 'light', 100, false, ['viewport', 'wide', 'responsive']),
    scenarioRecipe('text_scale_200', '200 percent text scaling', 'fixture:agent-supervisor:viewport-matrix', 'desktop', 'light', 200, false, ['text-scale', 'zoom', 'a11y']),
    scenarioRecipe('reduced_motion', 'Reduced-motion preference', 'fixture:agent-supervisor:reduced-motion', 'desktop', 'light', 100, true, ['reduced-motion', 'a11y', 'animation']),
    scenarioRecipe('dark_mode', 'Dark mode when screen advertises support', 'fixture:agent-supervisor:dark-mode', 'desktop', 'dark', 100, false, ['dark-mode', 'color-scheme']),
    scenarioRecipe('service_unavailable', 'Service unavailable', 'fixture:agent-supervisor:service-unavailable', 'desktop', 'light', 100, false, ['service', 'unavailable', 'offline']),
    scenarioRecipe('confirmation_grant', 'Confirmation granted', 'fixture:agent-supervisor:confirmation-grant', 'desktop', 'light', 100, false, ['confirmation', 'grant', 'governed-write']),
    scenarioRecipe('confirmation_deny', 'Confirmation denied', 'fixture:agent-supervisor:confirmation-deny', 'desktop', 'light', 100, false, ['confirmation', 'deny', 'governed-write']),
  ]);

  class FixtureNetworkError extends Error {
    constructor(message) {
      super(message);
      this.name = 'FixtureNetworkError';
    }
  }

  class FixtureEffectError extends Error {
    constructor(message) {
      super(message);
      this.name = 'FixtureEffectError';
    }
  }

  class FixtureAuthorityError extends Error {
    constructor(message) {
      super(message);
      this.name = 'FixtureAuthorityError';
    }
  }

  class FixtureScenarioError extends Error {
    constructor(message) {
      super(message);
      this.name = 'FixtureScenarioError';
    }
  }

  function capability(id, access, owner, policyClass, method) {
    return Object.freeze({
      id,
      access,
      owner,
      policy_class: policyClass,
      method,
    });
  }

  function fixtureRecipe(fixture_id, recipe, service_mode, animation) {
    return Object.freeze({ fixture_id, recipe, service_mode, animation });
  }

  function scenarioRecipe(kind, name, fixture_id, viewport, color_scheme, text_scale_percent, reduced_motion, tags) {
    return Object.freeze({
      kind,
      scenario_id: STABLE_SCENARIO_IDS[kind],
      name,
      fixture_id,
      viewport,
      locale: DEFAULT_LOCALE,
      color_scheme,
      text_scale_percent,
      reduced_motion,
      tags: Object.freeze(tags.slice()),
      expected_terminal_states: EXPECTED_TERMINAL_STATES[kind],
    });
  }

  function freezeDeep(value) {
    if (!value || typeof value !== 'object') return value;
    if (Object.isFrozen(value)) return value;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) value[i] = freezeDeep(value[i]);
      return Object.freeze(value);
    }
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      value[keys[i]] = freezeDeep(value[keys[i]]);
    }
    return Object.freeze(value);
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function canonicalJson(value) {
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new FixtureScenarioError('canonical JSON rejects non-finite numbers');
      }
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
    }
    if (typeof value === 'object') {
      return `{${Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
        .join(',')}}`;
    }
    throw new FixtureScenarioError(`canonical JSON cannot encode ${typeof value}`);
  }

  function getScenarioDocument() {
    return freezeDeep({
      interface: SCENARIOS_INTERFACE,
      schema_version: SCENARIOS_SCHEMA,
      host_interface: HOST_INTERFACE,
      services_interface: SERVICES_INTERFACE,
      catalog_id: CATALOG_ID,
      application_id: APPLICATION_ID,
      screen_id: SCREEN_ID,
      seed: SEED,
      frozen_time: FROZEN_TIME,
      timezone: TIMEZONE,
      locale: DEFAULT_LOCALE,
      canonical_json_profile: CANONICAL_JSON_PROFILE,
      uses_production_services: false,
      uses_production_credentials: false,
      can_issue_authoritative_allow: false,
      network_policy: {
        mode: NETWORK_POLICY.mode,
        allowed_url_prefixes: NETWORK_POLICY.allowed_url_prefixes.slice(),
        blocked_classes: NETWORK_POLICY.blocked_classes.slice(),
      },
      viewports: {
        mobile: { ...VIEWPORTS.mobile },
        desktop: { ...VIEWPORTS.desktop },
        wide: { ...VIEWPORTS.wide },
      },
      required_scenario_kinds: REQUIRED_SCENARIO_KINDS.slice(),
      stable_scenario_ids: { ...STABLE_SCENARIO_IDS },
      expected_terminal_states: Object.fromEntries(
        REQUIRED_SCENARIO_KINDS.map((kind) => [kind, EXPECTED_TERMINAL_STATES[kind].slice()]),
      ),
      recipes: Object.fromEntries(
        Object.keys(RECIPES).map((key) => {
          const recipe = { ...RECIPES[key] };
          if (Array.isArray(recipe.focus_order)) {
            recipe.focus_order = recipe.focus_order.slice();
          }
          if (Array.isArray(recipe.color_scheme_support)) {
            recipe.color_scheme_support = recipe.color_scheme_support.slice();
          }
          return [key, recipe];
        }),
      ),
      fixtures: FIXTURE_RECIPES.map((row) => ({ ...row })),
      scenarios: SCENARIO_RECIPES.map((row) => ({
        ...row,
        tags: row.tags.slice(),
        expected_terminal_states: row.expected_terminal_states.slice(),
      })),
    });
  }

  function resolveScenarioDocument(document) {
    return document || getScenarioDocument();
  }

  function listScenarios(document) {
    return resolveScenarioDocument(document).scenarios.slice();
  }

  function getScenarioById(scenarioId, document) {
    const found = resolveScenarioDocument(document).scenarios.find((row) => row.scenario_id === scenarioId);
    if (!found) throw new FixtureScenarioError(`unknown scenario_id: ${scenarioId}`);
    return found;
  }

  function getFixtureById(fixtureId, document) {
    const found = resolveScenarioDocument(document).fixtures.find((row) => row.fixture_id === fixtureId);
    if (!found) throw new FixtureScenarioError(`unknown fixture_id: ${fixtureId}`);
    return found;
  }

  function listCapabilities() {
    return Object.freeze(Object.keys(CAPABILITIES).map((id) => ({ ...CAPABILITIES[id] })));
  }

  function createClock(frozenTime) {
    const iso = frozenTime || FROZEN_TIME;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) {
      throw new FixtureScenarioError(`invalid frozen_time: ${iso}`);
    }
    return Object.freeze({
      iso,
      ms,
      now() {
        return ms;
      },
      toISOString() {
        return iso;
      },
    });
  }

  function createIdFactory(seed) {
    const prefix = seed || SEED;
    let counter = 0;
    return function nextId(kind) {
      counter += 1;
      const label = kind ? String(kind).replace(/[^a-z0-9-]+/gi, '-') : 'id';
      return `${label}:${prefix}:${String(counter).padStart(4, '0')}`;
    };
  }

  function installClock(target, frozenTime) {
    const clock = createClock(frozenTime);
    const globalRef = target || (typeof globalThis !== 'undefined' ? globalThis : {});
    const OriginalDate = globalRef.Date || Date;
    function FrozenDate(...args) {
      if (!(this instanceof FrozenDate)) {
        return new OriginalDate(clock.ms).toString();
      }
      if (args.length === 0) return new OriginalDate(clock.ms);
      return new OriginalDate(...args);
    }
    FrozenDate.now = function now() {
      return clock.ms;
    };
    FrozenDate.parse = OriginalDate.parse;
    FrozenDate.UTC = OriginalDate.UTC;
    FrozenDate.prototype = OriginalDate.prototype;
    globalRef.Date = FrozenDate;
    globalRef.__agentSupervisorFixtureClock = clock;
    return clock;
  }

  function installIdFactory(target, seed) {
    const globalRef = target || (typeof globalThis !== 'undefined' ? globalThis : {});
    const factory = createIdFactory(seed);
    globalRef.__agentSupervisorFixtureIdFactory = factory;
    return factory;
  }

  function urlString(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input === 'object') {
      if (typeof input.url === 'string') return input.url;
      if (typeof input.href === 'string') return input.href;
    }
    return String(input);
  }

  function isAllowlistedUrl(url, allowRelative) {
    const value = urlString(url);
    if (value.startsWith('synthetic://agent-supervisor/')) return true;
    const allowed = allowRelative || [];
    for (let i = 0; i < allowed.length; i += 1) {
      const entry = allowed[i];
      if (value === entry || value.endsWith(`/${entry}`) || value.endsWith(entry)) return true;
    }
    return false;
  }

  function installNetworkCanary(target, options) {
    const globalRef = target || (typeof globalThis !== 'undefined' ? globalThis : {});
    const allowRelative = (options && options.allowRelative) || [];
    const calls = [];

    function reject(kind, input) {
      const url = urlString(input);
      const record = Object.freeze({ kind, url, blocked: true });
      calls.push(record);
      if (isAllowlistedUrl(url, allowRelative)) {
        return record;
      }
      throw new FixtureNetworkError(`unexpected ${kind}: ${url}`);
    }

    globalRef.fetch = function fixtureFetch(input) {
      const url = urlString(input);
      const record = Object.freeze({ kind: 'fetch', url, blocked: !isAllowlistedUrl(url, allowRelative) });
      calls.push(record);
      if (isAllowlistedUrl(url, allowRelative)) {
        return Promise.reject(new FixtureNetworkError(`allowlisted fetch has no fixture transport: ${url}`));
      }
      return Promise.reject(new FixtureNetworkError(`unexpected fetch: ${url}`));
    };
    function FakeXHR() {
      this.readyState = 0;
      this.status = 0;
    }
    FakeXHR.prototype.open = function open(method, url) {
      reject('xhr', url);
    };
    FakeXHR.prototype.send = function send() {
      throw new FixtureNetworkError('unexpected xhr send');
    };
    FakeXHR.prototype.setRequestHeader = function setRequestHeader() {};
    globalRef.XMLHttpRequest = FakeXHR;
    globalRef.WebSocket = function FakeWebSocket(url) {
      reject('websocket', url);
    };
    globalRef.EventSource = function FakeEventSource(url) {
      reject('eventsource', url);
    };
    if (!globalRef.navigator) globalRef.navigator = {};
    globalRef.navigator.sendBeacon = function sendBeacon(url) {
      reject('beacon', url);
      return false;
    };
    globalRef.__agentSupervisorFixtureNetworkCanary = Object.freeze({
      interface: 'AgentSupervisorFixtureNetworkCanary@1',
      mode: 'fail-closed',
      calls,
    });
    return globalRef.__agentSupervisorFixtureNetworkCanary;
  }

  function syntheticReceipt(receiptId, cid) {
    return Object.freeze({
      receipt_id: receiptId,
      cid,
      owner: 'ipfs_kit_py',
      created_at: FROZEN_TIME,
    });
  }

  function expandRecipe(recipeName) {
    const recipe = RECIPES[recipeName];
    if (!recipe) throw new FixtureScenarioError(`unknown recipe: ${recipeName}`);
    const goals = [];
    const subgoals = [];
    for (let i = 0; i < recipe.goal_count; i += 1) {
      const letter = String.fromCharCode(65 + i);
      const goalId = `goal:synthetic-${letter}`;
      const subgoalId = `subgoal:synthetic-${letter}`;
      goals.push(Object.freeze({
        goal_id: goalId,
        title: `Synthetic goal ${letter}`,
        status: recipe.goal_status,
        subgoal_ids: Object.freeze([subgoalId]),
        task_ids: Object.freeze(i === 0 && recipe.queue_count > 0 ? ['task:synthetic-1'] : []),
        taskboard_url: `synthetic://agent-supervisor/goals/${letter}`,
        receipt: syntheticReceipt(`rcpt-fixture-goal-${letter}`, `bafyfixturegoal${letter.toLowerCase()}`),
      }));
      subgoals.push(Object.freeze({
        subgoal_id: subgoalId,
        goal_id: goalId,
        title: `Synthetic subgoal ${letter}`,
        status: recipe.goal_status,
        task_ids: Object.freeze(i === 0 && recipe.queue_count > 0 ? ['task:synthetic-1'] : []),
        taskboard_url: `synthetic://agent-supervisor/subgoals/${letter}`,
        receipt: syntheticReceipt(`rcpt-fixture-subgoal-${letter}`, `bafyfixturesubgoal${letter.toLowerCase()}`),
      }));
    }
    const queue = [];
    const taskboardLinks = [];
    const logs = [];
    const runHistory = [];
    for (let i = 0; i < recipe.queue_count; i += 1) {
      const taskId = `task:synthetic-${i + 1}`;
      const status = i === 0 ? 'running' : 'ready';
      queue.push(Object.freeze({
        task_id: taskId,
        title: `Synthetic task ${i + 1}`,
        status,
        goal_id: goals[0] ? goals[0].goal_id : undefined,
        subgoal_id: subgoals[0] ? subgoals[0].subgoal_id : undefined,
        taskboard_url: `synthetic://agent-supervisor/queue/${i + 1}`,
        dependencies: Object.freeze(i === 0 ? [] : ['task:synthetic-1']),
        progress: i === 0 ? 40 : 0,
        assignee: i === 0 ? 'fixture-worker' : 'unassigned',
        receipt: syntheticReceipt(`rcpt-fixture-task-${i + 1}`, `bafyfixturetask${i + 1}`),
      }));
      taskboardLinks.push(Object.freeze({
        task_id: taskId,
        source: 'supervisor',
        url: `synthetic://agent-supervisor/queue/${i + 1}`,
        title: `Synthetic taskboard ${i + 1}`,
        status,
      }));
      runHistory.push(Object.freeze({
        run_id: `run:synthetic-${i + 1}`,
        goal_id: goals[0] ? goals[0].goal_id : undefined,
        subgoal_id: subgoals[0] ? subgoals[0].subgoal_id : undefined,
        task_id: taskId,
        status: status === 'running' ? 'running' : 'queued',
        started_at: FROZEN_TIME,
        receipt: syntheticReceipt(`rcpt-fixture-run-${i + 1}`, `bafyfixturerun${i + 1}`),
      }));
    }
    if (goals.length) {
      logs.push(Object.freeze({
        log_id: 'log:synthetic-1',
        level: 'info',
        message: 'Synthetic supervisor snapshot loaded from fixture services.',
        created_at: FROZEN_TIME,
        scope: 'supervisor',
        target_id: goals[0].goal_id,
        redacted: false,
        receipt: syntheticReceipt('rcpt-fixture-log-1', 'bafyfixturelog1'),
      }));
    }
    const receipts = [
      syntheticReceipt('rcpt-fixture-health', 'bafyfixturehealth'),
      ...goals.map((goal) => goal.receipt),
      ...queue.map((item) => item.receipt),
    ];
    const healthStatus = recipe.health_status === 'available'
      ? 'healthy'
      : recipe.health_status === 'degraded'
        ? 'degraded'
        : recipe.health_status === 'loading'
          ? 'degraded'
          : 'unavailable';
    const health = Object.freeze({
      status: healthStatus,
      catalog_status: recipe.health_status,
      active_goal_count: goals.filter((goal) => goal.status === 'running').length,
      queued_task_count: queue.filter((item) => item.status === 'ready').length,
      running_task_count: queue.filter((item) => item.status === 'running').length,
      server_time: FROZEN_TIME,
      backends: Object.freeze([
        Object.freeze({
          owner: 'ipfs_accelerate_py',
          status: recipe.health_status === 'server_unavailable' ? 'unavailable' : 'available',
          transport: 'mcp++',
          receipt: syntheticReceipt('rcpt-fixture-health-accelerate', 'bafyfixturehealthacc'),
        }),
        Object.freeze({
          owner: 'ipfs_datasets_py',
          status: recipe.health_status === 'server_unavailable' ? 'unavailable' : 'available',
          transport: 'libp2p',
          receipt: syntheticReceipt('rcpt-fixture-health-datasets', 'bafyfixturehealthds'),
        }),
        Object.freeze({
          owner: 'ipfs_kit_py',
          status: recipe.health_status === 'server_unavailable' ? 'unavailable' : 'available',
          transport: 'mcp',
          receipt: syntheticReceipt('rcpt-fixture-health-kit', 'bafyfixturehealthkit'),
        }),
      ]),
    });
    return Object.freeze({
      recipe: recipeName,
      health,
      goals: Object.freeze(goals),
      subgoals: Object.freeze(subgoals),
      queue: Object.freeze(queue),
      taskboardLinks: Object.freeze(taskboardLinks),
      logs: Object.freeze(logs),
      receipts: Object.freeze(receipts),
      runHistory: Object.freeze(runHistory),
      policyAssist: Object.freeze({
        guidance: 'Fixture policy assistance is non-authoritative and cannot allow a governed write.',
        authoritative: false,
      }),
      semanticGoalAssist: Object.freeze({
        suggestions: Object.freeze(goals.map((goal) => goal.goal_id)),
        authoritative: false,
      }),
      error: recipe.error_code
        ? Object.freeze({
          code: recipe.error_code,
          recoverable: Boolean(recipe.recoverable),
          message: recipe.recoverable
            ? 'Synthetic recoverable timeout'
            : 'Synthetic unrecoverable schema mismatch',
        })
        : null,
      steering: Object.freeze({
        prompt: recipe.prompt === undefined ? '' : recipe.prompt,
        valid: recipe.prompt_valid === undefined ? true : recipe.prompt_valid,
        confirmed: Boolean(recipe.confirmed),
        errors: recipe.prompt_valid === false ? Object.freeze(['prompt_required']) : Object.freeze([]),
      }),
      confirmation: Object.freeze({
        required: Boolean(recipe.confirmation_required),
        decision: recipe.confirmation_decision || null,
        action_id: recipe.action_id || 'action:prompt-steering',
        authoritative: false,
      }),
      focus_order: Object.freeze((recipe.focus_order || [
        'control:goals-tree',
        'control:queue',
        'control:prompt-input',
        'control:submit',
      ]).slice()),
      prefers_reduced_motion: Boolean(recipe.prefers_reduced_motion),
      color_scheme_support: Object.freeze((recipe.color_scheme_support || ['light', 'dark']).slice()),
    });
  }

  function terminalStateFor(kind) {
    return EXPECTED_TERMINAL_STATES[kind][0];
  }

  function runtimeObservation(disposition, extras) {
    return Object.freeze({
      policy_outcome: extras && extras.policy_outcome ? extras.policy_outcome : 'require_confirmation',
      fixture_disposition: disposition,
      authoritative: false,
      decision_authority: 'fixture-simulated',
      failure_code: extras && extras.failure_code,
      recovery_action: extras && extras.recovery_action,
    });
  }

  function availableResult(invocation, data, receipt, clock, correlationId, disposition) {
    return Object.freeze({
      state: 'available',
      capability_id: invocation.capability_id,
      owner: invocation.owner || CAPABILITIES[invocation.capability_id].owner,
      data,
      receipt: receipt || syntheticReceipt('rcpt-fixture-health', 'bafyfixturehealth'),
      correlation_id: correlationId,
      observed_at: clock.iso,
      runtime: runtimeObservation(disposition || 'read'),
    });
  }

  function unavailableResult(invocation, reason, message, clock, correlationId, extras) {
    return Object.freeze({
      state: 'unavailable',
      capability_id: invocation.capability_id,
      owner: invocation.owner || (CAPABILITIES[invocation.capability_id] && CAPABILITIES[invocation.capability_id].owner) || 'ipfs_accelerate_py',
      reason,
      message,
      retry_after_ms: extras && extras.retry_after_ms,
      correlation_id: correlationId,
      runtime: runtimeObservation(extras && extras.disposition ? extras.disposition : reason, extras),
    });
  }

  function deniedResult(invocation, reason, message, clock, correlationId, extras) {
    return Object.freeze({
      state: 'denied',
      capability_id: invocation.capability_id,
      owner: invocation.owner || (CAPABILITIES[invocation.capability_id] && CAPABILITIES[invocation.capability_id].owner) || 'ipfs_accelerate_py',
      reason,
      message,
      policy_class: invocation.policy_class || (CAPABILITIES[invocation.capability_id] && CAPABILITIES[invocation.capability_id].policy_class) || 'confirm',
      decision_id: extras && extras.decision_id,
      required_confirmation: Boolean(extras && extras.required_confirmation),
      correlation_id: correlationId,
      runtime: runtimeObservation(extras && extras.disposition ? extras.disposition : reason, {
        policy_outcome: extras && extras.policy_outcome ? extras.policy_outcome : 'deny',
        recovery_action: extras && extras.recovery_action,
      }),
    });
  }

  function assertNotAuthoritativeAllow(result) {
    const outcome = result && result.runtime && result.runtime.policy_outcome;
    const authoritative = Boolean(
      (result && result.runtime && result.runtime.authoritative)
      || (result && result.data && result.data.authoritative)
      || (result && result.authoritative)
      || (result && result.browser_policy_authoritative),
    );
    if (outcome === 'allow' || authoritative) {
      throw new FixtureAuthorityError('fixtures cannot issue an authoritative allow decision');
    }
    return result;
  }

  function readDataFor(capabilityId, application) {
    switch (capabilityId) {
      case 'supervisor.health.read':
        return application.health;
      case 'supervisor.queue.read':
        return application.queue;
      case 'supervisor.goals.read':
        return application.goals;
      case 'supervisor.subgoals.read':
        return application.subgoals;
      case 'supervisor.taskboard.links.read':
        return application.taskboardLinks;
      case 'supervisor.logs.read':
        return application.logs;
      case 'supervisor.receipts.read':
        return application.receipts;
      case 'supervisor.policy.assist':
        return application.policyAssist;
      case 'supervisor.semantic-goal.assist':
        return application.semanticGoalAssist;
      case 'supervisor.content.retrieve':
        return Object.freeze({
          cid: 'bafyfixturehealth',
          bytes: 0,
          preview: '[fixture content redacted]',
          authoritative: false,
        });
      case 'supervisor.run-history.search':
        return application.runHistory;
      default:
        return null;
    }
  }

  function handleGovernedWrite(invocation, ctx) {
    const payload = invocation.payload || {};
    const capability = CAPABILITIES[invocation.capability_id];
    const mode = ctx.serviceMode;
    const confirmed = Boolean(payload.confirmation_token) || Boolean(ctx.application.confirmation.decision === 'granted' && ctx.application.confirmation.required);
    const dryRun = Boolean(payload.dry_run);

    if (mode === 'confirmation_denied') {
      return deniedResult(
        invocation,
        'policy_denied',
        'Fixture confirmation was denied; no governed write applied.',
        ctx.clock,
        ctx.correlationId,
        {
          decision_id: `deny:${ctx.clock.iso}:${capability.id}`,
          disposition: 'confirmation_denied',
          policy_outcome: 'deny',
          recovery_action: 'Review and resubmit',
        },
      );
    }

    if (mode === 'validation_failure' || (capability.id === 'supervisor.prompt-steering.request' && !String(payload.prompt || ctx.application.steering.prompt || '').trim())) {
      return deniedResult(
        invocation,
        'scope_not_allowed',
        'Invalid fixture submission: prompt_required.',
        ctx.clock,
        ctx.correlationId,
        {
          decision_id: `invalid:${ctx.clock.iso}:${capability.id}`,
          disposition: 'validation_failure',
          policy_outcome: 'deny',
        },
      );
    }

    if (!dryRun && !confirmed && mode !== 'confirmation_granted') {
      return deniedResult(
        invocation,
        'confirmation_required',
        'Explicit confirmation is required before a fixture governed write.',
        ctx.clock,
        ctx.correlationId,
        {
          required_confirmation: true,
          disposition: 'confirmation_required',
          policy_outcome: 'require_confirmation',
        },
      );
    }

    const reviewTarget = payload.expected_normalized_target
      || (payload.target_type && payload.target_id ? `${payload.target_type}:${payload.target_id}` : payload.task_id ? `task:${payload.task_id}` : 'task:synthetic-1');
    const accepted = Object.freeze({
      request_id: payload.client_request_id || `request:${ctx.clock.iso}:${capability.id}`,
      correlation_id: ctx.correlationId,
      accepted: true,
      dry_run: dryRun,
      authoritative: false,
      decision_authority: 'fixture-simulated',
      fixture_only: true,
      normalized_target: reviewTarget,
      policy_class: capability.policy_class,
      affected_task_ids: Object.freeze(ctx.application.queue.map((item) => item.task_id)),
      planned_mcp_action: Object.freeze({
        capability_id: capability.id,
        method: capability.method,
        owner: capability.owner,
        access: capability.access,
        policy_class: capability.policy_class,
        normalized_target: reviewTarget,
        transport_candidates: Object.freeze(['mcp', 'mcp++']),
        input_mode: 'structured-json-payload',
        prompt_log_mode: 'redacted',
        required_policy_checks: Object.freeze([
          'target_authorization',
          'task_dependencies',
          'branch_protection',
          'confirmation_policy',
          'execution_budget',
          'receipt_persistence',
        ]),
      }),
      receipt: syntheticReceipt(`rcpt-fixture-${capability.id.replace(/[^a-z0-9]+/gi, '-')}`, 'bafyfixturegoverned'),
    });
    return availableResult(
      invocation,
      accepted,
      accepted.receipt,
      ctx.clock,
      ctx.correlationId,
      'simulated_confirmation_grant',
    );
  }

  function invokeOnState(state, invocation) {
    if (!invocation || typeof invocation !== 'object') {
      throw new FixtureEffectError('invalid Agent Supervisor invocation');
    }
    const capabilityId = invocation.capability_id;
    if (!capabilityId || !CAPABILITIES[capabilityId]) {
      throw new FixtureEffectError(`unexpected effectful call: ${capabilityId || '<missing>'}`);
    }
    const capability = CAPABILITIES[capabilityId];
    if (invocation.method && invocation.method !== capability.method) {
      throw new FixtureEffectError(`unexpected method: ${invocation.method}`);
    }
    if (typeof invocation.method === 'string' && !invocation.method.startsWith('agent_supervisor.')) {
      throw new FixtureEffectError(`unexpected method: ${invocation.method}`);
    }
    const correlationId = invocation.correlation_id || `corr:${state.seed}:${capability.id}`;
    const ctx = {
      serviceMode: state.serviceMode,
      application: state.application,
      clock: state.clock,
      ids: state.ids,
      correlationId,
    };

    let result;
    if (state.serviceMode === 'loading') {
      result = unavailableResult(
        invocation,
        'timeout',
        'Synthetic fixture is still loading.',
        state.clock,
        correlationId,
        { disposition: 'loading', retry_after_ms: 0 },
      );
    } else if (state.serviceMode === 'service_unavailable') {
      result = unavailableResult(
        invocation,
        'server_unavailable',
        'All synthetic backends report unavailable.',
        state.clock,
        correlationId,
        { disposition: 'service_unavailable', recovery_action: 'Retry when the fixture mode is available' },
      );
    } else if (state.serviceMode === 'recoverable_error') {
      result = unavailableResult(
        invocation,
        'timeout',
        'Synthetic recoverable timeout',
        state.clock,
        correlationId,
        { disposition: 'recoverable_error', retry_after_ms: 0, recovery_action: 'Retry' },
      );
    } else if (state.serviceMode === 'unrecoverable_error') {
      result = unavailableResult(
        invocation,
        'capability_unavailable',
        'Synthetic unrecoverable schema mismatch',
        state.clock,
        correlationId,
        { disposition: 'unrecoverable_error' },
      );
    } else if (capability.access === 'governed-write') {
      result = handleGovernedWrite(invocation, ctx);
    } else if (state.serviceMode === 'empty' && capabilityId !== 'supervisor.health.read') {
      result = availableResult(invocation, Object.freeze([]), state.application.receipts[0], state.clock, correlationId, 'empty');
    } else {
      result = availableResult(
        invocation,
        readDataFor(capabilityId, state.application),
        state.application.receipts[0],
        state.clock,
        correlationId,
        'success',
      );
    }

    const sealed = assertNotAuthoritativeAllow(result);
    state.lastInvocation = sealed;
    state.invocations.push(sealed);
    return cloneJson(sealed);
  }

  function buildSnapshot(state) {
    return freezeDeep({
      interface: SNAPSHOT_INTERFACE,
      schema_version: SNAPSHOT_SCHEMA,
      scenario_id: state.scenario.scenario_id,
      fixture_id: state.scenario.fixture_id,
      kind: state.scenario.kind,
      seed: state.seed,
      frozen_time: state.clock.iso,
      timezone: TIMEZONE,
      locale: state.scenario.locale,
      color_scheme: state.scenario.color_scheme,
      text_scale_percent: state.scenario.text_scale_percent,
      reduced_motion: state.scenario.reduced_motion,
      viewport: VIEWPORTS[state.scenario.viewport],
      terminal_state: terminalStateFor(state.scenario.kind),
      expected_terminal_states: state.scenario.expected_terminal_states.slice(),
      network_outcome: state.serviceMode,
      animation: state.animation,
      clock_iso: state.clock.iso,
      service_descriptors: { ...SERVICE_DESCRIPTORS },
      uses_production_services: false,
      uses_production_credentials: false,
      can_issue_authoritative_allow: false,
      confirmation: {
        required: state.application.confirmation.required,
        decision: state.recordedConfirmation || state.application.confirmation.decision,
        authoritative: false,
        action_id: state.application.confirmation.action_id,
      },
      application_data: {
        health: state.application.health,
        goals: state.application.goals,
        subgoals: state.application.subgoals,
        queue: state.application.queue,
        taskboardLinks: state.application.taskboardLinks,
        logs: state.application.logs,
        receipts: state.application.receipts,
        runHistory: state.application.runHistory,
        steering: state.application.steering,
        error: state.application.error,
        focus_order: state.application.focus_order,
      },
      last_invocation: state.lastInvocation,
    });
  }

  function createServices(options) {
    const opts = options || {};
    const document = resolveScenarioDocument(opts.scenarioDocument);
    const scenarioId = opts.scenarioId || STABLE_SCENARIO_IDS.initial_load;
    const seed = opts.seed || document.seed || SEED;
    const clock = createClock(opts.frozenTime || document.frozen_time || FROZEN_TIME);
    const ids = createIdFactory(seed);

    function reset(nextScenarioId) {
      const scenario = getScenarioById(nextScenarioId || scenarioId, document);
      const fixture = getFixtureById(scenario.fixture_id, document);
      state.scenario = scenario;
      state.fixture = fixture;
      state.serviceMode = fixture.service_mode;
      state.animation = fixture.animation;
      state.application = expandRecipe(fixture.recipe);
      state.lastInvocation = null;
      state.invocations = [];
      state.recordedConfirmation = scenario.kind === 'confirmation_grant'
        ? 'granted'
        : scenario.kind === 'confirmation_deny'
          ? 'denied'
          : state.application.confirmation.decision;
    }

    const state = {
      seed,
      clock,
      ids,
      document,
      scenario: null,
      fixture: null,
      serviceMode: 'success',
      animation: 'allowed',
      application: null,
      lastInvocation: null,
      invocations: [],
      recordedConfirmation: null,
    };
    reset(scenarioId);

    const services = {
      interface: SERVICES_INTERFACE,
      schema_version: SERVICES_SCHEMA,
      uses_production_services: false,
      uses_production_credentials: false,
      can_issue_authoritative_allow: false,
      seed,
      frozen_time: clock.iso,
      timezone: TIMEZONE,
      invoke(invocation) {
        return Promise.resolve(invokeOnState(state, invocation));
      },
      invokeSync(invocation) {
        return invokeOnState(state, invocation);
      },
      applyScenario(nextScenarioId) {
        reset(nextScenarioId);
        return buildSnapshot(state);
      },
      snapshot() {
        return buildSnapshot(state);
      },
      recordConfirmation(decision) {
        if (decision !== 'granted' && decision !== 'denied') {
          throw new FixtureScenarioError(`unsupported confirmation decision: ${decision}`);
        }
        state.recordedConfirmation = decision;
        state.application = freezeDeep({
          ...state.application,
          confirmation: {
            ...state.application.confirmation,
            decision,
            authoritative: false,
          },
        });
        return Object.freeze({
          decision,
          authoritative: false,
          decision_authority: 'fixture-simulated',
          can_issue_authoritative_allow: false,
        });
      },
      issueAuthoritativeAllow() {
        throw new FixtureAuthorityError('fixtures cannot issue an authoritative allow decision');
      },
      allow() {
        throw new FixtureAuthorityError('fixtures cannot issue an authoritative allow decision');
      },
      listInvocations() {
        return state.invocations.map((item) => cloneJson(item));
      },
      getScenario() {
        return cloneJson(state.scenario);
      },
    };
    return services;
  }

  function installGateway(target, services) {
    const globalRef = target || (typeof globalThis !== 'undefined' ? globalThis : {});
    const gateway = {
      invoke(invocation) {
        return services.invoke(invocation);
      },
    };
    globalRef.__agentSupervisorGateway = gateway;
    globalRef.agentSupervisorGateway = gateway;
    globalRef.swissknifeAgentSupervisorGateway = gateway;
    return gateway;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function metric(label, value) {
    return `<div class="as-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function renderGoals(snapshot) {
    const goals = snapshot.application_data.goals;
    if (!goals.length) return '<div class="as-list-empty">No goals available.</div>';
    return `<div class="as-tree" role="tree" data-testid="goals-tree" data-control="control:goals-tree" data-supervisor-focusable tabindex="0">${goals.map((goal) => `
      <div class="as-tree-goal" role="treeitem" aria-expanded="true">
        <button type="button" class="as-row" data-goal-id="${escapeHtml(goal.goal_id)}" data-supervisor-focusable>
          <span class="as-status ${escapeHtml(goal.status)}"></span>
          <span><strong>${escapeHtml(goal.goal_id)}</strong>${escapeHtml(goal.title)}</span>
        </button>
      </div>`).join('')}</div>`;
  }

  function renderQueue(snapshot) {
    const queue = snapshot.application_data.queue;
    if (!queue.length) return '<div class="as-list-empty">No queued tasks.</div>';
    return `<div class="as-queue-list" role="listbox" data-testid="task-queue" data-control="control:queue" data-supervisor-focusable tabindex="0">${queue.map((item) => `
      <button type="button" class="as-row" role="option" data-task-id="${escapeHtml(item.task_id)}" data-supervisor-focusable>
        <span class="as-status ${escapeHtml(item.status)}"></span>
        <span><strong>${escapeHtml(item.task_id)}</strong>${escapeHtml(item.title)}</span>
      </button>`).join('')}</div>`;
  }

  function renderConfirmation(snapshot) {
    if (!snapshot.confirmation.required) return '';
    const decision = snapshot.confirmation.decision;
    return `
      <dialog class="as-confirm" data-testid="confirmation-dialog" open>
        <p>Confirm governed prompt steering? Fixture confirmation is not an authoritative allow.</p>
        <p data-testid="confirmation-authority">authoritative=false</p>
        <div class="as-actions">
          <button type="button" data-testid="confirmation-grant" data-confirmation="granted" ${decision === 'granted' ? 'aria-pressed="true"' : ''}>Grant</button>
          <button type="button" data-testid="confirmation-deny" data-confirmation="denied" ${decision === 'denied' ? 'aria-pressed="true"' : ''}>Deny</button>
        </div>
      </dialog>`;
  }

  function renderStateBanner(snapshot) {
    const state = snapshot.terminal_state.replace(/^state:/, '');
    if (state === 'loading') {
      return `<section class="as-state as-loading" data-testid="supervisor-loading" aria-live="polite"><strong>Loading supervisor state</strong><span>Reading synthetic fixture capabilities.</span></section>`;
    }
    if (state === 'empty') {
      return `<section class="as-state" data-testid="supervisor-empty"><strong>No supervisor work is queued.</strong></section>`;
    }
    if (state === 'recovery') {
      return `<section class="as-state as-error" data-testid="supervisor-error" role="alert"><strong>transport_timeout</strong><span>Synthetic recoverable timeout</span><button type="button" data-action="retry" data-testid="supervisor-retry">Retry</button></section>`;
    }
    if (state === 'failure') {
      return `<section class="as-state as-error" data-testid="supervisor-error" role="alert"><strong>schema_mismatch</strong><span>Synthetic unrecoverable schema mismatch</span></section>`;
    }
    if (state === 'unavailable') {
      return `<section class="as-state as-error" data-testid="supervisor-error" role="alert"><strong>server_unavailable</strong><span>All synthetic backends report unavailable.</span></section>`;
    }
    return '';
  }

  function renderFixtureMarkup(snapshot, extras) {
    const view = extras || {};
    const activeTab = view.activeTab || 'active';
    const state = snapshot.terminal_state.replace(/^state:/, '');
    const task = snapshot.application_data.queue[0];
    const steering = snapshot.application_data.steering;
    const health = snapshot.application_data.health;
    const validationError = snapshot.kind === 'invalid_submission';
    const grantSimulated = snapshot.kind === 'confirmation_grant' || snapshot.kind === 'valid_submission';
    const denyVisible = snapshot.kind === 'confirmation_deny';
    return `
      <div class="agent-supervisor" data-agent-supervisor-root data-testid="agent-supervisor-app" data-state="${escapeHtml(state)}" data-scenario="${escapeHtml(snapshot.scenario_id)}" data-color-scheme="${escapeHtml(snapshot.color_scheme)}" data-text-scale="${escapeHtml(String(snapshot.text_scale_percent))}" data-reduced-motion="${snapshot.reduced_motion ? 'true' : 'false'}" data-can-issue-authoritative-allow="false" data-transport="fixture">
        <header class="as-header">
          <div>
            <h1>Agent Supervisor</h1>
            <div class="as-subtitle">Controlled fixture host — synthetic state only</div>
          </div>
          <div class="as-actions" aria-label="Supervisor actions">
            <a class="as-link" href="contracts/agent-supervisor-console.schema.json" data-testid="contract-link">Contract</a>
            <button type="button" data-action="refresh" data-supervisor-focusable>Refresh</button>
          </div>
        </header>
        <section class="as-health-band" aria-label="Supervisor health" data-testid="supervisor-health">
          ${metric('Status', health.status)}
          ${metric('Active goals', String(health.active_goal_count))}
          ${metric('Queued', String(health.queued_task_count))}
          ${metric('Running', String(health.running_task_count))}
          ${metric('Mode', 'fixture')}
        </section>
        ${renderStateBanner(snapshot)}
        ${renderConfirmation(snapshot)}
        <main class="as-layout">
          <section class="as-pane as-goals" aria-label="Goals and subgoals">
            <div class="as-pane-title"><h2>Goals</h2><span>${snapshot.application_data.goals.length} goals</span></div>
            ${renderGoals(snapshot)}
          </section>
          <section class="as-pane as-queue" aria-label="Taskboard-linked queue">
            <div class="as-pane-title"><h2>Queue</h2><span>${snapshot.application_data.queue.length} tasks</span></div>
            ${renderQueue(snapshot)}
          </section>
          <section class="as-pane as-detail" aria-label="Active task and receipts">
            <div class="as-tabs" role="tablist" data-testid="supervisor-tabs">
              ${[['active', 'Active task'], ['steering', 'Steering'], ['receipts', 'Receipts'], ['health', 'Health'], ['contract', 'Contract']].map(([id, label]) => `
                <button type="button" role="tab" data-tab="${id}" aria-selected="${activeTab === id}" class="${activeTab === id ? 'is-selected' : ''}" data-supervisor-focusable>${label}</button>`).join('')}
            </div>
            <div class="as-detail-body" data-testid="active-task">
              ${task ? `<h3>${escapeHtml(task.task_id)}</h3><p>${escapeHtml(task.title)}</p>` : 'No active task selected.'}
            </div>
            <div class="as-detail-body as-steering" data-testid="steering-panel">
              <label class="as-field">
                <span>Steering prompt</span>
                <textarea data-steering-prompt data-testid="steering-prompt" data-control="control:prompt-input" data-supervisor-focusable maxlength="8000">${escapeHtml(steering.prompt)}</textarea>
              </label>
              <div class="as-inline-grid as-review-grid" data-testid="steering-review">
                ${metric('Target', task ? `task:${task.task_id}` : 'unselected')}
                ${metric('Policy', 'confirm')}
                ${metric('Log', '[prompt redacted]')}
                ${metric('Method', 'agent_supervisor.prompt_steering.request')}
              </div>
              <label><input type="checkbox" data-steering-confirm data-testid="steering-confirm" ${steering.confirmed ? 'checked' : ''}> Confirm fixture submission</label>
              <button type="button" data-action="submit-steering" data-testid="steering-submit" data-control="control:submit" data-supervisor-focusable>Submit</button>
              ${validationError ? '<div class="as-state as-error" data-testid="steering-error" role="alert">prompt_required</div>' : ''}
              ${denyVisible ? '<div class="as-state as-error" data-testid="steering-error" role="alert">policy_denied</div>' : ''}
              ${grantSimulated ? '<div class="as-steering-result" data-testid="steering-result">fixture-simulated receipt:bafyfixturegoverned authoritative=false</div>' : ''}
            </div>
            <div class="as-detail-body" data-testid="receipt-view">
              ${snapshot.application_data.receipts.map((receipt) => `<button type="button" data-receipt-id="${escapeHtml(receipt.receipt_id)}" data-supervisor-focusable>${escapeHtml(receipt.receipt_id)}</button>`).join('') || 'No receipts.'}
            </div>
            <div class="as-detail-body" data-testid="backend-health">
              ${health.backends.map((backend) => `<div>${escapeHtml(backend.owner)} ${escapeHtml(backend.status)} ${escapeHtml(backend.transport)}</div>`).join('')}
            </div>
            <div class="as-section-line" data-testid="gateway-evidence">
              fixture-only synthetic://agent-supervisor authoritative=false
            </div>
            <div class="as-detail-body" data-testid="contract-view">
              swissknife.agent_supervisor_console.v1
              host_state_file_read forbidden
              AgentSupervisorFixtureServices@1
            </div>
          </section>
        </main>
      </div>`;
  }

  function applyViewPreferences(doc, scenario) {
    if (!doc || !doc.documentElement) return scenario;
    const root = doc.documentElement;
    root.lang = scenario.locale || DEFAULT_LOCALE;
    root.setAttribute('data-color-scheme', scenario.color_scheme);
    root.setAttribute('data-reduced-motion', scenario.reduced_motion ? 'true' : 'false');
    root.style.colorScheme = scenario.color_scheme;
    root.style.fontSize = `${(16 * Number(scenario.text_scale_percent || 100)) / 100}px`;
    const viewport = VIEWPORTS[scenario.viewport] || VIEWPORTS.desktop;
    let meta = doc.querySelector('meta[name="viewport"]');
    if (!meta && doc.head) {
      meta = doc.createElement('meta');
      meta.setAttribute('name', 'viewport');
      doc.head.appendChild(meta);
    }
    if (meta) {
      meta.setAttribute('content', `width=${viewport.width}`);
    }
    if (doc.body) {
      doc.body.style.width = `${viewport.width}px`;
      doc.body.style.minHeight = `${viewport.height}px`;
    }
    return viewport;
  }

  function bindHostEvents(root, host) {
    if (!root || typeof root.addEventListener !== 'function') return;
    root.addEventListener('click', (event) => {
      const target = event.target && event.target.closest ? event.target.closest('[data-confirmation], [data-tab], [data-action], [data-task-id]') : null;
      if (!target) return;
      if (target.getAttribute('data-confirmation') === 'granted') {
        host.recordConfirmation('granted');
        host.render();
      } else if (target.getAttribute('data-confirmation') === 'denied') {
        host.recordConfirmation('denied');
        host.render();
      } else if (target.getAttribute('data-tab')) {
        host.activeTab = target.getAttribute('data-tab');
        host.render();
      }
    });
    root.addEventListener('keydown', (event) => {
      const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      const focusables = Array.from(root.querySelectorAll('[data-supervisor-focusable]'));
      const index = focusables.indexOf(event.target);
      if (index === -1) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowDown') next = Math.min(focusables.length - 1, index + 1);
      if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = focusables.length - 1;
      if (focusables[next] && typeof focusables[next].focus === 'function') focusables[next].focus();
    });
  }

  function createHost(options) {
    const opts = options || {};
    const services = opts.services || createServices(opts);
    const documentRef = opts.document;
    const mount = opts.mount || (documentRef && documentRef.getElementById && documentRef.getElementById('fixture-host'));
    const host = {
      interface: HOST_INTERFACE,
      schema_version: HOST_SCHEMA,
      uses_production_services: false,
      uses_production_credentials: false,
      can_issue_authoritative_allow: false,
      services,
      activeTab: 'active',
      get scenario() {
        return services.getScenario();
      },
      snapshot() {
        return services.snapshot();
      },
      applyScenario(scenarioId) {
        services.applyScenario(scenarioId);
        return host.render();
      },
      recordConfirmation(decision) {
        return services.recordConfirmation(decision);
      },
      issueAuthoritativeAllow() {
        throw new FixtureAuthorityError('fixtures cannot issue an authoritative allow decision');
      },
      render() {
        const snapshot = services.snapshot();
        if (documentRef) applyViewPreferences(documentRef, services.getScenario());
        const markup = renderFixtureMarkup(snapshot, { activeTab: host.activeTab });
        if (mount) mount.innerHTML = markup;
        return markup;
      },
    };
    if (mount) bindHostEvents(mount, host);
    return host;
  }

  function boot(target) {
    const globalRef = target || (typeof globalThis !== 'undefined' ? globalThis : {});
    const clock = installClock(globalRef, FROZEN_TIME);
    const ids = installIdFactory(globalRef, SEED);
    const canary = installNetworkCanary(globalRef, { allowRelative: ['fixture-scenarios.json'] });
    const injected = globalRef.__AGENT_SUPERVISOR_FIXTURE_SCENARIOS__;
    const search = globalRef.location && typeof globalRef.location.search === 'string'
      ? globalRef.location.search
      : '';
    let scenarioId = STABLE_SCENARIO_IDS.initial_load;
    const scenarioMatch = /(?:\?|&)scenario=([^&]+)/.exec(search);
    if (scenarioMatch) {
      try {
        scenarioId = decodeURIComponent(scenarioMatch[1]) || scenarioId;
      } catch (_error) {
        scenarioId = scenarioMatch[1] || scenarioId;
      }
    }
    const host = createHost({
      scenarioId,
      scenarioDocument: injected,
      document: globalRef.document,
    });
    installGateway(globalRef, host.services);
    host.render();
    globalRef.__agentSupervisorFixtureHost = host;
    return Object.freeze({
      interface: HOST_INTERFACE,
      clock,
      ids,
      canary,
      host,
    });
  }

  return Object.freeze({
    interface: SERVICES_INTERFACE,
    schema_version: SERVICES_SCHEMA,
    host_interface: HOST_INTERFACE,
    host_schema: HOST_SCHEMA,
    scenarios_interface: SCENARIOS_INTERFACE,
    scenarios_schema: SCENARIOS_SCHEMA,
    snapshot_interface: SNAPSHOT_INTERFACE,
    application_id: APPLICATION_ID,
    screen_id: SCREEN_ID,
    catalog_id: CATALOG_ID,
    seed: SEED,
    frozen_time: FROZEN_TIME,
    timezone: TIMEZONE,
    locale: DEFAULT_LOCALE,
    canonical_json_profile: CANONICAL_JSON_PROFILE,
    uses_production_services: false,
    uses_production_credentials: false,
    can_issue_authoritative_allow: false,
    REQUIRED_SCENARIO_KINDS,
    STABLE_SCENARIO_IDS,
    EXPECTED_TERMINAL_STATES,
    VIEWPORTS,
    SERVICE_DESCRIPTORS,
    NETWORK_POLICY,
    FixtureNetworkError,
    FixtureEffectError,
    FixtureAuthorityError,
    FixtureScenarioError,
    canonicalJson,
    getScenarioDocument,
    listScenarios,
    listCapabilities,
    getScenarioById,
    getFixtureById,
    createClock,
    createIdFactory,
    installClock,
    installIdFactory,
    installNetworkCanary,
    installGateway,
    expandRecipe,
    renderFixtureMarkup,
    applyViewPreferences,
    createServices,
    createHost,
    boot,
  });
});
