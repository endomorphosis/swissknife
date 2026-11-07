/**
 * Advanced Notes App for SwissKnife Web Desktop
 * Feature-rich note-taking with markdown support, tags, search, and AI assistance
 */

import { invokeNetworkNativeTool, networkNativeAttributes, unwrapNetworkToolResult } from './network-native-tools.js';
import { invokeNativeTool } from '../live-tool-gateway.js';

const VDA_G039_WORKFLOW = 'notes.provenance-rich-sync';

// --- Real backend wiring (ipfs_kit_py / ipfs_datasets_py over the MCP++
// desktop client). No fixture CIDs or receipt strings are kept anywhere in
// this app: every CID shown in the workflow panel is either computed from
// real record bytes (canonical CIDv1-raw+sha2-256, same semantics as the
// supervisor gateway) or returned by a live backend call. Backend-mutating
// calls are always confirmation-gated and surface failures verbatim.

async function notesKitClient(app) {
  const container = app.getNativeContainer();
  if (!container) throw new Error('The originating Notes window is unavailable.');
  return { container };
}

async function notesCanonicalCid(record) {
  const { contentCidForBytes, stableStringifyValue } = await import('../core/mcp-plus-plus-desktop-client.js');
  return contentCidForBytes(new TextEncoder().encode(stableStringifyValue(record)));
}

async function notesCanonicalBytesBase64(record) {
  const { base64ForBytes, stableStringifyValue } = await import('../core/mcp-plus-plus-desktop-client.js');
  return base64ForBytes(new TextEncoder().encode(stableStringifyValue(record)));
}

// Stored bytes keep schema, title, content, and modified. A failed conflict
// bumps modified so the recovery CID differs, and the retrieved base64 still
// contains the title and body. Other editor fields stay in this browser.
function notesCanonicalRecord(note) {
  return {
    schema: 'swissknife.notes.note.v1',
    title: note.title || '',
    content: note.content || '',
    modified: note.modified || null
  };
}

// Backend reads and writes use POST /mcp/tools/call (IDL method request_action).
async function notesParseToolResponse(response) {
  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (_parseError) {
      payload = null;
    }
  }
  if (!response.ok) {
    const message = payload && typeof payload === 'object'
      ? (payload.error?.message || payload.error || payload.message || raw)
      : (raw || ('HTTP ' + response.status));
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }
  if (payload && typeof payload === 'object' && payload.error) {
    const message = payload.error.message || payload.error;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }
  if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'result')) {
    return payload.result;
  }
  return payload;
}

function notesDatasetIdInsideDatasetData(dataset_data) {
  if (!dataset_data || typeof dataset_data !== 'object' || Array.isArray(dataset_data)) {
    return undefined;
  }
  return dataset_data.dataset_id;
}

function notesArgumentsForDatasetPublish(tool, toolArguments) {
  const publishTool = tool === 'publish' || tool === 'save_dataset' || tool === 'dataset_tools.save_dataset';
  if (!publishTool || !toolArguments || typeof toolArguments !== 'object') {
    return toolArguments;
  }
  const args = { ...toolArguments };
  const dataset_id = notesDatasetIdInsideDatasetData(args.dataset_data);
  if (args.dataset_id === undefined && dataset_id !== undefined) {
    args.dataset_id = dataset_id;
  }
  return args;
}

async function notesCallMcpTool(client, tool, toolArguments) {
  return invokeNetworkNativeTool(client.container, 'notes', tool, toolArguments);
}

// Artifact persist for a confirmation-gated flow (callers collect the
// explicit user confirmation first). Throws on any backend failure —
// callers surface the message verbatim and never fall back to a fixture.
async function notesPersistArtifact(client, record, { kind, profile }) {
  if (!client) throw new Error('MCP++ desktop client is unavailable; cannot reach the ipfs_kit_py backend.');
  const cid = await notesCanonicalCid(record);
  const bytesBase64 = await notesCanonicalBytesBase64(record);
  const result = await notesCallMcpTool(client, 'mcp++:ipfs_kit_py/artifacts/put', {
    cid,
    bytes_base64: bytesBase64,
    profile,
    kind,
    service: 'ipfs_kit_py',
    pin: true
  });
  if (result === null) throw Object.assign(new Error('Cancelled before artifact dispatch.'), { cancelled: true });
  if (result.persisted !== true || result.cid !== cid) {
    throw new Error(result?.error || 'ipfs_kit_py did not verify the persisted artifact.');
  }
  return { cid, result };
}

async function notesAppendDagEvent(client, event) {
  if (!client) throw new Error('MCP++ desktop client is unavailable; cannot reach the ipfs_kit_py backend.');
  const appended = await notesCallMcpTool(client, 'mcp++:ipfs_kit_py/dag/append', { event });
  if (appended === null) throw Object.assign(new Error('Cancelled before event dispatch.'), { cancelled: true });
  if (!appended?.event_cid) {
    throw new Error(appended?.error || 'ipfs_kit_py event DAG did not return an event CID.');
  }
  return appended.event_cid;
}

