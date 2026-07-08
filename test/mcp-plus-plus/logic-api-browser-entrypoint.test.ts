import { describe, expect, it } from 'vitest';
import * as logicApi from '../../src/services/logic/api/browser';

describe('logic API browser service entrypoint', () => {
  it('exports module-owned browser-safe public APIs', () => {
    expect(logicApi).toHaveProperty('BatchProcessor');
    expect(logicApi).toHaveProperty('E2EValidator');
    expect(logicApi).toHaveProperty('LogicPublicApi');
    expect(logicApi).toHaveProperty('getSubmoduleSpecs');
    expect(logicApi).toHaveProperty('getIntegrationManifest');
    expect(logicApi).toHaveProperty('LogicBatchProcessor');
    expect(logicApi).toHaveProperty('FOLBatchProcessor');
  });

  it('does not export host-only verification toolkits or absent follow-up modules', () => {
    expect(logicApi).not.toHaveProperty('EProverAdapter');
    expect(logicApi).not.toHaveProperty('ProofProblemParser');
    expect(logicApi).not.toHaveProperty('ForwardChainingStrategy');
    expect(logicApi).not.toHaveProperty('createSession');
  });
});
