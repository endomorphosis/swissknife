/**
 * ZKP statement and witness format.
 *
 * TypeScript port of ipfs_datasets_py/logic/zkp/statement.py.
 */

import { createHash } from 'node:crypto';

const U64_MAX = (1n << 64n) - 1n;
const P_BN254 = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export interface ParsedCircuitRef {
  circuitId: string;
  version: number;
}

export interface StatementInput {
  theoremHash: string;
  axiomsCommitment: string;
  circuitVersion: number;
  rulesetId: string;
}

export interface WitnessInput {
  axioms: string[];
  theorem?: string | null;
  intermediateSteps?: string[];
  axiomsCommitmentHex?: string | null;
  circuitVersion?: number;
  rulesetId?: string;
}

export interface ProofStatementInput {
  statement: Statement | StatementInput;
  circuitId: string;
  proofType?: string;
  witnessCount?: number;
}

export function parseCircuitRef(circuitRef: string): ParsedCircuitRef {
  if (typeof circuitRef !== 'string') throw new TypeError('circuit_ref must be a string');
  if (circuitRef === '') throw new Error('circuit_ref cannot be empty');
  const marker = '@v';
  const index = circuitRef.indexOf(marker);
  if (index < 0) throw new Error('circuit_ref must be of the form circuit_id@v<uint64>');

  const circuitId = circuitRef.slice(0, index);
  const versionPart = circuitRef.slice(index + marker.length);
  if (circuitId === '') throw new Error('circuit_id cannot be empty');
  if (circuitId.includes('@')) throw new Error("circuit_id must not contain '@'");
  if (versionPart === '') throw new Error('circuit_ref version is missing');
  if (!/^\d+$/.test(versionPart)) throw new Error('circuit_ref version must be an unsigned base-10 integer');

  const versionBig = BigInt(versionPart);
  if (versionBig > U64_MAX) throw new Error('circuit_ref version must be in uint64 range');
  return { circuitId, version: Number(versionBig) };
}

export function parseCircuitRefLenient(circuitRef: string, legacyDefaultVersion = 1): ParsedCircuitRef {
  if (typeof circuitRef !== 'string') throw new TypeError('circuit_ref must be a string');
  if (circuitRef === '') throw new Error('circuit_ref cannot be empty');
  if (circuitRef.includes('@v')) return parseCircuitRef(circuitRef);
  if (circuitRef.includes('@')) throw new Error('legacy circuit_id must not contain @');
  validateUint64Number('legacy_default_version', legacyDefaultVersion);
  return { circuitId: circuitRef, version: legacyDefaultVersion };
}

export function formatCircuitRef(circuitId: string, version: number): string {
  if (typeof circuitId !== 'string') throw new TypeError('circuit_id must be a string');
  if (circuitId === '') throw new Error('circuit_id cannot be empty');
  if (circuitId.includes('@')) throw new Error("circuit_id must not contain '@'");
  validateUint64Number('version', version);
  return `${circuitId}@v${version}`;
}

export const parse_circuit_ref = parseCircuitRef;
export const parse_circuit_ref_lenient = parseCircuitRefLenient;
export const format_circuit_ref = formatCircuitRef;

export class Statement {
  readonly theoremHash: string;
  readonly axiomsCommitment: string;
  readonly circuitVersion: number;
  readonly rulesetId: string;

  constructor(input: StatementInput) {
    this.theoremHash = input.theoremHash;
    this.axiomsCommitment = input.axiomsCommitment;
    this.circuitVersion = input.circuitVersion;
    this.rulesetId = input.rulesetId;
  }

  toDict(): Record<string, unknown> {
    return {
      theorem_hash: this.theoremHash,
      axioms_commitment: this.axiomsCommitment,
      circuit_version: this.circuitVersion,
      ruleset_id: this.rulesetId,
    };
  }

  static fromDict(data: Record<string, unknown>): Statement {
    return new Statement({
      theoremHash: String(data.theorem_hash ?? data.theoremHash ?? ''),
      axiomsCommitment: String(data.axioms_commitment ?? data.axiomsCommitment ?? ''),
      circuitVersion: Number(data.circuit_version ?? data.circuitVersion ?? 0),
      rulesetId: String(data.ruleset_id ?? data.rulesetId ?? ''),
    });
  }

