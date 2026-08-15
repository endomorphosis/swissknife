/**
 * VGO-003 — deterministic evaluation scenario catalog tests.
 *
 * Acceptance:
 * - scenarios have stable IDs
 * - explicit fixtures
 * - locale / color / viewport / text-scale inputs
 * - expected terminal states
 * - repeated catalog construction is byte-identical
 */

// @vitest-environment node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  DETERMINISTIC_SCENARIO_CATALOG_INTERFACE,
  DETERMINISTIC_SCENARIO_CATALOG_SCHEMA,
  EXPECTED_TERMINAL_STATES,
  REQUIRED_SCENARIO_KINDS,
  SCENARIO_CATALOG_EXTRACTOR_VERSION,
  STABLE_SCENARIO_IDS,
  UI_EVALUATION_SCENARIO_INTERFACE,
  UI_EVALUATION_SCENARIO_SCHEMA,
  VIEWPORT_DESKTOP,
  VIEWPORT_MOBILE,
  VIEWPORT_SPEC_INTERFACE,
  VIEWPORT_SPEC_SCHEMA,
  VIEWPORT_WIDE,
  buildAgentSupervisorScenarioCatalog,
  buildAgentSupervisorScenarioRecipeDocument,
  buildScenarioCatalogFromRecipeDocument,
  canonicalJson,
  catalogDigest,
  createDeterministicScenarioCatalog,
  decodeUiEvaluationScenario,
  decodeViewportSpec,
  getCatalogScenarioById,
  getFixtureById,
  listUiEvaluationScenarios,
  serializeScenarioCatalog,
  validateScenarioCatalog,
  type CatalogScenarioEntry,
  type DeterministicScenarioCatalog,
} from '../../../../src/services/gui-optimizer/scenario-catalog.js';

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/gui-optimizer/scenarios/agent-supervisor-scenarios.json',
);

function loadFixtureDocument(): unknown {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
}

