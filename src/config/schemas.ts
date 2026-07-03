// src/config/schemas.ts
import { z, ZodTypeAny } from 'zod.js'; // Import Zod
import { ConfigurationManager } from './manager.js';

/**
 * Core configuration schema — converted from JSONSchema7 to Zod (PORT-config).
 * Validates the main SwissKnife configuration structure.
 */
export const coreConfigSchema = z.object({
  ai: z.object({
    defaultModel:      z.string().optional(),
    modelHistory:      z.array(z.string()).optional(),
    useGoT:            z.boolean().optional().default(false),
    tools:             z.array(z.string()).optional().default([]),
    models: z.object({
      providers: z.record(z.object({
        apiKey:  z.string(),
        baseUrl: z.string().optional(),
      })).optional(),
    }).optional(),
  }).optional(),
  storage: z.object({
    provider:  z.enum(['local', 'ipfs', 's3', 'azure']).optional(),
    localPath: z.string().optional(),
    ipfs: z.object({ gateway: z.string().optional(), apiKey: z.string().optional() }).optional(),
    s3: z.object({
      bucket:          z.string(),
      region:          z.string(),
      accessKeyId:     z.string().optional(),
      secretAccessKey: z.string().optional(),
    }).optional(),
  }).optional(),
  integration: z.object({
    bridges: z.record(z.object({
      enabled: z.boolean().optional(),
      source:  z.string().optional(),
      target:  z.string().optional(),
    })).optional(),
  }).optional(),
  goose:  z.object({ path: z.string().optional(), enableLocalModels: z.boolean().optional() }).optional(),
  ipfs:   z.object({ accelerate: z.object({ path: z.string().optional(), apiKey: z.string().optional(), endpoint: z.string().optional() }).optional() }).optional(),
  native: z.object({ modulesDir: z.string().optional(), modules: z.record(z.object({ path: z.string() })).optional() }).optional(),
}).passthrough();  // allow extra keys for forward compat

// Granular sub-schemas for direct registration
export const aiSchema      = coreConfigSchema.shape.ai;
export const storageSchema = coreConfigSchema.shape.storage;

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
  configManager.registerSchema('core',    coreConfigSchema);
  configManager.registerSchema('ai',      aiSchema);
  configManager.registerSchema('storage', storageSchema);
  console.log("Configuration schemas registered: core, ai, storage.");
}
