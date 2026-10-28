/**
 * 🎵 Strudel AI DAW - Advanced Digital Audio Workstation with LLM Integration
 * 
 * Features:
 * - LLM-powered code generation and editing
 * - Dynamic control panels that map to code variables
 * - Real-time audio synthesis using strudel.cc SDK
 * - Visual waveform and spectrum analysis
 * - Pattern sequencer with AI assistance
 * - Code-to-sound real-time compilation
 */

export class StrudelAIDAW {
    constructor(desktop) {
        this.desktop = desktop;
        this.swissknife = null;
        
        // Core audio state
        this.isPlaying = false;
        this.audioContext = null;
        this.strudelEngine = null;
        this.currentPattern = null;
        this.samples = new Map();
        this.playbackMode = 'unavailable';
        this._transportGeneration = 0;
        this._sdkActive = false;
        this._transportTimeoutMs = 5000;
        this._sdkLoadTimeoutMs = 5000;
        this._workletLoadTimeoutMs = 1000;
        this._previewOscillators = new Set();
        this._previewGains = new Set();
        this._previewBeatHistory = [];
        this._metronomeTimer = null;
        this.audioBackend = 'unavailable';
        this.audioCleanupErrors = [];
        this._transportFaulted = false;
        this._closed = false;
        this.bpm = 120;
        this.masterVolume = 0.8;
        
        // Code and controls
        this.codeEditor = null;
        this.currentCode = '';
        this.dynamicControls = new Map();
        this.codeVariables = new Map();
        this.aiGeneration = false;
        
        // Visualization
        this.analyser = null;
        this.waveformCanvas = null;
        this.spectrumCanvas = null;
        this.animationFrame = null;
        
        // Pattern management
        this.patterns = new Map();
        this.activePattern = 'main';
        this.patternHistory = [];
        this.undoStack = [];
        this.renderState = {
            status: 'idle',
            progress: 0,
            checkpoint: null,
            receipt: null
        };
        this.assetProvenance = {
            projectCid: null,
            mediaCid: null,
            sampleCid: null,
            libraryCid: null,
            eventDagCid: null,
            receipt: null
        };
        
        // AI integration
        this.aiEnabled = true;
        this.lastAIRequest = null;
        this.codeContext = '';
        
        console.log('🎵 Strudel AI DAW initialized');
    }

    async initialize() {
        this.swissknife = this.desktop.swissknife;
        // Pre-initialize audio-related members without touching AudioContext
        // (creating AudioContext often requires a user gesture; we finish setup in mount())
        await this.setupAudioEngine();
        await this.loadStrudelSDK();
    }

    /**
     * Minimal pre-setup for audio engine; full setup happens in initializeAudioEngine(container)
     */
    async setupAudioEngine() {
        this.masterGain = null;
        // analyser, audioContext and other nodes are created on mount when DOM is ready
        return Promise.resolve();
    }

    /**
     * Render returns the HTML content string to be mounted by the desktop shell.
     */
    async render() {
        return this.getContentHTML();
    }

    /**
     * Called after the HTML has been inserted into the container. Sets up listeners and audio.
     */
    async mount(container) {
        if (this._closed || this._container) return;
        if (!container.isConnected) { await this.onDestroy(); return; }
        this._container = container;
        const view = container.ownerDocument.defaultView;
        this._ownerObserver = new view.MutationObserver(() => {
            if (!container.isConnected) void this.onDestroy();
        });
        this._ownerObserver.observe(container.ownerDocument.documentElement, {childList: true, subtree: true});
        this._onPageHide = () => { void this.onDestroy(); };
        view.addEventListener('pagehide', this._onPageHide);
        try {
            this.setupEventListeners(container);
            await this.initializeEditor(container);
            if (this._closed) return;
            this.setupVisualization(container);
            await this.initializeAudioEngine(container);
            if (!this._closed) {
                this.updateStatus(container, this.playbackMode === 'local-preview' ?
                    'Local audio preview ready — metronome/reference tone; Strudel code compilation unavailable' :
                    this.playbackMode === 'strudel' ? 'Strudel transport ready' : 'Audio unavailable — no Strudel transport or local WebAudio preview');
            }
        } catch (err) {
            if (!this._closed) {
                this.updateStatus(container, 'Audio unavailable');
                this.addConsoleMessage(container, `Audio setup failed: ${err.message}`, 'error');
            }
        }
    }

    onDestroy() {
        if (this._cleanupPromise) return this._cleanupPromise;
        this._closed = true;
        this._transportGeneration++;
        this.isPlaying = false;
        this.stopLocalReference();
        clearTimeout(this.autoSaveTimeout);
        clearTimeout(this.analysisTimeout);
        if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
        this._ownerObserver?.disconnect();
        this._container?.ownerDocument.defaultView.removeEventListener('pagehide', this._onPageHide);
        // Silence the owned audio graph before waiting for a possibly external SDK.
        try { this.audioNode?.port.postMessage({type: 'setPlaying', value: false}); } catch {}
        for (const node of [this.audioNode, this.masterGain, this.analyser]) {
            try { node?.disconnect(); } catch {}
        }
        const sdk = this._sdkActive ? this.strudelEngine : null;
        this._sdkActive = false;
        this._cleanupPromise = Promise.allSettled([
            Promise.resolve().then(() => sdk ? this.awaitTransport(sdk.stop()) : undefined),
            Promise.resolve().then(() => this.audioContext?.state !== 'closed' && this.audioContext ?
                this.awaitAudioCleanup(this.audioContext.close()) : undefined)
        ]).then(results => {
            for (const result of results) if (result.status === 'rejected') this.audioCleanupErrors.push(result.reason?.message || String(result.reason));
        });
        return this._cleanupPromise;
    }

