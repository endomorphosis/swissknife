/**
 * GuiOptimizerTypeScriptCliBridge@1 (VGO-060).
 *
 * Fixed scan / baseline / impact / evaluate / pack-context observation
 * commands plus parse-only verify / improve / report receipts. Targets
 * resolve through a repository registry. Paths are repository-relative
 * and allowlisted. Callers cannot inject host paths, shell strings, or
 * executables. This module never executes repository source except
 * through the non-evaluating static scanner.
 */

import { compileUiBaseline } from './baseline.js';
import { buildGuiContextPack } from './context-pack.js';
import { evaluateObjective } from './evaluator.js';
import { canonicalIdentity } from './identity.js';
import {
  makeUiChangeSet,
  planUiInvalidation,
} from './invalidation.js';
import {
  AGENT_SUPERVISOR_APPLICATION_ID,
  AGENT_SUPERVISOR_SCREEN_ID,
  STABLE_SCENARIO_IDS,
} from './scenario-catalog.js';
import {
  scanGuiSources,
  type GuiScanSourceInput,
} from './scanner.js';
import {
  makeUiEventDefinition,
  makeUiStateDefinition,
  makeUiTransitionDefinition,
} from './state-machine.js';

export const GUI_OPTIMIZER_TYPESCRIPT_CLI_BRIDGE_INTERFACE =
  'GuiOptimizerTypeScriptCliBridge@1' as const;
export const GUI_OPTIMIZER_CLI_RECEIPT_INTERFACE =
  'GuiOptimizerCliReceipt@1' as const;
export const GUI_OPTIMIZER_CLI_RECEIPT_SCHEMA =
  'gui-optimizer-cli-receipt/v1' as const;
export const GUI_OPTIMIZER_CLI_VERSION = 'gui-opt@1.0.0' as const;

export const GUI_OPT_SCAN_INTERFACE = 'gui-opt scan@1' as const;
export const GUI_OPT_BASELINE_INTERFACE = 'gui-opt baseline@1' as const;
export const GUI_OPT_IMPACT_INTERFACE = 'gui-opt impact@1' as const;
export const GUI_OPT_EVALUATE_INTERFACE = 'gui-opt evaluate@1' as const;
export const GUI_OPT_PACK_CONTEXT_INTERFACE = 'gui-opt pack-context@1' as const;
export const GUI_OPT_VERIFY_INTERFACE = 'gui-opt verify@1' as const;
export const GUI_OPT_IMPROVE_INTERFACE = 'gui-opt improve@1' as const;
export const GUI_OPT_REPORT_INTERFACE = 'gui-opt report@1' as const;

export const GUI_OPT_COMMANDS = Object.freeze([
  'scan',
  'baseline',
  'impact',
  'evaluate',
  'pack-context',
  'verify',
  'improve',
  'report',
] as const);
export type GuiOptCommand = (typeof GUI_OPT_COMMANDS)[number];

export const COMMAND_INTERFACES = Object.freeze({
  scan: GUI_OPT_SCAN_INTERFACE,
  baseline: GUI_OPT_BASELINE_INTERFACE,
  impact: GUI_OPT_IMPACT_INTERFACE,
  evaluate: GUI_OPT_EVALUATE_INTERFACE,
  'pack-context': GUI_OPT_PACK_CONTEXT_INTERFACE,
  verify: GUI_OPT_VERIFY_INTERFACE,
  improve: GUI_OPT_IMPROVE_INTERFACE,
  report: GUI_OPT_REPORT_INTERFACE,
} as const);

export const AGENT_SUPERVISOR_SOURCE_PATH =
  'swissknife/web/js/apps/agent-supervisor.js' as const;

export const TARGET_REGISTRY = Object.freeze({
  'agent-supervisor': Object.freeze({
    target_id: 'agent-supervisor',
    application_id: AGENT_SUPERVISOR_APPLICATION_ID,
    screen_id: AGENT_SUPERVISOR_SCREEN_ID,
    source_paths: Object.freeze([AGENT_SUPERVISOR_SOURCE_PATH]),
    component_ids: Object.freeze(['comp:console-root', 'comp:goal-form']),
    kind: 'application',
  }),
} as const);

