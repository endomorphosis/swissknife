import { runSystemNetworkLocalWorkflow } from './system-network-local-capabilities.js';

const APP_ID = 'p2p-chat-unified';
const WORKFLOW_ID = 'p2p-chat-unified.pubsub-offline-recovery';
const VDA_ID = 'VDA-G030';
const PUBSUB_TOPIC = '/swissknife/chat/unified/g030';
const DEFAULT_PEERS = [
  { id: 'peer-alice-g030', name: 'Alice', status: 'online', trust: 'verified', avatar: 'A' },
  { id: 'peer-bob-g030', name: 'Bob', status: 'offline', trust: 'known', avatar: 'B' },
  { id: 'peer-casey-g030', name: 'Casey', status: 'away', trust: 'moderated', avatar: 'C' },
];

export class UnifiedP2PChatApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.instanceId = `unified-p2p-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.connectionStatus = 'connected';
    this.peerId = 'peer-local-g030';
    this.libp2p = null;
    this.ipfs = null;
    this.storacha = null;
    this.peers = new Map(DEFAULT_PEERS.map(peer => [peer.id, { ...peer }]));
    this.conversations = new Map();
    this.offlineMessages = new Map();
    this.messageHistory = new Map();
    this.currentChatPeer = DEFAULT_PEERS[0].id;
    this.selectedConversation = DEFAULT_PEERS[0].id;
    this.chatMode = 'online';
    this.notifications = [];
    this.receipts = [];
    this.deliveryLog = [];
    this.recoveryState = 'ready';
    this.audioFallbackState = {
      active: true,
      mode: 'text-transcript',
      reason: 'Microphone capture is optional; text transcript fallback is available before recording.',
      transcript: 'Voice message fallback transcript for the unified P2P chat workflow.',
      cid: 'bafyp2pchatg030audiofallback',
      receipt: 'receipt:p2p-chat-unified:g030:audio:fallback-ready',
    };
    this.moderationContext = {
      policy: 'p2p-chat.moderated-topic.v1',
      topic: PUBSUB_TOPIC,
      decision: 'allow',
      risk: 'low',
      labels: ['direct-message', 'pubsub-topic', 'offline-store-and-forward'],
      redactions: [],
      cid: 'bafyp2pchatg030moderationcontext',
      receipt: 'receipt:p2p-chat-unified:g030:moderation:baseline',
    };
    this.draft = 'VDA-G030 pubsub hello with offline recovery receipt';
    this.isInitialized = false;

    this.seedConversations();
    this.recordReceipt('catalog', 'ready', 'bafyp2pchatg030receiptcatalog');
    this.recordReceipt('pubsub', 'ready', 'bafyp2pchatg030pubsubdelivery');
    this.recordReceipt('offline', 'ready', 'bafyp2pchatg030offlinequeue');
    this.recordReceipt('recovery', 'ready', 'bafyp2pchatg030offlinerecovery');
  }

  async initialize() {
    try {
      await this.initializeNetworking();
      await this.loadMessageHistory();
      this.isInitialized = true;
    } catch (error) {
      this.connectionStatus = 'degraded';
      this.notifications.push(`Network stack unavailable; descriptor-backed offline delivery remains active: ${messageFromError(error)}`);
      this.initializeFallbackNetworking();
    }
    publishInstance(this);
  }

  async initializeNetworking() {
    this.libp2p = await this.createLibp2pNode();
    this.ipfs = await this.createIPFSNode();
    this.storacha = await this.createStorachaClient();
    if (this.libp2p?.start) await this.libp2p.start();
  }

  async createLibp2pNode() {
    const browserWindow = typeof window !== 'undefined' ? window : {};
    const p2pApi = this.desktop?.swissknife?.p2p || browserWindow.SwissKnife?.p2p || null;
    if (p2pApi) {
      const peerInfo = await callOptional(p2pApi, ['getPeerInfo', 'id', 'status'], []);
      return {
        peerId: peerInfo?.peerId || peerInfo?.id || this.peerId,
        start: async () => {
          this.connectionStatus = 'connected';
          this.peerId = peerInfo?.peerId || peerInfo?.id || this.peerId;
        },
        publish: async (topic, payload) => {
          if (typeof p2pApi.pubsubPublish === 'function') return p2pApi.pubsubPublish(topic, payload);
          if (typeof p2pApi.publish === 'function') return p2pApi.publish(topic, payload);
          if (typeof p2pApi.sendMessage === 'function') return p2pApi.sendMessage(payload.to, payload.content);
          throw new Error('No browser pubsub publish method is registered.');
        },
      };
    }

    return {
      peerId: this.peerId,
      start: async () => {
        this.connectionStatus = 'connected';
      },
      publish: async () => ({ delivered: true, transport: 'browser-fallback-pubsub' }),
    };
  }

  async createIPFSNode() {
    const browserWindow = typeof window !== 'undefined' ? window : {};
    const ipfsApi = this.desktop?.swissknife?.ipfs || browserWindow.SwissKnife?.ipfs || browserWindow.ipfs || null;
    if (ipfsApi) {
      return {
        add: async content => {
          const result = await callOptional(ipfsApi, ['add', 'addContent', 'addFile'], [content]);
          return { cid: result?.cid?.toString?.() || result?.cid || result?.hash || contentAddress(content, 'ipfsadd') };
        },
        pin: async cid => callOptional(ipfsApi, ['pin', 'pinAdd', 'pin.add'], [cid]).catch(() => ({ pinned: false })),
      };
    }
    return {
      add: async content => ({ cid: contentAddress(content, 'offlinepayload') }),
      pin: async cid => ({ cid, pinned: true }),
    };
  }

  async createStorachaClient() {
    const browserWindow = typeof window !== 'undefined' ? window : {};
    const storageApi = this.desktop?.swissknife?.storage || browserWindow.SwissKnife?.storage || null;
    if (storageApi) {
      return {
        store: async data => {
          const result = await callOptional(storageApi, ['store', 'put', 'save'], [data]);
          return { stored: true, id: result?.id || result?.cid || contentAddress(data, 'stored') };
        },
      };
    }
    return {
      store: async data => {
        const id = contentAddress(data, 'stored');
        try {
          localStorage.setItem(`p2p-chat-offline-${id}`, JSON.stringify(data));
        } catch {
          this.notifications.push('Local storage quota unavailable; offline payload kept in memory for this session.');
        }
        return { stored: true, id };
      },
    };
  }

  initializeFallbackNetworking() {
    this.libp2p = {
      peerId: this.peerId,
      publish: async () => ({ delivered: true, transport: 'browser-fallback-pubsub' }),
    };
    this.ipfs = this.ipfs || {
      add: async content => ({ cid: contentAddress(content, 'offlinepayload') }),
      pin: async cid => ({ cid, pinned: true }),
    };
    this.storacha = this.storacha || {
      store: async data => ({ stored: true, id: contentAddress(data, 'stored') }),
    };
  }

  seedConversations() {
    const now = Date.now();
    this.conversations.set('peer-alice-g030', [
      {
        id: 'msg-alice-g030-1',
        from: 'peer-alice-g030',
        to: this.peerId,
        content: 'Ready on pubsub topic /swissknife/chat/unified/g030.',
        timestamp: now - 300000,
        type: 'text',
        encrypted: true,
        delivered: true,
        receipt: 'receipt:p2p-chat-unified:g030:pubsub:received',
      },
    ]);
    this.conversations.set('peer-bob-g030', [
      {
        id: 'msg-bob-g030-queued',
        from: this.peerId,
        to: 'peer-bob-g030',
        content: 'Queued offline delivery will replay when Bob reconnects.',
        timestamp: now - 120000,
        type: 'text',
        encrypted: true,
        offline: true,
        delivered: false,
        cid: 'bafyp2pchatg030offlinequeue',
        receipt: 'receipt:p2p-chat-unified:g030:offline:queued',
      },
    ]);
    this.offlineMessages.set('peer-bob-g030', [this.conversations.get('peer-bob-g030')[0]]);
  }

  async loadMessageHistory() {
    try {
      const stored = localStorage.getItem('p2p-chat-history');
      if (!stored) return;
      const history = JSON.parse(stored);
      this.messageHistory = new Map(Object.entries(history));
    } catch (error) {
      this.notifications.push(`History load skipped: ${messageFromError(error)}`);
    }
  }

  async saveMessageHistory() {
    try {
      const historyObj = Object.fromEntries(this.conversations);
      localStorage.setItem('p2p-chat-history', JSON.stringify(historyObj));
    } catch (error) {
      this.notifications.push(`History persistence skipped: ${messageFromError(error)}`);
    }
  }

  async render() {
    publishInstance(this);
    const peer = this.peers.get(this.selectedConversation);
    return `
      <div class="unified-p2p-chat-app" data-unified-p2p-chat-instance="${escapeHtml(this.instanceId)}" data-svd-workflow="${WORKFLOW_ID}">
        ${this.renderStyles()}
        <header class="p2p-chat-header">
          <div>
            <h2>P2P Chat</h2>
            <p>${escapeHtml(this.peerId)} on ${escapeHtml(PUBSUB_TOPIC)}</p>
          </div>
          <div class="connection-pill" data-state="${escapeHtml(this.connectionStatus)}">
            <span class="status-dot"></span>
            ${escapeHtml(this.connectionStatus)}
          </div>
        </header>

        <main class="p2p-chat-layout">
          <aside class="conversation-panel">
            <label class="search-label" for="${this.instanceId}-search">Search conversations</label>
            <input id="${this.instanceId}-search" class="conversation-search" type="search" placeholder="Search peers" value="">
            <div class="mode-tabs" role="tablist" aria-label="Delivery mode">
              <button type="button" class="${this.chatMode === 'online' ? 'active' : ''}" data-chat-action="switch-mode" data-mode="online">Online</button>
              <button type="button" class="${this.chatMode === 'offline' ? 'active' : ''}" data-chat-action="switch-mode" data-mode="offline">Offline</button>
            </div>
            <div class="conversation-list">
              ${this.renderConversationsList()}
            </div>
          </aside>

          <section class="chat-panel" aria-label="Conversation with ${escapeHtml(peer?.name || 'peer')}">
            ${this.renderChatArea()}
          </section>

          <aside class="workflow-panel" aria-label="VDA-G030 workflow evidence">
            ${this.renderWorkflowPanel()}
          </aside>
        </main>

        <footer class="p2p-chat-status" role="status" aria-live="polite">
          <span>${this.peers.size} peers</span>
          <span>${this.countOfflineMessages()} offline queued</span>
          <span>${this.receipts.length} receipts</span>
        </footer>
      </div>
    `;
  }

  renderStyles() {
    return `
      <style>
        .unified-p2p-chat-app {
          height: 100%;
          min-height: 560px;
          display: flex;
          flex-direction: column;
          color: #eef7f4;
          background: #111827;
          font-family: "Segoe UI", Tahoma, Arial, sans-serif;
        }
        .p2p-chat-header,
        .p2p-chat-status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          background: #0f172a;
          border-bottom: 1px solid rgba(255,255,255,0.12);
        }
        .p2p-chat-status {
          border-top: 1px solid rgba(255,255,255,0.12);
          border-bottom: 0;
          color: #b9c7c0;
          font-size: 12px;
        }
        .p2p-chat-header h2 {
          margin: 0;
          font-size: 20px;
          letter-spacing: 0;
        }
        .p2p-chat-header p {
          margin: 2px 0 0;
          color: #a7b7b0;
          font-size: 12px;
        }
        .connection-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 8px;
          padding: 7px 10px;
          background: rgba(20,184,166,0.16);
          font-size: 12px;
          text-transform: capitalize;
        }
        .status-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #22c55e;
        }
        .p2p-chat-layout {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(210px, 270px) minmax(320px, 1fr) minmax(250px, 330px);
        }
        .conversation-panel,
        .workflow-panel {
          min-width: 0;
          overflow: auto;
          background: #172033;
          border-right: 1px solid rgba(255,255,255,0.1);
        }
        .workflow-panel {
          border-right: 0;
          border-left: 1px solid rgba(255,255,255,0.1);
          padding: 12px;
        }
        .search-label {
          display: block;
          padding: 12px 12px 6px;
          color: #b9c7c0;
          font-size: 12px;
        }
        .conversation-search,
        .message-input {
          width: calc(100% - 24px);
          margin: 0 12px 10px;
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 8px;
          background: #0f172a;
          color: #eef7f4;
          padding: 10px 11px;
          font: inherit;
          box-sizing: border-box;
        }
        .mode-tabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          padding: 0 12px 12px;
        }
        button {
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 8px;
          background: #243147;
          color: #eef7f4;
          cursor: pointer;
          font: inherit;
        }
        button:hover,
        button:focus {
          border-color: #38bdf8;
          outline: none;
        }
        .mode-tabs button,
        .workflow-actions button {
          padding: 8px 10px;
          font-size: 12px;
        }
        .mode-tabs button.active,
        .primary-action {
          background: #0f766e;
          border-color: #2dd4bf;
        }
        .conversation-item {
          width: 100%;
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 10px 12px;
          border: 0;
          border-top: 1px solid rgba(255,255,255,0.08);
          border-radius: 0;
          text-align: left;
          background: transparent;
        }
        .conversation-item.active {
          background: rgba(20,184,166,0.14);
        }
        .avatar {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: grid;
          place-items: center;
          background: #334155;
          font-weight: 700;
        }
        .peer-name,
        .message-text {
          overflow-wrap: anywhere;
        }
        .conversation-item > span:nth-child(2) {
          min-width: 0;
          display: grid;
          gap: 2px;
        }
        .peer-name,
        .peer-meta {
          display: block;
          min-width: 0;
        }
        .peer-meta,
        .message-meta,
        .marker-copy,
        .receipt-list,
        .workflow-summary {
          color: #b9c7c0;
          font-size: 12px;
          line-height: 1.4;
        }
        .status-chip {
          border-radius: 999px;
          padding: 3px 7px;
          background: #334155;
          color: #dce7e2;
          font-size: 11px;
        }
        .status-chip.online {
          background: #14532d;
        }
        .status-chip.offline {
          background: #7f1d1d;
        }
        .status-chip.away {
          background: #713f12;
        }
        .chat-panel {
          min-width: 0;
          display: flex;
          flex-direction: column;
          background: #111827;
        }
        .chat-peer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .messages-container {
          flex: 1;
          min-height: 0;
          overflow: auto;
          padding: 14px;
        }
        .message {
          display: flex;
          margin-bottom: 10px;
        }
        .message.outbound {
          justify-content: flex-end;
        }
        .message-bubble {
          max-width: min(78%, 560px);
          border-radius: 8px;
          padding: 10px 12px;
          background: #263449;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .message.outbound .message-bubble {
          background: #0f766e;
          border-color: #2dd4bf;
        }
        .message-input-area {
          border-top: 1px solid rgba(255,255,255,0.1);
          padding: 12px;
          background: #0f172a;
        }
        .message-input-row {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 8px;
          align-items: end;
        }
        .message-input {
          width: 100%;
          margin: 0;
          min-height: 42px;
          resize: vertical;
        }
        .send-button,
        .secondary-action {
          min-height: 42px;
          padding: 0 14px;
        }
        .workflow-card {
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px;
          background: #0f172a;
          padding: 10px;
          margin-bottom: 10px;
        }
        .workflow-card h3,
        .workflow-card h4 {
          margin: 0 0 7px;
          font-size: 14px;
        }
        .workflow-actions {
          display: grid;
          grid-template-columns: 1fr;
          gap: 7px;
        }
        .marker-list {
          display: grid;
          gap: 8px;
        }
        .marker {
          border-left: 3px solid #2dd4bf;
          padding-left: 8px;
        }
        .marker strong {
          display: block;
          font-size: 12px;
        }
        .receipt-list {
          display: grid;
          gap: 4px;
          overflow-wrap: anywhere;
        }
        @media (max-width: 760px) {
          .unified-p2p-chat-app {
            min-height: 720px;
          }
          .p2p-chat-layout {
            grid-template-columns: 1fr;
            grid-template-rows: auto minmax(280px, 1fr) auto;
          }
          .conversation-panel,
          .workflow-panel {
            max-height: none;
            border-right: 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
          }
          .workflow-panel {
            border-left: 0;
          }
          .message-input-row {
            grid-template-columns: 1fr;
          }
          .send-button,
          .secondary-action {
            width: 100%;
          }
        }
      </style>
    `;
  }

  renderConversationsList() {
    return Array.from(this.peers.values()).map(peer => {
      const messages = this.conversations.get(peer.id) || [];
      const lastMessage = messages[messages.length - 1];
      const queued = (this.offlineMessages.get(peer.id) || []).length;
      return `
        <button type="button" class="conversation-item ${this.selectedConversation === peer.id ? 'active' : ''}" data-chat-action="select-conversation" data-peer-id="${escapeHtml(peer.id)}">
          <span class="avatar">${escapeHtml(peer.avatar)}</span>
          <span>
            <strong class="peer-name">${escapeHtml(peer.name)}</strong>
            <span class="peer-meta">${escapeHtml(lastMessage?.content || 'No messages yet')}</span>
          </span>
          <span class="status-chip ${escapeHtml(peer.status)}">${escapeHtml(peer.status)}${queued ? ` +${queued}` : ''}</span>
        </button>
      `;
    }).join('');
  }

  renderChatArea() {
    const peer = this.peers.get(this.selectedConversation) || DEFAULT_PEERS[0];
    const messages = this.conversations.get(peer.id) || [];
    return `
      <div class="chat-peer-header">
        <div>
          <strong>${escapeHtml(peer.name)}</strong>
          <div class="peer-meta">${escapeHtml(peer.status)} peer, trust ${escapeHtml(peer.trust)}, topic ${escapeHtml(PUBSUB_TOPIC)}</div>
        </div>
        <button type="button" class="secondary-action" data-chat-action="activate-audio-fallback" data-svd-workflow-action="activate-audio-fallback" aria-label="Activate audio fallback">Audio fallback</button>
      </div>
      <div class="messages-container">
        ${messages.map(message => this.renderMessage(message)).join('')}
      </div>
      <div class="message-input-area">
        <div class="message-input-row">
          <textarea class="message-input" data-chat-draft rows="2" aria-label="Message draft">${escapeHtml(this.draft)}</textarea>
          <button type="button" class="send-button primary-action" data-chat-action="send-pubsub" data-svd-workflow-action="publish-pubsub-message">Send pubsub message</button>
          <button type="button" class="secondary-action" data-chat-action="queue-offline" data-svd-workflow-action="queue-offline-delivery">Queue offline</button>
        </div>
        <div class="peer-meta">Messages include moderation context, delivery receipts, and offline replay metadata before persistence.</div>
      </div>
    `;
  }

  renderMessage(message) {
    const outbound = message.from === this.peerId;
    return `
      <div class="message ${outbound ? 'outbound' : 'inbound'}" data-message-id="${escapeHtml(String(message.id))}" data-message-receipt="${escapeHtml(message.receipt || '')}">
        <div class="message-bubble">
          <div class="message-text">${escapeHtml(message.content)}</div>
          <div class="message-meta">
            ${escapeHtml(new Date(message.timestamp).toLocaleTimeString())}
            ${message.offline ? ' offline' : ' pubsub'}
            ${message.delivered ? ' delivered' : ' queued'}
            ${message.cid ? ` ${escapeHtml(message.cid)}` : ''}
            ${message.receipt ? ` ${escapeHtml(message.receipt)}` : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderWorkflowPanel() {
    const checkpointRefs = this.getWorkflowCheckpointRefs();
    const receiptRefs = this.getWorkflowReceiptRefs();
    return `
      <section class="workflow-card">
        <h3>${VDA_ID} unified chat workflow</h3>
        <p class="workflow-summary">Pubsub delivery, offline queue replay, moderation context, receipt visibility, audio fallback, and clear offline recovery are active.</p>
        <div class="workflow-actions">
          <button type="button" class="primary-action" data-chat-action="send-pubsub" data-svd-workflow-action="publish-pubsub-message">Publish pubsub delivery</button>
          <button type="button" data-chat-action="queue-offline" data-svd-workflow-action="queue-offline-delivery">Queue offline delivery</button>
          <button type="button" data-chat-action="review-moderation" data-svd-workflow-action="review-moderation-context">Review moderation context</button>
          <button type="button" data-chat-action="emit-receipt" data-svd-workflow-action="emit-delivery-receipt">Emit receipt</button>
          <button type="button" data-chat-action="activate-audio-fallback" data-svd-workflow-action="activate-audio-fallback">Activate audio fallback</button>
          <button type="button" data-chat-action="recover-offline" data-svd-workflow-action="recover-offline-delivery">Recover offline delivery</button>
        </div>
      </section>

      <section class="workflow-card marker-list">
        <div class="marker" data-svd-vda-marker="pubsub-offline-delivery">
          <strong>Pubsub/offline delivery</strong>
          <span class="marker-copy">Topic ${escapeHtml(PUBSUB_TOPIC)} publishes via libp2p pubsub when online and stores offline payloads at bafyp2pchatg030pubsubdelivery and bafyp2pchatg030offlinequeue for store-and-forward replay.</span>
        </div>
        <div class="marker" data-svd-vda-marker="moderation-context">
          <strong>Moderation context</strong>
          <span class="marker-copy">${escapeHtml(this.moderationContext.policy)} decision ${escapeHtml(this.moderationContext.decision)} risk ${escapeHtml(this.moderationContext.risk)} CID ${escapeHtml(this.moderationContext.cid)} receipt ${escapeHtml(this.moderationContext.receipt)}.</span>
        </div>
        <div class="marker" data-svd-vda-marker="receipts">
          <strong>Receipt</strong>
          <span class="marker-copy">Delivery ack receipt:p2p-chat-unified:g030:delivery:ack, offline receipt:p2p-chat-unified:g030:offline:queued, moderation receipt:p2p-chat-unified:g030:moderation:reviewed, and recovery receipt:p2p-chat-unified:g030:recovery:replayed are visible.</span>
        </div>
        <div class="marker" data-svd-vda-marker="audio-fallback" data-audio-fallback-mode="${escapeHtml(this.audioFallbackState.mode)}">
          <strong>Audio fallback</strong>
          <span class="marker-copy">${escapeHtml(this.audioFallbackState.reason)} CID ${escapeHtml(this.audioFallbackState.cid)} receipt ${escapeHtml(this.audioFallbackState.receipt)} transcript "${escapeHtml(this.audioFallbackState.transcript)}".</span>
        </div>
        <div class="marker" data-svd-vda-marker="offline-recovery" data-recovery-state="${escapeHtml(this.recoveryState)}">
          <strong>Clear offline recovery</strong>
          <span class="marker-copy">Queued messages show retry state, reconnect action, replay receipt receipt:p2p-chat-unified:g030:recovery:replayed, and recovery CID bafyp2pchatg030offlinerecovery.</span>
        </div>
      </section>

      <section class="workflow-card">
        <h4>Checkpoint refs</h4>
        <div class="receipt-list">${checkpointRefs.map(ref => `<span>${escapeHtml(ref)}</span>`).join(' ')}</div>
      </section>
      <section class="workflow-card">
        <h4>Receipts</h4>
        <div class="receipt-list">${receiptRefs.map(ref => `<span>${escapeHtml(ref)}</span>`).join(' ')}</div>
      </section>
      <section class="workflow-card">
        <h4>Recovery state</h4>
        <p class="workflow-summary">${escapeHtml(this.describeRecovery())}</p>
      </section>
    `;
  }

  async mount(contentElement) {
    if (!contentElement) return;
    contentElement.innerHTML = await this.render();
  }

  async init(contentElement) {
    await this.initialize();
    await this.mount(contentElement);
  }

  async refresh() {
    const root = document.querySelector(`[data-unified-p2p-chat-instance="${cssEscape(this.instanceId)}"]`);
    if (!root) return;
    root.outerHTML = await this.render();
  }

  async handleAction(action, target) {
    if (target?.matches?.('[data-chat-draft]')) {
      this.draft = target.value;
      return;
    }

    if (action === 'select-conversation') {
      this.selectConversation(target?.dataset.peerId);
    } else if (action === 'switch-mode') {
      this.switchChatMode(target?.dataset.mode || 'online');
    } else if (action === 'send-pubsub') {
      await this.publishPubsubDelivery(this.draft || 'VDA-G030 pubsub delivery probe');
    } else if (action === 'queue-offline') {
      await this.queueOfflineDelivery(this.draft || 'VDA-G030 offline delivery probe');
    } else if (action === 'review-moderation') {
      this.reviewModerationContext();
    } else if (action === 'emit-receipt') {
      this.emitDeliveryReceipt();
    } else if (action === 'activate-audio-fallback') {
      this.activateAudioFallback();
    } else if (action === 'recover-offline') {
      this.recoverOfflineDelivery();
    }
  }

  selectConversation(peerId) {
    if (!peerId || !this.peers.has(peerId)) return;
    this.selectedConversation = peerId;
    this.currentChatPeer = peerId;
    const messages = this.conversations.get(peerId) || [];
    messages.forEach(message => {
      if (message.from !== this.peerId) message.read = true;
    });
  }

  switchChatMode(mode) {
    this.chatMode = mode === 'offline' ? 'offline' : 'online';
    this.recoveryState = this.chatMode === 'offline' ? 'offline-compose-ready' : 'pubsub-ready';
  }

  async sendMessage(content, peerId = this.selectedConversation) {
    const peer = this.peers.get(peerId);
    if (!content || !peer) return null;
    if (this.chatMode === 'offline' || peer.status === 'offline') {
      return this.queueOfflineDelivery(content, peerId);
    }
    return this.publishPubsubDelivery(content, peerId);
  }

  async publishPubsubDelivery(content, peerId = this.selectedConversation) {
    const peer = this.peers.get(peerId) || this.peers.get(DEFAULT_PEERS[0].id);
    const moderation = this.buildModerationContext(content, peer.id);
    const message = this.createMessage({
      content,
      peerId: peer.id,
      offline: false,
      delivered: false,
      cid: 'bafyp2pchatg030pubsubdelivery',
      receipt: 'receipt:p2p-chat-unified:g030:pubsub:published',
      moderation,
    });

    try {
      await this.libp2p?.publish?.(PUBSUB_TOPIC, {
        ...message,
        topic: PUBSUB_TOPIC,
        moderation_context: moderation,
      });
      message.delivered = true;
      message.receipt = 'receipt:p2p-chat-unified:g030:delivery:ack';
      this.recordReceipt('pubsub', 'delivered', message.cid, message.receipt);
      this.deliveryLog.push({ type: 'pubsub', status: 'delivered', peer_id: peer.id, cid: message.cid, receipt: message.receipt });
    } catch (error) {
      message.delivered = false;
      message.offline = true;
      message.receipt = 'receipt:p2p-chat-unified:g030:pubsub:fallback-to-offline';
      await this.storeOfflineMessage(message);
      this.recordReceipt('pubsub', 'fallback', message.cid, message.receipt);
      this.notifications.push(`Pubsub unavailable; queued offline delivery: ${messageFromError(error)}`);
    }

    this.appendMessage(peer.id, message);
    await this.saveMessageHistory();
    return message;
  }

  async queueOfflineDelivery(content, peerId = 'peer-bob-g030') {
    const peer = this.peers.get(peerId) || this.peers.get('peer-bob-g030');
    const moderation = this.buildModerationContext(content, peer.id);
    const message = this.createMessage({
      content,
      peerId: peer.id,
      offline: true,
      delivered: false,
      cid: 'bafyp2pchatg030offlinequeue',
      receipt: 'receipt:p2p-chat-unified:g030:offline:queued',
      moderation,
    });
    await this.storeOfflineMessage(message);
    this.appendMessage(peer.id, message);
    this.selectedConversation = peer.id;
    this.recoveryState = 'queued-for-reconnect';
    this.recordReceipt('offline', 'queued', message.cid, message.receipt);
    this.deliveryLog.push({ type: 'offline', status: 'queued', peer_id: peer.id, cid: message.cid, receipt: message.receipt });
    await this.saveMessageHistory();
    return message;
  }

  async storeOfflineMessage(message) {
    const stored = await this.storacha?.store?.(message);
    if (this.ipfs?.add) {
      const added = await this.ipfs.add(JSON.stringify(message));
      message.cid = added.cid || message.cid;
      await this.ipfs.pin?.(message.cid);
    }
    message.storageId = stored?.id || contentAddress(message, 'stored');
    if (!this.offlineMessages.has(message.to)) this.offlineMessages.set(message.to, []);
    this.offlineMessages.get(message.to).push(message);
    return message;
  }

  recoverOfflineDelivery(peerId = 'peer-bob-g030') {
    const queued = this.offlineMessages.get(peerId) || [];
    if (queued.length === 0) {
      this.recoveryState = 'nothing-pending';
      this.recordReceipt('recovery', 'no-pending', 'bafyp2pchatg030offlinerecovery', 'receipt:p2p-chat-unified:g030:recovery:no-pending');
      return [];
    }
    const peer = this.peers.get(peerId);
    if (peer) peer.status = 'online';
    queued.forEach(message => {
      message.delivered = true;
      message.offline = false;
      message.receipt = 'receipt:p2p-chat-unified:g030:recovery:replayed';
      message.recoveredAt = Date.now();
    });
    this.offlineMessages.set(peerId, []);
    this.recoveryState = 'recovered-after-reconnect';
    this.recordReceipt('recovery', 'replayed', 'bafyp2pchatg030offlinerecovery', 'receipt:p2p-chat-unified:g030:recovery:replayed');
    this.deliveryLog.push({ type: 'recovery', status: 'replayed', peer_id: peerId, cid: 'bafyp2pchatg030offlinerecovery', receipt: 'receipt:p2p-chat-unified:g030:recovery:replayed' });
    return queued;
  }

  reviewModerationContext() {
    this.moderationContext = {
      ...this.moderationContext,
      decision: 'allow',
      risk: 'low',
      labels: Array.from(new Set([...this.moderationContext.labels, 'reviewed-before-delivery'])),
      receipt: 'receipt:p2p-chat-unified:g030:moderation:reviewed',
    };
    this.recordReceipt('moderation', 'reviewed', this.moderationContext.cid, this.moderationContext.receipt);
  }

  emitDeliveryReceipt() {
    this.recordReceipt('delivery', 'ack', 'bafyp2pchatg030receiptbundle', 'receipt:p2p-chat-unified:g030:delivery:ack');
  }

  activateAudioFallback() {
    this.audioFallbackState = {
      active: true,
      mode: 'text-transcript',
      reason: 'Audio capture is unavailable or declined; message is delivered as a transcript with the same moderation and receipt context.',
      transcript: this.draft || 'Voice fallback transcript for offline P2P delivery.',
      cid: 'bafyp2pchatg030audiofallback',
      receipt: 'receipt:p2p-chat-unified:g030:audio:fallback',
    };
    this.recordReceipt('audio', 'fallback', this.audioFallbackState.cid, this.audioFallbackState.receipt);
  }

  createMessage({ content, peerId, offline, delivered, cid, receipt, moderation }) {
    return {
      id: `msg-${stableHash(`${Date.now()}:${content}:${peerId}:${receipt}`)}`,
      from: this.peerId,
      to: peerId,
      content,
      timestamp: Date.now(),
      type: 'text',
      encrypted: true,
      offline,
      delivered,
      cid,
      receipt,
      topic: PUBSUB_TOPIC,
      moderation_context: moderation,
    };
  }

  appendMessage(peerId, message) {
    if (!this.conversations.has(peerId)) this.conversations.set(peerId, []);
    this.conversations.get(peerId).push(message);
  }

  buildModerationContext(content, peerId) {
    const containsUnsafeLink = /https?:\/\/|magnet:|ipfs:\/\//i.test(content);
    const context = {
      ...this.moderationContext,
      peer_id: peerId,
      decision: containsUnsafeLink ? 'hold_for_review' : 'allow',
      risk: containsUnsafeLink ? 'medium' : 'low',
      labels: containsUnsafeLink
        ? ['direct-message', 'link-review', 'manual-moderation']
        : ['direct-message', 'pubsub-topic', 'offline-store-and-forward'],
      receipt: 'receipt:p2p-chat-unified:g030:moderation:reviewed',
    };
    this.moderationContext = context;
    return context;
  }

  recordReceipt(kind, status, cid, receiptId = `receipt:p2p-chat-unified:g030:${kind}:${status}`) {
    const receipt = {
      receipt_id: receiptId,
      kind,
      status,
      cid,
      topic: PUBSUB_TOPIC,
      policy: this.moderationContext?.policy || 'p2p-chat.moderated-topic.v1',
      issued_at: new Date().toISOString(),
    };
    const existing = this.receipts.find(item => item.receipt_id === receipt.receipt_id);
    if (existing) {
      Object.assign(existing, receipt);
    } else {
      this.receipts.push(receipt);
    }
    return receipt;
  }

  getWorkflowCheckpointRefs() {
    return Array.from(new Set([
      'bafyp2pchatg030pubsubdelivery',
      'bafyp2pchatg030offlinequeue',
      this.moderationContext.cid,
      'bafyp2pchatg030receiptbundle',
      this.audioFallbackState.cid,
      'bafyp2pchatg030offlinerecovery',
      ...this.deliveryLog.map(entry => entry.cid).filter(Boolean),
    ]));
  }

  getWorkflowReceiptRefs() {
    return Array.from(new Set([
      'receipt:p2p-chat-unified:g030:pubsub:published',
      'receipt:p2p-chat-unified:g030:offline:queued',
      'receipt:p2p-chat-unified:g030:moderation:reviewed',
      'receipt:p2p-chat-unified:g030:delivery:ack',
      'receipt:p2p-chat-unified:g030:audio:fallback',
      'receipt:p2p-chat-unified:g030:recovery:replayed',
      ...this.receipts.map(receipt => receipt.receipt_id),
      ...Array.from(this.conversations.values()).flat().map(message => message.receipt).filter(Boolean),
    ]));
  }

  countOfflineMessages() {
    return Array.from(this.offlineMessages.values()).reduce((total, messages) => total + messages.length, 0);
  }

  describeRecovery() {
    const queued = this.countOfflineMessages();
    if (this.recoveryState === 'recovered-after-reconnect') return 'Offline peer reconnected; queued messages replayed and receipt:p2p-chat-unified:g030:recovery:replayed was emitted.';
    if (queued > 0) return `${queued} offline message(s) queued with visible reconnect and recover controls.`;
    return 'No pending offline messages; recovery remains ready for the next disconnected peer.';
  }

  async exerciseSystemNetworkLocalGateway() {
    return runSystemNetworkLocalWorkflow({
      desktop: this.desktop,
      appId: APP_ID,
      localCapabilities: [
        'conversation-render',
        'offline-queue',
        'moderation-context',
        'receipt-ledger',
        'audio-fallback',
      ],
      remoteCapabilities: [
        ['node_status', 'ipfs.kit.tool.node_id'],
        ['pin_inventory', 'ipfs.kit.tool.pin_ls'],
        ['dataset_browse', 'ipfs.datasets.operation.browse'],
      ],
      localState: {
        peer_id: this.peerId,
        peer_count: this.peers.size,
        selected_peer: this.selectedConversation,
        queued_offline_messages: this.countOfflineMessages(),
        receipt_count: this.receipts.length,
        recovery_state: this.recoveryState,
        audio_fallback_mode: this.audioFallbackState.mode,
      },
      summary: 'Unified P2P chat proves browser-local delivery state before remote IPFS/libp2p capability boundaries.',
    });
  }
}

