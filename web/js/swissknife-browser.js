/**
 * SwissKnife Browser Entry Point
 * 
 * This file adapts the existing SwissKnife TypeScript core for browser use.
 * It creates browser-compatible wrappers around the Node.js-based components.
 */

// Browser polyfills for Node.js modules
import { Buffer } from 'buffer';
import process from 'process';
import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import * as filters from '@libp2p/websockets/filters';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { mplex } from '@libp2p/mplex';
import { kadDHT } from '@libp2p/kad-dht';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
// // import { circuitRelayTransport } from '@libp2p/circuit-relay-transport';

// Storacha imports
import { Client } from '@storacha/client';
import * as UCANModule from '@storacha/ucn';
import * as CapabilitiesModule from '@storacha/capabilities';
import { StoreIndexedDB } from '@storacha/access';

// Make globals available
if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  window.process = process;
  window.global = window;
}

// Import VFS and adapters - make problematic ones conditional
import { VirtualFileSystem } from './core/vfs.js';
import { IndexedDBAdapter } from './core/storage-adapters/indexeddb-adapter.js';
// Temporarily disable Helia adapter due to webpack globalThis issues
// import { HeliaAdapter } from './core/storage-adapters/helia-adapter.js';
// Conditional imports for problematic adapters
// import { Web3StorageAdapter } from './core/storage-adapters/web3storage-adapter.js';
// import { S3Adapter } from './core/storage-adapters/s3-adapter.js';
// import { HuggingFaceAdapter } from './core/storage-adapters/huggingface-adapter.js';
import { ReplicationManager } from './core/replication-manager.js';

/**
 * Browser-adapted SwissKnife Core Engine
 * This version provides a compatible API without requiring the full Node.js SwissKnife core
 */
