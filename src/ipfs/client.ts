// src/ipfs/client.ts

import fetch from 'node-fetch';
import FormData from 'form-data';
import { Readable } from 'stream';
import { logger } from '../utils/logger.js';
import { ConfigurationManager } from '../config/manager.js';

/**
 * Options for IPFS add operations
 */
export interface IPFSAddOptions {
  /** Filename to use for the added content */
  filename?: string;
  
  /** Whether to pin the content */
  pin?: boolean;
  
  /** Whether to wrap the content in a directory */
  wrapWithDirectory?: boolean;
  
  /** CID version to use (0 or 1) */
  cidVersion?: 0 | 1;
  
  /** Hash algorithm to use */
  hashAlg?: string;
}

/**
 * Result of IPFS add operation
 */
export interface IPFSAddResult {
  /** Content identifier (CID) of the added content */
  cid: string;
  
  /** Size of the added content in bytes */
  size: number;
  
  /** Path of the added content */
  path?: string;
}

/**
 * IPFS pin types
 */
export enum IPFSPinType {
  DIRECT = 'direct',
  RECURSIVE = 'recursive',
  INDIRECT = 'indirect'
}

/**
 * IPFS pin status
 */
export interface IPFSPinStatus {
  /** Content identifier (CID) */
  cid: string;
  
  /** Type of pin */
  type: IPFSPinType;
}

/**
 * IPFS client configuration
 */
export interface IPFSClientConfig {
  /** URL of the IPFS API */
  apiUrl?: string;
  
  /** API key for authenticated access */
  apiKey?: string;
  
  /** Additional headers to include in requests */
  headers?: Record<string, string>;
  
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Client for interacting with IPFS nodes
 */
export class IPFSKitClient {
  private apiUrl: string;
  private headers: Record<string, string>;
  private timeout: number;
  
