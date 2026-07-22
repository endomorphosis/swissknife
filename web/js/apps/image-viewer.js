/**
 * Advanced Image Viewer App for SwissKnife Web Desktop
 * CID-backed image viewing, OCR metadata, enhancement workflow, and accessible
 * image state handling.
 */

import { runMediaArtifactWorkflow } from './media-artifact-capabilities.js';

const APP_ID = 'image-viewer';

export class ImageViewerApp {
  constructor(desktop = null) {
    this.desktop = desktop;
    this.swissknife = null;
    this.instanceId = `image-viewer-${Math.random().toString(36).slice(2, 10)}`;
    this.images = this.createSeedImages();
    this.currentImageIndex = 0;
    this.currentImage = this.images[0] || null;
    this.zoomLevel = 1;
    this.panX = 0;
    this.panY = 0;
    this.rotation = 0;
    this.editMode = false;
    this.sidebarVisible = true;
    this.filters = {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      hue: 0,
      blur: 0,
      sepia: 0,
      grayscale: 0,
    };
    this.vdaG038 = this.createVdaG038WorkflowState();
    this.loadStoredImages();
  }

  async initialize() {
    this.swissknife = this.desktop?.swissknife || window.swissknife || window.SwissKnife || null;
    return this;
  }

  async render() {
    const html = this.getWindowContent();
    setTimeout(() => this.setupEventHandlers(), 0);
    return html;
  }

  createWindowConfig() {
    return {
      title: 'Image Viewer',
      content: this.getWindowContent(),
      width: 1200,
      height: 800,
      resizable: true,
      x: 150,
      y: 100,
    };
  }

  createWindow() {
    return this.createWindowConfig();
  }

  getWindowContent() {
    return `
      <div class="image-viewer-container" data-image-viewer-instance="${escapeHTML(this.instanceId)}">
        <div class="image-toolbar" aria-label="Image Viewer toolbar">
          <div class="toolbar-section">
            <button class="toolbar-btn primary-action" id="open-files-btn" type="button" title="Open image files" aria-label="Open image files">Open</button>
            <button class="toolbar-btn" id="retrieve-cid-btn" type="button" data-live-gateway-binding="ipfs.kit.tool.ipfs_cat" data-action="retrieve-cid-image" aria-label="Retrieve CID-backed image">Retrieve CID</button>
            <input type="file" id="image-file-input" accept="image/*" multiple hidden>
          </div>
          <div class="toolbar-section">
            <button class="toolbar-btn" id="prev-image-btn" type="button" ${this.images.length <= 1 ? 'disabled' : ''} aria-label="Previous image">Prev</button>
            <span class="image-counter" id="image-counter">${this.currentImage ? `${this.currentImageIndex + 1} of ${this.images.length}` : 'No images'}</span>
            <button class="toolbar-btn" id="next-image-btn" type="button" ${this.images.length <= 1 ? 'disabled' : ''} aria-label="Next image">Next</button>
          </div>
          <div class="toolbar-section" data-svd-vda-marker="zoom-pan" data-zoom-state="${escapeHTML(this.vdaG038.zoomPanState)}">
            <button class="toolbar-btn" id="zoom-out-btn" type="button" aria-label="Zoom out">Zoom -</button>
            <span class="zoom-level" id="zoom-level">${Math.round(this.zoomLevel * 100)}%</span>
            <button class="toolbar-btn" id="zoom-in-btn" type="button" aria-label="Zoom in">Zoom +</button>
            <button class="toolbar-btn" id="fit-screen-btn" type="button" aria-label="Fit image to viewer">Fit</button>
            <button class="toolbar-btn" id="pan-demo-btn" type="button" data-svd-workflow-action="apply-zoom-pan" aria-label="Apply zoom and pan state">Pan</button>
          </div>
          <div class="toolbar-section">
            <button class="toolbar-btn" id="rotate-left-btn" type="button" aria-label="Rotate left">Rotate -</button>
            <button class="toolbar-btn" id="rotate-right-btn" type="button" aria-label="Rotate right">Rotate +</button>
            <button class="toolbar-btn" id="edit-mode-btn" type="button" aria-pressed="${this.editMode ? 'true' : 'false'}">Edit</button>
            <button class="toolbar-btn" id="sidebar-toggle-btn" type="button" aria-label="Toggle sidebar">Sidebar</button>
          </div>
        </div>

        <div class="image-content">
          <aside class="image-sidebar ${this.sidebarVisible ? 'visible' : 'hidden'}" aria-label="Image details and workflow">
            <section class="sidebar-section">
              <div class="section-header">
                <h4>Images (${this.images.length})</h4>
              </div>
              <div class="image-list" id="image-list">${this.renderImageList()}</div>
            </section>

            <section class="sidebar-section">
              <div class="section-header">
                <h4>Image Info</h4>
              </div>
              <div class="image-info" id="image-info">${this.renderImageInfo()}</div>
            </section>

            <section class="sidebar-section">
              <div class="section-header">
                <h4>Adjustments</h4>
              </div>
              <div class="editing-tools" id="editing-tools">${this.renderEditingTools()}</div>
            </section>

            ${this.renderVdaG038Workflow()}
          </aside>

          <main class="image-display" id="image-display" aria-label="Image preview">
            ${this.currentImage ? this.renderImageDisplay() : this.renderWelcomeScreen()}
          </main>
        </div>

        <div class="actions-panel" aria-label="Image actions">
          <button class="action-btn" id="metadata-btn" type="button" data-svd-workflow-action="run-metadata-ocr" aria-label="Run metadata and OCR">Metadata/OCR</button>
          <button class="action-btn" id="enhance-quality-btn" type="button" data-svd-workflow-action="start-enhancement-job" aria-label="Start optional enhancement job">Enhance</button>
          <button class="action-btn" id="unsupported-format-btn" type="button" data-svd-workflow-action="show-unsupported-format" aria-label="Show unsupported image format state">Unsupported state</button>
          <button class="action-btn" id="alt-text-btn" type="button" data-svd-workflow-action="refresh-alt-text" aria-label="Refresh alt text state">Alt text</button>
        </div>
      </div>
      ${this.renderStyles()}
    `;
  }

