import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  decodeModalIrText,
  modalFormulaToText,
  targetFamilyDistributionForModalIr,
  targetFamilyForModalIr,
} from '../../src/services/modal-logic-codec';
import {
  CircuitBreakerState,
  PrometheusMetricsCollector,
  getPrometheusCollector,
} from '../../src/services/observability-metrics-prometheus';
import {
  ensureCoq,
  ensureCvc5,
  ensureErgoai,
  ensureLean,
  ensureSymbolicai,
} from '../../src/services/prover-installer';
import { resolveErgoBinary } from '../../src/services/ergoai-wrapper';

describe('PORT-233 modal codec decode and target-family helpers', () => {
  const modalIr = {
    formulas: [
      {
        operator: { symbol: 'O', family: 'deontic', system: 'SDL' },
        predicate: { name: 'file_report', arguments: ['agent'] },
      },
      {
        operator: { symbol: '□', family: 'temporal', system: 'LTL' },
        predicate: { name: 'retain_record', arguments: [] },
      },
    ],
  };

  it('renders compact modal IR text and target-family distributions', () => {
    expect(modalFormulaToText(modalIr.formulas[0])).toBe('O[deontic:SDL](file_report(agent))');
    expect(decodeModalIrText(modalIr)).toBe('O[deontic:SDL](file_report(agent)); □[temporal:LTL](retain_record)');
    expect(targetFamilyForModalIr(modalIr)).toBe('deontic');
    expect(targetFamilyDistributionForModalIr(modalIr)).toEqual({ deontic: 0.5, temporal: 0.5 });
    expect(targetFamilyForModalIr({ formulas: [] })).toBe('hybrid');
    expect(targetFamilyDistributionForModalIr({ formulas: [] })).toEqual({ hybrid: 1 });
  });
});

describe('PORT-233 observability metrics remainder', () => {
  it('collects circuit-breaker calls, state, logs, summaries, and Prometheus text', () => {
    const collector = new PrometheusMetricsCollector();
    collector.recordCircuitBreakerCall('z3', 0.1, true, 10);
    collector.recordCircuitBreakerCall('z3', 0.3, false, 20);
    collector.recordCircuitBreakerState('z3', CircuitBreakerState.OPEN, 30);
    collector.recordLogEntry('z3', 'warning');

    expect(collector.getFailureRate('z3')).toBe(50);
    expect(collector.getSuccessRate('z3')).toBe(50);
    expect(collector.getLatencyPercentiles('z3')).toMatchObject({ p50: 0.1, p95: 0.3, p99: 0.3 });
    expect(collector.getMetricsSummary('z3')).toMatchObject({
      total_calls: 2,
      successful_calls: 1,
      failed_calls: 1,
      current_state: 'open',
      last_failure_time: 20,
    });
    expect(collector.exportPrometheusFormat()).toContain('circuit_breaker_failure_rate{component="z3"} 50.00');
    expect(collector.exportPrometheusFormat()).toContain('log_entries_by_level{component="z3",level="warning"} 1');

    expect(collector.getComponents()).toEqual(new Set(['z3']));
    collector.resetComponent('z3');
    expect(collector.getComponents()).toEqual(new Set());
    expect(getPrometheusCollector()).toBe(getPrometheusCollector());
  });
});

describe('PORT-233 host-native prover and ErgoAI probes', () => {
  it('checks prover availability and supports injected installers', async () => {
    expect(ensureCvc5({ which: command => command === 'cvc5' ? '/usr/bin/cvc5' : null })).toBe(true);
    expect(ensureLean({ which: () => null, yes: false })).toBe(false);
    expect(await ensureCoq({ which: () => null, yes: true, install: component => component === 'coq' })).toBe(true);
    expect(ensureErgoai({ which: command => command === 'ergoai' ? '/usr/local/bin/ergoai' : null })).toBe(true);
    expect(ensureSymbolicai({ which: () => null, moduleAvailable: name => name === 'symai' })).toBe(true);
    expect(() => ensureCvc5({ which: () => null, yes: true, strict: true })).toThrow(/no installer/);
  });

  it('resolves ErgoAI binaries from explicit paths, env, PATH probes, and lazy installers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ergoai-wrapper-'));
    const binary = join(dir, 'runergo');
    writeFileSync(binary, '#!/bin/sh\n');
    chmodSync(binary, 0o755);

    try {
      expect(resolveErgoBinary({ binary })).toBe(binary);
      expect(resolveErgoBinary({ env: { ERGOAI_BINARY: binary } })).toBe(binary);
      expect(resolveErgoBinary({ which: command => command === 'ergo' ? binary : null })).toBe(binary);
      expect(resolveErgoBinary({ which: () => null, lazyInstall: false })).toBeNull();
      expect(resolveErgoBinary({
        which: () => null,
        lazyInstaller: reason => reason === 'test' ? binary : null,
        reason: 'test',
      })).toBe(binary);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
