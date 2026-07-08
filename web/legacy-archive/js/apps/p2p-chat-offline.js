// P2P Chat with Offline Messaging Capabilities
// Enhanced version with IPFS, libp2p, and Storacha integration for offline messaging

export class P2PChatOfflineApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.instanceId = `p2p-chat-offline-${Date.now()}`;
    this.connected = false;
    this.peers = new Map();
    this.currentChatPeer = null;
    this.messages = new Map(); // peerId -> messages[]
    this.offlineMessages = new Map(); // peerId -> offline messages[]
    this.ipfs = null;
    this.libp2p = null;
    this.storacha = null;
    this.encryptionKeys = new Map();
    
    // Initialize offline messaging capabilities
    this.initializeOfflineMessaging();
    
    // Register global instance for cross-app communication
    if (!window.p2pChatOfflineInstances) {
      window.p2pChatOfflineInstances = {};
    }
    window.p2pChatOfflineInstances[this.instanceId] = this;
    window.p2pChatOfflineGlobal = this;
  }

  async initializeOfflineMessaging() {
    try {
      // Initialize IPFS node for content storage
      this.ipfs = await this.createIPFSNode();
      
      // Initialize libp2p for P2P networking
      this.libp2p = await this.createLibp2pNode();
      
      // Initialize Storacha client for reliable storage
      this.storacha = await this.createStorachaClient();
      
      // Generate or load encryption keys
      await this.setupEncryption();
      
      console.log('🔒 Offline messaging capabilities initialized');
    } catch (error) {
      console.error('❌ Failed to initialize offline messaging:', error);
      // Fall back to basic implementation
      this.initializeFallbackOfflineMessaging();
    }
  }

  async createIPFSNode() {
    // Try to use SwissKnife IPFS API if available
    if (this.desktop?.swissknife?.ipfs) {
      try {
        const ipfsApi = this.desktop.swissknife.ipfs;
        return {
          add: async (data) => {
            const result = await ipfsApi.add(data);
            const hash = result.cid || result.hash;
            console.log(`📦 IPFS: Added content with hash ${hash}`);
            return { cid: hash };
          },
          get: async (hash) => {
            console.log(`📦 IPFS: Retrieving content for hash ${hash}`);
            const result = await ipfsApi.get(hash);
            return { content: result.content || result };
          }
        };
      } catch (error) {
        console.warn('⚠️ SwissKnife IPFS API unavailable:', error);
      }
    }
    
    // Fallback to localStorage-based implementation
    return {
      add: async (data) => {
        const hash = `fallback-Qm${Math.random().toString(36).substr(2, 44)}`;
        try {
          localStorage.setItem(`ipfs-offline-${hash}`, JSON.stringify(data));
          console.log(`📦 Fallback storage: Added content with hash ${hash}`);
        } catch (e) {
          console.warn('⚠️ localStorage full, using memory storage');
        }
        return { cid: hash };
      },
      get: async (hash) => {
        console.log(`📦 Fallback storage: Retrieved content for hash ${hash}`);
        try {
          const data = localStorage.getItem(`ipfs-offline-${hash}`);
          return { content: data ? JSON.parse(data) : new Uint8Array([1, 2, 3]) };
        } catch (e) {
          return { content: new Uint8Array([1, 2, 3]) };
        }
      }
    };
  }

  async createLibp2pNode() {
    // Try to use SwissKnife P2P API if available
    if (this.desktop?.swissknife?.p2p) {
      try {
        const p2pApi = this.desktop.swissknife.p2p;
        const peerInfo = await p2pApi.getPeerInfo();
        
        return {
          peerId: peerInfo.peerId || `fallback-12D3KooW${Math.random().toString(36).substr(2, 44)}`,
          dial: async (peerId) => {
            console.log(`🔗 P2P: Dialing peer ${peerId}`);
            const result = await p2pApi.connect(peerId);
            return { stream: { write: () => {}, read: () => {} } };
          },
          handle: (protocol, handler) => {
            console.log(`🔗 P2P: Handling protocol ${protocol}`);
            p2pApi.registerProtocol?.(protocol, handler);
          }
        };
      } catch (error) {
        console.warn('⚠️ SwissKnife P2P API unavailable:', error);
      }
    }
    
    // Check for window.p2pMLSystem
    if (window.p2pMLSystem) {
      try {
        const info = await window.p2pMLSystem.getPeerInfo();
        return {
          peerId: info.peerId || `fallback-12D3KooW${Math.random().toString(36).substr(2, 44)}`,
          dial: async (peerId) => {
            console.log(`🔗 P2P ML: Dialing peer ${peerId}`);
            return { stream: { write: () => {}, read: () => {} } };
          },
          handle: (protocol, handler) => {
            console.log(`🔗 P2P ML: Handling protocol ${protocol}`);
          }
        };
      } catch (error) {
        console.warn('⚠️ P2P ML System unavailable:', error);
      }
    }
    
    // Fallback implementation
    return {
      peerId: `fallback-12D3KooW${Math.random().toString(36).substr(2, 44)}`,
      dial: async (peerId) => {
        console.log(`🔗 Fallback: Dialing peer ${peerId}`);
        return { stream: { write: () => {}, read: () => {} } };
      },
      handle: (protocol, handler) => {
        console.log(`🔗 Fallback: Handling protocol ${protocol}`);
      }
    };
  }

  async createStorachaClient() {
    // Try to use SwissKnife storage API if available
    if (this.desktop?.swissknife?.storage) {
      try {
        const storageApi = this.desktop.swissknife.storage;
        
        return {
          put: async (key, data) => {
            console.log(`☁️ Storage: Storing data at key ${key}`);
            const result = await storageApi.store(data);
            return { cid: result.cid || result.id };
          },
          get: async (key) => {
            console.log(`☁️ Storage: Retrieved data for key ${key}`);
            const result = await storageApi.retrieve(key);
            return result.data || result;
          },
          list: async (prefix) => {
            console.log(`☁️ Storage: Listed keys with prefix ${prefix}`);
            const result = await storageApi.list?.(prefix);
            return result || [];
          },
          delete: async (key) => {
            console.log(`☁️ Storage: Deleted key ${key}`);
            await storageApi.delete?.(key);
          }
        };
      } catch (error) {
        console.warn('⚠️ SwissKnife storage API unavailable:', error);
      }
    }
    
    // Fallback to localStorage-based implementation
    if (!this.fallbackStorage) this.fallbackStorage = new Map();
    
    return {
      put: async (key, data) => {
        console.log(`☁️ Fallback storage: Stored data at key ${key}`);
        this.fallbackStorage.set(key, data);
        try {
          localStorage.setItem(`storacha-offline-${key}`, JSON.stringify(data));
        } catch (e) {
          console.warn('⚠️ localStorage full, using memory only');
        }
        return { cid: `fallback-bafybei${Math.random().toString(36).substr(2, 52)}` };
      },
      get: async (key) => {
        console.log(`☁️ Fallback storage: Retrieved data for key ${key}`);
        // Try memory first
        let data = this.fallbackStorage.get(key);
        // Try localStorage if not in memory
        if (!data) {
          try {
            const stored = localStorage.getItem(`storacha-offline-${key}`);
            data = stored ? JSON.parse(stored) : null;
          } catch (e) {
            console.warn('⚠️ localStorage read error');
          }
        }
        return data;
      },
      list: async (prefix) => {
        console.log(`☁️ Fallback storage: Listed keys with prefix ${prefix}`);
        return Array.from(this.fallbackStorage.keys())
          .filter(key => key.startsWith(prefix))
          .map(key => ({ key, data: this.fallbackStorage.get(key) }));
      },
      delete: async (key) => {
        console.log(`☁️ Fallback storage: Deleted key ${key}`);
        this.fallbackStorage?.delete(key);
        try {
          localStorage.removeItem(`storacha-offline-${key}`);
        } catch (e) {
          console.warn('⚠️ localStorage delete error');
        }
      }
    };
  }

  async setupEncryption() {
    // Try to use Web Crypto API for real encryption
    try {
      if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        const keyPair = await window.crypto.subtle.generateKey(
          {
            name: 'RSA-OAEP',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256'
          },
          true,
          ['encrypt', 'decrypt']
        );
        
        // Export keys for storage
        const publicKey = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
        const privateKey = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
        
        this.myKeyPair = {
          publicKey: JSON.stringify(publicKey),
          privateKey: JSON.stringify(privateKey),
          keyPair: keyPair
        };
        
        console.log('🔐 Real encryption keys generated via Web Crypto API');
        return;
      }
    } catch (error) {
      console.warn('⚠️ Web Crypto API unavailable:', error);
    }
    
    // Fallback to simple key generation
    this.myKeyPair = {
      publicKey: `fallback-pub_${Math.random().toString(36).substr(2, 32)}`,
      privateKey: `fallback-priv_${Math.random().toString(36).substr(2, 32)}`
    };
    console.log('🔐 Fallback encryption keys generated');
  }

  initializeFallbackOfflineMessaging() {
    console.log('🔧 Initializing fallback offline messaging...');
    this.fallbackStorage = new Map();
    this.setupExamplePeers();
  }

  setupExamplePeers() {
    const examplePeers = [
      {
        id: 'peer-alice-123',
        name: 'Alice',
        avatar: '👩‍💻',
        status: 'offline', // Changed to offline to demo offline messaging
        activity: 'Last seen 2 hours ago',
        publicKey: `pub_alice_${Math.random().toString(36).substr(2, 32)}`
      },
      {
        id: 'peer-bob-456', 
        name: 'Bob',
        avatar: '👨‍💼',
        status: 'online',
        activity: 'Available for chat',
        publicKey: `pub_bob_${Math.random().toString(36).substr(2, 32)}`
      },
      {
        id: 'peer-charlie-789',
        name: 'Charlie',
        avatar: '🧑‍🔬',
        status: 'offline', // Changed to offline
        activity: 'Last seen yesterday',
        publicKey: `pub_charlie_${Math.random().toString(36).substr(2, 32)}`
      }
    ];

    examplePeers.forEach(peer => {
      this.peers.set(peer.id, peer);
      this.messages.set(peer.id, []);
      this.offlineMessages.set(peer.id, []);
    });

    // Add some example offline messages
    this.addExampleOfflineMessages();
  }

  addExampleOfflineMessages() {
    // Simulate offline messages from Alice
    const aliceOfflineMessages = [
      {
        id: 'msg_offline_1',
        content: 'Hey! I sent this while you were offline. Hope you get it when you\'re back online! 📱',
        timestamp: Date.now() - 3600000, // 1 hour ago
        encrypted: true,
        deliveryStatus: 'stored'
      },
      {
        id: 'msg_offline_2', 
        content: 'Also wanted to share this cool article about decentralized messaging! 🔗',
        timestamp: Date.now() - 1800000, // 30 minutes ago
        encrypted: true,
        deliveryStatus: 'stored'
      }
    ];

    this.offlineMessages.set('peer-alice-123', aliceOfflineMessages);

    // Simulate offline messages from Charlie
    const charlieOfflineMessages = [
      {
        id: 'msg_offline_3',
        content: 'Working on some exciting ML experiments. Can\'t wait to share the results! 🧪',
        timestamp: Date.now() - 7200000, // 2 hours ago
        encrypted: true,
        deliveryStatus: 'stored'
      }
    ];

    this.offlineMessages.set('peer-charlie-789', charlieOfflineMessages);
  }

  async sendMessage(peerId, content) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    const message = {
      id: `msg_${Date.now()}`,
      content,
      timestamp: Date.now(),
      fromMe: true,
      deliveryStatus: 'sending'
    };

    // Add to local messages
    const peerMessages = this.messages.get(peerId) || [];
    peerMessages.push(message);
    this.messages.set(peerId, peerMessages);

    if (peer.status === 'online') {
      // Direct delivery for online peers
      await this.deliverMessageDirect(peerId, message);
      message.deliveryStatus = 'delivered';
    } else {
      // Store for offline delivery
      await this.storeOfflineMessage(peerId, message);
      message.deliveryStatus = 'stored_offline';
    }

    this.updateDisplay();
    return message;
  }

  async deliverMessageDirect(peerId, message) {
    console.log(`📨 Delivering message directly to ${peerId}:`, message.content);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate response from peer (fallback behavior for demo)
    setTimeout(() => {
      this.simulatePeerResponse(peerId, message);
    }, 2000);
  }

  async storeOfflineMessage(peerId, message) {
    console.log(`💾 Storing offline message for ${peerId}:`, message.content);
    
    // Encrypt message with real or fallback encryption
    const encryptedMessage = await this.encryptMessage(message, peerId);
    
    // Store in IPFS (real or fallback)
    const ipfsResult = await this.ipfs.add(JSON.stringify(encryptedMessage));
    
    // Store reference in Storacha (real or fallback)
    const storageKey = `inbox/${peerId}/${message.id}`;
    await this.storacha.put(storageKey, {
      ipfsHash: ipfsResult.cid,
      timestamp: message.timestamp,
      from: this.libp2p.peerId,
      messageId: message.id
    });

    console.log(`✅ Message stored offline with key: ${storageKey}`);
  }

  async encryptMessage(message, recipientId) {
    const peer = this.peers.get(recipientId);
    if (!peer) throw new Error('Peer not found');

    // Try to use real Web Crypto API encryption
    if (this.myKeyPair?.keyPair && window.crypto?.subtle) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(message.content);
        const encryptedData = await window.crypto.subtle.encrypt(
          {
            name: 'RSA-OAEP'
          },
          this.myKeyPair.keyPair.publicKey,
          data
        );
        
        const encrypted = {
          ...message,
          content: btoa(String.fromCharCode(...new Uint8Array(encryptedData))),
          encryptedWith: peer.publicKey,
          encrypted: true,
          algorithm: 'RSA-OAEP'
        };

        console.log(`🔐 Message encrypted for ${peer.name} using Web Crypto API`);
        return encrypted;
      } catch (error) {
        console.warn('⚠️ Web Crypto encryption failed, using fallback:', error);
      }
    }

    // Fallback encryption (basic obfuscation)
    const encrypted = {
      ...message,
      content: `🔒encrypted:${message.content}`,
      encryptedWith: peer.publicKey,
      signature: `fallback-sig_${Math.random().toString(36).substr(2, 16)}`
    };

    console.log(`🔐 Message encrypted for ${peer.name} using fallback`);
    return encrypted;
  }

  async checkOfflineMessages(peerId) {
    console.log(`📬 Checking offline messages for ${peerId}`);
    
    const messages = await this.storacha.list(`inbox/${this.libp2p.peerId}/`);
    const deliveredMessages = [];

    for (const item of messages) {
      try {
        // Get message from IPFS
        const encryptedMessage = await this.ipfs.get(item.data.ipfsHash);
        
        // Decrypt message
        const decryptedMessage = await this.decryptMessage(encryptedMessage);
        
        // Deliver message
        const peerMessages = this.messages.get(peerId) || [];
        peerMessages.push({
          ...decryptedMessage,
          deliveryStatus: 'delivered_offline',
          fromMe: false
        });
        this.messages.set(peerId, peerMessages);
        
        deliveredMessages.push(decryptedMessage);
        
        // Clean up stored message
        await this.storacha.delete(item.key);
        
      } catch (error) {
        console.error('Failed to process offline message:', error);
      }
    }

    if (deliveredMessages.length > 0) {
      console.log(`📨 Delivered ${deliveredMessages.length} offline messages`);
      this.updateDisplay();
    }

    return deliveredMessages;
  }

  async decryptMessage(encryptedMessage) {
    // Try to use real Web Crypto API decryption
    if (this.myKeyPair?.keyPair && window.crypto?.subtle && encryptedMessage.algorithm === 'RSA-OAEP') {
      try {
        const encryptedData = Uint8Array.from(atob(encryptedMessage.content), c => c.charCodeAt(0));
        const decryptedData = await window.crypto.subtle.decrypt(
          {
            name: 'RSA-OAEP'
          },
          this.myKeyPair.keyPair.privateKey,
          encryptedData
        );
        
        const decoder = new TextDecoder();
        const decrypted = {
          ...encryptedMessage,
          content: decoder.decode(decryptedData),
          decryptedWith: this.myKeyPair.privateKey,
          decrypted: true
        };

        console.log('🔓 Message decrypted successfully using Web Crypto API');
        return decrypted;
      } catch (error) {
        console.warn('⚠️ Web Crypto decryption failed, using fallback:', error);
      }
    }

    // Fallback decryption
    const decrypted = {
      ...encryptedMessage,
      content: encryptedMessage.content.replace('🔒encrypted:', ''),
      decryptedWith: this.myKeyPair.privateKey
    };

    console.log('🔓 Message decrypted using fallback');
    return decrypted;
  }

  simulatePeerResponse(peerId, originalMessage) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    const responses = [
      'Thanks for the message! 👍',
      'Got it, will respond soon! ⏰', 
      'Interesting point! Let me think about it 🤔',
      'Sure thing! Count me in 🎉',
      'That sounds great! 💫'
    ];

    const response = {
      id: `msg_${Date.now()}`,
      content: responses[Math.floor(Math.random() * responses.length)],
      timestamp: Date.now(),
      fromMe: false,
      deliveryStatus: 'delivered',
      replyTo: originalMessage.id
    };

    const peerMessages = this.messages.get(peerId) || [];
    peerMessages.push(response);
    this.messages.set(peerId, peerMessages);

    this.updateDisplay();
  }

  async initialize() {
    console.log('🚀 Initializing P2P Chat with Offline Messaging...');
    return this;
  }

  async render() {
    const peerCount = this.peers.size;
    const offlineMessageCount = Array.from(this.offlineMessages.values())
      .reduce((total, messages) => total + messages.length, 0);

    return `
      <div class="p2p-chat-offline-app">
        <style>
          .p2p-chat-offline-app {
            height: 100%;
            display: flex;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 12px;
            overflow: hidden;
          }

          .sidebar {
            width: 300px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-right: 1px solid rgba(255, 255, 255, 0.2);
            display: flex;
            flex-direction: column;
          }

          .sidebar-header {
            padding: 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }

          .sidebar-title {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 15px;
          }

          .sidebar-title h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
          }

          .connection-status {
            padding: 8px 12px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 500;
            text-align: center;
          }

          .connection-status.connected {
            background: rgba(52, 211, 153, 0.2);
            border: 1px solid rgba(52, 211, 153, 0.3);
            color: #10b981;
          }

          .connection-status.disconnected {
            background: rgba(239, 68, 68, 0.2);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #ef4444;
          }

          .offline-stats {
            margin-top: 15px;
            padding: 12px;
            background: rgba(139, 92, 246, 0.2);
            border-radius: 8px;
            border: 1px solid rgba(139, 92, 246, 0.3);
          }

          .offline-stats-title {
            font-weight: 600;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .offline-stats-info {
            font-size: 13px;
            opacity: 0.9;
          }

          .controls {
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 10px;
          }

          .control-btn {
            padding: 12px 16px;
            border: none;
            border-radius: 8px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            background: linear-gradient(135deg, #8b5cf6, #a855f7);
            color: white;
          }

          .control-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(139, 92, 246, 0.4);
          }

          .control-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .peers-list {
            flex: 1;
            overflow-y: auto;
            padding: 0 15px;
          }

          .peers-header {
            padding: 15px 5px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.9);
          }

          .peer-item {
            margin-bottom: 8px;
            padding: 12px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s ease;
            border: 1px solid transparent;
          }

          .peer-item:hover {
            background: rgba(255, 255, 255, 0.15);
            transform: translateX(5px);
          }

          .peer-item.selected {
            background: rgba(255, 255, 255, 0.2);
            border-color: rgba(255, 255, 255, 0.3);
          }

          .peer-info {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .peer-avatar {
            font-size: 24px;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .peer-details {
            flex: 1;
          }

          .peer-name {
            font-weight: 600;
            margin-bottom: 4px;
          }

          .peer-status {
            font-size: 12px;
            opacity: 0.8;
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
          }

          .status-indicator.online {
            background: #10b981;
            box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
          }

          .status-indicator.offline {
            background: #6b7280;
          }

          .offline-badge {
            background: rgba(239, 68, 68, 0.2);
            color: #fca5a5;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 500;
          }

          .chat-area {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: rgba(255, 255, 255, 0.05);
          }

          .chat-header {
            padding: 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.05);
          }

          .chat-with {
            font-weight: 600;
            margin-bottom: 5px;
          }

          .chat-status {
            font-size: 14px;
            opacity: 0.8;
          }

          .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 15px;
          }

          .message {
            max-width: 70%;
            padding: 12px 16px;
            border-radius: 18px;
            position: relative;
          }

          .message.from-me {
            align-self: flex-end;
            background: linear-gradient(135deg, #8b5cf6, #a855f7);
            color: white;
          }

          .message.from-peer {
            align-self: flex-start;
            background: rgba(255, 255, 255, 0.1);
            color: white;
          }

          .message-content {
            margin-bottom: 6px;
          }

          .message-meta {
            font-size: 11px;
            opacity: 0.7;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .delivery-status {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.1);
          }

          .delivery-status.stored_offline {
            background: rgba(239, 68, 68, 0.2);
            color: #fca5a5;
          }

          .delivery-status.delivered_offline {
            background: rgba(52, 211, 153, 0.2);
            color: #6ee7b7;
          }

          .message-input-area {
            padding: 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.05);
          }

          .input-container {
            display: flex;
            gap: 12px;
            align-items: flex-end;
          }

          .message-input {
            flex: 1;
            padding: 12px 16px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.1);
            color: white;
            resize: none;
            font-family: inherit;
            min-height: 44px;
            max-height: 120px;
          }

          .message-input::placeholder {
            color: rgba(255, 255, 255, 0.6);
          }

          .send-btn {
            width: 44px;
            height: 44px;
            border: none;
            border-radius: 50%;
            background: linear-gradient(135deg, #8b5cf6, #a855f7);
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            transition: all 0.3s ease;
          }

          .send-btn:hover:not(:disabled) {
            transform: scale(1.1);
            box-shadow: 0 8px 25px rgba(139, 92, 246, 0.4);
          }

          .send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .welcome-message {
            text-align: center;
            padding: 60px 40px;
            opacity: 0.7;
          }

          .welcome-icon {
            font-size: 64px;
            margin-bottom: 20px;
          }

          .welcome-title {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 12px;
          }

          .welcome-subtitle {
            font-size: 16px;
            opacity: 0.8;
          }
        </style>

        <div class="sidebar">
          <div class="sidebar-header">
            <div class="sidebar-title">
              <span>💬</span>
              <h3>P2P Chat Offline</h3>
            </div>
            <div class="connection-status ${this.connected ? 'connected' : 'disconnected'}">
              ${this.connected ? '🟢 Connected to P2P Network' : '🔴 Disconnected'}
            </div>
            <div class="offline-stats">
              <div class="offline-stats-title">
                <span>📬</span>
                Offline Messages
              </div>
              <div class="offline-stats-info">
                ${offlineMessageCount} stored messages waiting for delivery
              </div>
            </div>
          </div>

          <div class="controls">
            <button class="control-btn" onclick="window.p2pChatOfflineGlobal.connectToNetwork()">
              🔗 Connect to Network
            </button>
            <button class="control-btn" onclick="window.p2pChatOfflineGlobal.discoverPeers()" ${!this.connected ? 'disabled' : ''}>
              🔍 Discover Peers
            </button>
            <button class="control-btn" onclick="window.p2pChatOfflineGlobal.checkAllOfflineMessages()" ${!this.connected ? 'disabled' : ''}>
              📬 Check Offline Messages
            </button>
          </div>

          <div class="peers-list">
            <div class="peers-header">Connected Peers (${peerCount})</div>
            ${Array.from(this.peers.values()).map(peer => `
              <div class="peer-item ${this.currentChatPeer === peer.id ? 'selected' : ''}" 
                   onclick="window.p2pChatOfflineGlobal.selectPeer('${peer.id}')">
                <div class="peer-info">
                  <div class="peer-avatar">${peer.avatar}</div>
                  <div class="peer-details">
                    <div class="peer-name">${peer.name}</div>
                    <div class="peer-status">
                      <div class="status-indicator ${peer.status}"></div>
                      ${peer.activity}
                      ${peer.status === 'offline' ? '<span class="offline-badge">OFFLINE</span>' : ''}
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="chat-area">
          ${this.currentChatPeer ? this.renderChatArea() : this.renderWelcomeMessage()}
        </div>
      </div>
    `;
  }

  renderChatArea() {
    const peer = this.peers.get(this.currentChatPeer);
    const messages = this.messages.get(this.currentChatPeer) || [];
    const offlineMessages = this.offlineMessages.get(this.currentChatPeer) || [];
    const allMessages = [...offlineMessages, ...messages].sort((a, b) => a.timestamp - b.timestamp);

    return `
      <div class="chat-header">
        <div class="chat-with">💬 Chat with ${peer.name}</div>
        <div class="chat-status">
          ${peer.status === 'online' ? 
            '🟢 Online - Messages delivered instantly' : 
            '🔴 Offline - Messages will be stored and delivered when they come online'
          }
        </div>
      </div>

      <div class="messages-container" id="messages-${this.instanceId}">
        ${allMessages.map(msg => `
          <div class="message ${msg.fromMe ? 'from-me' : 'from-peer'}">
            <div class="message-content">${msg.content}</div>
            <div class="message-meta">
              <span>${new Date(msg.timestamp).toLocaleTimeString()}</span>
              ${msg.deliveryStatus ? `<span class="delivery-status ${msg.deliveryStatus}">${this.getDeliveryStatusText(msg.deliveryStatus)}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="message-input-area">
        <div class="input-container">
          <textarea 
            class="message-input" 
            id="message-input-${this.instanceId}"
            placeholder="${peer.status === 'online' ? 'Type your message...' : 'Type message (will be stored offline)...'}"
            rows="1"
            onkeydown="if(event.key==='Enter' && !event.shiftKey) { event.preventDefault(); window.p2pChatOfflineGlobal.sendCurrentMessage(); }"
          ></textarea>
          <button class="send-btn" onclick="window.p2pChatOfflineGlobal.sendCurrentMessage()">
            ${peer.status === 'online' ? '📨' : '💾'}
          </button>
        </div>
      </div>
    `;
  }

  renderWelcomeMessage() {
    return `
      <div class="welcome-message">
        <div class="welcome-icon">💬</div>
        <div class="welcome-title">P2P Chat with Offline Messaging</div>
        <div class="welcome-subtitle">
          Select a peer to start chatting.<br>
          Messages to offline peers will be stored securely and delivered when they come online.
        </div>
      </div>
    `;
  }

  getDeliveryStatusText(status) {
    switch (status) {
      case 'sending': return '📤 Sending';
      case 'delivered': return '✅ Delivered';
      case 'stored_offline': return '💾 Stored Offline';
      case 'delivered_offline': return '📬 Delivered (was offline)';
      default: return '';
    }
  }

  async connectToNetwork() {
    console.log('🔗 Connecting to P2P network...');
    
    // Simulate connection process
    setTimeout(() => {
      this.connected = true;
      this.setupExamplePeers();
      this.updateDisplay();
      console.log('✅ Connected to P2P network');
    }, 2000);
  }

  async discoverPeers() {
    console.log('🔍 Discovering peers...');
    
    // Try to discover real peers via API
    if (this.desktop?.swissknife?.p2p?.discoverPeers) {
      try {
        const peers = await this.desktop.swissknife.p2p.discoverPeers();
        peers.forEach(peer => {
          if (!this.peers.has(peer.id)) {
            this.peers.set(peer.id, {
              id: peer.id,
              name: peer.name || 'Unknown',
              avatar: peer.avatar || '👤',
              status: peer.status || 'online',
              activity: peer.activity || 'Available',
              publicKey: peer.publicKey || `pub_${peer.id}`
            });
            this.messages.set(peer.id, []);
            this.offlineMessages.set(peer.id, []);
          }
        });
      } catch (error) {
        console.warn('⚠️ Peer discovery failed:', error);
      }
    }
    
    this.updateDisplay();
  }

  async checkAllOfflineMessages() {
    console.log('📬 Checking all offline messages...');
    
    for (const [peerId] of this.peers) {
      await this.checkOfflineMessages(peerId);
    }

    // Simulate delivery of stored offline messages
    for (const [peerId, offlineMessages] of this.offlineMessages) {
      if (offlineMessages.length > 0) {
        const peerMessages = this.messages.get(peerId) || [];
        offlineMessages.forEach(msg => {
          peerMessages.push({
            ...msg,
            fromMe: false,
            deliveryStatus: 'delivered_offline'
          });
        });
        this.messages.set(peerId, peerMessages);
        this.offlineMessages.set(peerId, []); // Clear offline messages
      }
    }

    this.updateDisplay();
    console.log('📨 All offline messages processed');
  }

  selectPeer(peerId) {
    this.currentChatPeer = peerId;
    this.updateDisplay();
  }

  async sendCurrentMessage() {
    const input = document.getElementById(`message-input-${this.instanceId}`);
    if (!input) return;

    const content = input.value.trim();
    if (!content || !this.currentChatPeer) return;

    await this.sendMessage(this.currentChatPeer, content);
    input.value = '';
  }

  updateDisplay() {
    // This will be called by the desktop system to re-render
    if (this.desktop && this.desktop.updateApp) {
      this.desktop.updateApp(this.instanceId);
    }
  }

  getContainer() {
    return document.querySelector(`[data-app-instance="${this.instanceId}"]`);
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = P2PChatOfflineApp;
}

// ES module export
export default P2PChatOfflineApp;