export const COMPONENT_REGISTRY = Object.freeze({
  'comp:console-root': Object.freeze({
    component_id: 'comp:console-root',
    target_id: 'agent-supervisor',
    source_path: AGENT_SUPERVISOR_SOURCE_PATH,
  }),
  'comp:goal-form': Object.freeze({
    component_id: 'comp:goal-form',
    target_id: 'agent-supervisor',
    source_path: AGENT_SUPERVISOR_SOURCE_PATH,
  }),
} as const);

export const VERIFY_ALIAS_REGISTRY = Object.freeze({
  'agent-supervisor-target': 'named_target_receipt',
  'current-tree': 'current_tree',
  'final-current-tree': 'current_tree',
} as const);

export const REPORT_ALIAS_REGISTRY = Object.freeze({
  'final-current-tree': 'final_current_tree',
  'benchmark-agent-supervisor': 'benchmark',
  'acceptance-security-audit': 'audit',
} as const);

export const HELP_TEXT = `gui-opt — Verified GUI Optimizer TypeScript CLI bridge

Usage:
  gui-opt --help
  gui-opt scan <target>
  gui-opt baseline <target>
  gui-opt impact <path-or-component>
  gui-opt evaluate <target>
  gui-opt pack-context <target> --objective <objective>
  gui-opt verify <worktree-or-patch-or-alias> [--receipt PATH] [--full]
  gui-opt improve <target> --objective <objective> [--isolated]
  gui-opt report <run-id-or-alias> [--require-complete] [--verify-receipts]

Targets resolve through the repository registry. Observation commands are
non-effectful. verify/improve/report are owned by the Python CLI and only
emit bridge receipts here.
`;

