// src/ai/models/IntelligentSelector.ts
export class IntelligentModelSelector {
  private selectionRules: ModelSelectionRule[] = [];
  private learningEngine: SelectionLearningEngine;

  constructor() {
    this.initializeDefaultRules();
    this.learningEngine = new SelectionLearningEngine();
  }

  private initializeDefaultRules(): void {
    this.selectionRules = [
      {
        condition: (req) => req.type === 'code_generation',
        modelPreference: ['gpt-4', 'claude-3-sonnet', 'codestral'],
        reason: 'Code generation requires high precision and logical reasoning'
      },
      {
        condition: (req) => req.type === 'creative_writing',
        modelPreference: ['gpt-4', 'claude-3-opus', 'gemini-pro'],
        reason: 'Creative tasks benefit from models with strong language capabilities'
      },
      {
        condition: (req) => req.length > 10000,
        modelPreference: ['claude-3-sonnet', 'gpt-4-turbo', 'gemini-pro'],
        reason: 'Long context requires models with large context windows'
      },
      {
        condition: (req) => req.priority === 'high' && req.latency === 'low',
        modelPreference: ['gpt-3.5-turbo', 'claude-3-haiku'],
        reason: 'High priority with low latency requirements favor faster models'
      }
    ];
  }

  async selectModel(request: ModelRequest): Promise<ModelSelection> {
    // Apply rule-based selection
    const ruleBasedSelection = this.applyRules(request);
    
    // Apply machine learning selection
    const mlSelection = await this.learningEngine.predictOptimalModel(request);
    
    // Combine and weight the selections
    const finalSelection = this.combineSelections(ruleBasedSelection, mlSelection);
    
    return finalSelection;
  }

  private applyRules(request: ModelRequest): ModelSelection {
    const applicableRules = this.selectionRules.filter(rule => rule.condition(request));
    
    if (applicableRules.length === 0) {
      return { model: 'gpt-4', confidence: 0.5, reason: 'Default selection' };
    }
    
    // Weight rules by specificity and combine preferences
    const weightedPreferences = new Map<string, number>();
    
    applicableRules.forEach(rule => {
      const weight = this.calculateRuleWeight(rule, request);
      rule.modelPreference.forEach((model, index) => {
        const preference = weight / (index + 1); // First preference gets full weight
        weightedPreferences.set(model, (weightedPreferences.get(model) || 0) + preference);
      });
    });
    
    // Select model with highest weighted preference
    const topModel = Array.from(weightedPreferences.entries())
      .sort((a, b) => b[1] - a[1])[0];
    
    return {
      model: topModel[0],
      confidence: Math.min(topModel[1] / applicableRules.length, 1.0),
      reason: `Rule-based selection: ${applicableRules.map(r => r.reason).join('; ')}`
    };
  }
}