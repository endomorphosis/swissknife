export const TEST_ONLY_SIMULATED_ZKP_SCOPE = 'test-only' as const;

export const SIMULATED_BROWSER_ZKP_BACKEND_IDS = Object.freeze([
  'simulated',
  'simulated-zkp',
  'simulated-zkp-v0.1',
  'test-only-simulated-zkp',
  'groth16-simulated',
]);

export const REAL_BROWSER_ZKP_BACKEND_IDS = Object.freeze([
  'browser-schnorr-wasm',
  'snarkjs-browser-groth16',
  'snarkjs-browser',
]);

export class BrowserZkpSimulationRejectedError extends Error {
  readonly code = 'BROWSER_ZKP_SIMULATION_REJECTED';

  constructor(message: string) {
    super(message);
    this.name = 'BrowserZkpSimulationRejectedError';
  }
}

export interface BrowserZkpPolicyOptions {
  readonly allowTestOnlySimulation?: boolean;
}

export function assertProductionBrowserZkpBackendId(
  backend: string,
  allowedBackends: readonly string[] = REAL_BROWSER_ZKP_BACKEND_IDS,
): void {
  if (isSimulatedBrowserZkpIdentifier(backend)) {
    throw new BrowserZkpSimulationRejectedError(
      `Browser production ZKP backend "${backend}" is test-only; use a real browser/WASM backend`,
    );
  }
  if (!allowedBackends.includes(backend)) {
    throw new BrowserZkpSimulationRejectedError(
      `Browser production ZKP backend "${backend}" is not in the real browser backend allowlist`,
    );
  }
}

export function assertBrowserZkpEnvelopeIsReal(
  envelope: unknown,
  options: BrowserZkpPolicyOptions = {},
): void {
  if (options.allowTestOnlySimulation) return;
  const reason = simulatedBrowserZkpEnvelopeReason(envelope);
  if (reason) {
    throw new BrowserZkpSimulationRejectedError(
      `Simulated browser ZKP proof rejected: ${reason}`,
    );
  }
}

export function isSimulatedBrowserZkpEnvelope(envelope: unknown): boolean {
  return simulatedBrowserZkpEnvelopeReason(envelope) !== null;
}

export function simulatedBrowserZkpEnvelopeReason(envelope: unknown): string | null {
  for (const identifier of collectBrowserZkpEnvelopeIdentifiers(envelope)) {
    if (isSimulatedBrowserZkpIdentifier(identifier)) {
      return `identifier "${identifier}" is test-only`;
    }
  }
  if (hasBooleanSimulationFlag(envelope)) {
    return 'is_simulation flag is true';
  }
  return null;
}

export function isSimulatedBrowserZkpIdentifier(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (SIMULATED_BROWSER_ZKP_BACKEND_IDS.includes(normalized)) return true;
  return normalized === TEST_ONLY_SIMULATED_ZKP_SCOPE;
}

export function collectBrowserZkpEnvelopeIdentifiers(envelope: unknown): string[] {
  const identifiers: string[] = [];
  collectIdentifiers(envelope, identifiers, new Set<unknown>());
  return identifiers;
}

function collectIdentifiers(value: unknown, out: string[], seen: Set<unknown>): void {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collectIdentifiers(item, out, seen);
    return;
  }

  const object = value as Record<string, unknown>;
  for (const key of [
    'backend',
    'backend_id',
    'backendId',
    'verifier_id',
    'verifierId',
    'proofSystem',
    'proof_system',
    'scope',
    'algorithm',
  ]) {
    const candidate = object[key];
    if (typeof candidate === 'string') out.push(candidate);
  }

  for (const nestedKey of ['metadata', 'publicInputs', 'public_inputs', 'zkp_caveat', 'proof_artifact']) {
    collectIdentifiers(object[nestedKey], out, seen);
  }
}

function hasBooleanSimulationFlag(value: unknown, seen = new Set<unknown>()): boolean {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some(item => hasBooleanSimulationFlag(item, seen));
  }

  const object = value as Record<string, unknown>;
  if (object['is_simulation'] === true || object['isSimulation'] === true) return true;

  for (const nestedKey of ['metadata', 'publicInputs', 'public_inputs', 'zkp_caveat', 'proof_artifact']) {
    if (hasBooleanSimulationFlag(object[nestedKey], seen)) return true;
  }
  return false;
}