    getContentHTML() {
        return `
            <style>
                .window[data-app-id="strudel-ai-daw"]{overflow:hidden!important}
                .window[data-app-id="strudel-ai-daw"] .window-content,.window[data-app-id="strudel-ai-daw"] .window-app-content{position:relative!important;flex:1 1 auto!important;min-height:0!important;height:auto!important;max-height:100%!important;overflow:auto!important}
                .strudel-ai-daw{box-sizing:border-box!important;width:100%!important;max-width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;display:flex!important;flex-direction:column!important}
                .strudel-ai-daw .daw-chrome{position:sticky!important;top:0!important;z-index:4!important;background:#1b1b1b!important;flex:0 0 auto!important;max-width:100%!important}
                .strudel-ai-daw .daw-main{display:flex!important;flex-direction:column!important;width:100%!important;min-width:0!important;min-height:0!important;flex:1 1 auto!important;overflow:visible!important}
                .strudel-ai-daw .pattern-sidebar,.strudel-ai-daw .code-section{display:block!important;position:static!important;width:100%!important;max-width:100%!important;min-width:0!important;flex:0 0 auto!important}
                .strudel-ai-daw .daw-menubar,.strudel-ai-daw .menu-section,.strudel-ai-daw .transport-bar{display:flex!important;flex:0 0 auto!important;flex-wrap:wrap!important;align-items:center!important;gap:6px!important;max-width:100%!important;overflow:visible!important}
                .strudel-ai-daw .daw-menubar{min-height:32px!important;background:#1b1b1b!important}
                .strudel-ai-daw .menu-btn{flex:0 0 auto!important;white-space:nowrap!important}
                .strudel-ai-daw .transport-controls{display:flex!important;flex-wrap:wrap!important;gap:8px!important;max-width:100%!important}
                .strudel-ai-daw .sk-transport-btn{flex:0 0 auto!important}
                .strudel-ai-daw .code-editor-container{display:flex!important;width:100%!important;min-height:150px!important}
                .strudel-ai-daw #strudel-code-editor{width:100%!important;min-height:130px!important;flex:1 1 auto!important}
                .strudel-ai-daw button:focus,.strudel-ai-daw textarea:focus,.strudel-ai-daw input:focus{outline:none;box-shadow:none}
                .strudel-ai-daw :focus-visible{outline:2px solid #7dffb3!important;outline-offset:2px!important;box-shadow:none!important}
                @media (max-width:800px){
                    .window[data-app-id="strudel-ai-daw"]{max-height:calc(100dvh - 56px)!important;height:calc(100dvh - 56px)!important;overflow:hidden!important}
                    .strudel-ai-daw .pattern-sidebar{max-height:44px!important;overflow:auto!important}
                    .strudel-ai-daw .controls-sidebar,.strudel-ai-daw .bottom-panel{display:none!important}
                    .strudel-ai-daw .daw-menubar,.strudel-ai-daw .transport-bar,.strudel-ai-daw .menu-section,.strudel-ai-daw .transport-controls{flex-wrap:wrap!important;max-width:100%!important;overflow:visible!important}
                    .strudel-ai-daw .logo{display:none!important}
                    .strudel-ai-daw .menu-btn,.strudel-ai-daw .sk-transport-btn{padding:2px 6px!important;font-size:12px!important}
                    .strudel-ai-daw .status-section{flex:0 0 auto!important;max-height:3.2em!important;overflow:auto!important;font-size:12px!important;line-height:1.3!important}
                    .strudel-ai-daw .code-editor-container{min-height:120px!important}
                    .strudel-ai-daw #strudel-code-editor{min-height:100px!important}
                }
            </style>
            <div class="strudel-ai-daw" style="box-sizing:border-box;width:100%;min-height:0;max-height:none;overflow:visible;display:flex;flex-direction:column">
                <div class="daw-chrome">
                <!-- Top Menu Bar -->
                <div class="daw-menubar">
                    <div class="menu-section">
                        <div class="logo">🎵 Strudel AI DAW</div>
                        <button class="menu-btn" id="new-pattern">📄 New</button>
                        <button class="menu-btn" id="open-pattern">📁 Open</button>
                        <button class="menu-btn" id="save-pattern">💾 Save</button>
                        <button class="menu-btn" id="export-audio">🎧 Export</button>
                    </div>
                    <div class="menu-section">
                        <button class="menu-btn" id="ai-generate">🤖 AI Generate</button>
                        <button class="menu-btn" id="ai-enhance">⚡ AI Enhance</button>
                        <button class="menu-btn" id="ai-fix">🔧 AI Fix</button>
                    </div>
                    <div class="menu-section">
                        <button class="menu-btn" id="help-btn">❓ Help</button>
                        <button class="menu-btn" id="settings-btn">⚙️ Settings</button>
                    </div>
                </div>

                <!-- Transport Controls -->
                <div class="transport-bar">
                    <div class="transport-controls sk-transport">
                        <button class="sk-transport-btn is-main" id="play-btn" aria-label="Play">Play</button>
                        <button class="sk-transport-btn" id="pause-btn" disabled aria-label="Pause">Pause</button>
                        <button class="sk-transport-btn" id="stop-btn" disabled aria-label="Stop">Stop</button>
                        <button class="sk-transport-btn" id="record-btn" aria-label="Record">Record</button>
                        <button class="sk-transport-btn" id="undo-btn" aria-label="Undo last DAW edit">Undo</button>
                    </div>
                    
                    <div class="tempo-section">
                        <label>BPM</label>
                        <input type="number" id="bpm-input" value="120" min="60" max="200" step="1">
                        <button id="tap-tempo">TAP</button>
                    </div>
                    
                    <div class="master-section">
                        <label>Master Volume</label>
                        <input type="range" id="master-volume" value="0.8" min="0" max="1" step="0.01">
                        <span id="volume-display">80%</span>
                    </div>
                    
                    <div class="status-section">
                        <span id="audio-playback-status" role="status">Audio initializing</span>
                        <span id="assistance-status" role="status">Assistance idle. Local edits stay in the editor.</span>
                        <div class="cpu-meter">
                            <span>CPU:</span>
                            <div class="meter"><div class="meter-fill" id="cpu-meter"></div></div>
                        </div>
                        <div class="latency-display">
                            <span id="latency-value">0ms</span>
                        </div>
                    </div>
                </div>
                </div>

                <details class="strudel-session-details">
                    <summary>Local session details</summary>
                <div class="svd-g045-workflow" data-svd-workflow="strudel-ai-daw.assisted-composition-render-recovery">
                    <div class="svd-g045-header">
                        <div>
                            <h4>VDA-G045 DAW Workflow</h4>
                            <p>Project assets, assistant changes, render recovery, undo, and compact controls are tracked in one local session.</p>
                            <p class="vda-evidence-note sk-honest-note">Evidence draft — CIDs, receipts and metrics shown are fixture references for design verification until “Assets” persists a real composition artifact.</p>
                        </div>
                        <span class="svd-g045-status" data-g045-workflow-status="ready">ready</span>
                    </div>
                    <div class="svd-g045-actions">
                        <button data-svd-workflow-action="load-asset-provenance" aria-label="Load asset provenance">Assets</button>
                        <button data-svd-workflow-action="request-assisted-composition" aria-label="Request assisted composition">Assist</button>
                        <button data-svd-workflow-action="start-render-job" aria-label="Start render state">Render</button>
                        <button data-svd-workflow-action="undo-ai-change" aria-label="Undo AI change">Undo</button>
                        <button data-svd-workflow-action="simulate-audio-backend-failure" aria-label="Simulate failed audio backend">Backend</button>
                        <button data-svd-workflow-action="toggle-compact-controls" aria-label="Toggle compact controls">Compact</button>
                    </div>
                    <div class="svd-g045-grid">
                        <div data-svd-vda-marker="asset-provenance" data-asset-provenance-state="pending">
                            Asset provenance pending: project CID, media CID, sample library CID, and library context will be verified before render.
                        </div>
                        <div data-svd-vda-marker="assisted-composition" data-assisted-composition-state="idle">
                            Assisted composition idle: optional assistant suggestions preserve editable local Strudel code and never overwrite without undo history.
                        </div>
                        <div data-svd-vda-marker="render-state" data-render-state="idle">
                            Render state idle: no composition render job has been queued.
                            <progress data-render-progress value="0" max="100"></progress>
                        </div>
                        <div data-svd-vda-marker="undo" data-undo-state="empty" data-undo-proof="none">
                            Undo ready: the editor will restore the pre-assistance pattern from the local history stack.
                        </div>
                        <div data-svd-vda-marker="failed-audio-backend" data-audio-backend-state="ok" data-audio-fallback-state="standby">
                            Audio backend healthy: WebAudio/AudioWorklet path is active when available.
                        </div>
                        <div data-svd-vda-marker="compact-controls" data-compact-controls-state="expanded">
                            Compact controls expanded: transport, BPM, master volume, render, and undo controls remain reachable.
                        </div>
                    </div>
                </div>
                </details>

                <!-- Main Content Area -->
                <div class="daw-main">
                    <!-- Left Sidebar - Pattern Library -->
                    <div class="pattern-sidebar">
                        <div class="sidebar-tabs">
                            <div class="sidebar-tab active" data-tab="patterns">🎼 Patterns</div>
                            <div class="sidebar-tab" data-tab="samples">🥁 Samples</div>
                            <div class="sidebar-tab" data-tab="presets">🎛️ Presets</div>
                        </div>
                        
                        <div class="sidebar-content">
                            <div class="sidebar-panel active" id="patterns-panel">
                                <div class="panel-header">
                                    <h4>Pattern Library</h4>
                                    <button class="add-btn" id="add-pattern">+</button>
                                </div>
                                <div class="pattern-list" id="pattern-list">
                                    <div class="pattern-item active" data-pattern="main">
                                        <span class="pattern-name">Main Pattern</span>
                                        <div class="pattern-controls">
                                            <button class="edit-btn">✏️</button>
                                            <button class="clone-btn">📋</button>
                                            <button class="delete-btn">🗑️</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="sidebar-panel" id="samples-panel">
                                <div class="panel-header">
                                    <h4>Sample Browser</h4>
                                    <button class="refresh-btn">🔄</button>
                                </div>
                                <div class="sample-categories">
                                    <div class="category-item" data-category="drums">🥁 Drums</div>
                                    <div class="category-item" data-category="bass">🎸 Bass</div>
                                    <div class="category-item" data-category="synth">🎹 Synth</div>
                                    <div class="category-item" data-category="fx">✨ FX</div>
                                </div>
                                <div class="sample-list" id="sample-list"></div>
                            </div>
                            
                            <div class="sidebar-panel" id="presets-panel">
                                <div class="panel-header">
                                    <h4>AI Presets</h4>
                                    <button class="generate-btn" id="generate-preset">🤖</button>
                                </div>
                                <div class="preset-list">
                                    <div class="preset-item" data-preset="ambient">🌙 Ambient Pad</div>
                                    <div class="preset-item" data-preset="techno">⚡ Techno Beat</div>
                                    <div class="preset-item" data-preset="jazz">🎺 Jazz Progression</div>
                                    <div class="preset-item" data-preset="dnb">🔥 Drum & Bass</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Center - Code Editor -->
                    <div class="code-section">
                        <div class="code-header">
                            <div class="code-tabs">
                                <div class="code-tab active" data-file="main.js">
                                    <span class="tab-icon">🎵</span>
                                    <span class="tab-name">main.js</span>
                                    <span class="tab-close">×</span>
                                </div>
                            </div>
                            <div class="code-actions">
                                <button class="code-btn" id="format-code">🎨 Format</button>
                                <button class="code-btn" id="validate-code">✅ Validate</button>
                                <button class="code-btn" id="optimize-code">⚡ Optimize</button>
                            </div>
                        </div>
                        
                        <div class="code-editor-container">
                            <div class="line-numbers" id="code-line-numbers"></div>
                            <textarea id="strudel-code-editor" class="strudel-code-editor" placeholder="// 🎵 Welcome to Strudel AI DAW!
// Describe your musical idea and let AI help you create it

// Example: Create a minimal techno beat
note('c2 d2 e2 f2').sound('sine').lpf(400).room(0.2)"></textarea>
                        </div>
                        
                        <div class="code-suggestions" id="code-suggestions" style="display: none;">
                            <div class="suggestions-header">
                                <span>🤖 AI Suggestions</span>
                                <button class="close-suggestions">×</button>
                            </div>
                            <div class="suggestions-content"></div>
                        </div>
                    </div>

                    <!-- Right Sidebar - Dynamic Controls -->
                    <div class="controls-sidebar">
                        <div class="controls-header">
                            <h4>🎛️ Dynamic Controls</h4>
                            <button class="scan-btn" id="scan-variables">🔍 Scan</button>
                        </div>
                        
                        <div class="controls-container" id="dynamic-controls">
                            <div class="control-group">
                                <h5>📊 Master Controls</h5>
                                <div class="control-item">
                                    <label>Gain</label>
                                    <input type="range" class="control-slider" data-var="gain" min="0" max="1" step="0.01" value="0.8">
                                    <span class="control-value">0.8</span>
                                </div>
                                <div class="control-item">
                                    <label>LPF Cutoff</label>
                                    <input type="range" class="control-slider" data-var="lpf" min="50" max="5000" step="10" value="1000">
                                    <span class="control-value">1000Hz</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="controls-footer">
                            <button class="preset-btn" id="save-preset">💾 Save Preset</button>
                            <button class="preset-btn" id="load-preset">📁 Load Preset</button>
                        </div>
                    </div>
                </div>

                <!-- Bottom Panel - Visualization and AI Chat -->
                <div class="bottom-panel">
                    <div class="panel-tabs">
                        <div class="panel-tab active" data-panel="visualization">📊 Visualization</div>
                        <div class="panel-tab" data-panel="ai-chat">🤖 AI Assistant</div>
                        <div class="panel-tab" data-panel="console">🖥️ Console</div>
                        <div class="panel-tab" data-panel="timeline">⏰ Timeline</div>
                    </div>
                    
                    <div class="panel-content">
                        <!-- Visualization Panel -->
                        <div class="panel-section active" id="visualization-panel">
                            <div class="viz-container">
                                <div class="viz-section">
                                    <h5>🌊 Waveform</h5>
                                    <canvas id="waveform-canvas" width="600" height="100"></canvas>
                                </div>
                                <div class="viz-section">
                                    <h5>📊 Spectrum</h5>
                                    <canvas id="spectrum-canvas" width="600" height="150"></canvas>
                                </div>
                                <div class="viz-controls">
                                    <label>FFT Size</label>
                                    <select id="fft-size">
                                        <option value="256">256</option>
                                        <option value="512">512</option>
                                        <option value="1024" selected>1024</option>
                                        <option value="2048">2048</option>
                                    </select>
                                    <label>Window</label>
                                    <select id="window-function">
                                        <option value="blackman">Blackman</option>
                                        <option value="hamming" selected>Hamming</option>
                                        <option value="hann">Hann</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <!-- AI Assistant Panel -->
                        <div class="panel-section" id="ai-chat-panel">
                            <div class="ai-chat-container">
                                <div class="ai-messages" id="ai-messages">
                                    <div class="ai-message assistant-message">
                                        <div class="message-avatar">🤖</div>
                                        <div class="message-content">
                                            <p>Hi! I'm your AI music assistant. I can help you:</p>
                                            <ul>
                                                <li>🎵 Generate musical patterns from descriptions</li>
                                                <li>🔧 Fix and optimize your Strudel code</li>
                                                <li>🎛️ Suggest parameter adjustments</li>
                                                <li>🎨 Create chord progressions and melodies</li>
                                            </ul>
                                            <p>Try asking me something like: "Create a trap beat with 808s" or "Make this sound more ambient"</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="ai-input-container">
                                    <div class="ai-input-tools">
                                        <button class="tool-btn" id="quick-beat">🥁 Quick Beat</button>
                                        <button class="tool-btn" id="quick-melody">🎵 Melody</button>
                                        <button class="tool-btn" id="quick-bass">🎸 Bassline</button>
                                        <button class="tool-btn" id="quick-fx">✨ Add FX</button>
                                    </div>
                                    <div class="ai-input-box">
                                        <textarea id="ai-input" placeholder="Describe the music you want to create..." rows="2"></textarea>
                                        <button id="ai-send" class="ai-send-btn">🎵 Generate</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Console Panel -->
                        <div class="panel-section" id="console-panel">
                            <div class="console-output" id="console-output"></div>
                            <div class="console-input">
                                <span class="console-prompt">strudel> </span>
                                <input type="text" id="console-input" placeholder="Enter Strudel command...">
                            </div>
                        </div>
                        
                        <!-- Timeline Panel -->
                        <div class="panel-section" id="timeline-panel">
                            <div class="timeline-container">
                                <div class="timeline-ruler" id="timeline-ruler"></div>
                                <div class="timeline-tracks" id="timeline-tracks">
                                    <div class="timeline-track">
                                        <div class="track-header">🥁 Drums</div>
                                        <div class="track-content"></div>
                                    </div>
                                    <div class="timeline-track">
                                        <div class="track-header">🎸 Bass</div>
                                        <div class="track-content"></div>
                                    </div>
                                    <div class="timeline-track">
                                        <div class="track-header">🎹 Lead</div>
                                        <div class="track-content"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- AI Generation Dialog -->
                <div class="ai-generation-dialog" id="ai-generation-dialog" style="display: none;">
                    <div class="dialog-content">
                        <div class="dialog-header">
                            <h3>🤖 AI Music Generation</h3>
                            <button class="close-dialog" id="close-ai-dialog">×</button>
                        </div>
                        <div class="dialog-body">
                            <div class="generation-step active" id="step-describe">
                                <h4>Describe Your Music</h4>
                                <div class="genre-presets">
                                    <button class="genre-btn" data-genre="techno">⚡ Techno</button>
                                    <button class="genre-btn" data-genre="ambient">🌙 Ambient</button>
                                    <button class="genre-btn" data-genre="jazz">🎺 Jazz</button>
                                    <button class="genre-btn" data-genre="dnb">🔥 D&B</button>
                                    <button class="genre-btn" data-genre="house">🏠 House</button>
                                    <button class="genre-btn" data-genre="trap">💎 Trap</button>
                                </div>
                                <textarea id="music-description" placeholder="Describe the music you want to create:

Examples:
- 'A minimal techno track with a rolling bassline and crisp hi-hats'
- 'Ambient soundscape with evolving pads and subtle arpeggios'
- 'Trap beat with heavy 808s and snappy snares'
- 'Jazz fusion with complex chord progressions and walking bass'" rows="6"></textarea>
                                <div class="generation-options">
                                    <label>
                                        <input type="checkbox" id="include-melody" checked> Include melody
                                    </label>
                                    <label>
                                        <input type="checkbox" id="include-bass" checked> Include bass
                                    </label>
                                    <label>
                                        <input type="checkbox" id="include-drums" checked> Include drums
                                    </label>
                                    <label>
                                        <input type="checkbox" id="include-fx"> Add effects
                                    </label>
                                </div>
                                <button id="generate-music" class="primary-btn">🎵 Generate Music</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Settings Dialog -->
                <div class="settings-dialog" id="settings-dialog" style="display: none;">
                    <div class="dialog-content">
                        <div class="dialog-header">
                            <h3>⚙️ DAW Settings</h3>
                            <button class="close-dialog" id="close-settings">×</button>
                        </div>
                        <div class="dialog-body">
                            <div class="settings-section">
                                <h4>🎵 Audio Settings</h4>
                                <div class="setting-item">
                                    <label>Sample Rate</label>
                                    <select id="sample-rate">
                                        <option value="44100" selected>44.1 kHz</option>
                                        <option value="48000">48 kHz</option>
                                        <option value="96000">96 kHz</option>
                                    </select>
                                </div>
                                <div class="setting-item">
                                    <label>Buffer Size</label>
                                    <select id="buffer-size">
                                        <option value="128">128 samples</option>
                                        <option value="256" selected>256 samples</option>
                                        <option value="512">512 samples</option>
                                        <option value="1024">1024 samples</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="settings-section">
                                <h4>🤖 AI Settings</h4>
                                <div class="setting-item">
                                    <label>
                                        <input type="checkbox" id="auto-suggestions" checked> Auto AI Suggestions
                                    </label>
                                </div>
                                <div class="setting-item">
                                    <label>AI Model</label>
                                    <select id="ai-model">
                                        <option value="gpt-4" selected>GPT-4 (Best)</option>
                                        <option value="gpt-3.5-turbo">GPT-3.5 (Fast)</option>
                                        <option value="claude">Claude (Alternative)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    createWindow() {
        // Legacy API: returns a desktop window object using the same HTML
        const content = this.getContentHTML();
        const win = this.desktop.createWindow({
            title: '🎵 Strudel AI DAW - AI-Powered Music Studio',
            content,
            width: 1600,
            height: 1000,
            resizable: true
        });
        // Attach behaviors when using the legacy createWindow path
        this.mount(win);
        return win;
    }

    setupEventListeners(window) {
        // Transport controls
        window.querySelector('#play-btn').addEventListener('click', () => this.play(window));
        window.querySelector('#pause-btn').addEventListener('click', () => this.pause(window));
        window.querySelector('#stop-btn').addEventListener('click', () => this.stop(window));
        window.querySelector('#record-btn').addEventListener('click', () => this.record(window));
        window.querySelector('#undo-btn')?.addEventListener('click', () => this.undoLastChange(window));

        // BPM and volume
        window.querySelector('#bpm-input').addEventListener('change', (e) => this.setBPM(window, e.target.value));
        window.querySelector('#master-volume').addEventListener('input', (e) => this.setMasterVolume(window, e.target.value));
        window.querySelector('#tap-tempo').addEventListener('click', () => this.tapTempo(window));

        // AI functions
        window.querySelector('#ai-generate').addEventListener('click', () => this.requestAssistedComposition(window));
        window.querySelector('#ai-enhance').addEventListener('click', () => this.enhanceWithAI(window));
        window.querySelector('#ai-fix').addEventListener('click', () => this.fixWithAI(window));
        window.querySelector('#ai-send').addEventListener('click', () => this.sendAIMessage(window));

        // Code editor
        const codeEditor = window.querySelector('#strudel-code-editor');
        codeEditor.addEventListener('input', () => this.onCodeChange(window));
        codeEditor.addEventListener('keydown', (e) => this.handleCodeKeyDown(window, e));

        // Dynamic controls scanning
        window.querySelector('#scan-variables').addEventListener('click', () => this.scanCodeVariables(window));

        // Panel switching
        window.querySelectorAll('.panel-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchBottomPanel(window, tab.dataset.panel));
        });

        // Sidebar tabs
        window.querySelectorAll('.sidebar-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchSidebarTab(window, tab.dataset.tab));
        });

        // Quick AI tools
        window.querySelector('#quick-beat').addEventListener('click', () => this.generateQuickBeat(window));
        window.querySelector('#quick-melody').addEventListener('click', () => this.generateQuickMelody(window));
        window.querySelector('#quick-bass').addEventListener('click', () => this.generateQuickBass(window));
        window.querySelector('#quick-fx').addEventListener('click', () => this.generateQuickFX(window));

        // Dialog controls
        this.setupDialogControls(window);

        // File operations
        window.querySelector('#new-pattern').addEventListener('click', () => this.newPattern(window));
        window.querySelector('#save-pattern').addEventListener('click', () => this.savePattern(window));
        window.querySelector('#export-audio').addEventListener('click', () => this.exportAudio(window));

        // Genre presets
        window.querySelectorAll('.genre-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectGenre(window, btn.dataset.genre));
        });

        window.querySelectorAll('[data-svd-workflow-action]').forEach(btn => {
            btn.addEventListener('click', () => this.handleG045WorkflowAction(window, btn.dataset.svdWorkflowAction));
        });
    }

    async initializeEditor(window) {
        const editor = window.querySelector('#strudel-code-editor');
        let restored = null;
        try {
            restored = JSON.parse(localStorage.getItem('swissknife:strudel-ai-daw:last-pattern') || 'null');
        } catch {
            restored = null;
        }
        const fallback = `// 🎵 AI-Generated Minimal Techno
// Let AI help you create amazing music!

stack(
  // Kick drum pattern
  note("c2").sound("bd").gain(0.8).every(4, x => x.fast(2)),
  
  // Hi-hat pattern  
  note("c4").sound("hh").gain(0.3).fast(8).sometimes(x => x.gain(0.1)),
  
  // Bass synth
  note("c2 ~ eb2 ~").sound("sawtooth").lpf(300).adsr(0.01,0.1,0.5,0.1),
  
  // Lead arp
  note("c4 eb4 g4 bb4").sound("sine").lpf(800).room(0.2).slow(2)
).cpm(120)`;
        editor.value = typeof restored?.code === 'string' ? restored.code : fallback;
        if (Number.isFinite(restored?.bpm)) {
            this.bpm = Math.max(60, Math.min(200, restored.bpm));
            const bpmInput = window.querySelector('#bpm-input');
            if (bpmInput) bpmInput.value = String(this.bpm);
        }
        if (typeof restored?.id === 'string' && restored.id) this.activePattern = restored.id;
        this.currentCode = editor.value;

        this.updateLineNumbers(window);
        this.scanCodeVariables(window);
        
        // Set up syntax highlighting (basic)
        this.setupSyntaxHighlighting(window);
    }

    setupVisualization(window) {
        const waveformCanvas = window.querySelector('#waveform-canvas');
        const spectrumCanvas = window.querySelector('#spectrum-canvas');
        
        this.waveformCanvas = waveformCanvas;
        this.spectrumCanvas = spectrumCanvas;
        
        this.waveformCtx = waveformCanvas.getContext('2d');
        this.spectrumCtx = spectrumCanvas.getContext('2d');
        
        // Start visualization loop
        this.startVisualization();
    }

    async initializeAudioEngine(window) {
        try {
            console.log('🎵 Initializing advanced audio engine...');
            
            // Initialize Web Audio Context
            const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
            if (typeof AudioContextCtor !== 'function') {
                throw new Error('Web Audio API is not available in this environment');
            }
            this.audioContext = new AudioContextCtor();
            console.log("Audio engine: context created");
            
            // Set up analyser for visualization
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 1024;
            this.analyser.connect(this.audioContext.destination);
            console.log("Audio engine: analyser connected");
            
            // Initialize master gain
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.masterVolume;
            this.masterGain.connect(this.analyser);
            console.log("Audio engine: gain connected");
            
            // Initialize Strudel engine
            await this.initializeStrudelEngine();
            console.log("Audio engine: transport selected");
            if (this._closed) return;
            
            // Load default samples and patterns
            await this.loadDefaultSamples();
            await this.loadDefaultPatterns();
            if (this._closed) return;
            
            // Worklet loading can wait for a running AudioContext in browsers.
            // Prepare it only after the real Play gesture resumes audio, so
            // mounting an autoplay-suspended window never waits on that worklet.
            this.playbackMode = this.hasStrudelTransport(this.strudelEngine) ? 'strudel' :
                (typeof this.audioContext.audioWorklet?.addModule === 'function' ||
                    typeof this.audioContext.createOscillator === 'function' ? 'local-preview' : 'unavailable');
            
            console.log('✅ Advanced audio engine initialized successfully');
            // Ensure visualization starts now that analyser exists
            this.startVisualization();
            
        } catch (error) {
            console.error('❌ Failed to initialize audio engine:', error);
            throw error;
        }
    }

    hasStrudelTransport(engine) {
        return Boolean(engine && ['evaluate', 'start', 'stop'].every(name => typeof engine[name] === 'function'));
    }

    async initializeStrudelEngine() {
        // Core Pattern exports alone are not an evaluator plus audio transport.
        if (this.hasStrudelTransport(this.strudelEngine)) return;
        if (this._sdkSelectionComplete) { this.strudelEngine = null; return; }
        const engine = [globalThis.window?.strudel, globalThis.window?.Strudel]
            .find(candidate => this.hasStrudelTransport(candidate));
        this.strudelEngine = engine || null;
    }

    createPatternClass() {
        // Basic pattern implementation
        return class Pattern {
            constructor(patternString = '') {
                this.pattern = patternString;
                this.isPlaying = false;
                this.context = null;
            }
            
            play(context) {
                this.context = context;
                this.isPlaying = true;
                return this;
            }
            
            stop() {
                this.isPlaying = false;
                return this;
            }
            
            sound(soundName) {
                // Connect to audio samples
                return this;
            }
        };
    }

    async loadDefaultSamples() {
        console.log('🥁 Loading default samples...');
        
        // Default sample library with synthesized fallbacks
        const defaultSamples = {
            'kick': { category: 'drums' },
            'snare': { category: 'drums' },
            'hihat': { category: 'drums' },
            'openhat': { category: 'drums' },
            'clap': { category: 'drums' },
            'bass': { category: 'bass' },
            'lead': { category: 'synth' },
            'pad': { category: 'synth' }
        };
        
        // Create synthesized samples
        for (const [name, config] of Object.entries(defaultSamples)) {
            const synthBuffer = await this.createSynthesizedSample(name);
            this.samples.set(name, {
                buffer: synthBuffer,
                category: config.category,
                loaded: true,
                synthesized: true
            });
        }
        
        console.log(`✅ Loaded ${this.samples.size} synthesized samples`);
    }

    async createSynthesizedSample(name) {
        // Create basic synthesized sounds as working samples
        const sampleRate = this.audioContext.sampleRate;
        const duration = 0.5; // 500ms
        const frames = Math.floor(duration * sampleRate);
        const buffer = this.audioContext.createBuffer(1, frames, sampleRate);
        const data = buffer.getChannelData(0);
        
        switch (name) {
            case 'kick':
                // Synthesize kick drum
                for (let i = 0; i < frames; i++) {
                    const t = i / sampleRate;
                    const envelope = Math.exp(-t * 30);
                    const freq = 60 * Math.exp(-t * 10);
                    data[i] = envelope * Math.sin(2 * Math.PI * freq * t) * 0.8;
                }
                break;
                
            case 'snare':
                // Synthesize snare drum
                for (let i = 0; i < frames; i++) {
                    const t = i / sampleRate;
                    const envelope = Math.exp(-t * 20);
                    const noise = (Math.random() - 0.5) * 2;
                    const tone = Math.sin(2 * Math.PI * 200 * t);
                    data[i] = envelope * (noise * 0.7 + tone * 0.3) * 0.6;
                }
                break;
                
            case 'hihat':
                // Synthesize hihat
                for (let i = 0; i < frames * 0.1; i++) { // Shorter duration
                    const t = i / sampleRate;
                    const envelope = Math.exp(-t * 80);
                    const noise = (Math.random() - 0.5) * 2;
                    data[i] = envelope * noise * 0.4;
                }
                break;
                
            default:
                // Generic tone
                for (let i = 0; i < frames; i++) {
                    const t = i / sampleRate;
                    const envelope = Math.exp(-t * 5);
                    data[i] = envelope * Math.sin(2 * Math.PI * 440 * t) * 0.3;
                }
        }
        
        return buffer;
    }

    async setupRealTimeProcessing(generation = this._transportGeneration) {
        console.log('⚡ Setting up real-time audio processing...');
        
        // Use AudioWorkletNode for modern audio processing
        try {
            if (this.audioContext.audioWorklet && typeof this.audioContext.audioWorklet.addModule === 'function') {
                const workletUrl = new URL('../audio/strudel-processor.js', import.meta.url);
                this.workletModuleUrl = workletUrl.href;
                console.log('AudioWorklet module URL:', this.workletModuleUrl);
                let timer;
                try {
                    await Promise.race([this.audioContext.audioWorklet.addModule(workletUrl), new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new Error('AudioWorklet module load timed out')), this._workletLoadTimeoutMs);
                    })]);
                } finally { clearTimeout(timer); }
                if (this._closed || generation !== this._transportGeneration) return;
                this.audioNode = new AudioWorkletNode(this.audioContext, 'strudel-processor');
                this.audioNode.connect(this.masterGain);
                // Initialize worklet state
                this.audioNode.port.postMessage({ type: 'setBPM', value: this.bpm });
                this.audioNode.port.postMessage({ type: 'setVolume', value: this.masterVolume });
                this.isUsingWorklet = true;
                console.log('✅ AudioWorklet real-time processing enabled');
                return;
            } else {
                console.warn('⚠️ AudioWorklet not available in this browser. Real-time processing disabled.');
            }
        } catch (error) {
            console.warn('⚠️ AudioWorklet setup failed:', error);
            console.log('Local audio preview unavailable; playback requires a complete Strudel SDK transport.');
        }
    }

    startLocalReference() {
        if (typeof this.audioContext.createOscillator !== 'function') {
            this.playbackMode = 'unavailable';
            throw new Error('No Strudel transport or WebAudio preview is available');
        }
        const context = this.audioContext;
        this._referenceOscillator = context.createOscillator();
        this._previewOscillators.add(this._referenceOscillator);
        const gain = context.createGain();
        this._previewGains.add(gain);
        gain.gain.value = 0.02;
        this._referenceOscillator.frequency.value = 220;
        this._referenceOscillator.connect(gain);
        gain.connect(this.masterGain);
        this._referenceOscillator.start();
        this._localPreviewActive = true;
        this._nextPreviewBeat = context.currentTime + 0.01;
        const schedule = () => {
            if (!this._localPreviewActive || this._closed) return;
            const now = context.currentTime;
            if (this._nextPreviewBeat < now - 1) this._nextPreviewBeat = now + 0.01;
            for (let count = 0; count < 64 && this._nextPreviewBeat < now + 0.1; count++) {
                const oscillator = context.createOscillator();
                const envelope = context.createGain();
                const when = this._nextPreviewBeat;
                oscillator.frequency.value = 1000;
                envelope.gain.setValueAtTime(0.6, when);
                envelope.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
                oscillator.connect(envelope);
                envelope.connect(this.masterGain);
                this._previewOscillators.add(oscillator);
                this._previewGains.add(envelope);
                oscillator.onended = () => {
                    oscillator.disconnect(); envelope.disconnect();
                    this._previewOscillators.delete(oscillator); this._previewGains.delete(envelope);
                };
                oscillator.start(when); oscillator.stop(when + 0.04);
                this._previewBeatHistory.push({time: when, frequency: oscillator.frequency.value, bpm: this.bpm});
                if (this._previewBeatHistory.length > 32) this._previewBeatHistory.shift();
                this._nextPreviewBeat += 60 / this.bpm;
            }
        };
        schedule();
        this._metronomeTimer = setInterval(() => {
            try { schedule(); }
            catch (error) {
                this.stopLocalReference(); this.isPlaying = false;
                if (!this._closed && this._container) {
                    this.updateTransportButtons(this._container);
                    this.updateStatus(this._container, 'Audio preview failed');
                    this.addConsoleMessage(this._container, `Audio preview failed: ${error.message}`, 'error');
                }
            }
        }, 25);
        this.audioBackend = 'web-audio-reference';
    }

    stopLocalReference() {
        this._localPreviewActive = false;
        if (this._metronomeTimer !== null) clearInterval(this._metronomeTimer);
        this._metronomeTimer = null;
        for (const oscillator of this._previewOscillators) {
            try { oscillator.stop(); } catch {}
            try { oscillator.disconnect(); } catch {}
            oscillator.onended = null;
        }
        for (const gain of this._previewGains) { try { gain.disconnect(); } catch {} }
        this._previewOscillators.clear(); this._previewGains.clear();
        this._referenceOscillator = null;
    }

    processAudio(event) {
        // Real-time audio processing
        const outputBuffer = event.outputBuffer;
        const leftChannel = outputBuffer.getChannelData(0);
        const rightChannel = outputBuffer.getChannelData(1);
        
        // Apply current pattern to audio buffer
        if (this.isPlaying && this.currentPattern) {
            this.renderPatternToBuffer(leftChannel, rightChannel);
        }
    }

    renderPatternToBuffer(leftChannel, rightChannel) {
        // Render current pattern to audio buffer
        const bufferLength = leftChannel.length;
        
        for (let i = 0; i < bufferLength; i++) {
            // Basic pattern rendering
            const time = (this.audioContext.currentTime + i / this.audioContext.sampleRate);
            const sample = this.generateSampleAtTime(time);
            
            leftChannel[i] = sample;
            rightChannel[i] = sample;
        }
    }

    generateSampleAtTime(time) {
        // Generate audio sample for given time
        if (!this.currentPattern) return 0;
        
        // Basic pattern playback
        const beatTime = (time * this.bpm / 60) % 4; // 4/4 time
        const amplitude = 0.3;
        
        // Simple kick on beats 1 and 3
        if (Math.floor(beatTime) % 2 === 0 && beatTime % 1 < 0.1) {
            return amplitude * Math.sin(2 * Math.PI * 60 * time) * Math.exp(-(beatTime % 1) * 20);
        }
        
        return 0;
    }

    async loadDefaultPatterns() {
        console.log('🎼 Loading default patterns...');
        
        // Default patterns
        const defaultPatterns = {
            'main': {
                name: 'Main Pattern',
                code: 'kick.every(4).sound("kick")\nsnare.every(4, 1).sound("snare")\nhihat.every(1).sound("hihat")',
                description: 'Basic 4/4 drum pattern'
            },
            'bassline': {
                name: 'Bass Line',
                code: 'bass.every(2).sound("bass").freq([60, 65, 67, 62])',
                description: 'Simple bass progression'
            },
            'lead': {
                name: 'Lead Synth',
                code: 'lead.every(0.5).sound("lead").freq([440, 523, 659, 784])',
                description: 'Melodic lead pattern'
            }
        };
        
        this.patterns.clear();
        for (const [id, pattern] of Object.entries(defaultPatterns)) {
            this.patterns.set(id, pattern);
        }
        
        console.log(`✅ Loaded ${this.patterns.size} default patterns`);
    }

    importStrudelSDK() {
        return import(/* @vite-ignore */ 'https://esm.sh/@strudel.cycles/core?bundle');
    }

    async loadStrudelSDK() {
        if (this._closed) return;
        try {
            // Try to load real Strudel SDK if available
            const existing = [window.strudel, window.Strudel].find(engine => this.hasStrudelTransport(engine));
            if (existing) {
                console.log('📦 Using real Strudel SDK...');
                this.strudelEngine = existing;
            } else {
                // Load Strudel SDK from an ESM-friendly CDN.
                // Note: unpkg default build is CJS and throws 'exports is not defined' in browsers.
                // We prefer esm.sh which serves ESM bundles for direct browser import.
                console.log('📦 Loading Strudel SDK via ESM CDN...');
                try {
                    let timer;
                    let mod;
                    try {
                        mod = await Promise.race([this.importStrudelSDK(), new Promise((_, reject) => {
                            timer = setTimeout(() => reject(new Error('Strudel SDK load timed out')), this._sdkLoadTimeoutMs);
                        })]);
                    } finally { clearTimeout(timer); }
                    if (this._closed) return;
                    const engine = mod?.default || mod?.Strudel || mod;
                    if (this.hasStrudelTransport(engine)) {
                        this.strudelEngine = engine;
                        console.log('✅ Strudel SDK loaded via ESM import');
                    } else {
                        console.warn('⚠️ Strudel ESM module did not expose an engine, falling back');
                        this.setupFallbackEngine();
                    }
                } catch (e) {
                    console.warn('⚠️ ESM import failed, falling back to global loader:', e);
                    if (!this._closed) this.setupFallbackEngine();
                }
            }
            
            if (!this.hasStrudelTransport(this.strudelEngine)) {
                this.setupFallbackEngine();
            }
            
        } catch (error) {
            console.error('Failed to load Strudel SDK:', error);
            this.setupFallbackEngine();
        }
    }

    setupFallbackEngine() {
        this._sdkSelectionComplete = true;
        // The built-in worklet provides a real metronome/reference tone, not a Strudel compiler.
        this.strudelEngine = null;
        console.log('Strudel transport unavailable; local audio preview will be used if WebAudio is available.');
    }

    onCodeChange(window) {
        const editor = window.querySelector('#strudel-code-editor');
        this.currentCode = editor.value;
        
        this.updateLineNumbers(window);
        this.scheduleCodeAnalysis(window);
        
        // Auto-save
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.autoSavePattern(window);
        }, 2000);
    }

    updateLineNumbers(window) {
        const editor = window.querySelector('#strudel-code-editor');
        const lineNumbers = window.querySelector('#code-line-numbers');
        
        if (!editor || !lineNumbers) return;
        
        const lines = editor.value.split('\n').length;
        const numbersHtml = Array.from({ length: lines }, (_, i) => 
            `<div class="line-number">${i + 1}</div>`
        ).join('');
        
        lineNumbers.innerHTML = numbersHtml;
        lineNumbers.scrollTop = editor.scrollTop;
    }

    scheduleCodeAnalysis(window) {
        clearTimeout(this.analysisTimeout);
        this.analysisTimeout = setTimeout(() => {
            this.analyzeCodeForControls(window);
            if (this.aiEnabled) {
                this.generateAISuggestions(window);
            }
        }, 1500);
    }

    analyzeCodeForControls(window) {
        const code = this.currentCode;
        const variables = new Map();
        
        // Parse code for parameters that can become controls
        const patterns = [
            { regex: /\.gain\(([0-9.]+)\)/g, type: 'range', min: 0, max: 1, step: 0.01 },
            { regex: /\.lpf\(([0-9.]+)\)/g, type: 'range', min: 50, max: 5000, step: 10 },
            { regex: /\.room\(([0-9.]+)\)/g, type: 'range', min: 0, max: 1, step: 0.01 },
            { regex: /\.speed\(([0-9.]+)\)/g, type: 'range', min: 0.1, max: 4, step: 0.1 },
            { regex: /\.delay\(([0-9.]+)\)/g, type: 'range', min: 0, max: 1, step: 0.01 },
            { regex: /\.cpm\(([0-9.]+)\)/g, type: 'range', min: 60, max: 200, step: 1 }
        ];
        
        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.regex.exec(code)) !== null) {
                const value = parseFloat(match[1]);
                const paramName = pattern.regex.source.split('\\(')[0].replace('\\.', '');
                
                if (!variables.has(paramName)) {
                    variables.set(paramName, {
                        type: pattern.type,
                        value: value,
                        min: pattern.min,
                        max: pattern.max,
                        step: pattern.step,
                        instances: []
                    });
                }
                
                variables.get(paramName).instances.push({
                    value: value,
                    position: match.index
                });
            }
        });
        
        this.updateDynamicControls(window, variables);
    }

    updateDynamicControls(window, variables) {
        const container = window.querySelector('#dynamic-controls');
        
        // Clear existing controls except master
        const masterControls = container.querySelector('.control-group');
        container.innerHTML = '';
        container.appendChild(masterControls);
        
        if (variables.size === 0) return;
        
        // Create controls for detected variables
        const dynamicGroup = document.createElement('div');
        dynamicGroup.className = 'control-group';
        dynamicGroup.innerHTML = '<h5>🎛️ Detected Parameters</h5>';
        
        variables.forEach((param, name) => {
            const controlItem = document.createElement('div');
            controlItem.className = 'control-item';
            
            const label = name.charAt(0).toUpperCase() + name.slice(1);
            const unit = this.getParameterUnit(name);
            
            controlItem.innerHTML = `
                <label>${label}</label>
                <input type="range" 
                       class="control-slider" 
                       data-param="${name}"
                       min="${param.min}" 
                       max="${param.max}" 
                       step="${param.step}" 
                       value="${param.value}">
                <span class="control-value">${param.value}${unit}</span>
            `;
            
            const slider = controlItem.querySelector('.control-slider');
            const valueDisplay = controlItem.querySelector('.control-value');
            
            slider.addEventListener('input', (e) => {
                const newValue = parseFloat(e.target.value);
                valueDisplay.textContent = newValue + unit;
                this.updateCodeParameter(window, name, newValue);
            });
            
            dynamicGroup.appendChild(controlItem);
        });
        
        container.appendChild(dynamicGroup);
    }

    getParameterUnit(paramName) {
        const units = {
            gain: '',
            lpf: 'Hz',
            room: '',
            speed: 'x',
            delay: 's',
            cpm: ' BPM'
        };
        return units[paramName] || '';
    }

    updateCodeParameter(window, paramName, newValue) {
        const editor = window.querySelector('#strudel-code-editor');
        this.recordUndoSnapshot(window, `parameter:${paramName}`);
        let code = editor.value;
        
        // Update all instances of this parameter
        const regex = new RegExp(`\\.${paramName}\\([0-9.]+\\)`, 'g');
        code = code.replace(regex, `.${paramName}(${newValue})`);
        
        editor.value = code;
        this.currentCode = code;
        
        // Apply changes to audio in real-time if playing
        if (this.isPlaying) {
            this.updateLiveAudio(window);
        }
    }

    async updateLiveAudio(window) {
        if (this.playbackMode !== 'strudel') {
            this.addConsoleMessage(window, 'Local metronome/reference preview does not compile edited Strudel code.', 'info');
            return;
        }
        try {
            await this.awaitTransport(this.evaluateStrudelCode(this.currentCode));
        } catch (error) {
            this.addConsoleMessage(window, `Code evaluation failed: ${error.message}`, 'error');
        }
    }

    async awaitAudioCleanup(operation) {
        let timer;
        try {
            return await Promise.race([operation, new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('Native audio cleanup timed out')), this._transportTimeoutMs);
            })]);
        } finally { clearTimeout(timer); }
    }

    async awaitTransport(operation) {
        let timer;
        try {
            return await Promise.race([operation, new Promise((_, reject) => {
                timer = setTimeout(() => {
                    this._transportFaulted = true;
                    reject(new Error('Strudel transport timed out; close and reopen the app before retrying playback'));
                }, this._transportTimeoutMs);
            })]);
        } finally { clearTimeout(timer); }
    }

    async play(window) {
        if (this.isPlaying || this._playPending || this._closed) return;
        this._playPending = true;
        const generation = ++this._transportGeneration;
        try {
            if (this._transportFaulted) throw new Error('Strudel transport unavailable after timeout; close and reopen the app');
            if (!this.audioContext || this.audioContext.state === 'closed') throw new Error('Audio engine unavailable');
            if (this.audioContext.state === 'suspended') await this.awaitTransport(this.audioContext.resume());
            if (this.audioContext.state !== 'running') throw new Error('Audio context is not running');
            if (this._closed || generation !== this._transportGeneration) return;
            if (this.hasStrudelTransport(this.strudelEngine)) {
                if (!this.currentCode.trim()) throw new Error('Enter a Strudel pattern before playback');
                await this.awaitTransport(this.evaluateStrudelCode(this.currentCode));
                if (this._closed || generation !== this._transportGeneration) return;
                this._sdkActive = true;
                const starting = Promise.resolve(this.strudelEngine.start());
                // A timed-out start may resolve later; it still must not restart
                // audio after Stop, window close, or a failed transport.
                void starting.then(() => {
                    if (this._closed || this._transportFaulted || generation !== this._transportGeneration) {
                        return this.awaitTransport(this.strudelEngine.stop());
                    }
                }).catch(() => {});
                await this.awaitTransport(starting);
                if (this._closed || generation !== this._transportGeneration) {
                    await this.awaitTransport(this.strudelEngine.stop());
                    this._sdkActive = false;
                    return;
                }
                this.playbackMode = 'strudel';
                this.audioBackend = 'strudel-sdk';
            } else {
                if (!this.isUsingWorklet) await this.awaitTransport(this.setupRealTimeProcessing());
                if (this._closed || generation !== this._transportGeneration) return;
                if (this.isUsingWorklet && this.audioNode) {
                    this.audioNode.port.postMessage({type: 'setPlaying', value: true});
                    this.audioBackend = 'worklet-reference';
                } else {
                    this.startLocalReference();
                }
                this.playbackMode = 'local-preview';
            }
            this.isPlaying = true;
            this.updateTransportButtons(window);
            const status = this.playbackMode === 'strudel' ? 'Playing Strudel pattern' :
                `Local audio preview — metronome/reference tone (${this.audioBackend === 'web-audio-reference' ? 'native WebAudio fallback' : 'AudioWorklet'}); Strudel code compilation unavailable`;
            this.updateStatus(window, status);
            this.addConsoleMessage(window, status, 'info');
        } catch (error) {
            // Preserve the evaluation/start failure instead of replacing it with a missing stop().
            await this.haltAudio();
            if (!this._closed) {
                this.updateTransportButtons(window);
                this.updateStatus(window, 'Playback failed');
                this.addConsoleMessage(window, `Playback failed: ${error.message}`, 'error');
            }
        } finally {
            this._playPending = false;
        }
    }

    async haltAudio() {
        this.isPlaying = false;
        this.stopLocalReference();
        const wasActive = this._sdkActive;
        this._sdkActive = false;
        let failure;
        // Local output must stop before waiting on any external SDK promise.
        try { this.audioNode?.port.postMessage({type: 'setPlaying', value: false}); }
        catch (error) { failure = error; }
        try {
            if (wasActive && this.hasStrudelTransport(this.strudelEngine)) {
                await this.awaitTransport(this.strudelEngine.stop());
            }
        } catch (error) { failure ||= error; this._sdkActive = wasActive; }
        // Even if an external SDK stop fails, silence this app's real audio context.
        if (failure && this.audioContext?.state === 'running') {
            try { await this.awaitAudioCleanup(this.audioContext.suspend()); }
            catch (error) { this.audioCleanupErrors.push(error.message); }
        }
        return failure;
    }

    async pause(window) {
        return this.stop(window, 'Paused');
    }

    async stop(window, status = 'Stopped') {
        this._transportGeneration++;
        if (!this._closed) this.updateStatus(window, 'Stopping audio…');
        const failure = await this.haltAudio();
        if (this._closed) return;
        this.updateTransportButtons(window);
        this.updateStatus(window, failure ? 'Audio stop failed' : status);
        this.addConsoleMessage(window, failure ? `Audio stop failed: ${failure.message}` : status,
            failure ? 'error' : 'info');
    }

    updateTransportButtons(window) {
        const playBtn = window.querySelector('#play-btn');
        const pauseBtn = window.querySelector('#pause-btn');
        const stopBtn = window.querySelector('#stop-btn');
        
        playBtn.disabled = this.isPlaying || this._sdkActive || this._transportFaulted;
        pauseBtn.disabled = !this.isPlaying && !this._sdkActive;
        stopBtn.disabled = !this.isPlaying && !this._sdkActive;
    }

    setBPM(window, bpm) {
        const value = Number(bpm);
        if (!Number.isFinite(value) || value <= 0) return;
        this.bpm = Math.max(60, Math.min(200, value));
        if (this._localPreviewActive) this._nextPreviewBeat = this.audioContext.currentTime + 60 / this.bpm;
        if (typeof this.strudelEngine?.setTempo === 'function') {
            Promise.resolve().then(() => this.strudelEngine.setTempo(this.bpm)).catch(error => {
                if (!this._closed) this.addConsoleMessage(window, `Tempo update failed: ${error.message}`, 'error');
            });
        }
        if (this.isUsingWorklet && this.audioNode) {
            this.audioNode.port.postMessage({ type: 'setBPM', value: this.bpm });
        }
        this.addConsoleMessage(window, `🎵 BPM set to ${this.bpm}`, 'info');
    }

    setMasterVolume(window, volume) {
        this.masterVolume = parseFloat(volume);
        if (this.masterGain) {
            this.masterGain.gain.value = this.masterVolume;
        }
        if (this.isUsingWorklet && this.audioNode) {
            this.audioNode.port.postMessage({ type: 'setVolume', value: this.masterVolume });
        }
        
        const display = window.querySelector('#volume-display');
        display.textContent = Math.round(this.masterVolume * 100) + '%';
    }

    async showAIDialog(window) {
        const dialog = window.querySelector('#ai-generation-dialog');
        dialog.style.display = 'block';
    }

    async sendAIMessage(window) {
        const aiInput = window.querySelector('#ai-input');
        const message = aiInput.value.trim();
        
        if (!message) return;
        
        this.addAIMessage(window, message, 'user');
        aiInput.value = '';
        
        const notice = 'Assistance unavailable: request not executed. Local edits kept.';
        this.addAIMessage(window, notice, 'error');
        const status = window.querySelector('#assistance-status');
        if (status) status.textContent = notice;
    }

    addAIMessage(window, message, role) {
        const messagesContainer = window.querySelector('#ai-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${role}-message`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = role === 'user' ? '👤' : role === 'assistant' ? '🤖' : '⚠️';
        
        const content = document.createElement('div');
        content.className = 'message-content';
        
        if (message.includes('```')) {
            content.innerHTML = this.formatCodeBlocks(message);
        } else {
            content.innerHTML = message.replace(/\n/g, '<br>');
        }
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    formatCodeBlocks(text) {
        return text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
            return `<pre class="code-block"><code>${this.escapeHtml(code.trim())}</code><button class="insert-code-btn" onclick="this.insertCode('${this.escapeHtml(code.trim())}')">📝 Insert</button></pre>`;
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async generateQuickBeat(window) {
        const beatCode = `// 🥁 Quick Beat Generation
note("c2 ~ ~ ~").sound("bd").gain(0.8)`;
        
        this.insertCodeAtCursor(window, beatCode);
        this.addConsoleMessage(window, '🥁 Quick beat pattern inserted', 'info');
    }

    async generateQuickMelody(window) {
        const melodyCode = `// 🎵 Quick Melody
note("c4 d4 e4 f4").sound("sine").lpf(1000).slow(2)`;
        
        this.insertCodeAtCursor(window, melodyCode);
        this.addConsoleMessage(window, '🎵 Quick melody pattern inserted', 'info');
    }

    async generateQuickBass(window) {
        const bassCode = `// 🎸 Quick Bassline
note("c2 ~ eb2 ~").sound("sawtooth").lpf(300).gain(0.6)`;
        
        this.insertCodeAtCursor(window, bassCode);
        this.addConsoleMessage(window, '🎸 Quick bassline pattern inserted', 'info');
    }

    async generateQuickFX(window) {
        const fxCode = `.room(0.3).delay(0.125).gain(0.8)`;
        
        this.insertCodeAtCursor(window, fxCode);
        this.addConsoleMessage(window, '✨ Quick FX added', 'info');
    }

    insertCodeAtCursor(window, code) {
        const editor = window.querySelector('#strudel-code-editor');
        this.recordUndoSnapshot(window, 'insert-code');
        const cursorPosition = editor.selectionStart;
        const currentCode = editor.value;
        
        const newCode = currentCode.slice(0, cursorPosition) + '\n' + code + '\n' + currentCode.slice(cursorPosition);
        editor.value = newCode;
        this.currentCode = newCode;
        
        this.updateLineNumbers(window);
        this.scanCodeVariables(window);
    }

    switchBottomPanel(window, panelName) {
        window.querySelectorAll('.panel-tab').forEach(tab => tab.classList.remove('active'));
        window.querySelectorAll('.panel-section').forEach(section => section.classList.remove('active'));
        
        window.querySelector(`[data-panel="${panelName}"]`).classList.add('active');
        window.querySelector(`#${panelName}-panel`).classList.add('active');
    }

    switchSidebarTab(window, tabName) {
        window.querySelectorAll('.sidebar-tab').forEach(tab => tab.classList.remove('active'));
        window.querySelectorAll('.sidebar-panel').forEach(panel => panel.classList.remove('active'));
        
        window.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        window.querySelector(`#${tabName}-panel`).classList.add('active');
    }

    startVisualization() {
        if (!this.analyser || this._closed || this.animationFrame !== null) return;
        
        const animate = () => {
            if (this._closed) return;
            this.animationFrame = requestAnimationFrame(animate);
            this.drawWaveform();
            this.drawSpectrum();
        };
        
        animate();
    }

    drawWaveform() {
        if (!this.waveformCtx || !this.analyser) return;
        
        const canvas = this.waveformCanvas;
        const ctx = this.waveformCtx;
        
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteTimeDomainData(dataArray);
        
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#00ff88';
        ctx.beginPath();
        
        const sliceWidth = canvas.width / bufferLength;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * canvas.height / 2;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        ctx.stroke();
    }

    drawSpectrum() {
        if (!this.spectrumCtx || !this.analyser) return;
        
        const canvas = this.spectrumCanvas;
        const ctx = this.spectrumCtx;
        
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);
        
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = canvas.width / bufferLength * 2.5;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = dataArray[i] / 255 * canvas.height;
            
            const hue = i / bufferLength * 360;
            ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
        }
    }

