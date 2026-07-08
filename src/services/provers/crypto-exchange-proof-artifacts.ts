/**
 * Browser-safe verifier for crypto-exchange security proof artifacts.
 *
 * The artifact shape is produced by
 * `ipfs_datasets_py.logic.security_models.crypto_exchange`.
 */

export type CryptoExchangeRecord = Record<string, unknown>;

export type CryptoExchangeReviewStatus =
  | 'heuristic'
  | 'machine_extracted'
  | 'human_reviewed'
  | 'trusted_fixture';

export type CryptoExchangeProofStatus =
  | 'DISPROVED'
  | 'NOT_MODELED'
  | 'PROVED'
  | 'UNKNOWN';

export type CryptoExchangeProofRisk =
  | 'blocking'
  | 'high'
  | 'low'
  | 'medium';

export type CryptoExchangeProofReportCidPolicy = 'deterministic' | 'nondeterministic';
export type CryptoExchangeVerificationMode = 'schema_only' | 'proof_critical';

export interface CryptoExchangeEvidenceRef {
  kind: string;
  path: string;
  line_start?: number;
  line_end?: number;
  sha256?: string;
  review_status: CryptoExchangeReviewStatus;
  notes?: string;
}

export interface CryptoExchangeProofReport {
  schema_version: string;
  claim_id: string;
  claim_version: string;
  model_cid: string;
  model_schema_version: string;
  status: CryptoExchangeProofStatus;
  prover: string;
  solver_name: string;
  solver_version: string;
  solver_result: string;
  proof_or_trace_cid: string;
  assumptions: string[];
  compiler_cid: string;
  risk: CryptoExchangeProofRisk;
  timeout_ms?: number | null;
  reason_unknown?: string | null;
  assertion_count?: number | null;
  evidence_refs: CryptoExchangeEvidenceRef[];
  soundness_notes: string[];
  deterministic_payload_cid: string;
  nondeterministic_report_cid: string;
  generated_at: string;
  created_at?: string | null;
  counterexample?: CryptoExchangeRecord | null;
  signatures?: CryptoExchangeRecord[];
  unsat_core?: string[] | null;
}

export interface CryptoExchangeProofReceipt {
  schema_version: string;
  report_schema_version: string;
  claim_id: string;
  model_cid: string;
  proof_report_cid: string;
  accepted_assumptions: string[];
  verifier: string;
  verifier_version: string;
  valid: boolean;
  metadata: CryptoExchangeRecord;
}

export interface CryptoExchangeProofReceiptVerificationOptions {
  expectedModelCid?: string;
  expectedClaimId?: string;
  proofReportCidPolicy?: CryptoExchangeProofReportCidPolicy;
  allowedStatuses?: readonly CryptoExchangeProofStatus[];
  mode?: CryptoExchangeVerificationMode;
  allowAdditionalAcceptedAssumptions?: boolean;
}

export interface CryptoExchangeProofReceiptIssueOptions
  extends CryptoExchangeProofReceiptVerificationOptions {
  verifier: string;
  verifierVersion: string;
  acceptedAssumptions?: readonly string[];
  allowReportAssumptions?: boolean;
  metadata?: CryptoExchangeRecord;
}

export const CRYPTO_EXCHANGE_PROOF_REPORT_SCHEMA_VERSION = 'proof-report/v1' as const;
export const CRYPTO_EXCHANGE_PROOF_RECEIPT_SCHEMA_VERSION = 'proof-receipt/v1' as const;

export const CRYPTO_EXCHANGE_PROOF_STATUSES = [
  'DISPROVED',
  'NOT_MODELED',
  'PROVED',
  'UNKNOWN',
] as const satisfies readonly CryptoExchangeProofStatus[];

export const CRYPTO_EXCHANGE_PROOF_RISKS = [
  'blocking',
  'high',
  'low',
  'medium',
] as const satisfies readonly CryptoExchangeProofRisk[];

export const CRYPTO_EXCHANGE_REVIEW_STATUSES = [
  'heuristic',
  'machine_extracted',
  'human_reviewed',
  'trusted_fixture',
] as const satisfies readonly CryptoExchangeReviewStatus[];

