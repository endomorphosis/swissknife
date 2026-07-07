/**
 * wasm-prover-sprint92.test.ts
 * Tests for §12.20 F-logic ZKP integration and semantic normalizer closure.
 */

import {
  FLogicCircuitTranspiler,
  FLogicZKPIntegration,
  evaluateQuery,
  parseFLogicFacts,
  proveWithZkp,
  verifyFLogicZkpProof,
} from '../../src/services/integrations/flogic-zkp-integration';
import { Groth16BackendFallback } from '../../src/services/zkp/zkp-backends';
import {
  FLogicSemanticNormalizer,
  normalizeFLogic,
  parseNormalizedTriples,
} from '../../src/services/integrations/flogic-semantic-normalizer';

describe('PORT-190 FLogic ZKP integration', () => {
  it('parses frame and predicate F-logic facts', () => {
    const facts = parseFLogicFacts('Alice[role->Admin]. owns(Alice, Resource).');
    expect(facts).toEqual([
      { subject: 'alice', slot: 'role', value: 'admin' },
      { subject: 'alice', slot: 'owns', value: 'resource' },
    ]);
  });

  it('transpiles F-logic frames into circuit witness and public inputs', () => {
    const circuit = new FLogicCircuitTranspiler().transpile('Alice[role->Admin].', 'alice[role->admin]');
    expect(circuit.witness.satisfied).toBe(true);
    expect(circuit.publicInputs).toMatchObject({
      circuit_id: 'flogic_frame_query',
      circuit_version: 1,
    });
    expect(String(circuit.publicInputs.facts_commitment)).toHaveLength(64);
  });

  it('fails closed by default when no native Groth16 backend is configured', async () => {
    await expect(proveWithZkp('Alice[role->Admin].', 'alice[role->admin]')).rejects.toThrow(/allowSimulatedFallback:true/);
  });

  it('generates and verifies a ZKP result with explicit simulated backend injection', async () => {
    const backend = new Groth16BackendFallback();
    const result = await proveWithZkp('Alice[role->Admin].', 'alice[role->admin]', backend);
    expect(result.proved).toBe(true);
    expect(result.proofHash).toHaveLength(64);
    expect(result.publicInputs.proof_hash).toBe(result.proofHash);
    await expect(verifyFLogicZkpProof(result, backend)).resolves.toBe(true);
  });

  it('tracks proof and verification stats on the integration instance with explicit fallback backend', async () => {
    const integration = new FLogicZKPIntegration(new Groth16BackendFallback());
    const result = await integration.proveWithZkp('Alice[role->Admin].', 'alice[role->admin]');
    await integration.verifyProof(result);
    expect(integration.getStats()).toMatchObject({ proofsGenerated: 1, proofsVerified: 1, failures: 0 });
  });

  it('evaluates query satisfaction against normalized facts', () => {
    const facts = parseFLogicFacts('Alice[role->Admin].');
    expect(evaluateQuery(facts, 'alice[role->admin]')).toBe(true);
    expect(evaluateQuery(facts, 'alice[role->guest]')).toBe(false);
  });
});

describe('PORT-191 FLogic semantic normalizer', () => {
  it('normalizes aliases, predicate synonyms, case, and frame syntax', () => {
    const normalized = normalizeFLogic('Person owns(Alice, Resource).', { person: 'Agent' });
    expect(normalized).toBe('alice[has->resource,type->agent]');
  });

  it('sorts frame slots and parses normalized triples', () => {
    const normalizer = new FLogicSemanticNormalizer();
    const result = normalizer.normalize('Doc[ zeta -> B, alpha -> A ].');
    expect(result.normalized).toBe('doc[alpha->a,zeta->b]');
    expect(result.rulesApplied).toEqual(expect.arrayContaining(['lowercase-symbols', 'canonical-whitespace', 'slot-ordering']));
    expect(result.triples).toEqual([
      { subject: 'doc', predicate: 'alpha', object: 'a' },
      { subject: 'doc', predicate: 'zeta', object: 'b' },
    ]);
  });

  it('normalizes batches and exposes parser helper', () => {
    const normalizer = new FLogicSemanticNormalizer();
    const results = normalizer.normalizeBatch(['type(Alice, User).', 'Bob[role->Admin].']);
    expect(results.map(result => result.normalized)).toEqual(['alice[isa->user]', 'bob[role->admin]']);
    expect(parseNormalizedTriples(results[0]!.normalized)[0]).toMatchObject({ predicate: 'isa' });
  });
});
