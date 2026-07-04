/**
 * zkp-circuits.ts
 *
 * ZKP circuit utilities for proof attestation views.
 * TypeScript port of ipfs_datasets_py/logic/zkp/circuits.py
 *
 * Provides:
 *   ProofLayout               — decoded proof byte layout
 *   AttestationView           — deterministic proof attestation view
 *   decodeSimulatedProofLayout() — decode SIMZKP/1 byte layout
 *   buildProofAttestationView()  — build attestation view from proof + inputs
 *   attestationViewMatchesProof() — verify attestation matches proof bytes
 *   compilerGuidanceRefFromMetadata() — extract compiler guidance ref
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// SIMZKP/1 layout constants (mirrors Python)
// ---------------------------------------------------------------------------

const SIMZKP_MAGIC = Buffer.from('SIMZKP/1', 'ascii');
const SIMZKP_PROOF_LENGTH = 256; // bytes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bytesFromProofData(proofData: unknown): Buffer {
  if (Buffer.isBuffer(proofData)) return proofData;
  if (proofData instanceof Uint8Array) return Buffer.from(proofData);
  if (typeof proofData === 'string') {
    const stripped = proofData.trim();
    const hex = stripped.startsWith('0x') || stripped.startsWith('0X')
      ? stripped.slice(2) : stripped;
    if (hex && hex.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(hex)) {
      try { return Buffer.from(hex, 'hex'); } catch { /* fallthrough */ }
    }
    return Buffer.from(stripped, 'utf8');
  }
  if (proofData == null) return Buffer.alloc(0);
  return Buffer.from(String(proofData), 'utf8');
}

