/**
 * wasm-prover-sprint87.test.ts
 * Tests for §12.20 real external ATP adapter closure.
 */

import {
  EProver,
  ProverProcessResult,
  ProverStatus,
  VampireProver,
} from '../../src/services/external-provers';

describe('PORT-170 VampireProver real runner path', () => {
  it('invokes a configured Vampire runner with TPTP input and parses SZS theorem', () => {
    const calls: Array<{ command: string; args: string[]; input: string; timeoutMs: number }> = [];
    const vampire = new VampireProver({
      binary: 'fake-vampire',
      availabilityCheck: () => true,
      runner: (command, args, input, timeoutMs): ProverProcessResult => {
        calls.push({ command, args, input, timeoutMs });
        return {
          stdout: '% SZS status Theorem for external_problem\nfof(step, plain, (p)).',
          stderr: '',
          status: 0,
        };
      },
    });

    const result = vampire.prove('forall x. Human(x) -> Mortal(x)', 2_000);
    expect(result.status).toBe(ProverStatus.THEOREM);
    expect(result.proof).toContain('SZS status Theorem');
    expect(result.statistics).toMatchObject({ simulated: false, command: 'fake-vampire', szs_status: 'Theorem' });
    expect(calls[0]!.args).toEqual(expect.arrayContaining(['--mode', 'casc', '--input_syntax', 'tptp']));
    expect(calls[0]!.input).toContain('fof(conj_1, conjecture,');
  });
});

describe('PORT-171 EProver real runner path', () => {
  it('invokes a configured E runner and maps SZS unsatisfiable output', () => {
    const calls: Array<{ command: string; args: string[]; input: string }> = [];
    const eprover = new EProver({
      binary: 'fake-eprover',
      availabilityCheck: () => true,
      runner: (command, args, input): ProverProcessResult => {
        calls.push({ command, args, input });
        return {
          stdout: '# SZS status Unsatisfiable\ncnf(refutation, plain, ($false)).',
          stderr: '',
          status: 0,
        };
      },
    });

    const result = eprover.prove('fof(goal, conjecture, (p)).', 5_000);
    expect(result.status).toBe(ProverStatus.UNSATISFIABLE);
    expect(result.proof).toContain('Unsatisfiable');
    expect(calls[0]!.command).toBe('fake-eprover');
    expect(calls[0]!.args).toEqual(expect.arrayContaining(['--auto', '--tstp-in', '--tstp-out']));
    expect(calls[0]!.input).toBe('fof(goal, conjecture, (p)).');
  });
});

describe('external prover unavailable mode', () => {
  it('can disable simulated fallback for strict native execution', () => {
    const eprover = new EProver({ availabilityCheck: () => false, allowSimulatedFallback: false });
    const result = eprover.prove('forall x. P(x)');
    expect(result.status).toBe(ProverStatus.ERROR);
    expect(result.error).toContain('binary not found');
  });

  it('preserves simulated fallback only when explicitly requested', () => {
    const eprover = new EProver({ availabilityCheck: () => false, allowSimulatedFallback: true });
    expect(eprover.prove('forall x. P(x)').status).toBe(ProverStatus.THEOREM);
  });
});
