import { ZkpSimulatedProver } from '../../../src/services/zkp/zkp-simulated-prover';

export const EXPLICIT_SIMULATED_ZKP_FIXTURE_REASON = 'explicit test-only simulation fixture';

export function createExplicitSimulatedZkpFixture(): ZkpSimulatedProver {
  return new ZkpSimulatedProver();
}
