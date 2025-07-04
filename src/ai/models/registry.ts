// src/ai/models/registry.ts
import { BaseModel as Model, IModel, ModelOptions } from './model.js';

export interface LazyModel {
  id: string;
  loader: () => Promise<Model>;
}

export class ModelRegistry {
  private static instance: ModelRegistry;
  private models: Map<string, Model | LazyModel> = new Map();
  private defaultModelId: string | null = null;

  private constructor() {}
  
  public static getInstance(): ModelRegistry {
    if (!ModelRegistry.instance) {
      ModelRegistry.instance = new ModelRegistry();
    }
    return ModelRegistry.instance;
  }
  
  public registerModel(model: Model | LazyModel): void {
    if ('loader' in model) {
      this.models.set(model.id, model);
      console.log(`Lazy model registered: ${model.id}`);
    } else {
      this.models.set((model as Model).getId(), model as Model);
      if (this.defaultModelId === null) {
        this.defaultModelId = (model as Model).getId();
      }
      console.log(`Model registered: ${(model as Model).getName()} (ID: ${(model as Model).getId()})`);
    }
  }
  
  public getModel(id: string): Model | undefined {
    const model = this.models.get(id);
    
    if (!model) {
      if (id === 'default' && this.defaultModelId) {
        return this.getModel(this.defaultModelId);
      }
      console.warn(`Model with ID "${id}" not found in registry.`);
      return undefined;
    }
    
    if ('loader' in model) {
      // For lazy models, we handle them in getModelAsync
      console.warn(`Model with ID "${id}" is a lazy model. Use getModelAsync instead.`);
      return undefined;
    }
    
    return model as Model;
  }
  
  public async getModelAsync(id: string): Promise<Model | undefined> {
    const model = this.models.get(id);
    
    if (!model) {
      if (id === 'default' && this.defaultModelId) {
        return this.getModelAsync(this.defaultModelId);
      }
      console.warn(`Model with ID "${id}" not found in registry.`);
      return undefined;
    }
    
    if ('loader' in model) {
      const loadedModel = await model.loader();
      this.models.set(id, loadedModel);
      return loadedModel;
    }
    
    return model as Model;
  }
  
  // Type guard to ensure the returned model is compatible with IModel
  public getIModel(id: string): IModel | undefined {
    const modelInstance = this.getModel(id);
    if (modelInstance && 'generate' in modelInstance) { 
      return modelInstance;
    }
    return undefined;
  }
  
  // Async version of getIModel
  public async getIModelAsync(id: string): Promise<IModel | undefined> {
    const modelInstance = await this.getModelAsync(id);
    if (modelInstance && 'generate' in modelInstance) { 
      return modelInstance;
    }
    return undefined;
  }

  public setDefaultModel(id: string): boolean {
    if (this.models.has(id)) {
      this.defaultModelId = id;
      console.log(`Default model set to: ${id}`);
      return true;
    }
    console.warn(`Failed to set default model: ID "${id}" not found.`);
    return false;
  }

  public getAllModels(): Model[] {
    const models = Array.from(this.models.values());
    return models
      .filter(model => !('loader' in model))
      .map(model => model as Model);
  }
  
  public async getAllModelsAsync(): Promise<Model[]> {
    const models = Array.from(this.models.values());
    return await Promise.all(models.map(async (model) => {
      if ('loader' in model) {
        return await model.loader();
      }
      return model as Model;
    }));
  }

  public listModelDetails(): Array<{ id: string, name: string, provider: string }> {
    const allModels = this.getAllModels();
    return allModels.map(model => ({
      id: model.getId(),
      name: model.getName(),
      provider: model.getProvider(),
    }));
  }
  
  public async listModelDetailsAsync(): Promise<Array<{ id: string, name: string, provider: string }>> {
    const allModels = await this.getAllModelsAsync();
    return allModels.map(model => ({
      id: model.getId(),
      name: model.getName(),
      provider: model.getProvider(),
    }));
  }

  public getModelProvider(modelId: string): any {
    const model = this.getModel(modelId);
    if (!model) {
      throw new Error(`Model with ID "${modelId}" not found in registry.`);
    }
    return model.getProvider();
  }
}
