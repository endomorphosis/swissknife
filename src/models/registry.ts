// src/models/registry.ts

import { BaseModel } from '../ai/models/model';
import { logger } from '../utils/logger';
import { ConfigManager } from '../config/manager';

/**
 * Interface for model capabilities
 */
export interface ModelCapability {
  id: string;
  name: string;
  description: string;
}

/**
 * Common model capabilities
 */
export const ModelCapabilities = {
  TEXT_GENERATION: {
    id: 'text-generation',
    name: 'Text Generation',
    description: 'Generate text based on prompt'
  },
  TEXT_EMBEDDING: {
    id: 'text-embedding',
    name: 'Text Embedding',
    description: 'Generate embeddings from text'
  },
  CODE_GENERATION: {
    id: 'code-generation',
    name: 'Code Generation',
    description: 'Generate code based on specifications'
  },
  IMAGE_GENERATION: {
    id: 'image-generation',
    name: 'Image Generation',
    description: 'Generate images based on text prompts'
  },
  IMAGE_ANALYSIS: {
    id: 'image-analysis',
    name: 'Image Analysis',
    description: 'Analyze and extract information from images'
  },
  AUDIO_TRANSCRIPTION: {
    id: 'audio-transcription',
    name: 'Audio Transcription',
    description: 'Transcribe speech to text'
  }
};

/**
 * Model definition interface
 */
export interface ModelDefinition {
  id: string;
  name: string;
  providerId: string;
  description: string;
  capabilities: ModelCapability[];
  properties: Record<string, any>;
  compatibilityTags?: string[];
  contextSize?: number;
}

/**
 * Model provider interface
 */
export interface ModelProvider {
  id: string;
  name: string;
  description: string;
  isAvailable(): Promise<boolean>;
  getModels(): Promise<ModelDefinition[]>;
  getModelById(modelId: string): Promise<ModelDefinition | null>;
}

/**
 * Manages the registration and retrieval of AI models
 */
export class ModelRegistry {
  private static instance: ModelRegistry;
  private models: Map<string, BaseModel> = new Map();
  private providers: Map<string, BaseModel[]> = new Map();
  private config: ConfigManager;
  private defaultModel?: string;
  
  private constructor() {
    this.config = ConfigManager.getInstance();
    this.defaultModel = this.config.get<string>('ai.defaultModel');
    logger.debug('ModelRegistry initialized');
  }
  
  /**
   * Gets the singleton instance of the ModelRegistry
   */
  static getInstance(): ModelRegistry {
    if (!ModelRegistry.instance) {
      ModelRegistry.instance = new ModelRegistry();
    }
    return ModelRegistry.instance;
  }
  
  /**
   * Registers a model with the registry
   * @param model Model to register
   */
  registerModel(model: BaseModel): void {
    if (this.models.has(model.id)) {
      logger.warn(`Model with ID ${model.id} already registered, overwriting`);
    }
    
    this.models.set(model.id, model);
    
    // Add to provider map
    const provider = model.getProvider();
    if (!this.providers.has(provider)) {
      this.providers.set(provider, []);
    }
    
    this.providers.get(provider)!.push(model);
    logger.debug(`Registered model: ${model.id} (provider: ${provider})`);
  }
  
  /**
   * Gets a model by ID
   * @param id Model ID
   * @returns The model or undefined if not found
   */
  async getModel(id: string): Promise<BaseModel | undefined> {
    // If ID is 'default', use the configured default model
    if (id === 'default') {
      if (this.defaultModel) {
        return this.models.get(this.defaultModel);
      } else if (this.models.size > 0) {
        // If no default is set but we have models, return the first one
        return [...this.models.values()][0];
      }
      return undefined;
    }
    
    return this.models.get(id);
  }
  
  /**
   * Gets a model by ID synchronously
   * @param id Model ID
   * @returns The model or undefined if not found
   */
  getModelSync(id: string): BaseModel | undefined {
    // If ID is 'default', use the configured default model
    if (id === 'default') {
      if (this.defaultModel) {
        return this.models.get(this.defaultModel);
      } else if (this.models.size > 0) {
        // If no default is set but we have models, return the first one
        return [...this.models.values()][0];
      }
      return undefined;
    }
    
    return this.models.get(id);
  }
  
  /**
   * Gets all registered models
   * @returns All registered models
   */
  getAllModels(): BaseModel[] {
    return Array.from(this.models.values());
  }
  
  /**
   * Gets models from a specific provider
   * @param provider Provider name
   * @returns All models from the provider
   */
  getProviderModels(provider: string): BaseModel[] {
    return this.providers.get(provider) || [];
  }
  
  /**
   * Gets a list of all registered providers
   */
  getProviders(): string[] {
    return Array.from(this.providers.keys());
  }
  
  /**
   * Finds models with a specific capability
   * @param capability The capability to search for
   * @returns Models with the capability
   */
  findModelsByCapability(_capability: string): BaseModel[] {
    // Note: BaseModel interface doesn't include capabilities
    // This method returns all models for now
    return this.getAllModels();
  }
  
  /**
   * Sets the default model
   * @param modelId ID of the model to set as default
   * @returns true if successful, false if the model doesn't exist
   */
  setDefaultModel(modelId: string): boolean {
    if (!this.models.has(modelId)) {
      return false;
    }
    
    this.defaultModel = modelId;
    this.config.set('ai.defaultModel', modelId);
    logger.debug(`Set default model to ${modelId}`);
    return true;
  }
  
  /**
   * Gets the current default model
   */
  getDefaultModel(): BaseModel | undefined {
    if (!this.defaultModel) {
      return undefined;
    }
    
    return this.models.get(this.defaultModel);
  }
  
  /**
   * Removes a model from the registry
   * @param id Model ID to remove
   * @returns true if removed, false if not found
   */
  unregisterModel(id: string): boolean {
    const model = this.models.get(id);
    if (!model) {
      return false;
    }
    
    this.models.delete(id);
    
    // Remove from provider list
    const provider = model.getProvider();
    const providerModels = this.providers.get(provider);
    if (providerModels) {
      const index = providerModels.findIndex(m => m.id === id);
      if (index !== -1) {
        providerModels.splice(index, 1);
      }
      
      // If provider has no more models, remove the provider entry
      if (providerModels.length === 0) {
        this.providers.delete(provider);
      }
    }
    
    // If this was the default model, reset default
    if (this.defaultModel === id) {
      this.defaultModel = undefined;
      this.config.set('ai.defaultModel', undefined);
    }
    
    logger.debug(`Unregistered model: ${id}`);
    return true;
  }
}