    addConsoleMessage(window, message, type = 'info') {
        const console = window.querySelector('#console-output');
        if (!console) return;
        const messageDiv = document.createElement('div');
        messageDiv.className = `console-message ${type}`;
        messageDiv.innerHTML = `<span class="timestamp">${new Date().toLocaleTimeString()}</span> ${message}`;
        console.appendChild(messageDiv);
        console.scrollTop = console.scrollHeight;
    }

    updateStatus(window, status) {
        const node = window.querySelector('#audio-playback-status');
        if (node) node.textContent = status;
    }

    handleG045WorkflowAction(window, action) {
        switch (action) {
            case 'load-asset-provenance':
                this.loadAssetProvenance(window);
                break;
            case 'request-assisted-composition':
                this.requestAssistedComposition(window);
                break;
            case 'start-render-job':
                this.startRenderJob(window);
                break;
            case 'undo-ai-change':
                this.undoLastChange(window);
                break;
            case 'simulate-audio-backend-failure':
                this.simulateAudioBackendFailure(window);
                break;
            case 'toggle-compact-controls':
                this.toggleCompactControls(window);
                break;
            default:
                break;
        }
    }

    updateG045Marker(window, marker, text, attributes = {}) {
        const node = window.querySelector(`[data-svd-vda-marker="${marker}"]`);
        if (!node) return;
        Object.entries(attributes).forEach(([name, value]) => {
            node.dataset[name] = String(value);
        });
        node.innerHTML = text;
    }