describe('DeterministicScenarioCatalog@1 (VGO-003)', () => {
  it('exports sealed interface and schema identities', () => {
    expect(DETERMINISTIC_SCENARIO_CATALOG_INTERFACE).toBe(
      'DeterministicScenarioCatalog@1',
    );
    expect(DETERMINISTIC_SCENARIO_CATALOG_SCHEMA).toBe(
      'deterministic-scenario-catalog/v1',
    );
    expect(UI_EVALUATION_SCENARIO_INTERFACE).toBe('UiEvaluationScenario@1');
    expect(UI_EVALUATION_SCENARIO_SCHEMA).toBe('ui-evaluation-scenario/v1');
    expect(VIEWPORT_SPEC_INTERFACE).toBe('ViewportSpec@1');
    expect(VIEWPORT_SPEC_SCHEMA).toBe('gui-viewport-spec/v1');
    expect(CANONICAL_JSON_PROFILE).toBe('gui-optimizer-canonical-json/v1');
    expect(SCENARIO_CATALOG_EXTRACTOR_VERSION).toBe(
      'gui-scenario-catalog@1.0.0',
    );
  });

  it('builds a catalog bound to the Agent Supervisor screen', () => {
    const catalog = buildAgentSupervisorScenarioCatalog();
    expect(catalog.interface).toBe(DETERMINISTIC_SCENARIO_CATALOG_INTERFACE);
    expect(catalog.schema_version).toBe(DETERMINISTIC_SCENARIO_CATALOG_SCHEMA);
    expect(catalog.catalog_id).toBe(AGENT_SUPERVISOR_CATALOG_ID);
    expect(catalog.application_id).toBe(AGENT_SUPERVISOR_APPLICATION_ID);
    expect(catalog.screen_id).toBe(AGENT_SUPERVISOR_SCREEN_ID);
    expect(catalog.seed).toBe(AGENT_SUPERVISOR_CATALOG_SEED);
    expect(catalog.frozen_time).toBe(AGENT_SUPERVISOR_FROZEN_TIME);
    expect(catalog.timezone).toBe(AGENT_SUPERVISOR_TIMEZONE);
    expect(catalog.locale).toBe(AGENT_SUPERVISOR_DEFAULT_LOCALE);
    expect(catalog.canonical_json_profile).toBe(CANONICAL_JSON_PROFILE);
  });

  it('declares every required scenario kind exactly once with stable IDs', () => {
    const catalog = buildAgentSupervisorScenarioCatalog();
    expect(catalog.scenarios).toHaveLength(REQUIRED_SCENARIO_KINDS.length);
    expect(REQUIRED_SCENARIO_KINDS).toHaveLength(18);

    const ids = catalog.scenarios.map(entry => entry.scenario.scenario_id);
    expect(new Set(ids).size).toBe(ids.length);

    for (let i = 0; i < REQUIRED_SCENARIO_KINDS.length; i += 1) {
      const kind = REQUIRED_SCENARIO_KINDS[i];
      const entry = catalog.scenarios[i];
      expect(entry.kind).toBe(kind);
      expect(entry.scenario.scenario_id).toBe(STABLE_SCENARIO_IDS[kind]);
      expect(entry.scenario.scenario_id).toMatch(/^scenario:[a-z0-9-]+$/);
    }

    // Plan/oracle aliases used by downstream models.
    expect(STABLE_SCENARIO_IDS.keyboard_only).toBe('scenario:keyboard-only');
    expect(STABLE_SCENARIO_IDS.initial_load).toBe('scenario:initial-load');
  });

  it('binds each scenario to an explicit synthetic fixture', () => {
    const catalog = buildAgentSupervisorScenarioCatalog();
    expect(catalog.fixtures.length).toBeGreaterThan(0);

    const fixtureIds = new Set(catalog.fixtures.map(f => f.fixture_id));
    for (const entry of catalog.scenarios) {
      expect(fixtureIds.has(entry.fixture_id)).toBe(true);
      const fixture = getFixtureById(entry.fixture_id, catalog);
      expect(fixture.fixture_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(fixture.fixture_digest).toBe(entry.scenario.fixture_digest);
      expect(fixture.uses_production_services).toBe(false);
      expect(fixture.uses_production_credentials).toBe(false);
      expect(fixture.seed).toBe(AGENT_SUPERVISOR_CATALOG_SEED);
      expect(fixture.frozen_time).toBe(AGENT_SUPERVISOR_FROZEN_TIME);
      expect(fixture.timezone).toBe(AGENT_SUPERVISOR_TIMEZONE);
      expect(Object.keys(fixture.service_descriptors).length).toBeGreaterThan(0);
      for (const endpoint of Object.values(fixture.service_descriptors)) {
        expect(endpoint.startsWith('synthetic://')).toBe(true);
      }
    }
  });

  it('provides locale, color scheme, viewport, and text-scale inputs', () => {
    const catalog = buildAgentSupervisorScenarioCatalog();
    for (const entry of catalog.scenarios) {
      const scenario = entry.scenario;
      expect(scenario.locale).toBeTruthy();
      expect(typeof scenario.locale).toBe('string');
      expect(['light', 'dark']).toContain(scenario.color_scheme);
      expect(scenario.text_scale_percent).toBeGreaterThanOrEqual(25);
      expect(scenario.text_scale_percent).toBeLessThanOrEqual(500);
      expect(typeof scenario.reduced_motion).toBe('boolean');
      expect(scenario.timezone).toBe(AGENT_SUPERVISOR_TIMEZONE);

      const viewport = decodeViewportSpec(scenario.viewport);
      expect(viewport.width).toBeGreaterThan(0);
      expect(viewport.height).toBeGreaterThan(0);
      expect(viewport.device_scale_factor).toBeGreaterThan(0);
    }

    const mobile = getCatalogScenarioById('scenario:viewport-mobile', catalog);
    expect(mobile.scenario.viewport).toEqual(VIEWPORT_MOBILE);

    const desktop = getCatalogScenarioById(
      'scenario:viewport-desktop',
      catalog,
    );
    expect(desktop.scenario.viewport).toEqual(VIEWPORT_DESKTOP);

    const wide = getCatalogScenarioById('scenario:viewport-wide', catalog);
    expect(wide.scenario.viewport).toEqual(VIEWPORT_WIDE);

    const zoom = getCatalogScenarioById('scenario:text-scale-200', catalog);
    expect(zoom.scenario.text_scale_percent).toBe(200);

    const dark = getCatalogScenarioById('scenario:dark-mode', catalog);
    expect(dark.scenario.color_scheme).toBe('dark');

    const reduced = getCatalogScenarioById('scenario:reduced-motion', catalog);
    expect(reduced.scenario.reduced_motion).toBe(true);
  });

  it('declares expected terminal states for every scenario', () => {
    const catalog = buildAgentSupervisorScenarioCatalog();
    for (const entry of catalog.scenarios) {
      expect(entry.expected_terminal_states.length).toBeGreaterThan(0);
      expect(entry.expected_terminal_states).toEqual([
        ...EXPECTED_TERMINAL_STATES[entry.kind],
      ]);
      for (const stateId of entry.expected_terminal_states) {
        expect(stateId).toMatch(/^state:[a-z0-9-]+$/);
      }
    }

    const completenessKinds = catalog.completeness.map(row => row.kind);
    expect(completenessKinds).toEqual([...REQUIRED_SCENARIO_KINDS]);
    for (const row of catalog.completeness) {
      expect(row.present).toBe(true);
      expect(row.expected_terminal_states.length).toBeGreaterThan(0);
    }
  });

  it('produces byte-identical catalogs on repeated construction', () => {
    const first = buildAgentSupervisorScenarioCatalog();
    const second = buildAgentSupervisorScenarioCatalog();
    const third = createDeterministicScenarioCatalog().buildAgentSupervisorCatalog();

    const a = serializeScenarioCatalog(first);
    const b = serializeScenarioCatalog(second);
    const c = serializeScenarioCatalog(third);

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(catalogDigest(first)).toBe(catalogDigest(second));
    expect(catalogDigest(first)).toMatch(/^sha256:[0-9a-f]{64}$/);

    // Canonical serialization is stable under re-parse.
    const reparsed = JSON.parse(a) as DeterministicScenarioCatalog;
    expect(canonicalJson(reparsed)).toBe(a);
    expect(validateScenarioCatalog(reparsed)).toEqual(first);
  });

  it('emits closed UiEvaluationScenario@1 wire records', () => {
    const catalog = buildAgentSupervisorScenarioCatalog();
    const wire = listUiEvaluationScenarios(catalog);
    expect(wire).toHaveLength(REQUIRED_SCENARIO_KINDS.length);

    for (const scenario of wire) {
      const decoded = decodeUiEvaluationScenario(
        JSON.parse(JSON.stringify(scenario)),
      );
      expect(decoded).toEqual(scenario);
      expect(decoded.interface).toBe(UI_EVALUATION_SCENARIO_INTERFACE);
      expect(decoded.schema_version).toBe(UI_EVALUATION_SCENARIO_SCHEMA);
      expect(decoded.application_id).toBe(AGENT_SUPERVISOR_APPLICATION_ID);
      expect(decoded.screen_id).toBe(AGENT_SUPERVISOR_SCREEN_ID);
      expect(decoded.fixture_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(Array.isArray(decoded.tags)).toBe(true);
      expect(new Set(decoded.tags).size).toBe(decoded.tags.length);
    }
  });

  it('loads the on-disk recipe fixture into the sealed catalog', () => {
    const document = loadFixtureDocument();
    const fromFixture = buildScenarioCatalogFromRecipeDocument(document);
    const fromBuilder = buildAgentSupervisorScenarioCatalog();

    expect(serializeScenarioCatalog(fromFixture)).toBe(
      serializeScenarioCatalog(fromBuilder),
    );
    expect(catalogDigest(fromFixture)).toBe(catalogDigest(fromBuilder));

    // Recipe document itself is byte-identical to the sealed recipe emitter
    // after JSON normalization (frozen prototypes / key order ignored).
    expect(canonicalJson(JSON.parse(JSON.stringify(document)))).toBe(
      canonicalJson(
        JSON.parse(
          JSON.stringify(buildAgentSupervisorScenarioRecipeDocument()),
        ),
      ),
    );
  });

  it('fixture recipe covers the full evaluation matrix surface', () => {
    const document = loadFixtureDocument() as {
      required_scenario_kinds: string[];
      stable_scenario_ids: Record<string, string>;
      expected_terminal_states: Record<string, string[]>;
      scenarios: Array<{
        kind: string;
        scenario_id: string;
        fixture_id: string;
        locale: string;
        color_scheme: string;
        text_scale_percent: number;
        viewport: string;
        expected_terminal_states: string[];
      }>;
      fixtures: Array<{ fixture_id: string }>;
      seed: string;
      frozen_time: string;
    };

    expect(document.required_scenario_kinds).toEqual([
      ...REQUIRED_SCENARIO_KINDS,
    ]);
    expect(document.stable_scenario_ids).toEqual({ ...STABLE_SCENARIO_IDS });
    expect(document.seed).toBe(AGENT_SUPERVISOR_CATALOG_SEED);
    expect(document.frozen_time).toBe(AGENT_SUPERVISOR_FROZEN_TIME);
    expect(document.fixtures.length).toBeGreaterThan(0);
    expect(document.scenarios).toHaveLength(REQUIRED_SCENARIO_KINDS.length);

    for (const scenario of document.scenarios) {
      expect(scenario.scenario_id).toBe(
        STABLE_SCENARIO_IDS[scenario.kind as keyof typeof STABLE_SCENARIO_IDS],
      );
      expect(scenario.locale).toBeTruthy();
      expect(scenario.color_scheme).toBeTruthy();
      expect(scenario.text_scale_percent).toBeGreaterThan(0);
      expect(['mobile', 'desktop', 'wide']).toContain(scenario.viewport);
      expect(scenario.expected_terminal_states).toEqual([
        ...EXPECTED_TERMINAL_STATES[
          scenario.kind as keyof typeof EXPECTED_TERMINAL_STATES
        ],
      ]);
      expect(
        document.fixtures.some(f => f.fixture_id === scenario.fixture_id),
      ).toBe(true);
    }
  });

  it('rejects unknown scenario and fixture lookups', () => {
    expect(() => getCatalogScenarioById('scenario:does-not-exist')).toThrow(
      /unknown scenario_id/,
    );
    expect(() => getFixtureById('fixture:does-not-exist')).toThrow(
      /unknown fixture_id/,
    );
  });

  it('rejects non-wire UiEvaluationScenario payloads', () => {
    const good = listUiEvaluationScenarios()[0];
    expect(() =>
      decodeUiEvaluationScenario({ ...good, extra: true }),
    ).toThrow(/unknown UiEvaluationScenario field/);
    expect(() =>
      decodeUiEvaluationScenario({
        ...good,
        interface: 'UiEvaluationScenario@2',
      }),
    ).toThrow(/unsupported UiEvaluationScenario interface/);
    expect(() =>
      decodeUiEvaluationScenario({
        ...good,
        text_scale_percent: 10,
      }),
    ).toThrow(/text_scale_percent/);
  });

  it('factory exposes catalog operations without side effects', () => {
    const service = createDeterministicScenarioCatalog();
    const a = service.buildAgentSupervisorCatalog();
    const b = service.buildAgentSupervisorCatalog();
    expect(service.serialize(a)).toBe(service.serialize(b));
    expect(service.digest(a)).toBe(service.digest(b));
    expect(service.listScenarios(a)).toHaveLength(
      REQUIRED_SCENARIO_KINDS.length,
    );
  });

  it('scenario completeness table is exhaustive and ordered', () => {
    const catalog = buildAgentSupervisorScenarioCatalog();
    const table: CatalogScenarioEntry[] = [...catalog.scenarios];
    const kinds = table.map(e => e.kind);
    expect(kinds).toEqual([
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
  });
});
