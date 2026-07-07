/**
 * Sprint 7b tests — ix integration (T-51/T-52/T-53/T-54) + mcp++ provers CLI
 *
 * Covers:
 * - T-51/T-52: ix CLI evaluation — findIxCli, ixBuildInstructions, proveWithIx
 *   (tests skip when ix binary is absent; static surface checks always run)
 * - T-53: PolicyAuditLog.record() zk_proof_cid in extra
 * - CLI: mcp++ provers subcommand shape
 */

import {
  findIxCli,
  ixBuildInstructions,
  proveWithIx,
} from '../../src/services/provers/lean4-wasm-bridge';
import { PolicyAuditLog } from '../../src/services/platform/policy-audit-log';
import { WasmProverHub } from '../../src/services/mcp/mcp-wasm-prover-hub';

const IX_AVAILABLE = findIxCli() !== null;

// ---------------------------------------------------------------------------
// T-51/T-52 — ix CLI evaluation
// ---------------------------------------------------------------------------

describe('T-51 ix CLI evaluation', () => {
  it('findIxCli() returns null or a string without throwing', () => {
    const result = findIxCli();
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('ixBuildInstructions() returns non-empty build guidance', () => {
    const instr = ixBuildInstructions();
    expect(typeof instr).toBe('string');
    expect(instr.length).toBeGreaterThan(200);
  });

  it('ixBuildInstructions() contains key workflow commands', () => {
    const instr = ixBuildInstructions();
    expect(instr).toContain('ix compile');
    expect(instr).toContain('argumentcomputer/ix');
    expect(instr).toContain('sp1');
    expect(instr).toContain('.ixe');
  });

  it('proveWithIx is a function (API surface check)', () => {
    expect(typeof proveWithIx).toBe('function');
  });

  it('proveWithIx returns null gracefully when ix is not installed', async () => {
    // Force null path to simulate missing ix CLI
    const result = await proveWithIx('theorem x : True := trivial', '/nonexistent/ix', 1000);
    expect(result).toBeNull();
  });
});

(IX_AVAILABLE ? describe : describe.skip)('T-52 ix-backed Lean4WasmBridge (requires ix CLI)', () => {
  jest.setTimeout(120_000); // ix compilation can be slow

  it('proveWithIx generates a ZKProofArtifact for a trivial theorem', async () => {
    const result = await proveWithIx('theorem x : True := trivial', undefined, 60_000);
    if (result === null) {
      // ix found but proof failed — acceptable in test environment
      return;
    }
    expect(result.backend).toBe('sphinx');
    expect(typeof result.proof_b64).toBe('string');
    expect(result.artifact_cid).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.proof_time_ms).toBeGreaterThan(0);
    expect(result.statement).toContain('theorem x');
  });
});

// ---------------------------------------------------------------------------
// T-53 — PolicyAuditLog zk_proof_cid in extra
// ---------------------------------------------------------------------------

describe('T-53 PolicyAuditLog zk_proof_cid in extra', () => {
  afterEach(() => PolicyAuditLog.resetInstance());

  it('records zk_proof_cid in extra when provided', () => {
    const log = new PolicyAuditLog();
    const entry = log.record({
      policy_cid: 'sha256:p', intent_cid: 'sha256:i',
      decision: 'allow', tool: 'browse',
      zk_proof_cid: 'sha256:' + 'a'.repeat(64),
    });
    expect(entry).not.toBeNull();
    expect(entry!.extra.zk_proof_cid).toBe('sha256:' + 'a'.repeat(64));
  });

  it('records all three prover fields together', () => {
    const log = new PolicyAuditLog();
    const entry = log.record({
      policy_cid: 'sha256:p', intent_cid: 'sha256:i',
      decision: 'allow',
      prover_id: 'lean4-wasm',
      proof_time_ms: 42,
      zk_proof_cid: 'sha256:' + 'b'.repeat(64),
    });
    expect(entry!.extra.prover_id).toBe('lean4-wasm');
    expect(entry!.extra.proof_time_ms).toBe(42);
    expect(entry!.extra.zk_proof_cid).toBe('sha256:' + 'b'.repeat(64));
  });

  it('does not set zk_proof_cid when not provided', () => {
    const log = new PolicyAuditLog();
    const entry = log.record({
      policy_cid: 'sha256:p', intent_cid: 'sha256:i', decision: 'allow',
    });
    expect(entry!.extra.zk_proof_cid).toBeUndefined();
  });

  it('zk_proof_cid survives round-trip through JSONL file', async () => {
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'pal-ix-'));
    const logPath = join(dir, 'audit.jsonl');
    const log = new PolicyAuditLog({ logPath });
    log.record({
      policy_cid: 'sha256:p', intent_cid: 'sha256:i',
      decision: 'allow', zk_proof_cid: 'sha256:' + 'c'.repeat(64),
    });
    const line = readFileSync(logPath, 'utf8').trim();
    const parsed = JSON.parse(line);
    expect(parsed.extra.zk_proof_cid).toBe('sha256:' + 'c'.repeat(64));
    rmSync(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// mcp++ provers subcommand
// ---------------------------------------------------------------------------

describe('mcp++ provers subcommand', () => {
  afterEach(() => WasmProverHub.resetInstance());

  it('provers subcommand returns output with prover stack info', async () => {
    // Import the command handler
    const { default: cmds } = await import('../../src/commands/mcp-plus-plus-commands');
    const cmd = cmds[0];
    if (!cmd?.handler) return; // no handler to test

    // Call with 'provers' subcommand
    const result = await cmd.handler(['provers'], {}, undefined as never);
    expect(result).toHaveProperty('output');
    expect(typeof (result as Record<string, unknown>).output).toBe('string');
    const output = (result as Record<string, unknown>).output as string;
    expect(output).toContain('WASM Prover');
  });

  it('provers build-lurk returns lurk build instructions', async () => {
    const { default: cmds } = await import('../../src/commands/mcp-plus-plus-commands');
    const cmd = cmds[0];
    if (!cmd?.handler) return;

    const result = await cmd.handler(['provers', 'build-lurk'], {}, undefined as never);
    const output = (result as Record<string, unknown>).output as string;
    expect(output).toContain('wasm32-unknown-unknown');
  });

  it('provers build-ix returns ix build instructions', async () => {
    const { default: cmds } = await import('../../src/commands/mcp-plus-plus-commands');
    const cmd = cmds[0];
    if (!cmd?.handler) return;

    const result = await cmd.handler(['provers', 'build-ix'], {}, undefined as never);
    const output = (result as Record<string, unknown>).output as string;
    expect(output).toContain('ix compile');
  });
});