export const CRYPTO_EXCHANGE_SECURITY_ARTIFACT_METADATA = {
  proofReportSchemaVersion: CRYPTO_EXCHANGE_PROOF_REPORT_SCHEMA_VERSION,
  proofReceiptSchemaVersion: CRYPTO_EXCHANGE_PROOF_RECEIPT_SCHEMA_VERSION,
  proofStatuses: CRYPTO_EXCHANGE_PROOF_STATUSES,
  proofRisks: CRYPTO_EXCHANGE_PROOF_RISKS,
  reviewStatuses: CRYPTO_EXCHANGE_REVIEW_STATUSES,
} as const;

export function validateCryptoExchangeProofReport(value: unknown): value is CryptoExchangeProofReport {
  if (!isRecord(value)) return false;
  return typeof value.schema_version === 'string'
    && typeof value.claim_id === 'string'
    && typeof value.claim_version === 'string'
    && typeof value.model_cid === 'string'
    && typeof value.model_schema_version === 'string'
    && typeof value.status === 'string'
    && typeof value.prover === 'string'
    && typeof value.solver_name === 'string'
    && typeof value.solver_version === 'string'
    && typeof value.solver_result === 'string'
    && typeof value.proof_or_trace_cid === 'string'
    && Array.isArray(value.assumptions)
    && typeof value.compiler_cid === 'string'
    && typeof value.risk === 'string'
    && Array.isArray(value.evidence_refs)
    && Array.isArray(value.soundness_notes)
    && typeof value.deterministic_payload_cid === 'string'
    && typeof value.nondeterministic_report_cid === 'string'
    && typeof value.generated_at === 'string';
}

export function validateCryptoExchangeProofReportStrict(value: unknown): value is CryptoExchangeProofReport {
  if (!validateCryptoExchangeProofReport(value)) return false;
  return value.schema_version === CRYPTO_EXCHANGE_PROOF_REPORT_SCHEMA_VERSION
    && isNonEmptyString(value.claim_id)
    && isNonEmptyString(value.claim_version)
    && isNonEmptyString(value.model_cid)
    && isNonEmptyString(value.model_schema_version)
    && isCryptoExchangeProofStatus(value.status)
    && isNonEmptyString(value.prover)
    && isNonEmptyString(value.solver_name)
    && isNonEmptyString(value.solver_result)
    && isNonEmptyString(value.proof_or_trace_cid)
    && isStringList(value.assumptions)
    && isNonEmptyString(value.compiler_cid)
    && isCryptoExchangeProofRisk(value.risk)
    && isOptionalNonNegativeInteger(value.timeout_ms)
    && isOptionalString(value.reason_unknown)
    && isOptionalNonNegativeInteger(value.assertion_count)
    && isCryptoExchangeEvidenceRefList(value.evidence_refs)
    && isStringList(value.soundness_notes, { allowEmptyItems: true })
    && isNonEmptyString(value.deterministic_payload_cid)
    && isNonEmptyString(value.nondeterministic_report_cid)
    && isNonEmptyString(value.generated_at)
    && isOptionalString(value.created_at)
    && isOptionalRecord(value.counterexample)
    && isOptionalRecordList(value.signatures)
    && isOptionalStringList(value.unsat_core);
}

export function validateCryptoExchangeProofReceipt(value: unknown): value is CryptoExchangeProofReceipt {
  if (!isRecord(value)) return false;
  return typeof value.schema_version === 'string'
    && typeof value.report_schema_version === 'string'
    && typeof value.claim_id === 'string'
    && typeof value.model_cid === 'string'
    && typeof value.proof_report_cid === 'string'
    && Array.isArray(value.accepted_assumptions)
    && typeof value.verifier === 'string'
    && typeof value.verifier_version === 'string'
    && typeof value.valid === 'boolean'
    && isRecord(value.metadata);
}

export function validateCryptoExchangeProofReceiptStrict(value: unknown): value is CryptoExchangeProofReceipt {
  if (!validateCryptoExchangeProofReceipt(value)) return false;
  return value.schema_version === CRYPTO_EXCHANGE_PROOF_RECEIPT_SCHEMA_VERSION
    && value.report_schema_version === CRYPTO_EXCHANGE_PROOF_REPORT_SCHEMA_VERSION
    && isNonEmptyString(value.claim_id)
    && isNonEmptyString(value.model_cid)
    && isNonEmptyString(value.proof_report_cid)
    && isStringList(value.accepted_assumptions, { requireNonEmptyList: true })
    && isNonEmptyString(value.verifier)
    && isNonEmptyString(value.verifier_version);
}