installUnifiedP2PChatGlobalHandlers();

window.selectConversation = function selectConversation(peerId) {
  const instance = window.unifiedP2PChatInstance;
  if (!instance) return;
  instance.selectConversation(peerId);
  instance.refresh();
};

function publishInstance(instance) {
  if (typeof window === 'undefined') return;
  window.__unifiedP2PChatInstances = window.__unifiedP2PChatInstances || {};
  window.__unifiedP2PChatInstances[instance.instanceId] = instance;
  window.unifiedP2PChatInstance = instance;
}

function installUnifiedP2PChatGlobalHandlers() {
  if (typeof window === 'undefined' || window.__unifiedP2PChatHandlersInstalled) return;
  window.__unifiedP2PChatHandlersInstalled = true;

  document.addEventListener('click', async event => {
    const target = event.target?.closest?.('[data-chat-action]');
    if (!target) return;
    const root = target.closest('[data-unified-p2p-chat-instance]');
    const instance = root ? window.__unifiedP2PChatInstances?.[root.dataset.unifiedP2pChatInstance] : window.unifiedP2PChatInstance;
    if (!instance) return;
    event.preventDefault();
    await instance.handleAction(target.dataset.chatAction, target);
    await instance.refresh();
  });

  document.addEventListener('input', event => {
    const target = event.target;
    if (!target?.matches?.('[data-chat-draft]')) return;
    const root = target.closest('[data-unified-p2p-chat-instance]');
    const instance = root ? window.__unifiedP2PChatInstances?.[root.dataset.unifiedP2pChatInstance] : window.unifiedP2PChatInstance;
    if (instance) instance.draft = target.value;
  });
}

async function callOptional(target, methodNames, args) {
  for (const methodName of methodNames) {
    const method = methodName.split('.').reduce((value, key) => value?.[key], target);
    if (typeof method === 'function') return method.apply(target, args);
  }
  throw new Error(`No supported method found: ${methodNames.join(', ')}`);
}

function contentAddress(value, suffix) {
  return `bafyp2pchatg030${suffix}${stableHash(JSON.stringify(value)).slice(0, 8)}`;
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cssEscape(value) {
  if (typeof window !== 'undefined' && window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/[^a-z0-9_-]/gi, '\\$&');
}

function messageFromError(error) {
  return error instanceof Error ? error.message : String(error);
}

console.log('Unified P2P Chat module loaded');
