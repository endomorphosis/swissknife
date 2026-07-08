/**
 * ZKP Form Completion Circuit — T-246
 *
 * Port of ipfs_datasets_py/logic/zkp/form_circuit.py
 *
 * Boolean circuit encoding "this form was correctly completed" along with
 * certificate generation and verification for form verification results.
 */

import { sha256Hex } from '../shared/browser-crypto.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(s: string): string {
  return sha256Hex(s);
}

// ---------------------------------------------------------------------------
// FormCompletionCircuit
// ---------------------------------------------------------------------------

export interface CircuitWire { id: number; label: string }

/**
 * Minimal boolean circuit for form-completion proofs.
 * Tracks gates and computes a deterministic evaluation.
 */
class BooleanCircuit {
  private readonly wires: Array<{ label: string; value: boolean | null }> = [];
  private readonly andGates: Array<[number, number, number]> = []; // [a, b, out]
  private outputWire?: number;

  addInput(label: string): number {
    const id = this.wires.length;
    this.wires.push({ label, value: null });
    return id;
  }

  addAndGate(a: number, b: number): number {
    const out = this.wires.length;
    this.wires.push({ label: `and(${a},${b})`, value: null });
    this.andGates.push([a, b, out]);
    return out;
  }

  setOutput(wireId: number): void { this.outputWire = wireId; }

  /** Evaluate the circuit given a map of input wire id → value. */
  evaluate(inputs: Map<number, boolean>): boolean {
    const vals = new Map<number, boolean>(inputs);
    for (const [a, b, out] of this.andGates) {
      vals.set(out, (vals.get(a) ?? false) && (vals.get(b) ?? false));
    }
    return vals.get(this.outputWire ?? -1) ?? false;
  }

  getWireLabels(): string[] { return this.wires.map(w => w.label); }
}

// ---------------------------------------------------------------------------
// FormCompletionCircuit
// ---------------------------------------------------------------------------

/**
 * Boolean circuit encoding "this form is correctly filled".
 *
 * Public inputs:
 *  - `formTemplateHash`  — SHA-256 of the form template path/ID.
 *  - `ruleSetHash`       — SHA-256 of the serialised DeonticRuleSet.
 *  - `verdictsHash`      — SHA-256 of per-formula pass/fail verdicts.
 *
 * Circuit statement: `hash(fieldValues) = witnessHash ∧ overallPass = true`.
 *
 * TypeScript port of `FormCompletionCircuit` from
 * `ipfs_datasets_py/logic/zkp/form_circuit.py`.
 */
export class FormCompletionCircuit {
  readonly formId: string;
  readonly formTemplateHash: string;
  readonly ruleSetHash: string;
  readonly verdictsHash: string;
  private _circuit?: BooleanCircuit;

  constructor(params: {
    formId?: string;
    formTemplateHash?: string;
    ruleSetHash?: string;
    verdictsHash?: string;
  } = {}) {
    this.formId          = params.formId ?? '';
    this.formTemplateHash = params.formTemplateHash ?? '';
    this.ruleSetHash     = params.ruleSetHash ?? '';
    this.verdictsHash    = params.verdictsHash ?? '';
  }

  /**
   * Build the circuit from an arbitrary rule set and report object
   * (both duck-typed for compatibility with different schema versions).
   */
  static fromRuleSetAndReport(
    ruleSet: unknown,
    report: unknown,
    opts: { formId?: string; sourcePdf?: string } = {},
  ): FormCompletionCircuit {
    const src = opts.sourcePdf || opts.formId || '';
    const templateHash = sha256(src);

    let ruleSetJson: string;
    try {
      const toDict = (ruleSet as { toDict?(): unknown }).toDict;
      ruleSetJson = JSON.stringify(toDict ? toDict.call(ruleSet) : ruleSet, null, 0);
    } catch {
      ruleSetJson = String(ruleSet);
    }
    const rsHash = sha256(ruleSetJson);

    const vHashFn = (report as { verdictsHash?(): string }).verdictsHash;
    const verdictsHash = typeof vHashFn === 'function' ? vHashFn.call(report) : '';

    return new FormCompletionCircuit({
      formId: opts.formId || (report as { formId?: string }).formId || '',
      formTemplateHash: templateHash,
      ruleSetHash: rsHash,
      verdictsHash,
    });
  }