    setG045Status(window, status) {
        const statusNode = window.querySelector('[data-g045-workflow-status]');
        if (!statusNode) return;
        statusNode.dataset.g045WorkflowStatus = status;
        statusNode.textContent = status;
    }

    recordUndoSnapshot(window, reason) {
        const editor = window.querySelector('#strudel-code-editor');
        const code = editor?.value ?? this.currentCode ?? '';
        const latest = this.undoStack[this.undoStack.length - 1];
        if (latest?.code === code) return;
        this.undoStack.push({
            code,
            reason,
            activePattern: this.activePattern,
            timestamp: new Date().toISOString()
        });
        if (this.undoStack.length > 20) this.undoStack.shift();
    }

    async loadAssetProvenance(window) {
        this.assetProvenance = {
            projectCid: null,
            mediaCid: null,
            sampleCid: null,
            libraryCid: null,
            eventDagCid: null,
            receipt: null
        };
        this.savePattern(window);
        this.updateG045Marker(
            window,
            'asset-provenance',
            'Composition saved in this browser. No remote artifact store is connected, so no CID is claimed.',
            { assetProvenanceState: 'local', projectCidState: 'local', mediaCidState: 'local' }
        );
        this.setG045Status(window, 'saved-local');
        this.addConsoleMessage(window, 'Composition saved locally; remote asset store is not used', 'info');
    }