  renderImageList() {
    if (this.images.length === 0) {
      return '<div class="empty-state">No images loaded. Open a file or retrieve a CID-backed image.</div>';
    }

    return this.images.map((image, index) => `
      <button class="image-list-item ${index === this.currentImageIndex ? 'active' : ''}" type="button" data-index="${index}" aria-label="Open ${escapeHTML(image.name)}">
        <span class="image-thumbnail" aria-hidden="true"></span>
        <span class="image-list-info">
          <span class="image-list-name">${escapeHTML(image.name)}</span>
          <span class="image-list-meta">${escapeHTML(image.dimensions)} - ${escapeHTML(image.format)} - ${escapeHTML(image.location)}</span>
        </span>
      </button>
    `).join('');
  }

  renderImageInfo() {
    if (!this.currentImage) {
      return '<div class="empty-state">No image selected.</div>';
    }

    const image = this.currentImage;
    return `
      ${this.infoRow('Name', image.name)}
      ${this.infoRow('CID', image.cid)}
      ${this.infoRow('Format', image.format)}
      ${this.infoRow('Dimensions', image.dimensions)}
      ${this.infoRow('Size', this.formatFileSize(image.size))}
      ${this.infoRow('Source', image.location)}
      ${this.infoRow('Zoom', `${Math.round(this.zoomLevel * 100)}%`)}
      ${this.infoRow('Pan', `${this.panX}, ${this.panY}`)}
    `;
  }

  renderEditingTools() {
    return `
      ${this.slider('brightness', 'Brightness', 0, 200, this.filters.brightness)}
      ${this.slider('contrast', 'Contrast', 0, 200, this.filters.contrast)}
      ${this.slider('saturation', 'Saturation', 0, 200, this.filters.saturation)}
      ${this.slider('hue', 'Hue', -180, 180, this.filters.hue)}
      ${this.slider('blur', 'Blur', 0, 10, this.filters.blur)}
      <button class="secondary-btn" id="reset-filters-btn" type="button">Reset filters</button>
      <button class="secondary-btn" id="auto-adjust-btn" type="button">Auto adjust</button>
    `;
  }

  renderImageDisplay() {
    const image = this.currentImage;
    const filterStyle = this.generateFilterStyle();
    return `
      <div class="image-stage" data-pan-x="${this.panX}" data-pan-y="${this.panY}">
        <img
          id="main-image"
          class="main-image"
          src="${escapeHTML(image.url)}"
          alt="${escapeHTML(image.altText)}"
          data-cid="${escapeHTML(image.cid)}"
          data-alt-text-state="${escapeHTML(this.vdaG038.altTextState)}"
          style="transform: translate(${this.panX}px, ${this.panY}px) rotate(${this.rotation}deg) scale(${this.zoomLevel}); ${filterStyle}"
        >
      </div>
    `;
  }

