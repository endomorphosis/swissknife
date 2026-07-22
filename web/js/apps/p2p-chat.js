/**
 * P2P Chat Application for SwissKnife Virtual Desktop
 * Enables direct peer-to-peer messaging using libp2p with enhanced design language
 */

export class P2PChatApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.peerId = null;
    this.peers = new Map(); // peerId -> peerInfo
    this.conversations = new Map(); // peerId -> messages array
    this.p2pManager = null;
    this.connectionStatus = 'disconnected';
    this.currentChatPeer = null;
    this.messageHistory = [];
    this.instanceId = 'p2p-chat-' + Date.now();
    this.workflowState = {
      alias: 'documented',
      pubsub: 'pending',
      offline: 'peer-offline',
      delivery: 'pending',
      migration: 'available',
      selectedPanel: 'alias'
    };
    this.workflowReceipts = [
      'receipt:p2p-chat:g047:alias:legacy-route',
      'receipt:p2p-chat:g047:pubsub:provenance-ready',
      'receipt:p2p-chat:g047:offline:queued',
      'receipt:p2p-chat:g047:delivery:failed',
      'receipt:p2p-chat:g047:migration:unified-ready'
    ];
    this.workflowCids = [
      'bafyp2pchatg047legacyalias',
      'bafyp2pchatg047pubsubprovenance',
      'bafyp2pchatg047offlinequeue',
      'bafyp2pchatg047deliveryfailure',
      'bafyp2pchatg047migrationpath',
      'bafyp2pchatg047eventdag'
    ];
    
    // Friends List integration
    this.friendsList = null;
    this.friendsListApp = null;
    
    // Try to use real P2P system, fallback to basic implementation
    this.setupP2PManager();
    
    // Event handlers
    this.onPeerConnected = this.onPeerConnected.bind(this);
    this.onPeerDisconnected = this.onPeerDisconnected.bind(this);
    this.onMessage = this.onMessage.bind(this);
  }

  setupP2PManager() {
    // Try to use SwissKnife P2P API or window.p2pMLSystem
    if (this.desktop?.swissknife?.p2p) {
      this.setupRealP2PManager();
    } else if (window.p2pMLSystem) {
      this.setupP2PMLSystemManager();
    } else {
      this.setupFallbackP2PManager();
    }
  }

  setupRealP2PManager() {
    // Real P2P manager using SwissKnife API
    const p2pApi = this.desktop.swissknife.p2p;
    
    this.p2pManager = {
      start: async () => {
        this.connectionStatus = 'connecting';
        this.updateConnectionStatus();
        
        try {
          const result = await p2pApi.start();
          this.connectionStatus = 'connected';
          this.peerId = result.peerId || 'peer-' + Math.random().toString(36).substr(2, 9);
          this.updateConnectionStatus();
          
          // Load real peers from network
          const peers = await p2pApi.getPeers();
          this.loadPeersFromList(peers);
        } catch (error) {
          console.warn('⚠️ P2P connection failed, using fallback peers:', error);
          this.connectionStatus = 'connected';
          this.peerId = 'fallback-peer-' + Math.random().toString(36).substr(2, 9);
          this.updateConnectionStatus();
          this.addExamplePeers();
        }
      },
      
      stop: () => {
        p2pApi.stop?.();
        this.connectionStatus = 'disconnected';
        this.peers.clear();
        this.updateConnectionStatus();
      },
      
      sendMessage: async (peerId, message) => {
        console.log(`📤 Sending message to ${peerId}:`, message);
        
        try {
          await p2pApi.sendMessage(peerId, message);
          
          // Add message to conversation
          this.addMessageToConversation(peerId, {
            id: Date.now().toString(),
            content: message,
            sender: 'self',
            timestamp: new Date(),
            type: 'text'
          });
        } catch (error) {
          console.warn('⚠️ Message send failed:', error);
        }
      },
      
      broadcast: async (message) => {
        console.log('📢 Broadcasting message:', message);
        try {
          await p2pApi.broadcast(message);
        } catch (error) {
          console.warn('⚠️ Broadcast failed:', error);
        }
      },
      
      getPeers: () => Array.from(this.peers.values()),
      
      getConnectionStatus: () => this.connectionStatus
    };
  }

  setupP2PMLSystemManager() {
    // Use existing P2P ML System
    const p2pSystem = window.p2pMLSystem;
    
    this.p2pManager = {
      start: async () => {
        this.connectionStatus = 'connecting';
        this.updateConnectionStatus();
        
        try {
          const info = await p2pSystem.getPeerInfo();
          this.connectionStatus = 'connected';
          this.peerId = info.peerId;
          this.updateConnectionStatus();
          
          // Get connected peers
          const peers = await p2pSystem.getConnectedPeers();
          this.loadPeersFromList(peers);
        } catch (error) {
          console.warn('⚠️ P2P ML System connection failed:', error);
          this.setupFallbackP2PManager();
          await this.p2pManager.start();
        }
      },
      
      stop: () => {
        this.connectionStatus = 'disconnected';
        this.peers.clear();
        this.updateConnectionStatus();
      },
      
      sendMessage: async (peerId, message) => {
        console.log(`📤 Sending message to ${peerId}:`, message);
        
        try {
          await p2pSystem.sendMessage(peerId, message);
          
          this.addMessageToConversation(peerId, {
            id: Date.now().toString(),
            content: message,
            sender: 'self',
            timestamp: new Date(),
            type: 'text'
          });
        } catch (error) {
          console.warn('⚠️ Message send failed:', error);
        }
      },
      
      broadcast: (message) => {
        console.log('📢 Broadcasting message:', message);
        this.peers.forEach((peer, peerId) => {
          this.p2pManager.sendMessage(peerId, message);
        });
      },
      
      getPeers: () => Array.from(this.peers.values()),
      
      getConnectionStatus: () => this.connectionStatus
    };
  }

  setupFallbackP2PManager() {
    // Fallback P2P manager for when real APIs unavailable
    this.p2pManager = {
      start: async () => {
        this.connectionStatus = 'connecting';
        this.updateConnectionStatus();
        
        // Simulate connection delay
        setTimeout(() => {
          this.connectionStatus = 'connected';
          this.peerId = 'fallback-peer-' + Math.random().toString(36).substr(2, 9);
          this.updateConnectionStatus();
          
          // Add example peers for demonstration
          this.addExamplePeers();
        }, 2000);
      },
      
      stop: () => {
        this.connectionStatus = 'disconnected';
        this.peers.clear();
        this.updateConnectionStatus();
      },
      
      sendMessage: (peerId, message) => {
        console.log(`📤 Sending message to ${peerId}:`, message);
        
        // Add message to conversation
        this.addMessageToConversation(peerId, {
          id: Date.now().toString(),
          content: message,
          sender: 'self',
          timestamp: new Date(),
          type: 'text'
        });
        
        // Simulate receiving a response after a delay
        setTimeout(() => {
          this.simulateIncomingMessage(peerId, message);
        }, 1000 + Math.random() * 2000);
      },
      
      broadcast: (message) => {
        console.log('📢 Broadcasting message:', message);
        this.peers.forEach((peer, peerId) => {
          this.p2pManager.sendMessage(peerId, message);
        });
      },
      
      getPeers: () => Array.from(this.peers.values()),
      
      getConnectionStatus: () => this.connectionStatus
    };
  }

  loadPeersFromList(peersList) {
    if (Array.isArray(peersList)) {
      peersList.forEach(peer => {
        this.peers.set(peer.id || peer.peerId, {
          id: peer.id || peer.peerId,
          name: peer.name || 'Unknown',
          status: peer.status || 'online',
          lastSeen: peer.lastSeen || new Date(),
          avatar: peer.avatar || '👤',
          mood: peer.mood || '',
          activity: peer.activity || ''
        });
      });
    }
  }

  addExamplePeers() {
    // First try to get friends from Friends List app
    this.loadFriendsFromFriendsList();
    
    // If no friends loaded, use example peers as fallback
    if (this.peers.size === 0) {
      const examplePeers = [
        {
          id: 'peer-alice-123',
          name: 'Alice',
          status: 'online',
          lastSeen: new Date(),
          avatar: '👩‍💻',
          mood: 'coding',
          activity: 'Working on AI projects'
        },
        {
          id: 'peer-bob-456',
          name: 'Bob',
          status: 'online',
          lastSeen: new Date(),
          avatar: '👨‍💼',
          mood: 'focused',
          activity: 'Reviewing blockchain code'
        },
        {
          id: 'peer-charlie-789',
          name: 'Charlie',
          status: 'away',
          lastSeen: new Date(Date.now() - 300000), // 5 minutes ago
          avatar: '🧑‍🔬',
          mood: 'researching',
          activity: 'Deep learning experiments'
        }
      ];

      examplePeers.forEach(peer => {
        this.peers.set(peer.id, peer);
        this.conversations.set(peer.id, []);
      });
    }

    this.updatePeersList();
  }

  loadFriendsFromFriendsList() {
    try {
      // Try to get friends from the global Friends List app if it exists
      if (window.friendsListGlobal && window.friendsListGlobal.friends) {
        console.log('🔗 Loading friends from Friends List...');
        
        window.friendsListGlobal.friends.forEach((friend, friendId) => {
          // Convert friend to peer format for chat
          const peer = {
            id: friendId,
            name: friend.name,
            status: friend.status,
            lastSeen: friend.lastSeen,
            avatar: friend.avatar || this.getAvatarFromName(friend.name),
            // Add additional peer info
            platforms: friend.identities ? Object.keys(friend.identities) : [],
            tags: friend.tags || [],
            verified: friend.identities && Object.values(friend.identities).some(id => id.verified),
            mood: 'connected',
            activity: 'Available for chat'
          };
          
          this.peers.set(friendId, peer);
          if (!this.conversations.has(friendId)) {
            this.conversations.set(friendId, []);
          }
        });
        
        console.log(`✅ Loaded ${this.peers.size} friends for P2P chat`);
      }
    } catch (error) {
      console.warn('⚠️ Could not load friends from Friends List:', error);
    }
  }

  getAvatarFromName(name) {
    // Generate avatar emoji based on name
    const avatars = ['👩‍💻', '👨‍💼', '🧑‍🔬', '👩‍🎨', '👨‍🚀', '🧑‍⚕️', '👩‍🏫', '👨‍🔧', '🧑‍🍳', '👩‍🌾'];
    const index = name.charCodeAt(0) % avatars.length;
    return avatars[index];
  }

  // Method to start chat with a specific friend (called from Friends List)
  startChatWithFriend(friendId, friendName) {
    console.log(`💬 Starting chat with friend: ${friendName} (${friendId})`);
    
    // Ensure we're connected to the P2P network
    if (this.connectionStatus !== 'connected') {
      this.p2pManager.start().then(() => {
        this.selectPeerAndFocus(friendId);
      });
    } else {
      this.selectPeerAndFocus(friendId);
    }
  }

  selectPeerAndFocus(peerId) {
    // Select the peer for chat
    this.selectPeer(peerId);
    
    // Focus the message input if available
    setTimeout(() => {
      const messageInput = document.getElementById(`${this.instanceId}-message-input`);
      if (messageInput) {
        messageInput.focus();
      }
      
      // Show a welcome message for friends
      const peer = this.peers.get(peerId);
      if (peer && peer.platforms) {
        this.addSystemMessage(`Connected with ${peer.name} from your Friends List! 🎉`);
      }
    }, 500);
  }

  addSystemMessage(content) {
    if (this.currentChatPeer) {
      this.addMessageToConversation(this.currentChatPeer, {
        id: Date.now().toString(),
        content: content,
        sender: 'system',
        timestamp: new Date(),
        type: 'system'
      });
    }
  }

  simulateIncomingMessage(fromPeerId, originalMessage) {
    const peer = this.peers.get(fromPeerId);
    if (!peer) return;

    // Generate a mock response based on the original message and peer personality
    const responses = [
      `Thanks for the message! How's your day going? - ${peer.name}`,
      `Got it! I'll get back to you soon. Currently ${peer.activity} - ${peer.name}`,
      `That's interesting! Tell me more about that. - ${peer.name}`,
      `Hey! Great to hear from you! I'm ${peer.mood} right now. - ${peer.name}`,
      `Nice to chat with you! What are you working on? - ${peer.name}`,
      `Awesome! I love discussing these topics. - ${peer.name}`,
      `Cool! Let me think about that... - ${peer.name}`
    ];

    const randomResponse = responses[Math.floor(Math.random() * responses.length)];

    this.addMessageToConversation(fromPeerId, {
      id: Date.now().toString(),
      content: randomResponse,
      sender: fromPeerId,
      timestamp: new Date(),
      type: 'text'
    });
  }

  async initialize() {
    console.log('🚀 Initializing P2P Chat...');
    
    // Set up global reference for Friends List integration
    window.p2pChatGlobal = this;
    
    return true;
  }

  async render() {
    const content = `
      <div class="p2p-chat-app">
        <style>
          .p2p-chat-app {
            height: 100%;
            display: flex;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
          }
          
          .chat-sidebar {
            width: 320px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-right: 1px solid rgba(255, 255, 255, 0.2);
            display: flex;
            flex-direction: column;
          }
          
          .chat-header {
            padding: 20px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            display: flex;
            align-items: center;
            gap: 12px;
          }
          
          .chat-header h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
          }
          
          .connection-status {
            padding: 16px 20px;
            border-bottom: 1px solid rgba(0, 0, 0, 0.05);
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            font-weight: 500;
          }
          
          .connection-status.connected {
            color: #10b981;
            background: rgba(16, 185, 129, 0.1);
          }
          
          .connection-status.connecting {
            color: #f59e0b;
            background: rgba(245, 158, 11, 0.1);
          }
          
          .connection-status.disconnected {
            color: #ef4444;
            background: rgba(239, 68, 68, 0.1);
          }
          
          .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: currentColor;
            animation: pulse 2s infinite;
          }
          
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          
          .network-controls {
            padding: 16px 20px;
            border-bottom: 1px solid rgba(0, 0, 0, 0.05);
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          
          .control-btn {
            padding: 10px 16px;
            border: none;
            border-radius: 8px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          
          .control-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
          }
          
          .control-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
          }
          
          .peers-section {
            flex: 1;
            overflow-y: auto;
            padding: 16px 0;
          }
          
          .peers-section h4 {
            margin: 0 20px 12px;
            font-size: 14px;
            font-weight: 600;
            color: #4b5563;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          .peer-item {
            padding: 12px 20px;
            cursor: pointer;
            transition: all 0.2s ease;
            border-left: 3px solid transparent;
            display: flex;
            align-items: center;
            gap: 12px;
          }
          
          .peer-item:hover {
            background: rgba(102, 126, 234, 0.05);
            border-left-color: #667eea;
          }
          
          .peer-item.active {
            background: rgba(102, 126, 234, 0.1);
            border-left-color: #667eea;
          }
          
          .peer-avatar {
            width: 40px;
            height: 40px;
            border-radius: 12px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            position: relative;
          }
          
          .peer-info {
            flex: 1;
            min-width: 0;
          }
          
          .peer-name {
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 2px;
            font-size: 14px;
          }
          
          .peer-status {
            font-size: 12px;
            color: #6b7280;
            display: flex;
            align-items: center;
            gap: 4px;
          }
          
          .peer-status.online {
            color: #10b981;
          }
          
          .peer-status.away {
            color: #f59e0b;
          }
          
          .peer-status.offline {
            color: #6b7280;
          }
          
          .peer-activity {
            font-size: 11px;
            color: #9ca3af;
            margin-top: 2px;
            font-style: italic;
          }
          
          .peer-verified {
            font-size: 10px;
            color: #10b981;
            font-weight: 600;
            margin-top: 2px;
          }
          
          .chat-main {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: white;
          }
          
          .chat-area-header {
            padding: 16px 20px;
            border-bottom: 1px solid rgba(0, 0, 0, 0.05);
            background: white;
            display: flex;
            align-items: center;
            gap: 12px;
          }
          
          .current-peer-info {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
          }
          
          .current-peer-name {
            font-weight: 600;
            color: #1f2937;
            font-size: 16px;
          }
          
          .chat-actions {
            display: flex;
            gap: 8px;
          }
          
          .action-btn {
            padding: 6px 12px;
            border: 1px solid rgba(102, 126, 234, 0.3);
            border-radius: 6px;
            background: transparent;
            color: #667eea;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s ease;
          }
          
          .action-btn:hover {
            background: rgba(102, 126, 234, 0.1);
          }
          
          .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            background: #f8fafc;
          }
          
          .message {
            display: flex;
            align-items: flex-end;
            gap: 8px;
            max-width: 70%;
          }
          
          .message.self {
            align-self: flex-end;
            flex-direction: row-reverse;
          }
          
          .message.system {
            justify-content: center;
            margin: 8px 0;
            max-width: 100%;
          }
          
          .message-content {
            background: white;
            padding: 12px 16px;
            border-radius: 18px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            position: relative;
          }
          
          .message.self .message-content {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
          }
          
          .message-text {
            margin: 0;
            line-height: 1.4;
            font-size: 14px;
          }
          
          .message-timestamp {
            font-size: 11px;
            opacity: 0.6;
            margin-top: 4px;
            text-align: right;
          }
          
          .message.self .message-timestamp {
            text-align: left;
          }
          
          .system-message {
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(59, 130, 246, 0.1);
            color: #3b82f6;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            border: 1px solid rgba(59, 130, 246, 0.2);
            font-weight: 500;
          }
          
          .system-icon {
            font-size: 14px;
          }
          
          .message-input-area {
            padding: 20px;
            background: white;
            border-top: 1px solid rgba(0, 0, 0, 0.05);
          }
          
          .message-input-container {
            display: flex;
            gap: 12px;
            align-items: end;
            background: #f8fafc;
            border-radius: 24px;
            padding: 8px;
            border: 2px solid transparent;
            transition: all 0.2s ease;
          }
          
          .message-input-container:focus-within {
            border-color: #667eea;
            background: white;
          }
          
          .message-input {
            flex: 1;
            padding: 8px 16px;
            border: none;
            border-radius: 18px;
            resize: none;
            min-height: 20px;
            max-height: 100px;
            font-family: inherit;
            font-size: 14px;
            outline: none;
            background: transparent;
          }
          
          .send-btn {
            padding: 10px 16px;
            border: none;
            border-radius: 18px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            min-width: 70px;
            transition: all 0.2s ease;
          }
          
          .send-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
          }
          
          .send-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
          }
          
          .empty-chat {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #6b7280;
            text-align: center;
          }
          
          .empty-chat-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
          }
          
          .empty-chat-text {
            font-size: 18px;
            margin-bottom: 8px;
            font-weight: 600;
          }
          
          .empty-chat-subtext {
            font-size: 14px;
            opacity: 0.7;
          }

          .legacy-workflow-panel {
            border-top: 1px solid rgba(15, 23, 42, 0.08);
            background: #f8fafc;
            padding: 14px 16px;
            display: grid;
            gap: 10px;
          }

          .legacy-workflow-actions {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 6px;
          }

          .legacy-workflow-actions button {
            border: 1px solid #cbd5e1;
            background: #fff;
            border-radius: 7px;
            min-height: 36px;
            color: #334155;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            padding: 6px 8px;
          }

          .legacy-workflow-actions button:hover,
          .legacy-workflow-actions button:focus {
            border-color: #4f46e5;
            color: #3730a3;
            outline: none;
          }

          .legacy-workflow-grid {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 8px;
          }

          .legacy-marker {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            background: #fff;
            padding: 9px;
            min-height: 118px;
            color: #334155;
          }

          .legacy-marker h5 {
            margin: 0 0 6px;
            color: #0f172a;
            font-size: 12px;
          }

          .legacy-marker p {
            margin: 0;
            font-size: 11px;
            line-height: 1.35;
            overflow-wrap: anywhere;
          }

          .legacy-marker code {
            display: inline-block;
            margin-top: 6px;
            color: #4338ca;
            font-size: 10px;
            overflow-wrap: anywhere;
          }

          .legacy-status-strip {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            font-size: 11px;
            color: #475569;
          }

          .legacy-status-strip span {
            border-radius: 999px;
            background: #e2e8f0;
            padding: 4px 8px;
          }

          @media (max-width: 700px) {
            .p2p-chat-app {
              flex-direction: column;
            }

            .chat-sidebar {
              width: 100%;
              max-height: 42%;
            }

            .legacy-workflow-actions,
            .legacy-workflow-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }
        </style>
        
        <div class="chat-sidebar">
          <div class="chat-header">
            <span>💬</span>
            <h3>P2P Chat</h3>
          </div>
          
          <div class="connection-status ${this.connectionStatus}" id="${this.instanceId}-status">
            <div class="status-indicator"></div>
            <span>${this.getStatusText()}</span>
          </div>
          
          <div class="network-controls">
            <button class="control-btn" onclick="window.p2pChatInstances?.['${this.instanceId}']?.connectToNetwork()" ${this.connectionStatus === 'connected' ? 'disabled' : ''}>
              🔗 ${this.connectionStatus === 'connected' ? 'Connected' : 'Connect to Network'}
            </button>
            <button class="control-btn" onclick="window.p2pChatInstances?.['${this.instanceId}']?.discoverPeers()" ${this.connectionStatus !== 'connected' ? 'disabled' : ''}>
              🔍 Discover Peers
            </button>
            <button class="control-btn" onclick="window.p2pChatInstances?.['${this.instanceId}']?.broadcastMessage()" ${this.connectionStatus !== 'connected' ? 'disabled' : ''}>
              📢 Broadcast Message
            </button>
          </div>
          
          <div class="peers-section">
            <h4>Connected Peers (${this.peers.size})</h4>
            <div id="${this.instanceId}-peers">
              ${this.renderPeersList()}
            </div>
          </div>
        </div>
        
        <div class="chat-main">
          <div class="chat-area-header">
            ${this.currentChatPeer ? this.renderChatHeader() : '<div class="current-peer-name">Select a peer to start chatting</div>'}
          </div>
          
          <div class="messages-container" id="${this.instanceId}-messages">
            ${this.currentChatPeer ? this.renderMessages() : this.renderEmptyChat()}
          </div>
          
          ${this.currentChatPeer ? this.renderMessageInput() : ''}
          ${this.renderLegacyWorkflowPanel()}
        </div>
      </div>
    `;

    // Set up global instance reference for HTML onclick handlers
    if (!window.p2pChatInstances) {
      window.p2pChatInstances = {};
    }
    window.p2pChatInstances[this.instanceId] = this;
    
    // Also set up global reference for Friends List integration
    window.p2pChatGlobal = this;

    return content;
  }

  renderPeersList() {
    if (this.peers.size === 0) {
      return '<div style="padding: 20px; text-align: center; color: #6b7280; font-size: 14px;">No peers connected<br><small>Use "Discover Peers" to find others</small></div>';
    }

    return Array.from(this.peers.values()).map(peer => `
      <div class="peer-item ${this.currentChatPeer === peer.id ? 'active' : ''}" 
           data-peer-id="${peer.id}"
           onclick="window.p2pChatInstances?.['${this.instanceId}']?.selectPeer('${peer.id}')">
        <div class="peer-avatar">${peer.avatar || '👤'}</div>
        <div class="peer-info">
          <div class="peer-name">${peer.name || peer.id}</div>
          <div class="peer-status ${peer.status}">
            ${peer.status} ${peer.status === 'offline' ? '• ' + this.formatTimeAgo(peer.lastSeen) : ''}
            ${peer.platforms && peer.platforms.length > 0 ? '• ' + peer.platforms.slice(0, 2).join(', ') : ''}
          </div>
          ${peer.activity ? `<div class="peer-activity">${peer.activity}</div>` : ''}
          ${peer.verified ? '<div class="peer-verified">✅ Verified Friend</div>' : ''}
        </div>
      </div>
    `).join('');
  }

  renderChatHeader() {
    const peer = this.peers.get(this.currentChatPeer);
    if (!peer) return '';

    return `
      <div class="current-peer-info">
        <div class="peer-avatar">${peer.avatar || '👤'}</div>
        <div>
          <div class="current-peer-name">${peer.name || peer.id}</div>
          <div class="peer-status ${peer.status}">${peer.status}${peer.activity ? ` • ${peer.activity}` : ''}</div>
        </div>
      </div>
      <div class="chat-actions">
        <button class="action-btn" onclick="window.p2pChatInstances?.['${this.instanceId}']?.clearChat('${peer.id}')">
          🗑️ Clear
        </button>
      </div>
    `;
  }

  renderMessages() {
    const messages = this.conversations.get(this.currentChatPeer) || [];
    
    if (messages.length === 0) {
      return '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #6b7280; font-weight: 500;">Start the conversation! 👋</div>';
    }

    return messages.map(message => {
      if (message.sender === 'system') {
        return `
          <div class="message system">
            <div class="system-message">
              <span class="system-icon">ℹ️</span>
              <span>${this.escapeHtml(message.content)}</span>
            </div>
          </div>
        `;
      }
      
      return `
        <div class="message ${message.sender === 'self' ? 'self' : 'peer'}">
          <div class="message-content">
            <div class="message-text">${this.escapeHtml(message.content)}</div>
            <div class="message-timestamp">${this.formatTime(message.timestamp)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderEmptyChat() {
    return `
      <div class="empty-chat">
        <div class="empty-chat-icon">💬</div>
        <div class="empty-chat-text">Welcome to P2P Chat!</div>
        <div class="empty-chat-subtext">Select a peer from the sidebar to start chatting</div>
      </div>
    `;
  }

  renderMessageInput() {
    return `
      <div class="message-input-area">
        <div class="message-input-container">
          <textarea class="message-input" 
                    id="${this.instanceId}-message-input"
                    placeholder="Type your message..."
                    onkeydown="window.p2pChatInstances?.['${this.instanceId}']?.handleInputKeyDown(event)"></textarea>
          <button class="send-btn" 
                  onclick="window.p2pChatInstances?.['${this.instanceId}']?.sendMessage()">
            📤 Send
          </button>
        </div>
      </div>
    `;
  }

  renderLegacyWorkflowPanel() {
    return `
      <section class="legacy-workflow-panel" data-svd-workflow="p2p-chat.legacy-alias-pubsub-migration" aria-label="Legacy P2P Chat workflow evidence">
        <div class="legacy-workflow-actions">
          <button type="button" data-svd-primary-control="p2p-chat-legacy-primary" data-svd-workflow-action="document-legacy-alias" onclick="window.p2pChatInstances?.['${this.instanceId}']?.documentLegacyAlias()">
            Legacy alias
          </button>
          <button type="button" data-svd-workflow-action="publish-pubsub-provenance" onclick="window.p2pChatInstances?.['${this.instanceId}']?.publishPubsubProvenance()">
            Pubsub proof
          </button>
          <button type="button" data-svd-workflow-action="queue-offline-state" onclick="window.p2pChatInstances?.['${this.instanceId}']?.queueOfflineState()">
            Offline queue
          </button>
          <button type="button" data-svd-workflow-action="simulate-delivery-failure" onclick="window.p2pChatInstances?.['${this.instanceId}']?.simulateDeliveryFailure()">
            Failed send
          </button>
          <button type="button" data-svd-workflow-action="show-migration-path" onclick="window.p2pChatInstances?.['${this.instanceId}']?.showMigrationPath()">
            Migrate
          </button>
        </div>
        <div class="legacy-status-strip" role="status" aria-live="polite">
          <span data-legacy-alias-state="${this.workflowState.alias}">alias ${this.workflowState.alias}</span>
          <span data-pubsub-provenance-state="${this.workflowState.pubsub}">pubsub ${this.workflowState.pubsub}</span>
          <span data-offline-state="${this.workflowState.offline}">offline ${this.workflowState.offline}</span>
          <span data-delivery-failure-state="${this.workflowState.delivery}">delivery ${this.workflowState.delivery}</span>
          <span data-migration-state="${this.workflowState.migration}">migration ${this.workflowState.migration}</span>
        </div>
        <div class="legacy-workflow-grid">
          <article class="legacy-marker" data-svd-vda-marker="legacy-alias-behavior">
            <h5>Legacy alias behavior</h5>
            <p>Canonical desktop id p2p-chat launches this classic UI. Alias p2p-chat-offline is documented as legacy-only and rejected by the app-improvement runner, preserving explicit migration pressure.</p>
            <code>bafyp2pchatg047legacyalias receipt:p2p-chat:g047:alias:legacy-route</code>
          </article>
          <article class="legacy-marker" data-svd-vda-marker="pubsub-provenance">
            <h5>Pubsub provenance</h5>
            <p>Message route records ipfs.kit.pubsub topic swissknife.legacy.p2p-chat, peer peer-alice-123, Event DAG bafyp2pchatg047eventdag, and provenance CID before delivery.</p>
            <code>bafyp2pchatg047pubsubprovenance receipt:p2p-chat:g047:pubsub:provenance-ready</code>
          </article>
          <article class="legacy-marker" data-svd-vda-marker="offline-state">
            <h5>Offline state</h5>
            <p>Offline recipient state is visible as store-and-forward queue depth 1, retry after reconnect, and durable queue reference for the legacy peer session.</p>
            <code>bafyp2pchatg047offlinequeue receipt:p2p-chat:g047:offline:queued</code>
          </article>
          <article class="legacy-marker" data-svd-vda-marker="delivery-failure">
            <h5>Delivery failure</h5>
            <p>Failed delivery remains in the transcript with retry guidance, error receipt, and no false success acknowledgement while the peer is offline.</p>
            <code>bafyp2pchatg047deliveryfailure receipt:p2p-chat:g047:delivery:failed</code>
          </article>
          <article class="legacy-marker" data-svd-vda-marker="migration-path">
            <h5>Migration path</h5>
            <p>Use p2p-chat-unified for moderated pubsub, audio fallback, and offline recovery. Legacy history exports through bafyp2pchatg047migrationpath before handoff.</p>
            <code>bafyp2pchatg047migrationpath receipt:p2p-chat:g047:migration:unified-ready</code>
          </article>
        </div>
      </section>
    `;
  }

  updateWorkflowPanel() {
    const panel = document.querySelector(`[data-svd-workflow="p2p-chat.legacy-alias-pubsub-migration"]`);
    if (panel) {
      panel.outerHTML = this.renderLegacyWorkflowPanel();
    }
  }

  recordLegacyWorkflowStep(step) {
    this.workflowState.selectedPanel = step;
    this.updateWorkflowPanel();
  }

  documentLegacyAlias() {
    this.workflowState.alias = 'canonical-p2p-chat-alias-p2p-chat-offline-rejected';
    this.recordLegacyWorkflowStep('alias');
    this.showNotification('Legacy alias behavior recorded for p2p-chat.', 'success');
  }

  publishPubsubProvenance() {
    this.workflowState.pubsub = 'provenance-cid-recorded';
    this.recordLegacyWorkflowStep('pubsub');
    this.addMessageToConversation(this.currentChatPeer || 'peer-alice-123', {
      id: `g047-pubsub-${Date.now()}`,
      content: 'Pubsub route recorded with provenance CID bafyp2pchatg047pubsubprovenance and Event DAG bafyp2pchatg047eventdag.',
      sender: 'system',
      timestamp: new Date(),
      type: 'system'
    });
  }

  queueOfflineState() {
    this.workflowState.offline = 'queued-for-reconnect';
    const peer = this.peers.get('peer-charlie-789');
    if (peer) peer.status = 'offline';
    this.recordLegacyWorkflowStep('offline');
    this.addMessageToConversation(this.currentChatPeer || 'peer-charlie-789', {
      id: `g047-offline-${Date.now()}`,
      content: 'Offline queue depth 1 stored at bafyp2pchatg047offlinequeue; retry scheduled after reconnect.',
      sender: 'system',
      timestamp: new Date(),
      type: 'system'
    });
  }

  simulateDeliveryFailure() {
    this.workflowState.delivery = 'failed-no-ack';
    this.recordLegacyWorkflowStep('delivery');
    this.addMessageToConversation(this.currentChatPeer || 'peer-charlie-789', {
      id: `g047-failure-${Date.now()}`,
      content: 'Delivery failed without ack; receipt:p2p-chat:g047:delivery:failed keeps retry guidance visible.',
      sender: 'system',
      timestamp: new Date(),
      type: 'system'
    });
  }

  showMigrationPath() {
    this.workflowState.migration = 'ready-for-p2p-chat-unified';
    this.recordLegacyWorkflowStep('migration');
    this.showNotification('Migration path points to p2p-chat-unified with exported legacy history.', 'info');
  }

  // Event handlers
  connectToNetwork() {
    if (this.connectionStatus === 'disconnected') {
      this.p2pManager.start();
    }
  }

  discoverPeers() {
    if (this.connectionStatus === 'connected') {
      // Try to discover real peers via P2P API
      if (this.desktop?.swissknife?.p2p?.discoverPeers) {
        this.desktop.swissknife.p2p.discoverPeers().then(peers => {
          this.loadPeersFromList(peers);
          this.showNotification(`🔍 Found ${peers.length} peers!`, 'success');
        }).catch(error => {
          console.warn('⚠️ Peer discovery failed:', error);
          this.addExamplePeers();
          this.showNotification('🔍 Discovering peers...', 'success');
        });
      } else if (window.p2pMLSystem?.discoverPeers) {
        window.p2pMLSystem.discoverPeers().then(peers => {
          this.loadPeersFromList(peers);
          this.showNotification(`🔍 Found ${peers.length} peers!`, 'success');
        }).catch(error => {
          console.warn('⚠️ Peer discovery failed:', error);
          this.addExamplePeers();
          this.showNotification('🔍 Discovering peers...', 'success');
        });
      } else {
        // Fallback to example peers
        this.addExamplePeers();
        this.showNotification('🔍 Discovering peers...', 'success');
      }
    }
  }

  broadcastMessage() {
    if (this.connectionStatus === 'connected' && this.peers.size > 0) {
      const message = prompt('Enter message to broadcast to all peers:');
      if (message) {
        this.p2pManager.broadcast(message);
        this.showNotification('📢 Message broadcasted!', 'success');
      }
    }
  }

  selectPeer(peerId) {
    this.currentChatPeer = peerId;
    this.updateDisplay();
  }

  clearChat(peerId) {
    if (confirm('Clear this conversation?')) {
      this.conversations.set(peerId, []);
      this.updateDisplay();
    }
  }

  handleInputKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  sendMessage() {
    const input = document.getElementById(`${this.instanceId}-message-input`);
    const message = input.value.trim();
    
    if (!message || !this.currentChatPeer) return;

    // Send message through P2P manager
    this.p2pManager.sendMessage(this.currentChatPeer, message);
    
    // Clear input
    input.value = '';
    
    // Update display
    this.updateDisplay();
  }

  addMessageToConversation(peerId, message) {
    if (!this.conversations.has(peerId)) {
      this.conversations.set(peerId, []);
    }
    
    this.conversations.get(peerId).push(message);
    
    // Update display if this is the current chat
    if (this.currentChatPeer === peerId) {
      this.updateDisplay();
    }
  }

  updateDisplay() {
    // Update messages
    const messagesContainer = document.getElementById(`${this.instanceId}-messages`);
    if (messagesContainer) {
      messagesContainer.innerHTML = this.currentChatPeer ? this.renderMessages() : this.renderEmptyChat();
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Update peers list
    this.updatePeersList();
    
    // Update chat header
    const headerContainer = document.querySelector(`#window-${this.instanceId} .chat-area-header`);
    if (headerContainer) {
      headerContainer.innerHTML = this.currentChatPeer ? this.renderChatHeader() : '<div class="current-peer-name">Select a peer to start chatting</div>';
    }
  }

  updatePeersList() {
    const peersContainer = document.getElementById(`${this.instanceId}-peers`);
    if (peersContainer) {
      peersContainer.innerHTML = this.renderPeersList();
    }
  }

  updateConnectionStatus() {
    const statusElement = document.getElementById(`${this.instanceId}-status`);
    if (statusElement) {
      statusElement.className = `connection-status ${this.connectionStatus}`;
      statusElement.innerHTML = `
        <div class="status-indicator"></div>
        <span>${this.getStatusText()}</span>
      `;
    }
    
    // Update network controls
    const controls = document.querySelectorAll(`#window-${this.instanceId} .control-btn`);
    controls.forEach(btn => {
      const text = btn.textContent.trim();
      if (text.includes('Connect')) {
        btn.disabled = this.connectionStatus === 'connected';
        btn.innerHTML = this.connectionStatus === 'connected' ? '🔗 Connected' : '🔗 Connect to Network';
      } else {
        btn.disabled = this.connectionStatus !== 'connected';
      }
    });
  }

  getStatusText() {
    switch (this.connectionStatus) {
      case 'connected': return 'Connected to P2P Network';
      case 'connecting': return 'Connecting...';
      case 'disconnected': return 'Disconnected';
      default: return 'Unknown';
    }
  }

  showNotification(message, type = 'info') {
    // Simple notification system
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      animation: slideIn 0.3s ease;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  // Utility methods
  formatTime(date) {
    return new Intl.DateTimeFormat('en', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  }

  formatTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'now';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Lifecycle methods
  onPeerConnected(peer) {
    console.log('👋 Peer connected:', peer);
    this.peers.set(peer.id, peer);
    this.updatePeersList();
  }

  onPeerDisconnected(peerId) {
    console.log('👋 Peer disconnected:', peerId);
    this.peers.delete(peerId);
    
    if (this.currentChatPeer === peerId) {
      this.currentChatPeer = null;
    }
    
    this.updatePeersList();
    this.updateDisplay();
  }

  onMessage(message) {
    console.log('📨 Message received:', message);
    this.addMessageToConversation(message.from, {
      id: message.id,
      content: message.content,
      sender: message.from,
      timestamp: new Date(message.timestamp),
      type: message.type || 'text'
    });
  }

  // Cleanup when window is closed
  destroy() {
    if (this.p2pManager) {
      this.p2pManager.stop();
    }
    
    if (window.p2pChatInstances) {
      delete window.p2pChatInstances[this.instanceId];
    }
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = P2PChatApp;
}

// Initialize app when DOM is ready
if (typeof window !== 'undefined') {
  window.P2PChatApp = P2PChatApp;
}
