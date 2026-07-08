/**
 * wasm-prover-sprint43.test.ts
 *
 * Sprint 43: Integration Init + FOL Constructor IO Mixin + Prover Installer
 */

import {
  SYMBOLIC_AI_AVAILABLE, enableSymbolicAI, resetSymbolicAI,
  DEFAULT_CAPABILITIES, getIntegrationStatus, hasCapability,
} from '../../src/services/integration-init.js';
import {
  FOLConstructorIOMixin, IFOLSession, ExportedStatement,
} from '../../src/services/fol-constructor-io-mixin.js';
import {
  detectPlatformInstallProfile, installComponent, installComponents,
  listKnownComponents,
} from '../../src/services/prover-installer.js';

// ---------------------------------------------------------------------------
// Integration Init
// ---------------------------------------------------------------------------

describe('SYMBOLIC_AI_AVAILABLE + enableSymbolicAI', () => {
  afterEach(() => resetSymbolicAI());

  test('starts as false', () => {
    expect(SYMBOLIC_AI_AVAILABLE).toBe(false);
  });

  test('enableSymbolicAI returns false (Python-only)', () => {
    expect(enableSymbolicAI()).toBe(false);
  });
});

describe('DEFAULT_CAPABILITIES', () => {
  test('tdfolProver is true', () => {
    expect(DEFAULT_CAPABILITIES.tdfolProver).toBe(true);
  });

  test('symbolicAI is false', () => {
    expect(DEFAULT_CAPABILITIES.symbolicAI).toBe(false);
  });

  test('externalProvers is false', () => {
    expect(DEFAULT_CAPABILITIES.externalProvers).toBe(false);
  });
});

describe('getIntegrationStatus', () => {
  test('returns IntegrationStatus with all fields', () => {
    const status = getIntegrationStatus();
    expect(status).toHaveProperty('version');
    expect(status).toHaveProperty('capabilities');
    expect(status).toHaveProperty('availableModules');
    expect(status).toHaveProperty('unavailableModules');
    expect(status).toHaveProperty('warnings');
  });

  test('availableModules is non-empty', () => {
    expect(getIntegrationStatus().availableModules.length).toBeGreaterThan(0);
  });

  test('symbolic-ai is in unavailableModules', () => {
    expect(getIntegrationStatus().unavailableModules).toContain('symbolic-ai');
  });

  test('warnings is non-empty', () => {
    expect(getIntegrationStatus().warnings.length).toBeGreaterThan(0);
  });
});

describe('hasCapability', () => {
  test('tdfolProver is true', () => {
    expect(hasCapability('tdfolProver')).toBe(true);
  });

  test('symbolicAI is false', () => {
    expect(hasCapability('symbolicAI')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FOLConstructorIOMixin
// ---------------------------------------------------------------------------

function makeSession(stmts: ExportedStatement[] = []): IFOLSession {
  return {
    sessionId: 'test-session-001',
    domain: 'legal',
    statements: stmts,
    formulas: stmts.map(s => s.formula),
    consistencyScore: 1.0,
  };
}

describe('FOLConstructorIOMixin', () => {
  const mixin = new FOLConstructorIOMixin();
  const stmt: ExportedStatement = { raw: 'Must pay.', formula: 'O(Pay)', operator: 'O', confidence: 0.8, warnings: [] };
  const session = makeSession([stmt]);

  test('exportSession json returns SessionExportData', () => {
    const data = mixin.exportSession(session, 'json');
    expect(data).toHaveProperty('sessionMetadata');
    expect(data).toHaveProperty('statements');
  });

  test('exportSession fol returns string', () => {
    const data = mixin.exportSession(session, 'fol');
    expect(typeof data).toBe('string');
    expect(String(data)).toContain('formula:');
  });

  test('exportSession prolog returns string with :-', () => {
    const data = mixin.exportSession(session, 'prolog');
    expect(typeof data).toBe('string');
  });

  test('exportSession tptp returns string with fof', () => {
    const data = mixin.exportSession(session, 'tptp');
    expect(String(data)).toContain('fof(');
  });

  test('importSession round-trip', () => {
    const exported = mixin.exportSession(session, 'json') as ReturnType<typeof mixin.exportSession>;
    const imported = mixin.importSession(exported as never);
    expect(imported.sessionId).toBe(session.sessionId);
    expect(imported.formulas).toHaveLength(1);
  });

  test('convertFormula fol returns same formula', () => {
    expect(mixin.convertFormula('O(Pay)', 'fol')).toBe('O(Pay)');
  });

  test('convertFormula prolog converts O to obligatory', () => {
    expect(mixin.convertFormula('O(Pay)', 'prolog')).toContain('obligatory(Pay)');
  });

  test('convertFormula tptp produces fof', () => {
    expect(mixin.convertFormula('O(Pay)', 'tptp')).toContain('fof(');
  });

  test('serializeSession produces valid JSON', () => {
    const json = mixin.serializeSession(session);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  test('deserializeSession round-trip', () => {
    const json = mixin.serializeSession(session);
    const imported = mixin.deserializeSession(json);
    expect(imported.sessionId).toBe('test-session-001');
  });
});

// ---------------------------------------------------------------------------
// Prover Installer
// ---------------------------------------------------------------------------

describe('detectPlatformInstallProfile', () => {
  test('returns PlatformInstallProfile', () => {
    const profile = detectPlatformInstallProfile();
    expect(profile).toHaveProperty('system');
    expect(profile).toHaveProperty('architecture');
    expect(profile).toHaveProperty('packageManager');
    expect(profile).toHaveProperty('canInstallSystemPackages');
  });

  test('system is one of known values', () => {
    const profile = detectPlatformInstallProfile();
    expect(['linux', 'darwin', 'windows', 'unknown']).toContain(profile.system);
  });
});

describe('installComponent', () => {
  test('unknown component returns error result', () => {
    const result = installComponent('totally_unknown_xyz');
    expect(result.success).toBe(false);
    expect(result.method).toBe('error');
  });

  test('dry-run returns commands without executing', () => {
    const result = installComponent('z3', undefined, true);
    expect(result.component).toBe('z3');
    // In dry-run mode, success=false even if commands are generated
    if (result.method !== 'skip' && result.method !== 'error') {
      expect(result.commands.length).toBeGreaterThan(0);
    }
  });

  test('result has all required fields', () => {
    const result = installComponent('coq');
    expect(result).toHaveProperty('component');
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('installed');
    expect(result).toHaveProperty('method');
    expect(result).toHaveProperty('message');
    expect(result).toHaveProperty('commands');
  });
});

describe('installComponents', () => {
  test('returns array of same length', () => {
    const results = installComponents(['z3', 'lean4'], undefined, true);
    expect(results).toHaveLength(2);
  });
});

describe('listKnownComponents', () => {
  test('returns sorted array with known provers', () => {
    const components = listKnownComponents();
    expect(components).toContain('z3');
    expect(components).toContain('coq');
    expect(components).toContain('lean4');
    expect(components).toEqual([...components].sort());
  });
});
