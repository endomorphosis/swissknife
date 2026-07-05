import {
  assertCorpusCoverage,
  assertPort235NativeCoverage,
  loadConformanceVectors,
  runTsConformance,
} from './ts-conformance-runner.js';

function proofMeta(result: { metadata?: Record<string, unknown> }): any {
  const value = result.metadata?.proofMeta;
  return value && typeof value === 'object' ? value : {};
}

describe('PORT-214 shared conformance vector corpus', () => {
  it('contains at least ten vectors per required subsystem', () => {
    const vectors = loadConformanceVectors();
    const counts = assertCorpusCoverage(vectors);

    expect(vectors.length).toBeGreaterThanOrEqual(80);
    expect(Object.values(counts).every(count => count >= 10)).toBe(true);
    expect(new Set(vectors.map(vector => vector.id)).size).toBe(vectors.length);
  });

  it('retains mixed native input-type coverage for PORT-235 slices', () => {
    const vectors = loadConformanceVectors();
    const port235Coverage = assertPort235NativeCoverage(vectors);
    const byInputType = vectors.reduce<Record<string, number>>((acc, vector) => {
      acc[vector.inputType] = (acc[vector.inputType] ?? 0) + 1;
      return acc;
    }, {});

    expect(byInputType.policy ?? 0).toBeGreaterThanOrEqual(80);

    for (const inputType of [
      'dcec',
      'legalNorm',
      'zkpWitness',
      'folFormula',
      'temporalTrace',
      'modalKripke',
      'deonticConflict',
    ]) {
      expect(byInputType[inputType] ?? 0).toBeGreaterThanOrEqual(25);
      expect(port235Coverage[inputType] ?? 0).toBeGreaterThanOrEqual(25);
    }

    expect(byInputType.smt2 ?? 0).toBeGreaterThanOrEqual(4);
    expect(byInputType.tdfol ?? 0).toBeGreaterThanOrEqual(4);
    expect(byInputType.zkpStatement ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('uses strict single acceptable reason for decided native non-policy vectors', () => {
    const vectors = loadConformanceVectors();
    const nativeInputTypes = new Set([
      'smt2',
      'tdfol',
      'dcec',
      'legalNorm',
      'zkpStatement',
      'zkpWitness',
      'folFormula',
      'temporalTrace',
      'modalKripke',
      'deonticConflict',
    ]);

    const decidedNative = vectors.filter(vector =>
      nativeInputTypes.has(vector.inputType)
      && vector.expected.decided === true,
    );

    expect(decidedNative.length).toBeGreaterThan(0);
    for (const vector of decidedNative) {
      expect(vector.expected.acceptableReasons).toHaveLength(1);
      expect(vector.expected.acceptableReasons[0]).toBe(vector.expected.status);
    }
  });
});

describe('PORT-216 TypeScript conformance runner', () => {
  it('runs the shared corpus and emits schema-compatible results', async () => {
    const vectors = loadConformanceVectors();
    const byId = new Map(vectors.map(vector => [vector.id, vector]));
    const envelope = await runTsConformance({ mockZ3: true });

    expect(envelope.runner).toBe('typescript-swissknife');
    expect(envelope.results).toHaveLength(vectors.length);
    expect(envelope.engineVersions.z3Mode).toBe('deterministic-simulated');

    const mismatches = envelope.results.filter(result => {
      const vector = byId.get(result.vectorId);
      return !vector || !vector.expected.acceptableReasons.includes(result.status);
    });
    expect(mismatches).toEqual([]);

    const unsupported = envelope.results.filter(result => {
      const skipped = proofMeta(result).skipped;
      return skipped === 'unsupported-vector-input';
    });
    expect(unsupported).toEqual([]);

    for (const result of envelope.results) {
      expect(typeof result.vectorId).toBe('string');
      expect(typeof result.subsystem).toBe('string');
      expect(typeof result.inputType).toBe('string');
      expect(typeof result.status).toBe('string');
      expect(['real', 'simulated', 'host-dependent']).toContain(result.backendMode);
      expect(typeof result.proverId).toBe('string');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('tags ZKP vectors as simulated until native cryptographic backends are provisioned', async () => {
    const envelope = await runTsConformance({ mockZ3: true, subsystems: ['zkp-statement'], limit: 2 });
    expect(envelope.results).toHaveLength(2);
    expect(envelope.results.every(result => result.backendMode === 'simulated')).toBe(true);
  });

  it('records native-attempt metadata for legalNorm and zkpStatement native-fallback paths', async () => {
    const vectors = loadConformanceVectors();
    const legalNormIds = new Set(
      vectors
        .filter(vector => vector.inputType === 'legalNorm')
        .map(vector => vector.id),
    );
    const zkpStatementIds = new Set(
      vectors
        .filter(vector => vector.inputType === 'zkpStatement')
        .map(vector => vector.id),
    );

    const envelope = await runTsConformance({
      mockZ3: true,
      subsystems: ['legal-norm', 'zkp-statement'],
    });

    const legalNormNativeAttempted = envelope.results.filter(result =>
      legalNormIds.has(result.vectorId) && proofMeta(result).nativeAttempted === true,
    );
    expect(legalNormNativeAttempted.length).toBeGreaterThan(0);

    const zkpNativeAttempted = envelope.results.filter(result =>
      zkpStatementIds.has(result.vectorId) && proofMeta(result).nativeAttempted === true,
    );
    expect(zkpNativeAttempted.length).toBeGreaterThan(0);

    const zkpAttemptKinds = zkpNativeAttempted
      .map(result => String(proofMeta(result).nativeAttemptKind ?? '').trim())
      .filter(Boolean);
    expect(zkpAttemptKinds.length).toBeGreaterThan(0);
  });

  it('supports strict self-containment mode with real/conclusive outputs', async () => {
    const envelope = await runTsConformance({
      strictSelfContainment: true,
      subsystems: ['propositional', 'fol'],
      limit: 20,
    });
    expect(envelope.engineVersions.z3Mode).toBe('live-strict-self-contained');
    expect(envelope.results.every(result => result.backendMode === 'real')).toBe(true);
    expect(envelope.results.every(result => ['proved', 'refuted', 'sat'].includes(result.status))).toBe(true);
    const satRows = envelope.results.filter(result => result.vectorId.includes('-sat-'));
    expect(satRows.length).toBeGreaterThan(0);
    expect(satRows.every(result => result.status === 'sat')).toBe(true);
  });
});