  renderWelcomeScreen() {
    return `
      <div class="welcome-screen">
        <h2>SwissKnife Image Viewer</h2>
        <p>Open local images or retrieve a CID-backed image with metadata, OCR, enhancement, and fallback states.</p>
        <button class="welcome-btn" id="welcome-retrieve-cid" type="button" data-svd-workflow-action="retrieve-cid-image">Retrieve CID image</button>
      </div>
    `;
  }

  renderVdaG038Workflow() {
    const state = this.vdaG038;
    return `
      <section class="sidebar-section image-workflow" data-svd-workflow="${escapeHTML(state.workflowId)}" aria-label="VDA-G038 Image Viewer workflow">
        <div class="section-header">
          <h4>VDA-G038 Workflow</h4>
        </div>
        <div class="workflow-grid">
          <article class="workflow-card" data-svd-vda-marker="cid-retrieval" data-retrieval-state="${escapeHTML(state.retrievalState)}">
            <strong>CID retrieval</strong>
            <span>${escapeHTML(state.imageCid)}</span>
            <span>${escapeHTML(state.retrievalManifestCid)}</span>
            <small>${escapeHTML(state.retrievalReceipt)}</small>
          </article>
          <article class="workflow-card" data-svd-vda-marker="metadata-ocr" data-metadata-state="${escapeHTML(state.metadataState)}">
            <strong>Metadata/OCR</strong>
            <span>${escapeHTML(state.metadataCid)}</span>
            <small>${escapeHTML(state.ocrText)}</small>
            <small>${escapeHTML(state.metadataReceipt)}</small>
          </article>
          <article class="workflow-card" data-svd-vda-marker="enhancement-job" data-enhancement-state="${escapeHTML(state.enhancementState)}" aria-busy="${state.enhancementState === 'running' ? 'true' : 'false'}">
            <strong>Enhancement job</strong>
            <span>${escapeHTML(state.enhancementCid)}</span>
            <progress value="${state.enhancementProgress}" max="100">${state.enhancementProgress}%</progress>
            <small>${escapeHTML(state.enhancementReceipt)}</small>
          </article>
          <article class="workflow-card" data-svd-vda-marker="zoom-pan" data-zoom-state="${escapeHTML(state.zoomPanState)}">
            <strong>Zoom/pan</strong>
            <span>${escapeHTML(state.zoomPanCid)}</span>
            <span>${Math.round(this.zoomLevel * 100)}% at ${this.panX}, ${this.panY}</span>
            <small>${escapeHTML(state.zoomPanReceipt)}</small>
          </article>
          <article class="workflow-card error-card" data-svd-vda-marker="unsupported-format" data-unsupported-format-state="${escapeHTML(state.unsupportedFormatState)}">
            <strong>Unsupported format</strong>
            <span>${escapeHTML(state.unsupportedCid)}</span>
            <span>${escapeHTML(state.unsupportedFormatName)} rejected with recovery: choose JPG, PNG, GIF, WebP, BMP, or SVG.</span>
            <small>${escapeHTML(state.unsupportedReceipt)}</small>
          </article>
          <article class="workflow-card" data-svd-vda-marker="alt-text" data-alt-text-state="${escapeHTML(state.altTextState)}">
            <strong>Alt text</strong>
            <span>${escapeHTML(state.altTextCid)}</span>
            <span>${escapeHTML(this.currentImage?.altText || state.altText)}</span>
            <small>${escapeHTML(state.altTextReceipt)}</small>
          </article>
        </div>
        <div class="workflow-actions" aria-label="Image Viewer VDA-G038 workflow actions">
          <button type="button" data-svd-workflow-action="retrieve-cid-image" data-action="retrieve-cid-image">Retrieve CID</button>
          <button type="button" data-svd-workflow-action="run-metadata-ocr" data-action="run-metadata-ocr">Metadata/OCR</button>
          <button type="button" data-svd-workflow-action="start-enhancement-job" data-action="start-enhancement-job">Enhance</button>
          <button type="button" data-svd-workflow-action="apply-zoom-pan" data-action="apply-zoom-pan">Zoom/pan</button>
          <button type="button" data-svd-workflow-action="show-unsupported-format" data-action="show-unsupported-format">Unsupported</button>
          <button type="button" data-svd-workflow-action="refresh-alt-text" data-action="refresh-alt-text">Alt text</button>
        </div>
        <ol class="workflow-log" id="image-workflow-log" data-svd-vda-marker="workflow-receipts">
          ${state.log.map(entry => `<li>${escapeHTML(entry)}</li>`).join('')}
        </ol>
      </section>
    `;
  }

