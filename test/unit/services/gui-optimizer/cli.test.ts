/**
 * VGO-060 — GuiOptimizerTypeScriptCliBridge@1 tests.
 *
 * Covers help/schema snapshots, registry target resolution, path injection,
 * observation commands, and Python-owned verify/improve/report receipts.
 */

// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  AGENT_SUPERVISOR_SOURCE_PATH,
  COMMAND_INTERFACES,
  COMPONENT_REGISTRY,
  GUI_OPTIMIZER_CLI_RECEIPT_INTERFACE,
  GUI_OPTIMIZER_CLI_RECEIPT_SCHEMA,
  GUI_OPTIMIZER_TYPESCRIPT_CLI_BRIDGE_INTERFACE,
  GUI_OPT_COMMANDS,
  HELP_TEXT,
  REPORT_ALIAS_REGISTRY,
  TARGET_REGISTRY,
  VERIFY_ALIAS_REGISTRY,
  formatGuiOptimizerCliHelp,
  parseGuiOptimizerCliArgs,
  resolveTarget,
  runGuiOptimizerCli,
} from '../../../../src/services/gui-optimizer/cli.js';

describe('GuiOptimizerTypeScriptCliBridge@1', () => {
  it('exports a stable interface and command schema snapshot', () => {
    expect(GUI_OPTIMIZER_TYPESCRIPT_CLI_BRIDGE_INTERFACE).toBe(
      'GuiOptimizerTypeScriptCliBridge@1',
    );
    expect(GUI_OPTIMIZER_CLI_RECEIPT_INTERFACE).toBe('GuiOptimizerCliReceipt@1');
    expect(GUI_OPTIMIZER_CLI_RECEIPT_SCHEMA).toBe('gui-optimizer-cli-receipt/v1');
    expect(GUI_OPT_COMMANDS).toEqual([
      'scan',
      'baseline',
      'impact',
      'evaluate',
      'pack-context',
      'verify',
      'improve',
      'report',
    ]);
    expect(COMMAND_INTERFACES.scan).toBe('gui-opt scan@1');
    expect(COMMAND_INTERFACES.baseline).toBe('gui-opt baseline@1');
    expect(COMMAND_INTERFACES.impact).toBe('gui-opt impact@1');
    expect(COMMAND_INTERFACES.evaluate).toBe('gui-opt evaluate@1');
    expect(COMMAND_INTERFACES['pack-context']).toBe('gui-opt pack-context@1');
    expect(COMMAND_INTERFACES.verify).toBe('gui-opt verify@1');
    expect(COMMAND_INTERFACES.improve).toBe('gui-opt improve@1');
    expect(COMMAND_INTERFACES.report).toBe('gui-opt report@1');
    expect(TARGET_REGISTRY['agent-supervisor'].source_paths).toContain(
      AGENT_SUPERVISOR_SOURCE_PATH,
    );
    expect(COMPONENT_REGISTRY['comp:goal-form'].source_path).toBe(
      AGENT_SUPERVISOR_SOURCE_PATH,
    );
    expect(VERIFY_ALIAS_REGISTRY['agent-supervisor-target']).toBe(
      'named_target_receipt',
    );
    expect(VERIFY_ALIAS_REGISTRY['current-tree']).toBe('current_tree');
    expect(REPORT_ALIAS_REGISTRY['final-current-tree']).toBe('final_current_tree');
  });

  it('prints a stable help snapshot', () => {
    const result = runGuiOptimizerCli(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.receipt).toBeNull();
    expect(result.humanText).toBe(HELP_TEXT);
    expect(formatGuiOptimizerCliHelp()).toBe(HELP_TEXT);
    for (const command of GUI_OPT_COMMANDS) {
      expect(HELP_TEXT).toContain(command);
    }
  });

  it('resolves the registered agent-supervisor target only', () => {
    const target = resolveTarget('agent-supervisor');
    expect(target.application_id).toBe('app:agent-supervisor');
    expect(target.screen_id).toBe('screen:agent-supervisor');
    const unknown = runGuiOptimizerCli(['scan', 'not-a-target']);
    expect(unknown.exitCode).not.toBe(0);
    expect(unknown.receipt?.reason_codes).toContain('unknown_target');
  });

  it('rejects path injection and command strings', () => {
    const cases = [
      ['scan', '../secrets.env'],
      ['scan', '/etc/passwd'],
      ['baseline', 'C:\\Windows\\System32\\cmd.exe'],
      ['evaluate', 'swissknife/web/js/apps/agent-supervisor.js'],
      ['impact', '../etc/passwd'],
      ['impact', 'swissknife/web/js/apps/../../etc/passwd'],
      ['impact', 'swissknife/src/services/control/authorization.ts'],
      ['verify', 'agent-supervisor-target', '--receipt', '../secrets.json'],
      ['report', '../journals/head.json'],
      ['scan', 'agent-supervisor;rm -rf /'],
    ];
    for (const argv of cases) {
      const result = runGuiOptimizerCli(argv);
      expect(result.exitCode, argv.join(' ')).not.toBe(0);
      expect(result.receipt?.ok, argv.join(' ')).toBe(false);
    }
    const forbidden = runGuiOptimizerCli([
      'scan',
      'agent-supervisor',
      '--shell',
      'bash',
    ]);
    expect(forbidden.receipt?.reason_codes).toContain('forbidden_flag');
  });

  it('scans, baselines, and evaluates the registered target deterministically', () => {
    const scanA = runGuiOptimizerCli(['scan', 'agent-supervisor']);
    const scanB = runGuiOptimizerCli(['scan', 'agent-supervisor']);
    expect(scanA.exitCode).toBe(0);
    expect(scanA.receipt?.receipt_id).toBe(scanB.receipt?.receipt_id);
    expect(scanA.receipt?.interface).toBe(GUI_OPTIMIZER_CLI_RECEIPT_INTERFACE);
    expect(scanA.receipt?.payload.effectful).toBe(false);
    expect((scanA.receipt?.payload.finding_count as number) >= 0).toBe(true);

    const baselineA = runGuiOptimizerCli(['baseline', 'agent-supervisor']);
    const baselineB = runGuiOptimizerCli(['baseline', 'agent-supervisor']);
    expect(baselineA.exitCode).toBe(0);
    expect(baselineA.receipt?.receipt_id).toBe(baselineB.receipt?.receipt_id);
    expect(String(baselineA.receipt?.payload.baseline_digest)).toMatch(/^sha256:/);

    const evaluated = runGuiOptimizerCli(['evaluate', 'agent-supervisor']);
    expect(evaluated.exitCode).toBe(0);
    expect(evaluated.receipt?.payload.decision).toBeTruthy();
  });

  it('plans impact for registered components and allowlisted paths', () => {
    const component = runGuiOptimizerCli(['impact', 'comp:goal-form']);
    expect(component.exitCode).toBe(0);
    expect(component.receipt?.payload.impact).toMatchObject({
      kind: 'component',
      source_path: AGENT_SUPERVISOR_SOURCE_PATH,
    });
    const path = runGuiOptimizerCli(['impact', AGENT_SUPERVISOR_SOURCE_PATH]);
    expect(path.exitCode).toBe(0);
    expect(path.receipt?.payload.impact).toMatchObject({ kind: 'path' });
  });

  it('requires a registered objective for pack-context', () => {
    const missing = runGuiOptimizerCli(['pack-context', 'agent-supervisor']);
    expect(missing.exitCode).not.toBe(0);
    expect(missing.receipt?.reason_codes).toContain('missing_objective');

    const packed = runGuiOptimizerCli([
      'pack-context',
      'agent-supervisor',
      '--objective',
      'accessible-name',
    ]);
    expect(packed.exitCode).toBe(0);
    expect(packed.receipt?.payload.pack_id).toBeTruthy();
    expect(packed.receipt?.payload.objective).toBe('accessible-name');
  });

  it('treats verify/improve/report as Python-owned bridge commands', () => {
    const verify = runGuiOptimizerCli(['verify', 'agent-supervisor-target']);
    expect(verify.exitCode).toBe(0);
    expect(verify.receipt?.reason_codes).toContain('python_owned_command');

    const improve = runGuiOptimizerCli([
      'improve',
      'agent-supervisor',
      '--objective',
      'accessible-name',
    ]);
    expect(improve.exitCode).not.toBe(0);
    expect(improve.receipt?.reason_codes).toContain('isolated_worktree_required');
    expect(improve.receipt?.payload.effectful).toBe(false);

    const report = runGuiOptimizerCli(['report', 'final-current-tree']);
    expect(report.exitCode).toBe(0);
    expect(report.receipt?.payload.owner).toContain('gui_optimizer.cli');
  });

  it('rejects unknown commands and extra subjects', () => {
    const unknown = runGuiOptimizerCli(['explode', 'agent-supervisor']);
    expect(unknown.receipt?.reason_codes).toContain('unknown_command');
    expect(() => parseGuiOptimizerCliArgs(['scan', 'agent-supervisor', 'extra'])).toThrow(
      /exactly one subject/,
    );
  });
});
