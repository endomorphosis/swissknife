/**
 * Lightweight API compatibility wrappers.
 *
 * TypeScript port of ipfs_datasets_py/logic/api.py remainders.
 */

export interface EvaluateWithManagerOptions {
  actor?: string | null;
  leafCid?: string | null;
  leaf_cid?: string | null;
  atTime?: number | null;
  at_time?: number | null;
  manager?: unknown;
  auditLog?: unknown;
  audit_log?: unknown;
  bridge?: {
    evaluateAuditedWithManager?: (...args: unknown[]) => unknown;
    evaluate_audited_with_manager?: (...args: unknown[]) => unknown;
  } | null;
}

export function evaluateWithManager(
  policyCid: string,
  tool: string,
  options: EvaluateWithManagerOptions = {},
): unknown | null {
  const bridge = options.bridge;
  const evaluator = bridge?.evaluateAuditedWithManager ?? bridge?.evaluate_audited_with_manager;
  if (!evaluator) return null;
  return evaluator.call(bridge, policyCid, {
    tool,
    actor: options.actor ?? null,
    leaf_cid: options.leaf_cid ?? options.leafCid ?? null,
    at_time: options.at_time ?? options.atTime ?? null,
    manager: options.manager ?? null,
    audit_log: options.audit_log ?? options.auditLog ?? null,
  });
}

export interface CompileExplainIterOptions {
  policyId?: string | null;
  policy_id?: string | null;
  maxLines?: number | null;
  max_lines?: number | null;
  compiler?: {
    compileExplainIter?: (sentences: string[], options?: Record<string, unknown>) => Iterable<string>;
    compile_explain_iter?: (sentences: string[], options?: Record<string, unknown>) => Iterable<string>;
  } | null;
}

export function* compileExplainIter(
  sentences: string[],
  options: CompileExplainIterOptions = {},
): Generator<string> {
  const compiler = options.compiler;
  const delegate = compiler?.compileExplainIter ?? compiler?.compile_explain_iter;
  const policyId = options.policy_id ?? options.policyId ?? null;
  const maxLines = options.max_lines ?? options.maxLines ?? null;

  if (delegate) {
    let yielded = 0;
    for (const line of delegate.call(compiler, sentences, { policy_id: policyId, max_lines: maxLines })) {
      if (maxLines !== null && yielded >= maxLines) break;
      yielded += 1;
      yield line;
    }
    return;
  }

  const prefix = policyId ? `[${policyId}] ` : '';
  for (let index = 0; index < sentences.length; index += 1) {
    if (maxLines !== null && index >= maxLines) break;
    yield `${prefix}${index + 1}. ${sentences[index]}`;
  }
}

export const evaluate_with_manager = evaluateWithManager;
export const compile_explain_iter = compileExplainIter;