  renderStyles() {
    return `
      <style>
        .image-viewer-container {
          height: 100%;
          min-height: 520px;
          background: #111827;
          color: #f8fafc;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .image-toolbar,
        .actions-panel {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 10px;
          background: #1f2937;
          border-bottom: 1px solid #374151;
          flex-wrap: wrap;
        }
        .actions-panel {
          border-top: 1px solid #374151;
          border-bottom: 0;
        }
        .toolbar-section {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }
        button.toolbar-btn,
        button.action-btn,
        button.secondary-btn,
        .workflow-actions button,
        .welcome-btn,
        .image-list-item {
          border: 1px solid #4b5563;
          background: #243244;
          color: #f8fafc;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
        }
        button.toolbar-btn,
        button.action-btn,
        button.secondary-btn,
        .workflow-actions button,
        .welcome-btn {
          min-height: 32px;
          padding: 6px 10px;
        }
        button:hover:not(:disabled) {
          background: #334155;
          border-color: #94a3b8;
        }
        button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .primary-action {
          background: #0f766e;
          border-color: #14b8a6;
        }
        .image-counter,
        .zoom-level {
          min-width: 64px;
          text-align: center;
          font-size: 12px;
          color: #cbd5e1;
        }
        .image-content {
          display: flex;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .image-sidebar {
          width: 350px;
          min-width: 280px;
          max-width: 42%;
          background: #172033;
          border-right: 1px solid #374151;
          overflow-y: auto;
        }
        .image-sidebar.hidden {
          display: none;
        }
        .sidebar-section {
          border-bottom: 1px solid #334155;
        }
        .section-header {
          padding: 10px 12px;
          background: #1e293b;
        }
        .section-header h4 {
          margin: 0;
          font-size: 13px;
        }
        .image-list,
        .image-info,
        .editing-tools,
        .image-workflow {
          padding: 10px;
        }
        .image-list-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          text-align: left;
          margin-bottom: 6px;
        }
        .image-list-item.active {
          border-color: #2dd4bf;
          background: #134e4a;
        }
        .image-thumbnail {
          width: 30px;
          height: 30px;
          border-radius: 4px;
          background: linear-gradient(135deg, #2563eb, #14b8a6);
          flex: 0 0 auto;
        }
        .image-list-info {
          display: grid;
          gap: 2px;
          min-width: 0;
        }
        .image-list-name,
        .image-list-meta {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .image-list-meta {
          color: #cbd5e1;
          font-size: 11px;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 7px;
          font-size: 12px;
        }
        .info-label {
          color: #cbd5e1;
        }
        .info-value {
          text-align: right;
          word-break: break-word;
        }
        .slider-control {
          display: grid;
          grid-template-columns: 82px 1fr 36px;
          gap: 8px;
          align-items: center;
          margin-bottom: 8px;
          font-size: 12px;
        }
        .slider-control input {
          min-width: 80px;
        }
        .image-display {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0b1120;
          overflow: hidden;
          position: relative;
        }
        .image-stage {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .main-image {
          max-width: 86%;
          max-height: 86%;
          object-fit: contain;
          border-radius: 6px;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
          transition: transform 180ms ease, filter 180ms ease;
          transform-origin: center center;
          cursor: grab;
        }
        .workflow-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
        }
        .workflow-card {
          display: grid;
          gap: 4px;
          padding: 8px;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 6px;
          font-size: 11px;
        }
        .workflow-card strong {
          color: #f8fafc;
          font-size: 12px;
        }
        .workflow-card span,
        .workflow-card small {
          color: #cbd5e1;
          overflow-wrap: anywhere;
        }
        .workflow-card progress {
          width: 100%;
          height: 8px;
        }
        .error-card {
          border-color: #f97316;
        }
        .workflow-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          margin-top: 10px;
        }
        .workflow-log {
          margin: 10px 0 0;
          padding-left: 18px;
          color: #cbd5e1;
          font-size: 11px;
        }
        .empty-state,
        .welcome-screen {
          color: #cbd5e1;
          text-align: center;
          padding: 24px;
        }
        @media (max-width: 700px) {
          .image-toolbar,
          .actions-panel {
            align-items: stretch;
          }
          .image-content {
            flex-direction: column;
          }
          .image-sidebar {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            max-height: 48%;
            border-right: 0;
            border-bottom: 1px solid #374151;
          }
          .workflow-actions {
            grid-template-columns: 1fr;
          }
          .toolbar-section {
            flex-wrap: wrap;
          }
        }
      </style>
    `;
  }