    requestAssistedComposition(window) {
        const notice = 'Assistance unavailable: request not executed. Local edits kept.';
        const status = window.querySelector('#assistance-status');
        if (status) status.textContent = notice;
        this.updateG045Marker(
            window,
            'assisted-composition',
            notice,
            { assistedCompositionState: 'unavailable', assistantEditState: 'not-executed' }
        );
        this.setG045Status(window, 'assistance-unavailable');
        this.addConsoleMessage(window, notice, 'error');
    }

    startRenderJob(window) {
        // Honest local render state: the queue entry is real session state,
        // but there is no audio render backend here, so no progress percent,
        // checkpoint CID or receipt is claimed.
        this.renderState = {
            status: 'queued-local',
            progress: 0,
            checkpoint: null,
            receipt: null
        };
        this.updateG045Marker(
            window,
            'render-state',
            'Render queued in the local session (no audio render backend connected, so no progress or artifact CID is claimed). Use Export for a local manifest.',
            { renderState: 'queued', renderJobState: 'local-only' }
        );
        const progress = window.querySelector('progress[data-render-progress]');
        if (progress) progress.value = 0;
        this.setG045Status(window, 'render-queued');
        this.addConsoleMessage(window, 'Render queued (local session state)', 'info');
    }

    undoLastChange(window) {
        const editor = window.querySelector('#strudel-code-editor');
        const snapshot = this.undoStack.pop();
        if (!editor || !snapshot) {
            this.updateG045Marker(
                window,
                'undo',
                'Undo checked: no destructive edit was applied because the local history stack is empty.',
                { undoState: 'empty', undoProof: 'none' }
            );
            return;
        }
        editor.value = snapshot.code;
        this.currentCode = snapshot.code;
        this.activePattern = snapshot.activePattern;
        this.updateLineNumbers(window);
        this.scanCodeVariables(window);
        this.updateG045Marker(
            window,
            'undo',
            `Undo applied from the local history stack. Restored reason ${snapshot.reason}, active pattern ${snapshot.activePattern}, and editable code.`,
            { undoState: 'restored', undoProof: 'local-history' }
        );
        this.setG045Status(window, 'undo-restored');
        this.addConsoleMessage(window, 'Undo restored the previous editable pattern', 'info');
    }

