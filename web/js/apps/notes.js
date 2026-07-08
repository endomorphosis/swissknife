/**
 * Advanced Notes App for SwissKnife Web Desktop
 * Feature-rich note-taking with markdown support, tags, search, and AI assistance
 */

export class NotesApp {
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
  }

  initializeNotes() {
    // Load notes from storage
    try {
      const stored = localStorage.getItem('swissknife-notes');
      if (stored) {
        this.notes = JSON.parse(stored);
      } else {
        // Create sample notes
        this.notes = [
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
        ];
        this.saveNotes();
      }
    } catch (error) {
      console.warn('Failed to load notes:', error);
      this.notes = [];
    }
  }

  async initialize() {
    // App is ready for rendering
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
              <input type="text" class="search-input" id="search-input" 
                     placeholder="Search notes..." value="${this.searchQuery}">
              <button class="search-clear" id="search-clear" style="display: ${this.searchQuery ? 'block' : 'none'}">×</button>
            </div>
            <div class="search-filters">
              <select class="filter-select" id="sort-by">
                <option value="modified" ${this.sortBy === 'modified' ? 'selected' : ''}>Last Modified</option>
                <option value="created" ${this.sortBy === 'created' ? 'selected' : ''}>Date Created</option>
                <option value="title" ${this.sortBy === 'title' ? 'selected' : ''}>Title</option>
                <option value="size" ${this.sortBy === 'size' ? 'selected' : ''}>Size</option>
              </select>
              <button class="view-toggle" id="view-toggle" title="Toggle View">
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
          ${this.currentNote ? this.renderNoteEditor() : this.renderWelcomeScreen()}
        </div>
      </div>

      <style>
        .notes-container {
          display: flex;
          height: 100%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', roboto, sans-serif;
          overflow: hidden;
        }

        .notes-sidebar {
          width: 320px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border-right: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          flex-direction: column;
          overflow: hidden;
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
          background: linear-gradient(135deg, #4ade80, #22c55e);
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
          box-shadow: 0 4px 20px rgba(74, 222, 128, 0.3);
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
          padding: 10px 12px;
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
          border-color: rgba(74, 222, 128, 0.6);
          box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.2);
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
          background: linear-gradient(135deg, #4ade80, #22c55e);
          border-color: rgba(74, 222, 128, 0.6);
        }

        .notes-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
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
          transform: translateX(2px);
        }

        .note-item.active {
          background: rgba(74, 222, 128, 0.2);
          border-left-color: #4ade80;
        }

        .note-item.blue { border-left-color: #3b82f6; }
        .note-item.green { border-left-color: #22c55e; }
        .note-item.orange { border-left-color: #f59e0b; }
        .note-item.red { border-left-color: #ef4444; }
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
          color: #fbbf24;
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
          color: #4ade80;
        }

        .stat-label {
          font-size: 11px;
          opacity: 0.7;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .notes-main {
          flex: 1;
          background: rgba(255, 255, 255, 0.02);
          display: flex;
          flex-direction: column;
          overflow: hidden;
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
          background: linear-gradient(135deg, #4ade80, #22c55e);
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
          box-shadow: 0 4px 20px rgba(74, 222, 128, 0.3);
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
        }

        .editor-toolbar {
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.05);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .editor-title-input {
          flex: 1;
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
          outline: none;
        }

        .editor-actions {
          display: flex;
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

        .editor-btn.active {
          background: linear-gradient(135deg, #4ade80, #22c55e);
        }

        .editor-content {
          flex: 1;
          display: flex;
          overflow: hidden;
        }

        .editor-textarea {
          flex: 1;
          background: transparent;
          border: none;
          color: white;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
          font-size: 14px;
          line-height: 1.6;
          padding: 20px;
          resize: none;
          outline: none;
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
          color: #4ade80;
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
          border-left: 4px solid #4ade80;
          padding-left: 16px;
          margin: 12px 0;
          font-style: italic;
          opacity: 0.8;
        }

        .editor-preview strong {
          font-weight: 600;
          color: #4ade80;
        }

        .editor-preview em {
          font-style: italic;
          color: #fbbf24;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .notes-container {
            flex-direction: column;
          }
          
          .notes-sidebar {
            width: 100%;
            height: 50%;
          }
          
          .editor-content {
            flex-direction: column;
          }
          
          .editor-preview {
            border-left: none;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
          }
        }
      </style>
    `;

    // Set up event handlers after the HTML is rendered
    setTimeout(() => {
      const container = document.querySelector('.notes-container');
      if (container) {
        this.setupEventHandlers(container);
      }
    }, 0);

    return content;
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
        <div style="text-align: center; padding: 40px 20px; opacity: 0.5;">
          <div style="font-size: 32px; margin-bottom: 12px;">📝</div>
          <div>No notes found</div>
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
                    title="${this.currentNote.favorite ? 'Remove from favorites' : 'Add to favorites'}">
              ${this.currentNote.favorite ? '⭐' : '☆'}
            </button>
            <button class="editor-btn ${this.currentView === 'edit' ? 'active' : ''}" 
                    id="edit-mode-btn" title="Edit Mode">✏️ Edit</button>
            <button class="editor-btn ${this.currentView === 'preview' ? 'active' : ''}" 
                    id="preview-mode-btn" title="Preview Mode">👁️ Preview</button>
            <button class="editor-btn" id="ai-assist-btn" title="AI Assistance">🤖 AI</button>
            <button class="editor-btn" id="export-btn" title="Export Note">📤</button>
            <button class="editor-btn" id="delete-btn" title="Delete Note">🗑️</button>
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

  createNewNote() {
    const newNote = {
      id: Date.now().toString(),
      title: 'Untitled Note',
      content: '',
      tags: [],
      created: Date.now(),
      modified: Date.now(),
      favorite: false,
      color: 'blue'
    };

    this.notes.unshift(newNote);
    this.currentNote = newNote;
    this.currentView = 'edit';
    this.saveNotes();
    this.refreshContent();
  }

  selectNote(noteId) {
    this.currentNote = this.notes.find(note => note.id === noteId);
    this.currentView = 'edit';
    this.refreshContent();
  }

  deleteNote() {
    if (!this.currentNote) return;

    if (confirm(`Are you sure you want to delete "${this.currentNote.title}"?`)) {
      this.notes = this.notes.filter(note => note.id !== this.currentNote.id);
      this.currentNote = null;
      this.saveNotes();
      this.refreshContent();
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

  getPlainTextPreview(content) {
    return content
      .replace(/#{1,6}\s+/g, '') // Remove headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/`(.*?)`/g, '$1') // Remove code
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links
      .substring(0, 150);
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
      localStorage.setItem('swissknife-notes', JSON.stringify(this.notes));
    } catch (error) {
      console.error('Failed to save notes:', error);
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
              this.notes.push(...importedNotes);
            } else {
              const newNote = {
                id: Date.now().toString(),
                title: file.name.replace(/\.[^/.]+$/, ''),
                content: content,
                tags: [],
                created: Date.now(),
                modified: Date.now(),
                favorite: false,
                color: 'blue'
              };
              this.notes.unshift(newNote);
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
      <div class="ai-menu" style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        backdrop-filter: blur(20px);
        border-radius: 12px;
        padding: 20px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        z-index: 10000;
        min-width: 300px;
      ">
        <h3 style="margin: 0 0 16px 0;">🤖 AI Assistance</h3>
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
        background: rgba(255, 255, 255, 0.1);
        border: none;
        border-radius: 6px;
        color: white;
        cursor: pointer;
        transition: background 0.2s ease;
        text-align: left;
      `;
      
      option.addEventListener('mouseover', () => {
        option.style.background = 'rgba(255, 255, 255, 0.2)';
      });
      
      option.addEventListener('mouseout', () => {
        option.style.background = 'rgba(255, 255, 255, 0.1)';
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
    const container = document.querySelector('.notes-container');
    if (!container) return;

    // Update main content
    const notesMain = container.querySelector('.notes-main');
    notesMain.innerHTML = this.currentNote ? this.renderNoteEditor() : this.renderWelcomeScreen();

    // Update notes list
    this.refreshNotesList();
    this.refreshTagsList();

    // Re-setup event handlers
    this.setupEventHandlers(container);
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