  /**
   * Creates a new IPFS client
   * @param config Client configuration
   */
  constructor(config: IPFSClientConfig = {}) {
    const configManager = ConfigurationManager.getInstance();
    
    // Set up API URL - allow override or use config
    this.apiUrl = config.apiUrl ??
      configManager.get<string>('ipfs.apiUrl', 'http://localhost:5001/api/v0') ??
      'http://localhost:5001/api/v0';
    
    // Remove trailing slashes
    this.apiUrl = this.apiUrl.replace(/\/+$/, '');
    
    // Ensure the URL includes the API version
    if (!this.apiUrl.endsWith('/api/v0')) {
      this.apiUrl = `${this.apiUrl}/api/v0`;
    }
    
    // Set up headers
    this.headers = {
      'Accept': 'application/json',
      ...config.headers
    };
    
    // Add API key if provided
    const apiKey = config.apiKey ?? configManager.get<string>('ipfs.apiKey');
    if (apiKey) {
      this.headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    // Set timeout
    this.timeout = config.timeout ??
      configManager.get<number>('ipfs.requestTimeoutMs', 30000) ??
      30000;
    
    logger.debug(`IPFS client initialized with API URL: ${this.apiUrl}`);
  }

  private createTimeoutSignal(): AbortSignal {
    return AbortSignal.timeout(this.timeout);
  }
  
  /**
   * Add content to IPFS
   * @param content Content to add (Buffer, string, or stream)
   * @param options Add options
   * @returns Object containing the CID of the added content
   */
  public async addContent(
    content: Buffer | string | NodeJS.ReadableStream, 
    options: IPFSAddOptions = {}
  ): Promise<IPFSAddResult> {
    try {
      const formData = new FormData();
      
      // Handle different content types
      if (Buffer.isBuffer(content)) {
        formData.append('file', content, options.filename || 'file');
      } else if (typeof content === 'string') {
        formData.append('file', Buffer.from(content), options.filename || 'file');
      } else if (content instanceof Readable || 'pipe' in content) {
        formData.append('file', content, options.filename || 'file');
      } else {
        throw new Error('Content must be a Buffer, string, or ReadableStream');
      }
      
      // Set up query parameters
      const params = new URLSearchParams();
      
      if (options.pin !== undefined) {
        params.append('pin', options.pin.toString());
      }
      
      if (options.wrapWithDirectory !== undefined) {
        params.append('wrap-with-directory', options.wrapWithDirectory.toString());
      }
      
      if (options.cidVersion !== undefined) {
        params.append('cid-version', options.cidVersion.toString());
      }
      
      if (options.hashAlg) {
        params.append('hash', options.hashAlg);
      }
      
      // Make API request
      const url = `${this.apiUrl}/add?${params.toString()}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.headers,
          ...formData.getHeaders()
        },
        body: formData,
        signal: this.createTimeoutSignal()
      });
      
      if (!response.ok) {
        throw new Error(`IPFS add failed: ${response.statusText}`);
      }
      
      // Parse response
      const data = await response.json() as any;
      
      if (!data.Hash) {
        throw new Error('IPFS add response did not contain a Hash');
      }
      
      return {
        cid: data.Hash,
        size: parseInt(data.Size, 10) || 0,
        path: data.Name
      };
    } catch (error) {
      logger.error(`Failed to add content to IPFS: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Get content from IPFS by CID
   * @param cid Content identifier
   * @returns Content as a Buffer
   */
  public async getContent(cid: string): Promise<Buffer> {
    try {
      // Make API request
      const url = `${this.apiUrl}/cat?arg=${encodeURIComponent(cid)}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        signal: this.createTimeoutSignal()
      });
      
      if (!response.ok) {
        throw new Error(`IPFS cat failed: ${response.statusText}`);
      }
      
      // Get response as buffer
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      logger.error(`Failed to get content from IPFS: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Get content from IPFS as a stream
   * @param cid Content identifier
   * @returns Readable stream of the content
   */
  public async getContentStream(cid: string): Promise<NodeJS.ReadableStream> {
    try {
      // Make API request
      const url = `${this.apiUrl}/cat?arg=${encodeURIComponent(cid)}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        signal: this.createTimeoutSignal()
      });
      
      if (!response.ok) {
        throw new Error(`IPFS cat failed: ${response.statusText}`);
      }
      
      // Return the body stream
      return response.body!;
    } catch (error) {
      logger.error(`Failed to get content stream from IPFS: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Pin content in IPFS
   * @param cid Content identifier to pin
   * @param recursive Whether to pin recursively
   * @returns True if pinning was successful
   */
  public async pinContent(cid: string, recursive: boolean = true): Promise<boolean> {
    try {
      // Set up query parameters
      const params = new URLSearchParams();
      params.append('arg', cid);
      params.append('recursive', recursive.toString());
      
      // Make API request
      const url = `${this.apiUrl}/pin/add?${params.toString()}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        signal: this.createTimeoutSignal()
      });
      
      if (!response.ok) {
        throw new Error(`IPFS pin failed: ${response.statusText}`);
      }
      
      // Parse response
      const data = await response.json() as any;
      
      return Array.isArray(data?.Pins) && data.Pins.includes(cid);
    } catch (error) {
      logger.error(`Failed to pin content in IPFS: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Unpin content from IPFS
   * @param cid Content identifier to unpin
   * @param recursive Whether to unpin recursively
   * @returns True if unpinning was successful
   */
  public async unpinContent(cid: string, recursive: boolean = true): Promise<boolean> {
    try {
      // Set up query parameters
      const params = new URLSearchParams();
      params.append('arg', cid);
      params.append('recursive', recursive.toString());
      
      // Make API request
      const url = `${this.apiUrl}/pin/rm?${params.toString()}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        signal: this.createTimeoutSignal()
      });
      
      if (!response.ok) {
        throw new Error(`IPFS unpin failed: ${response.statusText}`);
      }
      
      // Parse response
      const data = await response.json() as any;
      
      return Array.isArray(data?.Pins) && data.Pins.includes(cid);
    } catch (error) {
      logger.error(`Failed to unpin content from IPFS: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * List all pinned content
   * @param type Type of pins to list
   * @returns Array of pin status objects
   */
  public async listPins(type: IPFSPinType | 'all' = 'all'): Promise<IPFSPinStatus[]> {
    try {
      // Set up query parameters
      const params = new URLSearchParams();
      params.append('type', type);
      
      // Make API request
      const url = `${this.apiUrl}/pin/ls?${params.toString()}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        signal: this.createTimeoutSignal()
      });
      
      if (!response.ok) {
        throw new Error(`IPFS pin ls failed: ${response.statusText}`);
      }
      
      // Parse response
      const data = await response.json() as any;
      
      if (!data.Keys || typeof data.Keys !== 'object') {
        return [];
      }
      
      // Convert to array of pin status objects
      return Object.entries(data.Keys).map(([cid, info]: [string, any]) => ({
        cid,
        type: info.Type as IPFSPinType
      }));
    } catch (error) {
      logger.error(`Failed to list pins from IPFS: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Check if a CID is pinned
   * @param cid Content identifier to check
   * @returns True if the CID is pinned
   */
  public async isPinned(cid: string): Promise<boolean> {
    try {
      // Set up query parameters
      const params = new URLSearchParams();
      params.append('arg', cid);
      
      // Make API request
      const url = `${this.apiUrl}/pin/ls?${params.toString()}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        signal: this.createTimeoutSignal()
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          return false;
        }
        throw new Error(`IPFS pin check failed: ${response.statusText}`);
      }
      
      // Parse response
      const data = await response.json() as any;
      
      return !!data.Keys && !!data.Keys[cid];
    } catch (error) {
      if (error instanceof Error && error.message.includes('not pinned')) {
        return false;
      }
      
      logger.error(`Failed to check pin status in IPFS: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Get node information
   * @returns Node information object
   */
  public async getNodeInfo(): Promise<any> {
    try {
      // Make API request
      const url = `${this.apiUrl}/id`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        signal: this.createTimeoutSignal()
      });
      
      if (!response.ok) {
        throw new Error(`IPFS id command failed: ${response.statusText}`);
      }
      
      // Parse response
      return await response.json();
    } catch (error) {
      logger.error(`Failed to get IPFS node info: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Check if the IPFS node is reachable
   * @returns True if the node is reachable
   */
  public async isNodeReachable(): Promise<boolean> {
    try {
      // Make API request
      const url = `${this.apiUrl}/version`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        signal: this.createTimeoutSignal()
      });
      
      return response.ok;
    } catch (error) {
      logger.debug(`IPFS node not reachable: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  /**
   * Get node version information
   * @returns Version information object
   */
  public async getVersion(): Promise<any> {
    try {
      // Make API request
      const url = `${this.apiUrl}/version`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        signal: this.createTimeoutSignal()
      });
      
      if (!response.ok) {
        throw new Error(`IPFS version command failed: ${response.statusText}`);
      }
      
      // Parse response
      return await response.json();
    } catch (error) {
      logger.error(`Failed to get IPFS version: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