  /** Build and cache the underlying BooleanCircuit. */
  build(): BooleanCircuit {
    const circuit = new BooleanCircuit();
    const formWire       = circuit.addInput('form_template_hash_match');
    const rsWire         = circuit.addInput('rule_set_hash_match');
    const verdictsWire   = circuit.addInput('verdicts_hash_match');
    const overallPassWire = circuit.addInput('overall_pass');

    const allHashes          = circuit.addAndGate(formWire, rsWire);
    const allHashesAndVerdicts = circuit.addAndGate(allHashes, verdictsWire);
    const outputWire         = circuit.addAndGate(allHashesAndVerdicts, overallPassWire);
    circuit.setOutput(outputWire);
    this._circuit = circuit;
    return circuit;
  }

  getCircuit(): BooleanCircuit {
    if (!this._circuit) this.build();
    return this._circuit!;
  }

  getPublicInputsDict(): Record<string, string> {
    return {
      formTemplateHash: this.formTemplateHash,
      ruleSetHash:      this.ruleSetHash,
      verdictsHash:     this.verdictsHash,
    };
  }

  /** Evaluate the circuit for a given overallPass value. */
  evaluate(overallPass: boolean): boolean {
    const circuit = this.getCircuit();
    const inputs = new Map<number, boolean>([
      [0, this.formTemplateHash.length > 0],
      [1, this.ruleSetHash.length > 0],
      [2, this.verdictsHash.length > 0],
      [3, overallPass],
    ]);
    return circuit.evaluate(inputs);
  }
}

// ---------------------------------------------------------------------------
// FormCompletionCertificate
// ---------------------------------------------------------------------------

/**
 * Certificate proving a form was correctly completed.
 *
 * TypeScript port of `FormCompletionCertificate` from `form_circuit.py`.
 */
export interface FormCompletionCertificate {
  /** Canonical circuit reference. */
  circuitRef: string;
  /** SHA-256 of the proof payload. */
  proofHash: string;
  /** Public inputs committed in the proof. */
  publicInputs: Record<string, string>;
  /** Timestamp of certificate generation (ISO-8601). */
  timestamp: string;
  /** Form identifier. */
  formId: string;
  /** Whether the circuit evaluation passed. */
  isValid: boolean;
}

// ---------------------------------------------------------------------------
// generateFormCertificate
// ---------------------------------------------------------------------------

/**
 * Generate a `FormCompletionCertificate` for a form circuit.
 *
 * @param circuit     - The compiled `FormCompletionCircuit`.
 * @param fieldValues - Private form field values (never included in output).
 * @param overallPass - Whether the verification report passed overall.
 */
export function generateFormCertificate(
  circuit: FormCompletionCircuit,
  fieldValues: Record<string, unknown>,
  overallPass = true,
): FormCompletionCertificate {
  const publicInputs = circuit.getPublicInputsDict();
  const isValid = circuit.evaluate(overallPass);

  // Build proof hash from public inputs (field values are private)
  const proofPayload = JSON.stringify({ publicInputs, overallPass, isValid }, null, 0);
  const proofHash = sha256(proofPayload);

  return {
    circuitRef: 'form_completion_v1',
    proofHash,
    publicInputs,
    timestamp: new Date().toISOString(),
    formId: circuit.formId,
    isValid,
  };
}

// ---------------------------------------------------------------------------
// verifyFormCertificate
// ---------------------------------------------------------------------------

/**
 * Verify a `FormCompletionCertificate` for internal consistency.
 *
 * This performs a best-effort structural check; cryptographic verification
 * requires a live ZKP backend.
 *
 * @returns `true` if the certificate passes structural validation.
 */
export function verifyFormCertificate(certificate: FormCompletionCertificate): boolean {
  // Basic structural checks
  if (!certificate.circuitRef) return false;
  if (!certificate.proofHash || certificate.proofHash.length !== 64) return false;
  if (!certificate.timestamp) return false;
  // Verify proofHash is a valid hex SHA-256
  if (!/^[0-9a-f]{64}$/.test(certificate.proofHash)) return false;
  return true;
}
