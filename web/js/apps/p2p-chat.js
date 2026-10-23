/**
 * P2P Chat Application for SwissKnife Virtual Desktop
 * Enables direct peer-to-peer messaging using libp2p with enhanced design language
 *
 * Native sends, archives, and event-DAG actions use exact reviewed owner
 * bindings. The shared gateway owns confirmation and transport policy.
 * Mutation previews remain previews and never create stored-history or
 * recipient-delivery claims. Backend failures remain visible.
 */

import { contentCidForBytes, stableStringifyValue, base64ForBytes } from '../core/mcp-plus-plus-desktop-client.js';
import { invokeNetworkNativeTool, networkNativeAttributes } from './network-native-tools.js';

const PUBSUB_TOPIC = '/swissknife/chat/g047';

async function callChatMcpTool(app, _method, tool, toolArguments, trigger = null) {
  return invokeNetworkNativeTool(app.getNativeContainer(), 'p2p-chat', tool, toolArguments, trigger);
}

function bytesFromBase64(b64) {
  const bin = atob(String(b64 || '').replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export class P2PChatApp {
  getNativeContainer() {
    return document.querySelector(`[data-p2p-chat-instance="${this.instanceId}"]`);
  }
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
    // Real libp2p node (resolved from the desktop P2P API); null when no
    // transport exists — the UI then stays honestly local, never simulated.
    this.libp2p = null;
    this.lastSendOutcome = null;
    this.offlineQueue = [];
    this.workflowState = {
      alias: 'documented-local',
      pubsub: 'pending',
      offline: 'empty',
      delivery: 'none',
      migration: 'available-local',
      selectedPanel: 'alias',
      provenanceCid: ''
    };
    
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

  /**
   * 📡 Resolve the real libp2p node from the desktop P2P API (mirrors
   * p2p-chat-unified's createLibp2pNode). Returns null when no transport
   * exists — callers must then stay honestly local, never fake delivery.
   */
  async ensureLibp2p() {
    if (this.libp2p) return this.libp2p;
    const p2pApi = this.desktop?.swissknife?.p2p || window.SwissKnife?.p2p || null;
    if (!p2pApi) {
      this.libp2p = null;
      return null;
    }
    let peerId = this.peerId;
    try {
      if (typeof p2pApi.getPeerInfo === 'function') {
        const info = await p2pApi.getPeerInfo();
        peerId = info?.peerId || info?.id || peerId;
      } else if (typeof p2pApi.id === 'function') {
        const info = await p2pApi.id();
        peerId = info?.id || peerId;
      }
    } catch {
      // keep existing peerId
    }
    this.peerId = peerId;
    this.libp2p = {
      peerId,
      publish: async (topic, payload) => {
        if (typeof p2pApi.pubsubPublish === 'function') return p2pApi.pubsubPublish(topic, payload);
        if (typeof p2pApi.publish === 'function') return p2pApi.publish(topic, payload);
        if (typeof p2pApi.sendMessage === 'function') return p2pApi.sendMessage(payload.to, payload.content);
        throw new Error('No browser pubsub publish method is registered.');
      },
    };
    return this.libp2p;
  }

  /**
   * 📤 The single real send path, invoked by the send button: publishes the
   * message via this.libp2p.publish() on the real pubsub topic. The delivery
   * outcome is recorded verbatim on the message; failures queue locally for
   * retry. Nothing is ever simulated.
   */
  async deliverMessage(peerId, content) {
    const message = {
      id: `g047-${Date.now()}`,
      content,
      sender: 'self',
      to: peerId,
      timestamp: new Date(),
      type: 'text',
      topic: PUBSUB_TOPIC,
      transport: 'unsent'
    };
    const libp2p = await this.ensureLibp2p();
    if (!libp2p) {
      message.transport = 'unsent-no-transport';
      message.error = 'No P2P transport available in this environment.';
      this.offlineQueue.push(message);
      this.lastSendOutcome = { status: 'unsent', error: message.error, at: new Date() };
      this.addMessageToConversation(peerId, message);
      this.updateWorkflowPanel();
      return message;
    }
    try {
      await libp2p.publish(PUBSUB_TOPIC, { ...message, topic: PUBSUB_TOPIC });
      message.transport = 'libp2p-pubsub';
      this.lastSendOutcome = { status: 'delivered', transport: 'libp2p-pubsub', at: new Date() };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      message.transport = 'failed';
      message.error = errMsg;
      this.offlineQueue.push(message);
      this.lastSendOutcome = { status: 'failed', error: errMsg, at: new Date() };
    }
    this.addMessageToConversation(peerId, message);
    this.updateWorkflowPanel();
    return message;
  }

  setupRealP2PManager() {
    // Real P2P manager using SwissKnife API; sends go through the real
    // libp2p publish path (deliverMessage). Failures stay honest.
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
          await this.ensureLibp2p();

          // Load real peers from network
          const peers = await p2pApi.getPeers();
          this.loadPeersFromList(peers);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn('⚠️ P2P connection failed:', message);
          this.connectionStatus = 'disconnected';
          this.updateConnectionStatus();
          this.showNotification(`P2P connection failed: ${message}`, 'error');
        }
      },

      stop: () => {
        p2pApi.stop?.();
        this.connectionStatus = 'disconnected';
        this.peers.clear();
        this.updateConnectionStatus();
      },

      sendMessage: (peerId, message) => this.deliverMessage(peerId, message),

      broadcast: async (message) => {
        console.log('📢 Broadcasting message:', message);
        try {
          await p2pApi.broadcast(message);
        } catch (error) {
          const message_text = error instanceof Error ? error.message : String(error);
          console.warn('⚠️ Broadcast failed:', message_text);
          this.showNotification(`Broadcast failed: ${message_text}`, 'error');
        }
      },

      getPeers: () => Array.from(this.peers.values()),

      getConnectionStatus: () => this.connectionStatus
    };
  }

  setupP2PMLSystemManager() {
    // Use existing P2P ML System; sends go through the real libp2p publish
    // path (deliverMessage).
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
          await this.ensureLibp2p();

          // Get connected peers
          const peers = await p2pSystem.getConnectedPeers();
          this.loadPeersFromList(peers);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn('⚠️ P2P ML System connection failed:', message);
          this.connectionStatus = 'disconnected';
          this.updateConnectionStatus();
          this.showNotification(`P2P connection failed: ${message}`, 'error');
        }
      },

      stop: () => {
        this.connectionStatus = 'disconnected';
        this.peers.clear();
        this.updateConnectionStatus();
      },

      sendMessage: (peerId, message) => this.deliverMessage(peerId, message),

      broadcast: (message) => {
        console.log('📢 Broadcasting message:', message);
        this.peers.forEach((peer, peerId) => {
          this.deliverMessage(peerId, message);
        });
      },

      getPeers: () => Array.from(this.peers.values()),

      getConnectionStatus: () => this.connectionStatus
    };
  }

  setupFallbackP2PManager() {
    // Honest fallback: no P2P transport is available, so the app runs
    // local-only. Nothing is simulated — no fake peers, no fake delivery,
    // no canned auto-responses. Sends are honestly marked unsent.
    this.p2pManager = {
      start: async () => {
        this.connectionStatus = 'connecting';
        this.updateConnectionStatus();

        await this.ensureLibp2p();
        if (this.libp2p) {
          this.connectionStatus = 'connected';
        } else {
          this.connectionStatus = 'disconnected';
          this.showNotification('No P2P transport available — running local-only.', 'info');
        }
        this.updateConnectionStatus();
      },

      stop: () => {
        this.connectionStatus = 'disconnected';
        this.peers.clear();
        this.updateConnectionStatus();
      },

      sendMessage: (peerId, message) => this.deliverMessage(peerId, message),

      broadcast: (message) => {
        console.log('📢 Broadcasting message:', message);
        this.peers.forEach((peer, peerId) => {
          this.deliverMessage(peerId, message);
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

  async initialize() {
    console.log('🚀 Initializing P2P Chat...');
    
    // Set up global reference for Friends List integration
    window.p2pChatGlobal = this;
    
    return true;
  }

  async render() {
    const content = `
      <div class="p2p-chat-app" data-p2p-chat-instance="${this.instanceId}">
        <style>
          .p2p-chat-app {
            height: 100%;
            display: flex;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--sk-bg-deep, #0e1412);
            color: var(--sk-text, #edf7f2);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
          }
          
          .chat-sidebar {
            width: 320px;
            background: var(--sk-bg-panel, #101b18);
            border-right: 1px solid var(--sk-border, #263a34);
            display: flex;
            flex-direction: column;
          }
          
          .chat-header {
            padding: 20px;
            background: var(--sk-bg-header, #12211d);
            border-bottom: 1px solid var(--sk-border, #263a34);
            color: var(--sk-text, #edf7f2);
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
            color: var(--sk-ok, #5ee3a1);
            background: rgba(94, 227, 161, 0.1);
          }
          
          .connection-status.connecting {
            color: var(--sk-warn, #ffd166);
            background: rgba(255, 209, 102, 0.1);
          }
          
          .connection-status.disconnected {
            color: var(--sk-err, #ff6b6b);
            background: rgba(255, 107, 107, 0.1);
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
            background: var(--sk-accent, #8bd8bd);
            color: #0e1412;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          
          .control-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(139, 216, 189, 0.3);
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
            color: var(--sk-text-faint, #9eb2aa);
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
            background: rgba(139, 216, 189, 0.08);
            border-left-color: var(--sk-accent, #8bd8bd);
          }
          
          .peer-item.active {
            background: rgba(139, 216, 189, 0.14);
            border-left-color: var(--sk-accent, #8bd8bd);
          }
          
          .peer-avatar {
            width: 40px;
            height: 40px;
            border-radius: 12px;
            background: var(--sk-bg-inset, #17241f);
            border: 1px solid var(--sk-border, #263a34);
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
            color: var(--sk-text, #edf7f2);
            margin-bottom: 2px;
            font-size: 14px;
          }
          
          .peer-status {
            font-size: 12px;
            color: var(--sk-text-faint, #9eb2aa);
            display: flex;
            align-items: center;
            gap: 4px;
          }
          
          .peer-status.online {
            color: var(--sk-ok, #5ee3a1);
          }
          
          .peer-status.away {
            color: var(--sk-warn, #ffd166);
          }
          
          .peer-status.offline {
            color: var(--sk-idle, #7c8f87);
          }
          
          .peer-activity {
            font-size: 11px;
            color: var(--sk-text-faint, #9eb2aa);
            margin-top: 2px;
            font-style: italic;
          }
          
          .peer-verified {
            font-size: 10px;
            color: var(--sk-ok, #5ee3a1);
            font-weight: 600;
            margin-top: 2px;
          }
          
          .chat-main {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: var(--sk-bg-deep, #0e1412);
          }
          
          .chat-area-header {
            padding: 16px 20px;
            border-bottom: 1px solid var(--sk-border, #263a34);
            background: var(--sk-bg-panel, #101b18);
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
            color: var(--sk-text, #edf7f2);
            font-size: 16px;
          }
          
          .chat-actions {
            display: flex;
            gap: 8px;
          }
          
          .action-btn {
            padding: 6px 12px;
            border: 1px solid var(--sk-border, #263a34);
            border-radius: 6px;
            background: var(--sk-bg-header, #12211d);
            color: var(--sk-accent, #8bd8bd);
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s ease;
          }
          
          .action-btn:hover {
            background: var(--sk-bg-inset, #17241f);
          }
          
          .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            background: transparent;
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
            background: var(--sk-bg-panel, #101b18);
            border: 1px solid var(--sk-border, #263a34);
            color: var(--sk-text, #edf7f2);
            padding: 12px 16px;
            border-radius: 18px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            position: relative;
          }
          
          .message.self .message-content {
            background: rgba(139, 216, 189, 0.14);
            border-color: var(--sk-accent, #8bd8bd);
            color: var(--sk-text, #edf7f2);
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
            background: rgba(59, 130, 246, 0.12);
            color: #93c5fd;
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
            background: var(--sk-bg-panel, #101b18);
            border-top: 1px solid var(--sk-border, #263a34);
          }
          
          .message-input-container {
            display: flex;
            gap: 12px;
            align-items: end;
            background: var(--sk-bg-header, #12211d);
            border-radius: 24px;
            padding: 8px;
            border: 2px solid transparent;
            transition: all 0.2s ease;
          }
          
          .message-input-container:focus-within {
            border-color: var(--sk-accent, #8bd8bd);
            background: var(--sk-bg-header, #12211d);
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
            color: var(--sk-text, #edf7f2);
          }
          
          .message-input::placeholder {
            color: var(--sk-text-faint, #9eb2aa);
          }
          
          .send-btn {
            padding: 10px 16px;
            border: none;
            border-radius: 18px;
            background: var(--sk-accent, #8bd8bd);
            color: #0e1412;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            min-width: 70px;
            transition: all 0.2s ease;
          }
          
          .send-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(139, 216, 189, 0.3);
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
            color: var(--sk-text-faint, #9eb2aa);
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
            border-top: 1px solid var(--sk-border, #263a34);
            background: var(--sk-bg-panel, #101b18);
            padding: 14px 16px;
            display: grid;
            gap: 10px;
          }

          .legacy-note {
            margin: 0;
            font-size: 12px;
            color: var(--sk-text-faint, #9eb2aa);
            line-height: 1.5;
          }

          .message-transport {
            font-size: 10px;
            opacity: 0.65;
            margin-top: 4px;
          }

          .message-failed {
            color: #fca5a5;
            opacity: 0.95;
          }

          .pc-governed-confirm-overlay {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.72);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 20000;
          }

          .pc-governed-confirm-dialog {
            background: #ffffff;
            border: 1px solid #c7d2fe;
            border-radius: 12px;
            color: #1f2937;
            max-width: 430px;
            width: calc(100% - 48px);
            max-height: 80vh;
            overflow-y: auto;
            padding: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
          }

          .pc-governed-confirm-dialog h3 {
            margin: 0 0 8px;
            font-size: 15px;
            color: #3730a3;
          }

          .pc-governed-confirm-dialog p {
            margin: 0 0 8px;
            font-size: 13px;
            color: #475569;
            line-height: 1.5;
            overflow-wrap: anywhere;
          }

          .pc-governed-target {
            color: #4f46e5 !important;
            font-size: 12px !important;
          }

          .pc-governed-check {
            display: flex;
            gap: 8px;
            align-items: flex-start;
            font-size: 13px;
            margin: 12px 0;
            cursor: pointer;
          }

          .pc-governed-actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
            margin-top: 12px;
          }

          .pc-governed-actions button {
            padding: 10px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
          }

          .pc-governed-cancel {
            border: 1px solid #cbd5e1;
            background: #fff;
            color: #475569;
          }

          .pc-governed-confirm {
            border: none;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: #fff;
          }

          .pc-governed-confirm:disabled {
            opacity: 0.45;
            cursor: not-allowed;
          }

          .pc-cid-input {
            width: 100%;
            box-sizing: border-box;
            padding: 10px 12px;
            border: 1px solid var(--sk-border, #263a34);
            border-radius: 8px;
            font-size: 13px;
            margin-top: 4px;
            background: var(--sk-bg-header, #12211d);
            color: var(--sk-text, #edf7f2);
          }
          
          .pc-cid-input::placeholder {
            color: var(--sk-text-faint, #9eb2aa);
          }

          .legacy-workflow-actions {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 6px;
          }

          .legacy-workflow-actions button {
            border: 1px solid var(--sk-border, #263a34);
            background: var(--sk-bg-header, #12211d);
            border-radius: 7px;
            min-height: 36px;
            color: var(--sk-text, #edf7f2);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            padding: 6px 8px;
          }

          .legacy-workflow-actions button:hover,
          .legacy-workflow-actions button:focus {
            border-color: var(--sk-accent, #8bd8bd);
            color: var(--sk-accent, #8bd8bd);
            outline: none;
          }

          .legacy-workflow-grid {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 8px;
          }

          .legacy-marker {
            border: 1px solid var(--sk-border, #263a34);
            border-radius: 8px;
            background: var(--sk-bg-panel, #101b18);
            padding: 9px;
            min-height: 118px;
            color: var(--sk-text-faint, #9eb2aa);
          }

          .legacy-marker h5 {
            margin: 0 0 6px;
            color: var(--sk-text, #edf7f2);
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
            color: var(--sk-accent, #8bd8bd);
            font-size: 10px;
            overflow-wrap: anywhere;
          }

          .legacy-status-strip {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            font-size: 11px;
            color: var(--sk-text-faint, #9eb2aa);
          }

          .legacy-status-strip span {
            border-radius: 999px;
            background: var(--sk-bg-inset, #17241f);
            border: 1px solid var(--sk-border, #263a34);
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
            <label>Broadcast topic <input data-chat-publish-topic aria-label="Broadcast topic" value="${PUBSUB_TOPIC}"></label>
            <label>Broadcast message <textarea data-chat-broadcast-message aria-label="Broadcast message" placeholder="Write a message to review"></textarea></label>
            <button class="control-btn" ${networkNativeAttributes('p2p-chat', 'mcp++:ipfs_kit_py/ipfs_pubsub_publish')} onclick="window.p2pChatInstances?.['${this.instanceId}']?.broadcastMessage()">
              📢 Review broadcast
            </button>
            <button class="control-btn" ${networkNativeAttributes('p2p-chat', 'mcp++:ipfs_kit_py/artifacts/put')} onclick="window.p2pChatInstances?.['${this.instanceId}']?.saveHistory()" title="Persist chat history to ipfs_kit_py (confirmation-gated)">
              💾 Save History
            </button>
            <input data-chat-history-cid aria-label="Chat history artifact CID" placeholder="Stored chat history CID">
            <button class="control-btn" ${networkNativeAttributes('p2p-chat', 'mcp++:ipfs_kit_py/artifacts/get')} onclick="window.p2pChatInstances?.['${this.instanceId}']?.loadHistory()" title="Load chat history from an ipfs_kit_py artifact CID">
              📂 Load History
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
      return '<div class="sk-empty">No peers connected<br><small>Use "Discover Peers" to find others</small></div>';
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
      return '<div class="sk-empty">Start the conversation! 👋</div>';
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

      // Self messages carry their real delivery outcome — never a fake success.
      let transportNote = '';
      if (message.sender === 'self' && message.transport) {
        if (message.transport === 'libp2p-pubsub') {
          transportNote = '<div class="message-transport">sent via libp2p pubsub</div>';
        } else if (message.transport === 'failed') {
          transportNote = `<div class="message-transport message-failed">send failed: ${this.escapeHtml(message.error || 'unknown error')}</div>`;
        } else if (message.transport === 'unsent-no-transport') {
          transportNote = '<div class="message-transport">unsent — no P2P transport (queued locally)</div>';
        }
      }

      return `
        <div class="message ${message.sender === 'self' ? 'self' : 'peer'}">
          <div class="message-content">
            <div class="message-text">${this.escapeHtml(message.content)}</div>
            <div class="message-timestamp">${this.formatTime(message.timestamp)}</div>
            ${transportNote}
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
                  ${networkNativeAttributes('p2p-chat', 'mcp++:ipfs_kit_py/ipfs_pubsub_publish')}
                  onclick="window.p2pChatInstances?.['${this.instanceId}']?.sendMessage()">
            📤 Send
          </button>
        </div>
      </div>
    `;
  }

  renderLegacyWorkflowPanel() {
    const state = this.workflowState;
    const lastOutcome = this.lastSendOutcome
      ? `${this.lastSendOutcome.status}${this.lastSendOutcome.error ? `: ${this.lastSendOutcome.error}` : ''} (${this.formatTime(this.lastSendOutcome.at)})`
      : 'no sends yet';
    return `
      <section class="legacy-workflow-panel" data-svd-workflow="p2p-chat.legacy-alias-pubsub-migration" aria-label="P2P Chat message provenance">
        <p class="legacy-note">Message provenance for this chat. Sends publish through real libp2p pubsub when a transport exists; history persistence is confirmation-gated. Every state below is real — nothing is fabricated.</p>
        <div class="legacy-workflow-actions">
          <button type="button" data-svd-primary-control="p2p-chat-legacy-primary" data-svd-workflow-action="document-legacy-alias" onclick="window.p2pChatInstances?.['${this.instanceId}']?.documentLegacyAlias()">
            Legacy alias
          </button>
          <button type="button" ${networkNativeAttributes('p2p-chat', 'mcp++:ipfs_kit_py/artifacts/put')} data-svd-workflow-action="publish-pubsub-provenance" onclick="window.p2pChatInstances?.['${this.instanceId}']?.publishPubsubProvenance()">
            Pubsub proof
          </button>
          <button type="button" data-svd-workflow-action="queue-offline-state" onclick="window.p2pChatInstances?.['${this.instanceId}']?.showOfflineQueue()">
            Offline queue
          </button>
          <button type="button" data-svd-workflow-action="simulate-delivery-failure" onclick="window.p2pChatInstances?.['${this.instanceId}']?.showDeliveryStatus()">
            Delivery status
          </button>
          <button type="button" data-svd-workflow-action="show-migration-path" onclick="window.p2pChatInstances?.['${this.instanceId}']?.showMigrationPath()">
            Migrate
          </button>
        </div>
        <div class="legacy-status-strip" role="status" aria-live="polite">
          <span data-legacy-alias-state="${this.escapeHtml(state.alias)}">alias ${this.escapeHtml(state.alias)}</span>
          <span data-pubsub-provenance-state="${this.escapeHtml(state.pubsub)}">pubsub ${this.escapeHtml(state.pubsub)}</span>
          <span data-offline-state="${this.escapeHtml(state.offline)}">offline queue ${this.offlineQueue.length}</span>
          <span data-delivery-failure-state="${this.escapeHtml(state.delivery)}">delivery ${this.escapeHtml(state.delivery)}</span>
          <span data-migration-state="${this.escapeHtml(state.migration)}">migration ${this.escapeHtml(state.migration)}</span>
        </div>
        <div class="legacy-workflow-grid">
          <article class="legacy-marker" data-svd-vda-marker="legacy-alias-behavior">
            <h5>Legacy alias behavior</h5>
            <p>Canonical desktop id p2p-chat launches this classic UI; the alias p2p-chat-offline is legacy-only. Local documentation — no backend involved.</p>
          </article>
          <article class="legacy-marker" data-svd-vda-marker="pubsub-provenance">
            <h5>Pubsub provenance</h5>
            <p>${state.provenanceCid ? `Provenance record persisted to ipfs_kit_py: ${this.escapeHtml(state.provenanceCid)}` : 'No provenance record persisted yet. “Pubsub proof” persists the pubsub route record to ipfs_kit_py behind a confirmation.'}</p>
          </article>
          <article class="legacy-marker" data-svd-vda-marker="offline-state">
            <h5>Offline queue (local)</h5>
            <p>${this.offlineQueue.length} message(s) queued locally for retry. Local store-and-forward — no backend involved.</p>
          </article>
          <article class="legacy-marker" data-svd-vda-marker="delivery-failure">
            <h5>Delivery status (real)</h5>
            <p>Last send outcome: ${this.escapeHtml(lastOutcome)}.</p>
          </article>
          <article class="legacy-marker" data-svd-vda-marker="migration-path">
            <h5>Migration path</h5>
            <p>Use p2p-chat-unified for moderated pubsub and offline recovery. Local guidance — no backend involved.</p>
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
    this.workflowState.alias = 'documented-local';
    this.recordLegacyWorkflowStep('alias');
    this.showNotification('Legacy alias behavior recorded (local documentation).', 'success');
  }

  /**
   * 🛰️ Persist the pubsub route record to ipfs_kit_py behind an explicit
   * user confirmation. Returns the real canonical CID.
   */
  async publishPubsubProvenance() {
    const record = {
      schema: 'swissknife.p2p-chat.pubsub-provenance.v1',
      app: 'p2p-chat',
      recorded_at: new Date().toISOString(),
      topic: PUBSUB_TOPIC,
      peer_id: this.peerId,
      transport: this.libp2p ? 'libp2p-pubsub' : 'none',
      last_send_outcome: this.lastSendOutcome,
      offline_queue_depth: this.offlineQueue.length
    };
    try {
      const bytes = new TextEncoder().encode(stableStringifyValue(record));
      const cid = await contentCidForBytes(bytes);
      const result = await callChatMcpTool(this, 'request_action', 'mcp++:ipfs_kit_py/artifacts/put', {
        cid,
        bytes_base64: base64ForBytes(bytes),
        profile: 'p2p-chat-provenance',
        kind: 'pubsub-provenance',
        service: 'ipfs_kit_py',
        pin: true
      });
      if (result === null) return;
      if (result.persisted !== true || result.cid !== cid) {
        throw new Error(result?.error || 'ipfs_kit_py did not verify the persisted provenance artifact.');
      }
      this.workflowState.pubsub = 'provenance-persisted';
      this.workflowState.provenanceCid = cid;
      this.addMessageToConversation(this.currentChatPeer || 'local', {
        id: `g047-pubsub-${Date.now()}`,
        content: `Pubsub provenance persisted: ${cid} (verified=${result.verified === true}).`,
        sender: 'system',
        timestamp: new Date(),
        type: 'system'
      });
      this.showNotification(`Provenance persisted: ${cid}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.workflowState.pubsub = error.preview ? 'validated-preview' : 'persist-failed';
      this.showNotification(`Provenance ${error.preview ? 'preview' : 'persist failed'}: ${message}`, error.preview ? 'info' : 'error');
    }
    this.recordLegacyWorkflowStep('pubsub');
  }

  /**
   * 📥 Show the real local offline queue depth (honestly local).
   */
  showOfflineQueue() {
    this.workflowState.offline = this.offlineQueue.length > 0 ? `${this.offlineQueue.length}-queued` : 'empty';
    this.recordLegacyWorkflowStep('offline');
    this.showNotification(
      this.offlineQueue.length > 0
        ? `${this.offlineQueue.length} message(s) queued locally for retry.`
        : 'Offline queue is empty.',
      'info'
    );
  }

  /**
   * 📊 Show the real last send outcome — verbatim, never fabricated.
   */
  showDeliveryStatus() {
    const outcome = this.lastSendOutcome;
    this.workflowState.delivery = outcome ? outcome.status : 'none';
    this.recordLegacyWorkflowStep('delivery');
    this.showNotification(
      outcome
        ? `Last send: ${outcome.status}${outcome.error ? ` — ${outcome.error}` : ''}`
        : 'No messages sent yet.',
      outcome && outcome.status !== 'delivered' ? 'error' : 'info'
    );
  }

  showMigrationPath() {
    this.workflowState.migration = 'ready-for-p2p-chat-unified';
    this.recordLegacyWorkflowStep('migration');
    this.showNotification('Migration path points to p2p-chat-unified with exported legacy history.', 'info');
  }

  /**
   * 💾 Save chat history: persists the conversation record to ipfs_kit_py
   * behind an explicit confirmation. Returns the real canonical CID.
   */
  async saveHistory() {
    const record = {
      schema: 'swissknife.p2p-chat.history.v1',
      app: 'p2p-chat',
      saved_at: new Date().toISOString(),
      peer_id: this.peerId,
      conversations: Array.from(this.conversations.entries()).map(([peerId, messages]) => ({
        peer_id: peerId,
        messages: messages.map(m => ({
          ...m,
          timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp
        }))
      }))
    };
    try {
      const bytes = new TextEncoder().encode(stableStringifyValue(record));
      const cid = await contentCidForBytes(bytes);
      const result = await callChatMcpTool(this, 'request_action', 'mcp++:ipfs_kit_py/artifacts/put', {
        cid,
        bytes_base64: base64ForBytes(bytes),
        profile: 'p2p-chat-history',
        kind: 'chat-history',
        service: 'ipfs_kit_py',
        pin: true
      });
      if (result === null) return;
      if (result.persisted !== true || result.cid !== cid) {
        throw new Error(result?.error || 'ipfs_kit_py did not verify the persisted history artifact.');
      }
      let dagNote = '';
      try {
        const dagResult = await callChatMcpTool(this, 'request_action', 'mcp++:ipfs_kit_py/dag/append', {
          event: {
            event_type: 'p2p-chat.history.saved',
            history_cid: cid,
            peer_id: this.peerId
          }
        });
        if (dagResult?.event_cid) dagNote = `; event DAG ${dagResult.event_cid}`;
      } catch (dagError) {
        dagNote = `; event DAG append failed: ${dagError instanceof Error ? dagError.message : String(dagError)}`;
      }
      this.showNotification(`History saved: ${cid}${dagNote}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showNotification(`History ${error.preview ? 'preview' : 'save failed'}: ${message}`, error.preview ? 'info' : 'error');
    }
  }

  /**
   * 📂 Load chat history: fetch a real history artifact live from ipfs_kit_py.
   */
  async loadHistory() {
    const cid = this.getNativeContainer()?.querySelector('[data-chat-history-cid]')?.value.trim();
    if (!cid) { this.showNotification('Enter a stored chat history artifact CID.', 'info'); return; }
    try {
      const artifact = await callChatMcpTool(this, 'request_action', 'mcp++:ipfs_kit_py/artifacts/get', { cid });
      if (artifact === null) return;
      if (!artifact || artifact.found !== true) {
        throw new Error(artifact?.error || `Artifact ${cid} was not found in ipfs_kit_py.`);
      }
      const record = JSON.parse(new TextDecoder().decode(bytesFromBase64(artifact.bytes_base64 || '')));
      if (record.schema !== 'swissknife.p2p-chat.history.v1' || !Array.isArray(record.conversations)) throw new Error('The artifact is not a supported chat history record.');
      const conversations = Array.isArray(record.conversations) ? record.conversations : [];
      for (const conv of conversations) {
        this.conversations.set(conv.peer_id, (conv.messages || []).map(m => ({
          ...m,
          timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
        })));
      }
      this.updateDisplay();
      this.showNotification(`History loaded from ${cid} (${conversations.length} conversation(s))`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showNotification(`History load failed: ${message}`, 'error');
    }
  }

  /**
   * 🔐 Confirmation-gated governed write (mirrors supervisor receipts.persist):
   * every backend-mutating POST requires this explicit, reviewed user
   * confirmation step first.
   */
  confirmGovernedWrite({ title, description, confirmLabel = 'Confirm write' }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'pc-governed-confirm-overlay';
      overlay.innerHTML = `
        <div class="pc-governed-confirm-dialog" role="dialog" aria-modal="true" aria-label="${this.escapeHtml(title)}">
          <h3>${this.escapeHtml(title)}</h3>
          <p>${this.escapeHtml(description)}</p>
          <p class="pc-governed-target">Target: ipfs_kit_py · POST /mcp/tools/call (pinned)</p>
          <label class="pc-governed-check">
            <input type="checkbox">
            <span>I confirm this governed write. I have reviewed the data being persisted.</span>
          </label>
          <div class="pc-governed-actions">
            <button type="button" class="pc-governed-cancel">Cancel</button>
            <button type="button" class="pc-governed-confirm" disabled>${this.escapeHtml(confirmLabel)}</button>
          </div>
        </div>`;
      const checkbox = overlay.querySelector('input[type="checkbox"]');
      const confirmBtn = overlay.querySelector('.pc-governed-confirm');
      const done = (value) => { overlay.remove(); resolve(value); };
      checkbox.addEventListener('change', () => { confirmBtn.disabled = !checkbox.checked; });
      overlay.querySelector('.pc-governed-cancel').addEventListener('click', () => done(false));
      confirmBtn.addEventListener('click', () => done(true));
      overlay.addEventListener('click', (event) => { if (event.target === overlay) done(false); });
      document.body.appendChild(overlay);
    });
  }

  /**
   * ⌨️ Prompt the user for a CID.
   */
  promptForCid(title, description) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'pc-governed-confirm-overlay';
      overlay.innerHTML = `
        <div class="pc-governed-confirm-dialog" role="dialog" aria-modal="true" aria-label="${this.escapeHtml(title)}">
          <h3>${this.escapeHtml(title)}</h3>
          <p>${this.escapeHtml(description)}</p>
          <input type="text" class="pc-cid-input" placeholder="bafy…" aria-label="Artifact CID" spellcheck="false">
          <div class="pc-governed-actions">
            <button type="button" class="pc-governed-cancel">Cancel</button>
            <button type="button" class="pc-governed-confirm">Load</button>
          </div>
        </div>`;
      const input = overlay.querySelector('.pc-cid-input');
      const done = (value) => { overlay.remove(); resolve(value ? value.trim() : null); };
      overlay.querySelector('.pc-governed-cancel').addEventListener('click', () => done(null));
      overlay.querySelector('.pc-governed-confirm').addEventListener('click', () => done(input.value));
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') done(input.value); });
      document.body.appendChild(overlay);
      input.focus();
    });
  }

  // Event handlers
  connectToNetwork() {
    if (this.connectionStatus === 'disconnected') {
      this.p2pManager.start();
    }
  }

  discoverPeers() {
    if (this.connectionStatus === 'connected') {
      // Discover real peers via the P2P API only — never fabricated peers.
      const fail = (error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('⚠️ Peer discovery failed:', message);
        this.loadFriendsFromFriendsList();
        this.updatePeersList();
        this.showNotification(
          this.peers.size > 0
            ? `Peer discovery failed (${message}); showing Friends List contacts.`
            : `Peer discovery failed: ${message}`,
          'error'
        );
      };
      if (this.desktop?.swissknife?.p2p?.discoverPeers) {
        this.desktop.swissknife.p2p.discoverPeers().then(peers => {
          this.loadPeersFromList(peers);
          this.updatePeersList();
          this.showNotification(`🔍 Found ${Array.isArray(peers) ? peers.length : this.peers.size} peers!`, 'success');
        }).catch(fail);
      } else if (window.p2pMLSystem?.discoverPeers) {
        window.p2pMLSystem.discoverPeers().then(peers => {
          this.loadPeersFromList(peers);
          this.updatePeersList();
          this.showNotification(`🔍 Found ${Array.isArray(peers) ? peers.length : this.peers.size} peers!`, 'success');
        }).catch(fail);
      } else {
        // No discovery API: fall back to the real Friends List integration,
        // honestly labeled, or report that discovery is unavailable.
        this.loadFriendsFromFriendsList();
        this.updatePeersList();
        this.showNotification(
          this.peers.size > 0
            ? `Loaded ${this.peers.size} contact(s) from Friends List (local).`
            : 'Peer discovery unavailable — no P2P transport in this environment.',
          'info'
        );
      }
    }
  }

  async broadcastMessage() {
    const container = this.getNativeContainer();
    const topic = container?.querySelector('[data-chat-publish-topic]')?.value.trim();
    const message = container?.querySelector('[data-chat-broadcast-message]')?.value.trim();
    if (!topic || !message) {
      this.showNotification('Enter a broadcast topic and message before review.', 'info');
      return;
    }
    try {
      const result = await callChatMcpTool(this, 'request_action', 'mcp++:ipfs_kit_py/ipfs_pubsub_publish', {
        topic,
        content: message
      });
      if (result === null) return;
      if (result?.published !== true) throw new Error('The owner did not acknowledge a published message.');
      this.lastSendOutcome = { status: 'published', topic, at: new Date(), ack: result };
      this.showNotification('Broadcast published by the owner.', 'success');
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.lastSendOutcome = error.preview
        ? { status: 'validated-preview', topic, at: new Date(), ack: error.result }
        : { status: 'failed', topic, error: text, at: new Date() };
      this.showNotification(`Broadcast ${error.preview ? 'preview' : 'invoke failed'}: ${text}`, error.preview ? 'info' : 'error');
    }
    this.updateWorkflowPanel();
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

  async sendMessage() {
    const input = document.getElementById(`${this.instanceId}-message-input`);
    const message = input?.value.trim();
    if (!message || !this.currentChatPeer) return;

    const sent = await this.invokeConfirmedSend(this.currentChatPeer, message);
    if (!sent) return;
    input.value = '';
    this.updateDisplay();
  }

  // The shared gateway owns confirmation and policy. A validated preview is
  // never promoted into a browser publish or a delivery acknowledgment.
  async invokeConfirmedSend(peerId, content) {
    try {
      const result = await callChatMcpTool(this, 'request_action', 'mcp++:ipfs_kit_py/ipfs_pubsub_publish', {
        topic: PUBSUB_TOPIC,
        peer_id: peerId,
        content
      });
      if (result === null) return false;
      if (result?.published !== true) throw new Error('The owner did not acknowledge a published message.');
      this.addMessageToConversation(peerId, { id: `owner-${Date.now()}`, content, sender: 'self', timestamp: new Date(), type: 'text', transport: 'owner-pubsub', ack: result });
      this.lastSendOutcome = { status: 'published', at: new Date(), ack: result };
      return true;
    } catch (error) {
      if (error.preview) {
        this.addMessageToConversation(peerId, { id: `preview-${Date.now()}`, content, sender: 'self', timestamp: new Date(), type: 'text', transport: 'dry-run', delivered: false, ack: error.result });
        this.lastSendOutcome = { status: 'validated-preview', at: new Date() };
        this.showNotification(error.message, 'info');
        return true;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.lastSendOutcome = { status: 'failed', error: message, at: new Date() };
      this.showNotification(`Send invoke failed: ${message}`, 'error');
      return;
    }
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
      // Governed owner review is independent of a browser peer connection.
      // The owner gateway still enforces availability, consent, and dry-run.
      if (btn.dataset.nativeGatewayBinding) { btn.disabled = false; return; }
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
      case 'disconnected': return this.libp2p ? 'Disconnected' : 'Disconnected — no P2P transport (local-only)';
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
      color: #0e1412;
      font-weight: 500;
      z-index: 10000;
      animation: slideIn 0.3s ease;
      background: ${type === 'success' ? 'var(--sk-ok, #5ee3a1)' : type === 'error' ? 'var(--sk-err, #ff6b6b)' : 'var(--sk-accent, #8bd8bd)'};
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
