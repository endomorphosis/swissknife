// src/ai/models/model.ts
import { 
    ModelOptions, 
    IModel, 
    ModelGenerateInput, 
    ModelGenerateOutput 
} from '@src/types/ai';
import { Status } from '@src/types/common';

export type { IModel, ModelOptions, ModelGenerateInput, ModelGenerateOutput };

export class BaseModel implements IModel {
  readonly id: string;
  private name: string;
  private provider: string;
  private parameters: Record<string, any>;
  private metadata: Record<string, any>;
  private lastUsageMetrics: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  } | null = null;

  constructor(options: ModelOptions) {
    this.id = options.id;
    this.name = options.name;
    this.provider = options.provider;
    this.parameters = options.parameters || {};
    this.metadata = options.metadata || {};
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  getProvider(): string {
    return this.provider;
  }

  getParameters(): Record<string, any> {
    return { ...this.parameters };
  }

  getMetadata(): Record<string, any> {
    return { ...this.metadata };
  }

  setParameter(key: string, value: any): void {
    this.parameters[key] = value;
  }

  async generate(input: ModelGenerateInput): Promise<ModelGenerateOutput> {
    // Placeholder for actual model generation logic
    console.log(`Model [${this.name}] generating for prompt: "${input.prompt.substring(0, 50)}..."`);
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async work

    // Simulate a basic response
    const outputContent = `Response from ${this.name} to: "${input.prompt.substring(0, 30)}..."`;
    
    // Calculate usage metrics
    const usage = {
      promptTokens: input.prompt.length / 4, // Rough estimate
      completionTokens: outputContent.length / 4, // Rough estimate
      totalTokens: (input.prompt.length + outputContent.length) / 4,
    };
    
    // Store the usage metrics for later retrieval
    this.lastUsageMetrics = usage;
    
    return {
      content: outputContent,
      status: Status.COMPLETED, // Assuming Status enum from common.ts
      modelUsed: this.id,
      usage,
      cost: 0.0001, // Placeholder cost
    };
  }
  
  /**
   * Retrieves the usage metrics from the last generation
   * @returns Promise resolving to the usage metrics
   */
  async getLastUsageMetrics(): Promise<{
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  }> {
    return this.lastUsageMetrics || {};
  }
}

export interface ModelCapabilities {
  streaming: boolean;
  tools: boolean;
  structuredOutput: boolean;
  images?: boolean; // Added based on usage in openai-factory.ts
}
