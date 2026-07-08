/**
 * Configuration utility for MCP server
 * This file provides utilities for working with MCP configuration
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * MCP Server configuration type
 * @typedef {Object} McpServerConfig
 * @property {string} name - Server name
 * @property {string} url - Server URL 
 * @property {string} [apiKey] - Server API key (if required)
 * @property {boolean} enabled - Enabled status
 * @property {string} [version] - Version information
 * @property {string} [type] - Server type/provider
 */

/**
 * Project configuration type
 * @typedef {Object} ProjectConfig
 * @property {McpServerConfig[]} [mcpServers] - MCP servers configured for this project
 * @property {Object} [otherSettings] - Other project settings
 */

/**
 * Global configuration type
 * @typedef {Object} GlobalConfig
 * @property {McpServerConfig[]} [mcpServers] - Global MCP servers
 * @property {Object} [defaults] - Default settings
 * @property {string} [defaults.mcpServer] - Default MCP server
 * @property {Object} [otherSettings] - Other global settings
 */

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
export async function getCurrentProjectConfig() {
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
export async function saveCurrentProjectConfig(config) {
  const configData = JSON.stringify(config, null, 2);
  await fs.writeFile(PROJECT_CONFIG_FILE, configData, 'utf-8');
}

/**
 * Gets the global configuration
 */
export async function getGlobalConfig() {
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
export async function saveGlobalConfig(config) {
  await ensureConfigDir();
  const configData = JSON.stringify(config, null, 2);
  await fs.writeFile(GLOBAL_CONFIG_FILE, configData, 'utf-8');
}

/**
 * Gets configuration from .mcprc file
 */
export async function getMcprcConfig() {
  try {
    await ensureConfigDir();
    const configData = await fs.readFile(MCPRC_FILE, 'utf-8');
    return JSON.parse(configData);
  } catch (err) {
    // Return empty config if file doesn't exist
    return {};
  }
}