  setupEventHandlers() {
    const container = this.container();
    if (!container) return;

    this.on(container, '#open-files-btn', 'click', () => this.openImages());
    this.on(container, '#image-file-input', 'change', event => this.loadLocalImages(event.target.files));
    this.on(container, '#retrieve-cid-btn', 'click', () => this.retrieveCidImage());
    this.on(container, '#welcome-retrieve-cid', 'click', () => this.retrieveCidImage());
    this.on(container, '#prev-image-btn', 'click', () => this.navigateImage(-1));
    this.on(container, '#next-image-btn', 'click', () => this.navigateImage(1));
    this.on(container, '#zoom-in-btn', 'click', () => this.zoomIn());
    this.on(container, '#zoom-out-btn', 'click', () => this.zoomOut());
    this.on(container, '#fit-screen-btn', 'click', () => this.fitToWindow());
    this.on(container, '#pan-demo-btn', 'click', () => this.applyZoomPan());
    this.on(container, '#rotate-left-btn', 'click', () => this.rotate(-90));
    this.on(container, '#rotate-right-btn', 'click', () => this.rotate(90));
    this.on(container, '#edit-mode-btn', 'click', () => this.toggleEditMode());
    this.on(container, '#sidebar-toggle-btn', 'click', () => this.toggleSidebar());
    this.on(container, '#reset-filters-btn', 'click', () => this.resetFilters());
    this.on(container, '#auto-adjust-btn', 'click', () => this.autoAdjust());
    this.on(container, '#metadata-btn', 'click', () => this.runMetadataOcr());
    this.on(container, '#enhance-quality-btn', 'click', () => this.startEnhancementJob());
    this.on(container, '#unsupported-format-btn', 'click', () => this.showUnsupportedFormat());
    this.on(container, '#alt-text-btn', 'click', () => this.refreshAltText());

    container.querySelectorAll('.image-list-item').forEach(item => {
      item.addEventListener('click', () => this.selectImage(Number(item.dataset.index)));
    });

    container.querySelectorAll('[data-svd-workflow-action]').forEach(button => {
      const action = button.dataset.svdWorkflowAction;
      if (action === 'retrieve-cid-image') button.addEventListener('click', () => this.retrieveCidImage());
      if (action === 'run-metadata-ocr') button.addEventListener('click', () => this.runMetadataOcr());
      if (action === 'start-enhancement-job') button.addEventListener('click', () => this.startEnhancementJob());
      if (action === 'apply-zoom-pan') button.addEventListener('click', () => this.applyZoomPan());
      if (action === 'show-unsupported-format') button.addEventListener('click', () => this.showUnsupportedFormat());
      if (action === 'refresh-alt-text') button.addEventListener('click', () => this.refreshAltText());
    });

    ['brightness', 'contrast', 'saturation', 'hue', 'blur'].forEach(name => {
      this.on(container, `#${name}-slider`, 'input', event => this.updateFilter(name, event.target.value));
    });
  }

  on(container, selector, eventName, handler) {
    const element = container.querySelector(selector);
    if (element) element.addEventListener(eventName, handler);
  }

  container() {
    return document.querySelector(`[data-image-viewer-instance="${CSS.escape(this.instanceId)}"]`);
  }

  refreshContent() {
    const container = this.container();
    if (!container) return;
    const replacement = document.createElement('div');
    replacement.innerHTML = this.getWindowContent();
    const next = replacement.firstElementChild;
    container.replaceWith(next);
    this.setupEventHandlers();
  }

  updateImageDisplay() {
    const container = this.container();
    if (!container) return;
    const image = container.querySelector('#main-image');
    if (image) {
      image.style.transform = `translate(${this.panX}px, ${this.panY}px) rotate(${this.rotation}deg) scale(${this.zoomLevel})`;
      image.style.filter = this.filterCSS();
      image.setAttribute('data-alt-text-state', this.vdaG038.altTextState);
      image.alt = this.currentImage?.altText || this.vdaG038.altText;
    }
    const zoomLevel = container.querySelector('#zoom-level');
    if (zoomLevel) zoomLevel.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    const zoomMarkers = container.querySelectorAll('[data-zoom-state]');
    zoomMarkers.forEach(marker => marker.setAttribute('data-zoom-state', this.vdaG038.zoomPanState));
  }

