import {
  createCryptoExchangeProofReceiptFromReport,
  validateCryptoExchangeProofReceiptStrict,
  validateCryptoExchangeProofReportStrict,
  verifyCryptoExchangeProofReceipt,
  verifyCryptoExchangeProofReceiptProofCritical,
  verifyCryptoExchangeProofReceiptSchemaOnly,
  type CryptoExchangeProofReceipt,
  type CryptoExchangeProofReport,
  type CryptoExchangeProofStatus,
} from '../../src/services/provers/crypto-exchange-proof-artifacts';

const BASE_REPORT: CryptoExchangeProofReport = {
  assertion_count: null,
  assumptions: ['A4'],
  claim_id: 'claim:test',
  claim_version: '1.0',
  compiler_cid: 'cid:compiler',
  counterexample: null,
  created_at: '2026-07-05T00:00:00+00:00',
  deterministic_payload_cid: 'bafkreigahdcl36opaxgalmc6cfklnpuchqbdphvtngoi6d4c7zyfsydchu',
  evidence_refs: [
    {
      kind: 'test_fixture',
      line_end: 20,
      line_start: 1,
      path: 'ipfs_datasets_py/logic/security_models/crypto_exchange/ir/examples.py',
      review_status: 'trusted_fixture',
    },
  ],
  generated_at: '2026-07-05T00:00:00+00:00',
  model_cid: 'bafkreihwg5gmkqycnq73geeudvfscbjssaaudj4n4bgvgj6t6fp3gmnbhi',
  model_schema_version: 'security-model-ir/v1',
  nondeterministic_report_cid: 'bafkreic3qpaxqmlltvnt3dt7nxb5ivignqaltuk3yoapq66lliobbcop6q',
  proof_or_trace_cid: 'cid:proof',
  prover: 'z3',
  reason_unknown: null,
  risk: 'blocking',
  schema_version: 'proof-report/v1',
  signatures: [],
  solver_name: 'z3',
  solver_result: 'unsat',
  solver_version: '4.16.0',
  soundness_notes: [],
  status: 'PROVED',
  timeout_ms: null,
  unsat_core: null,
};

function proofReport(overrides: Partial<CryptoExchangeProofReport> = {}): CryptoExchangeProofReport {
  return {
    ...BASE_REPORT,
    assumptions: [...(overrides.assumptions ?? BASE_REPORT.assumptions)],
    evidence_refs: [...(overrides.evidence_refs ?? BASE_REPORT.evidence_refs)],
    signatures: [...(overrides.signatures ?? BASE_REPORT.signatures ?? [])],
    soundness_notes: [...(overrides.soundness_notes ?? BASE_REPORT.soundness_notes)],
    ...overrides,
  };
}

function proofReceipt(
  report: CryptoExchangeProofReport,
  overrides: Partial<CryptoExchangeProofReceipt> = {},
): CryptoExchangeProofReceipt {
  return {
    schema_version: 'proof-receipt/v1',
    report_schema_version: report.schema_version,
    claim_id: report.claim_id,
    model_cid: report.model_cid,
    proof_report_cid: report.nondeterministic_report_cid,
    accepted_assumptions: [...report.assumptions],
    verifier: 'swissknife-ts-wasm',
    verifier_version: '0.1.0',
    valid: true,
    metadata: {},
    ...overrides,
  };
}

