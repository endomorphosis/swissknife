/**
 * MCP Client for IPFS integration
 * 
 * This module provides a client for interacting with the Model Context Protocol (MCP) server
 * which provides IPFS and content-addressable storage capabilities.
 */

import axios, { AxiosInstance } from 'axios';
import { ConfigManager } from '../config/manager';
import { logger } from '../utils/logger';
import { CID } from '../types/common';
import { ListOptions, StorageItemMetadata } from '../types/storage';

// MCP Client configuration options
export interface MCPClientConfig {
  baseUrl: string;
  timeout?: number;
  apiKey?: string;
  namespace?: string;
}

// Options for adding content
export interface AddContentOptions {
  contentType?: string;
  filename?: string;
  pin?: boolean;
  wrapWithDirectory?: boolean;
  onlyHash?: boolean;
  metadata?: Record<string, any>;
}

// IPLD Node representation
export interface IPLDNode {
  data: any;
  links: Array<{
    name?: string;
    size?: number;
    cid: CID;
  }>;
}

/**
 * Client for interacting with the MCP server
 */
export class MCPClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private connected: boolean = false;
  private config: MCPClientConfig;
  
  /**
   * Create a new MCP client
   * 
   * @param config Client configuration
   */
  constructor(config?: Partial<MCPClientConfig>) {
    // Get configuration from config manager if not provided
    const configManager = ConfigManager.getInstance();
    
    this.config = {
      baseUrl: (config?.baseUrl || configManager.get('storage.mcp.baseUrl', 'http://localhost:5001')) as string,
      timeout: config?.timeout || configManager.get('storage.mcp.timeout', 30000),
      apiKey: config?.apiKey || configManager.get('storage.mcp.apiKey', ''),
      namespace: config?.namespace || configManager.get('storage.mcp.namespace', 'swissknife')
    };
    
    this.baseUrl = this.config.baseUrl;
    
    // Create HTTP client
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.config.timeout,
      headers: this.config.apiKey ? {
        'Authorization': `Bearer ${this.config.apiKey}`
      } : {}
    });
    
    logger.debug(`MCP Client created with base URL: ${this.baseUrl}`);
  }
  
  /**
   * Connect to the MCP server
   * 
   * @returns Promise resolving to connection status
   */
  async connect(): Promise<boolean> {
    try {
      const response = await this.client.get('/status');
      this.connected = response.status === 200;
      
      if (this.connected) {
        logger.info('Successfully connected to MCP server');
      } else {
        logger.warn('Failed to connect to MCP server');
      }
      
      return this.connected;
    } catch (error) {
      logger.error('Error connecting to MCP server', error);
      this.connected = false;
      return false;
    }
  }
  
  /**
   * Disconnect from the MCP server
   * 
   * @returns Promise resolving to disconnection status
   */
  async disconnect(): Promise<boolean> {
    this.connected = false;
    logger.info('Disconnected from MCP server');
    return true;
  }
  
  /**
   * Check if connected to the MCP server
   * 
   * @returns Connection status
   */
  isConnectedToServer(): boolean {
    return this.connected;
  }
  
  /**
   * Add content to IPFS
   * 
   * @param content Content to add (string or Buffer)
   * @param options Additional options
   * @returns Promise resolving to content CID
   */
  async add(content: string | Buffer, options: AddContentOptions = {}): Promise<CID> {
    if (!this.connected) {
      await this.connect();
    }
    
    try {
      const contentType = options.contentType || (typeof content === 'string' ? 'text/plain' : 'application/octet-stream');
      const encoding = typeof content === 'string' ? 'utf8' : 'base64';
      const contentValue = typeof content === 'string' ? content : content.toString('base64');
      
      const response = await this.client.post('/content', {
        content: contentValue,
        encoding,
        contentType,
        filename: options.filename,
        metadata: options.metadata,
        pin: options.pin !== false, // Pin by default
        wrapWithDirectory: options.wrapWithDirectory || false,
        onlyHash: options.onlyHash || false
      });
      
      return response.data.cid;
    } catch (error) {
      logger.error('Error adding content to MCP server', error);
      throw error;
    }
  }
  
  /**
   * Get content from IPFS
   * 
   * @param cid Content identifier
   * @returns Promise resolving to content as Buffer
   */
  async get(cid: CID): Promise<Buffer> {
    if (!this.connected) {
      await this.connect();
    }
    
    try {
      const response = await this.client.get(`/content/${cid}`);
      
      const { content, encoding } = response.data;
      
      if (encoding === 'base64') {
        return Buffer.from(content, 'base64');
      } else {
        return Buffer.from(content, 'utf8');
      }
    } catch (error) {
      logger.error(`Error getting content ${cid} from MCP server`, error);
      throw error;
    }
  }
  
  /**
   * Add an IPLD node to IPFS
   * 
   * @param data Node data
   * @param links Node links
   * @returns Promise resolving to node CID
   */
  async addNode(data: any, links: Array<{ name?: string; cid: CID; size?: number }> = []): Promise<CID> {
    if (!this.connected) {
      await this.connect();
    }
    
    try {
      const response = await this.client.post('/ipld/node', {
        data,
        links,
        namespace: this.config.namespace
      });
      
      return response.data.cid;
    } catch (error) {
      logger.error('Error adding IPLD node to MCP server', error);
      throw error;
    }
  }
  
  /**
   * Get an IPLD node from IPFS
   * 
   * @param cid Node identifier
   * @returns Promise resolving to IPLD node
   */
  async getNode(cid: CID): Promise<IPLDNode> {
    if (!this.connected) {
      await this.connect();
    }
    
    try {
      const response = await this.client.get(`/ipld/node/${cid}`);
      return {
        data: response.data.data,
        links: response.data.links || []
      };
    } catch (error) {
      logger.error(`Error getting IPLD node ${cid} from MCP server`, error);
      throw error;
    }
  }
  
  /**
   * Create a CAR file with the specified roots and blocks
   * 
   * @param roots Root CIDs
   * @param blocks Optional blocks to include
   * @returns Promise resolving to CAR CID and size
   */
  async createCar(roots: CID[], blocks: Record<CID, Buffer> = {}): Promise<{ carCid: CID; size: number }> {
    if (!this.connected) {
      await this.connect();
    }
    
    try {
      // Convert blocks to base64
      const encodedBlocks: Record<CID, string> = {};
      
      for (const [cid, data] of Object.entries(blocks)) {
        encodedBlocks[cid] = data.toString('base64');
      }
      
      const response = await this.client.post('/ipld/car', {
        roots,
        blocks: Object.keys(blocks).length > 0 ? encodedBlocks : undefined,
        namespace: this.config.namespace
      });
      
      return {
        carCid: response.data.carCid,
        size: response.data.size || 0
      };
    } catch (error) {
      logger.error('Error creating CAR file in MCP server', error);
      throw error;
    }
  }
  
  /**
   * Load a CAR file from IPFS
   * 
   * @param carCid CAR file identifier
   * @returns Promise resolving to roots and blocks
   */
  async loadCar(carCid: CID): Promise<{ roots: CID[]; blocks: Record<CID, Buffer> }> {
    if (!this.connected) {
      await this.connect();
    }
    
    try {
      const response = await this.client.get(`/ipld/car/${carCid}`);
      
      const { roots, blocks } = response.data;
      const decodedBlocks: Record<CID, Buffer> = {};
      
      // Convert base64 blocks back to Buffer
      for (const [cid, data] of Object.entries(blocks)) {
        decodedBlocks[cid] = Buffer.from(data as string, 'base64');
      }
      
      return {
        roots,
        blocks: decodedBlocks
      };
    } catch (error) {
      logger.error(`Error loading CAR file ${carCid} from MCP server`, error);
      throw error;
    }
  }
  
  /**
   * List content in the namespace
   * 
   * @param options Listing options
   * @returns Promise resolving to list of CIDs and metadata
   */
  async list(options: ListOptions = {}): Promise<{ cids: CID[]; metadata: StorageItemMetadata[] }> {
    if (!this.connected) {
      await this.connect();
    }
    
    try {
      const response = await this.client.get('/content', {
        params: {
          namespace: this.config.namespace,
          limit: options.limit,
          prefix: options.prefix,
          offset: options.offset,
          tag: Array.isArray(options.tag) ? options.tag.join(',') : options.tag,
          sortBy: options.sortBy,
          sortDirection: options.sortDirection
        }
      });
      
      return {
        cids: response.data.cids || [],
        metadata: response.data.metadata || []
      };
    } catch (error) {
      logger.error('Error listing content from MCP server', error);
      throw error;
    }
  }
  
  /**
   * Pin content in IPFS
   * 
   * @param cid Content identifier
   * @returns Promise resolving to pin status
   */
  async pin(cid: CID): Promise<boolean> {
    if (!this.connected) {
      await this.connect();
    }
    
    try {
      const response = await this.client.post(`/pin/${cid}`);
      return response.status === 200;
    } catch (error) {
      logger.error(`Error pinning content ${cid} in MCP server`, error);
      throw error;
    }
  }
  
  /**
   * Unpin content in IPFS
   * 
   * @param cid Content identifier
   * @returns Promise resolving to unpin status
   */
  async unpin(cid: CID): Promise<boolean> {
    if (!this.connected) {
      await this.connect();
    }
    
    try {
      const response = await this.client.delete(`/pin/${cid}`);
      return response.status === 200;
    } catch (error) {
      logger.error(`Error unpinning content ${cid} in MCP server`, error);
      throw error;
    }
  }
  
  /**
   * Get server information
   * 
   * @returns Promise resolving to server information
   */
  async getServerInfo(): Promise<any> {
    if (!this.connected) {
      await this.connect();
    }
    
    try {
      const response = await this.client.get('/info');
      return response.data;
    } catch (error) {
      logger.error('Error getting server information from MCP server', error);
      throw error;
    }
  }
}
