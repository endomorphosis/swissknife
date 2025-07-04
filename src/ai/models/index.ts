// src/ai/models/index.ts
import { ModelRegistry } from './registry.js';
import { BaseModel as Model, IModel } from './model.js';
import { ModelOptions, ProviderDefinition, ModelDefinition } from '../types/ai';
import openaiProviderDefinition from './definitions/openai.js';
import gooseProviderDefinition from './definitions/goose.js';

export function registerAllModels(): void {
  const modelRegistry = ModelRegistry.getInstance();
  const providerDefinitions: ProviderDefinition[] = [
    openaiProviderDefinition,
    gooseProviderDefinition
    // Add other provider definitions here
  ];

  providerDefinitions.forEach(providerDef => {
    console.log(`Registering models for provider: ${providerDef.name}`);
    providerDef.models.forEach((modelDef: ModelDefinition) => {
      const modelOpts: ModelOptions = {
        id: modelDef.id,
        name: modelDef.name,
        provider: providerDef.id, // This is the provider's ID string, e.g., "openai"
        parameters: modelDef.parameters || {},
        metadata: modelDef.metadata || {},
      };
      try {
        const modelInstance = new Model(modelOpts);
        modelRegistry.registerModel(modelInstance);
      } catch (error) {
        console.error(`Failed to create or register model ${modelDef.name} (ID: ${modelDef.id}) from provider ${providerDef.name}:`, error);
      }
    });

    // Set this provider's default model as the global default if certain conditions are met
    if (providerDef.defaultModel) {
      const currentDefault = modelRegistry.getModel('default');
      // If no global default is set OR if the current global default is not from this provider,
      // then consider setting this provider's default.
      if (!currentDefault || currentDefault.getProvider() !== providerDef.id) {
         if (modelRegistry.getModel(providerDef.defaultModel)) { // Check if model exists
            modelRegistry.setDefaultModel(providerDef.defaultModel);
         } else {
            console.warn(`Default model ID "${providerDef.defaultModel}" for provider "${providerDef.name}" not found in registered models.`);
         }
      }
    }
  });

   // Final check: if no default model is set after processing all providers,
   // set the first registered model as the default.
   if (modelRegistry.getAllModels().length > 0 && !modelRegistry.getModel('default')) {
    modelRegistry.setDefaultModel(modelRegistry.getAllModels()[0].getId());
  }

  console.log("All models initialized and registered.");
  modelRegistry.listModelDetails().forEach(m => console.log(`  - ${m.name} (ID: ${m.id}, Provider: ${m.provider})`));
  
  const defaultModelInstance = modelRegistry.getModel('default');
  if (defaultModelInstance) {
    console.log(`Default model is: ${defaultModelInstance.getName()} (ID: ${defaultModelInstance.getId()})`);
  } else {
    console.log("No default model has been set.");
  }
}