describe('crypto-exchange security proof artifacts', () => {
  it('accepts a valid schema-only proof receipt for a proved report', () => {
    const report = proofReport();
    const receipt = proofReceipt(report);

    expect(validateCryptoExchangeProofReportStrict(report)).toBe(true);
    expect(validateCryptoExchangeProofReceiptStrict(receipt)).toBe(true);
    expect(verifyCryptoExchangeProofReceiptSchemaOnly(receipt, report)).toBe(true);
    expect(verifyCryptoExchangeProofReceipt(receipt, report, {
      expectedClaimId: report.claim_id,
      expectedModelCid: report.model_cid,
    })).toBe(true);
  });

  it.each(['UNKNOWN', 'DISPROVED', 'NOT_MODELED'] as CryptoExchangeProofStatus[])(
    'rejects %s reports by default',
    status => {
      const report = proofReport({
        status,
        solver_result: status === 'DISPROVED' ? 'sat' : 'unknown',
      });
      expect(verifyCryptoExchangeProofReceipt(proofReceipt(report), report)).toBe(false);
    },
  );

  it('rejects missing, unexpected, and mismatched receipt bindings', () => {
    const report = proofReport({ assumptions: ['A4', 'A5'] });

    expect(verifyCryptoExchangeProofReceipt(
      proofReceipt(report, { accepted_assumptions: ['A4'] }),
      report,
    )).toBe(false);
    expect(verifyCryptoExchangeProofReceipt(
      proofReceipt(report, { accepted_assumptions: ['A4', 'A5', 'A999'] }),
      report,
    )).toBe(false);
    expect(verifyCryptoExchangeProofReceipt(
      proofReceipt(report, { accepted_assumptions: ['A4', 'A5', 'A999'] }),
      report,
      { allowAdditionalAcceptedAssumptions: true },
    )).toBe(true);
    expect(verifyCryptoExchangeProofReceipt(
      proofReceipt(report, { model_cid: 'bafkreiwrong' }),
      report,
    )).toBe(false);
    expect(verifyCryptoExchangeProofReceipt(
      proofReceipt(report, { claim_id: 'claim:wrong' }),
      report,
    )).toBe(false);
    expect(verifyCryptoExchangeProofReceipt(
      proofReceipt(report, { proof_report_cid: 'bafkreiwrong' }),
      report,
    )).toBe(false);
  });

  it('supports deterministic report CID receipts only when explicitly requested', () => {
    const report = proofReport();
    const deterministicReceipt = proofReceipt(report, {
      proof_report_cid: report.deterministic_payload_cid,
    });

    expect(verifyCryptoExchangeProofReceipt(deterministicReceipt, report)).toBe(false);
    expect(verifyCryptoExchangeProofReceipt(deterministicReceipt, report, {
      proofReportCidPolicy: 'deterministic',
    })).toBe(true);
  });

  it('fails closed for proof-critical verification until CID/signature checking is implemented', () => {
    const report = proofReport();
    const receipt = proofReceipt(report);

    expect(verifyCryptoExchangeProofReceiptProofCritical(receipt, report)).toBe(false);
    expect(verifyCryptoExchangeProofReceipt(receipt, report, { mode: 'proof_critical' })).toBe(false);
  });

  it('issues schema-only receipts with explicit assumptions and rejects unsafe defaults', () => {
    const report = proofReport();

    expect(createCryptoExchangeProofReceiptFromReport(report, {
      verifier: 'swissknife-ts-wasm',
      verifierVersion: '0.1.0',
    })).toBeNull();

    const receipt = createCryptoExchangeProofReceiptFromReport(report, {
      verifier: 'swissknife-ts-wasm',
      verifierVersion: '0.1.0',
      acceptedAssumptions: ['A4'],
      expectedModelCid: report.model_cid,
      expectedClaimId: report.claim_id,
    });
    expect(receipt).toMatchObject({
      claim_id: report.claim_id,
      model_cid: report.model_cid,
      proof_report_cid: report.nondeterministic_report_cid,
      accepted_assumptions: ['A4'],
      valid: true,
    });

    const unsafeFixtureReceipt = createCryptoExchangeProofReceiptFromReport(report, {
      verifier: 'swissknife-ts-wasm',
      verifierVersion: '0.1.0',
      allowReportAssumptions: true,
    });
    expect(unsafeFixtureReceipt?.metadata).toMatchObject({ unsafe_assumption_source: 'report' });

    expect(createCryptoExchangeProofReceiptFromReport(report, {
      verifier: 'swissknife-ts-wasm',
      verifierVersion: '0.1.0',
      acceptedAssumptions: ['A4'],
      mode: 'proof_critical',
    })).toBeNull();
  });

  it('exports through the browser prover barrel', async () => {
    const browserProvers = await import('../../src/services/provers/browser');

    expect(typeof browserProvers.verifyCryptoExchangeProofReceipt).toBe('function');
    expect(typeof browserProvers.createCryptoExchangeProofReceiptFromReport).toBe('function');
  });
});
