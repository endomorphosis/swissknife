import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CECError,
  GrammarError,
  KnowledgeBaseError,
  LogicError,
  NamespaceError,
  ParsingError,
  ProvingError,
} from '../../src/services/logic-errors';
import {
  AuditLogger,
  resetAuditLogger,
} from '../../src/services/logic-audit-log';
import {
  ProveKitArtifactManifest,
  buildProveKitArtifactManifest,
  findProveKitKeyPair,
  loadProveKitArtifactManifest,
  saveProveKitArtifactManifest,
  sha256Directory,
  sha256File,
} from '../../src/services/zkp-provekit-artifacts';
import {
  buildProveKitIpfsPayload,
  buildProveKitProofCacheKey,
  buildProveKitProofCacheKeyFromProof,
  provekitIpfsPayloadIsPublicOnly,
} from '../../src/services/zkp-provekit-cache';
import {
  Groth16SetupArtifacts,
  storeGroth16SetupArtifactsInIpfs,
} from '../../src/services/zkp-provekit-setup-artifacts';

describe('PORT-225 CEC native exception taxonomy', () => {
  it('renders context and suggestions with the Python CECError format', () => {
    const error = new ParsingError('Invalid operator', {
      expression: 'O((p)',
      position: 4,
      expected: 'closing parenthesis',
      suggestion: "Add closing ')' at end",
    });

    expect(error).toBeInstanceOf(CECError);
    expect(error).toBeInstanceOf(LogicError);
    expect(error.toString()).toBe(
      "Invalid operator [Context: expression=O((p), position=4, expected=closing parenthesis] [Suggestion: Add closing ')' at end]",
    );
    expect(error.toDict()).toMatchObject({
      error_type: 'ParsingError',
      raw_message: 'Invalid operator',
      suggestion: "Add closing ')' at end",
      context: { expression: 'O((p)', position: 4, expected: 'closing parenthesis' },
    });
  });

  it('adds proving, namespace, grammar, and knowledge-base subclasses', () => {
    expect(new ProvingError('Rule failed', { formula: 'P -> Q', proofStep: 3, rule: 'mp' }))
      .toBeInstanceOf(CECError);
    expect(new NamespaceError('Symbol not found', { symbol: 'predicate_p', operation: 'lookup' }).toString())
      .toContain('symbol=predicate_p');
    expect(new GrammarError('Grammar failed', { rule: 'obligation_rule', inputText: 'must act' }).toString())
      .toContain('input_text=must act');
    expect(new KnowledgeBaseError('Formula exists', { operation: 'add', formulaId: 'f123' }).toString())
      .toContain('formula_id=f123');
  });
});