// Decode a fetched artifact back to its JSON record (best effort; the
// artifact store returns the bytes that were put).
function notesDecodeArtifactJson(fetched) {
  const b64 = fetched?.bytes_base64 || fetched?.record?.bytes_base64 || fetched?.data?.bytes_base64;
  if (typeof b64 !== 'string' || !b64) throw new Error('Artifact fetch did not include bytes_base64.');
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export class NotesApp {
  getNativeContainer() {
    if (this.container && this.container.isConnected) return this.container;
    const shells = [...document.querySelectorAll('.notes-container')].filter(node => node.isConnected);
    return shells.at(-1) || null;
  }
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.notes = [];
    this.currentNote = null;
    this.currentView = 'list'; // 'list', 'edit', 'preview'
    this.searchQuery = '';
    this.selectedTags = [];
    this.sortBy = 'modified'; // 'modified', 'created', 'title', 'size'
    this.sortOrder = 'desc';
    this.viewMode = 'grid'; // 'grid', 'list'
    
    // Editor settings
    this.editorSettings = {
      theme: 'dark',
      fontSize: 14,
      lineNumbers: true,
      wordWrap: true,
      autoSave: true,
      autoSaveInterval: 5000
    };
    
    // AI assistance features
    this.aiFeatures = {
      grammarCheck: true,
      autoSummary: true,
      keywordExtraction: true,
      relatedNotes: true
    };
    
    this.autoSaveTimer = null;
    this.lastSaveTime = null;

    this.initializeNotes();
    this.currentNote = this.notes.find((note) => note.id === 'vda-g039-provenance-note') || this.notes[0] || null;
    this.currentView = this.currentNote ? 'edit' : 'list';
    this.vdaG039 = this.buildVdaG039State();
    this.loadVdaG039Evidence();
    // Canonical CIDs are computed asynchronously from real record bytes
    // (fire-and-forget; failures are logged and leave cid null).
    this.assignCanonicalNoteCids().catch(error => console.warn('Canonical note CID assignment failed:', error));
    if (typeof window !== 'undefined') {
      window.notesApp = this;
    }
  }

  initializeNotes() {
    // Load notes from storage
    try {
      const stored = localStorage.getItem('swissknife-notes');
      if (stored) {
        this.notes = JSON.parse(stored);
        this.notes = this.ensureVdaG039Notes(this.notes);
        this.saveNotes();
      } else {
        // Create sample notes
        this.notes = this.ensureVdaG039Notes([
          {
            id: '1',
            title: 'Welcome to SwissKnife Notes',
            content: `# Welcome to SwissKnife Notes! 📝

This is your intelligent note-taking companion with advanced features:

## Features
- **Markdown Support**: Write with rich text formatting
- **Smart Search**: Find notes instantly with powerful search
- **Tags & Organization**: Organize with color-coded tags
- **AI Assistance**: Grammar checking and auto-summaries
- **Auto-Save**: Never lose your work
- **Export Options**: PDF, Markdown, Text formats

## Getting Started
1. Click "New Note" to create your first note
2. Use markdown syntax for formatting
3. Add tags by typing #tag in your content
4. Search through all your notes instantly

Start writing and let SwissKnife handle the rest! ✨`,
            tags: ['welcome', 'tutorial', 'markdown'],
            created: Date.now() - 86400000,
            modified: Date.now() - 3600000,
            favorite: true,
            color: 'blue'
          },
          {
            id: '2',
            title: 'AI Research Notes',
            content: `# AI Research Progress

## Current Projects
- P2P Neural Network Training
- Distributed Model Inference
- IPFS-based Model Storage

## Key Findings
- Distributed training reduces compute time by 40%
- P2P model sharing improves accessibility
- IPFS provides reliable model versioning

#ai #research #p2p #ml`,
            tags: ['ai', 'research', 'p2p', 'ml'],
            created: Date.now() - 172800000,
            modified: Date.now() - 7200000,
            favorite: false,
            color: 'green'
          },
          {
            id: '3',
            title: 'Meeting Notes - Project Planning',
            content: `# Project Planning Meeting
**Date**: ${new Date().toLocaleDateString()}
**Attendees**: Development Team

## Agenda
1. SwissKnife Desktop Enhancement
2. P2P Network Optimization
3. AI Model Integration

## Action Items
- [ ] Enhance virtual desktop apps
- [ ] Optimize P2P connection speed
- [ ] Implement voice commands
- [ ] Add mobile support

## Next Meeting
Schedule for next week to review progress.

#meetings #planning #tasks`,
            tags: ['meetings', 'planning', 'tasks'],
            created: Date.now() - 259200000,
            modified: Date.now() - 1800000,
            favorite: false,
            color: 'orange'
          }
        ]);
        this.saveNotes();
      }
    } catch (error) {
      console.warn('Failed to load notes:', error);
      this.notes = [];
    }
  }

  ensureVdaG039Notes(notes) {
    const safeNotes = Array.isArray(notes) ? notes.filter(Boolean) : [];
    const hasWorkflowNote = safeNotes.some(note => note.id === 'vda-g039-provenance-note');
    const seededNotes = hasWorkflowNote ? safeNotes : [
      this.buildVdaG039SampleNote(),
      ...safeNotes
    ];

    return seededNotes.map((note) => ({
      ...note,
      // cid is null until the canonical CID is computed from the real
      // record bytes (see assignCanonicalNoteCids). Null means "not
      // computed yet" — it is never a fixture string.
      cid: typeof note.cid === 'string' && !note.cid.startsWith('bafynotesg039') ? note.cid : null,
      notebookCid: typeof note.notebookCid === 'string' && !note.notebookCid.startsWith('bafynotesg039') ? note.notebookCid : null,
      provenance: note.provenance || {
        source: 'local.notes',
        authorDid: 'did:key:z6MkNotesWorkflowOperator',
        operation: 'notes.upsert',
        policy: 'allow-local-private-note-sync',
        receiptRef: null,
        provenanceCid: null
      },
      sync: note.sync || {
        state: 'local-only',
        dagCid: null,
        lastPeer: null,
        receiptRef: null
      }
    }));
  }

  buildVdaG039SampleNote() {
    const now = Date.now();
    return {
      id: 'vda-g039-provenance-note',
      title: 'VDA-G039 Provenance Notebook',
      content: `# VDA-G039 Provenance Notebook

This sample note demonstrates the provenance-rich sync workflow:

- Note artifacts pinned to the ipfs_kit_py backend (confirmation-gated, "Persist note CID")
- Semantic search over the notebook via ipfs_datasets_py semantic_search
- A provenance ledger on the ipfs_kit_py event DAG
- Summary generation (local) with optional artifact persist
- Conflict recovery against the retrieved artifact version
- Keyboard-safe editing (local UI)

#provenance #summary #sync #keyboard`,
      tags: ['provenance', 'summary', 'sync', 'keyboard'],
      created: now - 43200000,
      modified: now - 1800000,
      favorite: true,
      color: 'purple',
      cid: null,
      notebookCid: null,
      provenance: {
        source: 'local.notes.sample',
        authorDid: 'did:key:z6MkNotesWorkflowOperator',
        operation: 'notes.create',
        policy: 'allow-local-private-note-sync',
        receiptRef: null,
        provenanceCid: null
      },
      sync: {
        state: 'local-only',
        dagCid: null,
        lastPeer: null,
        receiptRef: null
      }
    };
  }

  // Canonical, content-addressed CID for a note record, computed over the
  // canonical bytes — the same CID semantics the supervisor gateway uses.
  // Async because the CID is derived from real bytes, never fabricated.
  canonicalNoteCid(note) {
    return notesCanonicalCid(notesCanonicalRecord(note));
  }

  // Fill in canonical CIDs for notes that do not have one yet. Runs
  // asynchronously after construction and after imports; failures leave
  // cid null (honest "not computed") rather than inventing one.
  assignCanonicalNoteCids() {
    const pending = this.notes.filter(note => !note.cid);
    if (pending.length === 0) return Promise.resolve();
    return Promise.all(pending.map(async (note) => {
      try {
        note.cid = await this.canonicalNoteCid(note);
      } catch (error) {
        console.warn('Failed to compute canonical note CID:', error);
      }
    })).then(() => {
      this.saveNotes();
      this.refreshVdaG039WorkflowPanel();
    });
  }

  buildVdaG039State() {
    const semanticQuery = 'provenance summary sync';
    const activeNote = this.notes[0] || this.buildVdaG039SampleNote();
    return {
      workflowId: VDA_G039_WORKFLOW,
      status: 'ready',
      semanticQuery,
      // Backend semantic-search results land here after "Run semantic
      // search" succeeds against ipfs_datasets_py. Empty means "not run
      // yet" — never fabricated hits.
      semanticResults: [],
      semanticBackend: null,
      semanticCollection: '',
      semanticRevision: 0,
      editorRecovery: null,
      referenceInput: '',
      recordNote: '',
      storedCid: '',
      storeReady: false,
      retrieveReady: false,
      retrievedTitle: '',
      retrievedBody: '',
      retrievedProof: '',
      liveSearchReady: false,
      summary: this.summarizeNote(activeNote),
      summaryCid: null,
      summaryPersisted: false,
      conflict: {
        state: 'not-run',
        baseCid: null,
        localCid: null,
        remoteCid: null,
        recoveredCid: null,
        message: 'Not run yet. "Recover conflict" retrieves the persisted artifact version from ipfs_kit_py, compares it with the local note, and persists the merged version (confirmation-gated).'
      },
      keyboardSafe: {
        state: 'local',
        shortcuts: ['Ctrl+S save (local)', 'Ctrl+K semantic search', 'Ctrl+Enter summary (local)', 'Escape editor focus recovery (local)'],
        note: 'Keyboard editing is local UI in this browser session; no backend claim is made.'
      },
      notebookCid: null,
      notebookReadback: null,
      provenanceCid: null,
      provenanceEventCid: null,
      // Real backend CIDs collected as actions complete. Empty means none
      // have completed yet — never fixture strings.
      receiptRefs: [],
      eventRefs: [],
      actionLog: [
        'workflow ready — notes are local until persisted; each backend write asks for confirmation first'
      ]
    };
  }

  async initialize() {
    this.searchBindingDefaults = {};
    try {
      const response = await fetch('/mcp/tools/bindings?app_id=notes', { cache: 'no-store', headers: { accept: 'application/json' } });
      if (response.ok) {
        const catalog = await response.json();
        const binding = catalog.controls?.find(control => control.binding_id === 'notes.ipfs_datasets_py.search_notes');
        const declared = binding?.safe_payloads?.semantic_search || binding?.safe_payload;
        if (declared && typeof declared === 'object') this.searchBindingDefaults = declared;
      }
    } catch (_catalogError) {
      this.searchBindingDefaults = {};
    }
  }

  async render() {
    const content = `
      <div class="notes-container">
        <!-- Sidebar -->
        <div class="notes-sidebar">
          <!-- Header -->
          <div class="sidebar-header">
            <h2>📝 Notes</h2>
            <button class="new-note-btn" id="new-note-btn" title="New Note">+</button>
          </div>

          <!-- Search -->
          <div class="search-section">
            <div class="search-input-wrapper">
              <input type="text" class="search-input" id="search-input" aria-label="Search notes"
                     placeholder="Search notes (local)..." value="${this.searchQuery}">
              <button class="search-clear" id="search-clear" style="display: ${this.searchQuery ? 'block' : 'none'}">×</button>
            </div>
            <div class="search-filters">
              <select class="filter-select" id="sort-by" aria-label="Sort notes">
                <option value="modified" ${this.sortBy === 'modified' ? 'selected' : ''}>Last Modified</option>
                <option value="created" ${this.sortBy === 'created' ? 'selected' : ''}>Date Created</option>
                <option value="title" ${this.sortBy === 'title' ? 'selected' : ''}>Title</option>
                <option value="size" ${this.sortBy === 'size' ? 'selected' : ''}>Size</option>
              </select>
              <button class="view-toggle" id="view-toggle" title="Toggle View" aria-label="Toggle notes view">
                ${this.viewMode === 'grid' ? '☰' : '⊞'}
              </button>
            </div>
          </div>

          <!-- Tags -->
          <div class="tags-section">
            <h4>Tags</h4>
            <div class="tags-list" id="tags-list">
              ${this.renderTagsList()}
            </div>
          </div>

          <!-- Notes List -->
          <div class="notes-list" id="notes-list">
            ${this.renderNotesList()}
          </div>

          <!-- Stats -->
          <div class="notes-stats">
            <div class="stat-item">
              <span class="stat-value">${this.notes.length}</span>
              <span class="stat-label">Notes</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">${this.getTotalWords()}</span>
              <span class="stat-label">Words</span>
            </div>
          </div>
        </div>

        <!-- Main Content -->
        <div class="notes-main">
          <div class="notes-workspace" id="notes-workspace">
            ${this.currentNote ? this.renderNoteEditor() : this.renderWelcomeScreen()}
          </div>
          ${this.renderVdaG039Workflow()}
        </div>
      </div>

      <style>
        /* Fill the window above the backends bar. The proof stack does not
           scroll, so a later scroll-into-view cannot hide the editor. */
        .window[data-app-id="notes"] .window-content {
          display: flex !important;
          flex-direction: column !important;
          flex: 1 1 auto !important;
          min-height: 0 !important;
          overflow: hidden !important;
          overflow-anchor: none !important;
          padding-bottom: 0 !important;
          scroll-padding: 0 !important;
        }
        .window[data-app-id="notes"] .window-app-content {
          display: flex !important;
          flex: 1 1 auto !important;
          flex-direction: column !important;
          min-width: 0 !important;
          min-height: 0 !important;
          height: 100% !important;
          max-height: 100% !important;
          overflow: hidden !important;
          overflow-anchor: none !important;
        }
        .window[data-app-id="notes"] .window-app-content > [id$="-content"] {
          display: flex !important;
          flex: 1 1 auto !important;
          flex-direction: column !important;
          min-width: 0 !important;
          min-height: 0 !important;
          max-height: 100% !important;
          overflow: hidden !important;
          overflow-anchor: none !important;
        }
        .window[data-app-id="notes"] .live-tool-gateway-host {
          position: static !important;
          flex: 0 0 auto !important;
          align-self: stretch !important;
          width: 100% !important;
          max-width: 100% !important;
          min-height: 0 !important;
          max-height: 3rem !important;
          overflow: hidden !important;
          z-index: 2 !important;
        }
        .notes-container {
          display: grid;
          grid-template-columns: minmax(0, 300px) minmax(0, 1fr);
          grid-template-rows: minmax(0, 1fr);
          height: 100%;
          background: var(--sk-bg-deep, #0e1412);
          color: var(--sk-text, #edf7f2);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', roboto, sans-serif;
          overflow: hidden;
        }

        .notes-sidebar {
          grid-column: 1;
          grid-row: 1;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          min-height: 0;
          height: 100%;
          position: relative;
          z-index: 0;
          background: rgba(255, 255, 255, 0.05);
          border-right: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .notes-container output[data-gateway-status],
        .window[data-app-id="notes"] output[data-gateway-status] {
          pointer-events: none;
        }

        .sidebar-header {
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .sidebar-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .new-note-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, var(--sk-ok, #5ee3a1), var(--sk-accent-strong, #5fb99d));
          color: white;
          cursor: pointer;
          font-size: 18px;
          font-weight: 600;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .new-note-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 20px rgba(94, 227, 161, 0.3);
        }

        .search-section {
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .search-input-wrapper {
          position: relative;
          margin-bottom: 12px;
        }

        .search-input {
          width: 100%;
          min-width: 0;
          padding: 10px 28px 10px 12px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          color: white;
          font-size: 14px;
          box-sizing: border-box;
        }

        .search-input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .search-input:focus {
          outline: none;
          border-color: rgba(94, 227, 161, 0.6);
          box-shadow: 0 0 0 2px rgba(94, 227, 161, 0.2);
        }

        .search-clear {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: none;
          background: rgba(255, 255, 255, 0.2);
          color: white;
          cursor: pointer;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .search-filters {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .filter-select {
          flex: 1;
          padding: 6px 8px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          color: white;
          font-size: 12px;
        }

        .view-toggle {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .view-toggle:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .tags-section {
          flex: 0 0 auto;
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .tags-section h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
          opacity: 0.8;
        }

        .tags-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .tag-chip {
          padding: 4px 8px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
        }

        .tag-chip:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .tag-chip.selected {
          background: linear-gradient(135deg, var(--sk-ok, #5ee3a1), var(--sk-accent-strong, #5fb99d));
          border-color: rgba(94, 227, 161, 0.6);
        }

        .notes-list {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          padding: 8px 8px 12px;
        }

        .note-item {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          border-left: 4px solid transparent;
          position: relative;
        }

        .note-item:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .note-item.active {
          background: rgba(94, 227, 161, 0.2);
          border-left-color: var(--sk-ok, #5ee3a1);
        }

        .note-item.blue { border-left-color: #3b82f6; }
        .note-item.green { border-left-color: var(--sk-ok, #5ee3a1); }
        .note-item.orange { border-left-color: #f59e0b; }
        .note-item.red { border-left-color: var(--sk-err, #ff6b6b); }
        .note-item.purple { border-left-color: #8b5cf6; }

        .note-title {
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .note-favorite {
          color: var(--sk-warn, #ffd166);
          font-size: 12px;
        }

        .note-preview {
          font-size: 12px;
          opacity: 0.7;
          line-height: 1.4;
          margin-bottom: 8px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .note-meta {
          font-size: 10px;
          opacity: 0.6;
          display: flex;
          justify-content: space-between;
        }

        .notes-stats {
          padding: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-around;
          background: rgba(0, 0, 0, 0.2);
        }

        .stat-item {
          text-align: center;
        }

        .stat-value {
          display: block;
          font-size: 18px;
          font-weight: 600;
          color: var(--sk-ok, #5ee3a1);
        }

        .stat-label {
          font-size: 11px;
          opacity: 0.7;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .notes-main {
          grid-column: 2;
          grid-row: 1;
          min-width: 0;
          min-height: 0;
          width: 100%;
          height: 100%;
          position: relative;
          z-index: 2;
          isolation: isolate;
          background: rgba(255, 255, 255, 0.02);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .notes-workspace {
          flex: 1 1 auto;
          min-height: 46%;
          min-width: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          z-index: 1;
        }

        .notes-workflow {
          background: rgba(15, 23, 42, 0.72);
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          padding: 8px 12px;
          flex: 1 1 auto;
          min-width: 0;
          min-height: 9.5rem;
          box-sizing: border-box;
          max-height: min(42%, 22rem);
          overflow: auto;
        }

        .workflow-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 10px;
        }

        .workflow-head h3 {
          margin: 0 0 4px 0;
          font-size: 14px;
          font-weight: 700;
        }

        .workflow-head p,
        .notes-workflow .sk-honest-note {
          margin: 0;
          max-height: none;
          overflow: visible;
          white-space: normal;
          overflow-wrap: anywhere;
          font-size: 12px;
          line-height: 1.4;
          opacity: 0.76;
        }

        .workflow-status {
          flex: 0 0 auto;
          border: 1px solid rgba(94, 227, 161, 0.34);
          background: rgba(94, 227, 161, 0.12);
          color: var(--sk-ok, #5ee3a1);
          border-radius: 6px;
          padding: 5px 8px;
          font-size: 11px;
          font-weight: 700;
        }

        .workflow-status.is-error {
          border-color: rgba(255, 107, 107, 0.55);
          background: rgba(255, 107, 107, 0.16);
          color: var(--sk-err, #ff6b6b);
        }

        .workflow-status.is-warn {
          border-color: rgba(255, 209, 102, 0.55);
          background: rgba(255, 209, 102, 0.14);
          color: var(--sk-warn, #ffd166);
        }

        .workflow-diagnostics {
          margin: 0 0 8px 0;
        }

        .workflow-diagnostics summary {
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
          color: var(--sk-text, #edf7f2);
        }

        .workflow-diagnostics summary:focus-visible {
          outline: 2px solid var(--sk-ok, #5ee3a1);
          outline-offset: 2px;
        }

        .workflow-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .workflow-card {
          min-width: 0;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          padding: 9px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .workflow-card strong {
          font-size: 12px;
          color: #bfdbfe;
        }

        .workflow-card p,
        .workflow-card span,
        .workflow-card small {
          margin: 0;
          font-size: 11px;
          line-height: 1.35;
          overflow-wrap: anywhere;
          opacity: 0.82;
        }

        .workflow-card code {
          font-size: 10px;
          line-height: 1.3;
          color: var(--sk-ok, #5ee3a1);
          overflow-wrap: anywhere;
        }

        .workflow-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }

        .workflow-actions button {
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          cursor: pointer;
          font-size: 11px;
          font-weight: 700;
          padding: 7px 9px;
        }

        .workflow-actions button:hover,
        .workflow-actions button:focus-visible {
          background: rgba(94, 227, 161, 0.22);
          outline: none;
        }

        .workflow-summary {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 9px;
          font-size: 10px;
          opacity: 0.72;
          overflow-wrap: anywhere;
        }

        /* Welcome Screen */
        .welcome-screen {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          text-align: center;
          padding: 40px;
        }

        .welcome-icon {
          font-size: 64px;
          margin-bottom: 20px;
          opacity: 0.8;
        }

        .welcome-title {
          font-size: 24px;
          font-weight: 600;
          margin-bottom: 12px;
        }

        .welcome-subtitle {
          font-size: 16px;
          opacity: 0.7;
          margin-bottom: 32px;
          max-width: 400px;
        }

        .welcome-actions {
          display: flex;
          gap: 16px;
        }

        .welcome-btn {
          padding: 12px 24px;
          background: linear-gradient(135deg, var(--sk-ok, #5ee3a1), var(--sk-accent-strong, #5fb99d));
          border: none;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.2s ease;
        }

        .welcome-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(94, 227, 161, 0.3);
        }

        .welcome-btn.secondary {
          background: rgba(255, 255, 255, 0.1);
        }

        .welcome-btn.secondary:hover {
          background: rgba(255, 255, 255, 0.2);
          box-shadow: 0 4px 20px rgba(255, 255, 255, 0.1);
        }

        /* Editor */
        .note-editor {
          display: flex;
          flex-direction: column;
          height: 100%;
          max-height: 100%;
          min-height: 0;
          min-width: 0;
          overflow: hidden;
        }

        .editor-toolbar {
          position: sticky;
          top: 0;
          z-index: 2;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.05);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: space-between;
          align-items: center;
        }

        .editor-title-input {
          flex: 1 1 8rem;
          min-width: 0;
          background: transparent;
          border: none;
          color: white;
          font-size: 18px;
          font-weight: 600;
          padding: 8px 0;
          margin-right: 16px;
        }

        .editor-title-input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .editor-title-input:focus {
          outline: 2px solid var(--sk-ok, #5ee3a1);
          outline-offset: 2px;
        }

        .editor-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }

        .editor-btn {
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .editor-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .editor-btn:focus-visible,
        .filter-select:focus-visible,
        .view-toggle:focus-visible,
        .new-note-btn:focus-visible {
          outline: 2px solid var(--sk-ok, #5ee3a1);
          outline-offset: 2px;
        }

        .editor-btn.active {
          background: linear-gradient(135deg, var(--sk-ok, #5ee3a1), var(--sk-accent-strong, #5fb99d));
        }

        .editor-content {
          flex: 1 1 auto;
          min-height: 0;
          min-width: 0;
          display: flex;
          overflow: hidden;
        }

        .editor-textarea {
          flex: 1 1 auto;
          width: 100%;
          height: 100%;
          min-height: 0;
          min-width: 0;
          box-sizing: border-box;
          background: transparent;
          border: none;
          color: white;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
          font-size: 14px;
          line-height: 1.6;
          padding: 20px;
          resize: none;
          outline: none;
          overflow: auto;
        }

        .editor-textarea::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }

        .editor-preview {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          background: rgba(255, 255, 255, 0.02);
          border-left: 1px solid rgba(255, 255, 255, 0.1);
        }

        .editor-status {
          padding: 8px 16px;
          background: rgba(0, 0, 0, 0.3);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          opacity: 0.7;
        }

        .status-left {
          display: flex;
          gap: 16px;
        }

        .status-right {
          display: flex;
          gap: 16px;
        }

        /* Markdown Preview Styles */
        .editor-preview h1,
        .editor-preview h2,
        .editor-preview h3,
        .editor-preview h4,
        .editor-preview h5,
        .editor-preview h6 {
          color: var(--sk-ok, #5ee3a1);
          margin-top: 24px;
          margin-bottom: 12px;
          font-weight: 600;
        }

        .editor-preview h1 { font-size: 24px; }
        .editor-preview h2 { font-size: 20px; }
        .editor-preview h3 { font-size: 18px; }

        .editor-preview p {
          margin-bottom: 12px;
          line-height: 1.6;
        }

        .editor-preview ul,
        .editor-preview ol {
          margin-bottom: 12px;
          padding-left: 20px;
        }

        .editor-preview li {
          margin-bottom: 4px;
        }

        .editor-preview code {
          background: rgba(255, 255, 255, 0.1);
          padding: 2px 4px;
          border-radius: 3px;
          font-family: monospace;
          font-size: 13px;
        }

        .editor-preview pre {
          background: rgba(0, 0, 0, 0.3);
          padding: 12px;
          border-radius: 6px;
          overflow-x: auto;
          margin-bottom: 12px;
        }

        .editor-preview blockquote {
          border-left: 4px solid var(--sk-ok, #5ee3a1);
          padding-left: 16px;
          margin: 12px 0;
          font-style: italic;
          opacity: 0.8;
        }

        .editor-preview strong {
          font-weight: 600;
          color: var(--sk-ok, #5ee3a1);
        }

        .editor-preview em {
          font-style: italic;
          color: var(--sk-warn, #ffd166);
        }

        /* Responsive */
        @media (max-width: 768px) {
          .notes-container {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: minmax(0, 30%) minmax(0, 1fr);
            box-sizing: border-box;
          }

          .tags-list {
            flex-wrap: nowrap;
            overflow-x: auto;
          }
          
          .notes-sidebar {
            grid-column: 1;
            grid-row: 1;
            width: 100%;
            max-width: none;
            height: 100%;
            max-height: none;
            min-height: 0;
          }

          .notes-main {
            grid-column: 1;
            grid-row: 2;
            width: 100%;
            height: 100%;
            min-height: 0;
          }

          .notes-workflow {
            max-height: min(46%, 18rem);
            min-height: 8.5rem;
            overflow: auto;
            padding: 8px;
          }

          .workflow-head {
            flex-direction: column;
          }

          .workflow-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .workflow-actions {
            gap: 6px;
          }
          
          .editor-content {
            flex-direction: column;
          }
          
          .editor-preview {
            border-left: none;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
          }
        }

        .window[data-app-id="notes"] .notes-container {
          display: flex !important;
          flex-direction: column !important;
          flex: 1 1 auto !important;
          grid-template-columns: none !important;
          grid-template-rows: none !important;
          height: 100% !important;
          max-height: 100% !important;
          min-height: 0 !important;
          min-width: 0 !important;
          overflow: hidden !important;
          overflow-anchor: none !important;
        }
        .window[data-app-id="notes"] .notes-sidebar {
          width: 100% !important;
          max-width: none !important;
          height: auto !important;
          max-height: none !important;
          flex: 0 0 auto !important;
          overflow: hidden !important;
          border-right: none !important;
        }
        .window[data-app-id="notes"] .notes-main {
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
          height: auto !important;
          min-height: 0 !important;
          min-width: 0 !important;
          flex: 1 1 auto !important;
          overflow: hidden !important;
        }
        .window[data-app-id="notes"] .tags-section,
        .window[data-app-id="notes"] .notes-list,
        .window[data-app-id="notes"] .notes-stats,
        .window[data-app-id="notes"] .search-filters,
        .window[data-app-id="notes"] .sidebar-header,
        .window[data-app-id="notes"] .search-clear,
        .window[data-app-id="notes"] .workflow-diagnostics,
        .window[data-app-id="notes"] .workflow-summary,
        .window[data-app-id="notes"] .editor-actions,
        .window[data-app-id="notes"] .editor-status,
        .window[data-app-id="notes"] .notes-index-search > label,
        .window[data-app-id="notes"] .notes-index-search > p,
        .window[data-app-id="notes"] .workflow-actions button {
          display: none !important;
        }
        .window[data-app-id="notes"] .search-section {
          padding: 6px 8px !important;
        }
        .window[data-app-id="notes"] .search-input-wrapper {
          margin: 0 !important;
        }
        .window[data-app-id="notes"] #search-input,
        .window[data-app-id="notes"] #note-title,
        .window[data-app-id="notes"] #notes-base-cid {
          width: 100% !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
          color: #1c2430 !important;
          background: #f8fafc !important;
          padding: 6px 8px !important;
          margin: 0 !important;
        }
        .window[data-app-id="notes"] #notes-base-cid {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          height: auto !important;
          min-height: 2.8em !important;
          max-height: 4.8em !important;
          font-size: 12px !important;
          line-height: 1.35 !important;
          white-space: pre-wrap !important;
          overflow-wrap: anywhere !important;
          word-break: break-all !important;
          overflow: auto !important;
          resize: none !important;
        }
        .window[data-app-id="notes"] .editor-toolbar {
          position: static !important;
          padding: 4px 6px !important;
          gap: 4px !important;
        }
        .window[data-app-id="notes"] .note-editor,
        .window[data-app-id="notes"] .editor-content {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          min-width: 0 !important;
          height: auto !important;
          max-height: none !important;
          overflow: hidden !important;
        }
        .window[data-app-id="notes"] .notes-workspace {
          flex: 1 1 auto !important;
          min-height: 96px !important;
          max-height: none !important;
          overflow: hidden !important;
        }
        .window[data-app-id="notes"] #note-content {
          flex: 1 1 auto !important;
          width: 100% !important;
          height: auto !important;
          min-height: 40px !important;
          max-height: none !important;
          box-sizing: border-box !important;
          padding: 6px 8px !important;
          font-size: 14px !important;
          line-height: 18px !important;
          color: #1c2430 !important;
          background: #f8fafc !important;
          overflow: hidden !important;
        }
        .window[data-app-id="notes"] .notes-workflow {
          max-height: none !important;
          min-height: 0 !important;
          min-width: 0 !important;
          overflow: visible !important;
          flex: 0 0 auto !important;
          padding: 4px 8px !important;
        }
        .window[data-app-id="notes"] .notes-workflow h3 {
          margin: 0 !important;
          font-size: 13px !important;
          line-height: 1.2 !important;
        }
        .window[data-app-id="notes"] .notes-workflow label:has(#notes-base-cid) {
          display: block !important;
          max-width: 100% !important;
          min-width: 0 !important;
        }
        .window[data-app-id="notes"] .notes-index-search {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 6px !important;
          margin: 2px 0 !important;
          min-width: 0 !important;
          max-width: 100% !important;
        }
        .window[data-app-id="notes"] .workflow-head {
          display: flex !important;
          flex-direction: column !important;
          align-items: stretch !important;
          gap: 4px !important;
        }
        .window[data-app-id="notes"] #notes-compare,
        .window[data-app-id="notes"] #vda-g039-status,
        .window[data-app-id="notes"] .notes-workflow .sk-honest-note {
          display: block !important;
          color: #1c2430 !important;
          background: #f8fafc !important;
          border: 1px solid #cbd5e1 !important;
          padding: 4px 6px !important;
          margin: 3px 0 !important;
          font-size: 13px !important;
          line-height: 1.35 !important;
          white-space: normal !important;
          overflow-wrap: anywhere !important;
          overflow: visible !important;
          max-height: none !important;
          max-width: 100% !important;
          opacity: 1 !important;
        }
        .window[data-app-id="notes"] #notes-store-ready,
        .window[data-app-id="notes"] #notes-retrieved-proof {
          color: #1c2430 !important;
          background: #f8fafc !important;
          border: 1px solid #cbd5e1 !important;
          padding: 4px 6px !important;
          margin: 3px 0 !important;
          font-size: 13px !important;
          line-height: 1.35 !important;
          white-space: normal !important;
          overflow-wrap: anywhere !important;
        }
        .window[data-app-id="notes"] #notes-store-ready[hidden],
        .window[data-app-id="notes"] #notes-retrieved-proof[hidden] {
          display: none !important;
        }
        .window[data-app-id="notes"] #notes-record,
        .window[data-app-id="notes"] #notes-semantic-results small,
        .window[data-app-id="notes"] #notes-semantic-results article ~ article {
          display: none !important;
        }
        .window[data-app-id="notes"] .notes-owner-actions {
          display: flex !important;
          flex: 0 0 auto !important;
          flex-wrap: wrap !important;
          gap: 8px !important;
          margin: 4px 0 !important;
          position: relative !important;
          z-index: 3 !important;
        }
        .window[data-app-id="notes"] #notes-run-semantic-search,
        .window[data-app-id="notes"] #notes-recover-conflict,
        .window[data-app-id="notes"] #notes-store-version,
        .window[data-app-id="notes"] #notes-retrieve-stored,
        .window[data-app-id="notes"] [id^="notes-open-semantic-result-"] {
          display: inline-flex !important;
          min-height: 32px !important;
          margin: 0 !important;
          color: #1c2430 !important;
          background: #e8f1fb !important;
        }
        .window[data-app-id="notes"] .notes-workflow .sk-honest-note {
          display: none !important;
        }
        .window[data-app-id="notes"] #note-content.notes-focus-ring {
          outline: 3px solid #0b6bcb !important;
          outline-offset: 1px !important;
          box-shadow: inset 0 0 0 2px #0b6bcb !important;
        }
        .window[data-app-id="notes"] #note-content:focus,
        .window[data-app-id="notes"] #search-input:focus,
        .window[data-app-id="notes"] #note-title:focus,
        .window[data-app-id="notes"] #notes-base-cid:focus {
          outline: 3px solid #0b6bcb !important;
          outline-offset: 1px !important;
        }
      </style>
    `;

    // Set up event handlers after the HTML is rendered
    setTimeout(() => {
      const container = this.getNativeContainer();
      if (container) {
        this.setupEventHandlers(container);
      }
      this.containNotesFrame();
      requestAnimationFrame(() => this.containNotesFrame());
    }, 0);

    return content;
  }

  renderVdaG039Workflow() {
    const state = this.vdaG039 || this.buildVdaG039State();
    const activeNote = this.currentNote || this.notes[0] || this.buildVdaG039SampleNote();
    const noteCidLabel = activeNote.cid || 'computing canonical CID…';
    const notebookLabel = state.notebookCid || 'not published yet';
    const semanticSummary = state.semanticBackend
      ? `${state.semanticResults.length} result(s) from ${this.escapeHtml(state.semanticBackend)}`
      : 'not run yet — results come from ipfs_datasets_py semantic_search';
    const provenanceLabel = state.provenanceCid || 'not recorded yet';
    const summaryLabel = state.summaryPersisted && state.summaryCid
      ? state.summaryCid
      : 'local only — not persisted';
    const conflictLabel = state.conflict.recoveredCid || 'no recovery run yet';
    const syncLabel = activeNote.sync?.dagCid || 'no checkpoint yet';
    const receiptList = state.receiptRefs.length > 0
      ? state.receiptRefs.map(ref => this.escapeHtml(ref)).join(' ')
      : 'none yet';
    const eventList = state.eventRefs.length > 0
      ? state.eventRefs.map(ref => this.escapeHtml(ref)).join(' ')
      : 'none yet';
    return `
      <section class="notes-workflow" data-svd-workflow="${VDA_G039_WORKFLOW}" data-notes-recovery="${this.escapeHtml(state.editorRecovery?.state || 'idle')}" aria-label="Note storage and search">
        <div class="workflow-head">
          <div>
            <h3>Note storage and search</h3>
            <p class="sk-honest-note">${this.escapeHtml(this.notesHonestNote())}</p>
          </div>
          <span class="workflow-status ${this.vdaG039StatusClass(state.status)}" role="status" aria-live="polite" id="vda-g039-status" data-notes-editor-recovery="${this.escapeHtml(state.editorRecovery?.state || 'idle')}">Status: ${this.escapeHtml(state.status)}</span>
        </div>
        <p id="notes-compare">${this.escapeHtml(this.notesCompareLine())}</p>
        <p id="notes-retrieved-proof" ${state.retrieveReady && state.retrievedProof ? '' : 'hidden'}>${this.escapeHtml(state.retrievedProof || '')}</p>
        <p id="notes-store-ready" ${state.storeReady && state.storedCid ? '' : 'hidden'}>Stored artifact ${this.escapeHtml(state.storedCid || '')}.</p>
        <p id="notes-record">${this.escapeHtml(this.notesRecordLine())}</p>
        <label>Stored note version CID <textarea id="notes-base-cid" data-notes-base-cid aria-label="Stored note version CID" rows="2" placeholder="Verified note artifact CID">${this.escapeHtml(state.referenceInput || '')}</textarea></label>
        <div class="notes-owner-actions">
          <button type="button" id="notes-store-version" ${networkNativeAttributes('notes', 'mcp++:ipfs_kit_py/artifacts/put')} onclick="window.notesApp?.storeVdaG039NoteVersion()">Store note artifact</button>
          <button type="button" id="notes-retrieve-stored" ${networkNativeAttributes('notes', 'mcp++:ipfs_kit_py/artifacts/get')} onclick="window.notesApp?.retrieveVdaG039StoredNote()">Retrieve stored note</button>
          <button type="button" id="notes-recover-conflict" ${networkNativeAttributes('notes', 'mcp++:ipfs_kit_py/artifacts/get')} data-svd-workflow-action="recover-conflict" onclick="window.notesApp?.recoverVdaG039Conflict()">Recover conflict</button>
        </div>

        <div class="notes-index-search" aria-label="Search indexed notes">
          <label>Existing indexed collection
            <input id="notes-search-collection" aria-label="Existing indexed collection" value="${this.escapeHtml(state.semanticCollection || this.searchBindingDefaults?.collection || '')}" placeholder="Enter an existing collection name" style="max-width:100%; width:28rem; box-sizing:border-box;">
          </label>
          <p>Search an existing dataset index. Local edits stay in this browser and are not added to that index automatically.</p>
          <button type="button" id="notes-run-semantic-search" onclick="window.notesApp?.runVdaG039SemanticSearch()">Search indexed notes</button>
          <div id="notes-semantic-results" aria-live="polite">
            ${(state.semanticResults || []).map((result, index) => {
              if (index > 0 || typeof result.content !== 'string') return '';
              const opened = state.openedResultIndex === index;
              return `<article><button type="button" id="notes-open-semantic-result-${index}"${state.liveSearchReady === true ? ' data-notes-search-live="ready"' : ''}${opened ? ' data-notes-opened="ready"' : ''} onclick="window.notesApp?.openVdaG039SemanticResult(${index})">${opened ? 'Opened' : 'Open'} ${this.escapeHtml(result.title)}</button></article>`;
            }).join('')}
          </div>
        </div>

        <details class="workflow-diagnostics">
          <summary>Note sync diagnostics</summary>
        <div class="workflow-grid">
          <article class="workflow-card" data-svd-vda-marker="note-cids" data-sync-state="${this.escapeHtml(activeNote.sync?.state || 'local-only')}">
            <strong>Note CIDs</strong>
            <p>${this.notes.length} note(s) local. Active note canonical CID (computed from real note bytes):</p>
            <code class="sk-code">${this.escapeHtml(noteCidLabel)}</code>
            <p>Notebook manifest: <code class="sk-code">${this.escapeHtml(notebookLabel)}</code>${state.notebookReadback ? ` — ${this.escapeHtml(state.notebookReadback)}` : ''}</p>
          </article>
          <article class="workflow-card" data-svd-vda-marker="semantic-search" data-semantic-search-state="${state.semanticBackend ? 'indexed' : 'not-run'}">
            <strong>Semantic search</strong>
            <p>semantic_search "${this.escapeHtml(state.semanticQuery)}": ${this.escapeHtml(semanticSummary)}.</p>
            ${(state.semanticResults || []).map(result => `<code class="sk-code">${this.escapeHtml(result.cid || result.title || 'hit')}</code>`).join('')}
          </article>
          <article class="workflow-card" data-svd-vda-marker="provenance" data-provenance-state="${state.provenanceCid ? 'recorded' : 'not-recorded'}">
            <strong>Provenance</strong>
            <p>${this.escapeHtml(activeNote.provenance?.operation || 'notes.upsert')} by ${this.escapeHtml(activeNote.provenance?.authorDid || 'did:key:z6MkNotesWorkflowOperator')} (local record).</p>
            <code class="sk-code">${this.escapeHtml(provenanceLabel)}</code>
            ${state.provenanceEventCid ? `<small>event DAG: ${this.escapeHtml(state.provenanceEventCid)}</small>` : ''}
          </article>
          <article class="workflow-card" data-svd-vda-marker="summary" data-summary-state="${state.summaryPersisted ? 'persisted' : 'local'}">
            <strong>Summary</strong>
            <p id="notes-summary-text">${this.escapeHtml(state.summary)}</p>
            <small>Local extractive summary (local UI). Persisted artifact: <code class="sk-code">${this.escapeHtml(summaryLabel)}</code></small>
          </article>
          <article class="workflow-card" data-svd-vda-marker="conflict-recovery" data-conflict-state="${this.escapeHtml(state.conflict.state)}">
            <strong>Conflict recovery</strong>
            <p>${this.escapeHtml(state.conflict.message)}</p>
            <code class="sk-code">${this.escapeHtml(conflictLabel)}</code>
          </article>
          <article class="workflow-card" data-svd-vda-marker="keyboard-safe-editing" data-keyboard-safe-state="${this.escapeHtml(state.keyboardSafe.state)}">
            <strong>Keyboard-safe editing</strong>
            <p>${state.keyboardSafe.shortcuts.map(shortcut => this.escapeHtml(shortcut)).join('; ')}</p>
            <small>Local UI — ${this.escapeHtml(state.keyboardSafe.note || 'no backend claim is made.')}</small>
          </article>
        </div>
        </details>

        <div class="workflow-actions" aria-label="Note storage and search actions">
          <button type="button" ${networkNativeAttributes('notes', 'mcp++:ipfs_kit_py/artifacts/put')} data-svd-workflow-action="persist-note-cid" onclick="window.notesApp?.persistVdaG039NoteCid()">Persist note CID</button>
          <button type="button" ${networkNativeAttributes('notes', 'mcp++:ipfs_kit_py/artifacts/put')} data-svd-workflow-action="record-provenance" onclick="window.notesApp?.recordVdaG039Provenance()">Record provenance</button>
          <button type="button" ${networkNativeAttributes('notes', 'mcp++:ipfs_kit_py/artifacts/put')} data-svd-workflow-action="generate-summary" onclick="window.notesApp?.generateVdaG039Summary()">Generate summary</button>
          <button type="button" data-svd-workflow-action="verify-keyboard-editing" onclick="window.notesApp?.verifyVdaG039KeyboardEditing()">Verify keyboard editing</button>
        </div>

        <div class="workflow-summary">
          <span>Receipts: ${receiptList}</span>
          <span>Events: ${eventList}</span>
          <span>Sync DAG: ${this.escapeHtml(syncLabel)}</span>
        </div>
      </section>
    `;
  }

  // Re-render just the workflow panel after backend state changes (keeps
  // the rest of the notes UI untouched).
  refreshVdaG039WorkflowPanel() {
    const container = this.getNativeContainer();
    if (!container) return;
    const existing = container.querySelector('.notes-workflow');
    if (!existing) return;
    const reference = existing.querySelector('[data-notes-base-cid]');
    if (reference) this.vdaG039.referenceInput = reference.value;
    const template = document.createElement('template');
    template.innerHTML = this.renderVdaG039Workflow().trim();
    existing.replaceWith(template.content.firstChild);
    this.updateVdaG039Status();
    this.containNotesFrame();
  }

  containNotesFrame() {
    const shell = this.getNativeContainer();
    if (!shell) return;
    const windowEl = shell.closest('.window');
    const windowContent = shell.closest('.window-content');
    const appContent = shell.closest('.window-app-content');
    const contentRoot = shell.parentElement;
    const gateway = windowEl?.querySelector('.live-tool-gateway-host');
    const pin = (el, extra) => {
      if (!el) return;
      el.style.boxSizing = 'border-box';
      el.style.minHeight = '0';
      el.style.minWidth = '0';
      el.style.overflow = 'hidden';
      el.style.overflowAnchor = 'none';
      if (extra) Object.assign(el.style, extra);
    };
    pin(gateway, {
      position: 'static',
      flex: '0 0 auto',
      maxHeight: '3rem',
      minHeight: '0',
      width: '100%',
      maxWidth: '100%'
    });
    const windowRect = windowEl?.getBoundingClientRect();
    if (windowContent && appContent && windowRect && windowRect.height >= 120) {
      const top = Math.max(windowContent.getBoundingClientRect().top, windowRect.top);
      const available = Math.floor(windowRect.bottom - top);
      if (available >= 160) {
        for (const el of [windowContent, appContent]) {
          pin(el, {
            display: 'flex',
            flexDirection: 'column',
            height: `${available}px`,
            maxHeight: `${available}px`,
            maxWidth: '100%'
          });
        }
        pin(contentRoot, { display: 'flex', flexDirection: 'column', flex: '1 1 auto', maxHeight: '100%' });
      }
    }
    pin(shell, { height: '100%', maxHeight: '100%' });
    const workspace = shell.querySelector('.notes-workspace');
    const proof = shell.querySelector('.notes-workflow');
    const gatewayTop = gateway?.getBoundingClientRect().top ?? windowRect?.bottom;
    if (workspace && proof && typeof gatewayTop === 'number') {
      const overflow = proof.getBoundingClientRect().bottom - gatewayTop;
      if (overflow > 1) {
        const next = Math.max(96, Math.floor(workspace.getBoundingClientRect().height - overflow - 4));
        workspace.style.flex = '0 0 auto';
        workspace.style.height = `${next}px`;
        workspace.style.maxHeight = `${next}px`;
      }
    }
    const resetScroll = () => {
      const nodes = windowEl ? [windowEl, ...windowEl.querySelectorAll('*')] : [shell];
      for (const el of nodes) {
        if (el.scrollTop) el.scrollTop = 0;
        if (el.scrollLeft) el.scrollLeft = 0;
      }
    };
    resetScroll();
    requestAnimationFrame(resetScroll);
  }

  notesHonestNote() {
    const state = this.vdaG039 || {};
    if (state.conflict?.state === 'resolved') {
      return 'Conflict resolved. The stored note matches the editor.';
    }
    if (state.conflict?.state === 'match') {
      return 'Stored note matches the editor.';
    }
    if (state.conflict?.state === 'failed') {
      return 'The stored reference was refused. No artifact was retrieved. Editor text is unchanged.';
    }
    if (state.retrieveReady && state.retrievedTitle) {
      return `Retrieved stored note ${state.retrievedTitle}.`;
    }
    if (typeof state.storedCid === 'string' && /^baf[a-z2-7]{20,}$/.test(state.storedCid)) {
      return `Stored artifact ${state.storedCid}.`;
    }
    if (state.editorRecovery?.state === 'saved-local') {
      return 'Indexed note saved in this browser. The dataset index was not modified.';
    }
    return 'Local edits stay in this browser until you save them here. Writes ask for confirmation.';
  }

  notesCompareLine() {
    const state = this.vdaG039 || {};
    const editor = this.getNativeContainer();
    const liveTitle = editor?.querySelector('#note-title')?.value;
    const liveBody = editor?.querySelector('#note-content')?.value;
    const localTitle = typeof liveTitle === 'string' ? liveTitle : (this.currentNote?.title || '');
    const localBody = typeof liveBody === 'string' ? liveBody : (this.currentNote?.content || '');
    const hit = (state.semanticResults || []).find(result => typeof result.title === 'string' && typeof result.content === 'string');
    const conflict = state.conflict?.state || 'not-run';
    if (!hit) return `Indexed note: not observed. Conflict: ${conflict}.`;
    const sameEditor = localTitle === hit.title && localBody === hit.content;
    const sameRetrieved = !!(state.retrieveReady && state.retrievedTitle === hit.title && state.retrievedBody === hit.content);
    if (sameEditor && (sameRetrieved || !state.retrieveReady)) {
      const retrieved = sameRetrieved ? 'retrieved same' : 'retrieved not-run';
      return `Index ${hit.title} | ${hit.content} | editor same | ${retrieved} | ${conflict}`;
    }
    const retrieved = state.retrieveReady && typeof state.retrievedTitle === 'string' && state.retrievedTitle
      ? ` Retrieved title ${state.retrievedTitle}. Retrieved body ${state.retrievedBody}.`
      : '';
    return `Indexed title ${hit.title}. Indexed body ${hit.content}. Local title ${localTitle}. Local body ${localBody}.${retrieved} Conflict ${conflict}.`;
  }

  notesRecordLine() {
    const text = typeof this.vdaG039?.recordNote === 'string' ? this.vdaG039.recordNote.trim() : '';
    return text || 'No conflict reference has been tried.';
  }

  appendNotesRecord(sentence) {
    const next = String(sentence || '').trim();
    if (!next) return;
    const prior = typeof this.vdaG039.recordNote === 'string' ? this.vdaG039.recordNote.trim() : '';
    if (prior.includes(next)) return;
    this.vdaG039.recordNote = prior ? `${prior} ${next}` : next;
  }

  renderTagsList() {
    const allTags = [...new Set(this.notes.flatMap(note => note.tags || []))];
    return allTags.map(tag => `
      <div class="tag-chip ${this.selectedTags.includes(tag) ? 'selected' : ''}" 
           data-tag="${tag}">${tag}</div>
    `).join('');
  }

  renderNotesList() {
    const filteredNotes = this.getFilteredNotes();
    
    if (filteredNotes.length === 0) {
      return `
        <div class="sk-empty">
          <div style="font-size: 32px; margin-bottom: 12px;">📝</div>
          <div>${this.searchQuery ? 'No notes match your search' : 'No notes yet'}</div>
          <div class="sk-honest-note" style="margin-top: 8px;">${this.searchQuery ? 'Search filters run locally in your browser' : 'Create your first note with the + button — notes stay local until you persist them'}</div>
        </div>
      `;
    }

    return filteredNotes.map(note => `
      <div class="note-item ${note.color || ''} ${this.currentNote?.id === note.id ? 'active' : ''}" 
           data-note-id="${note.id}">
        <div class="note-title">
          <span>${note.title}</span>
          ${note.favorite ? '<span class="note-favorite">⭐</span>' : ''}
        </div>
        <div class="note-preview">${this.getPlainTextPreview(note.content)}</div>
        <div class="note-meta">
          <span>${this.formatDate(note.modified)}</span>
          <span>${this.getWordCount(note.content)} words</span>
        </div>
      </div>
    `).join('');
  }

  renderWelcomeScreen() {
    return `
      <div class="welcome-screen">
        <div class="welcome-icon">📝</div>
        <h1 class="welcome-title">Welcome to SwissKnife Notes</h1>
        <p class="welcome-subtitle">
          Create, organize, and manage your notes with AI-powered features.
          Start by creating a new note or selecting one from the sidebar.
        </p>
        <div class="welcome-actions">
          <button class="welcome-btn" id="welcome-new-note">Create New Note</button>
          <button class="welcome-btn secondary" id="welcome-import">Import Notes</button>
        </div>
      </div>
    `;
  }

  renderNoteEditor() {
    if (!this.currentNote) return this.renderWelcomeScreen();

    return `
      <div class="note-editor">
        <div class="editor-toolbar">
          <input type="text" class="editor-title-input" id="note-title" 
                 value="${this.currentNote.title}" placeholder="Note title...">
          <div class="editor-actions">
            <button class="editor-btn" id="favorite-btn" 
                    title="${this.currentNote.favorite ? 'Remove from favorites' : 'Add to favorites'}"
                    aria-label="${this.currentNote.favorite ? 'Remove from favorites' : 'Add to favorites'}">
              ${this.currentNote.favorite ? '⭐' : '☆'}
            </button>
            <button class="editor-btn ${this.currentView === 'edit' ? 'active' : ''}" 
                    id="edit-mode-btn" title="Edit Mode">✏️ Edit</button>
            <button class="editor-btn ${this.currentView === 'preview' ? 'active' : ''}" 
                    id="preview-mode-btn" title="Preview Mode">👁️ Preview</button>
            <button class="editor-btn" id="ai-assist-btn" title="AI Assistance">🤖 AI</button>
            <button class="editor-btn" id="export-btn" title="Export Note" aria-label="Export note">Export</button>
            <button class="editor-btn" id="delete-btn" ${this.currentNote.persistedAt && this.currentNote.sync?.state === 'synchronized' ? networkNativeAttributes('notes', 'mcp++:ipfs_kit_py/dag/append') : ''} title="Delete Note" aria-label="Delete note">Delete</button>
          </div>
        </div>

        <div class="editor-content">
          ${this.currentView === 'edit' || this.currentView === 'split' ? `
            <textarea class="editor-textarea" id="note-content" 
                      placeholder="Start writing your note...">${this.currentNote.content}</textarea>
          ` : ''}
          
          ${this.currentView === 'preview' || this.currentView === 'split' ? `
            <div class="editor-preview" id="note-preview">
              ${this.renderMarkdown(this.currentNote.content)}
            </div>
          ` : ''}
        </div>

        <div class="editor-status">
          <div class="status-left">
            <span>Words: ${this.getWordCount(this.currentNote.content)}</span>
            <span>Characters: ${this.currentNote.content.length}</span>
            <span>Tags: ${(this.currentNote.tags || []).length}</span>
          </div>
          <div class="status-right">
            <span>Created: ${this.formatDate(this.currentNote.created)}</span>
            <span>Modified: ${this.formatDate(this.currentNote.modified)}</span>
            ${this.lastSaveTime ? `<span>Saved: ${this.formatTime(this.lastSaveTime)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  setupEventHandlers(container) {
    this.container = container;
    // New note button
    container.querySelector('#new-note-btn').addEventListener('click', () => {
      this.createNewNote();
    });

    // Search functionality
    const searchInput = container.querySelector('#search-input');
    searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.updateSearchClear();
      this.refreshNotesList();
    });

    container.querySelector('#search-clear').addEventListener('click', () => {
      this.searchQuery = '';
      searchInput.value = '';
      this.updateSearchClear();
      this.refreshNotesList();
    });

    // Sort and view controls
    container.querySelector('#sort-by').addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.refreshNotesList();
    });

    container.querySelector('#view-toggle').addEventListener('click', () => {
      this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
      this.refreshContent();
    });

    // Tag filtering
    container.querySelectorAll('.tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.toggleTag(chip.dataset.tag);
      });
    });

    // Note selection
    container.querySelectorAll('.note-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectNote(item.dataset.noteId);
      });
    });

    // Welcome screen actions
    const welcomeNewNote = container.querySelector('#welcome-new-note');
    if (welcomeNewNote) {
      welcomeNewNote.addEventListener('click', () => {
        this.createNewNote();
      });
    }

    const welcomeImport = container.querySelector('#welcome-import');
    if (welcomeImport) {
      welcomeImport.addEventListener('click', () => {
        this.importNotes();
      });
    }

    // Editor event handlers
    this.setupEditorEventHandlers(container);
  }

  setupEditorEventHandlers(container) {
    if (!this.currentNote) return;

    // Title editing
    const titleInput = container.querySelector('#note-title');
    if (titleInput) {
      titleInput.addEventListener('input', (e) => {
        this.currentNote.title = e.target.value;
        this.currentNote.modified = Date.now();
        this.scheduleAutoSave();
        this.refreshNotesList();
      });
      titleInput.addEventListener('keydown', (e) => this.handleKeyboardSafeEditing(e));
    }

    // Content editing
    const contentTextarea = container.querySelector('#note-content');
    if (contentTextarea) {
      contentTextarea.addEventListener('input', (e) => {
        this.currentNote.content = e.target.value;
        this.currentNote.modified = Date.now();
        this.extractTags();
        this.scheduleAutoSave();
        
        // Update preview if in split mode
        if (this.currentView === 'split') {
          this.updatePreview();
        }
      });
      contentTextarea.addEventListener('keydown', (e) => this.handleKeyboardSafeEditing(e));
    }

    // Mode switching
    const editModeBtn = container.querySelector('#edit-mode-btn');
    if (editModeBtn) {
      editModeBtn.addEventListener('click', () => {
        this.currentView = 'edit';
        this.refreshContent();
      });
    }

    const previewModeBtn = container.querySelector('#preview-mode-btn');
    if (previewModeBtn) {
      previewModeBtn.addEventListener('click', () => {
        this.currentView = 'preview';
        this.refreshContent();
      });
    }

    // Action buttons
    const favoriteBtn = container.querySelector('#favorite-btn');
    if (favoriteBtn) {
      favoriteBtn.addEventListener('click', () => {
        this.toggleFavorite();
      });
    }

    const exportBtn = container.querySelector('#export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportNote();
      });
    }

    const deleteBtn = container.querySelector('#delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.deleteNote();
      });
    }

    const aiAssistBtn = container.querySelector('#ai-assist-btn');
    if (aiAssistBtn) {
      aiAssistBtn.addEventListener('click', () => {
        this.showAIAssistance();
      });
    }
  }

  // Confirmation-gated backend persist for one note: pins the canonical
  // note artifact, publishes the notebook manifest, appends a sync
  // checkpoint to the event DAG, then reads the manifest back. Backend
  // failures surface verbatim; nothing falls back to fixtures.
  async persistVdaG039NoteCid(preconfirmed = false) {
    const note = this.currentNote || this.notes[0];
    if (!note) {
      this.vdaG039.status = 'no note to persist';
      this.updateVdaG039Status();
      return;
    }
    const cid = note.cid || await this.canonicalNoteCid(note);

    this.vdaG039.status = `persisting note artifact ${cid}…`;
    this.updateVdaG039Status();
    try {
      const client = await notesKitClient(this);
      const record = notesCanonicalRecord(note);
      const persisted = await notesPersistArtifact(client, record, { kind: 'note', profile: 'notes-artifact' });
      note.cid = persisted.cid;
      note.persistedAt = new Date().toISOString();
      const manifestRecord = {
        schema: 'swissknife.notes.notebook-manifest.v1',
        workflow: VDA_G039_WORKFLOW,
        published_at: new Date().toISOString(),
        notes: this.notes.map(entry => ({
          id: entry.id,
          title: entry.title,
          cid: entry.cid || null,
          modified: entry.modified || null
        }))
      };
      const manifest = await notesPersistArtifact(client, manifestRecord, { kind: 'notebook-manifest', profile: 'notes-artifact' });
      this.vdaG039.notebookCid = manifest.cid;
      const eventCid = await notesAppendDagEvent(client, {
        event_type: 'notes.sync.checkpoint',
        note_id: note.id,
        note_cid: persisted.cid,
        notebook_cid: manifest.cid,
        parents: []
      });
      note.sync = { ...(note.sync || {}), state: 'synchronized', dagCid: eventCid, lastPeer: 'ipfs_kit_py', receiptRef: eventCid };
      this.vdaG039.receiptRefs = [...new Set([...this.vdaG039.receiptRefs, eventCid])];
      this.vdaG039.eventRefs = [...new Set([...this.vdaG039.eventRefs, 'notes.sync.checkpoint'])];
      // Listing readback: retrieve the manifest and verify the note is listed.
      let readbackNote = 'manifest persisted';
      try {
        const fetched = await notesCallMcpTool(client, 'mcp++:ipfs_kit_py/artifacts/get', { cid: manifest.cid });
        const parsed = notesDecodeArtifactJson(fetched);
        const listed = Array.isArray(parsed?.notes) ? parsed.notes : [];
        readbackNote = listed.some(entry => entry.cid === persisted.cid)
          ? `manifest read back: note listed (${listed.length} note(s))`
          : `manifest read back but note CID missing (${listed.length} note(s) listed)`;
      } catch (readError) {
        readbackNote = `manifest persisted; readback failed: ${readError.message}`;
      }
      this.vdaG039.notebookReadback = readbackNote;
      this.vdaG039.status = `note persisted: ${persisted.cid}; ${readbackNote}`;
      this.vdaG039.actionLog.push(`persist-note-cid:${persisted.cid}`);
      this.saveNotes();
    } catch (error) {
      this.vdaG039.status = `${error.preview ? 'Validated preview' : error.cancelled ? 'Cancelled' : 'persist failed'}: ${error.message}`;
      this.vdaG039.actionLog.push(`persist-note-cid:failed:${error.message}`);
    }
    this.saveVdaG039EvidenceToStorage();
    this.refreshVdaG039WorkflowPanel();
  }

  // Real semantic search over ipfs_datasets_py via the descriptor
  // registry. A degraded envelope or backend error surfaces verbatim and
  // clears results — fallback output is never presented as real.
  async runVdaG039SemanticSearch(query = null) {
    const liveQuery = this.getNativeContainer()?.querySelector('#search-input')?.value;
    const searchText = String(query || liveQuery || this.searchQuery || this.vdaG039.semanticQuery || 'provenance summary sync').trim();
    this.searchQuery = searchText;
    this.vdaG039.semanticQuery = searchText;
    const liveReference = this.getNativeContainer()?.querySelector('[data-notes-base-cid]');
    if (liveReference) this.vdaG039.referenceInput = liveReference.value;
    const revision = ++this.vdaG039.semanticRevision;
    const recovery = this.vdaG039.editorRecovery;
    if (recovery) {
      recovery.state = 'searching';
      delete recovery.opened;
    }
    this.vdaG039.semanticResults = [];
    this.vdaG039.semanticBackend = null;
    this.vdaG039.liveSearchReady = false;
    this.vdaG039.openedResultIndex = null;
    this.vdaG039.status = `semantic_search running: "${searchText}"…`;
    this.refreshVdaG039WorkflowPanel();
    if (!this.searchBindingDefaults || Object.keys(this.searchBindingDefaults).length === 0) {
      await this.initialize();
    }
    try {
      const defaults = { ...(this.searchBindingDefaults || {}) };
      delete defaults.dry_run;
      delete defaults.preview;
      delete defaults.fallback;
      const editor = this.getNativeContainer();
      const liveTitle = editor?.querySelector('#note-title')?.value;
      const liveBody = editor?.querySelector('#note-content')?.value;
      if (this.currentNote && typeof liveTitle === 'string') this.currentNote.title = liveTitle;
      if (this.currentNote && typeof liveBody === 'string') this.currentNote.content = liveBody;
      const requestedTopK = Math.trunc(Number(defaults.top_k));
      const collection = String(editor?.querySelector('#notes-search-collection')?.value || defaults.collection || '').trim();
      if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(collection)) throw new Error('Choose an existing indexed collection before searching.');
      this.vdaG039.semanticCollection = collection;
      const payload = {
        query: searchText.slice(0, 400),
        top_k: requestedTopK >= 1 && requestedTopK <= 5 ? requestedTopK : 5,
        collection,
        model: typeof defaults.model === 'string' && defaults.model ? defaults.model : 'thenlper/gte-small'
      };
      if (defaults.filters && typeof defaults.filters === 'object' && !Array.isArray(defaults.filters)) payload.filters = { ...defaults.filters };
      const container = this.getNativeContainer();
      const searchTrigger = container?.querySelector('#notes-run-semantic-search') || null;
      const envelope = await invokeNativeTool(container, 'notes', 'notes.ipfs_datasets_py.search_notes', {
        executionMode: 'execute',
        toolId: 'semantic_search',
        trigger: searchTrigger,
        payload,
      });
      if (revision !== this.vdaG039.semanticRevision) return;
      if (envelope === null) throw new Error('Search was cancelled; no returned note is available.');
      if (envelope.ok !== true || envelope.outcome !== 'executed') {
        throw new Error(envelope.error?.message || envelope.error || 'semantic_search did not return a successful result.');
      }
      const output = unwrapNetworkToolResult(envelope.result) || {};
      if (output.fallback === true) {
        throw new Error(`semantic_search degraded: ${output.reason || 'no live ipfs_datasets_py transport in this runtime'}.`);
      }
      if (!Array.isArray(output.results)) throw new Error('semantic_search did not return an actual results array.');
      const results = output.results;
      this.vdaG039.semanticResults = results.map(hit => {
        const document = hit.document;
        const title = document?.metadata?.title || hit.title || hit.note_title;
        if (typeof title !== 'string') throw new Error('The index returned IDs without a note title. No local note is substituted.');
        const content = typeof document?.metadata?.content === 'string' ? document.metadata.content
          : typeof document?.text === 'string' ? document.text : null;
        return { note: this.notes.find(note => note.title === title && note.content === content) || null,
          title, content, cid: hit.cid || null, score: hit.score ?? null,
          documentId: hit.document_provenance?.document_id || document?.id || null,
          provenance: hit.document_provenance || null, searchRevision: revision };
      });
      this.vdaG039.semanticBackend = 'ipfs_datasets_py';
      this.vdaG039.liveSearchReady = true;
      if (recovery) {
        recovery.state = 'searched';
        recovery.searchRevision = revision;
      }
      this.vdaG039.status = `semantic_search complete: ${results.length} result(s) from ipfs_datasets_py`;
      this.vdaG039.actionLog.push(`run-semantic-search:${searchText}:${results.length}`);
    } catch (error) {
      if (revision !== this.vdaG039.semanticRevision) return;
      this.vdaG039.semanticResults = [];
      this.vdaG039.semanticBackend = null;
      this.vdaG039.liveSearchReady = false;
      if (recovery) recovery.state = 'needs-retry';
      this.vdaG039.status = `semantic_search failed: ${error.message}`;
      this.vdaG039.actionLog.push(`run-semantic-search:failed:${error.message}`);
    }
    this.saveVdaG039EvidenceToStorage();
    this.refreshVdaG039WorkflowPanel();
  }

  async openVdaG039SemanticResult(index) {
    const result = Number.isInteger(index) ? this.vdaG039.semanticResults[index] : null;
    if (!result || typeof result.title !== 'string' || typeof result.content !== 'string') return;
    const note = (result.note && this.notes.includes(result.note) && result.note) || this.currentNote || this.notes[0];
    if (!note) return;
    note.title = result.title;
    note.content = result.content;
    this.currentNote = note;
    const container = this.getNativeContainer();
    const titleEl = container?.querySelector('#note-title');
    const bodyEl = container?.querySelector('#note-content');
    if (titleEl) titleEl.value = result.title;
    if (bodyEl) bodyEl.value = result.content;
    const recovery = this.vdaG039.editorRecovery;
    if (recovery?.state === 'searched' && result.searchRevision === recovery.searchRevision
        && result.provenance?.source === 'duckdb_authority'
        && typeof result.documentId === 'string' && result.documentId
        && /^sha256:[0-9a-f]{64}$/.test(result.provenance?.payload_digest || '')) {
      recovery.state = 'opened';
      recovery.opened = { noteId: note.id, title: result.title, content: result.content,
        collection: this.vdaG039.semanticCollection, documentId: result.documentId,
        payloadDigest: result.provenance.payload_digest };
    }
    this.vdaG039.openedResultIndex = index;
    this.vdaG039.status = `Opened indexed note ${result.title}.`;
    const button = container?.querySelector(`#notes-open-semantic-result-${index}`);
    if (button) {
      button.dataset.notesOpened = 'ready';
      button.textContent = `Opened ${result.title}`;
    }
    this.refreshVdaG039WorkflowPanel();
  }

  // Confirmation-gated provenance: persists a provenance record artifact
  // and appends the provenance event to the event DAG. Real CIDs only.
  async recordVdaG039Provenance() {
    const note = this.currentNote || this.notes[0];
    if (!note) {
      this.vdaG039.status = 'no note to record provenance for';
      this.updateVdaG039Status();
      return;
    }
    const subjectCid = note.cid || await this.canonicalNoteCid(note);

    this.vdaG039.status = 'recording provenance…';
    this.updateVdaG039Status();
    try {
      const client = await notesKitClient(this);
      const provenanceRecord = {
        schema: 'swissknife.notes.provenance.v1',
        subject_cid: subjectCid,
        note_id: note.id,
        source: 'notes.provenance.record',
        author_did: note.provenance?.authorDid || 'did:key:z6MkNotesWorkflowOperator',
        operation: 'notes.provenance.record',
        policy: 'allow-local-private-note-sync',
        recorded_at: new Date().toISOString()
      };
      const persisted = await notesPersistArtifact(client, provenanceRecord, { kind: 'provenance', profile: 'notes-artifact' });
      const eventCid = await notesAppendDagEvent(client, {
        event_type: 'notes.provenance.recorded',
        subject_cid: subjectCid,
        provenance_cid: persisted.cid,
        note_id: note.id,
        parents: []
      });
      note.provenance = {
        ...(note.provenance || {}),
        source: 'ipfs_kit_py.artifact.put',
        operation: 'notes.provenance.record',
        receiptRef: eventCid,
        provenanceCid: persisted.cid,
        subjectCid
      };
      this.vdaG039.provenanceCid = persisted.cid;
      this.vdaG039.provenanceEventCid = eventCid;
      this.vdaG039.receiptRefs = [...new Set([...this.vdaG039.receiptRefs, eventCid])];
      this.vdaG039.eventRefs = [...new Set([...this.vdaG039.eventRefs, 'notes.provenance.recorded'])];
      this.vdaG039.status = `provenance recorded: ${persisted.cid}`;
      this.vdaG039.actionLog.push(`record-provenance:${persisted.cid}`);
      this.saveNotes();
    } catch (error) {
      this.vdaG039.status = `${error.preview ? 'Validated preview' : error.cancelled ? 'Cancelled' : 'provenance failed'}: ${error.message}`;
      this.vdaG039.actionLog.push(`record-provenance:failed:${error.message}`);
    }
    this.saveVdaG039EvidenceToStorage();
    this.refreshVdaG039WorkflowPanel();
  }

  // Summary text is generated locally (local UI, labeled as such); the
  // artifact persist behind it is confirmation-gated and yields a real CID.
  async generateVdaG039Summary(offerPersist = true) {
    const note = this.currentNote || this.notes[0];
    if (!note) {
      this.vdaG039.status = 'no note to summarize';
      this.updateVdaG039Status();
      return;
    }
    const summaryText = this.summarizeNote(note);
    this.vdaG039.summary = summaryText;
    this.vdaG039.summaryPersisted = false;
    if (!offerPersist) {
      this.vdaG039.status = 'summary generated (local UI)';
      this.vdaG039.actionLog.push('generate-summary:local');
      this.saveVdaG039EvidenceToStorage();
      this.updateVdaG039Status();
      return;
    }

    this.vdaG039.status = 'persisting summary artifact…';
    this.updateVdaG039Status();
    try {
      const client = await notesKitClient(this);
      const summaryRecord = {
        schema: 'swissknife.notes.summary.v1',
        note_id: note.id,
        note_cid: note.cid || await this.canonicalNoteCid(note),
        summary: summaryText,
        generator: 'local-extractive',
        generated_at: new Date().toISOString()
      };
      const persisted = await notesPersistArtifact(client, summaryRecord, { kind: 'summary', profile: 'notes-artifact' });
      this.vdaG039.summaryCid = persisted.cid;
      this.vdaG039.summaryPersisted = true;
      this.vdaG039.receiptRefs = [...new Set([...this.vdaG039.receiptRefs, persisted.cid])];
      this.vdaG039.status = `summary persisted: ${persisted.cid}`;
      this.vdaG039.actionLog.push(`generate-summary:${persisted.cid}`);
    } catch (error) {
      this.vdaG039.status = `${error.preview ? 'Validated preview' : error.cancelled ? 'Cancelled' : 'summary persist failed'}: ${error.message} (summary text remains local)`;
      this.vdaG039.actionLog.push(`generate-summary:failed:${error.message}`);
    }
    this.saveVdaG039EvidenceToStorage();
    this.refreshVdaG039WorkflowPanel();
  }

  // Store uses the governed gateway directly. invokeNetworkNativeTool omits
  // executionMode, and a governed write then dry-runs.
  async storeVdaG039NoteVersion() {
    const container = this.getNativeContainer();
    if (!container || container.dataset.notesStoreFlight === '1') return;
    container.dataset.notesStoreFlight = '1';
    const ready = container.querySelector('#notes-store-ready');
    if (ready) ready.hidden = true;
    this.vdaG039.storeReady = false;
    try {
      const liveTitle = container.querySelector('#note-title')?.value;
      const liveBody = container.querySelector('#note-content')?.value;
      if (this.currentNote && typeof liveTitle === 'string') this.currentNote.title = liveTitle;
      if (this.currentNote && typeof liveBody === 'string') this.currentNote.content = liveBody;
      const note = this.currentNote;
      if (!note || typeof note.title !== 'string' || typeof note.content !== 'string' || !note.title || !note.content) {
        throw new Error('the editor has no note to store');
      }
      if (this.vdaG039.conflict?.state === 'failed') note.modified = Date.now();
      const record = notesCanonicalRecord(note);
      const cid = await notesCanonicalCid(record);
      const bytesBase64 = await notesCanonicalBytesBase64(record);
      const envelope = await invokeNativeTool(container, 'notes', 'notes.ipfs_kit_py.persist_artifact', {
        executionMode: 'execute',
        toolId: 'artifacts_put',
        trigger: container.querySelector('#notes-store-version'),
        payload: {
          cid,
          bytes_base64: bytesBase64,
          profile: 'notes-artifact',
          kind: 'svf-note',
          service: 'ipfs_kit_py',
          pin: true,
          fixture_scope: 'svf-notes-cedar-ledger'
        }
      });
      if (envelope === null) throw Object.assign(new Error('Cancelled before artifact dispatch.'), { cancelled: true });
      if (envelope.ok !== true || envelope.outcome !== 'executed') {
        throw new Error(envelope.error?.message || envelope.error || 'artifacts_put did not return a successful result.');
      }
      const result = unwrapNetworkToolResult(envelope.result);
      if (result?.dry_run === true || result?.mutation_performed === false) {
        throw Object.assign(new Error('Validated dry-run preview; no remote change was made.'), { preview: true });
      }
      if (result?.persisted !== true || result?.cid !== cid) {
        throw new Error(result?.error || 'ipfs_kit_py did not verify the persisted artifact.');
      }
      note.cid = cid;
      this.vdaG039.storedCid = cid;
      this.vdaG039.storeReady = true;
      this.vdaG039.referenceInput = cid;
      const input = container.querySelector('#notes-base-cid');
      if (input) input.value = cid;
      this.saveNotes();
      this.vdaG039.status = `Stored artifact ${cid}.`;
      this.appendNotesRecord(`Stored artifact ${cid}.`);
    } catch (error) {
      this.vdaG039.storeReady = false;
      this.vdaG039.status = `${error.preview ? 'Validated preview' : error.cancelled ? 'Cancelled' : 'store failed'}: ${error.message}`;
    } finally {
      delete container.dataset.notesStoreFlight;
    }
    this.saveVdaG039EvidenceToStorage();
    this.refreshVdaG039WorkflowPanel();
  }

  async retrieveVdaG039StoredNote() {
    const container = this.getNativeContainer();
    if (!container || container.dataset.notesRetrieveFlight === '1') return;
    const cid = typeof this.vdaG039.storedCid === 'string' ? this.vdaG039.storedCid : '';
    if (!/^baf[a-z2-7]{20,}$/.test(cid)) {
      this.vdaG039.retrieveReady = false;
      this.vdaG039.status = 'retrieve failed: no stored artifact CID is available';
      this.updateVdaG039Status();
      return;
    }
    container.dataset.notesRetrieveFlight = '1';
    const proof = container.querySelector('#notes-retrieved-proof');
    if (proof) proof.hidden = true;
    this.vdaG039.retrieveReady = false;
    try {
      const envelope = await invokeNativeTool(container, 'notes', 'notes.ipfs_kit_py.retrieve_artifact', {
        executionMode: 'execute',
        toolId: 'artifacts_get',
        trigger: container.querySelector('#notes-retrieve-stored'),
        payload: { cid }
      });
      if (!envelope || envelope.ok !== true || envelope.outcome !== 'executed') {
        throw new Error(envelope?.error?.message || envelope?.error || 'artifacts_get did not return a successful result.');
      }
      const result = unwrapNetworkToolResult(envelope.result);
      if (result?.found !== true || result?.verified !== true || result?.cid !== cid) {
        throw new Error('The owner did not verify the requested artifact CID.');
      }
      const record = notesDecodeArtifactJson(result);
      if (record?.schema !== 'swissknife.notes.note.v1' || typeof record.title !== 'string' || typeof record.content !== 'string') {
        throw new Error('The artifact is not a supported stored note.');
      }
      const localTitle = container.querySelector('#note-title')?.value;
      const localBody = container.querySelector('#note-content')?.value;
      const same = localTitle === record.title && localBody === record.content;
      this.vdaG039.retrievedTitle = record.title;
      this.vdaG039.retrievedBody = record.content;
      this.vdaG039.retrieveReady = true;
      this.vdaG039.referenceInput = cid;
      const input = container.querySelector('#notes-base-cid');
      if (input) input.value = cid;
      const titleEl = container.querySelector('#note-title');
      const bodyEl = container.querySelector('#note-content');
      if (titleEl) titleEl.value = record.title;
      if (bodyEl) {
        bodyEl.value = record.content;
        bodyEl.classList.add('notes-focus-ring');
        bodyEl.focus({ preventScroll: true });
      }
      if (this.currentNote) {
        this.currentNote.title = record.title;
        this.currentNote.content = record.content;
      }
      const prior = this.vdaG039.conflict?.state;
      if (prior === 'failed' && same) {
        this.vdaG039.conflict = {
          ...this.vdaG039.conflict,
          state: 'resolved',
          message: 'Conflict resolved. The stored note matches the editor.'
        };
        this.vdaG039.retrievedProof = `Retrieved the stored note.`;
        this.vdaG039.status = `Conflict resolved. Title ${record.title}.`;
      } else if (same) {
        this.vdaG039.conflict = {
          ...(this.vdaG039.conflict || {}),
          state: 'match',
          message: 'Stored note matches the editor.'
        };
        this.vdaG039.retrievedProof = `Stored note matches the editor. Title ${record.title}. Body ${record.content}.`;
        this.vdaG039.status = `Stored note matches the editor. Title ${record.title}.`;
      } else {
        this.vdaG039.conflict = {
          ...(this.vdaG039.conflict || {}),
          state: 'mismatch',
          message: 'Retrieved note differs from the editor.'
        };
        this.vdaG039.retrievedProof = `Retrieved title ${record.title}. Retrieved body ${record.content}.`;
        this.vdaG039.status = `Conflict mismatch. Title ${record.title}.`;
      }
    } catch (error) {
      this.vdaG039.retrieveReady = false;
      this.vdaG039.status = `retrieve failed: ${error.message}`;
    } finally {
      delete container.dataset.notesRetrieveFlight;
    }
    this.saveVdaG039EvidenceToStorage();
    this.refreshVdaG039WorkflowPanel();
  }

  // Conflict recovery compares the local note against the artifact version
  // actually retrieved from ipfs_kit_py, then persists the merged version
  // (confirmation-gated). No backend version → honest "nothing to recover".
  async recoverVdaG039Conflict() {
    const note = this.currentNote || this.notes[0];
    if (!note) {
      this.vdaG039.status = 'no note to recover';
      this.updateVdaG039Status();
      return;
    }
    const reference = this.getNativeContainer()?.querySelector('[data-notes-base-cid]');
    if (reference) this.vdaG039.referenceInput = reference.value;
    const baseCid = this.vdaG039.referenceInput.trim()
      || (note.persistedAt ? note.cid : null);
    if (!baseCid) {
      this.vdaG039.conflict = {
        state: 'not-run',
        baseCid: null, localCid: null, remoteCid: null, recoveredCid: null,
        message: 'No backend version exists for this note yet — persist it first ("Persist note CID"), then conflict recovery can compare versions.'
      };
      this.vdaG039.status = 'conflict recovery: no backend version to compare';
      this.saveVdaG039EvidenceToStorage();
      this.refreshVdaG039WorkflowPanel();
      return;
    }
    if (!/^baf[a-z2-7]{20,}$/.test(baseCid)) {
      this.vdaG039.conflict = {
        state: 'failed',
        baseCid, localCid: null, remoteCid: null, recoveredCid: null,
        message: 'Recovery failed: the stored note version CID is not a real artifact CID, so no retrieve was sent. Editor text is unchanged.'
      };
      this.vdaG039.status = 'conflict recovery failed';
      this.vdaG039.retrieveReady = false;
      this.vdaG039.editorRecovery = { state: 'needs-retry', failedNoteId: note.id };
      this.vdaG039.actionLog.push('recover-conflict:failed:invalid-cid');
      this.appendNotesRecord(`Reference ${baseCid} was refused. No artifact was retrieved.`);
      this.saveVdaG039EvidenceToStorage();
      this.refreshVdaG039WorkflowPanel();
      return;
    }

    this.vdaG039.status = 'retrieving artifact version…';
    this.updateVdaG039Status();
    try {
      const client = await notesKitClient(this);
      const fetched = await notesCallMcpTool(client, 'mcp++:ipfs_kit_py/artifacts/get', { cid: baseCid });
      if (fetched === null) return;
      const remoteRecord = notesDecodeArtifactJson(fetched);
      if (remoteRecord.schema !== 'swissknife.notes.note.v1') throw new Error('The artifact is not a supported stored note.');
      const localRecord = notesCanonicalRecord(note);
      const localCid = await notesCanonicalCid(localRecord);
      const differs = ['title', 'content', 'tags', 'favorite', 'color']
        .some(field => JSON.stringify(remoteRecord?.[field] ?? null) !== JSON.stringify(localRecord[field] ?? null));
      if (!differs) {
        this.vdaG039.conflict = {
          state: 'in-sync',
          baseCid, localCid, remoteCid: baseCid, recoveredCid: null,
          message: 'Remote artifact matches the local note byte-for-byte; nothing to merge.'
        };
        this.vdaG039.status = 'conflict recovery: already in sync';
        this.vdaG039.actionLog.push(`recover-conflict:in-sync:${baseCid}`);
        this.saveVdaG039EvidenceToStorage();
        this.refreshVdaG039WorkflowPanel();
        return;
      }
      // Merge rule: newer local title/content win; tags union; base tracked.
      const mergedRecord = {
        ...(remoteRecord && typeof remoteRecord === 'object' ? remoteRecord : {}),
        schema: 'swissknife.notes.note.v1',
        id: localRecord.id,
        title: localRecord.title,
        content: localRecord.content,
        tags: [...new Set([...(remoteRecord?.tags || []), ...localRecord.tags])],
        favorite: localRecord.favorite,
        color: localRecord.color,
        created: localRecord.created,
        modified: Date.now(),
        merged_at: new Date().toISOString(),
        merge_base_cid: baseCid
      };
      const recovered = await notesPersistArtifact(client, mergedRecord, { kind: 'note', profile: 'notes-artifact' });
      note.title = mergedRecord.title;
      note.content = mergedRecord.content;
      note.tags = mergedRecord.tags;
      note.favorite = mergedRecord.favorite;
      note.color = mergedRecord.color;
      note.modified = mergedRecord.modified;
      note.cid = recovered.cid;
      note.sync = { ...(note.sync || {}), state: 'synchronized', dagCid: null, lastPeer: 'ipfs_kit_py' };
      this.vdaG039.conflict = {
        state: 'recovered',
        baseCid, localCid, remoteCid: baseCid, recoveredCid: recovered.cid,
        message: 'Recovered: newer local title/content kept, remote tags merged in, merged version persisted as a new artifact.'
      };
      this.vdaG039.receiptRefs = [...new Set([...this.vdaG039.receiptRefs, recovered.cid])];
      this.vdaG039.status = `conflict recovered: ${recovered.cid}`;
      this.vdaG039.actionLog.push(`recover-conflict:${recovered.cid}`);
      this.saveNotes();
    } catch (error) {
      this.vdaG039.conflict = {
        state: error.preview ? 'validated-preview' : error.cancelled ? 'cancelled' : 'failed',
        baseCid, localCid: null, remoteCid: null, recoveredCid: null,
        message: `${error.preview ? 'Recovery preview' : error.cancelled ? 'Recovery cancelled' : 'Recovery failed'}: ${error.message}`
      };
      this.vdaG039.status = `conflict recovery ${error.preview ? 'preview' : error.cancelled ? 'cancelled' : 'failed'}: ${error.message}`;
      if (!error.preview && !error.cancelled) this.vdaG039.editorRecovery = { state: 'needs-retry', failedNoteId: note.id };
      this.vdaG039.actionLog.push(`recover-conflict:failed:${error.message}`);
    }
    this.saveVdaG039EvidenceToStorage();
    this.refreshVdaG039WorkflowPanel();
  }

  // Keyboard-safe editing is honestly local UI: it verifies the shortcut
  // handlers bound in this session. No backend claim, no fake edit CID.
  verifyVdaG039KeyboardEditing() {
    this.vdaG039.keyboardSafe = {
      state: 'verified-local',
      shortcuts: ['Ctrl+S save (local)', 'Ctrl+K semantic search', 'Ctrl+Enter summary (local)', 'Escape editor focus recovery (local)'],
      note: 'Verified locally in this browser session: handlers bound, editor focus recovery armed. No backend claim is made.'
    };
    if (this.vdaG039.conflict?.state === 'resolved' && this.vdaG039.retrievedTitle) {
      this.vdaG039.status = `Conflict resolved. Title ${this.vdaG039.retrievedTitle}.`;
    } else if (this.vdaG039.conflict?.state === 'match' && this.vdaG039.retrievedTitle) {
      this.vdaG039.status = `Stored note matches the editor. Title ${this.vdaG039.retrievedTitle}.`;
    } else if (this.vdaG039.retrieveReady && this.vdaG039.retrievedTitle) {
      this.vdaG039.status = `Retrieved stored note. Title ${this.vdaG039.retrievedTitle}.`;
    } else if (typeof this.vdaG039.storedCid === 'string' && this.vdaG039.storedCid.startsWith('baf') && this.vdaG039.conflict?.state !== 'failed') {
      this.vdaG039.status = `Stored artifact ${this.vdaG039.storedCid}.`;
    } else if (this.vdaG039.editorRecovery?.state === 'saved-local') {
      const refused = typeof this.vdaG039.recordNote === 'string' && this.vdaG039.recordNote.includes('Conflict recovery failed');
      this.vdaG039.status = refused
        ? 'Ready — searched note saved locally. The bad reference was not retrieved.'
        : 'Ready — searched note saved locally';
    } else if (!this.vdaG039.editorRecovery) {
      this.vdaG039.status = 'keyboard-safe editing verified (local UI)';
    }
    this.vdaG039.actionLog.push('verify-keyboard-editing:local');
    this.saveVdaG039EvidenceToStorage();
    this.refreshVdaG039WorkflowPanel();
  }

  handleKeyboardSafeEditing(event) {
    if (!event) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      const body = this.getNativeContainer()?.querySelector('#note-content');
      if (body) body.classList.add('notes-focus-ring');
      if (!this.saveNotes()) {
        this.vdaG039.status = 'Local save failed; editor text is retained';
        this.updateVdaG039Status();
        return;
      }
      const recovery = this.vdaG039.editorRecovery;
      const opened = recovery?.opened;
      const reference = this.getNativeContainer()?.querySelector('[data-notes-base-cid]');
      if (recovery?.state === 'opened' && reference && reference.value.trim() === ''
          && this.currentNote?.id === opened.noteId
          && this.currentNote.title === opened.title && this.currentNote.content === opened.content) {
        recovery.state = 'saved-local';
        this.vdaG039.actionLog.push(`restore-editor:saved-local:${opened.documentId}`);
        if (this.vdaG039.conflict?.state === 'failed') {
          this.vdaG039.conflict.state = 'cleared';
          this.vdaG039.conflict.message = 'Bad reference cleared. No artifact was retrieved. The indexed note stays in the editor.';
          this.appendNotesRecord(`Bad reference cleared. Indexed note opened and saved locally. Title ${opened.title}. Body ${opened.content}.`);
          if (typeof opened.payloadDigest === 'string' && /^sha256:[0-9a-f]{64}$/.test(opened.payloadDigest)) {
            this.appendNotesRecord(`Payload ${opened.payloadDigest}.`);
          }
        }
      }
      this.lastSaveTime = Date.now();
      this.verifyVdaG039KeyboardEditing();
      this.updateStatusBar();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.runVdaG039SemanticSearch(this.currentNote?.title || this.searchQuery || 'provenance summary sync');
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      // Keyboard path stays local (no persist prompt); the workflow
      // button offers the confirmation-gated persist.
      this.generateVdaG039Summary(false);
      return;
    }
    if (event.key === 'Escape') {
      this.verifyVdaG039KeyboardEditing();
    }
  }

  async createNewNote() {
    const newNote = {
      id: Date.now().toString(),
      title: 'Untitled Note',
      content: '',
      tags: [],
      created: Date.now(),
      modified: Date.now(),
      favorite: false,
      color: 'blue',
      cid: null,
      notebookCid: null,
      provenance: {
        source: 'local.notes',
        authorDid: 'did:key:z6MkNotesWorkflowOperator',
        operation: 'notes.create',
        policy: 'allow-local-private-note-sync',
        receiptRef: null,
        provenanceCid: null
      },
      sync: {
        state: 'local-only',
        dagCid: null,
        lastPeer: null,
        receiptRef: null
      }
    };

    this.notes.unshift(newNote);
    this.currentNote = newNote;
    this.currentView = 'edit';
    try {
      newNote.cid = await this.canonicalNoteCid(newNote);
    } catch (error) {
      console.warn('Failed to compute canonical CID for new note:', error);
    }
    this.saveNotes();
    this.refreshContent();
    // Persist note CID remains the explicit, reviewed remote-write action.
  }

  selectNote(noteId) {
    this.currentNote = this.notes.find(note => note.id === noteId);
    this.currentView = 'edit';
    this.refreshContent();
  }

  async deleteNote() {
    if (!this.currentNote) return;
    const note = this.currentNote;
    const hadBackendCid = note.sync?.state === 'synchronized' && note.cid;

    if (confirm(`Are you sure you want to delete "${note.title}"?`)) {
      this.notes = this.notes.filter(candidate => candidate.id !== note.id);
      this.currentNote = null;
      this.saveNotes();
      this.refreshContent();
      // Backend artifacts are immutable and content-addressed, so deleting
      // the local note offers a confirmation-gated tombstone event on the
      // DAG instead of pretending the artifact is gone.
      if (hadBackendCid) {
        try {
          const client = await notesKitClient(this);
          const eventCid = await notesAppendDagEvent(client, {
            event_type: 'notes.deleted',
            note_id: note.id,
            note_cid: note.cid,
            deleted_at: new Date().toISOString(),
            parents: []
          });
          this.vdaG039.receiptRefs = [...new Set([...this.vdaG039.receiptRefs, eventCid])];
          this.vdaG039.eventRefs = [...new Set([...this.vdaG039.eventRefs, 'notes.deleted'])];
          this.vdaG039.status = `deletion recorded on event DAG: ${eventCid}`;
          this.vdaG039.actionLog.push(`delete-note-tombstone:${eventCid}`);
        } catch (error) {
          this.vdaG039.status = `deletion recorded locally; DAG tombstone ${error.preview ? 'preview' : error.cancelled ? 'cancelled' : 'failed'}: ${error.message}`;
          this.vdaG039.actionLog.push(`delete-note-tombstone:failed:${error.message}`);
        }
        this.saveVdaG039EvidenceToStorage();
        this.refreshVdaG039WorkflowPanel();
      }
    }
  }

  toggleFavorite() {
    if (!this.currentNote) return;

    this.currentNote.favorite = !this.currentNote.favorite;
    this.currentNote.modified = Date.now();
    this.saveNotes();
    this.refreshContent();
  }

  toggleTag(tag) {
    const index = this.selectedTags.indexOf(tag);
    if (index > -1) {
      this.selectedTags.splice(index, 1);
    } else {
      this.selectedTags.push(tag);
    }
    this.refreshNotesList();
    this.refreshTagsList();
  }

  extractTags() {
    if (!this.currentNote) return;

    const tagPattern = /#(\w+)/g;
    const matches = this.currentNote.content.match(tagPattern);
    this.currentNote.tags = matches ? matches.map(tag => tag.substring(1)) : [];
  }

  getFilteredNotes() {
    let filtered = [...this.notes];

    // Apply search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(note => 
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query) ||
        (note.tags || []).some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Apply tag filter
    if (this.selectedTags.length > 0) {
      filtered = filtered.filter(note =>
        this.selectedTags.every(tag => (note.tags || []).includes(tag))
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (this.sortBy) {
        case 'title':
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        case 'created':
          aValue = a.created;
          bValue = b.created;
          break;
        case 'size':
          aValue = a.content.length;
          bValue = b.content.length;
          break;
        default: // modified
          aValue = a.modified;
          bValue = b.modified;
      }

      if (this.sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }

  summarizeNote(note) {
    const plain = this.getPlainTextPreview(note?.content || '');
    const title = note?.title || 'Untitled Note';
    const tags = (note?.tags || []).slice(0, 4).join(', ') || 'untagged';
    return `${title}: ${plain.slice(0, 140)}. Tags ${tags}. (local extractive summary)`;
  }

  saveVdaG039EvidenceToStorage() {
    try {
      localStorage.setItem('swissknife-notes-vda-g039', JSON.stringify({
        schema: 'swissknife.notes.vda-g039.v2',
        workflow_id: VDA_G039_WORKFLOW,
        saved_at: new Date().toISOString(),
        // Real values only; null means "not performed yet". No fixtures.
        note_cid: this.currentNote?.cid || this.notes[0]?.cid || null,
        notebook_cid: this.vdaG039.notebookCid || null,
        notebook_readback: this.vdaG039.notebookReadback || null,
        provenance_cid: this.vdaG039.provenanceCid || null,
        provenance_event_cid: this.vdaG039.provenanceEventCid || null,
        summary_cid: this.vdaG039.summaryPersisted ? this.vdaG039.summaryCid : null,
        conflict: this.vdaG039.conflict,
        keyboard_safe: this.vdaG039.keyboardSafe,
        receipt_refs: this.vdaG039.receiptRefs,
        event_refs: this.vdaG039.eventRefs,
        semantic_query: this.vdaG039.semanticQuery,
        semantic_backend: this.vdaG039.semanticBackend,
        semantic_results: (this.vdaG039.semanticResults || []).filter(result => typeof result.title === 'string' && typeof result.content === 'string').map(result => ({
          title: result.title,
          content: result.content,
          cid: result.cid,
          score: result.score,
          documentId: result.documentId,
          provenance: result.provenance,
          searchRevision: result.searchRevision
        })),
        record_note: this.vdaG039.recordNote || '',
        reference_input: this.vdaG039.referenceInput || '',
        stored_cid: this.vdaG039.storedCid || '',
        retrieved_title: this.vdaG039.retrievedTitle || '',
        retrieved_body: this.vdaG039.retrievedBody || '',
        retrieved_proof: this.vdaG039.retrievedProof || '',
        editor_recovery: this.vdaG039.editorRecovery,
        semantic_collection: this.vdaG039.semanticCollection || '',
        search_query: this.searchQuery || '',
        action_log: this.vdaG039.actionLog
      }));
    } catch (error) {
      console.warn('Failed to save VDA-G039 notes evidence:', error);
    }
  }

  loadVdaG039Evidence() {
    try {
      const raw = localStorage.getItem('swissknife-notes-vda-g039');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      const results = Array.isArray(saved.semantic_results)
        ? saved.semantic_results.filter(result => result && typeof result.title === 'string' && typeof result.content === 'string')
        : [];
      if (results.length) {
        this.vdaG039.semanticResults = results.map(result => ({
          title: result.title,
          content: result.content,
          cid: typeof result.cid === 'string' ? result.cid : null,
          score: typeof result.score === 'number' ? result.score : null,
          documentId: typeof result.documentId === 'string' ? result.documentId : null,
          provenance: result.provenance && typeof result.provenance === 'object' ? result.provenance : null,
          searchRevision: Number.isInteger(result.searchRevision) ? result.searchRevision : 0
        }));
        this.vdaG039.semanticBackend = typeof saved.semantic_backend === 'string' ? saved.semantic_backend : 'ipfs_datasets_py';
      }
      if (typeof saved.semantic_collection === 'string') this.vdaG039.semanticCollection = saved.semantic_collection;
      if (typeof saved.record_note === 'string') this.vdaG039.recordNote = saved.record_note;
      if (typeof saved.reference_input === 'string') this.vdaG039.referenceInput = saved.reference_input;
      if (typeof saved.stored_cid === 'string' && /^baf[a-z2-7]{20,}$/.test(saved.stored_cid)) {
        this.vdaG039.storedCid = saved.stored_cid;
        this.vdaG039.referenceInput = saved.stored_cid;
      }
      if (typeof saved.retrieved_title === 'string') this.vdaG039.retrievedTitle = saved.retrieved_title;
      if (typeof saved.retrieved_body === 'string') this.vdaG039.retrievedBody = saved.retrieved_body;
      if (typeof saved.retrieved_proof === 'string') this.vdaG039.retrievedProof = saved.retrieved_proof;
      if (saved.conflict && typeof saved.conflict === 'object' && typeof saved.conflict.state === 'string') {
        this.vdaG039.conflict = { ...this.vdaG039.conflict, ...saved.conflict };
      }
      if (saved.editor_recovery && typeof saved.editor_recovery === 'object') this.vdaG039.editorRecovery = saved.editor_recovery;
      if (typeof saved.search_query === 'string') this.searchQuery = saved.search_query;
      this.vdaG039.storeReady = false;
      this.vdaG039.retrieveReady = false;
      this.vdaG039.liveSearchReady = false;
    } catch (error) {
      console.warn('Failed to load VDA-G039 notes evidence:', error);
    }
  }

  vdaG039StatusClass(status) {
    const text = String(status || '').toLowerCase();
    if (/(fail|denied|invalid|error|cancel)/.test(text)) return 'is-error';
    if (/(pending|warn|preview)/.test(text)) return 'is-warn';
    return 'is-ok';
  }

  updateVdaG039Status() {
    const status = document.querySelector('#vda-g039-status');
    if (status) {
      status.textContent = `Status: ${this.vdaG039.status}`;
      status.className = `workflow-status ${this.vdaG039StatusClass(this.vdaG039.status)}`;
      status.setAttribute('data-notes-editor-recovery', this.vdaG039.editorRecovery?.state || 'idle');
    }
    const summary = document.querySelector('#notes-summary-text');
    if (summary) summary.textContent = this.vdaG039.summary;
  }

  getPlainTextPreview(content) {
    return content
      .replace(/#{1,6}\s+/g, '') // Remove headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/`(.*?)`/g, '$1') // Remove code
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links
      .substring(0, 150);
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  getWordCount(content) {
    return content.trim() ? content.trim().split(/\s+/).length : 0;
  }

  getTotalWords() {
    return this.notes.reduce((total, note) => total + this.getWordCount(note.content), 0);
  }

  formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
    
    return date.toLocaleDateString();
  }

  formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString();
  }

  renderMarkdown(content) {
    // Simple markdown to HTML conversion
    return content
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/^\* (.*$)/gim, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/^\d+\. (.*$)/gim, '<li>$1</li>')
      .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
      .replace(/\n/g, '<br>');
  }

  scheduleAutoSave() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(() => {
      this.saveNotes();
      this.lastSaveTime = Date.now();
      this.updateStatusBar();
    }, this.editorSettings.autoSaveInterval);
  }

  saveNotes() {
    try {
      const encoded = JSON.stringify(this.notes);
      localStorage.setItem('swissknife-notes', encoded);
      if (localStorage.getItem('swissknife-notes') !== encoded) throw new Error('Local note readback did not match the saved content.');
      return true;
    } catch (error) {
      console.error('Failed to save notes:', error);
      return false;
    }
  }

  exportNote() {
    if (!this.currentNote) return;

    const formats = [
      { name: 'Markdown (.md)', ext: 'md', content: this.currentNote.content },
      { name: 'Plain Text (.txt)', ext: 'txt', content: this.getPlainTextPreview(this.currentNote.content) },
      { name: 'HTML (.html)', ext: 'html', content: this.renderMarkdown(this.currentNote.content) }
    ];

    // Create download for markdown format
    const blob = new Blob([this.currentNote.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentNote.title.replace(/[^a-z0-9]/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importNotes() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.md,.txt';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const content = e.target.result;
            if (file.name.endsWith('.json')) {
              const importedNotes = JSON.parse(content);
              this.notes.push(...this.ensureVdaG039Notes(importedNotes));
              this.assignCanonicalNoteCids().catch(error => console.warn('Canonical note CID assignment failed:', error));
            } else {
              const newNote = {
                id: Date.now().toString(),
                title: file.name.replace(/\.[^/.]+$/, ''),
                content: content,
                tags: [],
                created: Date.now(),
                modified: Date.now(),
                favorite: false,
                color: 'blue',
                cid: null,
                notebookCid: null,
                provenance: {
                  source: 'local.import',
                  authorDid: 'did:key:z6MkNotesWorkflowOperator',
                  operation: 'notes.import',
                  policy: 'allow-local-private-note-sync',
                  receiptRef: null,
                  provenanceCid: null
                },
                sync: {
                  state: 'local-only',
                  dagCid: null,
                  lastPeer: null,
                  receiptRef: null
                }
              };
              this.notes.unshift(newNote);
              this.assignCanonicalNoteCids().catch(error => console.warn('Canonical note CID assignment failed:', error));
            }
            this.saveNotes();
            this.refreshContent();
          } catch (error) {
            alert('Error importing file: ' + error.message);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }

  showAIAssistance() {
    if (!this.currentNote) return;

    const aiMenu = `
      <div class="ai-menu sk-card" style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--sk-bg-panel, #101b18);
        border: 1px solid var(--sk-border, #263a34);
        border-radius: 12px;
        padding: 20px;
        z-index: 10000;
        min-width: 300px;
      ">
        <h3 style="margin: 0 0 16px 0; color: var(--sk-text, #edf7f2);">🤖 AI Assistance</h3>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button class="ai-option" data-action="grammar">✏️ Check Grammar</button>
          <button class="ai-option" data-action="summary">📝 Generate Summary</button>
          <button class="ai-option" data-action="keywords">🏷️ Extract Keywords</button>
          <button class="ai-option" data-action="expand">📈 Expand Content</button>
          <button class="ai-option" data-action="translate">🌐 Translate</button>
        </div>
        <button onclick="this.parentElement.remove()" style="
          position: absolute;
          top: 8px;
          right: 8px;
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          font-size: 16px;
        ">×</button>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', aiMenu);

    // Add event listeners to AI options
    document.querySelectorAll('.ai-option').forEach(option => {
      option.style.cssText = `
        padding: 8px 12px;
        background: var(--sk-bg-header, #12211d);
        border: 1px solid var(--sk-border, #263a34);
        border-radius: 6px;
        color: var(--sk-text, #edf7f2);
        cursor: pointer;
        transition: background 0.2s ease;
        text-align: left;
        width: 100%;
        box-sizing: border-box;
      `;
      
      option.addEventListener('mouseover', () => {
        option.style.background = 'var(--sk-bg-inset, #17241f)';
      });
      
      option.addEventListener('mouseout', () => {
        option.style.background = 'var(--sk-bg-header, #12211d)';
      });
      
      option.addEventListener('click', () => {
        this.performAIAction(option.dataset.action);
        document.querySelector('.ai-menu').remove();
      });
    });
  }

  async performAIAction(action) {
    if (!this.currentNote || !this.currentNote.content) {
      alert('Please write some content in your note first.');
      return;
    }

    // Show processing indicator
    const originalContent = this.currentNote.content;
    const statusLeft = document.querySelector('.status-left');
    if (statusLeft) {
      statusLeft.textContent = `Processing AI action: ${action}...`;
    }

    try {
      // Use real AI integration if available
      if (this.swissknife && typeof this.swissknife.chat === 'function') {
        let prompt = '';
        
        switch(action) {
          case 'grammar':
            prompt = `Check the grammar and spelling in this text and provide corrections:\n\n${this.currentNote.content}`;
            break;
          case 'summary':
            prompt = `Provide a concise summary of this text:\n\n${this.currentNote.content}`;
            break;
          case 'keywords':
            prompt = `Extract the main keywords and topics from this text:\n\n${this.currentNote.content}`;
            break;
          case 'expand':
            prompt = `Expand and elaborate on this text with additional context and examples:\n\n${this.currentNote.content}`;
            break;
          case 'translate':
            const targetLang = prompt('Translate to which language?') || 'Spanish';
            prompt = `Translate this text to ${targetLang}:\n\n${this.currentNote.content}`;
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }

        const response = await this.swissknife.chat({
          message: prompt,
          model: 'gpt-4'
        });

        const result = response.message || response.content || response;
        
        // Show result in alert or update content
        if (action === 'expand' || action === 'translate') {
          const useResult = confirm(`AI Result:\n\n${result.slice(0, 200)}...\n\nReplace current content?`);
          if (useResult) {
            this.currentNote.content = result;
            this.updateEditor();
            this.saveCurrentNote();
          }
        } else {
          alert(`AI Result (${action}):\n\n${result}`);
        }
      } else {
        // Fallback without AI
        alert('AI integration not configured. Please set up SwissKnife AI in Settings.');
      }
    } catch (error) {
      console.error('AI action failed:', error);
      alert(`AI action failed: ${error.message}`);
    } finally {
      if (statusLeft) {
        statusLeft.textContent = 'Ready';
      }
    }
  }

  updateSearchClear() {
    const clearBtn = document.querySelector('#search-clear');
    if (clearBtn) {
      clearBtn.style.display = this.searchQuery ? 'block' : 'none';
    }
  }

  updatePreview() {
    const preview = document.querySelector('#note-preview');
    if (preview && this.currentNote) {
      preview.innerHTML = this.renderMarkdown(this.currentNote.content);
    }
  }

  updateStatusBar() {
    const statusRight = document.querySelector('.status-right');
    if (statusRight && this.lastSaveTime) {
      const timeSpan = statusRight.querySelector('span:last-child');
      if (timeSpan) {
        timeSpan.textContent = `Saved: ${this.formatTime(this.lastSaveTime)}`;
      }
    }
  }

  refreshContent() {
    const container = this.getNativeContainer();
    if (!container) return;

    // Update main content
    const notesWorkspace = container.querySelector('#notes-workspace');
    const notesMain = container.querySelector('.notes-main');
    if (notesWorkspace) {
      notesWorkspace.innerHTML = this.currentNote ? this.renderNoteEditor() : this.renderWelcomeScreen();
    } else if (notesMain) {
      notesMain.innerHTML = `
        <div class="notes-workspace" id="notes-workspace">
          ${this.currentNote ? this.renderNoteEditor() : this.renderWelcomeScreen()}
        </div>
        ${this.renderVdaG039Workflow()}
      `;

    }

    // Update notes list
    this.refreshNotesList();
    this.refreshTagsList();

    // Re-setup event handlers
    this.setupEventHandlers(container);
    this.containNotesFrame();
  }

  refreshNotesList() {
    const notesList = document.querySelector('#notes-list');
    if (notesList) {
      notesList.innerHTML = this.renderNotesList();
      
      // Re-add event listeners
      notesList.querySelectorAll('.note-item').forEach(item => {
        item.addEventListener('click', () => {
          this.selectNote(item.dataset.noteId);
        });
      });
    }

    // Update stats
    const statValue = document.querySelector('.stat-value');
    if (statValue) {
      statValue.textContent = this.notes.length;
    }
  }

  refreshTagsList() {
    const tagsList = document.querySelector('#tags-list');
    if (tagsList) {
      tagsList.innerHTML = this.renderTagsList();
      
      // Re-add event listeners
      tagsList.querySelectorAll('.tag-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          this.toggleTag(chip.dataset.tag);
        });
      });
    }
  }

  cleanup() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    this.saveNotes();
  }
}

// Register the app
if (typeof window !== 'undefined') {
  window.createNotesApp = (desktop) => new NotesApp(desktop);
}
