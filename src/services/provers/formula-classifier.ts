/**
 * FormulaClassifier — policy complexity heuristic for local prover routing.
 *
 * Mirrors the lightweight role of Python's FormulaAnalyzer: classify a policy
 * into the cheapest local prover tier that can handle it.
 */

import type { Policy } from '../mcp-policy.js';
import type { FormulaClass } from './prover-types.js';

export class FormulaClassifier {
  classifyPolicy(policy: Policy): FormulaClass {
    return classifyPolicy(policy);
  }

  classify(policy: Policy): FormulaClass {
    return this.classifyPolicy(policy);
  }
}

export function classifyPolicy(policy: Policy): FormulaClass {
  if (policy.temporal) return 'temporal';

  for (const obligation of policy.obligations ?? []) {
    if (obligation.deadline !== undefined) return 'temporal';
  }

  const totalRules =
    (policy.permissions?.length ?? 0) +
    (policy.prohibitions?.length ?? 0) +
    (policy.obligations?.length ?? 0);
  if (totalRules > 20) return 'higher_order';

  const hasObligations = (policy.obligations?.length ?? 0) > 0;
  const hasProhibitions = (policy.prohibitions?.length ?? 0) > 0;
  if (hasObligations || hasProhibitions) return 'modal_deontic';

  const hasWildcard =
    (policy.permissions ?? []).some(permission => permission.cap === '*' || permission.rsc === '*') ||
    (policy.prohibitions ?? []).some(prohibition => prohibition.cap === '*' || prohibition.rsc === '*');
  if (hasWildcard) return 'fol';

  return 'propositional';
}

export function createFormulaClassifier(): FormulaClassifier {
  return new FormulaClassifier();
}
