import { StorageProvider } from '../types/storage';
import { MCPClient } from './ipfs/mcp-client.js';
import { IPFSStorage } from './ipfs/ipfs-storage.js';
import { LocalStorage } from './local/local-storage.js';
import { ConfigManager } from '../config/manager';
import { logger } from '../utils/logger';

/**
 * Factory class for creating StorageProvider instances based on configuration.
 */
export class StorageFactory {
  /**
   * Creates and returns a StorageProvider instance.
   * Reads the configuration to determine which provider type to instantiate (IPFS or Local).
   * 
   * @param type Optional override to force creation of a specific provider type.
   * @returns An instance implementing the StorageProvider interface.
   * @throws Error if the configured provider type is unsupported or if configuration is missing.
   */
  static createStorage(type?: 'local' | 'ipfs'): StorageProvider {
    const config = ConfigManager.getInstance();
    const providerType = type || config.get('storage.provider'); // Use override or config

    logger.info(`Creating storage provider of type: ${providerType}`);

    switch (providerType) {
      case 'ipfs':
        const mcpConfig = config.get('storage.mcp');
        if (!mcpConfig || !mcpConfig.baseUrl) {
          logger.error('IPFS provider selected, but MCP configuration (storage.mcp.baseUrl) is missing.');
          throw new Error('Missing MCP configuration for IPFS storage provider.');
        }
        // Construct MCPClient options from config
        const mcpClientOptions = {
          baseUrl: mcpConfig.baseUrl,
          authentication: mcpConfig.authType && mcpConfig.authValue 
            ? { type: mcpConfig.authType, value: mcpConfig.authValue } 
            : undefined,
          // Add timeout from config if available
        };
        const mcpClient = new MCPClient(mcpClientOptions);
        return new IPFSStorage(mcpClient);

      case 'local':
        // LocalStorage reads its path from config internally
        return new LocalStorage();

      default:
        logger.error(`Unsupported storage provider type configured: ${providerType}`);
        throw new Error(`Unsupported storage provider type: ${providerType}`);
    }
  }
}