export function verifyCryptoExchangeProofStatus(
  report: CryptoExchangeProofReport,
  allowedStatuses: readonly CryptoExchangeProofStatus[] = ['PROVED'],
): boolean {
  return allowedStatuses.every(isCryptoExchangeProofStatus) && allowedStatuses.includes(report.status);
}

export function verifyCryptoExchangeExpectedModelAndClaim(
  receipt: CryptoExchangeProofReceipt,
  report: CryptoExchangeProofReport,
  options?: { expectedModelCid?: string; expectedClaimId?: string },
): boolean {
  if (options?.expectedModelCid && report.model_cid !== options.expectedModelCid) return false;
  if (options?.expectedClaimId && report.claim_id !== options.expectedClaimId) return false;
  return receipt.model_cid === report.model_cid && receipt.claim_id === report.claim_id;
}

export function verifyCryptoExchangeAcceptedAssumptions(
  receipt: CryptoExchangeProofReceipt,
  report: CryptoExchangeProofReport,
  options?: { allowAdditionalAcceptedAssumptions?: boolean },
): boolean {
  const accepted = new Set(receipt.accepted_assumptions);
  const reportAssumptions = new Set(report.assumptions);
  if (!report.assumptions.every(assumption => accepted.has(assumption))) return false;
  if (options?.allowAdditionalAcceptedAssumptions === true) return true;
  return receipt.accepted_assumptions.every(assumption => reportAssumptions.has(assumption));
}

export function verifyCryptoExchangeReportMatchesReceipt(
  receipt: CryptoExchangeProofReceipt,
  report: CryptoExchangeProofReport,
  proofReportCidPolicy: CryptoExchangeProofReportCidPolicy = 'nondeterministic',
): boolean {
  const expectedCid = proofReportCidPolicy === 'deterministic'
    ? report.deterministic_payload_cid
    : report.nondeterministic_report_cid;
  return receipt.claim_id === report.claim_id
    && receipt.model_cid === report.model_cid
    && receipt.report_schema_version === report.schema_version
    && receipt.proof_report_cid === expectedCid;
}

export function verifyCryptoExchangeProofReceiptSchemaOnly(
  receipt: unknown,
  report: unknown,
  options?: CryptoExchangeProofReceiptVerificationOptions,
): boolean {
  if (!validateCryptoExchangeProofReceiptStrict(receipt) || !validateCryptoExchangeProofReportStrict(report)) {
    return false;
  }
  if (receipt.valid !== true) return false;
  return verifyCryptoExchangeProofStatus(report, options?.allowedStatuses ?? ['PROVED'])
    && verifyCryptoExchangeExpectedModelAndClaim(receipt, report, options)
    && verifyCryptoExchangeReportMatchesReceipt(
      receipt,
      report,
      options?.proofReportCidPolicy ?? 'nondeterministic',
    )
    && verifyCryptoExchangeAcceptedAssumptions(receipt, report, {
      allowAdditionalAcceptedAssumptions: options?.allowAdditionalAcceptedAssumptions,
    });
}

export function verifyCryptoExchangeProofReceiptProofCritical(
  receipt: unknown,
  report: unknown,
  _options?: CryptoExchangeProofReceiptVerificationOptions & { requireTrustedSignature?: boolean },
): boolean {
  if (!validateCryptoExchangeProofReceiptStrict(receipt) || !validateCryptoExchangeProofReportStrict(report)) {
    return false;
  }
  // Fail closed until SwissKnife can recompute Python canonical artifact CIDs
  // byte-for-byte or verify a trusted signature over the report payload.
  return false;
}

export function verifyCryptoExchangeProofReceipt(
  receipt: unknown,
  report: unknown,
  options?: CryptoExchangeProofReceiptVerificationOptions,
): boolean {
  return (options?.mode ?? 'schema_only') === 'proof_critical'
    ? verifyCryptoExchangeProofReceiptProofCritical(receipt, report, options)
    : verifyCryptoExchangeProofReceiptSchemaOnly(receipt, report, options);
}

