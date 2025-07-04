// src/config/schemas.ts
import { z, ZodTypeAny } from 'zod'; // Import Zod
import { ConfigurationManager } from './manager.js';

/**
 * Core configuration schema
 * Validates the main structure of the configuration
 * TODO: Convert the original JSONSchema7 structure (commented out below) 
 * to a detailed Zod schema for proper validation.
 * For now, using z.any() as a placeholder to allow registration and basic functionality.
 */
export const coreConfigSchema: ZodTypeAny = z.any();

/*
// Original JSONSchema7 structure for reference during Zod conversion:
export const coreConfigSchemaJSON: import('json-schema').JSONSchema7 = {
  type: 'object',
  properties: {
    ai: {
      type: 'object',
      properties: {
        defaultModel: { type: 'string' },
        modelHistory: { type: 'array', items: { type: 'string' } },
        models: {
          type: 'object',
          properties: {
            providers: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: { apiKey: { type: 'string' }, baseUrl: { type: 'string' } },
                required: ['apiKey']
              }
            }
          }
        }
      }
    },
    storage: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['local', 'ipfs', 's3', 'azure'] },
        localPath: { type: 'string' },
        ipfs: { type: 'object', properties: { gateway: { type: 'string' }, apiKey: { type: 'string' } } },
        s3: {
          type: 'object',
          properties: { bucket: { type: 'string' }, region: { type: 'string' }, accessKeyId: { type: 'string' }, secretAccessKey: { type: 'string' } },
          required: ['bucket', 'region']
        }
      }
    },
    integration: {
      type: 'object',
      properties: {
        bridges: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              source: { type: 'string', enum: ['current', 'goose', 'ipfs_accelerate', 'swissknife_old'] },
              target: { type: 'string', enum: ['current', 'goose', 'ipfs_accelerate', 'swissknife_old'] }
            }
          }
        }
      }
    },
    goose: { type: 'object', properties: { path: { type: 'string' }, enableLocalModels: { type: 'boolean' } } },
    ipfs: { type: 'object', properties: { accelerate: { type: 'object', properties: { path: { type: 'string' }, apiKey: { type: 'string' }, endpoint: { type: 'string' } } } } },
    legacy: { type: 'object', properties: { swissknife: { type: 'object', properties: { path: { type: 'string' } } } } },
    native: {
      type: 'object',
      properties: {
        modulesDir: { type: 'string' },
        modules: { type: 'object', additionalProperties: { type: 'object', properties: { path: { type: 'string' } } } }
      }
    }
  }
};
*/

/**
 * Register built-in schemas
 */
export function registerConfigurationSchemas(): void {
  const configManager = ConfigurationManager.getInstance();
  // Registering the main schema under a general key like 'app_config' or a specific prefix.
  // If 'core' is meant to validate the entire config object, then this is fine.
  configManager.registerSchema('core', coreConfigSchema); 
  // TODO: Add registrations for more granular schemas if needed, e.g.,
  // configManager.registerSchema('ai', aiSchema);
  // configManager.registerSchema('storage', storageSchema);
  console.log("Core configuration schema registered (placeholder).");
}