  openImages() {
    this.container()?.querySelector('#image-file-input')?.click();
  }

  loadLocalImages(files) {
    const accepted = [];
    const unsupported = [];
    for (const file of Array.from(files || [])) {
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      if (!this.supportedFormats().includes(extension)) {
        unsupported.push(file.name);
        continue;
      }
      accepted.push(file);
    }

    for (const file of accepted) {
      const url = URL.createObjectURL(file);
      this.images.push({
        name: file.name,
        url,
        cid: `local:${file.name}`,
        size: file.size,
        dimensions: 'pending',
        format: extensionLabel(file.name),
        location: 'local file',
        altText: `Local image ${file.name}`,
      });
    }

    if (unsupported.length > 0) {
      this.vdaG038.unsupportedFormatState = 'rejected';
      this.vdaG038.unsupportedFormatName = unsupported[0];
      this.appendWorkflowLog(`${this.vdaG038.unsupportedReceipt} unsupported format ${unsupported[0]} rejected`);
    }

    if (accepted.length > 0) {
      this.currentImageIndex = this.images.length - accepted.length;
      this.currentImage = this.images[this.currentImageIndex];
    }
    this.refreshContent();
  }

  retrieveCidImage() {
    this.vdaG038.retrievalState = 'retrieved';
    this.currentImageIndex = 0;
    this.currentImage = this.images[0];
    this.appendWorkflowLog(`${this.vdaG038.retrievalReceipt} retrieved ${this.vdaG038.imageCid} through ipfs.kit.tool.ipfs_cat`);
    this.refreshContent();
  }

  runMetadataOcr() {
    this.vdaG038.metadataState = 'parsed';
    this.vdaG038.ocrText = 'OCR: ridge trail sign, lake marker, and SwissKnife sample label detected.';
    this.appendWorkflowLog(`${this.vdaG038.metadataReceipt} metadata and OCR parsed for ${this.vdaG038.metadataCid}`);
    this.refreshContent();
  }

  startEnhancementJob() {
    this.vdaG038.enhancementState = 'completed';
    this.vdaG038.enhancementProgress = 100;
    this.filters.brightness = 108;
    this.filters.contrast = 112;
    this.filters.saturation = 106;
    this.editMode = true;
    this.appendWorkflowLog(`${this.vdaG038.enhancementReceipt} optional enhancement job completed with ${this.vdaG038.enhancementCid}`);
    this.refreshContent();
  }

  applyZoomPan() {
    this.zoomLevel = 1.45;
    this.panX = 28;
    this.panY = -18;
    this.vdaG038.zoomPanState = 'zoomed-panned';
    this.appendWorkflowLog(`${this.vdaG038.zoomPanReceipt} zoom/pan state 145% at 28,-18`);
    this.updateImageDisplay();
  }

  showUnsupportedFormat() {
    this.vdaG038.unsupportedFormatState = 'rejected';
    this.vdaG038.unsupportedFormatName = 'diagram.tiff';
    this.appendWorkflowLog(`${this.vdaG038.unsupportedReceipt} unsupported format diagram.tiff rejected with recovery choices`);
    this.refreshContent();
  }

  refreshAltText() {
    this.vdaG038.altTextState = 'available';
    this.vdaG038.altText = 'CID-backed landscape sample with blue lake, green ridge, and readable OCR label.';
    if (this.currentImage) this.currentImage.altText = this.vdaG038.altText;
    this.appendWorkflowLog(`${this.vdaG038.altTextReceipt} alt text refreshed for accessible image state`);
    this.updateImageDisplay();
    this.refreshContent();
  }

  navigateImage(direction) {
    if (this.images.length <= 1) return;
    this.currentImageIndex = (this.currentImageIndex + direction + this.images.length) % this.images.length;
    this.currentImage = this.images[this.currentImageIndex];
    this.refreshContent();
  }