export function verifyCryptoExchangeProofReceiptAssumptions(
  receipt: CryptoExchangeProofReceipt,
  report: CryptoExchangeProofReport,
): boolean {
  return verifyCryptoExchangeAcceptedAssumptions(receipt, report);
}

export function createCryptoExchangeProofReceiptFromReport(
  report: unknown,
  options: CryptoExchangeProofReceiptIssueOptions,
): CryptoExchangeProofReceipt | null {
  if (!validateCryptoExchangeProofReportStrict(report)) return null;
  if (!isNonEmptyString(options.verifier) || !isNonEmptyString(options.verifierVersion)) return null;
  if ((options.mode ?? 'schema_only') === 'proof_critical') return null;

  const acceptedAssumptions = options.acceptedAssumptions
    ? [...options.acceptedAssumptions]
    : options.allowReportAssumptions === true
      ? [...report.assumptions]
      : null;
  if (!isStringList(acceptedAssumptions, { requireNonEmptyList: true })) return null;

  const metadata: CryptoExchangeRecord = { ...(options.metadata ?? {}) };
  if (!options.acceptedAssumptions && options.allowReportAssumptions === true) {
    metadata.unsafe_assumption_source = 'report';
  }

  const proofReportCidPolicy = options.proofReportCidPolicy ?? 'nondeterministic';
  const receipt: CryptoExchangeProofReceipt = {
    schema_version: CRYPTO_EXCHANGE_PROOF_RECEIPT_SCHEMA_VERSION,
    report_schema_version: report.schema_version,
    claim_id: report.claim_id,
    model_cid: report.model_cid,
    proof_report_cid: proofReportCidPolicy === 'deterministic'
      ? report.deterministic_payload_cid
      : report.nondeterministic_report_cid,
    accepted_assumptions: acceptedAssumptions,
    verifier: options.verifier,
    verifier_version: options.verifierVersion,
    valid: true,
    metadata,
  };

  return verifyCryptoExchangeProofReceiptSchemaOnly(receipt, report, {
    ...options,
    proofReportCidPolicy,
  })
    ? receipt
    : null;
}

function isRecord(value: unknown): value is CryptoExchangeRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isOptionalRecord(value: unknown): boolean {
  return value === undefined || value === null || isRecord(value);
}

function isOptionalRecordList(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isRecord));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function isStringList(
  value: unknown,
  options?: { requireNonEmptyList?: boolean; allowEmptyItems?: boolean },
): value is string[] {
  if (!Array.isArray(value)) return false;
  if (options?.requireNonEmptyList === true && value.length === 0) return false;
  if (options?.allowEmptyItems === true) return value.every(item => typeof item === 'string');
  return value.every(isNonEmptyString);
}

function isOptionalStringList(value: unknown): boolean {
  return value === undefined || value === null || isStringList(value);
}

function isOptionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined
    || value === null
    || (typeof value === 'number' && Number.isInteger(value) && value >= 0);
}

function isCryptoExchangeProofStatus(value: unknown): value is CryptoExchangeProofStatus {
  return typeof value === 'string'
    && (CRYPTO_EXCHANGE_PROOF_STATUSES as readonly string[]).includes(value);
}

function isCryptoExchangeProofRisk(value: unknown): value is CryptoExchangeProofRisk {
  return typeof value === 'string'
    && (CRYPTO_EXCHANGE_PROOF_RISKS as readonly string[]).includes(value);
}

function isCryptoExchangeReviewStatus(value: unknown): value is CryptoExchangeReviewStatus {
  return typeof value === 'string'
    && (CRYPTO_EXCHANGE_REVIEW_STATUSES as readonly string[]).includes(value);
}

function isCryptoExchangeEvidenceRefList(value: unknown): value is CryptoExchangeEvidenceRef[] {
  return Array.isArray(value) && value.every(item => {
    if (!isRecord(item)) return false;
    return isNonEmptyString(item.kind)
      && isNonEmptyString(item.path)
      && isOptionalNonNegativeInteger(item.line_start)
      && isOptionalNonNegativeInteger(item.line_end)
      && isOptionalString(item.sha256)
      && isCryptoExchangeReviewStatus(item.review_status)
      && isOptionalString(item.notes);
  });
}
