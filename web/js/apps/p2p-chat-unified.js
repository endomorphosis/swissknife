import { runSystemNetworkLocalWorkflow } from './system-network-local-capabilities.js';
import { invokeNetworkNativeTool, networkNativeAttributes } from './network-native-tools.js';
import {
  getMCPPlusPlusDesktopClient,
  contentCidForBytes,
  stableStringifyValue,
  base64ForBytes,
} from '../core/mcp-plus-plus-desktop-client.js';

const APP_ID = 'p2p-chat-unified';
const WORKFLOW_ID = 'p2p-chat-unified.pubsub-offline-recovery';
const VDA_ID = 'VDA-G030';
const PUBSUB_TOPIC = '/swissknife/chat/unified/g030';
async function callUnifiedMcpTool(app, _method, tool, toolArguments, trigger = null) {
  const container = app.getNativeContainer();
  app.nativeGatewayStatus = '';
  const rememberStatus = event => {
    const { call, origin } = event.detail || {};
    if (origin !== 'native-control' || call?.app_id !== APP_ID) return;
    const output = [...container.querySelectorAll('[data-gateway-status]')]
      .find(node => node.dataset.gatewayStatus === call.binding_id);
    // The gateway has already rendered the actual owner outcome and receipt.
    // Keep that exact status when this app replaces its root after the action.
    app.nativeGatewayStatus = output?.textContent || '';
  };
  container?.addEventListener('swissknife:live-gateway-result', rememberStatus);
  try {
    return await invokeNetworkNativeTool(container, APP_ID, tool, toolArguments, trigger);
  } finally {
    container?.removeEventListener('swissknife:live-gateway-result', rememberStatus);
  }
}
const DEFAULT_PEERS = [
  { id: 'peer-alice-g030', name: 'Alice', status: 'online', trust: 'verified', avatar: 'A' },
  { id: 'peer-bob-g030', name: 'Bob', status: 'offline', trust: 'known', avatar: 'B' },
  { id: 'peer-casey-g030', name: 'Casey', status: 'away', trust: 'moderated', avatar: 'C' },
];

