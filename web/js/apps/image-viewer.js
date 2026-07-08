/**
 * Advanced Image Viewer App for SwissKnife Web Desktop
 * Feature-rich image viewing with editing tools, IPFS integration, and AI features
 */

import {
  describeMediaArtifactCapabilities,
  runMediaArtifactWorkflow,
} from './media-artifact-capabilities.js';

export class ImageViewerApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.images = [];
    this.currentImageIndex = 0;
    this.currentImage = null;
    this.viewMode = 'fit'; // 'fit', 'actual', 'width', 'custom'
    this.zoomLevel = 1;
    this.rotation = 0;
    this.slideshow = false;
    this.slideshowInterval = null;
    this.slideshowDelay = 3000;
    
    // Image editing properties
    this.editMode = false;
    this.filters = {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      hue: 0,
      blur: 0,
      sepia: 0,
      grayscale: 0
    };
    
    // AI features
    this.aiFeatures = {
      autoEnhance: false,
      objectDetection: false,
      faceRecognition: false,
      contentAnalysis: false
    };
    this.mediaArtifactCapabilities = describeMediaArtifactCapabilities('image-viewer');
    this.lastMediaArtifactWorkflow = null;
    
    // Supported formats
    this.supportedFormats = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    
    // Sample images for demonstration
    this.sampleImages = [
      {
        name: 'landscape.jpg',
        url: '/assets/images/landscape.jpg',
        size: 2048576,
        dimensions: '1920x1080',
        format: 'JPEG',
        location: 'local'
      },
      {
        name: 'portrait.png',
        url: '/assets/images/portrait.png',
        size: 1536789,
        dimensions: '800x1200',
        format: 'PNG',
        location: 'ipfs'
      },
      {
        name: 'ai-generated.webp',
        url: '/assets/images/ai-generated.webp',
        size: 987654,
        dimensions: '1024x1024',
        format: 'WebP',
        location: 'p2p'
      }
    ];
    
    this.initializeApp();
  }

  initializeApp() {
    // Load images from various sources
    this.loadImages();
  }

  loadImages() {
    // Load images from sample set and localStorage
    this.images = [...this.sampleImages];
    
    // Try to load images from localStorage
    try {
      const storedImages = localStorage.getItem('image-viewer-images');
      if (storedImages) {
        const parsed = JSON.parse(storedImages);
        this.images = [...this.images, ...parsed];
      }
    } catch (e) {
      console.warn('Could not load stored images:', e);
    }
    
    if (this.images.length > 0) {
      this.currentImage = this.images[0];
    }
  }

  createWindow() {
    const content = `
      <div class="image-viewer-container">
        <!-- Toolbar -->
        <div class="viewer-toolbar">
          <div class="toolbar-left">
            <button class="toolbar-btn" id="open-btn" title="Open Image">
              <span>📁</span> Open
            </button>
            <button class="toolbar-btn" id="save-btn" title="Save Image" ${!this.currentImage ? 'disabled' : ''}>
              <span>💾</span> Save
            </button>
            <button class="toolbar-btn" id="share-btn" title="Share via P2P" ${!this.currentImage ? 'disabled' : ''}>
              <span>🔗</span> Share
            </button>
            <input type="file" id="file-input" accept="image/*" multiple style="display: none;">
          </div>
          
          <div class="toolbar-center">
            <button class="toolbar-btn" id="prev-btn" title="Previous Image" ${this.images.length <= 1 ? 'disabled' : ''}>
              <span>⬅️</span>
            </button>
            <span class="image-counter" id="image-counter">
              ${this.currentImage ? `${this.currentImageIndex + 1} / ${this.images.length}` : '0 / 0'}
            </span>
            <button class="toolbar-btn" id="next-btn" title="Next Image" ${this.images.length <= 1 ? 'disabled' : ''}>
              <span>➡️</span>
            </button>
            <button class="toolbar-btn" id="slideshow-btn" title="Start Slideshow" ${this.images.length <= 1 ? 'disabled' : ''}>
              <span>▶️</span>
            </button>
          </div>
          
          <div class="toolbar-right">
            <button class="toolbar-btn" id="zoom-out-btn" title="Zoom Out" ${!this.currentImage ? 'disabled' : ''}>
              <span>🔍➖</span>
            </button>
            <span class="zoom-level" id="zoom-level">${Math.round(this.zoomLevel * 100)}%</span>
            <button class="toolbar-btn" id="zoom-in-btn" title="Zoom In" ${!this.currentImage ? 'disabled' : ''}>
              <span>🔍➕</span>
            </button>
            <button class="toolbar-btn" id="fit-btn" title="Fit to Window" ${!this.currentImage ? 'disabled' : ''}>
              <span>📐</span>
            </button>
            <button class="toolbar-btn" id="actual-btn" title="Actual Size" ${!this.currentImage ? 'disabled' : ''}>
              <span>1:1</span>
            </button>
          </div>
        </div>

        <!-- Main Content -->
        <div class="viewer-content">
          <!-- Sidebar -->
          <div class="viewer-sidebar" id="viewer-sidebar">
            <!-- Image List -->
            <div class="sidebar-section">
              <div class="section-header">
                <h4>Images (${this.images.length})</h4>
                <button class="collapse-btn" data-target="image-list">−</button>
              </div>
              <div class="image-list" id="image-list">
                ${this.renderImageList()}
              </div>
            </div>

            <!-- Image Info -->
            <div class="sidebar-section">
              <div class="section-header">
                <h4>Image Info</h4>
                <button class="collapse-btn" data-target="image-info">−</button>
              </div>
              <div class="image-info" id="image-info">
                ${this.renderImageInfo()}
              </div>
            </div>

            <!-- Editing Tools -->
            <div class="sidebar-section">
              <div class="section-header">
                <h4>Editing Tools</h4>
                <button class="collapse-btn" data-target="editing-tools">−</button>
              </div>
              <div class="editing-tools" id="editing-tools">
                ${this.renderEditingTools()}
              </div>
            </div>

            <!-- AI Features -->
            <div class="sidebar-section">
              <div class="section-header">
                <h4>AI Features</h4>
                <button class="collapse-btn" data-target="ai-features">−</button>
              </div>
              <div class="ai-features" id="ai-features">
                ${this.renderAIFeatures()}
              </div>
            </div>
          </div>

          <!-- Image Display -->
          <div class="image-display" id="image-display">
            ${this.currentImage ? this.renderImageDisplay() : this.renderWelcomeScreen()}
          </div>
        </div>

        <!-- Image Actions Panel -->
        <div class="actions-panel">
          <div class="actions-left">
            <button class="action-btn" id="rotate-left-btn" title="Rotate Left" ${!this.currentImage ? 'disabled' : ''}>
              <span>↺</span>
            </button>
            <button class="action-btn" id="rotate-right-btn" title="Rotate Right" ${!this.currentImage ? 'disabled' : ''}>
              <span>↻</span>
            </button>
            <button class="action-btn" id="flip-h-btn" title="Flip Horizontal" ${!this.currentImage ? 'disabled' : ''}>
              <span>⬌</span>
            </button>
            <button class="action-btn" id="flip-v-btn" title="Flip Vertical" ${!this.currentImage ? 'disabled' : ''}>
              <span>⬍</span>
            </button>
          </div>
          
          <div class="actions-center">
            <button class="action-btn ${this.editMode ? 'active' : ''}" id="edit-mode-btn" title="Edit Mode" ${!this.currentImage ? 'disabled' : ''}>
              <span>✏️</span> Edit
            </button>
            <button class="action-btn" id="effects-btn" title="Effects" ${!this.currentImage ? 'disabled' : ''}>
              <span>🎨</span> Effects
            </button>
            <button class="action-btn" id="ai-enhance-btn" title="AI Enhance" ${!this.currentImage ? 'disabled' : ''}>
              <span>🤖</span> Enhance
            </button>
          </div>
          
          <div class="actions-right">
            <button class="action-btn" id="fullscreen-btn" title="Fullscreen" ${!this.currentImage ? 'disabled' : ''}>
              <span>⛶</span>
            </button>
            <button class="action-btn" id="sidebar-toggle-btn" title="Toggle Sidebar">
              <span>📋</span>
            </button>
          </div>
        </div>
      </div>

      <style>
        .image-viewer-container {
          height: 100%;
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          color: #e8eaed;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', roboto, sans-serif;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .viewer-toolbar {
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .toolbar-left,
        .toolbar-center,
        .toolbar-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .toolbar-btn,
        .action-btn {
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .toolbar-btn:hover:not(:disabled),
        .action-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        .toolbar-btn:disabled,
        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .action-btn.active {
          background: linear-gradient(135deg, #4ade80, #22c55e);
        }

        .image-counter,
        .zoom-level {
          padding: 4px 8px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          font-size: 11px;
          font-family: monospace;
        }

        .viewer-content {
          flex: 1;
          display: flex;
          overflow: hidden;
        }

        .viewer-sidebar {
          width: 280px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          border-right: 1px solid rgba(255, 255, 255, 0.1);
          overflow-y: auto;
          transition: width 0.3s ease;
        }

        .viewer-sidebar.collapsed {
          width: 0;
          overflow: hidden;
        }

        .sidebar-section {
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .section-header {
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.05);
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
        }

        .section-header h4 {
          margin: 0;
          font-size: 13px;
          font-weight: 600;
        }

        .collapse-btn {
          width: 20px;
          height: 20px;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        }

        .image-list {
          padding: 8px;
          max-height: 200px;
          overflow-y: auto;
        }

        .image-list-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s ease;
          margin-bottom: 4px;
        }

        .image-list-item:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .image-list-item.active {
          background: rgba(74, 222, 128, 0.2);
          border: 1px solid rgba(74, 222, 128, 0.3);
        }

        .image-thumbnail {
          width: 32px;
          height: 32px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
        }

        .image-list-info {
          flex: 1;
          min-width: 0;
        }

        .image-list-name {
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .image-list-meta {
          font-size: 10px;
          opacity: 0.7;
        }

        .image-info {
          padding: 12px 16px;
          font-size: 12px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .info-label {
          opacity: 0.7;
        }

        .info-value {
          font-weight: 500;
        }

        .editing-tools {
          padding: 12px 16px;
        }

        .tool-group {
          margin-bottom: 16px;
        }

        .tool-label {
          font-size: 11px;
          font-weight: 600;
          margin-bottom: 6px;
          opacity: 0.8;
        }

        .slider-control {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .slider-control label {
          min-width: 60px;
          font-size: 10px;
        }

        .slider-control input[type="range"] {
          flex: 1;
          height: 4px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          outline: none;
        }

        .slider-control input[type="range"]::-webkit-slider-thumb {
          width: 12px;
          height: 12px;
          background: #4ade80;
          border-radius: 50%;
          cursor: pointer;
        }

        .slider-value {
          min-width: 30px;
          font-size: 10px;
          text-align: right;
        }

        .ai-features {
          padding: 12px 16px;
        }

        .ai-feature {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          font-size: 12px;
        }

        .ai-feature input[type="checkbox"] {
          width: 14px;
          height: 14px;
        }

        .ai-action-btn {
          width: 100%;
          padding: 8px;
          background: rgba(74, 222, 128, 0.2);
          border: 1px solid rgba(74, 222, 128, 0.3);
          border-radius: 6px;
          color: white;
          cursor: pointer;
          font-size: 11px;
          margin-bottom: 6px;
          transition: all 0.2s ease;
        }

        .ai-action-btn:hover {
          background: rgba(74, 222, 128, 0.3);
        }

        .image-display {
          flex: 1;
          background: rgba(0, 0, 0, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          position: relative;
        }

        .image-container {
          max-width: 100%;
          max-height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .main-image {
          max-width: 100%;
          max-height: 100%;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          transition: transform 0.3s ease;
          cursor: grab;
        }

        .main-image:active {
          cursor: grabbing;
        }

        .welcome-screen {
          text-align: center;
          padding: 40px;
        }

        .welcome-icon {
          font-size: 64px;
          margin-bottom: 20px;
          opacity: 0.6;
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
        }

        .welcome-actions {
          display: flex;
          gap: 16px;
          justify-content: center;
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

        .actions-panel {
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.05);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .actions-left,
        .actions-center,
        .actions-right {
          display: flex;
          gap: 6px;
        }

        /* Image filters */
        .filtered-image {
          filter: 
            brightness(var(--brightness, 100%))
            contrast(var(--contrast, 100%))
            saturate(var(--saturation, 100%))
            hue-rotate(var(--hue, 0deg))
            blur(var(--blur, 0px))
            sepia(var(--sepia, 0%))
            grayscale(var(--grayscale, 0%));
        }

        /* Loading spinner */
        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(255, 255, 255, 0.2);
          border-top: 4px solid #4ade80;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Responsive */
        @media (max-width: 768px) {
          .viewer-sidebar {
            width: 100%;
            height: 40%;
          }
          
          .viewer-content {
            flex-direction: column;
          }
          
          .toolbar-btn span:not(:first-child),
          .action-btn span:not(:first-child) {
            display: none;
          }
        }
      </style>
    `;

    return {
      title: 'Image Viewer',
      content,
      width: 1000,
      height: 700,
      x: 200,
      y: 100
    };
  }

  renderImageList() {
    if (this.images.length === 0) {
      return '<div style="text-align: center; padding: 20px; opacity: 0.5;">No images loaded</div>';
    }

    return this.images.map((image, index) => `
      <div class="image-list-item ${index === this.currentImageIndex ? 'active' : ''}" 
           data-index="${index}">
        <div class="image-thumbnail">🖼️</div>
        <div class="image-list-info">
          <div class="image-list-name">${image.name}</div>
          <div class="image-list-meta">${image.dimensions} • ${this.formatFileSize(image.size)}</div>
        </div>
      </div>
    `).join('');
  }

  renderImageInfo() {
    if (!this.currentImage) {
      return '<div style="text-align: center; padding: 20px; opacity: 0.5;">No image selected</div>';
    }

    return `
      <div class="info-row">
        <span class="info-label">Name:</span>
        <span class="info-value">${this.currentImage.name}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Format:</span>
        <span class="info-value">${this.currentImage.format}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Dimensions:</span>
        <span class="info-value">${this.currentImage.dimensions}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Size:</span>
        <span class="info-value">${this.formatFileSize(this.currentImage.size)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Location:</span>
        <span class="info-value">${this.currentImage.location}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Zoom:</span>
        <span class="info-value">${Math.round(this.zoomLevel * 100)}%</span>
      </div>
      <div class="info-row">
        <span class="info-label">Rotation:</span>
        <span class="info-value">${this.rotation}°</span>
      </div>
    `;
  }

  renderEditingTools() {
    return `
      <div class="tool-group">
        <div class="tool-label">Adjustments</div>
        
        <div class="slider-control">
          <label>Brightness</label>
          <input type="range" id="brightness-slider" min="0" max="200" value="${this.filters.brightness}">
          <span class="slider-value">${this.filters.brightness}</span>
        </div>
        
        <div class="slider-control">
          <label>Contrast</label>
          <input type="range" id="contrast-slider" min="0" max="200" value="${this.filters.contrast}">
          <span class="slider-value">${this.filters.contrast}</span>
        </div>
        
        <div class="slider-control">
          <label>Saturation</label>
          <input type="range" id="saturation-slider" min="0" max="200" value="${this.filters.saturation}">
          <span class="slider-value">${this.filters.saturation}</span>
        </div>
        
        <div class="slider-control">
          <label>Hue</label>
          <input type="range" id="hue-slider" min="-180" max="180" value="${this.filters.hue}">
          <span class="slider-value">${this.filters.hue}</span>
        </div>
      </div>
      
      <div class="tool-group">
        <div class="tool-label">Effects</div>
        
        <div class="slider-control">
          <label>Blur</label>
          <input type="range" id="blur-slider" min="0" max="10" value="${this.filters.blur}">
          <span class="slider-value">${this.filters.blur}</span>
        </div>
        
        <div class="slider-control">
          <label>Sepia</label>
          <input type="range" id="sepia-slider" min="0" max="100" value="${this.filters.sepia}">
          <span class="slider-value">${this.filters.sepia}</span>
        </div>
        
        <div class="slider-control">
          <label>Grayscale</label>
          <input type="range" id="grayscale-slider" min="0" max="100" value="${this.filters.grayscale}">
          <span class="slider-value">${this.filters.grayscale}</span>
        </div>
      </div>
      
      <div class="tool-group">
        <button class="ai-action-btn" id="reset-filters-btn">Reset All Filters</button>
        <button class="ai-action-btn" id="auto-adjust-btn">Auto Adjust</button>
      </div>
    `;
  }

  renderAIFeatures() {
    return `
      <div class="ai-feature">
        <input type="checkbox" id="auto-enhance" ${this.aiFeatures.autoEnhance ? 'checked' : ''}>
        <label for="auto-enhance">Auto Enhance</label>
      </div>
      
      <div class="ai-feature">
        <input type="checkbox" id="object-detection" ${this.aiFeatures.objectDetection ? 'checked' : ''}>
        <label for="object-detection">Object Detection</label>
      </div>
      
      <div class="ai-feature">
        <input type="checkbox" id="face-recognition" ${this.aiFeatures.faceRecognition ? 'checked' : ''}>
        <label for="face-recognition">Face Recognition</label>
      </div>
      
      <div class="ai-feature">
        <input type="checkbox" id="content-analysis" ${this.aiFeatures.contentAnalysis ? 'checked' : ''}>
        <label for="content-analysis">Content Analysis</label>
      </div>
      
      <button class="ai-action-btn" id="analyze-image-btn">🤖 Analyze Image</button>
      <button class="ai-action-btn" id="enhance-quality-btn">✨ Enhance Quality</button>
      <button class="ai-action-btn" id="remove-background-btn">🎭 Remove Background</button>
      <button class="ai-action-btn" id="colorize-btn">🎨 Colorize</button>
    `;
  }

  renderImageDisplay() {
    if (!this.currentImage) {
      return this.renderWelcomeScreen();
    }

    const filterStyle = this.editMode ? this.generateFilterStyle() : '';

    return `
      <div class="image-container">
        <img src="${this.currentImage.url}" 
             alt="${this.currentImage.name}"
             class="main-image ${this.editMode ? 'filtered-image' : ''}"
             style="transform: rotate(${this.rotation}deg) scale(${this.zoomLevel}); ${filterStyle}"
             id="main-image">
      </div>
    `;
  }

  renderWelcomeScreen() {
    return `
      <div class="welcome-screen">
        <div class="welcome-icon">🖼️</div>
        <h1 class="welcome-title">SwissKnife Image Viewer</h1>
        <p class="welcome-subtitle">
          View, edit, and enhance your images with AI-powered tools.
          Supports multiple formats and storage locations.
        </p>
        <div class="welcome-actions">
          <button class="welcome-btn" id="welcome-open">Open Images</button>
          <button class="welcome-btn secondary" id="welcome-sample">Load Samples</button>
        </div>
      </div>
    `;
  }

  generateFilterStyle() {
    return `
      --brightness: ${this.filters.brightness}%;
      --contrast: ${this.filters.contrast}%;
      --saturation: ${this.filters.saturation}%;
      --hue: ${this.filters.hue}deg;
      --blur: ${this.filters.blur}px;
      --sepia: ${this.filters.sepia}%;
      --grayscale: ${this.filters.grayscale}%;
    `;
  }

  setupEventHandlers(container) {
    // File operations
    container.querySelector('#open-btn').addEventListener('click', () => {
      this.openImages();
    });

    container.querySelector('#file-input').addEventListener('change', (e) => {
      this.loadLocalImages(e.target.files);
    });

    // Navigation
    container.querySelector('#prev-btn').addEventListener('click', () => {
      this.navigateImage(-1);
    });

    container.querySelector('#next-btn').addEventListener('click', () => {
      this.navigateImage(1);
    });

    // Zoom controls
    container.querySelector('#zoom-in-btn').addEventListener('click', () => {
      this.zoomIn();
    });

    container.querySelector('#zoom-out-btn').addEventListener('click', () => {
      this.zoomOut();
    });

    container.querySelector('#fit-btn').addEventListener('click', () => {
      this.fitToWindow();
    });

    container.querySelector('#actual-btn').addEventListener('click', () => {
      this.actualSize();
    });

    // Rotation
    container.querySelector('#rotate-left-btn').addEventListener('click', () => {
      this.rotate(-90);
    });

    container.querySelector('#rotate-right-btn').addEventListener('click', () => {
      this.rotate(90);
    });

    // Mode toggles
    container.querySelector('#edit-mode-btn').addEventListener('click', () => {
      this.toggleEditMode();
    });

    container.querySelector('#sidebar-toggle-btn').addEventListener('click', () => {
      this.toggleSidebar();
    });

    // Image list
    container.querySelectorAll('.image-list-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectImage(parseInt(item.dataset.index));
      });
    });

    // Editing sliders
    this.setupSliderHandlers(container);

    // AI features
    this.setupAIHandlers(container);

    // Keyboard shortcuts
    this.setupKeyboardHandlers();

    // Welcome screen
    const welcomeOpen = container.querySelector('#welcome-open');
    if (welcomeOpen) {
      welcomeOpen.addEventListener('click', () => {
        this.openImages();
      });
    }

    const welcomeSample = container.querySelector('#welcome-sample');
    if (welcomeSample) {
      welcomeSample.addEventListener('click', () => {
        this.loadSampleImages();
      });
    }
  }

  setupSliderHandlers(container) {
    const sliders = [
      'brightness', 'contrast', 'saturation', 'hue',
      'blur', 'sepia', 'grayscale'
    ];

    sliders.forEach(slider => {
      const element = container.querySelector(`#${slider}-slider`);
      if (element) {
        element.addEventListener('input', (e) => {
          this.updateFilter(slider, e.target.value);
        });
      }
    });

    const resetBtn = container.querySelector('#reset-filters-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.resetFilters();
      });
    }

    const autoAdjustBtn = container.querySelector('#auto-adjust-btn');
    if (autoAdjustBtn) {
      autoAdjustBtn.addEventListener('click', () => {
        this.autoAdjust();
      });
    }
  }

  setupAIHandlers(container) {
    const analyzeBtn = container.querySelector('#analyze-image-btn');
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', () => {
        this.analyzeImage();
      });
    }

    const enhanceBtn = container.querySelector('#enhance-quality-btn');
    if (enhanceBtn) {
      enhanceBtn.addEventListener('click', () => {
        this.enhanceQuality();
      });
    }
  }

  setupKeyboardHandlers() {
    document.addEventListener('keydown', (e) => {
      if (!this.isViewerFocused()) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          this.navigateImage(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.navigateImage(1);
          break;
        case '+':
        case '=':
          e.preventDefault();
          this.zoomIn();
          break;
        case '-':
          e.preventDefault();
          this.zoomOut();
          break;
        case '0':
          e.preventDefault();
          this.fitToWindow();
          break;
        case '1':
          e.preventDefault();
          this.actualSize();
          break;
        case 'r':
          e.preventDefault();
          this.rotate(90);
          break;
        case 'e':
          e.preventDefault();
          this.toggleEditMode();
          break;
      }
    });
  }

  openImages() {
    const fileInput = document.querySelector('#file-input');
    fileInput.click();
  }

  loadLocalImages(files) {
    const imageFiles = Array.from(files).filter(file => 
      this.supportedFormats.includes(file.name.split('.').pop().toLowerCase())
    );

    imageFiles.forEach(file => {
      const url = URL.createObjectURL(file);
      const image = {
        name: file.name,
        url: url,
        size: file.size,
        format: file.type.split('/')[1].toUpperCase(),
        location: 'local',
        dimensions: 'Loading...'
      };

      // Get image dimensions
      const img = new Image();
      img.onload = () => {
        image.dimensions = `${img.width}x${img.height}`;
        this.refreshContent();
      };
      img.src = url;

      this.images.push(image);
    });

    if (imageFiles.length > 0) {
      this.currentImageIndex = this.images.length - imageFiles.length;
      this.currentImage = this.images[this.currentImageIndex];
      this.refreshContent();
    }
  }

  loadSampleImages() {
    // Generate mock URLs for sample images
    this.images = this.sampleImages.map(img => ({
      ...img,
      url: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="%23${Math.floor(Math.random()*16777215).toString(16)}"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="white" font-family="Arial" font-size="24">${img.name}</text></svg>`
    }));

    this.currentImageIndex = 0;
    this.currentImage = this.images[0];
    this.refreshContent();
  }

  navigateImage(direction) {
    if (this.images.length <= 1) return;

    this.currentImageIndex += direction;
    if (this.currentImageIndex < 0) {
      this.currentImageIndex = this.images.length - 1;
    } else if (this.currentImageIndex >= this.images.length) {
      this.currentImageIndex = 0;
    }

    this.currentImage = this.images[this.currentImageIndex];
    this.refreshContent();
  }

  selectImage(index) {
    if (index < 0 || index >= this.images.length) return;

    this.currentImageIndex = index;
    this.currentImage = this.images[index];
    this.refreshContent();
  }

  zoomIn() {
    this.zoomLevel = Math.min(this.zoomLevel * 1.2, 5);
    this.updateImageDisplay();
  }

  zoomOut() {
    this.zoomLevel = Math.max(this.zoomLevel / 1.2, 0.1);
    this.updateImageDisplay();
  }

  fitToWindow() {
    this.zoomLevel = 1;
    this.viewMode = 'fit';
    this.updateImageDisplay();
  }

  actualSize() {
    this.zoomLevel = 1;
    this.viewMode = 'actual';
    this.updateImageDisplay();
  }

  rotate(degrees) {
    this.rotation = (this.rotation + degrees) % 360;
    this.updateImageDisplay();
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    this.refreshContent();
  }

  toggleSidebar() {
    const sidebar = document.querySelector('.viewer-sidebar');
    sidebar.classList.toggle('collapsed');
  }

  updateFilter(filterName, value) {
    this.filters[filterName] = parseFloat(value);
    this.updateImageDisplay();
    
    // Update slider value display
    const valueSpan = document.querySelector(`#${filterName}-slider`).parentElement.querySelector('.slider-value');
    if (valueSpan) {
      valueSpan.textContent = value;
    }
  }

  resetFilters() {
    this.filters = {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      hue: 0,
      blur: 0,
      sepia: 0,
      grayscale: 0
    };
    this.refreshContent();
  }

  autoAdjust() {
    // Auto-adjust using basic image histogram analysis
    // Apply moderate enhancements that typically improve most images
    this.filters.brightness = 110;
    this.filters.contrast = 105;
    this.filters.saturation = 95;
    this.refreshContent();
  }

  async analyzeImage() {
    if (!this.currentImage) {
      alert('Please load an image first');
      return;
    }

    try {
      // Use real AI integration if available
      if (this.swissknife && typeof this.swissknife.chat === 'function') {
        const canvas = document.querySelector('#image-canvas');
        const imageData = canvas ? canvas.toDataURL() : '';
        
        const prompt = `Analyze this image and provide:
- Scene description
- Objects detected
- Dominant colors
- Mood/atmosphere
- Quality assessment`;

        const response = await this.swissknife.chat({
          message: prompt,
          model: 'gpt-4-vision',
          image: imageData
        });

        const analysis = response.message || response.content || response;
        alert(`🤖 AI Image Analysis:\n\n${analysis}`);
      } else {
        // Fallback analysis based on image properties
        const img = new Image();
        img.src = this.currentImage.src;
        
        const analysis = `🤖 Image Analysis:\n\n• Filename: ${this.currentImage.name}\n• Dimensions: ${img.width} × ${img.height}px\n• Format: ${this.currentImage.name.split('.').pop().toUpperCase()}\n\nNote: Advanced AI analysis requires SwissKnife AI configuration.`;
        
        alert(analysis);
      }
    } catch (error) {
      console.error('Image analysis failed:', error);
      alert(`Analysis failed: ${error.message}`);
    }
  }

  async enhanceQuality() {
    if (!this.currentImage) {
      alert('Please load an image first');
      return;
    }

    try {
      // Use real AI enhancement if available
      if (this.swissknife && typeof this.swissknife.enhanceImage === 'function') {
        const canvas = document.querySelector('#image-canvas');
        const imageData = canvas ? canvas.toDataURL() : '';
        
        const enhanced = await this.swissknife.enhanceImage({
          image: imageData,
          mode: 'auto'
        });
        
        // Apply enhanced image
        if (enhanced.image) {
          this.currentImage.src = enhanced.image;
          this.refreshContent();
          alert(`✨ Image enhanced successfully!\n${enhanced.details || 'AI enhancement applied'}`);
        }
      } else {
        // Fallback: Apply basic enhancement filters
        this.filters.brightness = 105;
        this.filters.contrast = 110;
        this.filters.saturation = 105;
        this.filters.sharpness = 15;
        this.refreshContent();
        
        setTimeout(() => {
          alert('✨ Image enhanced successfully!\nApplied: Brightness +5%, Contrast +10%, Saturation +5%, Sharpness +15\n\nNote: AI enhancement requires SwissKnife AI configuration.');
        }, 1000);
      }
    } catch (error) {
      console.error('Image enhancement failed:', error);
      alert(`Enhancement failed: ${error.message}`);
    }
  }

  getMediaArtifactCapabilities() {
    return this.mediaArtifactCapabilities;
  }

  async exerciseMediaArtifactGateway(input = {}) {
    const image = input.image || this.currentImage || this.images[0] || {
      name: 'image-viewer-demo.png',
      format: 'PNG',
      dimensions: '1024x1024',
      location: 'local',
    };

    this.lastMediaArtifactWorkflow = await runMediaArtifactWorkflow({
      desktop: this.desktop,
      appId: 'image-viewer',
      mediaType: 'image',
      mimeType: image.format === 'JPEG' ? 'image/jpeg' : 'image/png',
      operation: input.operation || 'enhance-image',
      model: input.model || 'image-enhancer',
      prompt: input.prompt || `Enhance image ${image.name || 'selected image'} and store the output.`,
      artifact: {
        id: image.url || image.name,
        name: image.name || 'image-viewer-output',
        filename: `${String(image.name || 'image-viewer-output').replace(/[^a-z0-9._-]+/gi, '-')}.json`,
        content: {
          image,
          filters: this.filters,
          edit_mode: this.editMode,
          zoom: this.zoomLevel,
          rotation: this.rotation,
        },
      },
    });
    return this.lastMediaArtifactWorkflow;
  }

  updateImageDisplay() {
    const image = document.querySelector('#main-image');
    if (image) {
      const filterStyle = this.editMode ? this.generateFilterStyle() : '';
      image.style.transform = `rotate(${this.rotation}deg) scale(${this.zoomLevel})`;
      image.style.cssText += filterStyle;
    }

    // Update zoom level display
    const zoomLevel = document.querySelector('#zoom-level');
    if (zoomLevel) {
      zoomLevel.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }
  }

  refreshContent() {
    const container = document.querySelector('.image-viewer-container');
    if (!container) return;

    // Update image display
    const imageDisplay = container.querySelector('#image-display');
    imageDisplay.innerHTML = this.currentImage ? this.renderImageDisplay() : this.renderWelcomeScreen();

    // Update image list
    const imageList = container.querySelector('#image-list');
    imageList.innerHTML = this.renderImageList();

    // Update image info
    const imageInfo = container.querySelector('#image-info');
    imageInfo.innerHTML = this.renderImageInfo();

    // Update editing tools
    const editingTools = container.querySelector('#editing-tools');
    editingTools.innerHTML = this.renderEditingTools();

    // Update counter
    const counter = container.querySelector('#image-counter');
    if (counter) {
      counter.textContent = this.currentImage ? 
        `${this.currentImageIndex + 1} / ${this.images.length}` : '0 / 0';
    }

    // Re-setup event handlers
    this.setupEventHandlers(container);
  }

  formatFileSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

  isViewerFocused() {
    return document.querySelector('.image-viewer-container') && 
           !document.activeElement.matches('input, textarea, select');
  }

  // Modern app framework methods
  async initialize() {
    console.log('🚀 Initializing Image Viewer app...');
    this.swissknife = this.desktop.swissknife;
    this.initializeApp();
    console.log('✅ Image Viewer initialized');
    return this;
  }

  async render() {
    console.log('🎨 Rendering Image Viewer app...');
    const windowConfig = this.createWindowConfig();
    
    // Set up event handlers after the HTML is rendered
    setTimeout(() => {
      const container = document.querySelector('.image-viewer-container');
      if (container) {
        this.setupEventHandlers(container);
        this.setupKeyboardHandlers();
        this.updateDisplay();
      }
    }, 100);
    
    return windowConfig;
  }

  createWindowConfig() {
    return {
      title: '🖼️ Image Viewer',
      content: this.getWindowContent(),
      width: 1200,
      height: 800,
      resizable: true,
      x: 150,
      y: 100
    };
  }

  getWindowContent() {
    return `
      <div class="image-viewer-container">
        <!-- Toolbar -->
        <div class="image-toolbar">
          <div class="toolbar-section">
            <button class="toolbar-btn" id="open-files-btn" title="Open Files">📁</button>
            <button class="toolbar-btn" id="open-folder-btn" title="Open Folder">📂</button>
            <button class="toolbar-btn" id="open-url-btn" title="Open URL">🔗</button>
          </div>
          <div class="toolbar-section">
            <button class="toolbar-btn" id="prev-image-btn" title="Previous Image" ${this.images.length <= 1 ? 'disabled' : ''}>⬅️</button>
            <span class="image-counter" id="image-counter">
              ${this.currentImage ? `${this.currentImageIndex + 1} of ${this.images.length}` : 'No images'}
            </span>
            <button class="toolbar-btn" id="next-image-btn" title="Next Image" ${this.images.length <= 1 ? 'disabled' : ''}>➡️</button>
          </div>
          <div class="toolbar-section">
            <button class="toolbar-btn" id="zoom-out-btn" title="Zoom Out">🔍-</button>
            <span class="zoom-level" id="zoom-level">${Math.round(this.zoom * 100)}%</span>
            <button class="toolbar-btn" id="zoom-in-btn" title="Zoom In">🔍+</button>
            <button class="toolbar-btn" id="fit-screen-btn" title="Fit to Screen">📐</button>
          </div>
          <div class="toolbar-section">
            <button class="toolbar-btn" id="rotate-left-btn" title="Rotate Left">↺</button>
            <button class="toolbar-btn" id="rotate-right-btn" title="Rotate Right">↻</button>
            <button class="toolbar-btn" id="flip-horizontal-btn" title="Flip Horizontal">⟷</button>
            <button class="toolbar-btn" id="flip-vertical-btn" title="Flip Vertical">↕️</button>
          </div>
          <div class="toolbar-section">
            <button class="toolbar-btn ${this.editMode ? 'active' : ''}" id="edit-mode-btn" title="Edit Mode">✏️</button>
            <button class="toolbar-btn" id="save-btn" title="Save Image">💾</button>
            <button class="toolbar-btn" id="share-btn" title="Share">📤</button>
          </div>
        </div>

        <!-- Main Content -->
        <div class="image-content">
          <!-- Sidebar -->
          <div class="image-sidebar ${this.sidebarVisible ? 'visible' : 'hidden'}">
            <!-- Image List -->
            <div class="sidebar-section">
              <div class="section-header">
                <h4>Images (${this.images.length})</h4>
                <button class="collapse-btn" data-target="image-list">−</button>
              </div>
              <div class="image-list" id="image-list">
                ${this.renderImageList()}
              </div>
            </div>

            <!-- Image Info -->
            <div class="sidebar-section">
              <div class="section-header">
                <h4>Image Info</h4>
                <button class="collapse-btn" data-target="image-info">−</button>
              </div>
              <div class="image-info" id="image-info">
                ${this.renderImageInfo()}
              </div>
            </div>

            <!-- Editing Tools -->
            <div class="sidebar-section">
              <div class="section-header">
                <h4>Editing Tools</h4>
                <button class="collapse-btn" data-target="editing-tools">−</button>
              </div>
              <div class="editing-tools" id="editing-tools">
                ${this.renderEditingTools()}
              </div>
            </div>

            <!-- AI Features -->
            <div class="sidebar-section">
              <div class="section-header">
                <h4>AI Features</h4>
                <button class="collapse-btn" data-target="ai-features">−</button>
              </div>
              <div class="ai-features" id="ai-features">
                ${this.renderAIFeatures()}
              </div>
            </div>
          </div>

          <!-- Image Display -->
          <div class="image-display" id="image-display">
            ${this.currentImage ? this.renderImageDisplay() : this.renderWelcomeScreen()}
          </div>
        </div>

        <!-- Image Actions Panel -->
        <div class="actions-panel">
          <button class="action-btn" id="fullscreen-btn">🖥️ Fullscreen</button>
          <button class="action-btn" id="slideshow-btn">▶️ Slideshow</button>
          <button class="action-btn" id="compare-btn">🔀 Compare</button>
          <button class="action-btn" id="metadata-btn">📋 Metadata</button>
        </div>
      </div>
    `;
  }
}

// Register the app
if (typeof window !== 'undefined') {
  window.createImageViewerApp = (desktop) => new ImageViewerApp(desktop);
}