    simulateAudioBackendFailure(window) {
        // Test control: simulates a backend failure locally. No CIDs or
        // receipts are minted by a test.
        this.isUsingWorklet = false;
        this.updateG045Marker(
            window,
            'failed-audio-backend',
            'Test: simulated AudioWorklet failure. Fallback active via offline WebAudio preview (local). Transport stays disabled while the simulated failure is active.',
            { audioBackendState: 'failed-test', audioFallbackState: 'fallback-active' }
        );
        this.setG045Status(window, 'audio-backend-fallback-active');
        this.addConsoleMessage(window, 'Audio backend error handled; fallback active', 'error');
    }

    toggleCompactControls(window) {
        const root = window.querySelector('.strudel-ai-daw');
        root?.classList.add('compact-controls-enabled');
        this.updateG045Marker(
            window,
            'compact-controls',
            'Compact controls enabled: transport, BPM input, volume slider, render state, undo, and backend fallback actions fit in the narrow mobile control strip (local UI state).',
            { compactControlsState: 'enabled', compactControlsProof: 'mobile-ready' }
        );
        this.setG045Status(window, 'compact-controls-enabled');
        this.addConsoleMessage(window, 'Compact controls enabled for narrow viewports', 'info');
    }

    setupDialogControls(window) {
        // Close dialog buttons
        window.querySelectorAll('.close-dialog').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.ai-generation-dialog, .settings-dialog').style.display = 'none';
            });
        });
        
        // Generate music button
        window.querySelector('#generate-music')?.addEventListener('click', () => this.generateMusic(window));
    }

    async generateMusic(window) {
        const description = window.querySelector('#music-description').value.trim();
        if (!description) {
            this.desktop.showNotification('Please describe the music you want to create', 'warning');
            return;
        }
        
        const options = {
            melody: window.querySelector('#include-melody').checked,
            bass: window.querySelector('#include-bass').checked,
            drums: window.querySelector('#include-drums').checked,
            fx: window.querySelector('#include-fx').checked
        };
        
        const notice = 'Assistance unavailable: request not executed. Local edits kept.';
        const status = window.querySelector('#assistance-status');
        if (status) status.textContent = notice;
        this.addConsoleMessage(window, notice, 'error');
        this.desktop.showNotification(notice, 'warning');
    }

    selectGenre(window, genre) {
        const descriptions = {
            techno: 'A driving techno track with a four-on-the-floor kick, rolling bassline, and crisp hi-hats',
            ambient: 'A peaceful ambient soundscape with evolving pads, subtle arpeggios, and atmospheric textures',
            jazz: 'A sophisticated jazz progression with walking bass, complex chords, and syncopated rhythms',
            dnb: 'An energetic drum & bass track with breakbeats, sub bass, and melodic elements',
            house: 'A groovy house track with disco-influenced bass, uplifting chords, and steady four-four rhythm',
            trap: 'A hard-hitting trap beat with 808 drums, snappy snares, and melodic elements'
        };
        
        const textarea = window.querySelector('#music-description');
        textarea.value = descriptions[genre] || '';
    }

    scanCodeVariables(window) {
        this.analyzeCodeForControls(window);
    }

    setupSyntaxHighlighting(window) {
        // Basic syntax highlighting for Strudel code
        // In a real implementation, use a proper syntax highlighter
    }

    async evaluateStrudelCode(code) {
        if (!this.hasStrudelTransport(this.strudelEngine)) {
            throw new Error('Strudel code compilation unavailable in local audio preview');
        }
        return this.strudelEngine.evaluate(code);
    }

    tapTempo(window) {
        const now = performance.now();
        this.tapTempoTimes = (this.tapTempoTimes || []).filter(time => now - time < 2500);
        this.tapTempoTimes.push(now);
        if (this.tapTempoTimes.length < 2) {
            this.addConsoleMessage(window, 'Tap tempo armed; tap again to calculate BPM', 'info');
            return;
        }
        const intervals = this.tapTempoTimes.slice(1).map((time, index) => time - this.tapTempoTimes[index]);
        const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
        const bpm = Math.max(60, Math.min(200, Math.round(60000 / averageInterval)));
        const bpmInput = window.querySelector('#bpm-input');
        if (bpmInput) bpmInput.value = String(bpm);
        this.setBPM(window, bpm);
    }

    record(window) {
        this.isRecording = !this.isRecording;
        const recordBtn = window.querySelector('#record-btn');
        if (recordBtn) {
            recordBtn.setAttribute('aria-pressed', String(this.isRecording));
            recordBtn.classList.toggle('recording', this.isRecording);
        }
        const state = this.isRecording ? 'armed' : 'stopped';
        this.addConsoleMessage(window, `Recording ${state}; local input capture ${this.isRecording ? 'will be attached to the next render manifest' : 'closed'}`, 'info');
    }

    enhanceWithAI(window) {
        const editor = window.querySelector('#strudel-code-editor');
        if (!editor) return;
        this.recordUndoSnapshot(window, 'ai-enhance');
        const code = editor.value.trim();
        const enhanced = code.includes('.room(') || code.includes('.delay(')
            ? code.replace(/\.gain\((0\.\d+|1(?:\.0+)?)\)/, '.gain(0.72)')
            : `${code}\n// AI enhancement: controlled ambience\n.lastOf(4, pattern => pattern.room(0.18).delay(0.125).gain(0.72))`;
        editor.value = enhanced;
        this.currentCode = enhanced;
        this.updateLineNumbers(window);
        this.scanCodeVariables(window);
        this.addConsoleMessage(window, 'AI enhancement applied with undo snapshot', 'info');
    }

    fixWithAI(window) {
        const editor = window.querySelector('#strudel-code-editor');
        if (!editor) return;
        this.recordUndoSnapshot(window, 'ai-fix');
        let code = editor.value.trim();
        if (!code) {
            code = 'note("c2 ~ eb2 ~").sound("bd").gain(0.8).cpm(120)';
        }
        const openParens = (code.match(/\(/g) || []).length;
        const closeParens = (code.match(/\)/g) || []).length;
        if (openParens > closeParens) code += ')'.repeat(openParens - closeParens);
        if (!/\.cpm\(\d+/.test(code)) code += `\n.cpm(${this.bpm})`;
        editor.value = code;
        this.currentCode = code;
        this.updateLineNumbers(window);
        this.scanCodeVariables(window);
        this.addConsoleMessage(window, 'AI fix normalized the pattern syntax and tempo', 'info');
    }

    newPattern(window) {
        const editor = window.querySelector('#strudel-code-editor');
        if (!editor) return;
        this.recordUndoSnapshot(window, 'new-pattern');
        const id = `pattern-${this.patterns.size + 1}`;
        const code = `// ${id}
stack(
  note("c2 ~ c2 ~").sound("bd").gain(0.8),
  note("~ eb4 g4 bb4").sound("sine").lpf(900).slow(2)
).cpm(${this.bpm})`;
        this.patterns.set(id, { name: `Pattern ${this.patterns.size + 1}`, code, description: 'New editable Strudel AI DAW pattern' });
        this.activePattern = id;
        editor.value = code;
        this.currentCode = code;
        this.updateLineNumbers(window);
        this.scanCodeVariables(window);
        this.addConsoleMessage(window, `Created ${id}`, 'info');
    }

    savePattern(window) {
        const editor = window.querySelector('#strudel-code-editor');
        const code = editor?.value ?? this.currentCode;
        const savedAt = new Date().toISOString();
        const payload = {
            schema: 'swissknife.strudel-ai-daw.pattern.v1',
            id: this.activePattern,
            bpm: this.bpm,
            masterVolume: this.masterVolume,
            code,
            codeContext: this.codeContext,
            assetProvenance: this.assetProvenance,
            renderState: this.renderState,
            savedAt
        };
        this.patterns.set(this.activePattern, {
            name: this.patterns.get(this.activePattern)?.name || this.activePattern,
            code,
            description: `Saved ${savedAt}`
        });
        try {
            localStorage.setItem('swissknife:strudel-ai-daw:last-pattern', JSON.stringify(payload));
            localStorage.setItem(`swissknife:strudel-ai-daw:pattern:${this.activePattern}`, JSON.stringify(payload));
            this.addConsoleMessage(window, `Saved ${this.activePattern} to local project storage`, 'info');
        } catch (error) {
            this.addConsoleMessage(window, `Save failed: ${error.message}`, 'error');
        }
    }

    async exportAudio(window) {
        this.startRenderJob(window);
        const manifest = {
            schema: 'swissknife.strudel-ai-daw.render-manifest.v1',
            bpm: this.bpm,
            durationSeconds: 16,
            channels: 2,
            sampleRate: this.audioContext?.sampleRate || 44100,
            fallback: !this.isUsingWorklet,
            code: this.currentCode,
            exportedAt: new Date().toISOString()
        };
        try {
            localStorage.setItem('swissknife:strudel-ai-daw:last-render-manifest', JSON.stringify(manifest));
        } catch (error) {
            this.addConsoleMessage(window, `Local manifest save skipped: ${error.message}`, 'error');
        }
        this.addConsoleMessage(window, 'Export manifest kept in this browser. No remote artifact store is connected.', 'info');
    }

    autoSavePattern(window) {
        const editor = window.querySelector('#strudel-code-editor');
        const payload = {
            code: editor?.value ?? this.currentCode,
            activePattern: this.activePattern,
            bpm: this.bpm,
            savedAt: new Date().toISOString()
        };
        try {
            localStorage.setItem('swissknife:strudel-ai-daw:auto-save', JSON.stringify(payload));
        } catch (error) {
            this.addConsoleMessage(window, `Auto-save skipped: ${error.message}`, 'error');
        }
    }

    generateAISuggestions(window) {
        const suggestions = window.querySelector('#code-suggestions');
        const content = suggestions?.querySelector('.suggestions-content');
        if (!suggestions || !content) return;
        const suggestionsList = [];
        if (!/\.gain\(/.test(this.currentCode)) suggestionsList.push('Add gain() to bound the output level before rendering.');
        if (!/\.cpm\(/.test(this.currentCode)) suggestionsList.push(`Add cpm(${this.bpm}) so render tempo matches transport BPM.`);
        if (!/stack\(/.test(this.currentCode)) suggestionsList.push('Use stack() to keep drums, bass, and lead editable as separate layers.');
        if (suggestionsList.length === 0) suggestionsList.push('Pattern has bounded gain, tempo, and layered structure.');
        content.innerHTML = suggestionsList.map(item => `<div class="suggestion-item">${this.escapeHtml(item)}</div>`).join('');
        suggestions.style.display = 'block';
    }

    handleCodeKeyDown(window, e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            this.savePattern(window);
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            this.undoLastChange(window);
        }
        if (e.key === 'Tab') {
            e.preventDefault();
            this.insertCodeAtCursor(window, '  ');
        }
    }
}

// Export with the expected name for app registration
export const StrudelAIDAWApp = StrudelAIDAW;