export class SwissKnifeBrowser {
  constructor() {
    this.initialized = false;
    this.config = new Map();
    this.modelsList = [];
    this.tasks = new Map();

    // Initialize Storacha components
    this.ucan = UCANModule;
    this.capabilities = CapabilitiesModule;
    this.access = new Client(new StoreIndexedDB());
    
    // Default configuration
    this.config.set('storage', 'localstorage');
    this.config.set('ai.provider', 'openai');
    this.config.set('debug', false);
    
    // Initialize network API namespace for P2P functionality
    this.network = {
      libp2p: null, // Will hold the libp2p instance
      start: async () => this.startLibp2p(),
      stop: async () => this.stopLibp2p(),
      getPeerId: () => this.network.libp2p ? this.network.libp2p.peerId.toString() : null,
      getConnections: () => this.network.libp2p ? this.network.libp2p.getConnections().map(conn => conn.remotePeer.toString()) : [],
      subscribe: async (topic, handler) => {
        if (!this.network.libp2p) throw new Error('Libp2p not started.');
        this.network.libp2p.pubsub.subscribe(topic);
        this.network.libp2p.pubsub.addEventListener('message', (evt) => {
          if (evt.detail.topic === topic) {
            handler(evt.detail.data.toString());
          }
        });
      },
      publish: async (topic, message) => {
        if (!this.network.libp2p) throw new Error('Libp2p not started.');
        await this.network.libp2p.pubsub.publish(topic, new TextEncoder().encode(message));
      },
      getActivePeers: async () => {
        console.log('Getting active peers...');
        return this.network.libp2p ? this.network.libp2p.getPeers().map(peerId => peerId.toString()) : [];
      },
      queryPeerModels: async (peerId) => {
        console.log('Querying peer models for:', peerId);
        return []; // Placeholder for future implementation
      },
      announceFiles: async (files) => {
        if (!this.network.libp2p) throw new Error('Libp2p not started.');
        const message = JSON.stringify({ type: 'ANNOUNCE_FILES', files });
        for (const peerId of this.network.libp2p.getPeers()) {
          if (peerId.toString() === this.network.libp2p.peerId.toString()) continue; // Don't send to self
          try {
            const { stream } = await this.network.libp2p.dialProtocol(peerId, '/swissknife/peer-info/1.0.0');
            const { readable, writable } = stream;
            const writer = writable.getWriter();
            await writer.write(new TextEncoder().encode(message));
            writer.close();
            const reader = readable.getReader();
            const { value } = await reader.read();
            const response = JSON.parse(new TextDecoder().decode(value));
            console.log(`Announcement response from ${peerId.toString()}:`, response);
            reader.releaseLock();
            stream.close();
          } catch (error) {
            console.warn(`Failed to announce files to peer ${peerId.toString()}:`, error);
          }
        }
      },
      queryFiles: async (peerId) => {
        if (!this.network.libp2p) throw new Error('Libp2p not started.');
        const message = JSON.stringify({ type: 'QUERY_FILES' });
        try {
          const { stream } = await this.network.libp2p.dialProtocol(peerId, '/swissknife/peer-info/1.0.0');
          const { readable, writable } = stream;
          const writer = writable.getWriter();
          await writer.write(new TextEncoder().encode(message));
          writer.close();
          const reader = readable.getReader();
          const { value } = await reader.read();
          const response = JSON.parse(new TextDecoder().decode(value));
          console.log(`Query response from ${peerId.toString()}:`, response);
          reader.releaseLock();
          stream.close();
          return response.files || [];
        } catch (error) {
          console.error(`Failed to query files from peer ${peerId.toString()}:`, error);
          return [];
        }
      },
      requestFile: async (peerId, hash) => {
        if (!this.network.libp2p) throw new Error('Libp2p not started.');
        const message = JSON.stringify({ type: 'REQUEST_FILE', hash });
        try {
          const { stream } = await this.network.libp2p.dialProtocol(peerId, '/swissknife/file-transfer/1.0.0');
          const { readable, writable } = stream;
          const writer = writable.getWriter();
          await writer.write(new TextEncoder().encode(message));
          writer.close();
          const reader = readable.getReader();
          const chunks = [];
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          const fileContent = new TextDecoder().decode(Uint8Array.from(chunks.flat()));
          console.log(`Received file content for hash ${hash} from ${peerId.toString()}`);
          reader.releaseLock();
          stream.close();
          return fileContent;
        } catch (error) {
          console.error(`Failed to request file ${hash} from peer ${peerId.toString()}:`, error);
          throw error;
        }
      }
    };

    // Initialize models API namespace for compatibility with Model Browser
    this.models = {
      list: () => this.getAvailableModels(),
      load: async (options) => {
        console.log('Model load requested:', options);
        return {
          success: true,
          message: 'Model loading simulated - functionality not yet implemented'
        };
      },
      import: async (options) => {
        console.log('Model import requested:', options);
        return {
          success: true,
          message: 'Model import simulated - functionality not yet implemented'
        };
      },
      configureApi: async (options) => {
        console.log('Model API configuration requested:', options);
        return {
          success: true,
          message: 'API configuration simulated - functionality not yet implemented'
        };
      }
    };

    // Initialize Replication Manager
    this.replication = new ReplicationManager(this.storage, this.network);
    // Example: Configure replication targets (this would be dynamic in a real app)
    this.replication.configureReplication(['helia', 'web3storage', 's3', 'huggingface', 'peers']);
  }