describe('PORT-231 logic audit log', () => {
  it('logs Python-shaped proof and security events to memory and JSONL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'logic-audit-'));
    const logPath = join(dir, 'audit.jsonl');
    const logger = new AuditLogger({
      logPath,
      clock: () => new Date('2026-07-01T00:00:00.000Z'),
    });

    try {
      const proofEvent = logger.logProofAttempt('user-1', 'P'.repeat(120), 'z3', false, 12.5, true, 'timeout');
      const securityEvent = logger.logSecurityEvent('user-1', 'validation_error', 'low', 'bad input', {
        validation_type: 'formula',
      });

      expect(proofEvent).toMatchObject({
        timestamp: '2026-07-01T00:00:00.000Z',
        event_type: 'proof_attempt',
        user_id: 'user-1',
        success: false,
        details: { prover: 'z3', duration_ms: 12.5, cached: true, error: 'timeout' },
      });
      expect(String(proofEvent.details?.formula)).toHaveLength(100);
      expect(securityEvent).toMatchObject({
        event_type: 'security.validation_error',
        success: false,
        details: { severity: 'low', message: 'bad input', validation_type: 'formula' },
      });

      const lines = readFileSync(logPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      expect(lines).toHaveLength(2);
      expect(logger.events).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exposes a resettable global audit logger', () => {
    const logger = resetAuditLogger({ clock: () => new Date('2026-07-01T00:00:01.000Z') });
    logger.logRateLimitExceeded('user-2', 10, 60);

    expect(logger.events[0]).toMatchObject({
      event_type: 'security.rate_limit_exceeded',
      details: { limit_calls: 10, limit_period: 60 },
    });
  });
});

describe('PORT-230 ProveKit artifact manifests, cache keys, and setup storage', () => {
  function makeFixture(): { dir: string; noirDir: string; pkp: string; pkv: string } {
    const dir = mkdtempSync(join(tmpdir(), 'provekit-artifacts-'));
    const noirDir = join(dir, 'noir');
    mkdirSync(join(noirDir, 'src'), { recursive: true });
    mkdirSync(join(noirDir, 'target'), { recursive: true });
    writeFileSync(join(noirDir, 'Nargo.toml'), '[package]\nname = "demo"\n');
    writeFileSync(join(noirDir, 'src', 'main.nr'), 'fn main() {}\n');
    writeFileSync(join(noirDir, 'target', 'ignored.txt'), 'generated');
    writeFileSync(join(noirDir, 'demo.pkp'), 'ignored key');
    const pkp = join(dir, 'provekit_knowledge_of_axioms.pkp');
    const pkv = join(dir, 'provekit_knowledge_of_axioms.pkv');
    writeFileSync(pkp, 'prover-key');
    writeFileSync(pkv, 'verifier-key');
    return { dir, noirDir, pkp, pkv };
  }

  it('hashes files/directories and round-trips artifact manifests', () => {
    const { dir, noirDir, pkp, pkv } = makeFixture();
    try {
      const before = sha256Directory(noirDir);
      writeFileSync(join(noirDir, 'target', 'ignored.txt'), 'changed generated output');
      writeFileSync(join(noirDir, 'demo.pkp'), 'changed ignored key');
      expect(sha256Directory(noirDir)).toBe(before);
      writeFileSync(join(noirDir, 'src', 'lib.nr'), 'pub fn helper() {}\n');
      expect(sha256Directory(noirDir)).not.toBe(before);

      const manifest = buildProveKitArtifactManifest({
        circuitId: 'provekit_knowledge_of_axioms',
        noirPackagePath: noirDir,
        proverKeyPath: pkp,
        verifierKeyPath: pkv,
        provekitBranch: 'main',
        provekitCommit: 'abc123',
        metadata: { fixture: true },
      });
      manifest.validateFiles();

      expect(manifest.toDict()).toMatchObject({
        schema_version: 'provekit-artifact-manifest-v1',
        circuit_ref: 'provekit_knowledge_of_axioms@v1',
        prover_key_sha256: sha256File(pkp),
        verifier_key_sha256: sha256File(pkv),
      });
      expect(manifest.toBackendArtifacts()).toMatchObject({
        provekit_artifacts: {
          program_dir: noirDir,
          verifier_key_path: pkv,
          manifest_schema_version: 'provekit-artifact-manifest-v1',
        },
      });

      const saved = saveProveKitArtifactManifest(manifest, join(dir, 'manifest.json'));
      const loaded = loadProveKitArtifactManifest(saved);
      expect(loaded.canonicalJson()).toBe(manifest.canonicalJson());
      expect(ProveKitArtifactManifest.fromDict(loaded.toDict()).manifestSha256()).toBe(manifest.manifestSha256());
      expect(findProveKitKeyPair(dir, { circuitId: 'provekit_knowledge_of_axioms' })?.toDict()).toEqual({
        prover_key_path: pkp,
        verifier_key_path: pkv,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builds deterministic cache keys and public-only IPFS payloads', () => {
    const verifierKeySha256 = 'a'.repeat(64);
    const publicInputs = {
      theorem: 'Q',
      circuit_ref: 'provekit_knowledge_of_axioms@v1',
      ruleset_id: 'TDFOL_v1',
    };
    const metadata = {
      backend: 'provekit',
      provekit: {
        provekit_commit: 'abc123',
        hash_backend: 'sha256',
        public_input_schema: 'provekit-public-inputs-v1',
        public_input_hash: 'b'.repeat(64),
        artifacts: {
          verifier_key_path: '/public/verifier.pkv',
          prover_key_path: '/private/prover.pkp',
        },
      },
      provekit_artifacts: {
        input_path: '/private/witness.toml',
      },
      attestation_view: { proof_ref: 'c'.repeat(64) },
    };

    const direct = buildProveKitProofCacheKey({
      backendId: 'provekit',
      circuitRef: 'provekit_knowledge_of_axioms@v1',
      hashBackend: 'sha256',
      verifierKeySha256,
      provekitCommit: 'abc123',
      rulesetId: 'TDFOL_v1',
    });
    expect(direct).toHaveLength(64);
    expect(buildProveKitProofCacheKeyFromProof(publicInputs, metadata, { verifierKeySha256 })).toBe(direct);

    const payload = buildProveKitIpfsPayload(publicInputs, metadata, Buffer.from('proof'), {
      verifierKeyRef: 'bafy-verifier',
      manifestSha256: 'd'.repeat(64),
    });

    expect(payload).toMatchObject({
      schema: 'provekit-ipfs-payload-v1',
      backend_id: 'provekit',
      proof_data_b64: 'cHJvb2Y=',
      proof_size_bytes: 5,
      manifest_sha256: 'd'.repeat(64),
      public_artifact_refs: {
        verifier_key_path: '/public/verifier.pkv',
        verifier_key_ref: 'bafy-verifier',
      },
    });
    expect(JSON.stringify(payload)).not.toContain('prover_key_path');
    expect(JSON.stringify(payload)).not.toContain('input_path');
    expect(provekitIpfsPayloadIsPublicOnly(payload)).toBe(true);
    expect(provekitIpfsPayloadIsPublicOnly({ public_artifact_refs: { input_path: '/private' } })).toBe(false);
  });

  it('stores Groth16 setup artifacts through an injected IPFS adapter', async () => {
    const { dir, pkp, pkv } = makeFixture();
    const calls: Array<{ path: string; pin?: boolean; backend?: string | null }> = [];
    try {
      const stored = await storeGroth16SetupArtifactsInIpfs(
        { proving_key_path: pkp, verifying_key_path: pkv },
        {
          pin: false,
          backend: 'memory',
          addPath: (path, options) => {
            calls.push({ path, pin: options?.pin, backend: options?.backend });
            return `cid:${path.split('/').pop()}`;
          },
        },
      );

      expect(stored).toMatchObject({
        proving_key_cid: 'cid:provekit_knowledge_of_axioms.pkp',
        verifying_key_cid: 'cid:provekit_knowledge_of_axioms.pkv',
      });
      expect(calls).toEqual([
        { path: pkp, pin: false, backend: 'memory' },
        { path: pkv, pin: false, backend: 'memory' },
      ]);
      expect(new Groth16SetupArtifacts('cid-pk', 'cid-vk').toDict()).toEqual({
        proving_key_cid: 'cid-pk',
        verifying_key_cid: 'cid-vk',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
