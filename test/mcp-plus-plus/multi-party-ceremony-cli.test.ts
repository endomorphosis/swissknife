import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ceremonyScript = resolve(__dirname, '../../scripts/zkp-mpc-ceremony.mjs');

describe('zkp-mpc-ceremony CLI', () => {
  it('persists only public setup artifacts in an initial collecting manifest', () => {
    const directory = mkdtempSync(join(tmpdir(), 'swissknife-ceremony-'));
    try {
      const r1cs = join(directory, 'circuit.r1cs');
      const ptau = join(directory, 'powers.ptau');
      const manifest = join(directory, 'ceremony.json');
      writeFileSync(r1cs, 'public circuit bytes');
      writeFileSync(ptau, 'public phase one bytes');

      execFileSync(process.execPath, [
        ceremonyScript,
        'init',
        '--manifest', manifest,
        '--ceremony-id', 'event-dag-test',
        '--circuit-id', 'event_dag_compaction_v1',
        '--r1cs', r1cs,
        '--phase1-ptau', ptau,
      ], { stdio: 'pipe' });

      const saved = JSON.parse(readFileSync(manifest, 'utf8'));
      expect(saved).toMatchObject({
        schema: 'mcp++/groth16-mpc-ceremony@1',
        profile: {
          capability: 'mcp++/event-dag',
          name: 'Profile F: Event DAG Provenance, Archival, and Compaction',
        },
        keyFormat: 'snarkjs-zkey',
        status: 'collecting',
        contributions: [],
      });
      expect(saved.initialZkey).toBeUndefined();
      expect(JSON.stringify(saved)).not.toContain('entropy');
      expect(saved.circuitR1cs.cid).toBe(`sha256:${saved.circuitR1cs.sha256}`);
      expect(saved.phase1Powers.cid).toBe(`sha256:${saved.phase1Powers.sha256}`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
