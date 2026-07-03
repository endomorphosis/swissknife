/**
 * Proof Explainer — T-214 (Sprint 48)
 *
 * Port of ipfs_datasets_py/logic/TDFOL/proof_explainer.py
 *
 * Generates human-readable explanations of TDFOL proofs, converting
 * formal proof steps into natural language descriptions.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Types of proofs that can be explained. */
export enum ProofType {
  FORWARD_CHAINING  = 'forward_chaining',
  BACKWARD_CHAINING = 'backward_chaining',
  MODAL_TABLEAUX    = 'modal_tableaux',
  ZKP               = 'zkp',
  HYBRID            = 'hybrid',  // PORT-082: LLM-guided sketch + locally verified
}

/** Level of detail in the generated explanation. */
export enum ExplanationLevel {
  BRIEF    = 'brief',
  NORMAL   = 'normal',
  DETAILED = 'detailed',
  VERBOSE  = 'verbose',
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/** A single step in a proof. */
export interface ProofStep {
  stepNumber: number;
  action: string;
  ruleName?: string;
  premises: string[];
  conclusion: string;
  justification: string;
}

/** Compute natural-language text for a ProofStep. */
export function proofStepNL(step: ProofStep): string {
  if (step.ruleName) {
    return `Step ${step.stepNumber}: Applied ${step.ruleName} to derive ${step.conclusion}`;
  }
  return `Step ${step.stepNumber}: ${step.action}`;
}

/** Complete explanation of a proof attempt. */
export interface ProofExplanation {
  formula: string;
  isProved: boolean;
  proofType: ProofType;
  steps: ProofStep[];
  summary: string;
  inferenceChain: string[];
  statistics: Record<string, unknown>;
}

/** Render a ProofExplanation to a human-readable string. */
export function proofExplanationToString(exp: ProofExplanation): string {
  const lines: string[] = [];
  lines.push(`Proof of: ${exp.formula}`);
  lines.push(`Result: ${exp.isProved ? '✓ PROVED' : '✗ NOT PROVED'}`);
  lines.push(`Method: ${exp.proofType}`);
  lines.push('');

  if (exp.summary) {
    lines.push('Summary:');
    lines.push(`  ${exp.summary}`);
    lines.push('');
  }

  if (exp.steps.length > 0) {
    lines.push(`Proof Steps (${exp.steps.length}):`);
    for (const step of exp.steps) {
      lines.push(`  ${proofStepNL(step)}`);
    }
    lines.push('');
  }

  if (exp.inferenceChain.length > 0) {
    lines.push('Reasoning Chain:');
    exp.inferenceChain.forEach((item, i) => lines.push(`  ${i + 1}. ${item}`));
    lines.push('');
  }

  if (Object.keys(exp.statistics).length > 0) {
    lines.push('Statistics:');
    for (const [k, v] of Object.entries(exp.statistics)) {
      lines.push(`  ${k}: ${v}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Rule description templates
// ---------------------------------------------------------------------------

const RULE_DESCRIPTIONS: Record<string, string> = {
  ModusPonens:             'Given {p} → {q} and {p}, we conclude {q}',
  ModusTollens:            'Given {p} → {q} and ¬{q}, we conclude ¬{p}',
  HypotheticalSyllogism:   'Given {p} → {q} and {q} → {r}, we conclude {p} → {r}',
  DisjunctiveSyllogism:    'Given {p} ∨ {q} and ¬{p}, we conclude {q}',
  AlwaysDistribution:      '□(P ∧ Q) distributes to □P ∧ □Q',
  EventuallyAggregation:   '◊P ∨ ◊Q implies ◊(P ∨ Q)',
  TemporalInduction:       'Given □(P → XP) and P, we prove □P by induction',
  ObligationWeakening:     'O(P ∧ Q) implies O(P) — obligations weaken',
  DeonticDetachment:       'Given O(P → Q) and P, we conclude O(Q)',
  ContraryToDuty:          'When O(P) but ¬P holds, obligation to repair follows',
  NecessityRule:           'If ⊢ P, then ⊢ □P (necessitation)',
  KAxiom:                  '□(P → Q) → (□P → □Q) — K axiom schema',
  TAxiom:                  '□P → P — reflexivity axiom',
  AxiomIntroduction:       'Introduce axiom schema',
};

// ---------------------------------------------------------------------------
// ProofExplainer
// ---------------------------------------------------------------------------

/**
 * Generates human-readable explanations of TDFOL proofs.
 *
 * TypeScript port of `ProofExplainer` from
 * `ipfs_datasets_py/logic/TDFOL/proof_explainer.py`.
 */
export class ProofExplainer {
  private readonly level: ExplanationLevel;

  constructor(level: ExplanationLevel = ExplanationLevel.NORMAL) {
    this.level = level;
  }

  /**
   * Generate a complete explanation for a proof.
   *
   * @param formula   - The formula string that was proved.
   * @param rawSteps  - Raw proof step objects (rule_name / action / premises / conclusion).
   * @param proofType - Type of proof.
   * @param isProved  - Whether the proof succeeded.
   */
  explainProof(
    formula: string,
    rawSteps: Array<Record<string, unknown>>,
    proofType: ProofType,
    isProved = true,
  ): ProofExplanation {
    const steps = this._buildSteps(rawSteps, proofType);
    const summary = this._generateSummary(formula, steps, proofType, isProved);
    const inferenceChain = this._extractReasoningChain(steps);
    const statistics = this._computeStatistics(steps);

    return { formula, isProved, proofType, steps, summary, inferenceChain, statistics };
  }

  /**
   * Explain a ZKP proof (specialisation of explainProof).
   *
   * @param formula   - The proved formula.
   * @param zkpData   - ZKP-specific data (backend, securityLevel, proofBytes length).
   * @param isProved  - Whether the proof succeeded.
   */
  explainZkpProof(
    formula: string,
    zkpData: { backend?: string; securityLevel?: number; proofBytesLength?: number },
    isProved = true,
  ): ProofExplanation {
    const steps: ProofStep[] = [
      {
        stepNumber: 1,
        action: 'Generate ZKP circuit',
        ruleName: 'ZKP_SETUP',
        premises: [formula],
        conclusion: 'circuit_ready',
        justification: `Using ${zkpData.backend ?? 'simulated'} backend (${zkpData.securityLevel ?? 128}-bit security)`,
      },
      {
        stepNumber: 2,
        action: 'Generate witness',
        ruleName: 'ZKP_WITNESS',
        premises: ['circuit_ready'],
        conclusion: 'witness_generated',
        justification: 'Compute satisfying assignment for circuit inputs',
      },
      {
        stepNumber: 3,
        action: 'Generate proof',
        ruleName: 'ZKP_PROVE',
        premises: ['witness_generated'],
        conclusion: isProved ? 'proof_valid' : 'proof_failed',
        justification: isProved
          ? `Generated ${zkpData.proofBytesLength ?? 0} byte proof`
          : 'Proof generation failed',
      },
    ];

    const summary = isProved
      ? `Formula proved with zero-knowledge proof (${zkpData.backend ?? 'simulated'} backend). The proof hides the axioms used while guaranteeing validity.`
      : 'Zero-knowledge proof generation failed.';

    return {
      formula,
      isProved,
      proofType: ProofType.ZKP,
      steps,
      summary,
      inferenceChain: ['ZKP circuit setup', 'Witness generation', 'Proof generation'],
      statistics: {
        backend: zkpData.backend ?? 'simulated',
        securityLevel: zkpData.securityLevel ?? 128,
        proofBytesLength: zkpData.proofBytesLength ?? 0,
        stepCount: steps.length,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _buildSteps(rawSteps: Array<Record<string, unknown>>, proofType: ProofType): ProofStep[] {
    return rawSteps.map((raw, i) => ({
      stepNumber: i + 1,
      action: String(raw['action'] ?? raw['rule_name'] ?? `Step ${i + 1}`),
      ruleName: raw['rule_name'] ? String(raw['rule_name']) : undefined,
      premises: (raw['premises'] as string[] | undefined) ?? [],
      conclusion: String(raw['conclusion'] ?? ''),
      justification: raw['justification']
        ? String(raw['justification'])
        : (raw['rule_name'] ? (RULE_DESCRIPTIONS[String(raw['rule_name'])] ?? '') : ''),
    }));
  }

  private _generateSummary(
    formula: string,
    steps: ProofStep[],
    proofType: ProofType,
    isProved: boolean,
  ): string {
    if (!isProved) {
      return `Could not prove '${formula}' using ${proofType.replace(/_/g, ' ')}.`;
    }

    const ruleNames = [...new Set(steps.map(s => s.ruleName).filter(Boolean))];
    const keyRules = ruleNames.slice(0, 3).join(', ');

    if (this.level === ExplanationLevel.BRIEF) {
      return `'${formula}' proved in ${steps.length} steps.`;
    }
    return `Formula '${formula}' was proved via ${proofType.replace(/_/g, ' ')} in ${steps.length} steps using ${keyRules || 'axiom instantiation'}.`;
  }

  private _extractReasoningChain(steps: ProofStep[]): string[] {
    return steps
      .filter(s => s.ruleName || s.justification)
      .map(s => s.justification || `Applied ${s.ruleName}`);
  }

  private _computeStatistics(steps: ProofStep[]): Record<string, unknown> {
    const ruleCounts: Record<string, number> = {};
    for (const step of steps) {
      const r = step.ruleName ?? 'unknown';
      ruleCounts[r] = (ruleCounts[r] ?? 0) + 1;
    }
    return {
      stepCount: steps.length,
      distinctRules: Object.keys(ruleCounts).length,
      ruleCounts,
    };
  }
}

// ---------------------------------------------------------------------------
// Module-level convenience functions
// ---------------------------------------------------------------------------

/** Convenience wrapper: create a default explainer and explain a proof. */
export function explainProof(
  formula: string,
  rawSteps: Array<Record<string, unknown>>,
  proofType: ProofType,
  isProved = true,
  level = ExplanationLevel.NORMAL,
): ProofExplanation {
  return new ProofExplainer(level).explainProof(formula, rawSteps, proofType, isProved);
}

/** Convenience wrapper: create a default explainer and explain a ZKP proof. */
export function explainZkpProof(
  formula: string,
  zkpData: { backend?: string; securityLevel?: number; proofBytesLength?: number },
  isProved = true,
  level = ExplanationLevel.NORMAL,
): ProofExplanation {
  return new ProofExplainer(level).explainZkpProof(formula, zkpData, isProved);
}
