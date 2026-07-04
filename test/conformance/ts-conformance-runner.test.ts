import {
  assertCorpusCoverage,
  loadConformanceVectors,
  runTsConformance,
} from './ts-conformance-runner.js';

describe('PORT-214 shared conformance vector corpus', () => {
  it('contains at least ten vectors per required subsystem', () => {
    const vectors = loadConformanceVectors();
    const counts = assertCorpusCoverage(vectors);

    expect(vectors).toHaveLength(80);
    expect(Object.values(counts).every(count => count >= 10)).toBe(true);
    expect(new Set(vectors.map(vector => vector.id)).size).toBe(vectors.length);
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

    for (const result of envelope.results) {
      expect(typeof result.vectorId).toBe('string');
      expect(typeof result.subsystem).toBe('string');
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
});