  /**
   * Initialize SwissKnife for browser environment
   */
  async initialize(options = {}) {
    try {
      console.log('Initializing SwissKnife for browser...');
      
      // Merge options with config
      if (options.config) {
        Object.entries(options.config).forEach(([key, value]) => {
          this.config.set(key, value);
        });
      }
      
      // Set up API keys - check localStorage first, then options
      let apiKey = options.openaiApiKey || localStorage.getItem('swissknife_openai_key');
      if (apiKey) {
        this.config.set('openai.apiKey', apiKey);
        localStorage.setItem('swissknife_openai_key', apiKey);
        console.log('✅ OpenAI API key configured');
      } else {
        console.log('⚠️ No OpenAI API key found - AI features will be limited');
      }
      
      // Initialize storage
      await this.initializeStorage(options.storage || {});
      
      // Initialize AI models
      await this.initializeModels();

      // Initialize libp2p
      // await this.startLibp2p();
      
      this.initialized = true;
      console.log('SwissKnife browser initialization complete');
      
      return {
        success: true,
        message: 'SwissKnife initialized successfully for browser'
      };
    } catch (error) {
      console.error('Failed to initialize SwissKnife for browser:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async initializeStorage(options = {}) {
    // Initialize VFS with adapters
    this.storage = new VirtualFileSystem({}, options.defaultAdapter || 'indexeddb');
    this.storage.addAdapter('indexeddb', new IndexedDBAdapter(options.dbName, options.storeName));
    
    // Temporarily disable Helia adapter due to webpack globalThis issues
    // const heliaAdapter = new HeliaAdapter();
    // await heliaAdapter.init(); // Initialize Helia node
    // this.storage.addAdapter('helia', heliaAdapter); // Add Helia adapter

    // Commented out problematic adapters that cause webpack build issues
    // TODO: Re-enable with dynamic imports when needed
    /*
    const web3StorageAdapter = new Web3StorageAdapter();
    // Web3StorageAdapter requires authentication (privateKey, proof) to initialize.
    // This will be handled later, likely via a settings UI or UCAN flow.
    // For now, it's added but not fully initialized.
    this.storage.addAdapter('web3storage', web3StorageAdapter);

    const s3Adapter = new S3Adapter();
    // S3Adapter requires region, accessKeyId, secretAccessKey, and bucketName to initialize.
    // This will be handled later, likely via a settings UI.
    this.storage.addAdapter('s3', s3Adapter);

    const huggingFaceAdapter = new HuggingFaceAdapter();
    // HuggingFaceAdapter requires a token to initialize.
    // This will be handled later, likely via a settings UI.
    this.storage.addAdapter('huggingface', huggingFaceAdapter);
    */

    // Set initial active adapter based on options or default
    if (options.activeAdapter) {
        this.storage.setAdapter(options.activeAdapter);
    } else {
        this.storage.setAdapter(this.storage.defaultAdapter);
    }
    console.log(`Storage initialized with active adapter: ${this.storage.getActiveAdapterName()}`);
  }

  async initializeModels() {
    // Add default models
    this.modelsList = [
      {
        id: 'gpt-4',
        name: 'GPT-4',
        provider: 'openai',
        description: 'OpenAI GPT-4 model'
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        description: 'OpenAI GPT-3.5 Turbo model'
      }
    ];
    console.log('Models initialized:', this.modelsList.length);
  }

  /**
   * Execute an AI task in the browser
   */
  async executeTask(taskDescription, options = {}) {
    if (!this.initialized) {
      throw new Error('SwissKnife not initialized. Call initialize() first.');
    }

    try {
      const taskId = this.generateId();
      const task = {
        id: taskId,
        description: taskDescription,
        status: 'pending',
        created: new Date().toISOString(),
        priority: options.priority || 0
      };
      
      this.tasks.set(taskId, task);
      
      // Simulate AI processing
      console.log('Processing task:', taskDescription);
      
      // If we have an API key, we could make actual AI calls here
      const apiKey = this.config.get('openai.apiKey');
      if (apiKey && options.useAI !== false) {
        try {
          const response = await this.callOpenAI(taskDescription, apiKey);
          task.result = response;
          task.status = 'completed';
        } catch (error) {
          task.status = 'failed';
          task.error = error.message;
        }
      } else {
        // Fallback response
        task.result = {
          content: `Task processed: ${taskDescription}`,
          type: 'simulated'
        };
        task.status = 'completed';
      }

      return {
        success: true,
        task,
        result: task.result
      };
    } catch (error) {
      console.error('Error executing task:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Chat with AI agent
   */
  async chat(message, options = {}) {
    if (!this.initialized) {
      throw new Error('SwissKnife not initialized. Call initialize() first.');
    }

    try {
      const apiKey = this.config.get('openai.apiKey');
      
      if (apiKey) {
        const response = await this.callOpenAI(message, apiKey);
        return {
          success: true,
          response: response.content || response,
          conversationId: options.conversationId || this.generateId()
        };
      } else {
        // Simulated response when no API key
        return {
          success: true,
          response: `I'm a simulated AI response to: "${message}". To enable real AI responses, please set your OpenAI API key in settings.`,
          conversationId: options.conversationId || this.generateId()
        };
      }
    } catch (error) {
      console.error('Error in chat:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async callOpenAI(message, apiKey) {
    // Simple OpenAI API call for browser
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'user',
          content: message
        }],
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || 'No response',
      usage: data.usage
    };
  }

  /**
   * List available AI models
   */
  getAvailableModels() {
    return this.modelsList;
  }

  /**
   * Get current configuration
   */
  getConfig() {
    const config = {};
    this.config.forEach((value, key) => {
      config[key] = value;
    });
    return config;
  }

  /**
   * Update configuration
   */
  async updateConfig(updates) {
    for (const [key, value] of Object.entries(updates)) {
      this.config.set(key, value);
      
      // Persist certain config to localStorage
      if (key.includes('apiKey')) {
        localStorage.setItem(`swissknife_${key.replace('.', '_')}`, value);
        console.log(`✅ Updated ${key} in localStorage`);
      }
    }
    
    return this.getConfig();
  }

  /**
   * Refresh API keys from localStorage
   */
  async refreshAPIKeys() {
    const openaiKey = localStorage.getItem('swissknife_openai_key');
    if (openaiKey) {
      this.config.set('openai.apiKey', openaiKey);
      console.log('✅ Refreshed OpenAI API key from localStorage');
    }
    
    const anthropicKey = localStorage.getItem('swissknife_anthropic_key');
    if (anthropicKey) {
      this.config.set('anthropic.apiKey', anthropicKey);
      console.log('✅ Refreshed Anthropic API key from localStorage');
    }
    
    return true;
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId) {
    return this.tasks.get(taskId) || null;
  }

  /**
   * List all tasks
   */
  async listTasks() {
    return Array.from(this.tasks.values());
  }

  /**
   * Store content using content-addressed storage
   */
  async storeContent(content, options = {}) {
    try {
      const hash = await this.generateHash(content);
      const key = `content_${hash}`;
      
      localStorage.setItem(key, JSON.stringify({
        content,
        timestamp: new Date().toISOString(),
        size: content.length,
        ...options
      }));
      
      return {
        success: true,
        hash,
        size: content.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Retrieve content by hash
   */
  async retrieveContent(hash) {
    try {
      const key = `content_${hash}`;
      const stored = localStorage.getItem(key);
      
      if (!stored) {
        throw new Error('Content not found');
      }
      
      const data = JSON.parse(stored);
      return {
        success: true,
        content: data.content
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate a simple hash for content addressing
   */
  async generateHash(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }

  /**
   * Generate a unique ID
   */
  generateId() {
    return 'sk_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Get hardware status for system monitoring
   */
  getHardwareStatus() {
    // Cache the result to avoid creating multiple WebGL contexts
    if (this._hardwareStatus) {
      return this._hardwareStatus;
    }

    this._hardwareStatus = {
      webnn: 'ml' in navigator || 'webkitML' in navigator || false,
      gpu: 'gpu' in navigator || false,
      webgl: (() => {
        try {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          if (gl) {
            // Immediately clean up the context to prevent accumulation
            const loseContext = gl.getExtension('WEBGL_lose_context');
            if (loseContext) {
              loseContext.loseContext();
            }
            return true;
          }
          return false;
        } catch (e) {
          return false;
        }
      })(),
      webgpu: 'gpu' in navigator && typeof navigator.gpu?.requestAdapter === 'function',
      storage: 'storage' in navigator && 'estimate' in navigator.storage,
      workers: 'Worker' in window && 'SharedWorker' in window,
      wasm: 'WebAssembly' in window
    };

    return this._hardwareStatus;
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    try {
      this.initialized = false;
      await this.stopLibp2p();
      console.log('SwissKnife browser instance shut down');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }

  // Temporarily disabled libp2p functionality due to webpack build issues
  // TODO: Re-enable when we resolve the browser compatibility issues
  /*
  async startLibp2p() {
    if (this.network.libp2p) {
      console.log('Libp2p already running.');
      return;
    }
    try {
      this.network.libp2p = await createLibp2p({
        transports: [
          webSockets({
            filter: filters.all
          }),
          webRTC(),
          circuitRelayTransport()
        ],
        connectionEncryption: [noise()],
        streamMuxers: [yamux(), mplex()],
        peerDiscovery: [
          kadDHT({
            protocol: '/ipfs/kad/1.0.0',
            clientMode: true,
          })
        ],
        services: {
          pubsub: gossipsub({ emitSelf: true }),
          identify: identify(),
          peerInfo: (context) => {
            context.handle('/swissknife/peer-info/1.0.0', async ({ stream }) => {
              try {
                const { readable, writable } = stream;
                const reader = readable.getReader();
                const writer = writable.getWriter();

                // Read incoming message
                const { value: messageBytes, done } = await reader.read();
                if (done) return;

                const message = new TextDecoder().decode(messageBytes);
                const parsedMessage = JSON.parse(message);

                console.log(`Received peer-info message from ${stream.remotePeer.toString()}:`, parsedMessage);

                if (parsedMessage.type === 'ANNOUNCE_FILES') {
                  // Store announced files/hashes from peer
                  // For now, just log. Later, integrate with VFS or a peer file index.
                  console.log(`Peer ${stream.remotePeer.toString()} announced files:`, parsedMessage.files);
                  // Send acknowledgment
                  await writer.write(new TextEncoder().encode(JSON.stringify({ status: 'ACK', message: 'Announcement received' })));
                } else if (parsedMessage.type === 'QUERY_FILES') {
                  // Respond with local files/hashes
                  // For now, send a mock response. Later, integrate with VFS.
                  const localFiles = [
                    { path: '/my-local-file.txt', hash: 'QmLocalHash1' },
                    { path: '/another-file.jpg', hash: 'QmLocalHash2' }
                  ];
                  await writer.write(new TextEncoder().encode(JSON.stringify({ type: 'FILES_RESPONSE', files: localFiles })));
                } else {
                  await writer.write(new TextEncoder().encode(JSON.stringify({ status: 'ERROR', message: 'Unknown message type' })));
                }
              } catch (error) {
                console.error('Error handling peer-info stream:', error);
              } finally {
                stream.close();
              }
            });
          },
          fileTransfer: (context) => {
            context.handle('/swissknife/file-transfer/1.0.0', async ({ stream }) => {
              try {
                const { readable, writable } = stream;
                const reader = readable.getReader();
                const writer = writable.getWriter();

                // Read file request (e.g., { type: 'REQUEST_FILE', hash: 'Qm...' })
                const { value: requestBytes, done: requestDone } = await reader.read();
                if (requestDone) return;

                const request = JSON.parse(new TextDecoder().decode(requestBytes));
                console.log(`Received file transfer request from ${stream.remotePeer.toString()}:`, request);

                if (request.type === 'REQUEST_FILE' && request.hash) {
                  // Simulate fetching file content from local storage (VFS)
                  // In a real scenario, this would involve reading from the VFS
                  const fileContent = `Mock content for hash: ${request.hash}`; // Replace with actual VFS read
                  await writer.write(new TextEncoder().encode(fileContent));
                  console.log(`Sent mock content for hash ${request.hash} to ${stream.remotePeer.toString()}`);
                } else {
                  await writer.write(new TextEncoder().encode('ERROR: Invalid file request'));
                }
              } catch (error) {
                console.error('Error handling file transfer stream:', error);
              } finally {
                stream.close();
              }
            });
          }
        }
      });

      await this.network.libp2p.start();
      console.log(`Libp2p started with Peer ID: ${this.network.libp2p.peerId.toString()}`);
      console.log('Libp2p listening on addresses:', this.network.libp2p.getMultiaddrs().map(ma => ma.toString()));
    } catch (error) {
      console.error('Failed to start libp2p:', error);
      throw error;
    }
  }
  */

  async startLibp2p() {
    if (this.network.libp2p) {
      console.log('Libp2p already running.');
      return;
    }
    try {
      this.network.libp2p = await createLibp2p({
        transports: [
          webSockets({
            filter: filters.all
          }),
          webRTC(),
          circuitRelayTransport()
        ],
        connectionEncryption: [noise()],
        streamMuxers: [yamux(), mplex()],
        peerDiscovery: [
          kadDHT({
            protocol: '/ipfs/kad/1.0.0',
            clientMode: true,
          })
        ],
        services: {
          pubsub: gossipsub({ emitSelf: true }),
          identify: identify(),
          peerInfo: (context) => {
            context.handle('/swissknife/peer-info/1.0.0', async ({ stream }) => {
              try {
                const { readable, writable } = stream;
                const reader = readable.getReader();
                const writer = writable.getWriter();

                // Read incoming message
                const { value: messageBytes, done } = await reader.read();
                if (done) return;

                const message = new TextDecoder().decode(messageBytes);
                const parsedMessage = JSON.parse(message);

                console.log(`Received peer-info message from ${stream.remotePeer.toString()}:`, parsedMessage);

                if (parsedMessage.type === 'ANNOUNCE_FILES') {
                  // Store announced files/hashes from peer
                  // For now, just log. Later, integrate with VFS or a peer file index.
                  console.log(`Peer ${stream.remotePeer.toString()} announced files:`, parsedMessage.files);
                  // Send acknowledgment
                  await writer.write(new TextEncoder().encode(JSON.stringify({ status: 'ACK', message: 'Announcement received' })));
                } else if (parsedMessage.type === 'QUERY_FILES') {
                  // Respond with local files/hashes
                  // For now, send a mock response. Later, integrate with VFS.
                  const localFiles = [
                    { path: '/my-local-file.txt', hash: 'QmLocalHash1' },
                    { path: '/another-file.jpg', hash: 'QmLocalHash2' }
                  ];
                  await writer.write(new TextEncoder().encode(JSON.stringify({ type: 'FILES_RESPONSE', files: localFiles })));
                } else {
                  await writer.write(new TextEncoder().encode(JSON.stringify({ status: 'ERROR', message: 'Unknown message type' })));
                }
              } catch (error) {
                console.error('Error handling peer-info stream:', error);
              } finally {
                stream.close();
              }
            });
          },
          fileTransfer: (context) => {
            context.handle('/swissknife/file-transfer/1.0.0', async ({ stream }) => {
              try {
                const { readable, writable } = stream;
                const reader = readable.getReader();
                const writer = writable.getWriter();

                // Read file request (e.g., { type: 'REQUEST_FILE', hash: 'Qm...' })
                const { value: requestBytes, done: requestDone } = await reader.read();
                if (requestDone) return;

                const request = JSON.parse(new TextDecoder().decode(requestBytes));
                console.log(`Received file transfer request from ${stream.remotePeer.toString()}:`, request);

                if (request.type === 'REQUEST_FILE' && request.hash) {
                  // Simulate fetching file content from local storage (VFS)
                  // In a real scenario, this would involve reading from the VFS
                  const fileContent = `Mock content for hash: ${request.hash}`; // Replace with actual VFS read
                  await writer.write(new TextEncoder().encode(fileContent));
                  console.log(`Sent mock content for hash ${request.hash} to ${stream.remotePeer.toString()}`);
                } else {
                  await writer.write(new TextEncoder().encode('ERROR: Invalid file request'));
                }
              } catch (error) {
                console.error('Error handling file transfer stream:', error);
              } finally {
                stream.close();
              }
            });
          }
        }
      });

      await this.network.libp2p.start();
      console.log(`Libp2p started with Peer ID: ${this.network.libp2p.peerId.toString()}`);
      console.log('Libp2p listening on addresses:', this.network.libp2p.getMultiaddrs().map(ma => ma.toString()));
    } catch (error) {
      console.error('Failed to start libp2p:', error);
      throw error;
    }
  }

  async stopLibp2p() {
    if (this.network.libp2p) {
      console.log('Stopping libp2p...');
      await this.network.libp2p.stop();
      this.network.libp2p = null;
      console.log('Libp2p stopped.');
    }
  }
}

// Create and export a singleton instance
const swissknife = new SwissKnifeBrowser();

// Export the singleton as default
export default swissknife;

// Global access for console debugging
if (typeof window !== 'undefined') {
  window.SwissKnife = swissknife;
}