const PYTHON_OWNED = Object.freeze(
  new Set<GuiOptCommand>(['verify', 'improve', 'report']),
);
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const COMMAND_META_RE = /[;&|`$<>\n\r]|\$\(|\)/;
const WINDOWS_DRIVE_RE = /^[a-zA-Z]:/;
const URI_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const PATH_RE =
  /^(?!\/)(?!\.\.(?:\/|$))(?!.*\/\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._+/-]{0,511}$/;
const ALLOWED_PATH_PREFIXES = Object.freeze([
  'swissknife/web/js/apps/',
  'swissknife/web/js/',
  'swissknife/src/services/gui-optimizer/',
  'swissknife/test/fixtures/gui-optimizer/',
  'swissknife/test/unit/services/gui-optimizer/',
  'implementation_plan/evidence/verified_gui_optimizer/',
]);
const FORBIDDEN_FLAGS = Object.freeze([
  '--argv',
  '--cmd',
  '--command',
  '--cwd',
  '--env',
  '--exec',
  '--executable',
  '--file-path',
  '--host-path',
  '--python-process',
  '--shell',
  '--subprocess',
  '--working-directory',
]);
const COMMAND_FLAGS: Readonly<Record<GuiOptCommand, ReadonlySet<string>>> = {
  scan: new Set(),
  baseline: new Set(),
  impact: new Set(),
  evaluate: new Set([
    '--benchmark',
    '--expected-tasks',
    '--progress-interval-seconds',
  ]),
  'pack-context': new Set(['--objective']),
  verify: new Set(['--receipt', '--full']),
  improve: new Set(['--objective', '--isolated', '--request']),
  report: new Set([
    '--require-complete',
    '--verify-receipts',
    '--expected-tasks',
  ]),
};
const FLAGS_TAKING_VALUE = new Set([
  '--benchmark',
  '--expected-tasks',
  '--objective',
  '--progress-interval-seconds',
  '--receipt',
  '--request',
]);

const DEFAULT_SOURCE: GuiScanSourceInput = Object.freeze({
  path: AGENT_SUPERVISOR_SOURCE_PATH,
  content:
    'export function GoalForm() {\n  return document.createElement("label");\n}\n',
  language: 'javascript',
});

export interface GuiOptimizerCliRuntime {
  readonly sources?: readonly GuiScanSourceInput[];
  readonly revision?: string;
  readonly metrics?: Readonly<Record<string, number>>;
  readonly candidateMetrics?: Readonly<Record<string, number>>;
}

export interface GuiOptimizerCliRequest {
  readonly command: GuiOptCommand | 'help';
  readonly subject: string;
  readonly flags: Readonly<Record<string, string | boolean>>;
  readonly helpRequested: boolean;
}

export interface GuiOptimizerCliReceipt {
  readonly interface: typeof GUI_OPTIMIZER_CLI_RECEIPT_INTERFACE;
  readonly schema_version: typeof GUI_OPTIMIZER_CLI_RECEIPT_SCHEMA;
  readonly version: typeof GUI_OPTIMIZER_CLI_VERSION;
  readonly command: string;
  readonly command_interface: string;
  readonly subject: string;
  readonly ok: boolean;
  readonly exit_code: number;
  readonly reason_codes: readonly string[];
  readonly payload: Readonly<Record<string, unknown>>;
  readonly receipt_id: string;
}

export interface GuiOptimizerCliResult {
  readonly exitCode: number;
  readonly receipt: GuiOptimizerCliReceipt | null;
  readonly humanText: string;
  readonly reasonCodes: readonly string[];
}

export class GuiOptimizerCliError extends Error {
  readonly name = 'GuiOptimizerCliError';
  readonly reasonCode: string;
  readonly exitCode: number;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    message: string,
    reasonCode: string,
    exitCode = 2,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.reasonCode = reasonCode;
    this.exitCode = exitCode;
    this.details = Object.freeze({ ...details });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function looksLikePath(value: string): boolean {
  return (
    value.includes('/') ||
    value.includes('\\') ||
    value.startsWith('.') ||
    WINDOWS_DRIVE_RE.test(value) ||
    URI_RE.test(value)
  );
}

function rejectMeta(value: string, field: string): string {
  if (COMMAND_META_RE.test(value) || value.includes('\0')) {
    throw new GuiOptimizerCliError(
      `${field} contains forbidden command metacharacters`,
      'command_string_forbidden',
      3,
      { field },
    );
  }
  return value;
}

function requireIdentifier(value: string, field: string): string {
  const text = rejectMeta(value, field);
  if (!IDENTIFIER_RE.test(text)) {
    throw new GuiOptimizerCliError(
      `${field} is not a registry identifier`,
      'invalid_argument',
      2,
      { field, value },
    );
  }
  return text;
}

function allowlistedPath(value: string, field: string): string {
  const raw = rejectMeta(value.replace(/\\/g, '/'), field);
  if (
    raw.startsWith('/') ||
    raw.startsWith('~') ||
    raw.split('/').includes('..') ||
    WINDOWS_DRIVE_RE.test(raw) ||
    URI_RE.test(raw) ||
    !PATH_RE.test(raw)
  ) {
    throw new GuiOptimizerCliError(
      `${field} must be a repository-relative allowlisted path`,
      'path_absolute_or_traversal',
      3,
      { field, value },
    );
  }
  if (
    raw.split('/').some(part =>
      [
        'node_modules',
        'vendor',
        'dist',
        'build',
        '.git',
      ].includes(part),
    )
  ) {
    throw new GuiOptimizerCliError(
      `${field} contains a forbidden path segment`,
      'path_injection',
      3,
      { field, value: raw },
    );
  }
  if (!ALLOWED_PATH_PREFIXES.some(prefix => raw.startsWith(prefix))) {
    throw new GuiOptimizerCliError(
      `${field} is outside the CLI allowlist`,
      'path_outside_allowed_roots',
      3,
      { field, value: raw },
    );
  }
  return raw;
}

export function resolveTarget(targetId: string) {
  if (looksLikePath(targetId)) {
    throw new GuiOptimizerCliError(
      'targets resolve through the repository registry and cannot be paths',
      'path_injection',
      3,
      { target: targetId },
    );
  }
  const ident = requireIdentifier(targetId, 'target');
  const target = TARGET_REGISTRY[ident as keyof typeof TARGET_REGISTRY];
  if (target === undefined) {
    throw new GuiOptimizerCliError(`unknown target: ${ident}`, 'unknown_target', 2, {
      target: ident,
    });
  }
  return target;
}

export function parseGuiOptimizerCliArgs(
  argv: readonly string[],
): GuiOptimizerCliRequest {
  const tokens = argv.map(item => String(item));
  for (const token of tokens) {
    rejectMeta(token, 'argv');
    if ((FORBIDDEN_FLAGS as readonly string[]).includes(token)) {
      throw new GuiOptimizerCliError(
        `forbidden CLI flag: ${token}`,
        'forbidden_flag',
        3,
        { flag: token },
      );
    }
  }
  if (tokens.length === 0 || tokens[0] === '--help' || tokens[0] === '-h') {
    return {
      command: 'help',
      subject: '',
      flags: Object.freeze({}),
      helpRequested: true,
    };
  }
  const command = tokens[0];
  if (!(GUI_OPT_COMMANDS as readonly string[]).includes(command)) {
    throw new GuiOptimizerCliError(
      `unknown command: ${command}`,
      'unknown_command',
      2,
      { command },
    );
  }
  const typed = command as GuiOptCommand;
  const allowed = new Set<string>([
    ...COMMAND_FLAGS[typed],
    '--help',
    '-h',
    '--json',
  ]);
  const flags: Record<string, string | boolean> = {};
  let subject = '';
  const rest = tokens.slice(1);
  while (rest.length > 0) {
    const token = rest.shift() as string;
    if (token === '--help' || token === '-h') {
      return {
        command: typed,
        subject,
        flags: Object.freeze(flags),
        helpRequested: true,
      };
    }
    if (token === '--json') {
      flags.json = true;
      continue;
    }
    if (token.startsWith('-')) {
      if (!allowed.has(token)) {
        throw new GuiOptimizerCliError(
          `unknown flag for ${typed}: ${token}`,
          'unknown_flag',
          2,
          { command: typed, flag: token },
        );
      }
      if (FLAGS_TAKING_VALUE.has(token)) {
        const value = rest.shift();
        if (value === undefined || value.startsWith('-')) {
          throw new GuiOptimizerCliError(
            `${token} requires a value`,
            'invalid_argument',
            2,
            { flag: token },
          );
        }
        flags[token.slice(2)] = value;
      } else {
        flags[token.slice(2)] = true;
      }
      continue;
    }
    if (subject) {
      throw new GuiOptimizerCliError(
        `${typed} accepts exactly one subject`,
        'invalid_argument',
        2,
        { extra: token },
      );
    }
    subject = token;
  }
  if (!subject) {
    throw new GuiOptimizerCliError(
      `${typed} requires a registry subject`,
      'missing_subject',
      2,
      { command: typed },
    );
  }
  return {
    command: typed,
    subject,
    flags: Object.freeze(flags),
    helpRequested: false,
  };
}

function makeReceipt(input: {
  command: string;
  subject: string;
  ok: boolean;
  exitCode: number;
  reasonCodes: readonly string[];
  payload: Record<string, unknown>;
}): GuiOptimizerCliReceipt {
  const commandInterface =
    (COMMAND_INTERFACES as Record<string, string>)[input.command] ??
    GUI_OPTIMIZER_TYPESCRIPT_CLI_BRIDGE_INTERFACE;
  const body = {
    command: input.command,
    command_interface: commandInterface,
    exit_code: input.exitCode,
    interface: GUI_OPTIMIZER_CLI_RECEIPT_INTERFACE,
    ok: input.ok,
    payload: input.payload,
    reason_codes: [...input.reasonCodes],
    schema_version: GUI_OPTIMIZER_CLI_RECEIPT_SCHEMA,
    subject: input.subject,
    version: GUI_OPTIMIZER_CLI_VERSION,
  };
  const identity = canonicalIdentity(body, {
    domain: 'gui.cli-receipt',
    schemaVersion: GUI_OPTIMIZER_CLI_RECEIPT_SCHEMA,
  });
  return Object.freeze({
    ...body,
    receipt_id: identity.digest,
  });
}

function okResult(
  command: string,
  subject: string,
  reasonCodes: readonly string[],
  payload: Record<string, unknown>,
): GuiOptimizerCliResult {
  const receipt = makeReceipt({
    command,
    subject,
    ok: true,
    exitCode: 0,
    reasonCodes,
    payload,
  });
  return Object.freeze({
    exitCode: 0,
    receipt,
    humanText: `${command} ${subject} ok [${receipt.receipt_id}]`,
    reasonCodes,
  });
}

function failResult(
  command: string,
  subject: string,
  reasonCodes: readonly string[],
  payload: Record<string, unknown>,
  exitCode = 4,
): GuiOptimizerCliResult {
  const receipt = makeReceipt({
    command,
    subject,
    ok: false,
    exitCode,
    reasonCodes,
    payload,
  });
  return Object.freeze({
    exitCode,
    receipt,
    humanText: `${command} ${subject} failed [${receipt.receipt_id}]`,
    reasonCodes,
  });
}

function errorResult(
  error: GuiOptimizerCliError,
  command = 'unknown',
  subject = '',
): GuiOptimizerCliResult {
  const receipt = makeReceipt({
    command,
    subject,
    ok: false,
    exitCode: error.exitCode,
    reasonCodes: [error.reasonCode],
    payload: { details: error.details, message: error.message },
  });
  return Object.freeze({
    exitCode: error.exitCode,
    receipt,
    humanText: `${error.reasonCode}: ${error.message} [${receipt.receipt_id}]`,
    reasonCodes: [error.reasonCode],
  });
}

function defaultSources(
  runtime: GuiOptimizerCliRuntime | undefined,
): readonly GuiScanSourceInput[] {
  return runtime?.sources ?? [DEFAULT_SOURCE];
}

function scenarioIds(): readonly string[] {
  return Object.freeze(Object.values(STABLE_SCENARIO_IDS));
}

function defaultStateMachine(screenId: string) {
  return Object.freeze({
    interface: 'UiContextStateMachine@1' as const,
    schema_version: 'ui-context-state-machine/v1' as const,
    machine_id: 'sm:agent-supervisor',
    initial_state_id: 'state:ready',
    states: [
      makeUiStateDefinition({
        state_id: 'state:ready',
        kind: 'ready',
        screen_id: screenId,
        is_initial: true,
      }),
    ],
    events: [
      makeUiEventDefinition({
        event_id: 'event:submit',
        kind: 'submit',
        name: 'submit',
      }),
    ],
    transitions: [
      makeUiTransitionDefinition({
        transition_id: 'transition:ready-submit',
        from_state_id: 'state:ready',
        to_state_id: 'state:ready',
        event_id: 'event:submit',
        is_noop: true,
      }),
    ],
  });
}

function dispatch(
  request: GuiOptimizerCliRequest,
  runtime: GuiOptimizerCliRuntime | undefined,
): GuiOptimizerCliResult {
  if (request.helpRequested) {
    return Object.freeze({
      exitCode: 0,
      receipt: null,
      humanText: HELP_TEXT,
      reasonCodes: ['help'],
    });
  }
  const command = request.command as GuiOptCommand;
  if (PYTHON_OWNED.has(command)) {
    if (command === 'verify') {
      if (looksLikePath(request.subject) && !(request.subject in VERIFY_ALIAS_REGISTRY)) {
        allowlistedPath(request.subject, 'verify_subject');
      } else if (!(request.subject in VERIFY_ALIAS_REGISTRY)) {
        requireIdentifier(request.subject, 'verify_subject');
      }
      if (typeof request.flags.receipt === 'string') {
        allowlistedPath(request.flags.receipt, 'receipt');
      }
    } else if (command === 'improve') {
      resolveTarget(request.subject);
      if (typeof request.flags.objective !== 'string') {
        throw new GuiOptimizerCliError(
          'improve requires --objective',
          'missing_objective',
        );
      }
      return failResult(
        command,
        request.subject,
        ['isolated_worktree_required', 'python_owned_command'],
        {
          effectful: false,
          isolated: request.flags.isolated === true,
          owner: 'ipfs_accelerate_py.agent_supervisor.gui_optimizer.cli',
        },
      );
    } else {
      if (looksLikePath(request.subject) && !(request.subject in REPORT_ALIAS_REGISTRY)) {
        throw new GuiOptimizerCliError(
          'report run IDs are registry identifiers, not paths',
          'path_injection',
          3,
          { subject: request.subject },
        );
      }
      if (!(request.subject in REPORT_ALIAS_REGISTRY)) {
        requireIdentifier(request.subject, 'run_id');
      }
    }
    return okResult(
      command,
      request.subject,
      ['python_owned_command'],
      {
        effectful: false,
        owner: 'ipfs_accelerate_py.agent_supervisor.gui_optimizer.cli',
        subject: request.subject,
      },
    );
  }

  if (command === 'impact') {
    const component =
      COMPONENT_REGISTRY[request.subject as keyof typeof COMPONENT_REGISTRY];
    const sourcePath = component
      ? component.source_path
      : allowlistedPath(request.subject, 'impact_subject');
    const target = component
      ? TARGET_REGISTRY[component.target_id]
      : Object.values(TARGET_REGISTRY).find(item =>
          (item.source_paths as readonly string[]).includes(sourcePath),
        );
    if (target === undefined) {
      throw new GuiOptimizerCliError(
        'impact subject is not a registered component or target path',
        'unknown_subject',
        3,
        { subject: request.subject },
      );
    }
    const changeSet = makeUiChangeSet({
      change_set_id: `change:${component?.component_id ?? 'path'}`,
      change_kinds: ['component_implementation'],
      file_paths: [sourcePath],
      component_ids: component ? [component.component_id] : [...target.component_ids],
    });
    const plan = planUiInvalidation(changeSet, {
      context: {
        application_id: target.application_id,
        screen_id: target.screen_id,
        known_component_ids: [...target.component_ids],
        known_scenario_ids: [...scenarioIds()],
      },
    });
    return okResult(
      command,
      request.subject,
      ['target_resolved'],
      {
        effectful: false,
        impact: {
          component_id: component?.component_id ?? '',
          kind: component ? 'component' : 'path',
          source_path: sourcePath,
          target,
        },
        invalidation_plan: plan,
      },
    );
  }

  const target = resolveTarget(request.subject);
  const sources = defaultSources(runtime);
  const revision = runtime?.revision ?? 'rev:cli-bridge';

  if (command === 'scan') {
    const scan = scanGuiSources(sources, {
      applicationId: target.application_id,
      screenId: target.screen_id,
    });
    return okResult(
      command,
      request.subject,
      ['target_resolved'],
      {
        effectful: false,
        finding_count: scan.findings.length,
        scan_schema: scan.schema_version,
        target,
      },
    );
  }

  if (command === 'baseline') {
    const compiled = compileUiBaseline({
      application_id: target.application_id,
      screen_id: target.screen_id,
      repository_revision: revision,
      scenario_ids: scenarioIds(),
      metrics: runtime?.metrics ?? {},
    });
    return okResult(
      command,
      request.subject,
      ['target_resolved'],
      {
        baseline_id: compiled.baseline.baseline_id,
        baseline_digest: compiled.baseline_identity.digest,
        effectful: false,
        target,
      },
    );
  }

  if (command === 'evaluate') {
    const evaluation = evaluateObjective({
      application_id: target.application_id,
      screen_id: target.screen_id,
      repository_revision: revision,
      objective_id: 'unlabeled_control_count',
      scenario_ids: scenarioIds(),
      baseline_metrics: runtime?.metrics ?? { unlabeled_control_count: 1 },
      candidate_metrics: runtime?.candidateMetrics ?? { unlabeled_control_count: 0 },
    });
    return okResult(
      command,
      request.subject,
      ['target_resolved'],
      {
        decision: evaluation.decision.decision,
        effectful: false,
        measurable_improvement: evaluation.decision.measurable_improvement,
        target,
      },
    );
  }

  if (command === 'pack-context') {
    const objective = request.flags.objective;
    if (typeof objective !== 'string' || objective.trim() === '') {
      throw new GuiOptimizerCliError(
        'pack-context requires --objective',
        'missing_objective',
      );
    }
    const pack = buildGuiContextPack({
      repository_state: {
        revision,
        application_id: target.application_id,
        screen_id: target.screen_id,
        sources: sources.map(item => ({
          path: item.path,
          content: item.content,
          component_id: 'comp:goal-form',
          application_id: target.application_id,
          screen_id: target.screen_id,
          editable: true,
        })),
        state_machine: defaultStateMachine(target.screen_id),
      },
      application_id: target.application_id,
      screen_id: target.screen_id,
      objective,
      token_budget: 8000,
    });
    return okResult(
      command,
      request.subject,
      ['target_resolved'],
      {
        effectful: false,
        objective,
        pack_id: pack.pack_id,
        raw_source_tokens: pack.raw_source_tokens,
        target,
      },
    );
  }

  throw new GuiOptimizerCliError(
    `unknown command: ${command}`,
    'unknown_command',
  );
}

export function runGuiOptimizerCli(
  argv: readonly string[],
  runtime?: GuiOptimizerCliRuntime,
): GuiOptimizerCliResult {
  const command = argv[0] ?? 'unknown';
  const subject =
    argv[1] !== undefined && !String(argv[1]).startsWith('-') ? String(argv[1]) : '';
  try {
    const request = parseGuiOptimizerCliArgs(argv);
    return dispatch(request, runtime);
  } catch (error) {
    if (error instanceof GuiOptimizerCliError) {
      return errorResult(error, command, subject);
    }
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(
      new GuiOptimizerCliError(message, 'invalid_argument', 4),
      command,
      subject,
    );
  }
}

export function formatGuiOptimizerCliHelp(): string {
  return HELP_TEXT;
}
