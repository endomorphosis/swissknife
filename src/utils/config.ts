/**
 * Configuration utility for MCP server
 * This file provides utilities for working with MCP configuration
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { McpVersionHistory } from '../services/mcp-types';

/**
 * MCP Server configuration for SSE type
 */
export interface McpSSEServerConfig {
  name: string;
  url: string;
  apiKey?: string;
  enabled?: boolean;
  version?: string;
  type: 'sse';
}

/**
 * MCP Server configuration for Stdio type
 */
export interface McpStdioServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  apiKey?: string;
  enabled?: boolean;
  version?: string;
  type: 'stdio';
}

/**
 * MCP Server configuration type (discriminated union)
 */
export type McpServerConfig = McpSSEServerConfig | McpStdioServerConfig;

/**
 * Project configuration type
 */
export interface ProjectConfig {
  mcpServers?: Record<string, McpServerConfig>;
  mcpVersionHistory?: Record<string, McpVersionHistory>; // Add this
  otherSettings?: Record<string, any>;
}

/**
 * Provider types available in the system
 */
export type ProviderType = 'openai' | 'openrouter' | 'gemini' | 'ollama' | 'mistral' | 'deepseek' | 'xai' | 'groq' | 'azure';

/**
 * Global configuration type
 */
export interface GlobalConfig {
  mcpServers?: Record<string, McpServerConfig>;
  defaults?: {
    mcpServer?: string;
  };
  theme?: string;
  otherSettings?: Record<string, any>;
}

/**
 * Default global configuration
 */
export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  theme: 'dark',
  defaults: {},
  otherSettings: {}
};

// Configuration file paths
const CONFIG_DIR = path.join(os.homedir(), '.swissknife');
const PROJECT_CONFIG_FILE = 'swissknife.json';
const GLOBAL_CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const MCPRC_FILE = path.join(CONFIG_DIR, '.mcprc');

/**
 * Ensures the configuration directory exists
 */
async function ensureConfigDir() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (err) {
    // Directory already exists, ignore
  }
}

/**
 * Gets the current project configuration
 */
export async function getCurrentProjectConfig(): Promise<ProjectConfig> {
  try {
    const configData = await fs.readFile(PROJECT_CONFIG_FILE, 'utf-8');
    return JSON.parse(configData);
  } catch (err) {
    // Return empty config if file doesn't exist
    return {};
  }
}

/**
 * Saves the current project configuration
 */
export async function saveCurrentProjectConfig(config: ProjectConfig): Promise<void> {
  const configData = JSON.stringify(config, null, 2);
  await fs.writeFile(PROJECT_CONFIG_FILE, configData, 'utf-8');
}

/**
 * Gets the global configuration
 */
export async function getGlobalConfig(): Promise<GlobalConfig> {
  try {
    await ensureConfigDir();
    const configData = await fs.readFile(GLOBAL_CONFIG_FILE, 'utf-8');
    return JSON.parse(configData);
  } catch (err) {
    // Return empty config if file doesn't exist
    return {};
  }
}

/**
 * Saves the global configuration
 */
export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  await ensureConfigDir();
  const configData = JSON.stringify(config, null, 2);
  await fs.writeFile(GLOBAL_CONFIG_FILE, configData, 'utf-8');
}

/**
 * Gets configuration from .mcprc file
 */
export async function getMcprcConfig(): Promise<any> {
  try {
    await ensureConfigDir();
    const configData = await fs.readFile(MCPRC_FILE, 'utf-8');
    return JSON.parse(configData);
  } catch (err) {
    // Return empty config if file doesn't exist
    return {};
  }
}

/**
 * Adds an API key to the global configuration
 */
export async function addApiKey(provider: ProviderType, apiKey: string): Promise<void> {
  const config = await getGlobalConfig();
  if (!config.otherSettings) {
    config.otherSettings = {};
  }
  if (!config.otherSettings.apiKeys) {
    config.otherSettings.apiKeys = {};
  }
  config.otherSettings.apiKeys[provider] = apiKey;
  await saveGlobalConfig(config);
}