function mappingDict(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function nonNegativeInt(value: unknown): number {
  const n = Number(value);
  return isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function formatCircuitRef(circuitId: string, version: number): string {
  return version > 0 ? `${circuitId}:v${version}` : circuitId;
}

function resolveCircuitIdentity(publicInputs: Record<string, unknown>): [string, number] {
  const circuitId = String(publicInputs['circuit_id'] ?? publicInputs['circuit'] ?? 'simulated').trim();
  const version = nonNegativeInt(publicInputs['circuit_version'] ?? publicInputs['version'] ?? 0);
  return [circuitId || 'simulated', version];
}

function canonicalPublicInputs(publicInputs: Record<string, unknown>): [Record<string, unknown>, string] {
  const canonical: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(publicInputs).sort()) {
    if (v !== undefined && v !== null) canonical[k] = v;
  }
  const commitment = createHash('sha256')
    .update(JSON.stringify(canonical), 'utf8')
    .digest('hex');
  return [canonical, commitment];
}

// ---------------------------------------------------------------------------
// ProofLayout
// ---------------------------------------------------------------------------

export interface ProofLayout {
  byteLength: number;
  format: 'simzkp1' | 'opaque';
  valid: boolean;
  proofDigest?: string;
  proofType?: string;
  circuitVersion?: number;
}

// ---------------------------------------------------------------------------
// AttestationView
// ---------------------------------------------------------------------------

export interface AttestationView {
  attestationRef: string;
  proofDigest: string;
  circuitRef: string;
  theoremHash: string;
  axiomsCommitment: string;
  rulesetId: string;
  publicInputsCommitment: string;
  compilerGuidanceRef?: string;
  compilerGuidanceVersion?: number;
  layout: ProofLayout;
  canonicalPublicInputs: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// decodeSimulatedProofLayout
// ---------------------------------------------------------------------------

/**
 * Decode the fixed SIMZKP/1 byte layout when present.
 * Returns `{ valid: false }` for unknown or non-simulated proofs.
 */
export function decodeSimulatedProofLayout(proofData: unknown): ProofLayout {
  const raw = bytesFromProofData(proofData);
  const base: ProofLayout = { byteLength: raw.length, format: 'opaque', valid: false };

  if (raw.length !== SIMZKP_PROOF_LENGTH) return base;
  if (!raw.slice(0, 8).equals(SIMZKP_MAGIC)) return base;

  const proofHash = raw.slice(8, 40);
  const circuitVersion = raw.readUInt32BE(40);

  return {
    byteLength: raw.length,
    format: 'simzkp1',
    valid: true,
    proofDigest: proofHash.toString('hex'),
    proofType: 'simulated',
    circuitVersion,
  };
}

// ---------------------------------------------------------------------------
// compilerGuidanceRefFromMetadata
// ---------------------------------------------------------------------------

export function compilerGuidanceRefFromMetadata(metadata: Record<string, unknown> | null | undefined): string {
  if (!metadata) return '';
  const ref = metadata['compiler_guidance_ref'];
  if (ref) return String(ref);
  const cid = metadata['cid'] ?? metadata['document_cid'] ?? metadata['source_cid'];
  if (cid) return String(cid);
  return '';
}

// ---------------------------------------------------------------------------
// buildProofAttestationView
// ---------------------------------------------------------------------------

/**
 * Build a deterministic proof-attestation view from proof components.
 */
export function buildProofAttestationView(opts: {
  proofData: unknown;
  publicInputs: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
}): AttestationView {
  const { proofData, publicInputs, metadata } = opts;
  const metaDict = mappingDict(metadata);
  const proofBytes = bytesFromProofData(proofData);
  const layout = decodeSimulatedProofLayout(proofBytes);

  const [circuitId, circuitVersion] = resolveCircuitIdentity(publicInputs);
  const circuitRef = formatCircuitRef(circuitId, circuitVersion);

  const theoremHash = String(publicInputs['theorem_hash'] ?? '');
  const axiomsCommitment = String(publicInputs['axioms_commitment'] ?? '');
  const rulesetId = String(publicInputs['ruleset_id'] ?? '');

  const cgRef = String(
    publicInputs['compiler_guidance_ref'] ??
    metaDict['compiler_guidance_ref'] ??
    compilerGuidanceRefFromMetadata(metaDict) ??
    ''
  );
  const cgVersion = nonNegativeInt(
    publicInputs['compiler_guidance_version'] ?? metaDict['compiler_guidance_version'] ?? 0
  );

  const proofDigest = createHash('sha256').update(proofBytes).digest('hex');
  const [canonical, publicInputsCommitment] = canonicalPublicInputs(publicInputs);

  const attestationBasis: Record<string, unknown> = {
    axioms_commitment: axiomsCommitment,
    circuit_ref: circuitRef,
    proof_digest: proofDigest,
    ruleset_id: rulesetId,
    theorem_hash: theoremHash,
  };
  if (cgRef) {
    attestationBasis['compiler_guidance_ref'] = cgRef;
    attestationBasis['compiler_guidance_version'] = cgVersion;
  }

  const attestationRef = createHash('sha256')
    .update(JSON.stringify(attestationBasis, Object.keys(attestationBasis).sort()), 'utf8')
    .digest('hex');

  const view: AttestationView = {
    attestationRef,
    proofDigest,
    circuitRef,
    theoremHash,
    axiomsCommitment,
    rulesetId,
    publicInputsCommitment,
    layout,
    canonicalPublicInputs: canonical,
  };
  if (cgRef) {
    view.compilerGuidanceRef = cgRef;
    view.compilerGuidanceVersion = cgVersion;
  }
  return view;
}

// ---------------------------------------------------------------------------
// attestationViewMatchesProof
// ---------------------------------------------------------------------------

/**
 * Return true when the attestation view's public fields match the given proof bytes.
 */
export function attestationViewMatchesProof(opts: {
  proofData: unknown;
  publicInputs: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  attestationView?: Record<string, unknown> | null;
}): boolean {
  try {
    const { proofData, publicInputs, metadata, attestationView } = opts;
    const pubDict = mappingDict(publicInputs);
    if (Object.keys(pubDict).length === 0) return false;

    const embedded = mappingDict(attestationView);
    const fresh = buildProofAttestationView({ proofData, publicInputs: pubDict, metadata });

    const refMatch = !embedded['attestation_ref'] ||
      embedded['attestation_ref'] === fresh.attestationRef;
    const digestMatch = !embedded['proof_digest'] ||
      embedded['proof_digest'] === fresh.proofDigest;

    return refMatch && digestMatch;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Python-compatible circuit classes
// ---------------------------------------------------------------------------

export class CircuitGate {
  readonly gateType: string;
  readonly inputs: number[];
  readonly output: number;

  constructor(gateType: string, inputs: number[], output: number) {
    this.gateType = gateType;
    this.inputs = [...inputs];
    this.output = output;
  }

  toDict(): Record<string, unknown> {
    return { gate_type: this.gateType, inputs: [...this.inputs], output: this.output };
  }
}

export class ZKPCircuit {
  private readonly gates: CircuitGate[] = [];
  private readonly inputs = new Map<string, number>();
  private readonly outputs: number[] = [];
  private nextWire = 0;

  addInput(name: string): number {
    const wire = this.nextWire;
    this.nextWire += 1;
    this.inputs.set(name, wire);
    return wire;
  }

  addAndGate(wireA: number, wireB: number): number {
    return this.addGate('AND', [wireA, wireB]);
  }

  addOrGate(wireA: number, wireB: number): number {
    return this.addGate('OR', [wireA, wireB]);
  }

  addNotGate(wire: number): number {
    return this.addGate('NOT', [wire]);
  }

  addImpliesGate(wireA: number, wireB: number): number {
    return this.addGate('IMPLIES', [wireA, wireB]);
  }

  addXorGate(wireA: number, wireB: number): number {
    return this.addGate('XOR', [wireA, wireB]);
  }

  setOutput(wire: number): void {
    this.outputs.push(wire);
  }

  numGates(): number {
    return this.gates.length;
  }

  numInputs(): number {
    return this.inputs.size;
  }

  numWires(): number {
    return this.nextWire;
  }

  getCircuitHash(): string {
    return createHash('sha256').update(canonicalJson({
      num_gates: this.gates.length,
      num_inputs: this.inputs.size,
      num_wires: this.nextWire,
      gates: this.gates.map(gate => gate.toDict()),
    }), 'utf8').digest('hex');
  }

  toR1cs(): Record<string, unknown> {
    return {
      num_constraints: this.gates.length,
      num_variables: this.nextWire,
      constraints: this.gates.map(gate => {
        if (gate.gateType === 'AND') {
          return { type: 'multiplication', A: gate.inputs[0], B: gate.inputs[1], C: gate.output };
        }
        return { type: `${gate.gateType.toLowerCase()}_composition`, inputs: [...gate.inputs], output: gate.output };
      }),
      public_inputs: [...this.outputs],
    };
  }

  toString(): string {
    return `ZKPCircuit(inputs=${this.numInputs()}, gates=${this.numGates()}, wires=${this.numWires()})`;
  }

  add_input = this.addInput.bind(this);
  add_and_gate = this.addAndGate.bind(this);
  add_or_gate = this.addOrGate.bind(this);
  add_not_gate = this.addNotGate.bind(this);
  add_implies_gate = this.addImpliesGate.bind(this);
  add_xor_gate = this.addXorGate.bind(this);
  set_output = this.setOutput.bind(this);
  num_gates = this.numGates.bind(this);
  num_inputs = this.numInputs.bind(this);
  num_wires = this.numWires.bind(this);
  get_circuit_hash = this.getCircuitHash.bind(this);
  to_r1cs = this.toR1cs.bind(this);

  private addGate(gateType: string, inputs: number[]): number {
    const output = this.nextWire;
    this.nextWire += 1;
    this.gates.push(new CircuitGate(gateType, inputs, output));
    return output;
  }
}

export class MVPCircuit {
  readonly circuitVersion: number;
  readonly circuitType: string;

  constructor(circuitVersion = 1, circuitType = 'knowledge_of_axioms') {
    this.circuitVersion = circuitVersion;
    this.circuitType = circuitType;
  }

  numInputs(): number {
    return 4;
  }

  numConstraints(): number {
    return 1;
  }

  compile(): Record<string, unknown> {
    return {
      version: this.circuitVersion,
      type: this.circuitType,
      num_inputs: this.numInputs(),
      num_constraints: this.numConstraints(),
      description: 'Prove knowledge of axioms matching a commitment',
    };
  }

  verifyConstraints(witness: Record<string, unknown>, statement: Record<string, unknown>): boolean {
    return Number(statement.circuit_version ?? statement.circuitVersion) === this.circuitVersion &&
      Number(witness.circuit_version ?? witness.circuitVersion) === this.circuitVersion &&
      String(witness.ruleset_id ?? witness.rulesetId ?? '') === String(statement.ruleset_id ?? statement.rulesetId ?? '');
  }

  num_inputs = this.numInputs.bind(this);
  num_constraints = this.numConstraints.bind(this);
  verify_constraints = this.verifyConstraints.bind(this);
}

export class TDFOLv1DerivationCircuit {
  readonly circuitVersion: number;
  readonly circuitType: string;

  constructor(circuitVersion = 2, circuitType = 'tdfol_v1_horn_derivation') {
    this.circuitVersion = circuitVersion;
    this.circuitType = circuitType;
  }

  numInputs(): number {
    return 4;
  }

  compile(): Record<string, unknown> {
    return {
      version: this.circuitVersion,
      type: this.circuitType,
      num_inputs: this.numInputs(),
      description: 'Prove theorem holds under TDFOL_v1 Horn-fragment semantics using a derivation trace',
    };
  }

  verifyConstraints(witness: Record<string, unknown>, statement: Record<string, unknown>): boolean {
    const steps = Array.isArray(witness.intermediate_steps)
      ? witness.intermediate_steps
      : Array.isArray(witness.intermediateSteps)
        ? witness.intermediateSteps
        : [];
    return Number(statement.circuit_version ?? statement.circuitVersion) === this.circuitVersion &&
      Number(witness.circuit_version ?? witness.circuitVersion) === this.circuitVersion &&
      String(statement.ruleset_id ?? statement.rulesetId ?? '') === 'TDFOL_v1' &&
      String(witness.ruleset_id ?? witness.rulesetId ?? '') === 'TDFOL_v1' &&
      Boolean(witness.theorem) &&
      steps.length > 0;
  }

  num_inputs = this.numInputs.bind(this);
  verify_constraints = this.verifyConstraints.bind(this);
}

export function createKnowledgeOfAxiomsCircuit(circuitVersion = 1): MVPCircuit {
  return new MVPCircuit(circuitVersion);
}

export function createImplicationCircuit(numPremises: number): ZKPCircuit {
  const circuit = new ZKPCircuit();
  const premises = Array.from({ length: numPremises }, (_, index) => circuit.addInput(`P${index}`));
  const conclusion = circuit.addInput('Q');
  const antecedent = premises.length === 0
    ? conclusion
    : premises.slice(1).reduce((left, right) => circuit.addAndGate(left, right), premises[0]);
  circuit.setOutput(circuit.addImpliesGate(antecedent, conclusion));
  return circuit;
}

export function completeZkpAttestationRecord(record: Record<string, unknown>): Record<string, unknown> {
  const publicInputs = mappingDict(record.public_inputs ?? record.publicInputs);
  const metadata = mappingDict(record.metadata);
  const proofData = record.proof_data ?? record.proofData ?? record.proof ?? '';
  const attestationView = buildProofAttestationView({ proofData, publicInputs, metadata });
  return {
    ...record,
    proof_digest: attestationView.proofDigest,
    attestation_ref: attestationView.attestationRef,
    attestation_view: {
      attestation_ref: attestationView.attestationRef,
      proof_digest: attestationView.proofDigest,
      circuit_ref: attestationView.circuitRef,
      theorem_hash: attestationView.theoremHash,
      axioms_commitment: attestationView.axiomsCommitment,
      ruleset_id: attestationView.rulesetId,
      public_inputs_commitment: attestationView.publicInputsCommitment,
    },
  };
}

export const create_knowledge_of_axioms_circuit = createKnowledgeOfAxiomsCircuit;
export const create_implication_circuit = createImplicationCircuit;
export const complete_zkp_attestation_record = completeZkpAttestationRecord;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}
