// src/models/init.ts

import { ModelRegistry, registerProvider } from './registry.js';
import { standardProviders } from './providers.js';
import { ConfigManager } from '../config/manager';
import { IntegrationRegistry } from '../integration/registry';

/**
 * Initialize the model system
 * Registers all standard providers and discovers models from bridges
 */
export async function initializeModelSystem(): Promise<void> {
  const registry = ModelRegistry.getInstance();
  const configManager = ConfigManager.getInstance();
  const integrationRegistry = IntegrationRegistry.getInstance();
  
  console.log('Initializing model system...');
  
  // Register standard providers
  for (const provider of standardProviders) {
    console.log(`Registering provider: ${provider.name} (${provider.id})`);
    registerProvider(provider);
  }
  
  // Discover models from bridges
  await discoverModelsFromBridges(integrationRegistry);
  
  console.log(`Model system initialized with ${registry.getAllModels().length} models from ${registry.getAllProviders().length} providers`);
}

/**
 * Discover and register models from bridges
 */
async function discoverModelsFromBridges(integrationRegistry: IntegrationRegistry): Promise<void> {
  // Get initialized bridges
  const bridges = integrationRegistry
    .getAllBridges()
    .filter(bridge => bridge.isInitialized());
  
  // Discover models from each bridge
  for (const bridge of bridges) {
    try {
      // Try to get models from bridge
      if (bridge.id === 'goose-mcp') {
        const models = await bridge.call('list_models', {});
        console.log(`Discovered ${models.length} models from ${bridge.id}`);
        
        // Models are already registered via the gooseProvider
        // This is just for verification
      }
      
      // Additional bridge model discovery logic would go here
      
    } catch (error) {
      console.error(`Failed to discover models from bridge ${bridge.id}:`, error);
    }
  }
}

/**
 * Helper function to register a custom model provider from configuration
 */
export function registerCustomProvider(providerId: string): void {
  const configManager = ConfigManager.getInstance();
  const providerConfig = configManager.get<any>(`ai.models.providers.${providerId}`);
  
  if (!providerConfig) {
    throw new Error(`Provider configuration not found for ${providerId}`);
  }
  
  // Construct provider from configuration
  const provider = {
    id: providerId,
    name: providerConfig.name || providerId,
    envVar: providerConfig.envVar,
    baseURL: providerConfig.baseURL,
    defaultModel: providerConfig.defaultModel,
    models: []
  };
  
  // Add models if defined
  if (providerConfig.models && Array.isArray(providerConfig.models)) {
    for (const modelConfig of providerConfig.models) {
      provider.models.push({
        id: modelConfig.id,
        name: modelConfig.name || modelConfig.id,
        provider: providerId,
        maxTokens: modelConfig.maxTokens,
        capabilities: modelConfig.capabilities || {},
        source: modelConfig.source || 'current'
      });
    }
  }
  
  // Register the provider
  registerProvider(provider);
}