import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CacheConfig,
  LoggingConfig,
  LogicConfig,
  MonitoringConfig,
  ProverConfig,
  SecurityConfig,
  loadConfig,
} from '../../src/services/logic-config';
import {
  BridgeError,
  ConfigurationError,
  LogicError,
  ModalError,
  TemporalError,
} from '../../src/services/logic-errors';
import { TDFOLError } from '../../src/services/tdfol-exceptions';
import { DCECHandledError } from '../../src/services/dcec-error-handling';
import {
  ProofStatement,
  Statement,
  Witness,
  formatCircuitRef,
  parseCircuitRef,
  parseCircuitRefLenient,
} from '../../src/services/zkp-statement';
import {
  DEFAULT_PROVEKIT_CIRCUIT_ID,
  PROVEKIT_PUBLIC_INPUT_SCHEMA_VERSION,
  ProveKitPublicInputRecord,
  buildProveKitPublicInputRecord,
  fieldElementFromHexDigest,
  fieldElementFromText,
} from '../../src/services/zkp-provekit-public-inputs';

describe('PORT-220 logic config', () => {
  it('mirrors Python config dataclasses and toDict shape', () => {
    const config = new LogicConfig({
      provers: { z3: new ProverConfig({ enabled: true, timeout: 7, maxMemoryMb: 4096 }) },
      cache: new CacheConfig({ backend: 'redis', redisUrl: 'redis://localhost:6379/0' }),
      security: new SecurityConfig({ rateLimitCalls: 12, enableAuditLog: false }),
      monitoring: new MonitoringConfig({ enabled: true, port: 9191, logLevel: 'DEBUG' }),
    });

    expect(config.provers.z3?.timeout).toBe(7);
    expect(config.toDict()).toMatchObject({
      provers: { z3: { enabled: true, timeout: 7, max_memory_mb: 4096 } },
      cache: { backend: 'redis', redis_url: 'redis://localhost:6379/0' },
      security: { rate_limit_calls: 12, enable_audit_log: false },
      monitoring: { port: 9191, log_level: 'DEBUG' },
    });
    expect(new LoggingConfig({ logLevel: 'WARN' }).toDict()).toEqual({ log_level: 'WARN' });
  });

  it('loads file config and lets environment values take precedence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'logic-config-'));
    const configPath = join(dir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      provers: { z3: { enabled: false, timeout: 99 } },
      cache: { backend: 'memory', ttl: 10 },
      monitoring: { port: 9000, log_level: 'WARN' },
    }));

    try {
      const config = loadConfig({
        path: configPath,
        env: {
          Z3_ENABLED: 'true',
          Z3_TIMEOUT: '4.5',
          CACHE_BACKEND: 'redis',
          LOG_LEVEL: 'ERROR',
        },
      });

      expect(config.provers.z3?.enabled).toBe(true);
      expect(config.provers.z3?.timeout).toBe(4.5);
      expect(config.cache.backend).toBe('redis');
      expect(config.cache.ttl).toBe(10);
      expect(config.monitoring.logLevel).toBe('ERROR');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('PORT-221 logic errors', () => {
  it('provides a unified LogicError base and context formatting', () => {
    const error = new BridgeError('bridge failed', { prover: 'z3' });

    expect(error).toBeInstanceOf(LogicError);
    expect(error.toString()).toContain('prover=z3');
    expect(new ConfigurationError('bad config')).toBeInstanceOf(LogicError);
    expect(new ModalError('modal failed')).toBeInstanceOf(LogicError);
    expect(new TemporalError('temporal failed')).toBeInstanceOf(LogicError);
  });

  it('re-parents existing scoped errors under LogicError', () => {
    expect(new TDFOLError('parse failed')).toBeInstanceOf(LogicError);
    expect(new DCECHandledError('validation failed')).toBeInstanceOf(LogicError);
  });
});

describe('PORT-222 zkp statement remainder', () => {
  const digestA = 'a'.repeat(64);
  const digestB = 'b'.repeat(64);

  it('parses and formats strict circuit references', () => {
    expect(parseCircuitRef('knowledge_of_axioms@v2')).toEqual({ circuitId: 'knowledge_of_axioms', version: 2 });
    expect(parseCircuitRefLenient('legacy', 3)).toEqual({ circuitId: 'legacy', version: 3 });
    expect(formatCircuitRef('knowledge_of_axioms', 2)).toBe('knowledge_of_axioms@v2');
    expect(() => parseCircuitRef('bad')).toThrow(/circuit_id@v/);
  });

  it('round-trips Statement, Witness, and ProofStatement dictionaries', () => {
    const statement = new Statement({
      theoremHash: digestA,
      axiomsCommitment: digestB,
      circuitVersion: 2,
      rulesetId: 'TDFOL_v1',
    });
    const witness = new Witness({ axioms: ['P', 'P -> Q'], theorem: 'Q' });
    const proofStatement = new ProofStatement({
      statement,
      circuitId: 'knowledge_of_axioms',
      proofType: 'groth16',
      witnessCount: witness.axioms.length,
    });

    expect(statement.toFieldElements()).toHaveLength(4);
    expect(Witness.fromDict(witness.toDict()).intermediateSteps).toEqual([]);
    expect(proofStatement.toDict()).toMatchObject({
      circuit_id: 'knowledge_of_axioms',
      circuit_ref: 'knowledge_of_axioms@v2',
      proof_type: 'groth16',
      witness_count: 2,
    });
    expect(ProofStatement.fromDict(proofStatement.toDict()).statement.rulesetId).toBe('TDFOL_v1');
  });
});

describe('PORT-223 ProveKit public inputs', () => {
  it('maps hashes and text to BN254 field elements deterministically', () => {
    const digest = '0'.repeat(63) + 'f';

    expect(fieldElementFromHexDigest(digest)).toBe('15');
    expect(fieldElementFromText('TDFOL_v1')).toMatch(/^\d+$/);
    expect(() => fieldElementFromHexDigest('ABC')).toThrow(/32-byte/);
  });

  it('builds canonical ProveKit records from theorem and axiom data', () => {
    const record = buildProveKitPublicInputRecord({
      theorem: '  Q  ',
      privateAxioms: ['P -> Q', 'P', 'P'],
      metadata: { compiler_guidance_ref: 'c'.repeat(64) },
    });

    expect(record.circuitRef).toBe(`${DEFAULT_PROVEKIT_CIRCUIT_ID}@v1`);
    expect(record.theoremHash).toHaveLength(64);
    expect(record.axiomsCommitment).toHaveLength(64);
    expect(record.toProvekitInputs()).toMatchObject({
      schema_version: PROVEKIT_PUBLIC_INPUT_SCHEMA_VERSION,
      zkp_public_inputs: { theorem: '  Q  ', circuit_version: 1, ruleset_id: 'TDFOL_v1' },
    });
    expect(record.canonicalHash()).toHaveLength(64);
  });

  it('round-trips existing public inputs and attaches proof attestations', () => {
    const base = buildProveKitPublicInputRecord({
      theorem: 'Q',
      privateAxioms: ['P', 'P -> Q'],
    });
    const roundTrip = ProveKitPublicInputRecord.fromZkpPublicInputs(base.toZkpPublicInputs());
    const attested = roundTrip.withAttestation({ proofData: 'proof-bytes' });

    expect(roundTrip.canonicalJson()).toBe(base.canonicalJson());
    expect(attested.attestationRef).toHaveLength(64);
    expect(attested.toZkpPublicInputs()).toHaveProperty('attestation_ref');
  });
});