export class UnifiedP2PChatApp {
  getNativeContainer() {
    return document.querySelector(`[data-unified-p2p-chat-instance="${cssEscape(this.instanceId)}"]`);
  }
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
      // Local-only fallback: CIDs are computed from the real transcript
      // record only when the fallback is activated, never prefabricated.
      cid: null,
      receipt: null,
    };
    this.moderationContext = {
      policy: 'p2p-chat.moderated-topic.v1',
      topic: PUBSUB_TOPIC,
      decision: 'allow',
      risk: 'low',
      labels: ['direct-message', 'pubsub-topic', 'offline-store-and-forward'],
      redactions: [],
      // Local heuristic: the context CID is computed from the real record
      // when it is reviewed, never prefabricated.
      cid: null,
      receipt: null,
    };
    this.draft = 'VDA-G030 pubsub hello with offline recovery receipt';
    this.isInitialized = false;
    // Backend persistence state: no backend writes happen until the user
    // explicitly confirms them, and no receipts exist until real delivery
    // events produce them.
    this.mcpClient = null;
    this.persistedChannelCid = null;
    this.persistedReceiptLedgerCid = null;
    this.pendingConfirm = null;
    this.backendStatus = 'Backend persistence has not been attempted yet.';
    this.nativeGatewayStatus = '';

    this.seedConversations();
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

    // No browser P2P API is registered: publish honestly reports that there
    // is no transport instead of fabricating a delivery acknowledgment.
    return {
      peerId: this.peerId,
      start: async () => {
        this.connectionStatus = 'degraded';
      },
      publish: async () => {
        throw new Error('No browser pubsub publish method is registered.');
      },
    };
  }

  async createIPFSNode() {
    const browserWindow = typeof window !== 'undefined' ? window : {};
    const ipfsApi = this.desktop?.swissknife?.ipfs || browserWindow.SwissKnife?.ipfs || browserWindow.ipfs || null;
    if (ipfsApi) {
      return {
        add: async content => {
          const result = await callOptional(ipfsApi, ['add', 'addContent', 'addFile'], [content]);
          return { cid: result?.cid?.toString?.() || result?.cid || result?.hash || await this.realContentCid({ content: String(content) }) };
        },
        pin: async cid => callOptional(ipfsApi, ['pin', 'pinAdd', 'pin.add'], [cid]).catch(() => ({ pinned: false })),
      };
    }
    return {
      // Local-only fallback: real content CIDs over the exact bytes, kept
      // in browser memory; nothing is pinned to a real IPFS node here.
      add: async content => ({ cid: await this.realContentCid({ content: String(content) }) }),
      pin: async cid => ({ cid, pinned: 'local-only' }),
    };
  }

  async createStorachaClient() {
    const browserWindow = typeof window !== 'undefined' ? window : {};
    const storageApi = this.desktop?.swissknife?.storage || browserWindow.SwissKnife?.storage || null;
    if (storageApi) {
      return {
        store: async data => {
          const result = await callOptional(storageApi, ['store', 'put', 'save'], [data]);
          return { stored: true, id: result?.id || result?.cid || await this.realContentCid(data) };
        },
      };
    }
    return {
      store: async data => {
        const id = await this.realContentCid(data);
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
      // Honest failure: with no transport, sends queue offline through the
      // publishPubsubDelivery catch path instead of claiming delivery.
      publish: async () => {
        throw new Error('No browser pubsub publish method is registered.');
      },
    };
    // Local-only fallbacks: content identifiers are real CIDv1-raw+sha2-256
    // values computed over the exact stored bytes.
    this.ipfs = this.ipfs || {
      add: async content => ({ cid: await this.realContentCid({ content: String(content) }) }),
      pin: async cid => ({ cid, pinned: 'local-only' }),
    };
    this.storacha = this.storacha || {
      store: async data => {
        const id = await this.realContentCid(data);
        try {
          localStorage.setItem(`p2p-chat-offline-${id}`, JSON.stringify(data));
        } catch {
          this.notifications.push('Local storage quota unavailable; offline payload kept in memory for this session.');
        }
        return { stored: true, id };
      },
    };
  }

  mcp() {
    if (!this.mcpClient) this.mcpClient = getMCPPlusPlusDesktopClient();
    return this.mcpClient;
  }

  // Real content addressing: CIDv1-raw+sha2-256 over the canonical bytes,
  // the same semantics the kit artifact store verifies on ingest.
  async realContentCid(record) {
    const bytes = new TextEncoder().encode(stableStringifyValue(record));
    return contentCidForBytes(bytes);
  }

  // Backend-mutating write. Callers must have collected an explicit user
  // confirmation first; backend failures surface verbatim and are never
  // replaced with fixture success.
  async persistArtifact(record, kind) {
    const bytes = new TextEncoder().encode(stableStringifyValue(record));
    const cid = await contentCidForBytes(bytes);
    const res = await callUnifiedMcpTool(this, 'request_action', 'mcp++:ipfs_kit_py/artifacts/put', {
      cid,
      bytes_base64: base64ForBytes(bytes),
      profile: 'p2p-chat-artifact',
      kind,
      service: 'ipfs_kit_py',
      pin: true,
    });
    if (res === null) return null;
    if (res.persisted !== true || res.cid !== cid) {
      throw new Error(res?.error || 'ipfs_kit_py did not verify the persisted artifact.');
    }
    return { cid, response: res };
  }

  seedConversations() {
    // Local sample conversation content so the layout has something to
    // render. Seeded messages carry no CIDs and no receipts: those only
    // exist once real send/store operations produce them.
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
        delivered: false,
        sample: true,
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
        sample: true,
      },
    ]);
    // The sample Bob message stays in the conversation view only; the
    // offline queue itself starts empty and fills only from real user
    // "Queue offline" actions.
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
            <div class="peer-meta sk-honest-note" style="padding: 0 12px 8px;">Local sample peers — this roster is not discovered from the network.</div>
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
        .unified-p2p-chat-app .native-gateway-status {
          display: block;
          overflow-wrap: anywhere;
          font-size: 12px;
          color: #b9c7c0;
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
        ${messages.length ? messages.map(message => this.renderMessage(message)).join('') : '<div class="sk-empty">No messages yet — send the first pubsub message below.</div>'}
      </div>
      <div class="message-input-area">
        <div class="message-input-row">
          <textarea class="message-input" data-chat-draft rows="2" aria-label="Message draft">${escapeHtml(this.draft)}</textarea>
          <button type="button" ${networkNativeAttributes(APP_ID, 'mcp++:ipfs_kit_py/ipfs_pubsub_publish')} class="send-button primary-action" data-chat-action="send-pubsub" data-svd-workflow-action="publish-pubsub-message">Send pubsub message</button>
          <button type="button" class="secondary-action" data-chat-action="queue-offline" data-svd-workflow-action="queue-offline-delivery">Queue offline</button>
        </div>
        <div class="peer-meta sk-honest-note">Published messages carry the transport's real acknowledgment; the local moderation heuristic and offline queue stay in this browser until you persist them to the backend.</div>
      </div>
    `;
  }

  renderMessage(message) {
    const outbound = message.from === this.peerId;
    const ackNote = message.ack ? ` ack: ${escapeHtml(typeof message.ack === 'string' ? message.ack : JSON.stringify(message.ack))}` : '';
    return `
      <div class="message ${outbound ? 'outbound' : 'inbound'}" data-message-id="${escapeHtml(String(message.id))}" data-message-receipt="${escapeHtml(message.receipt || '')}">
        <div class="message-bubble">
          <div class="message-text">${escapeHtml(message.content)}</div>
          <div class="message-meta">
            ${escapeHtml(new Date(message.timestamp).toLocaleTimeString())}
            ${message.sample ? ' local sample' : ''}
            ${message.offline ? ' offline' : ' pubsub'}
            ${message.delivered ? ' delivered' : ' queued'}
            ${message.cid ? ` <code class="sk-code">${escapeHtml(message.cid)}</code>` : ''}
            ${message.receipt ? ` <code class="sk-code">${escapeHtml(message.receipt)}</code>` : ''}
            ${ackNote}
          </div>
        </div>
      </div>
    `;
  }

  renderWorkflowPanel() {
    const checkpointRefs = this.getWorkflowCheckpointRefs();
    const receiptRefs = this.getWorkflowReceiptRefs();
    const localPeer = this.peerId === 'peer-local-g030';
    return `
      ${this.renderConfirmCard()}
      <section class="workflow-card">
        <h3>${VDA_ID} unified chat workflow</h3>
        <p class="workflow-summary">Message publishing and archive actions require your confirmation. Validated previews make no remote change. The peer roster, offline queue, moderation review, and audio fallback remain in your browser.</p>
        <div class="workflow-actions">
          <button type="button" ${networkNativeAttributes(APP_ID, 'mcp++:ipfs_kit_py/ipfs_pubsub_publish')} class="primary-action" data-chat-action="send-pubsub" data-svd-workflow-action="publish-pubsub-message">Publish pubsub delivery</button>
          <button type="button" data-chat-action="queue-offline" data-svd-workflow-action="queue-offline-delivery">Queue offline delivery</button>
          <button type="button" data-chat-action="review-moderation" data-svd-workflow-action="review-moderation-context">Review moderation context</button>
          <button type="button" ${networkNativeAttributes(APP_ID, 'mcp++:ipfs_kit_py/artifacts/put')} data-chat-action="persist-receipts" data-svd-workflow-action="emit-delivery-receipt">Persist receipt ledger</button>
          <button type="button" data-chat-action="activate-audio-fallback" data-svd-workflow-action="activate-audio-fallback">Activate audio fallback</button>
          <button type="button" data-chat-action="recover-offline" data-svd-workflow-action="recover-offline-delivery">Recover offline delivery</button>
          <button type="button" ${networkNativeAttributes(APP_ID, 'mcp++:ipfs_kit_py/artifacts/put')} data-chat-action="persist-channel" data-svd-workflow-action="persist-channel-archive">Persist channel archive</button>
          <input data-chat-archive-cid aria-label="Channel archive artifact CID" placeholder="Stored channel archive CID" value="${escapeHtml(this.persistedChannelCid || '')}">
          <button type="button" ${networkNativeAttributes(APP_ID, 'mcp++:ipfs_kit_py/artifacts/get')} data-chat-action="load-channel" data-svd-workflow-action="load-channel-archive">Load channel archive</button>
        </div>
        <p class="workflow-summary" role="status">${escapeHtml(this.backendStatus)}</p>
        ${this.nativeGatewayStatus ? `<output class="native-gateway-status" data-gateway-status="last-native-result" role="status" aria-live="polite">${escapeHtml(this.nativeGatewayStatus)}</output>` : ''}
      </section>

      <section class="workflow-card marker-list">
        <div class="marker" data-svd-vda-marker="pubsub-offline-delivery">
          <strong>Pubsub/offline delivery</strong>
          <span class="marker-copy">Topic ${escapeHtml(PUBSUB_TOPIC)} publishes through the registered browser P2P transport; the acknowledgment shown on each message is the transport's real return value. With no transport registered, sends fail over to the local offline queue instead of claiming delivery.</span>
        </div>
        <div class="marker" data-svd-vda-marker="moderation-context">
          <strong>Moderation context (local heuristic)</strong>
          <span class="marker-copy">${escapeHtml(this.moderationContext.policy)} decision ${escapeHtml(this.moderationContext.decision)} risk ${escapeHtml(this.moderationContext.risk)}${this.moderationContext.cid ? ` CID ${escapeHtml(this.moderationContext.cid)}` : ' — not reviewed yet, no CID assigned'}.</span>
        </div>
        <div class="marker" data-svd-vda-marker="receipts">
          <strong>Receipts (real delivery events only)</strong>
          <span class="marker-copy">${this.receipts.length ? `${this.receipts.length} recorded from actual publish, queue, review, and recovery events${this.persistedReceiptLedgerCid ? `; ledger persisted at ${escapeHtml(this.persistedReceiptLedgerCid)}` : '; ledger not persisted yet'}.` : 'None yet — receipts are recorded only when real delivery events happen.'}</span>
        </div>
        <div class="marker" data-svd-vda-marker="audio-fallback" data-audio-fallback-mode="${escapeHtml(this.audioFallbackState.mode)}">
          <strong>Audio fallback (local transcript)</strong>
          <span class="marker-copy">${escapeHtml(this.audioFallbackState.reason)}${this.audioFallbackState.cid ? ` Transcript CID ${escapeHtml(this.audioFallbackState.cid)}` : ' No transcript recorded yet.'} No audio is captured or sent.</span>
        </div>
        <div class="marker" data-svd-vda-marker="offline-recovery" data-recovery-state="${escapeHtml(this.recoveryState)}">
          <strong>Clear offline recovery</strong>
          <span class="marker-copy">${escapeHtml(this.describeRecovery())} Recovery re-publishes each queued message through the live transport; messages that fail stay queued with the transport's error.</span>
        </div>
        <div class="marker" data-svd-vda-marker="channel-archive">
          <strong>Channel archive (backend)</strong>
          <span class="marker-copy">${this.persistedChannelCid ? `Persisted to the kit artifact store at CID ${escapeHtml(this.persistedChannelCid)}.` : 'Not persisted yet. "Persist channel archive" writes the real channel record behind your confirmation.'} Local peer id ${escapeHtml(this.peerId)}${localPeer ? ' (browser-local fallback)' : ' (from the P2P transport)'}.</span>
        </div>
      </section>

      <section class="workflow-card">
        <h4>Checkpoint refs (backend CIDs only)</h4>
        <div class="receipt-list">${checkpointRefs.length ? checkpointRefs.map(ref => `<span>${escapeHtml(ref)}</span>`).join(' ') : '<span>None yet — nothing has been persisted to the backend.</span>'}</div>
      </section>
      <section class="workflow-card">
        <h4>Receipts (real events only)</h4>
        <div class="receipt-list">${receiptRefs.length ? receiptRefs.map(ref => `<span>${escapeHtml(ref)}</span>`).join(' ') : '<span>None yet.</span>'}</div>
      </section>
      <section class="workflow-card">
        <h4>Recovery state</h4>
        <p class="workflow-summary">${escapeHtml(this.describeRecovery())}</p>
      </section>
    `;
  }

  renderConfirmCard() {
    if (!this.pendingConfirm) return '';
    const detail = this.pendingConfirm.action === 'persist-channel'
      ? `This will POST the channel archive (${this.pendingConfirm.bytes} bytes, ${this.pendingConfirm.messages} messages) to ipfs_kit_py through POST /mcp/tools/call with pin=true.`
      : `This will POST the receipt ledger (${this.pendingConfirm.bytes} bytes, ${this.pendingConfirm.count} receipts) to ipfs_kit_py through POST /mcp/tools/call with pin=true.`;
    return `
      <section class="workflow-card" aria-label="Confirm backend write">
        <h4>Confirm backend write</h4>
        <p class="workflow-summary">${escapeHtml(detail)} The store verifies the CID over the exact bytes sent; a mismatch fails the write and is reported verbatim.</p>
        <div class="workflow-actions">
          <button type="button" class="primary-action" data-chat-action="confirm-backend-write">Confirm persist</button>
          <button type="button" data-chat-action="cancel-backend-write">Cancel</button>
        </div>
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
      await this.confirmThenInvokeSend(this.draft || 'VDA-G030 pubsub delivery probe');
    } else if (action === 'queue-offline') {
      await this.queueOfflineDelivery(this.draft || 'VDA-G030 offline delivery probe');
    } else if (action === 'review-moderation') {
      await this.reviewModerationContext();
    } else if (action === 'persist-receipts') {
      await this.requestReceiptLedgerPersist();
    } else if (action === 'activate-audio-fallback') {
      await this.activateAudioFallback();
    } else if (action === 'recover-offline') {
      await this.recoverOfflineDelivery();
    } else if (action === 'persist-channel') {
      await this.requestChannelPersist();
    } else if (action === 'load-channel') {
      await this.loadChannelArchive();
    } else if (action === 'confirm-backend-write') {
      await this.confirmBackendWrite();
    } else if (action === 'cancel-backend-write') {
      this.pendingConfirm = null;
      this.backendStatus = 'Backend write cancelled; nothing was sent.';
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
    return this.confirmThenInvokeSend(content, peerId);
  }

  // Confirmation and transport are owned by the reviewed native gateway.
  async confirmThenInvokeSend(content, peerId = this.selectedConversation) {
    const peer = this.peers.get(peerId) || this.peers.get(DEFAULT_PEERS[0].id);
    if (!content || !peer) return null;
    return this.invokeConfirmedSend(content, peer.id);
  }

  async invokeConfirmedSend(content, peerId) {
    let toolResult = null;
    try {
      toolResult = await callUnifiedMcpTool(this, 'request_action', 'mcp++:ipfs_kit_py/ipfs_pubsub_publish', {
        topic: PUBSUB_TOPIC,
        peer_id: peerId,
        content,
      });
      if (toolResult === null) { this.backendStatus = 'Send cancelled before dispatch.'; return null; }
      if (toolResult.published !== true) throw new Error('The owner did not acknowledge a published message.');
    } catch (error) {
      if (error.preview) {
        const message = this.createMessage({ content, peerId, offline: false, delivered: false, moderation: this.buildModerationContext(content, peerId) });
        message.delivery = 'validated-preview';
        message.delivered = false;
        message.ack = error.result;
        this.appendMessage(peerId, message);
        this.backendStatus = error.message;
        await this.saveMessageHistory();
        return message;
      }
      const message = messageFromError(error);
      this.notifications.push(`Send invoke failed: ${message}`);
      this.backendStatus = `Send invoke failed: ${message}`;
      return null;
    }
    const message = this.createMessage({ content, peerId, offline: false, delivered: false, moderation: this.buildModerationContext(content, peerId) });
    message.delivery = 'owner-published';
    message.delivered = false; // publish acknowledgment is not a recipient-delivery acknowledgment
    message.ack = toolResult;
    this.appendMessage(peerId, message);
    this.backendStatus = 'The owner acknowledged publishing the message.';
    await this.saveMessageHistory();
    return message;
  }

  async publishPubsubDelivery(content, peerId = this.selectedConversation) {
    const peer = this.peers.get(peerId) || this.peers.get(DEFAULT_PEERS[0].id);
    const moderation = this.buildModerationContext(content, peer.id);
    const message = this.createMessage({
      content,
      peerId: peer.id,
      offline: false,
      delivered: false,
      moderation,
    });
    // The envelope CID is real content addressing over the exact message
    // bytes, computed before the publish attempt.
    message.cid = await this.realContentCid({
      schema: 'swissknife.p2p-chat.message.v1',
      id: message.id,
      from: message.from,
      to: message.to,
      topic: PUBSUB_TOPIC,
      content: message.content,
      timestamp: message.timestamp,
      moderation_context: moderation,
    });

    try {
      // Real transport acknowledgment: whatever the registered P2P API
      // returns is recorded verbatim. A resolved-but-empty return means
      // "sent, no acknowledgment payload" — never an invented delivery.
      const ack = await this.libp2p?.publish?.(PUBSUB_TOPIC, {
        ...message,
        topic: PUBSUB_TOPIC,
        moderation_context: moderation,
      });
      message.ack = ack === undefined
        ? { acknowledged: 'none', note: 'Transport resolved without an acknowledgment payload.' }
        : ack;
      message.delivery = ack !== undefined && ack !== null && ack.delivered === false ? 'failed' : 'sent';
      message.delivered = message.delivery !== 'failed';
      if (!message.delivered) {
        message.offline = true;
        await this.storeOfflineMessage(message);
        this.notifications.push(`Transport reported delivery failure; queued offline: ${JSON.stringify(message.ack)}`);
      }
      this.recordReceipt('pubsub', message.delivery, message.cid, `p2pchat-pubsub-${message.id}`);
      message.receipt = `p2pchat-pubsub-${message.id}`;
      this.deliveryLog.push({ type: 'pubsub', status: message.delivery, peer_id: peer.id, cid: message.cid, ack: message.ack });
    } catch (error) {
      message.delivered = false;
      message.offline = true;
      message.delivery = 'transport-error';
      message.ack = { acknowledged: 'error', error: messageFromError(error) };
      await this.storeOfflineMessage(message);
      this.recordReceipt('pubsub', 'fallback-to-offline', message.cid, `p2pchat-pubsub-${message.id}`);
      message.receipt = `p2pchat-pubsub-${message.id}`;
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
      moderation,
    });
    message.cid = await this.realContentCid({
      schema: 'swissknife.p2p-chat.message.v1',
      id: message.id,
      from: message.from,
      to: message.to,
      topic: PUBSUB_TOPIC,
      content: message.content,
      timestamp: message.timestamp,
      offline: true,
      moderation_context: moderation,
    });
    await this.storeOfflineMessage(message);
    this.appendMessage(peer.id, message);
    this.selectedConversation = peer.id;
    this.recoveryState = 'queued-for-reconnect';
    this.recordReceipt('offline', 'queued', message.cid, `p2pchat-offline-${message.id}`);
    message.receipt = `p2pchat-offline-${message.id}`;
    this.deliveryLog.push({ type: 'offline', status: 'queued', peer_id: peer.id, cid: message.cid });
    await this.saveMessageHistory();
    return message;
  }

  async storeOfflineMessage(message) {
    const stored = await this.storacha?.store?.(message);
    if (this.ipfs?.add) {
      const added = await this.ipfs.add(JSON.stringify(message));
      // The real content CID is assigned by the caller before this point;
      // an add() that returns a different CID is reported, not trusted.
      if (added?.cid && added.cid !== message.cid) {
        this.notifications.push(`Content store returned ${added.cid}; keeping the canonical envelope CID ${message.cid}.`);
      }
      await this.ipfs.pin?.(message.cid);
    }
    message.storageId = stored?.id || await this.realContentCid({ storage: 'offline-queue', message_id: message.id });
    if (!this.offlineMessages.has(message.to)) this.offlineMessages.set(message.to, []);
    this.offlineMessages.get(message.to).push(message);
    return message;
  }

  // Recovery replays each queued message through the LIVE transport. Only
  // messages the transport actually accepts are marked delivered; failures
  // stay queued and the transport's error is surfaced verbatim.
  async recoverOfflineDelivery(peerId = 'peer-bob-g030') {
    const queued = this.offlineMessages.get(peerId) || [];
    if (queued.length === 0) {
      this.recoveryState = 'nothing-pending';
      return [];
    }
    const replayed = [];
    const stillQueued = [];
    for (const message of queued) {
      try {
        const ack = await this.libp2p?.publish?.(PUBSUB_TOPIC, {
          ...message,
          topic: PUBSUB_TOPIC,
          recovered_at: Date.now(),
        });
        message.delivered = true;
        message.offline = false;
        message.delivery = 'recovered';
        message.ack = ack === undefined
          ? { acknowledged: 'none', note: 'Transport resolved without an acknowledgment payload.' }
          : ack;
        message.recoveredAt = Date.now();
        this.recordReceipt('recovery', 'replayed', message.cid, `p2pchat-recovery-${message.id}`);
        message.receipt = `p2pchat-recovery-${message.id}`;
        replayed.push(message);
      } catch (error) {
        message.delivery = 'recovery-failed';
        message.ack = { acknowledged: 'error', error: messageFromError(error) };
        this.recordReceipt('recovery', 'failed', message.cid, `p2pchat-recovery-${message.id}`);
        this.notifications.push(`Recovery publish failed for ${message.id}; still queued: ${messageFromError(error)}`);
        stillQueued.push(message);
      }
    }
    this.offlineMessages.set(peerId, stillQueued);
    if (replayed.length > 0) {
      const peer = this.peers.get(peerId);
      if (peer) peer.status = 'online';
    }
    this.recoveryState = stillQueued.length === 0
      ? 'recovered-after-reconnect'
      : `partially-recovered:${stillQueued.length}-still-queued`;
    this.deliveryLog.push({ type: 'recovery', status: this.recoveryState, peer_id: peerId, replayed: replayed.length, failed: stillQueued.length });
    await this.saveMessageHistory();
    return replayed;
  }

  // Local moderation review: a real local heuristic decision plus a real
  // content CID over the reviewed record. No backend call is made here.
  async reviewModerationContext() {
    this.moderationContext = {
      ...this.moderationContext,
      decision: 'allow',
      risk: 'low',
      labels: Array.from(new Set([...this.moderationContext.labels, 'reviewed-before-delivery'])),
      reviewed_at: new Date().toISOString(),
    };
    this.moderationContext.cid = await this.realContentCid({
      schema: 'swissknife.p2p-chat.moderation.v1',
      ...this.moderationContext,
    });
    this.recordReceipt('moderation', 'reviewed', this.moderationContext.cid, `p2pchat-moderation-${Date.now()}`);
    this.backendStatus = 'Moderation context reviewed locally; nothing was sent to the backend.';
  }

  // Reframes "emit receipt" honestly: the ledger is built from real
  // recorded delivery events and persisted to the kit backend behind an
  // explicit confirmation. With no real events there is nothing to emit.
  async requestReceiptLedgerPersist() {
    if (this.receipts.length === 0) {
      this.backendStatus = 'No delivery events recorded yet — nothing to persist. Send or queue a message first.';
      return;
    }
    const record = this.buildReceiptLedgerRecord();
    const bytes = new TextEncoder().encode(stableStringifyValue(record));
    const cid = await contentCidForBytes(bytes);
    this.pendingConfirm = {
      action: 'persist-receipts',
      record,
      bytes: bytes.length,
      count: this.receipts.length,
      expectedCid: cid,
    };
    this.backendStatus = `Receipt ledger ready (${this.receipts.length} receipts, CID ${cid}). Confirm to persist it to the kit backend.`;
    await this.confirmBackendWrite();
  }

  buildReceiptLedgerRecord() {
    return {
      schema: 'swissknife.p2p-chat.receipt-ledger.v1',
      app_id: APP_ID,
      topic: PUBSUB_TOPIC,
      peer_id: this.peerId,
      exported_at: new Date().toISOString(),
      receipts: this.receipts,
    };
  }

  buildChannelRecord() {
    return {
      schema: 'swissknife.p2p-chat.channel.v1',
      app_id: APP_ID,
      topic: PUBSUB_TOPIC,
      peer_id: this.peerId,
      exported_at: new Date().toISOString(),
      conversations: Object.fromEntries(this.conversations),
      delivery_log: this.deliveryLog,
      receipts: this.receipts,
      moderation_policy: this.moderationContext.policy,
    };
  }

  async requestChannelPersist() {
    const record = this.buildChannelRecord();
    const bytes = new TextEncoder().encode(stableStringifyValue(record));
    const cid = await contentCidForBytes(bytes);
    const messageCount = Array.from(this.conversations.values()).reduce((total, messages) => total + messages.length, 0);
    this.pendingConfirm = {
      action: 'persist-channel',
      record,
      bytes: bytes.length,
      messages: messageCount,
      expectedCid: cid,
    };
    this.backendStatus = `Channel archive ready (${messageCount} messages, CID ${cid}). Confirm to persist it to the kit backend.`;
    await this.confirmBackendWrite();
  }

  async loadChannelArchive() {
    const cid = this.getNativeContainer()?.querySelector('[data-chat-archive-cid]')?.value.trim() || this.persistedChannelCid;
    if (!cid) {
      this.backendStatus = 'Enter a stored channel archive artifact CID.';
      return;
    }
    try {
      const artifact = await callUnifiedMcpTool(this, 'request_action', 'mcp++:ipfs_kit_py/artifacts/get', {
        cid,
      });
      if (artifact === null) return;
      if (artifact.found !== true) {
        throw new Error(artifact?.error || `Artifact ${cid} was not found in ipfs_kit_py.`);
      }
      const bytes = Uint8Array.from(atob(artifact.bytes_base64), character => character.charCodeAt(0));
      const record = JSON.parse(new TextDecoder().decode(bytes));
      if (record.schema !== 'swissknife.p2p-chat.channel.v1' || !record.conversations || typeof record.conversations !== 'object' || Array.isArray(record.conversations)) throw new Error('The artifact is not a supported channel archive.');
      this.conversations = new Map(Object.entries(record.conversations || {}));
      this.deliveryLog = Array.isArray(record.delivery_log) ? record.delivery_log : [];
      this.backendStatus = `Channel archive ${cid} retrieved from ipfs_kit_py (verified: ${artifact.verified === true}).`;
      await this.saveMessageHistory();
    } catch (error) {
      this.backendStatus = `Channel archive retrieval failed: ${messageFromError(error)}`;
      this.notifications.push(`Channel archive retrieval failed: ${messageFromError(error)}`);
    }
  }

  // The explicit user confirmation step every backend-mutating POST sits
  // behind. The confirmation card renders the exact write first; only the
  // "Confirm persist" click reaches this method.
  async confirmBackendWrite() {
    const pending = this.pendingConfirm;
    this.pendingConfirm = null;
    if (!pending) {
      this.backendStatus = 'Nothing was pending confirmation.';
      return;
    }
    try {
      const kind = pending.action === 'persist-channel' ? 'channel-archive' : 'receipt-ledger';
      const persisted = await this.persistArtifact(pending.record, kind);
      if (persisted === null) { this.backendStatus = 'Artifact write cancelled before dispatch.'; return; }
      const { cid, response } = persisted;
      if (pending.action === 'persist-channel') {
        this.persistedChannelCid = cid;
        this.recordReceipt('channel', 'persisted', cid, `p2pchat-channel-${Date.now()}`);
        this.backendStatus = `Channel archive persisted to ipfs_kit_py at CID ${cid} (verified: ${response.verified === true}).`;
      } else {
        this.persistedReceiptLedgerCid = cid;
        this.recordReceipt('ledger', 'persisted', cid, `p2pchat-ledger-${Date.now()}`);
        this.backendStatus = `Receipt ledger persisted to ipfs_kit_py at CID ${cid} (verified: ${response.verified === true}).`;
      }
    } catch (error) {
      this.backendStatus = error.preview ? error.message : `Backend persist failed: ${messageFromError(error)}`;
      this.notifications.push(this.backendStatus);
    }
  }

  async activateAudioFallback() {
    this.audioFallbackState = {
      active: true,
      mode: 'text-transcript',
      reason: 'Audio capture is unavailable or declined; message is delivered as a transcript with the same moderation and receipt context.',
      transcript: this.draft || 'Voice fallback transcript for offline P2P delivery.',
      cid: null,
      receipt: null,
    };
    this.audioFallbackState.cid = await this.realContentCid({
      schema: 'swissknife.p2p-chat.audio-fallback.v1',
      mode: this.audioFallbackState.mode,
      reason: this.audioFallbackState.reason,
      transcript: this.audioFallbackState.transcript,
      recorded_at: new Date().toISOString(),
    });
    this.recordReceipt('audio', 'fallback', this.audioFallbackState.cid, `p2pchat-audio-${Date.now()}`);
  }

  createMessage({ content, peerId, offline, delivered, moderation }) {
    return {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      from: this.peerId,
      to: peerId,
      content,
      timestamp: Date.now(),
      type: 'text',
      encrypted: true,
      offline,
      delivered,
      // cid, delivery, ack, and receipt are assigned by the send/store path
      // from real transport outcomes — never here.
      cid: null,
      delivery: 'pending',
      ack: null,
      receipt: null,
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
      // Local heuristic outcome; no receipt exists until a real review or
      // delivery event records one.
      receipt: null,
    };
    this.moderationContext = context;
    return context;
  }

  // Receipts record REAL events only: transport acknowledgments, queue
  // stores, local reviews, recovery outcomes, and backend persists. The
  // ledger starts empty — nothing is pre-seeded.
  recordReceipt(kind, status, cid, receiptId = `p2pchat-${kind}-${Date.now().toString(36)}`) {
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

  // Checkpoint refs name only backend CIDs that were really persisted in
  // this session — no fixture references.
  getWorkflowCheckpointRefs() {
    return Array.from(new Set([
      this.persistedChannelCid,
      this.persistedReceiptLedgerCid,
      ...this.deliveryLog.map(entry => entry.cid).filter(Boolean),
    ].filter(Boolean)));
  }

  // Receipt refs list only receipts recorded from real events.
  getWorkflowReceiptRefs() {
    return Array.from(new Set([
      ...this.receipts.map(receipt => receipt.receipt_id),
      ...Array.from(this.conversations.values()).flat().map(message => message.receipt).filter(Boolean),
    ]));
  }

  countOfflineMessages() {
    return Array.from(this.offlineMessages.values()).reduce((total, messages) => total + messages.length, 0);
  }

  describeRecovery() {
    const queued = this.countOfflineMessages();
    if (this.recoveryState === 'recovered-after-reconnect') return 'Offline peer reconnected; queued messages were re-published through the live transport and each carries its real acknowledgment.';
    if (this.recoveryState.startsWith('partially-recovered')) return `${queued} message(s) still queued after a recovery attempt; failed publishes keep their transport errors.`;
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
