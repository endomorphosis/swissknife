// src/config/migration.ts
import * as fs from 'fs/promises';
// @ts-ignore
import TOML from '@iarna/toml';
import * as path from 'path';

/**
 * Migrates configuration from a TOML file to the JSON configuration.
 * @param tomlPath Path to the TOML configuration file
 * @param configManager Configuration manager instance
 * @returns Promise resolving to true if migration was successful, false otherwise
 */
export async function migrateTomlConfig(
  tomlPath: string, 
  configManager: any
): Promise<boolean> {
  try {
    // Read TOML file
    const content = await fs.readFile(tomlPath, 'utf-8');
    const tomlConfig = TOML.parse(content);
    
    // Transform TOML configuration to JSON structure
    const transformedConfig = transformTomlConfig(tomlConfig);
    
    // Merge with existing configuration
    for (const [key, value] of Object.entries(transformedConfig)) {
      configManager.set(key, value);
    }
    
    // Save the configuration
    await configManager.save();
    
    return true;
  } catch (error) {
    console.error(`Failed to migrate TOML configuration from ${tomlPath}:`, error);
    return false;
  }
}

/**
 * Transforms TOML configuration to match the expected JSON structure.
 * @param tomlConfig The parsed TOML configuration
 * @returns Transformed configuration object
 */
export function transformTomlConfig(tomlConfig: any): any {
  // Transform TOML structure to match current JSON config structure
  const result: any = {};
  
  // API Keys transformation
  if (tomlConfig.api_keys) {
    result.ai = result.ai || {};
    result.ai.models = result.ai.models || {};
    result.ai.models.providers = {};
    
    for (const [provider, keys] of Object.entries(tomlConfig.api_keys)) {
      if (typeof keys === 'string') {
        result.ai.models.providers[provider] = { apiKey: keys };
      } else if (Array.isArray(keys) && keys.length > 0) {
        result.ai.models.providers[provider] = { apiKey: keys[0] };
      }
    }
  }
  
  // Models configuration transformation
  if (tomlConfig.models) {
    result.ai = result.ai || {};
    result.ai.defaultModel = tomlConfig.models.default;
    
    if (tomlConfig.models.history && Array.isArray(tomlConfig.models.history)) {
      result.ai.modelHistory = tomlConfig.models.history;
    }
  }
  
  // Storage configuration transformation
  if (tomlConfig.storage) {
    result.storage = {
      provider: tomlConfig.storage.backend || 'local',
      localPath: tomlConfig.storage.basePath
    };
  }
  
  // Copy any other top-level sections as-is
  for (const [key, value] of Object.entries(tomlConfig)) {
    if (!['api_keys', 'models', 'storage'].includes(key)) {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Scans a directory for TOML files and imports them into the configuration.
 * @param directoryPath Directory path to scan
 * @param configManager Configuration manager instance
 * @param recursive Whether to scan subdirectories
 * @returns Promise resolving to an array of successfully migrated files
 */
export async function scanAndMigrateTomlFiles(
  directoryPath: string,
  configManager: any,
  recursive: boolean = false
): Promise<string[]> {
  const migratedFiles: string[] = [];
  
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      
      if (entry.isDirectory() && recursive) {
        // Recursively scan subdirectories
        const subdirResults = await scanAndMigrateTomlFiles(entryPath, configManager, recursive);
        migratedFiles.push(...subdirResults);
      } else if (entry.isFile() && entry.name.endsWith('.toml')) {
        // Migrate TOML file
        const success = await migrateTomlConfig(entryPath, configManager);
        if (success) {
          migratedFiles.push(entryPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${directoryPath}:`, error);
  }
  
  return migratedFiles;
}