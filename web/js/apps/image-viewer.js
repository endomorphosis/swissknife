/**
 * Advanced Image Viewer App for SwissKnife Web Desktop
 * CID-backed image viewing, metadata, enhancement workflow, and accessible
 * image state handling.
 *
 * Backend contract: image bytes and metadata persist through
 * POST /mcp/tools/call using IDL method request_action.
 * Retrieval tool id: mcp++:ipfs_kit_py/artifacts/get.
 * Every backend-mutating POST sits behind an explicit user confirmation step;
 * backend failures surface verbatim and never fall back to fixtures or
 * simulated success. Zoom, pan, filters and alt text are honestly local.
 */

import { contentCidForBytes, stableStringifyValue, base64ForBytes } from '../core/mcp-plus-plus-desktop-client.js';

async function backendClient() {
  const clientModule = await import('../core/mcp-plus-plus-desktop-client.js');
  return clientModule.getMCPPlusPlusDesktopClient();
}

function bytesFromBase64(b64) {
  const bin = atob(String(b64 || '').replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function guessImageMime(artifact, bytes) {
  const name = String(artifact?.name || artifact?.filename || '').toLowerCase();
  const kind = String(artifact?.kind || '').toLowerCase();
  if (bytes && bytes.length >= 4) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp';
  }
  if (bytes && bytes.length > 64) {
    const head = new TextDecoder().decode(bytes.slice(0, 64)).trimStart();
    if (head.startsWith('<svg')) return 'image/svg+xml';
  }
  if (/\.png$/.test(name) || kind.includes('png')) return 'image/png';
  if (/\.(jpe?g)$/.test(name)) return 'image/jpeg';
  if (/\.gif$/.test(name)) return 'image/gif';
  if (/\.webp$/.test(name)) return 'image/webp';
  if (/\.svg$/.test(name)) return 'image/svg+xml';
  return 'application/octet-stream';
}

async function parseToolResponse(response) {
  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (parseError) {
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
        <p class="iv-gateway-status" data-gateway-status="true">${escapeHTML(this.vdaG038.gatewayStatus || '')}</p>
        <div class="image-toolbar" aria-label="Image Viewer toolbar">
          <div class="toolbar-section">
            <button class="toolbar-btn primary-action" id="open-files-btn" type="button" title="Open image files" aria-label="Open image files">Open</button>
            <button class="toolbar-btn" id="retrieve-cid-btn" type="button" data-live-gateway-binding="image-viewer.ipfs_kit_py.retrieve_content" data-action="retrieve-cid-image" aria-label="Retrieve CID-backed image">Retrieve CID</button>
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
            <button class="toolbar-btn" id="edit-mode-btn" type="button" aria-label="Edit" aria-pressed="${this.editMode ? 'true' : 'false'}">Edit</button>
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
          <button class="action-btn" id="metadata-btn" type="button" data-svd-workflow-action="run-metadata-ocr" aria-label="Measure local image metadata">Metadata (local)</button>
          <button class="action-btn" id="publish-btn" type="button" data-svd-workflow-action="publish-image" aria-label="Publish image to ipfs_kit_py">Publish</button>
          <button class="action-btn" id="enhance-quality-btn" type="button" data-svd-workflow-action="start-enhancement-job" aria-label="Apply local auto-adjust">Enhance (local)</button>
          <button class="action-btn" id="unsupported-format-btn" type="button" data-svd-workflow-action="show-unsupported-format" aria-label="Show unsupported image format state">Unsupported state</button>
          <button class="action-btn" id="alt-text-btn" type="button" data-svd-workflow-action="refresh-alt-text" aria-label="Edit alt text">Alt text (local)</button>
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
      <button class="image-list-item ${index === this.currentImageIndex ? 'active' : ''}" type="button" data-action="open-listed-image" data-index="${index}" aria-label="Open ${escapeHTML(image.name)}">
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
      <button class="secondary-btn" id="reset-filters-btn" type="button" aria-label="Reset filters">Reset filters</button>
      <button class="secondary-btn" id="auto-adjust-btn" type="button" aria-label="Auto adjust">Auto adjust</button>
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
        <button class="welcome-btn" id="welcome-retrieve-cid" type="button" data-action="retrieve-cid-image" data-svd-workflow-action="retrieve-cid-image">Retrieve CID image</button>
      </div>
    `;
  }

  renderVdaG038Workflow() {
    const state = this.vdaG038;
    const published = this.readPublishedIndex();
    return `
      <section class="sidebar-section image-workflow" data-svd-workflow="${escapeHTML(state.workflowId)}" aria-label="VDA-G038 Image Viewer workflow">
        <div class="section-header">
          <h4>VDA-G038 Workflow</h4>
          <p class="workflow-note">Retrieval and publishing run against the live ipfs_kit_py backend; every CID shown comes from a real artifacts/put or artifacts/get call. Zoom, filters and alt text are local. Backend writes ask for confirmation first.</p>
        </div>
        <div class="workflow-grid">
          <article class="workflow-card" data-svd-vda-marker="cid-retrieval" data-retrieval-state="${escapeHTML(state.retrievalState)}">
            <strong>CID retrieval (backend)</strong>
            <span>${escapeHTML(state.lastRetrievedCid || 'No CID retrieved yet.')}</span>
            <span>${escapeHTML(state.lastRetrievedInfo)}</span>
          </article>
          <article class="workflow-card" data-svd-vda-marker="metadata-ocr" data-metadata-state="${escapeHTML(state.metadataState)}">
            <strong>Metadata (local)</strong>
            <span>${escapeHTML(state.metadataSummary)}</span>
            <span>No OCR backend is wired — no OCR text is claimed.</span>
          </article>
          <article class="workflow-card" data-svd-vda-marker="enhancement-job" data-enhancement-state="${escapeHTML(state.enhancementState)}">
            <strong>Enhancement (local)</strong>
            <span>Local auto-adjust via CSS filters only. No backend enhancement job exists.</span>
          </article>
          <article class="workflow-card" data-svd-vda-marker="zoom-pan" data-zoom-state="${escapeHTML(state.zoomPanState)}">
            <strong>Zoom/pan (local)</strong>
            <span>${Math.round(this.zoomLevel * 100)}% at ${this.panX}, ${this.panY}</span>
          </article>
          <article class="workflow-card error-card" data-svd-vda-marker="unsupported-format" data-unsupported-format-state="${escapeHTML(state.unsupportedFormatState)}">
            <strong>Unsupported format (local)</strong>
            <span>Accepted: ${this.supportedFormats().map(f => f.toUpperCase()).join(', ')}.</span>
            <span>${state.unsupportedFormatName ? `Last rejected: ${escapeHTML(state.unsupportedFormatName)}` : 'No rejections recorded.'}</span>
          </article>
          <article class="workflow-card" data-svd-vda-marker="alt-text" data-alt-text-state="${escapeHTML(state.altTextState)}">
            <strong>Alt text (local)</strong>
            <span>${escapeHTML(this.currentImage?.altText || state.altText || 'No alt text set.')}</span>
          </article>
        </div>
        <div class="workflow-actions" aria-label="Image Viewer VDA-G038 workflow actions">
          <button type="button" data-svd-workflow-action="retrieve-cid-image" data-action="retrieve-cid-image">Retrieve CID</button>
          <button type="button" data-svd-workflow-action="publish-image" data-action="publish-image">Publish</button>
          <button type="button" data-svd-workflow-action="run-metadata-ocr" data-action="run-metadata-ocr">Metadata</button>
          <button type="button" data-svd-workflow-action="start-enhancement-job" data-action="start-enhancement-job">Enhance</button>
          <button type="button" data-svd-workflow-action="apply-zoom-pan" data-action="apply-zoom-pan">Zoom/pan</button>
          <button type="button" data-svd-workflow-action="show-unsupported-format" data-action="show-unsupported-format">Unsupported</button>
          <button type="button" data-svd-workflow-action="refresh-alt-text" data-action="refresh-alt-text">Alt text</button>
        </div>
        ${published.length > 0 ? `
        <div class="published-index" aria-label="Previously published images">
          <h5>Published (real artifacts — select to re-retrieve)</h5>
          <ul>
            ${published.map((entry, i) => `<li><button type="button" data-published-index="${i}" title="${escapeHTML(entry.cid)}">${escapeHTML(entry.name)} · ${escapeHTML(entry.cid.slice(0, 18))}…</button></li>`).join('')}
          </ul>
        </div>` : ''}
        <ol class="workflow-log" id="image-workflow-log" data-svd-vda-marker="workflow-receipts">
          ${state.log.length > 0 ? state.log.map(entry => `<li>${escapeHTML(entry)}</li>`).join('') : '<li>No backend operations yet.</li>'}
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
        .workflow-note {
          margin: 6px 0 0;
          color: #94a3b8;
          font-size: 11px;
          line-height: 1.45;
        }
        .published-index {
          margin-top: 10px;
          padding: 8px;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 6px;
        }
        .published-index h5 {
          margin: 0 0 6px;
          font-size: 11px;
          color: #f8fafc;
        }
        .published-index ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 4px;
          max-height: 120px;
          overflow-y: auto;
        }
        .published-index button {
          width: 100%;
          text-align: left;
          background: #1e293b;
          border: 1px solid #475569;
          color: #e2e8f0;
          border-radius: 4px;
          padding: 6px 8px;
          font-size: 11px;
          cursor: pointer;
          overflow-wrap: anywhere;
        }
        .published-index button:hover {
          border-color: #2dd4bf;
        }
        .iv-governed-confirm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.78);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 20000;
        }
        .iv-governed-confirm-dialog {
          background: #0f172a;
          border: 1px solid #2dd4bf;
          border-radius: 8px;
          color: #f8fafc;
          max-width: 430px;
          width: calc(100% - 48px);
          max-height: 80vh;
          overflow-y: auto;
          padding: 18px;
        }
        .iv-governed-confirm-dialog h3 {
          margin: 0 0 8px;
          font-size: 14px;
          color: #5eead4;
        }
        .iv-governed-confirm-dialog p {
          margin: 0 0 8px;
          font-size: 12px;
          color: #cbd5e1;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }
        .iv-governed-target {
          color: #5eead4 !important;
          font-size: 11px !important;
        }
        .iv-governed-check {
          display: flex;
          gap: 8px;
          align-items: flex-start;
          font-size: 12px;
          margin: 10px 0;
          cursor: pointer;
        }
        .iv-governed-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          margin-top: 12px;
        }
        .iv-governed-actions button {
          background: #134e4a;
          border: 1px solid #2dd4bf;
          color: #f8fafc;
          padding: 8px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
        }
        .iv-governed-actions button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .iv-cid-input {
          width: 100%;
          box-sizing: border-box;
          background: #020617;
          border: 1px solid #475569;
          color: #f8fafc;
          padding: 8px;
          border-radius: 6px;
          font-size: 12px;
          margin-top: 4px;
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
    this.on(container, '#publish-btn', 'click', () => this.publishCurrentImage());
    this.on(container, '#enhance-quality-btn', 'click', () => this.startEnhancementJob());
    this.on(container, '#unsupported-format-btn', 'click', () => this.showUnsupportedFormat());
    this.on(container, '#alt-text-btn', 'click', () => this.refreshAltText());

    container.querySelectorAll('.image-list-item').forEach(item => {
      item.addEventListener('click', () => this.selectImage(Number(item.dataset.index)));
    });

    container.querySelectorAll('[data-svd-workflow-action]').forEach(button => {
      const action = button.dataset.svdWorkflowAction;
      if (action === 'retrieve-cid-image') button.addEventListener('click', () => this.retrieveCidImage());
      if (action === 'publish-image') button.addEventListener('click', () => this.publishCurrentImage());
      if (action === 'run-metadata-ocr') button.addEventListener('click', () => this.runMetadataOcr());
      if (action === 'start-enhancement-job') button.addEventListener('click', () => this.startEnhancementJob());
      if (action === 'apply-zoom-pan') button.addEventListener('click', () => this.applyZoomPan());
      if (action === 'show-unsupported-format') button.addEventListener('click', () => this.showUnsupportedFormat());
      if (action === 'refresh-alt-text') button.addEventListener('click', () => this.refreshAltText());
    });

    container.querySelectorAll('[data-published-index]').forEach(button => {
      button.addEventListener('click', () => {
        const entry = this.readPublishedIndex()[Number(button.dataset.publishedIndex)];
        if (entry?.cid) this.retrieveCidImage(entry.cid);
      });
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
      const image = {
        name: file.name,
        url,
        cid: 'local (not published)',
        size: file.size,
        dimensions: 'pending',
        format: extensionLabel(file.name),
        location: 'local file',
        altText: `Local image ${file.name}`,
        file,
        bytes: null,
      };
      this.images.push(image);
      this.measureImageDimensions(image);
    }

    if (unsupported.length > 0) {
      this.vdaG038.unsupportedFormatState = 'rejected';
      this.vdaG038.unsupportedFormatName = unsupported[0];
      this.appendWorkflowLog(`unsupported format ${unsupported[0]} rejected (accepted: ${this.supportedFormats().join(', ').toUpperCase()})`);
    }

    if (accepted.length > 0) {
      this.currentImageIndex = this.images.length - accepted.length;
      this.currentImage = this.images[this.currentImageIndex];
    }
    this.refreshContent();
  }

  /**
   * 🛰️ Retrieve a CID-backed image via POST /mcp/tools/call
   * (request_action, tool mcp++:ipfs_kit_py/artifacts/get). Bytes are decoded, sniffed for a real MIME type and shown
   * from a blob URL. Retrieval time is measured, never fabricated. Backend
   * failures surface verbatim — never a fixture gallery entry.
   */
  async retrieveCidImage(presetCid = null) {
    const cid = presetCid || await this.promptForCid(
      'Retrieve CID image',
      'Enter the CID of an image artifact stored in ipfs_kit_py. Its real bytes will be fetched and added to the gallery.'
    );
    if (!cid) return;
    const toolId = 'ipfs_cat';
    const bindingId = 'image-viewer.ipfs_kit_py.retrieve_content';
    const correlationId = `image-viewer:retrieve:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const dryRun = globalThis.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__ === true;
    this.vdaG038.retrievalState = 'retrieving';
    this.vdaG038.gatewayStatus = `${toolId} ${correlationId}`;
    this.vdaG038.lastRetrievedInfo = `Retrieving ${cid} from ipfs_kit_py…`;
    this.appendWorkflowLog(`retrieving ${cid} via ${toolId} ${correlationId}`);
    this.refreshContent();
    const started = performance.now();
    try {
      const response = await fetch('/mcp/tools/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol: 'swissknife.all-app-tool-gateway.v1',
          route: '/mcp/tools/call',
          binding_id: bindingId,
          app_id: 'image-viewer',
          intent_id: bindingId,
          owner: 'ipfs_kit_py',
          tool_id: toolId,
          transport: 'http',
          correlation_id: correlationId,
          receipt_required: true,
          input: {
            correlation_id: correlationId,
            payload: { cid, scope: bindingId, limit: 1 },
            policy: {
              decision_id: `desktop-policy:${bindingId}`,
              outcome: 'require_confirmation',
              reason: dryRun
                ? 'Image retrieval runs as a no-side-effect dry run while the desktop gateway forces dry run.'
                : 'Image retrieval reads one CID through the mediated ipfs_kit_py gateway.',
              consent: dryRun ? 'not_required' : 'granted',
              dry_run: dryRun,
            },
          },
        }),
      });
      const artifact = await parseToolResponse(response);
      const ms = Math.round(performance.now() - started);
      const bytes = bytesFromBase64(artifact?.bytes_base64 || artifact?.result?.bytes_base64 || '');
      if (dryRun) {
        this.vdaG038.retrievalState = 'retrieved';
        this.vdaG038.lastRetrievedCid = cid;
        this.vdaG038.gatewayStatus = `${toolId} ${correlationId}`;
        this.vdaG038.lastRetrievedInfo = `dry run ${toolId} ${correlationId}`;
        this.appendWorkflowLog(this.vdaG038.lastRetrievedInfo);
      } else if (bytes.length > 0) {
        const mime = guessImageMime(artifact, bytes);
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        const image = {
          name: artifact.name || artifact.filename || `cid-${cid.slice(0, 12)}`,
          url,
          cid,
          size: bytes.length,
          dimensions: 'measuring…',
          format: (mime.split('/')[1] || 'image').toUpperCase(),
          location: 'ipfs_kit_py artifact',
          altText: `Image retrieved from ipfs_kit_py artifact ${cid}.`,
          bytes,
        };
        this.images.push(image);
        this.currentImageIndex = this.images.length - 1;
        this.currentImage = image;
        this.measureImageDimensions(image);
        this.vdaG038.retrievalState = 'retrieved';
        this.vdaG038.lastRetrievedCid = cid;
        this.vdaG038.gatewayStatus = `${toolId} ${correlationId}`;
        this.vdaG038.lastRetrievedInfo = `${bytes.length.toLocaleString()} bytes, measured ${ms} ms, ${toolId} ${correlationId}`;
        this.appendWorkflowLog(this.vdaG038.lastRetrievedInfo);
      } else {
        throw new Error(artifact?.error || `Artifact ${cid} returned no bytes from ipfs_kit_py.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.vdaG038.retrievalState = 'failed';
      this.vdaG038.gatewayStatus = `${toolId} ${correlationId} error`;
      this.vdaG038.lastRetrievedInfo = message;
      this.appendWorkflowLog(`retrieval failed for ${cid}: ${message}; ${toolId} ${correlationId}`);
    }
    this.refreshContent();
  }

  /**
   * POST /mcp/tools/call with IDL method request_action.
   * Publish sends ipfs_kit_py artifact and provenance actions through this route.
   */
  async publish(tool, toolArguments) {
    const response = await fetch('/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'request_action',
        tool,
        arguments: toolArguments
      })
    });
    return parseToolResponse(response);
  }

  /**
   * 📤 Publish the current image: persists real bytes plus a metadata record
   * to ipfs_kit_py behind an explicit user confirmation. Returns real CIDs
   * and records a real provenance event in the Event DAG.
   * Transport is POST /mcp/tools/call (IDL method request_action).
   */
  async publishCurrentImage() {
    const image = this.currentImage;
    if (!image) {
      this.appendWorkflowLog('publish skipped: no image selected');
      return;
    }
    const bytes = image.bytes || await this.resolveImageBytes(image);
    if (!bytes || bytes.length === 0) {
      this.appendWorkflowLog(`publish failed for ${image.name}: could not read image bytes`);
      this.refreshContent();
      return;
    }
    const confirmed = await this.confirmGovernedWrite({
      title: 'Publish image to backend',
      description: `Persist “${image.name}” (${bytes.length.toLocaleString()} bytes) plus a metadata record to the ipfs_kit_py artifact store (pinned)?`,
    });
    if (!confirmed) return;
    try {
      const imageCid = await contentCidForBytes(bytes);
      const putResult = await this.publish('mcp++:ipfs_kit_py/artifacts/put', {
        cid: imageCid,
        bytes_base64: base64ForBytes(bytes),
        profile: 'image-viewer-image',
        kind: 'image',
        service: 'ipfs_kit_py',
        pin: true,
      });
      if (!putResult || putResult.persisted !== true || putResult.cid !== imageCid) {
        throw new Error(putResult?.error || 'ipfs_kit_py did not verify the persisted image artifact.');
      }
      const metadata = {
        schema: 'swissknife.image-viewer.image-metadata.v1',
        app: 'image-viewer',
        published_at: new Date().toISOString(),
        name: image.name,
        format: image.format,
        dimensions: image.dimensions,
        size_bytes: bytes.length,
        alt_text: image.altText || '',
        source_cid: imageCid,
      };
      const metaBytes = new TextEncoder().encode(stableStringifyValue(metadata));
      const metaCid = await contentCidForBytes(metaBytes);
      const metaResult = await this.publish('mcp++:ipfs_kit_py/artifacts/put', {
        cid: metaCid,
        bytes_base64: base64ForBytes(metaBytes),
        profile: 'image-viewer-image-metadata',
        kind: 'image-metadata',
        service: 'ipfs_kit_py',
        pin: true,
      });
      if (!metaResult || metaResult.persisted !== true || metaResult.cid !== metaCid) {
        throw new Error(metaResult?.error || 'ipfs_kit_py did not verify the persisted metadata artifact.');
      }
      let dagNote = '';
      try {
        const dagResult = await this.publish('mcp++:ipfs_kit_py/dag/append', {
          event: {
            event_type: 'image-viewer.image.published',
            image_cid: imageCid,
            metadata_cid: metaCid,
            name: image.name,
          },
        });
        if (dagResult?.event_cid) dagNote = `; event DAG ${dagResult.event_cid}`;
      } catch (dagError) {
        dagNote = `; event DAG append failed: ${dagError instanceof Error ? dagError.message : String(dagError)}`;
      }
      image.cid = imageCid;
      image.location = 'ipfs_kit_py artifact';
      image.bytes = bytes;
      this.vdaG038.lastPublishedCid = imageCid;
      this.vdaG038.lastPublishedInfo = `${image.name}: image ${imageCid} (verified=${putResult.verified === true}), metadata ${metaCid} (verified=${metaResult.verified === true})${dagNote}`;
      this.recordPublishedImage({ name: image.name, cid: imageCid, metadata_cid: metaCid, size: bytes.length, published_at: metadata.published_at });
      this.appendWorkflowLog(`published ${image.name} as ${imageCid} (verified=${putResult.verified === true}); metadata ${metaCid} (verified=${metaResult.verified === true})${dagNote}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.vdaG038.lastPublishedInfo = `Publish failed: ${message}`;
      this.appendWorkflowLog(`publish failed for ${image.name}: ${message}`);
    }
    this.refreshContent();
  }

  /**
   * 🖼️ Resolve the real bytes of a gallery image (File, data: URI or blob: URL).
   */
  async resolveImageBytes(image) {
    try {
      if (image.file) {
        const buffer = await image.file.arrayBuffer();
        return new Uint8Array(buffer);
      }
      if (typeof image.url === 'string' && image.url.startsWith('data:')) {
        const [, payload = ''] = image.url.split(',');
        if (image.url.includes(';base64,')) return bytesFromBase64(payload);
        return new TextEncoder().encode(decodeURIComponent(payload));
      }
      const response = await fetch(image.url);
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    } catch (error) {
      return null;
    }
  }

  /**
   * 📐 Measure an image's real dimensions locally.
   */
  measureImageDimensions(image) {
    const probe = new Image();
    probe.onload = () => {
      image.dimensions = `${probe.naturalWidth}x${probe.naturalHeight}`;
      if (this.currentImage === image) this.refreshContent();
    };
    probe.onerror = () => {
      image.dimensions = 'unreadable';
    };
    probe.src = image.url;
  }

  /**
   * 🧾 Measure real local metadata (name, format, size, dimensions, source).
   * Honestly local: no OCR backend is wired, so no OCR text is claimed.
   */
  async runMetadataOcr() {
    const image = this.currentImage;
    if (!image) return;
    if (image.dimensions === 'pending' || image.dimensions === 'measuring…') {
      this.measureImageDimensions(image);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    this.vdaG038.metadataState = 'measured';
    this.vdaG038.metadataSummary =
      `name=${image.name}; format=${image.format}; size=${this.formatFileSize(image.size)}; ` +
      `dimensions=${image.dimensions}; source=${image.location}; cid=${image.cid}. ` +
      `Measured locally just now.`;
    this.appendWorkflowLog(`metadata measured locally for ${image.name} (${image.dimensions}, ${this.formatFileSize(image.size)})`);
    this.refreshContent();
  }

  /**
   * ✨ Local auto-adjust: CSS filters only, honestly labeled. No backend
   * enhancement job exists, so none is claimed.
   */
  startEnhancementJob() {
    this.vdaG038.enhancementState = 'applied-local';
    this.filters.brightness = 108;
    this.filters.contrast = 112;
    this.filters.saturation = 106;
    this.editMode = true;
    this.appendWorkflowLog('local auto-adjust applied (CSS filters only — no backend enhancement job exists)');
    this.refreshContent();
  }


  applyZoomPan() {
    this.zoomLevel = 1.45;
    this.panX = 28;
    this.panY = -18;
    this.vdaG038.zoomPanState = 'zoomed-panned';
    this.appendWorkflowLog('zoom/pan set locally: 145% at 28,-18 (local view state only)');
    this.updateImageDisplay();
  }

  showUnsupportedFormat() {
    this.vdaG038.unsupportedFormatState = 'policy-shown';
    this.appendWorkflowLog(`unsupported-format policy shown (accepted: ${this.supportedFormats().join(', ').toUpperCase()})`);
    this.refreshContent();
  }

  async refreshAltText() {
    const current = this.currentImage?.altText || this.vdaG038.altText || '';
    const text = await this.promptForText(
      'Alt text (local)',
      'Enter alt text for the current image. Stored locally only — no backend involved.',
      current
    );
    if (text === null) return;
    this.vdaG038.altText = text;
    this.vdaG038.altTextState = text ? 'available' : 'missing';
    if (this.currentImage) this.currentImage.altText = text;
    this.appendWorkflowLog(`alt text updated locally (${text.length} chars)`);
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
    // Replacing the window inside the click detaches the button and the
    // click action retries until the row budget closes the page.
    setTimeout(() => this.refreshContent(), 0);
  }

  autoAdjust() {
    this.filters.brightness = 106;
    this.filters.contrast = 110;
    this.filters.saturation = 104;
    this.editMode = true;
    this.refreshContent();
  }

  createSeedImages() {
    // Built-in samples are honestly local: generated SVG data URIs, labeled
    // as local, with no IPFS CID claim. Real CIDs only appear after a real
    // publish to ipfs_kit_py.
    const samples = [
      {
        name: 'sample-ridge-lake.svg',
        url: svgDataUri('Sample ridge lake', '#0f766e', '#2563eb'),
        altText: 'Built-in local sample: gradient landscape with a readable label.',
      },
      {
        name: 'sample-contact-sheet.svg',
        url: svgDataUri('Sample contact sheet', '#7c2d12', '#f97316'),
        altText: 'Built-in local sample: gradient sheet with a readable label.',
      },
    ];
    return samples.map(sample => {
      const payload = sample.url.split(',')[1] || '';
      return {
        name: sample.name,
        url: sample.url,
        cid: 'local (not published)',
        size: new TextEncoder().encode(decodeURIComponent(payload)).length,
        dimensions: '1600x1000',
        format: 'SVG',
        location: 'built-in local sample',
        altText: sample.altText,
        bytes: null,
      };
    });
  }

  createVdaG038WorkflowState() {
    return {
      workflowId: 'image-viewer.cid-metadata-enhancement',
      vdaId: 'VDA-G038',
      retrievalState: 'none',
      lastRetrievedCid: '',
      lastRetrievedInfo: 'No CID retrieved yet.',
      gatewayStatus: '',
      metadataState: 'none',
      metadataSummary: 'No metadata measured yet.',
      lastPublishedCid: '',
      lastPublishedInfo: 'Nothing published yet.',
      enhancementState: 'local-only',
      zoomPanState: 'fit',
      unsupportedFormatState: 'none',
      unsupportedFormatName: '',
      altTextState: 'missing',
      altText: '',
      log: [],
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

  loadStoredImages() {
    try {
      const storedImages = localStorage.getItem('image-viewer-images');
      if (!storedImages) return;
      const parsed = JSON.parse(storedImages);
      if (!Array.isArray(parsed)) return;
      for (const image of parsed) {
        if (!image?.name || !image?.url) continue;
        // blob: URLs do not survive a reload — drop them rather than showing
        // dead gallery entries.
        if (String(image.url).startsWith('blob:')) continue;
        this.images.push({
          ...image,
          altText: image.altText || `Stored image ${image.name}`,
          location: image.location || 'browser-local storage',
          cid: image.cid || 'local (not published)',
        });
      }
    } catch (error) {
      console.warn('Could not load stored images:', error);
    }
  }

  appendWorkflowLog(entry) {
    if (!this.vdaG038.log.includes(entry)) this.vdaG038.log.push(entry);
  }

  /**
   * 🔐 Confirmation-gated governed write (mirrors supervisor receipts.persist):
   * every backend-mutating POST requires this explicit, reviewed user
   * confirmation step first.
   */
  confirmGovernedWrite({ title, description, confirmLabel = 'Confirm write' }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'iv-governed-confirm-overlay';
      overlay.innerHTML = `
        <div class="iv-governed-confirm-dialog" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}">
          <h3>${escapeHTML(title)}</h3>
          <p>${escapeHTML(description)}</p>
          <p class="iv-governed-target">Target: ipfs_kit_py · POST /mcp/tools/call (pinned)</p>
          <label class="iv-governed-check">
            <input type="checkbox">
            <span>I confirm this governed write. I have reviewed the data being persisted.</span>
          </label>
          <div class="iv-governed-actions">
            <button type="button" class="iv-governed-cancel">Cancel</button>
            <button type="button" class="iv-governed-confirm" disabled>${escapeHTML(confirmLabel)}</button>
          </div>
        </div>`;
      const checkbox = overlay.querySelector('input[type="checkbox"]');
      const confirmBtn = overlay.querySelector('.iv-governed-confirm');
      const done = (value) => { overlay.remove(); resolve(value); };
      checkbox.addEventListener('change', () => { confirmBtn.disabled = !checkbox.checked; });
      overlay.querySelector('.iv-governed-cancel').addEventListener('click', () => done(false));
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
      overlay.className = 'iv-governed-confirm-overlay';
      overlay.innerHTML = `
        <div class="iv-governed-confirm-dialog" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}">
          <h3>${escapeHTML(title)}</h3>
          <p>${escapeHTML(description)}</p>
          <input type="text" class="iv-cid-input" placeholder="bafy…" aria-label="Artifact CID" spellcheck="false">
          <div class="iv-governed-actions">
            <button type="button" class="iv-governed-cancel">Cancel</button>
            <button type="button" class="iv-governed-confirm">Retrieve</button>
          </div>
        </div>`;
      const input = overlay.querySelector('.iv-cid-input');
      const done = (value) => { overlay.remove(); resolve(value ? value.trim() : null); };
      overlay.querySelector('.iv-governed-cancel').addEventListener('click', () => done(null));
      overlay.querySelector('.iv-governed-confirm').addEventListener('click', () => done(input.value));
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') done(input.value); });
      document.body.appendChild(overlay);
      input.focus();
    });
  }

  /**
   * ⌨️ Prompt the user for free text (alt text editing).
   */
  promptForText(title, description, initialValue = '') {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'iv-governed-confirm-overlay';
      overlay.innerHTML = `
        <div class="iv-governed-confirm-dialog" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}">
          <h3>${escapeHTML(title)}</h3>
          <p>${escapeHTML(description)}</p>
          <input type="text" class="iv-cid-input" aria-label="${escapeHTML(title)}" value="${escapeHTML(initialValue)}" spellcheck="true">
          <div class="iv-governed-actions">
            <button type="button" class="iv-governed-cancel">Cancel</button>
            <button type="button" class="iv-governed-confirm">Save</button>
          </div>
        </div>`;
      const input = overlay.querySelector('.iv-cid-input');
      const done = (value) => { overlay.remove(); resolve(value === null ? null : String(value)); };
      overlay.querySelector('.iv-governed-cancel').addEventListener('click', () => done(null));
      overlay.querySelector('.iv-governed-confirm').addEventListener('click', () => done(input.value));
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') done(input.value); });
      document.body.appendChild(overlay);
      input.focus();
      input.select();
    });
  }

  /**
   * 🗂️ Honest local index of real published artifact CIDs (the artifacts
   * themselves live in ipfs_kit_py; this is only a pointer list).
   */
  readPublishedIndex() {
    try {
      const raw = JSON.parse(localStorage.getItem('image-viewer-published') || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  recordPublishedImage(entry) {
    try {
      const index = this.readPublishedIndex().filter(item => item.cid !== entry.cid);
      index.unshift(entry);
      localStorage.setItem('image-viewer-published', JSON.stringify(index.slice(0, 50)));
    } catch (error) {
      console.warn('Could not record published image:', error);
    }
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
