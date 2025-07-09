// src/ai/multi-agent/ConflictResolver.ts
import { ConflictType, ResolutionStrategy, AgentConflict, ConflictResolution, ResolutionType } from '../../types/ai';
  private resolutionStrategies: Map<ConflictType, ResolutionStrategy> = new Map();

  async resolveConflict(conflict: AgentConflict): Promise<ConflictResolution> {
    const strategy = this.resolutionStrategies.get(conflict.type);
    
    if (!strategy) {
      return this.defaultResolution(conflict);
    }
    
    return await strategy.resolve(conflict);
  }

  registerStrategy(type: ConflictType, strategy: ResolutionStrategy): void {
    this.resolutionStrategies.set(type, strategy);
  }

  private async defaultResolution(conflict: AgentConflict): Promise<ConflictResolution> {
    // Priority-based resolution
    const winner = conflict.participants.reduce((prev, current) => 
      prev.priority > current.priority ? prev : current
    );
    
    return {
      resolution: ResolutionType.PRIORITY_BASED,
      winner: winner.agentId,
      details: `Resolved in favor of ${winner.agentId} based on priority`
    };
  }
}