import { JSONSchemaType } from 'ajv';
import { ConfigurationSchema, registerSchema } from '../manager';

/**
 * Core configuration schema
 */
export interface CoreConfig {
  _version: number;
  apiKeys?: {
    [provider: string]: string[];
  };
  models?: {
    default?: string;
    history?: string[];
  };
  storage?: {
    backend?: string;
    basePath?: string;
  };
  ui?: {
    theme?: 'light' | 'dark' | 'system';
    verbose?: boolean;
  };
}

export const coreConfigSchema: JSONSchemaType<CoreConfig> = {
  type: 'object',
  properties: {
    _version: { type: 'number' },
    apiKeys: {
      type: 'object',
      nullable: true,
      additionalProperties: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    models: {
      type: 'object',
      nullable: true,
      properties: {
        default: { type: 'string', nullable: true },
        history: {
          type: 'array',
          nullable: true,
          items: { type: 'string' }
        }
      },
      additionalProperties: false
    },
    storage: {
      type: 'object',
      nullable: true,
      properties: {
        backend: { type: 'string', nullable: true, default: 'local' },
        basePath: { type: 'string', nullable: true }
      },
      additionalProperties: false
    },
    ui: {
      type: 'object',
      nullable: true,
      properties: {
        theme: { 
          type: 'string', 
          nullable: true,
          enum: ['light', 'dark', 'system'],
          default: 'dark'
        },
        verbose: { type: 'boolean', nullable: true, default: false }
      },
      additionalProperties: false
    }
  },
  required: ['_version'],
  additionalProperties: false
};

export const coreConfigSchemaDefinition: ConfigurationSchema = {
  id: 'core',
  schema: coreConfigSchema,
  version: 1
};

/**
 * Project configuration schema
 */
export interface ProjectConfig {
  _version: number;
  name?: string;
  description?: string;
  allowedTools?: string[];
  contextFiles?: string[];
  dontCrawlDirectory?: boolean;
  mcpContextUris?: string[];
  mcpServers?: Record<string, {
    type?: string;
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
  }>;
}

export const projectConfigSchema: JSONSchemaType<ProjectConfig> = {
  type: 'object',
  properties: {
    _version: { type: 'number' },
    name: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    allowedTools: { 
      type: 'array', 
      nullable: true,
      items: { type: 'string' },
      default: []
    },
    contextFiles: { 
      type: 'array', 
      nullable: true,
      items: { type: 'string' },
      default: []
    },
    dontCrawlDirectory: { 
      type: 'boolean', 
      nullable: true,
      default: false
    },
    mcpContextUris: { 
      type: 'array', 
      nullable: true,
      items: { type: 'string' },
      default: []
    },
    mcpServers: {
      type: 'object',
      nullable: true,
      additionalProperties: {
        type: 'object',
        properties: {
          type: { type: 'string', nullable: true },
          command: { type: 'string', nullable: true },
          args: { 
            type: 'array',
            nullable: true,
            items: { type: 'string' }
          },
          url: { type: 'string', nullable: true },
          env: {
            type: 'object',
            nullable: true,
            additionalProperties: { type: 'string' }
          }
        },
        additionalProperties: false
      },
      default: {}
    }
  },
  required: ['_version'],
  additionalProperties: false
};

export const projectConfigSchemaDefinition: ConfigurationSchema = {
  id: 'project',
  schema: projectConfigSchema,
  version: 1
};

/**
 * Integration configuration schema
 */
export interface IntegrationConfig {
  _version: number;
  bridges?: {
    [id: string]: {
      enabled: boolean;
      source: string;
      target: string;
      options?: Record<string, any>;
    };
  };
}

export const integrationConfigSchema: JSONSchemaType<IntegrationConfig> = {
  type: 'object',
  properties: {
    _version: { type: 'number' },
    bridges: {
      type: 'object',
      nullable: true,
      additionalProperties: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', default: true },
          source: { type: 'string' },
          target: { type: 'string' },
          options: {
            type: 'object',
            nullable: true,
            additionalProperties: true
          }
        },
        required: ['source', 'target'],
        additionalProperties: false
      },
      default: {}
    }
  },
  required: ['_version'],
  additionalProperties: false
};

export const integrationConfigSchemaDefinition: ConfigurationSchema = {
  id: 'integration',
  schema: integrationConfigSchema,
  version: 1
};

/**
 * Register all schemas
 */
export function registerConfigurationSchemas(): void {
  registerSchema(coreConfigSchemaDefinition);
  registerSchema(projectConfigSchemaDefinition);
  registerSchema(integrationConfigSchemaDefinition);
}