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
        try {
            this.setupEventListeners(container);
            await this.initializeEditor(container);
            this.setupVisualization(container);
            await this.initializeAudioEngine(container);
        } catch (err) {
            console.error('Failed to mount Strudel AI DAW:', err);
        }
    }

    getContentHTML() {
        return `
            <div class="strudel-ai-daw">
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
                    <div class="transport-controls">
                        <button class="transport-btn large" id="play-btn">▶️</button>
                        <button class="transport-btn" id="pause-btn" disabled>⏸️</button>
                        <button class="transport-btn" id="stop-btn" disabled>⏹️</button>
                        <button class="transport-btn" id="record-btn">🔴</button>
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
                        <div class="cpu-meter">
                            <span>CPU:</span>
                            <div class="meter"><div class="meter-fill" id="cpu-meter"></div></div>
                        </div>
                        <div class="latency-display">
                            <span id="latency-value">0ms</span>
                        </div>
                    </div>
                </div>

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

        // BPM and volume
        window.querySelector('#bpm-input').addEventListener('change', (e) => this.setBPM(window, e.target.value));
        window.querySelector('#master-volume').addEventListener('input', (e) => this.setMasterVolume(window, e.target.value));
        window.querySelector('#tap-tempo').addEventListener('click', () => this.tapTempo(window));

        // AI functions
        window.querySelector('#ai-generate').addEventListener('click', () => this.showAIDialog(window));
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
    }

    async initializeEditor(window) {
        const editor = window.querySelector('#strudel-code-editor');
        
        // Load default Strudel pattern
        editor.value = `// 🎵 AI-Generated Minimal Techno
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
            
            // Set up analyser for visualization
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 1024;
            this.analyser.connect(this.audioContext.destination);
            
            // Initialize master gain
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.masterVolume;
            this.masterGain.connect(this.analyser);
            
            // Initialize Strudel engine
            await this.initializeStrudelEngine();
            
            // Load default samples and patterns
            await this.loadDefaultSamples();
            await this.loadDefaultPatterns();
            
            // Set up real-time processing
            await this.setupRealTimeProcessing();
            
            console.log('✅ Advanced audio engine initialized successfully');
            // Ensure visualization starts now that analyser exists
            this.startVisualization();
            
        } catch (error) {
            console.error('❌ Failed to initialize audio engine:', error);
            throw error;
        }
    }

    async initializeStrudelEngine() {
        try {
            console.log('🎼 Initializing Strudel engine...');
            
            // Check if Strudel is available globally
            if (window.strudel) {
                this.strudelEngine = window.strudel;
                console.log('✅ Using global Strudel engine');
            } else {
                // Initialize basic pattern engine
                this.strudelEngine = {
                    Pattern: this.createPatternClass(),
                    samples: new Map(),
                    oscillators: new Map(),
                    effects: new Map()
                };
                console.log('✅ Using built-in pattern engine');
            }
            
        } catch (error) {
            console.error('❌ Failed to initialize Strudel engine:', error);
            throw error;
        }
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
            this.strudelEngine.samples.set(name, {
                buffer: synthBuffer,
                category: config.category,
                loaded: true,
                synthesized: true
            });
        }
        
        console.log(`✅ Loaded ${this.strudelEngine.samples.size} synthesized samples`);
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

    async setupRealTimeProcessing() {
        console.log('⚡ Setting up real-time audio processing...');
        
        // Use AudioWorkletNode for modern audio processing
        try {
            if (this.audioContext.audioWorklet && typeof this.audioContext.audioWorklet.addModule === 'function') {
                const workletUrl = new URL('../audio/strudel-processor.js', import.meta.url);
                await this.audioContext.audioWorklet.addModule(workletUrl);
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
            console.log('Real-time processing disabled. Audio playback will still work.');
        }
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

    async loadStrudelSDK() {
        try {
            // Try to load real Strudel SDK if available
            if (window.Strudel) {
                console.log('📦 Using real Strudel SDK...');
                this.strudelEngine = window.Strudel;
            } else {
                // Load Strudel SDK from an ESM-friendly CDN.
                // Note: unpkg default build is CJS and throws 'exports is not defined' in browsers.
                // We prefer esm.sh which serves ESM bundles for direct browser import.
                console.log('📦 Loading Strudel SDK via ESM CDN...');
                try {
                    const mod = await import(/* @vite-ignore */ 'https://esm.sh/@strudel.cycles/core?bundle');
                    const engine = mod?.default || mod?.Strudel || mod;
                    if (engine) {
                        this.strudelEngine = engine;
                        console.log('✅ Strudel SDK loaded via ESM import');
                    } else {
                        console.warn('⚠️ Strudel ESM module did not expose an engine, falling back');
                        this.setupFallbackEngine();
                    }
                } catch (e) {
                    console.warn('⚠️ ESM import failed, falling back to global loader:', e);
                    // Secondary attempt: try jsDelivr with ?module hint (still may be CJS depending on package config)
                    await new Promise((resolve) => setTimeout(resolve, 300));
                    this.setupFallbackEngine();
                }
            }
            
            if (!this.strudelEngine) {
                this.setupFallbackEngine();
            }
            
        } catch (error) {
            console.error('Failed to load Strudel SDK:', error);
            this.setupFallbackEngine();
        }
    }

    setupFallbackEngine() {
        console.log('📦 Using fallback Strudel engine interface');
        this.strudelEngine = {
            // Fallback Strudel engine interface
            evaluate: (code) => this.evaluateStrudelCode(code),
            setTempo: (bpm) => this.bpm = bpm,
            stop: () => this.stopStrudel(),
            start: () => this.startStrudel()
        };
        console.log('✅ Fallback engine ready');
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
        try {
            // Re-evaluate the current code with new parameters
            if (this.strudelEngine) {
                await this.strudelEngine.evaluate(this.currentCode);
            }
        } catch (error) {
            console.error('Failed to update live audio:', error);
        }
    }

    async play(window) {
        if (this.isPlaying) return;
        
        try {
            this.isPlaying = true;
            this.updateTransportButtons(window);
            this.updateStatus(window, 'Playing...');
            
            // Resume audio context if suspended
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            // Evaluate and start Strudel code
            if (this.strudelEngine && this.currentCode.trim()) {
                await this.strudelEngine.evaluate(this.currentCode);
                await this.strudelEngine.start();
            }

            // Notify worklet
            if (this.isUsingWorklet && this.audioNode) {
                this.audioNode.port.postMessage({ type: 'setPlaying', value: true });
            }
            
            this.addConsoleMessage(window, '▶️ Playback started', 'info');
            
        } catch (error) {
            console.error('Playback failed:', error);
            this.addConsoleMessage(window, `❌ Playback failed: ${error.message}`, 'error');
            this.stop(window);
        }
    }

    pause(window) {
        if (!this.isPlaying) return;
        
        this.isPlaying = false;
        this.updateTransportButtons(window);
        this.updateStatus(window, 'Paused');
        
        if (this.strudelEngine) {
            this.strudelEngine.stop();
        }
        if (this.isUsingWorklet && this.audioNode) {
            this.audioNode.port.postMessage({ type: 'setPlaying', value: false });
        }
        
        this.addConsoleMessage(window, '⏸️ Playback paused', 'info');
    }

    stop(window) {
        this.isPlaying = false;
        this.updateTransportButtons(window);
        this.updateStatus(window, 'Stopped');
        
        if (this.strudelEngine) {
            this.strudelEngine.stop();
        }
        if (this.isUsingWorklet && this.audioNode) {
            this.audioNode.port.postMessage({ type: 'setPlaying', value: false });
        }
        
        this.addConsoleMessage(window, '⏹️ Playback stopped', 'info');
    }

    updateTransportButtons(window) {
        const playBtn = window.querySelector('#play-btn');
        const pauseBtn = window.querySelector('#pause-btn');
        const stopBtn = window.querySelector('#stop-btn');
        
        playBtn.disabled = this.isPlaying;
        pauseBtn.disabled = !this.isPlaying;
        stopBtn.disabled = !this.isPlaying;
    }

    setBPM(window, bpm) {
        this.bpm = parseInt(bpm);
        if (this.strudelEngine) {
            this.strudelEngine.setTempo(this.bpm);
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
        
        try {
            const response = await this.swissknife.chat({
                message: `You are an expert Strudel live coding assistant. Current code context:
${this.currentCode}

User request: ${message}

Please provide Strudel.js code that addresses the user's request. Focus on:
- Using proper Strudel syntax and functions
- Creating musical and rhythmic patterns
- Explaining your choices briefly
- Providing complete, runnable code snippets`,
                model: 'gpt-4'
            });
            
            this.addAIMessage(window, response.message, 'assistant');
            
        } catch (error) {
            this.addAIMessage(window, `Error: ${error.message}`, 'error');
        }
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
        if (!this.analyser) return;
        
        const animate = () => {
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
        const messageDiv = document.createElement('div');
        messageDiv.className = `console-message ${type}`;
        messageDiv.innerHTML = `<span class="timestamp">${new Date().toLocaleTimeString()}</span> ${message}`;
        console.appendChild(messageDiv);
        console.scrollTop = console.scrollHeight;
    }

    updateStatus(window, status) {
        // Update status display if needed
        console.log('Status:', status);
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
        
        try {
            const response = await this.swissknife.chat({
                message: `Generate Strudel.js code for this musical description:

"${description}"

Options:
- Include melody: ${options.melody}
- Include bass: ${options.bass}  
- Include drums: ${options.drums}
- Include effects: ${options.fx}

Please create complete, runnable Strudel code using proper syntax like:
- note() for melodies
- sound() for timbres
- stack() for layering
- Proper timing functions like slow(), fast()
- Effects like lpf(), room(), delay()

Make it musical and interesting!`,
                model: 'gpt-4'
            });
            
            let generatedCode = response.message;
            
            // Extract code from response
            if (generatedCode.includes('```')) {
                generatedCode = generatedCode.split('```')[1];
                if (generatedCode.startsWith('javascript') || generatedCode.startsWith('js')) {
                    generatedCode = generatedCode.substring(generatedCode.indexOf('\n') + 1);
                }
                generatedCode = generatedCode.split('```')[0];
            }
            
            const editor = window.querySelector('#strudel-code-editor');
            editor.value = generatedCode.trim();
            this.currentCode = generatedCode.trim();
            
            this.updateLineNumbers(window);
            this.scanCodeVariables(window);
            
            window.querySelector('#ai-generation-dialog').style.display = 'none';
            this.desktop.showNotification('🎵 Music generated successfully!', 'success');
            
        } catch (error) {
            this.desktop.showNotification('Failed to generate music: ' + error.message, 'error');
        }
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
        // Try to use real Strudel evaluation if available
        if (this.strudelEngine && this.strudelEngine !== this && typeof this.strudelEngine.evaluate === 'function') {
            try {
                return await this.strudelEngine.evaluate(code);
            } catch (error) {
                console.warn('⚠️ Strudel evaluation failed:', error);
            }
        }
        
        // Fallback: just log the code for now
        console.log('🎵 Evaluating Strudel code (fallback):', code);
        return Promise.resolve();
    }

    startStrudel() {
        console.log('🎵 Starting Strudel engine');
    }

    stopStrudel() {
        console.log('🎵 Stopping Strudel engine');
    }

    // Placeholder methods for remaining functionality
    tapTempo(window) { /* Implementation */ }
    record(window) { /* Implementation */ }
    enhanceWithAI(window) { /* Implementation */ }
    fixWithAI(window) { /* Implementation */ }
    newPattern(window) { /* Implementation */ }
    savePattern(window) { /* Implementation */ }
    exportAudio(window) { /* Implementation */ }
    autoSavePattern(window) { /* Implementation */ }
    generateAISuggestions(window) { /* Implementation */ }
    handleCodeKeyDown(window, e) { /* Implementation */ }
}

// Export with the expected name for app registration
export const StrudelAIDAWApp = StrudelAIDAW;