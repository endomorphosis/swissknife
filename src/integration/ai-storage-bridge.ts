// src/integration/ai-storage-bridge.ts

import { AIService } from '../ai/service';
import { StorageService } from '../storage/service';
import { Agent } from '../ai/agent/agent';
import { Tool } from '../ai/tools/tool';
import { logger } from '../utils/logger';
import { ConfigurationManager } from '../config/manager';
import * as path from 'path';

/**
 * Bridge for integrating AI and Storage systems
 * 
 * This bridge facilitates:
 * 1. Storage-aware AI tools 
 * 2. Context sharing between domains
 * 3. Persistence of agent states and conversations
 * 4. Management of AI-generated assets
 */
export class AIStorageBridge {
  private static instance: AIStorageBridge;
  private initialized: boolean = false;
  
  private aiService: AIService;
  private storageService: StorageService;
  private config: ConfigurationManager;
  
  // Base paths for AI storage
  private agentStoragePath: string = '/local/ai/agents';
  private modelDataPath: string = '/local/ai/models';
  private conversationPath: string = '/local/ai/conversations';
  
  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    this.aiService = AIService.getInstance();
    this.storageService = StorageService.getInstance();
    this.config = ConfigurationManager.getInstance();
    logger.debug('AIStorageBridge created');
  }
  
  /**
   * Gets the singleton instance
   */
  public static getInstance(): AIStorageBridge {
    if (!AIStorageBridge.instance) {
      AIStorageBridge.instance = new AIStorageBridge();
    }
    return AIStorageBridge.instance;
  }
  
  /**
   * Initialize the bridge
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('AIStorageBridge already initialized');
      return;
    }
    
    logger.info('Initializing AIStorageBridge');
    
    // Check if required services are initialized
    if (!this.aiService.isInitialized || !this.aiService.isInitialized()) {
      logger.error('Cannot initialize AIStorageBridge: AIService not initialized');
      throw new Error('AIService must be initialized before AIStorageBridge');
    }
    
    if (!this.storageService.isInitialized()) {
      logger.error('Cannot initialize AIStorageBridge: StorageService not initialized');
      throw new Error('StorageService must be initialized before AIStorageBridge');
    }
    
    // Load configuration
    this.agentStoragePath = this.config.get<string>('integration.aiStorage.agentPath', this.agentStoragePath);
    this.modelDataPath = this.config.get<string>('integration.aiStorage.modelPath', this.modelDataPath);
    this.conversationPath = this.config.get<string>('integration.aiStorage.conversationPath', this.conversationPath);
    
    // Ensure storage directories exist
    const ops = this.storageService.getOperations();
    await this.ensurePath(ops, this.agentStoragePath);
    await this.ensurePath(ops, this.modelDataPath);
    await this.ensurePath(ops, this.conversationPath);
    
    // Register storage-aware tools
    await this.registerStorageTools();
    
    this.initialized = true;
    logger.info('AIStorageBridge initialized successfully');
  }
  
  /**
   * Register AI tools that leverage the storage system
   * @private
   */
  private async registerStorageTools(): Promise<void> {
    try {
      // File Reader Tool - Allows agents to read files from the VFS
      const fileReaderTool = new FileReaderTool(this.storageService);
      this.aiService.registerTool(fileReaderTool);
      
      // File Writer Tool - Allows agents to write to files in the VFS
      const fileWriterTool = new FileWriterTool(this.storageService);
      this.aiService.registerTool(fileWriterTool);
      
      // Storage Search Tool - Allows agents to search for content in files
      const storageSearchTool = new StorageSearchTool(this.storageService);
      this.aiService.registerTool(storageSearchTool);
      
      logger.info('Registered storage tools with AIService');
    } catch (error) {
      logger.error(`Failed to register storage tools: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Save agent state to storage
   * @param agentId ID of the agent
   * @param agent Agent instance
   */
  public async saveAgentState(agentId: string, agent: Agent): Promise<void> {
    const ops = this.storageService.getOperations();
    const agentPath = path.posix.join(this.agentStoragePath, `${agentId}.json`);
    
    try {
      // Get serializable state from agent
      const state = await agent.getSerializableState();
      
      // Save state to storage
      await ops.writeFile(agentPath, JSON.stringify(state, null, 2));
      logger.debug(`Saved state for agent ${agentId} to ${agentPath}`);
    } catch (error) {
      logger.error(`Failed to save agent state: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Load agent state from storage
   * @param agentId ID of the agent
   * @returns Agent state object or null if not found
   */
  public async loadAgentState(agentId: string): Promise<any> {
    const ops = this.storageService.getOperations();
    const agentPath = path.posix.join(this.agentStoragePath, `${agentId}.json`);
    
    try {
      // Check if agent state exists
      if (!await ops.exists(agentPath)) {
        logger.debug(`No saved state found for agent ${agentId}`);
        return null;
      }
      
      // Load state from storage
      const stateBuffer = await ops.readFile(agentPath);
      const state = JSON.parse(stateBuffer.toString());
      
      logger.debug(`Loaded state for agent ${agentId} from ${agentPath}`);
      return state;
    } catch (error) {
      logger.error(`Failed to load agent state: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Save a conversation to storage
   * @param conversationId ID of the conversation
   * @param messages Array of message objects
   * @param metadata Additional metadata about the conversation
   */
  public async saveConversation(
    conversationId: string, 
    messages: Array<any>, 
    metadata?: Record<string, any>
  ): Promise<void> {
    const ops = this.storageService.getOperations();
    const conversationPath = path.posix.join(this.conversationPath, `${conversationId}.json`);
    
    try {
      const data = {
        id: conversationId,
        timestamp: new Date().toISOString(),
        messages,
        metadata: metadata || {}
      };
      
      await ops.writeFile(conversationPath, JSON.stringify(data, null, 2));
      logger.debug(`Saved conversation ${conversationId} to ${conversationPath}`);
    } catch (error) {
      logger.error(`Failed to save conversation: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Load a conversation from storage
   * @param conversationId ID of the conversation to load
   * @returns Conversation data or null if not found
   */
  public async loadConversation(conversationId: string): Promise<any> {
    const ops = this.storageService.getOperations();
    const conversationPath = path.posix.join(this.conversationPath, `${conversationId}.json`);
    
    try {
      // Check if conversation exists
      if (!await ops.exists(conversationPath)) {
        logger.debug(`No conversation found with ID ${conversationId}`);
        return null;
      }
      
      // Load conversation from storage
      const dataBuffer = await ops.readFile(conversationPath);
      const conversation = JSON.parse(dataBuffer.toString());
      
      logger.debug(`Loaded conversation ${conversationId} from ${conversationPath}`);
      return conversation;
    } catch (error) {
      logger.error(`Failed to load conversation: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * List available conversations
   * @param limit Maximum number of conversations to return
   * @param offset Number of conversations to skip
   * @returns List of conversation metadata
   */
  public async listConversations(limit: number = 20, offset: number = 0): Promise<Array<any>> {
    const ops = this.storageService.getOperations();
    
    try {
      const entries = await ops.readdir(this.conversationPath);
      const jsonEntries = entries
        .filter(entry => entry.isFile && entry.name.endsWith('.json'))
        .slice(offset, offset + limit);
      
      const conversations = [];
      
      for (const entry of jsonEntries) {
        try {
          const dataBuffer = await ops.readFile(path.posix.join(this.conversationPath, entry.name));
          const data = JSON.parse(dataBuffer.toString());
          conversations.push({
            id: data.id,
            timestamp: data.timestamp,
            messageCount: data.messages?.length || 0,
            metadata: data.metadata || {}
          });
        } catch (error) {
          logger.warn(`Error parsing conversation file ${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      return conversations.sort((a, b) => {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
    } catch (error) {
      logger.error(`Failed to list conversations: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Save model-specific data to storage
   * @param modelId ID of the model
   * @param dataKey Key identifying the type of data
   * @param data Data to save
   */
  public async saveModelData(modelId: string, dataKey: string, data: any): Promise<void> {
    const ops = this.storageService.getOperations();
    const modelDataDir = path.posix.join(this.modelDataPath, modelId);
    const dataPath = path.posix.join(modelDataDir, `${dataKey}.json`);
    
    try {
      // Ensure directory exists
      await this.ensurePath(ops, modelDataDir);
      
      // Save data to storage
      await ops.writeFile(dataPath, JSON.stringify(data, null, 2));
      logger.debug(`Saved data for model ${modelId} with key ${dataKey} to ${dataPath}`);
    } catch (error) {
      logger.error(`Failed to save model data: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Load model-specific data from storage
   * @param modelId ID of the model
   * @param dataKey Key identifying the type of data
   * @returns Model data or null if not found
   */
  public async loadModelData(modelId: string, dataKey: string): Promise<any> {
    const ops = this.storageService.getOperations();
    const dataPath = path.posix.join(this.modelDataPath, modelId, `${dataKey}.json`);
    
    try {
      // Check if data exists
      if (!await ops.exists(dataPath)) {
        logger.debug(`No data found for model ${modelId} with key ${dataKey}`);
        return null;
      }
      
      // Load data from storage
      const dataBuffer = await ops.readFile(dataPath);
      const data = JSON.parse(dataBuffer.toString());
      
      logger.debug(`Loaded data for model ${modelId} with key ${dataKey} from ${dataPath}`);
      return data;
    } catch (error) {
      logger.error(`Failed to load model data: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Ensure a directory exists in the VFS
   * @private
   */
  private async ensurePath(ops: any, dirPath: string): Promise<void> {
    try {
      if (!await ops.exists(dirPath)) {
        await ops.mkdir(dirPath, { recursive: true });
        logger.debug(`Created directory: ${dirPath}`);
      }
    } catch (error) {
      logger.error(`Failed to ensure path ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

/**
 * Tool that allows AI agents to read files from the VFS
 */
class FileReaderTool implements Tool {
  public readonly name = 'file_reader';
  public readonly description = 'Read the contents of a file from the virtual filesystem';
  
  private storageService: StorageService;
  
  constructor(storageService: StorageService) {
    this.storageService = storageService;
  }
  
  public async execute(params: { path: string }): Promise<any> {
    try {
      const { path } = params;
      if (!path) {
        return { error: 'Path parameter is required' };
      }
      
      const ops = this.storageService.getOperations();
      
      // Check if file exists
      if (!await ops.exists(path)) {
        return { error: `File not found: ${path}` };
      }
      
      // Get file stats to check if it's a file
      const stats = await ops.stat(path);
      if (!stats.isFile) {
        return { error: `Path is not a file: ${path}` };
      }
      
      // Read the file
      const content = await ops.readFile(path);
      
      return {
        content: content.toString('utf-8'),
        path
      };
    } catch (error) {
      logger.error(`Error in file_reader tool: ${error instanceof Error ? error.message : String(error)}`);
      return { error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}

/**
 * Tool that allows AI agents to write to files in the VFS
 */
class FileWriterTool implements Tool {
  public readonly name = 'file_writer';
  public readonly description = 'Write content to a file in the virtual filesystem';
  
  private storageService: StorageService;
  
  constructor(storageService: StorageService) {
    this.storageService = storageService;
  }
  
  public async execute(params: { path: string; content: string; createDirectories?: boolean }): Promise<any> {
    try {
      const { path, content, createDirectories } = params;
      
      if (!path) {
        return { error: 'Path parameter is required' };
      }
      
      if (content === undefined) {
        return { error: 'Content parameter is required' };
      }
      
      const ops = this.storageService.getOperations();
      
      // Create parent directories if requested
      if (createDirectories) {
        const dirPath = path.split('/').slice(0, -1).join('/');
        if (dirPath) {
          await ops.mkdir(dirPath, { recursive: true });
        }
      }
      
      // Write the file
      await ops.writeFile(path, content);
      
      return {
        success: true,
        path
      };
    } catch (error) {
      logger.error(`Error in file_writer tool: ${error instanceof Error ? error.message : String(error)}`);
      return { 
        error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
        success: false
      };
    }
  }
}

/**
 * Tool that allows AI agents to search for content in files
 */
class StorageSearchTool implements Tool {
  public readonly name = 'storage_search';
  public readonly description = 'Search for content across files in the virtual filesystem';
  
  private storageService: StorageService;
  
  constructor(storageService: StorageService) {
    this.storageService = storageService;
  }
  
  public async execute(params: { 
    query: string; 
    path?: string; 
    maxResults?: number;
    includeContent?: boolean;
  }): Promise<any> {
    try {
      const { query, path = '/', maxResults = 10, includeContent = false } = params;
      
      if (!query) {
        return { error: 'Query parameter is required' };
      }
      
      const ops = this.storageService.getOperations();
      
      // Check if path exists
      if (!await ops.exists(path)) {
        return { error: `Path not found: ${path}` };
      }
      
      // Get stats to determine if it's a file or directory
      const stats = await ops.stat(path);
      
      // If it's a file, search only within that file
      if (stats.isFile) {
        const content = await ops.readFile(path);
        const textContent = content.toString('utf-8');
        
        if (textContent.includes(query)) {
          return {
            matches: [{
              path,
              matchCount: 1,
              content: includeContent ? textContent : undefined
            }],
            totalMatches: 1
          };
        }
        
        return {
          matches: [],
          totalMatches: 0
        };
      }
      
      // If it's a directory, recursively search all files
      const matches = [];
      let totalMatches = 0;
      
      await this.searchDirectory(ops, path, query, matches, totalMatches, maxResults, includeContent);
      
      return {
        matches,
        totalMatches
      };
    } catch (error) {
      logger.error(`Error in storage_search tool: ${error instanceof Error ? error.message : String(error)}`);
      return { error: `Search failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  
  /**
   * Recursively search files in a directory
   * @private
   */
  private async searchDirectory(
    ops: any, 
    dirPath: string, 
    query: string, 
    matches: any[], 
    totalMatches: number, 
    maxResults: number,
    includeContent: boolean
  ): Promise<void> {
    // Stop if we've reached the max results
    if (matches.length >= maxResults) {
      return;
    }
    
    try {
      const entries = await ops.readdir(dirPath);
      
      for (const entry of entries) {
        // Stop if we've reached the max results
        if (matches.length >= maxResults) {
          return;
        }
        
        const entryPath = path.posix.join(dirPath, entry.name);
        
        if (entry.isFile) {
          // Check if the file contains the query
          try {
            const content = await ops.readFile(entryPath);
            const textContent = content.toString('utf-8');
            
            if (textContent.includes(query)) {
              totalMatches++;
              
              matches.push({
                path: entryPath,
                matchCount: 1, // TODO: Count actual number of matches
                content: includeContent ? textContent : undefined
              });
            }
          } catch (error) {
            // Skip files that can't be read as text
            logger.debug(`Skipping file ${entryPath}: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else if (entry.isDirectory) {
          // Recursively search subdirectories
          await this.searchDirectory(ops, entryPath, query, matches, totalMatches, maxResults, includeContent);
        }
      }
    } catch (error) {
      logger.error(`Error searching directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}