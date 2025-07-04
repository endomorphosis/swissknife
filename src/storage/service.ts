// src/storage/service.ts

import { StorageRegistry } from './registry.js';
import { PathResolver } from './path-resolver.js';
import { StorageOperations } from './operations.js';
import { FilesystemBackend } from './backends/filesystem.js';
import { IPFSBackend } from './backends/ipfs-backend.js';
import { ConfigurationManager } from '../config/manager';
import { logger } from '../utils/logger';
import * as path from 'path';

/**
 * Options for configuring the Storage Service
 */
export interface StorageServiceOptions {
  /** Base directory for storing local files */
  localBaseDir?: string;
  
  /** Whether to use the IPFS backend */
  useIPFS?: boolean;
  
  /** IPFS API URL */
  ipfsApiUrl?: string;
  
  /** IPFS API key */
  ipfsApiKey?: string;
  
  /** Initial mount points to configure */
  initialMounts?: Array<{ path: string; backendId: string; }>;
}

/**
 * Service responsible for initializing and managing storage system
 */
export class StorageService {
  private static instance: StorageService;
  private initialized: boolean = false;
  
  private registry: StorageRegistry;
  private operations: StorageOperations;
  private pathResolver: PathResolver;
  private config: ConfigurationManager;
  
  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    this.registry = StorageRegistry.getInstance();
    this.operations = StorageOperations.getInstance();
    this.pathResolver = PathResolver.getInstance();
    this.config = ConfigurationManager.getInstance();
    
    logger.debug('StorageService created');
  }
  
  /**
   * Gets the singleton instance
   */
  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }
  
  /**
   * Initialize the storage service
   * @param options Options for the storage service
   */
  public async initialize(options: StorageServiceOptions = {}): Promise<void> {
    if (this.initialized) {
      logger.warn('StorageService already initialized');
      return;
    }
    
    logger.info('Initializing StorageService');
    
    try {
      // Set up local filesystem backend
      const localBackend = await this.setupLocalBackend(options.localBaseDir);
      
      // Set up IPFS backend if requested
      if (options.useIPFS !== false) {
        await this.setupIPFSBackend(options);
      }
      
      // Configure mount points
      await this.configureMounts(options.initialMounts);
      
      this.initialized = true;
      logger.info('StorageService initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize StorageService: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Check if the service is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Get the StorageOperations instance
   */
  public getOperations(): StorageOperations {
    if (!this.initialized) {
      throw new Error('StorageService not initialized');
    }
    return this.operations;
  }
  
  /**
   * Get the StorageRegistry instance
   */
  public getRegistry(): StorageRegistry {
    return this.registry;
  }
  
  /**
   * Get the PathResolver instance
   */
  public getPathResolver(): PathResolver {
    return this.pathResolver;
  }
  
  /**
   * Set up the local filesystem backend
   * @private
   */
  private async setupLocalBackend(baseDir?: string): Promise<FilesystemBackend> {
    // Determine local base directory
    const localBaseDir = baseDir || this.config.get<string>(
      'storage.local.baseDir', 
      path.join(process.cwd(), 'data')
    );
    
    logger.debug(`Setting up local filesystem backend with base directory: ${localBaseDir}`);
    
    // Create the backend
    const localBackend = new FilesystemBackend({
      baseDir: localBaseDir,
      createBaseDir: true
    });
    
    // Register the backend
    this.registry.registerBackend(localBackend);
    
    // Mount it at /local
    this.registry.mount('/local', localBackend.id);
    
    logger.info(`Local filesystem backend registered and mounted at /local`);
    return localBackend;
  }
  
  /**
   * Set up the IPFS backend
   * @private
   */
  private async setupIPFSBackend(options: StorageServiceOptions): Promise<IPFSBackend | undefined> {
    try {
      // Get IPFS configuration
      const ipfsApiUrl = options.ipfsApiUrl || this.config.get<string>('ipfs.apiUrl');
      const ipfsApiKey = options.ipfsApiKey || this.config.get<string>('ipfs.apiKey');
      
      if (!ipfsApiUrl) {
        logger.warn('IPFS API URL not configured, skipping IPFS backend setup');
        return undefined;
      }
      
      logger.debug(`Setting up IPFS backend with API URL: ${ipfsApiUrl}`);
      
      // Create the backend
      const ipfsBackend = new IPFSBackend({
        apiUrl: ipfsApiUrl,
        apiKey: ipfsApiKey
      });
      
      // Register the backend
      this.registry.registerBackend(ipfsBackend);
      
      // Mount it at /ipfs
      this.registry.mount('/ipfs', ipfsBackend.id);
      
      logger.info(`IPFS backend registered and mounted at /ipfs`);
      return ipfsBackend;
    } catch (error) {
      logger.error(`Failed to set up IPFS backend: ${error instanceof Error ? error.message : String(error)}`);
      logger.warn('Continuing without IPFS backend');
      return undefined;
    }
  }
  
  /**
   * Configure mount points from options or config
   * @private
   */
  private async configureMounts(initialMounts?: Array<{ path: string; backendId: string; }>): Promise<void> {
    try {
      // First load mounts from config
      this.registry.loadMountConfig();
      
      // Then apply any additional mounts from options
      if (initialMounts && initialMounts.length > 0) {
        for (const mount of initialMounts) {
          try {
            // Check if the backend exists
            const backend = this.registry.getBackend(mount.backendId);
            if (!backend) {
              logger.warn(`Cannot mount at ${mount.path}: Backend '${mount.backendId}' not found`);
              continue;
            }
            
            // Check if the path is already mounted
            const mounts = this.registry.getMounts();
            if (mounts.has(mount.path)) {
              logger.warn(`Path ${mount.path} is already mounted, skipping`);
              continue;
            }
            
            // Mount the backend
            this.registry.mount(mount.path, mount.backendId);
            logger.debug(`Mounted backend '${mount.backendId}' at '${mount.path}'`);
          } catch (error) {
            logger.error(`Failed to mount ${mount.path}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        
        // Save the updated configuration
        this.registry.saveMountConfig();
      }
    } catch (error) {
      logger.error(`Failed to configure mounts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}