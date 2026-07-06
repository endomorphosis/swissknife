/**
 * ZKP to UCAN Bridge — T-268 (Sprint 59)
 * Port of zkp/ucan_zkp_bridge.py (592L)
 */

import { Groth16Backend, type ZKPBackendProtocol } from './zkp-backends';

export interface ZKPCapabilityEvidence {
  proof:        Record<string, unknown>;
  capabilities: string[];
  agentDid:     string;
  proofHash:    string;
  timestamp:    number;
}

export interface BridgeResult {
  success:      boolean;
  ucans:        Array<{ can: string; with: string; proof: string }>;
  evidence:     ZKPCapabilityEvidence | null;
  error?:       string;
  confidence:   number;
}

export interface ZKPUCANBridgeStats {
  totalBridged: number; succeeded: number; failed: number; verified: number;
}

export class ZKPToUCANBridge {
  private readonly backend: ZKPBackendProtocol;
  private readonly stats: ZKPUCANBridgeStats = { totalBridged: 0, succeeded: 0, failed: 0, verified: 0 };

  constructor(backend: ZKPBackendProtocol = new Groth16Backend(null)) {
    this.backend = backend;
  }

  async bridge(
    formula: string,
    capabilities: string[],
    agentDid = 'did:key:unknown',
  ): Promise<BridgeResult> {
    this.stats.totalBridged++;
    try {
      const witness = JSON.stringify({ formula, capabilities, agentDid });
      const proof = await this.backend.generateProof(witness);
      const proofDict = proof.toDict();
      const proofHash = typeof proofDict['proofData'] === 'string'
        ? (proofDict['proofData'] as string).slice(0, 16)
        : 'unknown';

      const evidence: ZKPCapabilityEvidence = {
        proof: proofDict,
        capabilities,
        agentDid,
        proofHash,
        timestamp: Date.now(),
      };

      const ucans = capabilities.map(cap => ({
        can: cap,
        with: agentDid,
        proof: proofHash,
      }));

      this.stats.succeeded++;
      return { success: true, ucans, evidence, confidence: 0.85 };
    } catch (err) {
      this.stats.failed++;
      return { success: false, ucans: [], evidence: null, error: String(err), confidence: 0 };
    }
  }

  async verify(evidence: ZKPCapabilityEvidence): Promise<boolean> {
    this.stats.verified++;
    try {
      return await this.backend.verifyProof(JSON.stringify(evidence.proof));
    } catch {
      return false;
    }
  }

  getStats(): Readonly<ZKPUCANBridgeStats> { return { ...this.stats }; }
}

let _globalBridge: ZKPToUCANBridge | null = null;

export function getZkpUcanBridge(): ZKPToUCANBridge {
  if (!_globalBridge) _globalBridge = new ZKPToUCANBridge();
  return _globalBridge;
}