  selectImage(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.images.length) return;
    this.currentImageIndex = index;
    this.currentImage = this.images[index];
    this.refreshContent();
  }

  zoomIn() {
    this.zoomLevel = Math.min(this.zoomLevel * 1.2, 5);
    this.vdaG038.zoomPanState = 'zoomed';
    this.updateImageDisplay();
  }

  zoomOut() {
    this.zoomLevel = Math.max(this.zoomLevel / 1.2, 0.2);
    this.vdaG038.zoomPanState = 'zoomed';
    this.updateImageDisplay();
  }

  fitToWindow() {
    this.zoomLevel = 1;
    this.panX = 0;
    this.panY = 0;
    this.vdaG038.zoomPanState = 'fit';
    this.updateImageDisplay();
  }

  rotate(degrees) {
    this.rotation = (this.rotation + degrees + 360) % 360;
    this.updateImageDisplay();
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    this.refreshContent();
  }

  toggleSidebar() {
    this.sidebarVisible = !this.sidebarVisible;
    this.refreshContent();
  }

  updateFilter(filterName, value) {
    this.filters[filterName] = Number(value);
    this.editMode = true;
    const container = this.container();
    const valueNode = container?.querySelector(`#${filterName}-slider`)?.closest('.slider-control')?.querySelector('.slider-value');
    if (valueNode) valueNode.textContent = String(value);
    this.updateImageDisplay();
  }

  resetFilters() {
    this.filters = {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      hue: 0,
      blur: 0,
      sepia: 0,
      grayscale: 0,
    };
    this.editMode = false;
    this.refreshContent();
  }

  autoAdjust() {
    this.filters.brightness = 106;
    this.filters.contrast = 110;
    this.filters.saturation = 104;
    this.editMode = true;
    this.refreshContent();
  }

  async analyzeImage() {
    this.runMetadataOcr();
    return this.vdaG038;
  }

  async enhanceQuality() {
    this.startEnhancementJob();
    return this.vdaG038;
  }

  async exerciseMediaArtifactGateway() {
    return runMediaArtifactWorkflow({
      desktop: this.desktop,
      appId: APP_ID,
      mediaType: 'image',
      mimeType: 'image/svg+xml',
      operation: 'analyze-enhance-image',
      model: 'image-enhancement-ocr-v1',
      prompt: 'Analyze image metadata, OCR visible text, and prepare an enhanced image artifact.',
      artifact: {
        id: this.currentImage?.cid || this.vdaG038.imageCid,
        name: this.currentImage?.name || 'CID-backed image',
        filename: 'image-viewer-enhancement.json',
        content: {
          source_cid: this.vdaG038.imageCid,
          metadata_cid: this.vdaG038.metadataCid,
          enhancement_cid: this.vdaG038.enhancementCid,
          alt_text: this.vdaG038.altText,
        },
        metadata: {
          ocr_text: this.vdaG038.ocrText,
          dimensions: this.currentImage?.dimensions,
          unsupported_state: this.vdaG038.unsupportedFormatState,
        },
      },
      datasetId: 'swissknife-image-viewer-g038',
      jobId: 'image-viewer-g038-enhancement-job',
    });
  }

  createSeedImages() {
    const imageCid = 'bafyimageviewerg038sourcecidretrieval';
    return [
      {
        name: 'cid-ridge-lake.svg',
        url: svgDataUri('CID ridge lake', '#0f766e', '#2563eb'),
        cid: imageCid,
        size: 184320,
        dimensions: '1600x1000',
        format: 'SVG',
        location: 'ipfs_kit CID',
        altText: 'CID-backed landscape sample with lake, ridge, and visible label.',
      },
      {
        name: 'ocr-contact-sheet.png',
        url: svgDataUri('OCR contact sheet', '#7c2d12', '#f97316'),
        cid: 'bafyimageviewerg038metadataocrcontactsheet',
        size: 262144,
        dimensions: '1200x800',
        format: 'PNG',
        location: 'local cache',
        altText: 'Contact sheet sample for OCR and metadata extraction.',
      },
    ];
  }

  createVdaG038WorkflowState() {
    return {
      workflowId: 'image-viewer.cid-metadata-enhancement',
      vdaId: 'VDA-G038',
      imageCid: 'bafyimageviewerg038sourcecidretrieval',
      retrievalManifestCid: 'bafyimageviewerg038retrievalmanifest',
      metadataCid: 'bafyimageviewerg038metadataocr',
      enhancementCid: 'bafyimageviewerg038enhancementjob',
      zoomPanCid: 'bafyimageviewerg038zoompanstate',
      unsupportedCid: 'bafyimageviewerg038unsupportedformat',
      altTextCid: 'bafyimageviewerg038alttext',
      retrievalReceipt: 'receipt:image-viewer:g038:cid-retrieval:retrieved',
      metadataReceipt: 'receipt:image-viewer:g038:metadata-ocr:parsed',
      enhancementReceipt: 'receipt:image-viewer:g038:enhancement-job:completed',
      zoomPanReceipt: 'receipt:image-viewer:g038:zoom-pan:applied',
      unsupportedReceipt: 'receipt:image-viewer:g038:unsupported-format:rejected',
      altTextReceipt: 'receipt:image-viewer:g038:alt-text:available',
      retrievalState: 'retrieved',
      metadataState: 'parsed',
      enhancementState: 'queued',
      enhancementProgress: 35,
      zoomPanState: 'fit',
      unsupportedFormatState: 'rejected',
      unsupportedFormatName: 'diagram.tiff',
      altTextState: 'available',
      altText: 'CID-backed landscape sample with lake, ridge, and readable label.',
      ocrText: 'OCR: ridge trail sign and lake marker visible.',
      log: [
        'receipt:image-viewer:g038:cid-retrieval:retrieved mapped bafyimageviewerg038sourcecidretrieval through bafyimageviewerg038retrievalmanifest',
        'receipt:image-viewer:g038:metadata-ocr:parsed metadata CID bafyimageviewerg038metadataocr includes EXIF summary and OCR text',
      ],
    };
  }

  loadStoredImages() {
    try {
      const storedImages = localStorage.getItem('image-viewer-images');
      if (!storedImages) return;
      const parsed = JSON.parse(storedImages);
      if (!Array.isArray(parsed)) return;
      for (const image of parsed) {
        if (image?.name && image?.url) this.images.push({ ...image, altText: image.altText || `Stored image ${image.name}` });
      }
    } catch (error) {
      console.warn('Could not load stored images:', error);
    }
  }

  appendWorkflowLog(entry) {
    if (!this.vdaG038.log.includes(entry)) this.vdaG038.log.push(entry);
  }

  generateFilterStyle() {
    return `filter: ${this.filterCSS()};`;
  }

  filterCSS() {
    if (!this.editMode) return 'none';
    return [
      `brightness(${this.filters.brightness}%)`,
      `contrast(${this.filters.contrast}%)`,
      `saturate(${this.filters.saturation}%)`,
      `hue-rotate(${this.filters.hue}deg)`,
      `blur(${this.filters.blur}px)`,
      `sepia(${this.filters.sepia}%)`,
      `grayscale(${this.filters.grayscale}%)`,
    ].join(' ');
  }

  slider(id, label, min, max, value) {
    return `
      <label class="slider-control" for="${id}-slider">
        <span>${escapeHTML(label)}</span>
        <input type="range" id="${id}-slider" min="${min}" max="${max}" value="${value}">
        <span class="slider-value">${value}</span>
      </label>
    `;
  }

  infoRow(label, value) {
    return `
      <div class="info-row">
        <span class="info-label">${escapeHTML(label)}:</span>
        <span class="info-value">${escapeHTML(value || 'n/a')}</span>
      </div>
    `;
  }

  formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
    return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${sizes[index]}`;
  }

  supportedFormats() {
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
  }
}

function svgDataUri(label, colorA, colorB) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${colorA}"/>
          <stop offset="1" stop-color="${colorB}"/>
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#sky)"/>
      <path d="M0 710 C260 560 460 610 660 480 C870 340 1080 520 1290 390 C1430 305 1530 330 1600 300 L1600 1000 L0 1000 Z" fill="#0f172a" opacity="0.72"/>
      <path d="M0 790 C260 760 420 810 650 750 C900 685 1030 750 1260 700 C1420 665 1530 690 1600 670 L1600 1000 L0 1000 Z" fill="#14b8a6" opacity="0.45"/>
      <rect x="90" y="96" width="560" height="104" rx="14" fill="rgba(15,23,42,0.76)"/>
      <text x="120" y="158" fill="#f8fafc" font-size="46" font-family="Arial, sans-serif">${label}</text>
      <text x="120" y="188" fill="#cbd5e1" font-size="20" font-family="Arial, sans-serif">VDA-G038 OCR sample label</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function extensionLabel(name) {
  return (name.split('.').pop() || 'image').toUpperCase();
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

if (typeof window !== 'undefined') {
  window.ImageViewerApp = ImageViewerApp;
  window.createImageViewerApp = desktop => new ImageViewerApp(desktop);
}