  toFieldElements(): string[] {
    return [
      hexToField(this.theoremHash),
      hexToField(this.axiomsCommitment),
      String(this.circuitVersion),
      textToField(this.rulesetId),
    ];
  }
}

export class Witness {
  readonly axioms: string[];
  readonly theorem: string | null;
  readonly intermediateSteps: string[];
  readonly axiomsCommitmentHex: string | null;
  readonly circuitVersion: number;
  readonly rulesetId: string;

  constructor(input: WitnessInput) {
    this.axioms = [...input.axioms];
    this.theorem = input.theorem ?? null;
    this.intermediateSteps = [...(input.intermediateSteps ?? [])];
    this.axiomsCommitmentHex = input.axiomsCommitmentHex ?? null;
    this.circuitVersion = input.circuitVersion ?? 1;
    this.rulesetId = input.rulesetId ?? 'TDFOL_v1';
  }

  toDict(): Record<string, unknown> {
    return {
      axioms: [...this.axioms],
      theorem: this.theorem,
      intermediate_steps: [...this.intermediateSteps],
      axioms_commitment_hex: this.axiomsCommitmentHex,
      circuit_version: this.circuitVersion,
      ruleset_id: this.rulesetId,
    };
  }

  static fromDict(data: Record<string, unknown>): Witness {
    return new Witness({
      axioms: Array.isArray(data.axioms) ? data.axioms.map(String) : [],
      theorem: data.theorem == null ? null : String(data.theorem),
      intermediateSteps: Array.isArray(data.intermediate_steps)
        ? data.intermediate_steps.map(String)
        : [],
      axiomsCommitmentHex: data.axioms_commitment_hex == null ? null : String(data.axioms_commitment_hex),
      circuitVersion: Number(data.circuit_version ?? 1),
      rulesetId: String(data.ruleset_id ?? 'TDFOL_v1'),
    });
  }
}

export class ProofStatement {
  readonly statement: Statement;
  readonly circuitId: string;
  readonly proofType: string;
  readonly witnessCount: number;

  constructor(input: ProofStatementInput) {
    this.statement = input.statement instanceof Statement ? input.statement : new Statement(input.statement);
    this.circuitId = input.circuitId;
    this.proofType = input.proofType ?? 'simulated';
    this.witnessCount = input.witnessCount ?? 0;
  }

  toDict(): Record<string, unknown> {
    return {
      statement: this.statement.toDict(),
      circuit_id: this.circuitId,
      circuit_ref: formatCircuitRef(this.circuitId, this.statement.circuitVersion),
      proof_type: this.proofType,
      witness_count: this.witnessCount,
    };
  }

  static fromDict(data: Record<string, unknown>): ProofStatement {
    const rawStatement = data.statement;
    if (!rawStatement || typeof rawStatement !== 'object' || Array.isArray(rawStatement)) {
      throw new Error('statement must be an object');
    }
    return new ProofStatement({
      statement: Statement.fromDict(rawStatement as Record<string, unknown>),
      circuitId: String(data.circuit_id ?? data.circuitId ?? ''),
      proofType: String(data.proof_type ?? data.proofType ?? 'simulated'),
      witnessCount: Number(data.witness_count ?? data.witnessCount ?? 0),
    });
  }
}

function validateUint64Number(name: string, value: number): void {
  if (!Number.isInteger(value)) throw new TypeError(`${name} must be an integer`);
  if (value < 0 || BigInt(value) > U64_MAX) throw new Error(`${name} must be in uint64 range`);
}

function hexToField(hex: string): string {
  const normalized = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]+$/.test(normalized)) throw new Error('hex value must be valid hexadecimal');
  return (BigInt(`0x${normalized}`) % P_BN254).toString();
}

function textToField(text: string): string {
  const digest = createHash('sha256').update(text, 'utf8').digest('hex');
  return hexToField(digest);
}
