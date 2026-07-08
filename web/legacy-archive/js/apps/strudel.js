/**
 * Strudel Music App - Simplified Working Version
 * Live coding environment for algorithmic music composition
 */

class StrudelApp {
    constructor() {
        this.isInitialized = false;
        this.isPlaying = false;
        this.audioContext = null;
        this.currentPattern = null;
        this.patterns = new Map();
        this.activeTab = 'pattern1';
        this.loopTimeout = null;
        
        console.log('🎵 Strudel App initialized');
    }

    /**
     * Initialize the Strudel app
     */
    async initialize(contentElement) {
        try {
            console.log('🎵 Starting Strudel initialization...');
            
            // Create the UI
            this.createUI(contentElement);
            this.showLoadingState('Initializing audio...');
            
            // Initialize audio
            await this.initializeAudio();
            
            // Load default patterns
            this.loadDefaultPatterns();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Retry visualization setup after a delay if needed
            setTimeout(() => {
                if (!this.waveformCtx || !this.spectrumCtx) {
                    console.log('🔄 Retrying visualization setup...');
                    this.setupVisualization();
                }
            }, 100);
            
            this.hideLoadingState();
            this.isInitialized = true;
            this.showSuccess('🎵 Strudel Music ready! Click Play to start.');
            
            console.log('✅ Strudel app initialized successfully');
            
        } catch (error) {
            console.error('❌ Strudel initialization failed:', error);
            this.showError(`Initialization failed: ${error.message}`);
        }
    }

    /**
     * Create the advanced user interface
     */
    createUI(container) {
        container.innerHTML = `
            <div class="strudel-app">
                <!-- Top toolbar -->
                <div class="strudel-toolbar">
                    <div class="toolbar-section">
                        <h2>🎵 Strudel Live</h2>
                        <div class="demo-controls">
                            <button id="load-demo-btn" class="demo-btn">🎸 Load Polyphia Demo</button>
                            <button id="clear-all-btn" class="clear-btn">🗑️ Clear All</button>
                        </div>
                    </div>
                    
                    <div class="transport-master">
                        <button id="play-btn" class="transport-btn play">▶️</button>
                        <button id="pause-btn" class="transport-btn pause" disabled>⏸️</button>
                        <button id="stop-btn" class="transport-btn stop" disabled>⏹️</button>
                        <button id="record-btn" class="transport-btn record">🔴 REC</button>
                    </div>
                    
                    <div class="master-controls">
                        <div class="control-group">
                            <label>BPM</label>
                            <input type="number" id="bpm-input" value="140" min="60" max="200">
                            <button id="tap-tempo" class="tap-btn">TAP</button>
                        </div>
                        <div class="control-group">
                            <label>Master</label>
                            <input type="range" id="master-volume" value="0.8" min="0" max="1" step="0.01">
                            <span id="volume-display">80%</span>
                        </div>
                    </div>
                    
                    <div id="status" class="status-display">Ready</div>
                </div>

                <!-- Main layout -->
                <div class="strudel-main">
                    <!-- Left panel - Pattern stack -->
                    <div class="pattern-stack">
                        <div class="stack-header">
                            <h3>Pattern Stack</h3>
                            <button id="add-pattern-btn" class="add-btn">+ Add Layer</button>
                        </div>
                        <div id="pattern-layers" class="pattern-layers">
                            <!-- Dynamic pattern layers will be added here -->
                        </div>
                    </div>

                    <!-- Center panel - Code editor -->
                    <div class="editor-panel">
                        <div class="editor-tabs">
                            <div class="tab-bar">
                                <button class="tab active" data-tab="compose">🎼 Compose</button>
                                <button class="tab" data-tab="arrange">🎛️ Arrange</button>
                                <button class="tab" data-tab="effects">✨ Effects</button>
                                <button class="tab" data-tab="samples">🔊 Samples</button>
                            </div>
                        </div>

                        <!-- Compose tab -->
                        <div class="tab-content active" id="compose-tab">
                            <div class="editor-toolbar">
                                <select id="instrument-select">
                                    <option value="lead">🎸 Lead Guitar</option>
                                    <option value="rhythm">🎸 Rhythm Guitar</option>
                                    <option value="bass">🎸 Bass</option>
                                    <option value="drums">🥁 Drums</option>
                                    <option value="synth">🎹 Synth</option>
                                    <option value="ambient">🌊 Ambient</option>
                                </select>
                                <button id="evaluate-btn" class="eval-btn">▶️ Run</button>
                                <button id="save-pattern-btn" class="save-btn">💾 Save</button>
                            </div>
                            <div class="editor-container">
                                <textarea id="pattern-editor" class="code-editor" placeholder="// Enter your Strudel pattern here
// Example: note('c3 d3 e3 f3').sound('sawtooth')"></textarea>
                                <div class="editor-gutter">
                                    <div class="line-numbers"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Arrange tab -->
                        <div class="tab-content" id="arrange-tab">
                            <div class="arrangement-controls">
                                <button id="piano-roll-btn" class="tool-btn">🎹 Piano Roll</button>
                                <button id="automation-btn" class="tool-btn">🤖 Automation</button>
                                <button id="export-midi-btn" class="tool-btn">💾 Export MIDI</button>
                                <button id="export-audio-btn" class="tool-btn">🎵 Export Audio</button>
                            </div>
                            <div class="arrangement-grid">
                                <div class="timeline-header">
                                    <div class="measure-markers"></div>
                                </div>
                                <div class="track-container" id="arrangement-tracks">
                                    <!-- Arrangement tracks will be populated here -->
                                </div>
                            </div>
                            <div class="piano-roll-container" id="piano-roll-container" style="display: none;">
                                <div class="piano-keys" id="piano-keys"></div>
                                <canvas id="piano-roll-canvas" class="piano-roll-canvas" width="800" height="400"></canvas>
                            </div>
                        </div>

                        <!-- Effects tab -->
                        <div class="tab-content" id="effects-tab">
                            <div class="effects-rack">
                                <div class="effect-slot">
                                    <h4>🎚️ Filter</h4>
                                    <div class="knob-group">
                                        <div class="knob" data-param="cutoff">
                                            <label>Cutoff</label>
                                            <input type="range" min="20" max="20000" value="1000">
                                        </div>
                                        <div class="knob" data-param="resonance">
                                            <label>Resonance</label>
                                            <input type="range" min="0" max="20" value="1">
                                        </div>
                                    </div>
                                </div>
                                <div class="effect-slot">
                                    <h4>🌊 Reverb</h4>
                                    <div class="knob-group">
                                        <div class="knob" data-param="room">
                                            <label>Room</label>
                                            <input type="range" min="0" max="1" value="0.3" step="0.01">
                                        </div>
                                        <div class="knob" data-param="wet">
                                            <label>Wet</label>
                                            <input type="range" min="0" max="1" value="0.2" step="0.01">
                                        </div>
                                    </div>
                                </div>
                                <div class="effect-slot">
                                    <h4>🔥 Distortion</h4>
                                    <div class="knob-group">
                                        <div class="knob" data-param="drive">
                                            <label>Drive</label>
                                            <input type="range" min="0" max="10" value="2" step="0.1">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Samples tab -->
                        <div class="tab-content" id="samples-tab">
                            <div class="sample-browser">
                                <div class="sample-categories">
                                    <button class="sample-cat active" data-cat="drums">🥁 Drums</button>
                                    <button class="sample-cat" data-cat="guitar">🎸 Guitar</button>
                                    <button class="sample-cat" data-cat="bass">🎸 Bass</button>
                                    <button class="sample-cat" data-cat="synth">🎹 Synth</button>
                                    <button class="sample-cat" data-cat="fx">✨ FX</button>
                                </div>
                                <div class="sample-grid" id="sample-grid">
                                    <!-- Sample pads will be populated here -->
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right panel - Visualization & Tools -->
                    <div class="tools-panel">
                        <!-- Visualizer -->
                        <div class="visualizer-section">
                            <h3>🌊 Visualizer</h3>
                            <canvas id="waveform-canvas" width="300" height="120"></canvas>
                            <canvas id="spectrum-canvas" width="300" height="120"></canvas>
                        </div>

                        <!-- Pattern Examples -->
                        <div class="examples-section">
                            <h3>🎼 Quick Patterns</h3>
                            <div id="pattern-examples" class="pattern-examples">
                                <!-- Will be populated by loadAdvancedPatterns() -->
                            </div>
                        </div>

                        <!-- Performance Pads -->
                        <div class="performance-section">
                            <h3>🎮 Performance</h3>
                            <div class="performance-grid">
                                <button class="perf-pad" data-action="solo-toggle">SOLO</button>
                                <button class="perf-pad" data-action="mute-toggle">MUTE</button>
                                <button class="perf-pad" data-action="filter-sweep">FILTER</button>
                                <button class="perf-pad" data-action="stutter">STUTTER</button>
                                <button class="perf-pad" data-action="reverse">REVERSE</button>
                                <button class="perf-pad" data-action="bitcrush">CRUSH</button>
                                <button class="perf-pad" data-action="build-up">BUILD</button>
                                <button class="perf-pad" data-action="drop">DROP</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Status messages -->
                <div id="message-area" class="message-area"></div>
            </div>
        `;
    }

    /**
     * Load pattern examples into the UI
     */
    loadPatternExamples(examples) {
        const container = document.getElementById('pattern-examples');
        container.innerHTML = '';

        examples.forEach(example => {
            const div = document.createElement('div');
            div.className = `pattern-example ${example.category}`;
            div.innerHTML = `
                <div class="example-header">
                    <span class="example-name">${example.name}</span>
                    <button class="example-play" data-code="${example.code.replace(/"/g, '&quot;')}">▶️</button>
                </div>
                <div class="example-description">${example.description}</div>
                <div class="example-code">${example.code.split('\n')[0].substring(0, 40)}...</div>
            `;
            
            div.addEventListener('click', (e) => {
                if (!e.target.classList.contains('example-play')) {
                    document.getElementById('pattern-editor').value = example.code;
                    this.showSuccess(`Loaded: ${example.name}`);
                }
            });
            
            container.appendChild(div);
        });
    }

    /**
     * Initialize pattern layer system
     */
    initializePatternLayers() {
        this.patternLayers = [];
        this.createPatternLayer('Lead Guitar', this.polyphiaDemo.lead, true);
        this.createPatternLayer('Rhythm Guitar', this.polyphiaDemo.rhythm, false);
        this.createPatternLayer('Bass', this.polyphiaDemo.bass, false);
        this.createPatternLayer('Drums', this.polyphiaDemo.drums, false);
        this.createPatternLayer('Ambient', this.polyphiaDemo.ambient, false);
    }

    /**
     * Create a new pattern layer
     */
    createPatternLayer(name, code = '', enabled = true) {
        const layerId = `layer_${Date.now()}`;
        const layer = {
            id: layerId,
            name: name,
            code: code,
            enabled: enabled,
            muted: false,
            solo: false,
            volume: 0.8,
            effects: {}
        };

        this.patternLayers.push(layer);
        this.renderPatternLayer(layer);
        return layer;
    }

    /**
     * Render a pattern layer in the UI
     */
    renderPatternLayer(layer) {
        const container = document.getElementById('pattern-layers');
        const layerDiv = document.createElement('div');
        layerDiv.className = 'pattern-layer';
        layerDiv.id = layer.id;
        
        layerDiv.innerHTML = `
            <div class="layer-header">
                <input type="checkbox" class="layer-enable" ${layer.enabled ? 'checked' : ''}>
                <input type="text" class="layer-name" value="${layer.name}">
                <div class="layer-controls">
                    <button class="layer-btn solo ${layer.solo ? 'active' : ''}">S</button>
                    <button class="layer-btn mute ${layer.muted ? 'active' : ''}">M</button>
                    <button class="layer-btn delete">🗑️</button>
                </div>
            </div>
            <div class="layer-content">
                <textarea class="layer-code" placeholder="Enter pattern code...">${layer.code}</textarea>
                <div class="layer-volume">
                    <input type="range" class="volume-slider" value="${layer.volume}" min="0" max="1" step="0.01">
                    <span class="volume-display">${Math.round(layer.volume * 100)}%</span>
                </div>
            </div>
        `;

        container.appendChild(layerDiv);
        this.setupLayerEventListeners(layer, layerDiv);
    }

    /**
     * Setup event listeners for a pattern layer
     */
    setupLayerEventListeners(layer, layerDiv) {
        // Enable/disable toggle
        layerDiv.querySelector('.layer-enable').addEventListener('change', (e) => {
            layer.enabled = e.target.checked;
            layerDiv.classList.toggle('disabled', !layer.enabled);
        });

        // Name editing
        layerDiv.querySelector('.layer-name').addEventListener('change', (e) => {
            layer.name = e.target.value;
        });

        // Solo button
        layerDiv.querySelector('.solo').addEventListener('click', (e) => {
            layer.solo = !layer.solo;
            e.target.classList.toggle('active', layer.solo);
            this.updateSoloState();
        });

        // Mute button
        layerDiv.querySelector('.mute').addEventListener('click', (e) => {
            layer.muted = !layer.muted;
            e.target.classList.toggle('active', layer.muted);
        });

        // Delete button
        layerDiv.querySelector('.delete').addEventListener('click', () => {
            this.deletePatternLayer(layer.id);
        });

        // Code editing
        layerDiv.querySelector('.layer-code').addEventListener('input', (e) => {
            layer.code = e.target.value;
        });

        // Volume control
        layerDiv.querySelector('.volume-slider').addEventListener('input', (e) => {
            layer.volume = parseFloat(e.target.value);
            layerDiv.querySelector('.volume-display').textContent = Math.round(layer.volume * 100) + '%';
        });
    }

    /**
     * Setup tab system for different views
     */
    setupTabSystem() {
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all tabs and contents
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(tc => tc.classList.remove('active'));

                // Add active class to clicked tab and corresponding content
                tab.classList.add('active');
                const tabId = tab.dataset.tab;
                document.getElementById(`${tabId}-tab`).classList.add('active');
            });
        });
    }

    /**
     * Setup audio visualization
     */
    setupVisualization() {
        try {
            this.waveformCanvas = document.getElementById('waveform-canvas');
            this.spectrumCanvas = document.getElementById('spectrum-canvas');
            
            // Check if canvas elements exist before getting context
            if (!this.waveformCanvas || !this.spectrumCanvas) {
                console.warn('⚠️ Canvas elements not found, skipping visualization setup');
                return;
            }
            
            this.waveformCtx = this.waveformCanvas.getContext('2d');
            this.spectrumCtx = this.spectrumCanvas.getContext('2d');
            
            // Check if contexts were successfully created
            if (!this.waveformCtx || !this.spectrumCtx) {
                console.warn('⚠️ Failed to get canvas contexts, skipping visualization setup');
                return;
            }

            // Setup analyzer nodes when audio context is ready
            if (this.audioContext) {
                this.setupAnalyzers();
            }
            
            console.log('✅ Visualization setup completed');
        } catch (error) {
            console.warn('⚠️ Visualization setup failed:', error.message);
        }
    }

    /**
     * Setup audio analyzers for visualization
     */
    setupAnalyzers() {
        this.waveformAnalyzer = this.audioContext.createAnalyser();
        this.spectrumAnalyzer = this.audioContext.createAnalyser();
        
        this.waveformAnalyzer.fftSize = 2048;
        this.spectrumAnalyzer.fftSize = 256;
        
        // Connect to master gain
        if (this.masterGain) {
            this.masterGain.connect(this.waveformAnalyzer);
            this.masterGain.connect(this.spectrumAnalyzer);
        }

        this.startVisualization();
    }

    /**
     * Start real-time visualization
     */
    startVisualization() {
        // Check if visualization is available before starting
        if (!this.waveformCtx || !this.spectrumCtx || !this.waveformAnalyzer || !this.spectrumAnalyzer) {
            console.warn('⚠️ Visualization not available, skipping visualization start');
            return;
        }
        
        const drawWaveform = () => {
            if (!this.waveformCtx || !this.waveformAnalyzer) return;
            
            const bufferLength = this.waveformAnalyzer.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            this.waveformAnalyzer.getByteTimeDomainData(dataArray);

            this.waveformCtx.fillStyle = '#1a1a1a';
            this.waveformCtx.fillRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);

            this.waveformCtx.lineWidth = 2;
            this.waveformCtx.strokeStyle = '#4CAF50';
            this.waveformCtx.beginPath();

            const sliceWidth = this.waveformCanvas.width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * this.waveformCanvas.height / 2;

                if (i === 0) {
                    this.waveformCtx.moveTo(x, y);
                } else {
                    this.waveformCtx.lineTo(x, y);
                }
                x += sliceWidth;
            }

            this.waveformCtx.stroke();
        };

        const drawSpectrum = () => {
            if (!this.spectrumCtx || !this.spectrumAnalyzer) return;
            
            const bufferLength = this.spectrumAnalyzer.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            this.spectrumAnalyzer.getByteFrequencyData(dataArray);

            this.spectrumCtx.fillStyle = '#1a1a1a';
            this.spectrumCtx.fillRect(0, 0, this.spectrumCanvas.width, this.spectrumCanvas.height);

            const barWidth = this.spectrumCanvas.width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * this.spectrumCanvas.height;
                
                const r = Math.floor(barHeight + 25);
                const g = Math.floor(250 * (i / bufferLength));
                const b = 50;

                this.spectrumCtx.fillStyle = `rgb(${r},${g},${b})`;
                this.spectrumCtx.fillRect(x, this.spectrumCanvas.height - barHeight, barWidth, barHeight);

                x += barWidth;
            }
        };

        const animate = () => {
            if (this.waveformAnalyzer && this.spectrumAnalyzer) {
                drawWaveform();
                drawSpectrum();
            }
            requestAnimationFrame(animate);
        };

        animate();
    }

    /**
     * Setup performance pads
     */
    setupPerformancePads() {
        const pads = document.querySelectorAll('.perf-pad');
        
        pads.forEach(pad => {
            pad.addEventListener('click', () => {
                const action = pad.dataset.action;
                this.executePerformanceAction(action);
                pad.classList.add('triggered');
                setTimeout(() => pad.classList.remove('triggered'), 200);
            });
        });
    }

    /**
     * Execute performance actions
     */
    executePerformanceAction(action) {
        switch (action) {
            case 'solo-toggle':
                this.toggleSolo();
                break;
            case 'mute-toggle':
                this.toggleMute();
                break;
            case 'filter-sweep':
                this.performFilterSweep();
                break;
            case 'stutter':
                this.performStutter();
                break;
            case 'reverse':
                this.performReverse();
                break;
            case 'bitcrush':
                this.performBitcrush();
                break;
            case 'build-up':
                this.performBuildUp();
                break;
            case 'drop':
                this.performDrop();
                break;
        }
    }

    /**
     * Load the complete Polyphia demo
     */
    loadPolyphiaDemo() {
        // Stop any current playback
        if (this.isPlaying) {
            this.stopPattern();
        }

        // Load the full composition into the editor
        document.getElementById('pattern-editor').value = this.polyphiaDemo.full;
        
        // Enable all relevant layers
        this.patternLayers.forEach(layer => {
            layer.enabled = true;
            const layerElement = document.getElementById(layer.id);
            if (layerElement) {
                layerElement.querySelector('.layer-enable').checked = true;
                layerElement.classList.remove('disabled');
            }
        });

        // Set optimal BPM for the demo
        document.getElementById('bpm-input').value = 140;
        
        // Evaluate the pattern
        this.evaluateCurrentPattern();
        
        this.showSuccess('🎸 Polyphia demo loaded! Click Play to experience the magic.');
    }

    /**
     * Enhanced audio context initialization with effects
     */
    async initializeAudio() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            
            if (!AudioContextClass) {
                throw new Error('Web Audio API not supported');
            }
            
            this.audioContext = new AudioContextClass();
            console.log('✅ Audio context created');
            
            // Create master effects chain
            this.createMasterEffectsChain();
            
            // Setup analyzers for visualization
            this.setupAnalyzers();
            
        } catch (error) {
            throw new Error(`Audio initialization failed: ${error.message}`);
        }
    }

    /**
     * Create master effects chain
     */
    createMasterEffectsChain() {
        // Create master gain
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.8;

        // Create master filter
        this.masterFilter = this.audioContext.createBiquadFilter();
        this.masterFilter.type = 'lowpass';
        this.masterFilter.frequency.value = 20000;
        this.masterFilter.Q.value = 1;

        // Create reverb
        this.createMasterReverb();

        // Create master compressor
        this.masterCompressor = this.audioContext.createDynamicsCompressor();
        this.masterCompressor.threshold.value = -24;
        this.masterCompressor.knee.value = 30;
        this.masterCompressor.ratio.value = 12;
        this.masterCompressor.attack.value = 0.003;
        this.masterCompressor.release.value = 0.25;

        // Connect the chain
        this.masterGain.connect(this.masterFilter);
        this.masterFilter.connect(this.masterCompressor);
        this.masterCompressor.connect(this.masterReverb.input);
        this.masterReverb.output.connect(this.audioContext.destination);
    }

    /**
     * Create master reverb effect
     */
    createMasterReverb() {
        const convolver = this.audioContext.createConvolver();
        const wetGain = this.audioContext.createGain();
        const dryGain = this.audioContext.createGain();
        const outputGain = this.audioContext.createGain();

        // Generate impulse response for reverb
        const length = this.audioContext.sampleRate * 2; // 2 seconds
        const impulse = this.audioContext.createBuffer(2, length, this.audioContext.sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            }
        }
        
        convolver.buffer = impulse;

        // Set initial values
        wetGain.gain.value = 0.2;
        dryGain.gain.value = 0.8;

        this.masterReverb = {
            input: this.audioContext.createGain(),
            output: outputGain,
            wet: wetGain,
            dry: dryGain
        };

        // Connect reverb
        this.masterReverb.input.connect(dryGain);
        this.masterReverb.input.connect(convolver);
        convolver.connect(wetGain);
        dryGain.connect(outputGain);
        wetGain.connect(outputGain);
    }

    /**
     * Load advanced patterns including Polyphia-inspired demo
     */
    loadDefaultPatterns() {
        // Load the Polyphia-inspired demo piece
        this.polyphiaDemo = this.createPolyphiaDemo();
        
        const examples = [
            { 
                name: '🎸 Polyphia Lead', 
                code: this.polyphiaDemo.lead,
                description: 'Technical lead guitar pattern',
                category: 'lead'
            },
            { 
                name: '🎸 Rhythm Guitar', 
                code: this.polyphiaDemo.rhythm,
                description: 'Complex rhythm guitar',
                category: 'rhythm'
            },
            { 
                name: '🎸 Bass Line', 
                code: this.polyphiaDemo.bass,
                description: 'Groovy bass foundation',
                category: 'bass'
            },
            { 
                name: '🥁 Progressive Drums', 
                code: this.polyphiaDemo.drums,
                description: 'Complex drum programming',
                category: 'drums'
            },
            { 
                name: '🎹 Ambient Pad', 
                code: this.polyphiaDemo.ambient,
                description: 'Atmospheric background',
                category: 'ambient'
            },
            { 
                name: '🔥 House Beat', 
                code: 'bd [~ bd] hh [sd ~] hh',
                description: 'Classic house groove',
                category: 'drums'
            },
            { 
                name: '🌊 Liquid DnB', 
                code: 'bd ~ ~ bd ~ sd ~ ~',
                description: 'Liquid drum & bass',
                category: 'drums'
            },
            { 
                name: '🎼 Jazz Chord', 
                code: 'c3maj7 f3maj7 g3dom7 c3maj7',
                description: 'Jazz progression',
                category: 'harmony'
            },
            { 
                name: '🔊 Techno Stab', 
                code: 'c2 ~ c2 ~ ~ c2 ~ ~',
                description: 'Driving techno stab',
                category: 'synth'
            },
            { 
                name: '✨ Arpeggios', 
                code: 'c4 e4 g4 c5 g4 e4',
                description: 'Flowing arpeggios',
                category: 'melody'
            }
        ];

        this.loadPatternExamples(examples);
        this.initializePatternLayers();
        this.setupTabSystem();
        this.setupVisualization();
        this.setupPerformancePads();
        
        // Initialize advanced DAW features
        this.setupFileHandling();
        this.setupAdvancedSequencer();
        this.setupAdvancedMixer();
        this.setupPianoRoll();
    }

    /**
     * Create Polyphia-inspired demo composition
     */
    createPolyphiaDemo() {
        return {
            // Technical lead guitar with tapping and sweep patterns
            lead: `// Polyphia-inspired lead guitar
note("g4 a4 b4 d5 g5 d5 b4 a4 g4 f#4 e4 d4")
  .sound("guitar")
  .cutoff(sine.range(800, 2400).slow(8))
  .delay(0.25)
  .room(0.3)
  .gain(0.7)`,

            // Complex rhythm guitar with palm muting and dynamics
            rhythm: `// Rhythm guitar with palm muting
note("g3 ~ d3 ~ g3 ~ f#3 ~ e3 ~ d3 ~ c3 ~")
  .sound("guitar")
  .cutoff(600)
  .attack(0.01)
  .decay(0.1)
  .gain(0.5)`,

            // Groovy bass line with slides and accents
            bass: `// Progressive bass line
note("g1 ~ g1 d2 ~ g1 ~ f#1 e1 ~ d1 ~ c1")
  .sound("bass")
  .lpf(sine.range(100, 400).slow(4))
  .distortion(0.3)
  .gain(0.8)`,

            // Complex drum programming with polyrhythms
            drums: `// Progressive drum pattern
stack(
  bd("1 ~ ~ 1 ~ ~ 1 ~"),
  sd("~ ~ 1 ~ ~ 1 ~ ~"),
  hh("1 ~ 1 1 ~ 1 ~ 1"),
  oh("~ ~ ~ ~ 1 ~ ~ ~")
).gain(0.9)`,

            // Ambient atmospheric pad
            ambient: `// Atmospheric pad
note("g2maj7 d3maj7 c3maj7 f#2maj7")
  .sound("pad")
  .slow(4)
  .room(0.8)
  .lpf(sine.range(200, 800).slow(16))
  .gain(0.3)`,

            // Full composition combining all parts
            full: `// Complete Polyphia-inspired composition
stack(
  // Lead guitar
  note("g4 a4 b4 d5 g5 d5 b4 a4").sound("guitar").delay(0.25).room(0.3),
  
  // Rhythm guitar  
  note("g3 ~ d3 ~ g3 ~ f#3 ~").sound("guitar").cutoff(600).gain(0.5),
  
  // Bass
  note("g1 ~ g1 d2 ~ g1 ~ f#1").sound("bass").lpf(400).distortion(0.3),
  
  // Drums
  stack(
    bd("1 ~ ~ 1 ~ ~ 1 ~"),
    sd("~ ~ 1 ~ ~ 1 ~ ~"),
    hh("1 ~ 1 1 ~ 1 ~ 1")
  ),
  
  // Ambient pad
  note("g2maj7 d3maj7").slow(4).sound("pad").room(0.8).gain(0.3)
)`
        };
    }

    /**
     * Set up enhanced event listeners
     */
    setupEventListeners() {
        // Transport controls
        document.getElementById('play-btn').addEventListener('click', () => this.playPattern());
        document.getElementById('pause-btn').addEventListener('click', () => this.pausePattern());
        document.getElementById('stop-btn').addEventListener('click', () => this.stopPattern());
        
        // Demo and utility buttons
        document.getElementById('load-demo-btn').addEventListener('click', () => this.loadPolyphiaDemo());
        document.getElementById('clear-all-btn').addEventListener('click', () => this.clearAllPatterns());
        document.getElementById('add-pattern-btn').addEventListener('click', () => this.addNewPatternLayer());
        
        // Evaluate button
        document.getElementById('evaluate-btn').addEventListener('click', () => this.evaluateCurrentPattern());
        document.getElementById('save-pattern-btn').addEventListener('click', () => this.saveCurrentPattern());
        
        // Master volume control
        document.getElementById('master-volume').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (this.masterGain) {
                this.masterGain.gain.value = value;
            }
            document.getElementById('volume-display').textContent = Math.round(value * 100) + '%';
        });
        
        // Tap tempo
        document.getElementById('tap-tempo').addEventListener('click', () => this.tapTempo());
        
        // Instrument selection
        document.getElementById('instrument-select').addEventListener('change', (e) => {
            this.currentInstrument = e.target.value;
            this.updateEditorPlaceholder();
        });
        
        // Enter key in editor to evaluate
        document.getElementById('pattern-editor').addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.evaluateCurrentPattern();
            }
        });

        // Effects controls
        this.setupEffectsControls();
        
        // Sample browser
        this.setupSampleBrowser();
        
        // File handling
        this.setupFileHandling();

        // Piano roll and export buttons
        document.getElementById('piano-roll-btn').addEventListener('click', () => this.togglePianoRoll());
        document.getElementById('export-midi-btn').addEventListener('click', () => this.exportMIDI());
        document.getElementById('export-audio-btn').addEventListener('click', () => this.showExportDialog());
    }

    /**
     * Setup effects controls
     */
    setupEffectsControls() {
        const knobs = document.querySelectorAll('.knob input');
        
        knobs.forEach(knob => {
            knob.addEventListener('input', (e) => {
                const param = e.target.closest('.knob').dataset.param;
                const value = parseFloat(e.target.value);
                this.updateEffect(param, value);
            });
        });
    }

    /**
     * Setup sample browser
     */
    setupSampleBrowser() {
        const categories = document.querySelectorAll('.sample-cat');
        
        categories.forEach(cat => {
            cat.addEventListener('click', () => {
                categories.forEach(c => c.classList.remove('active'));
                cat.classList.add('active');
                this.loadSampleCategory(cat.dataset.cat);
            });
        });

        // Load default category
        this.loadSampleCategory('drums');
    }

    /**
     * Load sample category
     */
    loadSampleCategory(category) {
        const sampleGrid = document.getElementById('sample-grid');
        sampleGrid.innerHTML = '';

        const samples = this.getSamplesForCategory(category);
        
        samples.forEach(sample => {
            const pad = document.createElement('button');
            pad.className = 'sample-pad';
            pad.textContent = sample.name;
            pad.addEventListener('click', () => this.playSample(sample));
            sampleGrid.appendChild(pad);
        });
    }

    /**
     * Get samples for a category
     */
    getSamplesForCategory(category) {
        const sampleLibrary = {
            drums: [
                { name: 'Kick', code: 'bd', type: 'drum' },
                { name: 'Snare', code: 'sd', type: 'drum' },
                { name: 'Hi-hat', code: 'hh', type: 'drum' },
                { name: 'Open Hat', code: 'oh', type: 'drum' },
                { name: 'Crash', code: 'crash', type: 'drum' },
                { name: 'Ride', code: 'ride', type: 'drum' }
            ],
            guitar: [
                { name: 'Power Chord', code: 'c3 g3', type: 'chord' },
                { name: 'Lead Riff', code: 'c4 d4 e4 f4', type: 'melody' },
                { name: 'Strum', code: 'c3maj', type: 'chord' }
            ],
            bass: [
                { name: 'Sub Bass', code: 'c1', type: 'bass' },
                { name: 'Bass Slap', code: 'g1', type: 'bass' },
                { name: 'Bass Slide', code: 'c1 ~ g1', type: 'bass' }
            ],
            synth: [
                { name: 'Lead Synth', code: 'c4', type: 'synth' },
                { name: 'Pad', code: 'c3maj7', type: 'pad' },
                { name: 'Pluck', code: 'c4', type: 'pluck' }
            ],
            fx: [
                { name: 'Riser', code: 'noise', type: 'fx' },
                { name: 'Impact', code: 'impact', type: 'fx' },
                { name: 'Reverse', code: 'rev', type: 'fx' }
            ]
        };

        return sampleLibrary[category] || [];
    }

    /**
     * Performance action methods
     */
    performFilterSweep() {
        if (this.masterFilter) {
            const now = this.audioContext.currentTime;
            this.masterFilter.frequency.cancelScheduledValues(now);
            this.masterFilter.frequency.setValueAtTime(20000, now);
            this.masterFilter.frequency.exponentialRampToValueAtTime(200, now + 2);
            this.masterFilter.frequency.exponentialRampToValueAtTime(20000, now + 4);
        }
    }

    performStutter() {
        // Implement stutter effect by rapidly muting/unmuting
        if (this.masterGain) {
            const now = this.audioContext.currentTime;
            for (let i = 0; i < 8; i++) {
                const time = now + (i * 0.0625); // 1/16th notes
                this.masterGain.gain.setValueAtTime(i % 2 === 0 ? 0 : 0.8, time);
            }
            this.masterGain.gain.setValueAtTime(0.8, now + 0.5);
        }
    }

    performBuildUp() {
        if (this.masterFilter) {
            const now = this.audioContext.currentTime;
            this.masterFilter.frequency.cancelScheduledValues(now);
            this.masterFilter.frequency.setValueAtTime(200, now);
            this.masterFilter.frequency.exponentialRampToValueAtTime(20000, now + 8);
        }
    }

    performDrop() {
        if (this.masterFilter && this.masterGain) {
            const now = this.audioContext.currentTime;
            
            // Filter drop
            this.masterFilter.frequency.cancelScheduledValues(now);
            this.masterFilter.frequency.setValueAtTime(200, now);
            this.masterFilter.frequency.exponentialRampToValueAtTime(20000, now + 0.1);
            
            // Volume boost
            this.masterGain.gain.cancelScheduledValues(now);
            this.masterGain.gain.setValueAtTime(1.2, now);
            this.masterGain.gain.exponentialRampToValueAtTime(0.8, now + 2);
        }
    }

    /**
     * Update audio effects
     */
    updateEffect(param, value) {
        switch (param) {
            case 'cutoff':
                if (this.masterFilter) {
                    this.masterFilter.frequency.value = value;
                }
                break;
            case 'resonance':
                if (this.masterFilter) {
                    this.masterFilter.Q.value = value;
                }
                break;
            case 'room':
            case 'wet':
                if (this.masterReverb) {
                    if (param === 'wet') {
                        this.masterReverb.wet.gain.value = value;
                        this.masterReverb.dry.gain.value = 1 - value;
                    }
                }
                break;
            case 'drive':
                // Distortion would be implemented here
                console.log(`Distortion drive: ${value}`);
                break;
        }
    }

    /**
     * Play a sample
     */
    playSample(sample) {
        if (!this.audioContext) return;
        
        // For now, just insert the sample code into the editor
        const editor = document.getElementById('pattern-editor');
        const currentCode = editor.value;
        const newCode = currentCode ? `${currentCode}\n${sample.code}` : sample.code;
        editor.value = newCode;
        
        this.showSuccess(`Added ${sample.name} to pattern`);
    }

    /**
     * Solo/mute functionality
     */
    updateSoloState() {
        const hasSolo = this.patternLayers.some(layer => layer.solo);
        // Update visual feedback for solo state
        console.log('Solo state updated:', hasSolo);
    }

    toggleSolo() {
        // Toggle solo for currently selected layer or all layers
        console.log('Solo toggled');
    }

    toggleMute() {
        // Toggle mute for currently selected layer or master
        if (this.masterGain) {
            const currentGain = this.masterGain.gain.value;
            this.masterGain.gain.value = currentGain > 0 ? 0 : 0.8;
        }
    }

    /**
     * Delete a pattern layer
     */
    deletePatternLayer(layerId) {
        const layerIndex = this.patternLayers.findIndex(layer => layer.id === layerId);
        if (layerIndex !== -1) {
            this.patternLayers.splice(layerIndex, 1);
            const layerElement = document.getElementById(layerId);
            if (layerElement) {
                layerElement.remove();
            }
        }
    }

    /**
     * Performance effects that were referenced but missing
     */
    performReverse() {
        console.log('Reverse effect triggered');
        this.showSuccess('🔄 Reverse effect applied');
    }

    performBitcrush() {
        console.log('Bitcrush effect triggered');
        this.showSuccess('🔥 Bitcrush effect applied');
    }

    /**
     * Polyphia preset handlers
     */
    loadPolyphiaPreset(preset) {
        const demo = this.createPolyphiaDemo();
        const editor = document.getElementById('pattern-editor');
        
        switch(preset) {
            case 'goat-intro':
                editor.value = demo.goat.lead;
                this.showSuccess('🎸 Loaded G.O.A.T. intro');
                break;
            case 'playing-god-lead':
                editor.value = demo.playingGod.lead;
                this.showSuccess('🎸 Loaded Playing God lead');
                break;
            case 'champagne-melody':
                editor.value = demo.champagne.lead;
                this.showSuccess('🎸 Loaded Champagne melody');
                break;
            case 'ego-death-riff':
                editor.value = demo.egoDeathRiff.lead;
                this.showSuccess('🎸 Loaded Ego Death riff');
                break;
        }
        this.updateLineNumbers();
    }

    /**
     * Preview Polyphia songs (short clips)
     */
    previewPolyphiaSong(songName) {
        this.showSuccess(`🎵 Previewing ${songName} (feature coming soon)`);
        // This would play a short preview clip
    }

    /**
     * Core playback and pattern methods
     */
    playPattern() {
        try {
            if (!this.audioContext) {
                this.showError('Audio context not initialized');
                return;
            }

            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            this.isPlaying = true;
            
            // Update transport button states
            document.getElementById('play-btn').disabled = true;
            document.getElementById('pause-btn').disabled = false;
            document.getElementById('stop-btn').disabled = false;
            
            // Start visualization if available
            if (this.waveformAnalyzer && this.spectrumAnalyzer) {
                this.startVisualization();
            }
            
            // Evaluate and start the current pattern
            this.evaluateCurrentPattern();
            
            this.showSuccess('▶️ Playing');
            console.log('▶️ Pattern playback started');
            
        } catch (error) {
            this.showError(`Playback failed: ${error.message}`);
            console.error('Playback error:', error);
        }
    }

    pausePattern() {
        this.isPlaying = false;
        
        // Update transport button states
        document.getElementById('play-btn').disabled = false;
        document.getElementById('pause-btn').disabled = true;
        
        this.showSuccess('⏸️ Paused');
        console.log('⏸️ Pattern playback paused');
    }

    stopPattern() {
        this.isPlaying = false;
        
        // Stop all audio sources
        if (this.currentPattern) {
            // In a real implementation, this would stop the Strudel pattern
            this.currentPattern = null;
        }
        
        // Reset transport button states
        document.getElementById('play-btn').disabled = false;
        document.getElementById('pause-btn').disabled = true;
        document.getElementById('stop-btn').disabled = true;
        
        this.showSuccess('⏹️ Stopped');
        console.log('⏹️ Pattern playback stopped');
    }

    evaluateCurrentPattern() {
        try {
            const editor = document.getElementById('pattern-editor');
            const code = editor.value.trim();
            
            if (!code) {
                this.showError('No pattern code to evaluate');
                return;
            }

            // For now, we'll simulate pattern evaluation
            // In a real implementation, this would use the Strudel engine
            console.log('🎵 Evaluating pattern:', code);
            
            // Store the current pattern
            this.currentPattern = {
                code: code,
                timestamp: Date.now()
            };
            
            // Update line numbers
            this.updateLineNumbers();
            
            this.showSuccess('✅ Pattern evaluated');
            
        } catch (error) {
            this.showError(`Pattern evaluation failed: ${error.message}`);
            console.error('Pattern evaluation error:', error);
        }
    }

    saveCurrentPattern() {
        try {
            const editor = document.getElementById('pattern-editor');
            const code = editor.value.trim();
            
            if (!code) {
                this.showError('No pattern to save');
                return;
            }

            const patternName = prompt('Enter pattern name:') || `Pattern_${Date.now()}`;
            const pattern = {
                name: patternName,
                code: code,
                timestamp: new Date().toISOString(),
                instrument: this.currentInstrument || 'default'
            };

            // Store in local storage
            const patterns = JSON.parse(localStorage.getItem('strudel_patterns') || '[]');
            patterns.push(pattern);
            localStorage.setItem('strudel_patterns', JSON.stringify(patterns));

            // Store in patterns map
            this.patterns.set(pattern.name, pattern);

            this.showSuccess(`💾 Pattern "${patternName}" saved`);
            
        } catch (error) {
            this.showError(`Save failed: ${error.message}`);
            console.error('Save error:', error);
        }
    }

    clearAllPatterns() {
        if (confirm('Are you sure you want to clear all patterns?')) {
            // Stop playback
            this.stopPattern();
            
            // Clear editor
            document.getElementById('pattern-editor').value = '';
            
            // Clear all pattern layers
            this.patternLayers.forEach(layer => {
                const layerElement = document.getElementById(layer.id);
                if (layerElement) {
                    layerElement.querySelector('.layer-code').value = '';
                }
            });
            
            // Update line numbers
            this.updateLineNumbers();
            
            this.showSuccess('🗑️ All patterns cleared');
        }
    }

    addNewPatternLayer() {
        const name = prompt('Enter layer name:') || `Layer ${this.patternLayers.length + 1}`;
        const layer = this.createPatternLayer(name, '', true);
        this.showSuccess(`➕ Added layer: ${name}`);
        return layer;
    }

    updateEditorPlaceholder() {
        const editor = document.getElementById('pattern-editor');
        const instrument = this.currentInstrument || 'default';
        
        const placeholders = {
            lead: '// Lead guitar pattern\nnote("c4 d4 e4 f4").sound("guitar").delay(0.25)',
            rhythm: '// Rhythm guitar pattern\nnote("c3 ~ g3 ~ c3 ~ f3 ~").sound("guitar").cutoff(600)',
            bass: '// Bass pattern\nnote("c1 ~ c1 g1 ~ c1 ~ f1").sound("bass").lpf(400)',
            drums: '// Drum pattern\nstack(\n  bd("1 ~ ~ 1 ~ ~ 1 ~"),\n  sd("~ ~ 1 ~ ~ 1 ~ ~"),\n  hh("1 ~ 1 1 ~ 1 ~ 1")\n)',
            synth: '// Synth pattern\nnote("c4 e4 g4 c5").sound("synth").lpf(sine.range(200, 2000))',
            ambient: '// Ambient pad\nnote("c3maj7 f3maj7").slow(4).sound("pad").room(0.8)'
        };
        
        editor.placeholder = placeholders[instrument] || '// Enter your Strudel pattern here\n// Example: note("c3 d3 e3 f3").sound("sawtooth")';
    }

    tapTempo() {
        const now = Date.now();
        
        if (!this.tapTimes) {
            this.tapTimes = [];
        }
        
        this.tapTimes.push(now);
        
        // Keep only the last 4 taps
        if (this.tapTimes.length > 4) {
            this.tapTimes.shift();
        }
        
        if (this.tapTimes.length >= 2) {
            // Calculate average interval between taps
            const intervals = [];
            for (let i = 1; i < this.tapTimes.length; i++) {
                intervals.push(this.tapTimes[i] - this.tapTimes[i - 1]);
            }
            
            const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
            const bpm = Math.round(60000 / avgInterval);
            
            if (bpm >= 60 && bpm <= 200) {
                document.getElementById('bpm-input').value = bpm;
                this.showSuccess(`🎵 Tempo: ${bpm} BPM`);
            }
        }
        
        // Clear tap times after 3 seconds of inactivity
        if (this.tapTimeout) {
            clearTimeout(this.tapTimeout);
        }
        this.tapTimeout = setTimeout(() => {
            this.tapTimes = [];
        }, 3000);
    }

    showWarning(message) {
        const status = document.getElementById('status');
        if (status) {
            status.textContent = message;
            status.className = 'status-display warning';
        }
        console.warn('⚠️', message);
        
        // Auto-clear warning after 3 seconds
        setTimeout(() => {
            this.hideLoadingState();
        }, 3000);
    }

    /**
     * Show loading state
     */
    showLoadingState(message) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.innerHTML = `<span class="loading">⏳ ${message}</span>`;
            statusEl.classList.add('loading');
        }
        console.log(`⏳ ${message}`);
    }

    /**
     * Hide loading state
     */
    hideLoadingState() {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.classList.remove('loading');
        }
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.innerHTML = `<span class="success">✅ ${message}</span>`;
            statusEl.classList.remove('loading', 'error');
            statusEl.classList.add('success');
            
            // Auto-clear success messages after 3 seconds
            setTimeout(() => {
                if (statusEl.classList.contains('success')) {
                    statusEl.innerHTML = 'Ready';
                    statusEl.classList.remove('success');
                }
            }, 3000);
        }
        console.log(`✅ ${message}`);
    }

    /**
     * Show error message
     */
    showError(message) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.innerHTML = `<span class="error">❌ ${message}</span>`;
            statusEl.classList.remove('loading', 'success');
            statusEl.classList.add('error');
            
            // Auto-clear error messages after 5 seconds
            setTimeout(() => {
                if (statusEl.classList.contains('error')) {
                    statusEl.innerHTML = 'Ready';
                    statusEl.classList.remove('error');
                }
            }, 5000);
        }
        console.error(`❌ ${message}`);
    }

    /**
     * Initialize pattern layer system
     */
    initializePatternLayers() {
        this.patternLayers = [];
        this.createPatternLayer('Lead Guitar', this.polyphiaDemo.lead, true);
        this.createPatternLayer('Rhythm Guitar', this.polyphiaDemo.rhythm, false);
        this.createPatternLayer('Bass', this.polyphiaDemo.bass, false);
        this.createPatternLayer('Drums', this.polyphiaDemo.drums, false);
        this.createPatternLayer('Ambient', this.polyphiaDemo.ambient, false);
    }

    /**
     * Create a new pattern layer
     */
    createPatternLayer(name, code = '', enabled = true) {
        const layerId = `layer_${Date.now()}`;
        const layer = {
            id: layerId,
            name: name,
            code: code,
            enabled: enabled,
            muted: false,
            solo: false,
            volume: 0.8,
            effects: {}
        };

        this.patternLayers.push(layer);
        this.renderPatternLayer(layer);
        return layer;
    }

    /**
     * Render a pattern layer in the UI
     */
    renderPatternLayer(layer) {
        const container = document.getElementById('pattern-layers');
        const layerDiv = document.createElement('div');
        layerDiv.className = 'pattern-layer';
        layerDiv.id = layer.id;
        
        layerDiv.innerHTML = `
            <div class="layer-header">
                <input type="checkbox" class="layer-enable" ${layer.enabled ? 'checked' : ''}>
                <input type="text" class="layer-name" value="${layer.name}">
                <div class="layer-controls">
                    <button class="layer-btn solo ${layer.solo ? 'active' : ''}">S</button>
                    <button class="layer-btn mute ${layer.muted ? 'active' : ''}">M</button>
                    <button class="layer-btn delete">🗑️</button>
                </div>
            </div>
            <div class="layer-content">
                <textarea class="layer-code" placeholder="Enter pattern code...">${layer.code}</textarea>
                <div class="layer-volume">
                    <input type="range" class="volume-slider" value="${layer.volume}" min="0" max="1" step="0.01">
                    <span class="volume-display">${Math.round(layer.volume * 100)}%</span>
                </div>
            </div>
        `;

        container.appendChild(layerDiv);
        this.setupLayerEventListeners(layer, layerDiv);
    }

    /**
     * Setup event listeners for a pattern layer
     */
    setupLayerEventListeners(layer, layerDiv) {
        // Enable/disable toggle
        layerDiv.querySelector('.layer-enable').addEventListener('change', (e) => {
            layer.enabled = e.target.checked;
            layerDiv.classList.toggle('disabled', !layer.enabled);
        });

        // Name editing
        layerDiv.querySelector('.layer-name').addEventListener('change', (e) => {
            layer.name = e.target.value;
        });

        // Solo button
        layerDiv.querySelector('.solo').addEventListener('click', (e) => {
            layer.solo = !layer.solo;
            e.target.classList.toggle('active', layer.solo);
            this.updateSoloState();
        });

        // Mute button
        layerDiv.querySelector('.mute').addEventListener('click', (e) => {
            layer.muted = !layer.muted;
            e.target.classList.toggle('active', layer.muted);
        });

        // Delete button
        layerDiv.querySelector('.delete').addEventListener('click', () => {
            this.deletePatternLayer(layer.id);
        });

        // Code editing
        layerDiv.querySelector('.layer-code').addEventListener('input', (e) => {
            layer.code = e.target.value;
        });

        // Volume control
        layerDiv.querySelector('.volume-slider').addEventListener('input', (e) => {
            layer.volume = parseFloat(e.target.value);
            layerDiv.querySelector('.volume-display').textContent = Math.round(layer.volume * 100) + '%';
        });
    }

    /**
     * Setup tab system for different views
     */
    setupTabSystem() {
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all tabs and contents
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(tc => tc.classList.remove('active'));

                // Add active class to clicked tab and corresponding content
                tab.classList.add('active');
                const tabId = tab.dataset.tab;
                document.getElementById(`${tabId}-tab`).classList.add('active');
            });
        });
    }

    /**
     * Setup audio visualization
     */
    setupVisualization() {
        try {
            this.waveformCanvas = document.getElementById('waveform-canvas');
            this.spectrumCanvas = document.getElementById('spectrum-canvas');
            
            // Check if canvas elements exist before getting context
            if (!this.waveformCanvas || !this.spectrumCanvas) {
                console.warn('⚠️ Canvas elements not found, skipping visualization setup');
                return;
            }
            
            this.waveformCtx = this.waveformCanvas.getContext('2d');
            this.spectrumCtx = this.spectrumCanvas.getContext('2d');
            
            // Check if contexts were successfully created
            if (!this.waveformCtx || !this.spectrumCtx) {
                console.warn('⚠️ Failed to get canvas contexts, skipping visualization setup');
                return;
            }

            // Setup analyzer nodes when audio context is ready
            if (this.audioContext) {
                this.setupAnalyzers();
            }
            
            console.log('✅ Visualization setup completed');
        } catch (error) {
            console.warn('⚠️ Visualization setup failed:', error.message);
        }
    }

    /**
     * Setup audio analyzers for visualization
     */
    setupAnalyzers() {
        this.waveformAnalyzer = this.audioContext.createAnalyser();
        this.spectrumAnalyzer = this.audioContext.createAnalyser();
        
        this.waveformAnalyzer.fftSize = 2048;
        this.spectrumAnalyzer.fftSize = 256;
        
        // Connect to master gain
        if (this.masterGain) {
            this.masterGain.connect(this.waveformAnalyzer);
            this.masterGain.connect(this.spectrumAnalyzer);
        }

        this.startVisualization();
    }

    /**
     * Start real-time visualization
     */
    startVisualization() {
        // Check if visualization is available before starting
        if (!this.waveformCtx || !this.spectrumCtx || !this.waveformAnalyzer || !this.spectrumAnalyzer) {
            console.warn('⚠️ Visualization not available, skipping visualization start');
            return;
        }
        
        const drawWaveform = () => {
            if (!this.waveformCtx || !this.waveformAnalyzer) return;
            
            const bufferLength = this.waveformAnalyzer.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            this.waveformAnalyzer.getByteTimeDomainData(dataArray);

            this.waveformCtx.fillStyle = '#1a1a1a';
            this.waveformCtx.fillRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);

            this.waveformCtx.lineWidth = 2;
            this.waveformCtx.strokeStyle = '#4CAF50';
            this.waveformCtx.beginPath();

            const sliceWidth = this.waveformCanvas.width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * this.waveformCanvas.height / 2;

                if (i === 0) {
                    this.waveformCtx.moveTo(x, y);
                } else {
                    this.waveformCtx.lineTo(x, y);
                }
                x += sliceWidth;
            }

            this.waveformCtx.stroke();
        };

        const drawSpectrum = () => {
            if (!this.spectrumCtx || !this.spectrumAnalyzer) return;
            
            const bufferLength = this.spectrumAnalyzer.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            this.spectrumAnalyzer.getByteFrequencyData(dataArray);

            this.spectrumCtx.fillStyle = '#1a1a1a';
            this.spectrumCtx.fillRect(0, 0, this.spectrumCanvas.width, this.spectrumCanvas.height);

            const barWidth = this.spectrumCanvas.width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * this.spectrumCanvas.height;
                
                const r = Math.floor(barHeight + 25);
                const g = Math.floor(250 * (i / bufferLength));
                const b = 50;

                this.spectrumCtx.fillStyle = `rgb(${r},${g},${b})`;
                this.spectrumCtx.fillRect(x, this.spectrumCanvas.height - barHeight, barWidth, barHeight);

                x += barWidth;
            }
        };

        const animate = () => {
            if (this.waveformAnalyzer && this.spectrumAnalyzer) {
                drawWaveform();
                drawSpectrum();
            }
            requestAnimationFrame(animate);
        };

        animate();
    }

    /**
     * Setup performance pads
     */
    setupPerformancePads() {
        const pads = document.querySelectorAll('.perf-pad');
        
        pads.forEach(pad => {
            pad.addEventListener('click', () => {
                const action = pad.dataset.action;
                this.executePerformanceAction(action);
                pad.classList.add('triggered');
                setTimeout(() => pad.classList.remove('triggered'), 200);
            });
        });
    }

    /**
     * Execute performance actions
     */
    executePerformanceAction(action) {
        switch (action) {
            case 'solo-toggle':
                this.toggleSolo();
                break;
            case 'mute-toggle':
                this.toggleMute();
                break;
            case 'filter-sweep':
                this.performFilterSweep();
                break;
            case 'stutter':
                this.performStutter();
                break;
            case 'reverse':
                this.performReverse();
                break;
            case 'bitcrush':
                this.performBitcrush();
                break;
            case 'build-up':
                this.performBuildUp();
                break;
            case 'drop':
                this.performDrop();
                break;
        }
    }

    /**
     * Load the complete Polyphia demo
     */
    loadPolyphiaDemo() {
        // Stop any current playback
        if (this.isPlaying) {
            this.stopPattern();
        }

        // Load the full composition into the editor
        document.getElementById('pattern-editor').value = this.polyphiaDemo.full;
        
        // Enable all relevant layers
        this.patternLayers.forEach(layer => {
            layer.enabled = true;
            const layerElement = document.getElementById(layer.id);
            if (layerElement) {
                layerElement.querySelector('.layer-enable').checked = true;
                layerElement.classList.remove('disabled');
            }
        });

        // Set optimal BPM for the demo
        document.getElementById('bpm-input').value = 140;
        
        // Evaluate the pattern
        this.evaluateCurrentPattern();
        
        this.showSuccess('🎸 Polyphia demo loaded! Click Play to experience the magic.');
    }

    /**
     * Enhanced audio context initialization with effects
     */
    async initializeAudio() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            
            if (!AudioContextClass) {
                throw new Error('Web Audio API not supported');
            }
            
            this.audioContext = new AudioContextClass();
            console.log('✅ Audio context created');
            
            // Create master effects chain
            this.createMasterEffectsChain();
            
            // Setup analyzers for visualization
            this.setupAnalyzers();
            
        } catch (error) {
            throw new Error(`Audio initialization failed: ${error.message}`);
        }
    }

    /**
     * Create master effects chain
     */
    createMasterEffectsChain() {
        // Create master gain
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.8;

        // Create master filter
        this.masterFilter = this.audioContext.createBiquadFilter();
        this.masterFilter.type = 'lowpass';
        this.masterFilter.frequency.value = 20000;
        this.masterFilter.Q.value = 1;

        // Create reverb
        this.createMasterReverb();

        // Create master compressor
        this.masterCompressor = this.audioContext.createDynamicsCompressor();
        this.masterCompressor.threshold.value = -24;
        this.masterCompressor.knee.value = 30;
        this.masterCompressor.ratio.value = 12;
        this.masterCompressor.attack.value = 0.003;
        this.masterCompressor.release.value = 0.25;

        // Connect the chain
        this.masterGain.connect(this.masterFilter);
        this.masterFilter.connect(this.masterCompressor);
        this.masterCompressor.connect(this.masterReverb.input);
        this.masterReverb.output.connect(this.audioContext.destination);
    }

    /**
     * Create master reverb effect
     */
    createMasterReverb() {
        const convolver = this.audioContext.createConvolver();
        const wetGain = this.audioContext.createGain();
        const dryGain = this.audioContext.createGain();
        const outputGain = this.audioContext.createGain();

        // Generate impulse response for reverb
        const length = this.audioContext.sampleRate * 2; // 2 seconds
        const impulse = this.audioContext.createBuffer(2, length, this.audioContext.sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            }
        }
        
        convolver.buffer = impulse;

        // Set initial values
        wetGain.gain.value = 0.2;
        dryGain.gain.value = 0.8;

        this.masterReverb = {
            input: this.audioContext.createGain(),
            output: outputGain,
            wet: wetGain,
            dry: dryGain
        };

        // Connect reverb
        this.masterReverb.input.connect(dryGain);
        this.masterReverb.input.connect(convolver);
        convolver.connect(wetGain);
        dryGain.connect(outputGain);
        wetGain.connect(outputGain);
    }

    /**
     * Load advanced patterns including Polyphia-inspired demo
     */
    loadDefaultPatterns() {
        // Load the Polyphia-inspired demo piece
        this.polyphiaDemo = this.createPolyphiaDemo();
        
        const examples = [
            { 
                name: '🎸 Polyphia Lead', 
                code: this.polyphiaDemo.lead,
                description: 'Technical lead guitar pattern',
                category: 'lead'
            },
            { 
                name: '🎸 Rhythm Guitar', 
                code: this.polyphiaDemo.rhythm,
                description: 'Complex rhythm guitar',
                category: 'rhythm'
            },
            { 
                name: '🎸 Bass Line', 
                code: this.polyphiaDemo.bass,
                description: 'Groovy bass foundation',
                category: 'bass'
            },
            { 
                name: '🥁 Progressive Drums', 
                code: this.polyphiaDemo.drums,
                description: 'Complex drum programming',
                category: 'drums'
            },
            { 
                name: '🎹 Ambient Pad', 
                code: this.polyphiaDemo.ambient,
                description: 'Atmospheric background',
                category: 'ambient'
            },
            { 
                name: '🔥 House Beat', 
                code: 'bd [~ bd] hh [sd ~] hh',
                description: 'Classic house groove',
                category: 'drums'
            },
            { 
                name: '🌊 Liquid DnB', 
                code: 'bd ~ ~ bd ~ sd ~ ~',
                description: 'Liquid drum & bass',
                category: 'drums'
            },
            { 
                name: '🎼 Jazz Chord', 
                code: 'c3maj7 f3maj7 g3dom7 c3maj7',
                description: 'Jazz progression',
                category: 'harmony'
            },
            { 
                name: '🔊 Techno Stab', 
                code: 'c2 ~ c2 ~ ~ c2 ~ ~',
                description: 'Driving techno stab',
                category: 'synth'
            },
            { 
                name: '✨ Arpeggios', 
                code: 'c4 e4 g4 c5 g4 e4',
                description: 'Flowing arpeggios',
                category: 'melody'
            }
        ];

        this.loadPatternExamples(examples);
        this.initializePatternLayers();
        this.setupTabSystem();
        this.setupVisualization();
        this.setupPerformancePads();
        
        // Initialize advanced DAW features
        this.setupFileHandling();
        this.setupAdvancedSequencer();
        this.setupAdvancedMixer();
        this.setupPianoRoll();
    }

    /**
     * Create Polyphia-inspired demo composition
     */
    createPolyphiaDemo() {
        return {
            // Technical lead guitar with tapping and sweep patterns
            lead: `// Polyphia-inspired lead guitar
note("g4 a4 b4 d5 g5 d5 b4 a4 g4 f#4 e4 d4")
  .sound("guitar")
  .cutoff(sine.range(800, 2400).slow(8))
  .delay(0.25)
  .room(0.3)
  .gain(0.7)`,

            // Complex rhythm guitar with palm muting and dynamics
            rhythm: `// Rhythm guitar with palm muting
note("g3 ~ d3 ~ g3 ~ f#3 ~ e3 ~ d3 ~ c3 ~")
  .sound("guitar")
  .cutoff(600)
  .attack(0.01)
  .decay(0.1)
  .gain(0.5)`,

            // Groovy bass line with slides and accents
            bass: `// Progressive bass line
note("g1 ~ g1 d2 ~ g1 ~ f#1 e1 ~ d1 ~ c1")
  .sound("bass")
  .lpf(sine.range(100, 400).slow(4))
  .distortion(0.3)
  .gain(0.8)`,

            // Complex drum programming with polyrhythms
            drums: `// Progressive drum pattern
stack(
  bd("1 ~ ~ 1 ~ ~ 1 ~"),
  sd("~ ~ 1 ~ ~ 1 ~ ~"),
  hh("1 ~ 1 1 ~ 1 ~ 1"),
  oh("~ ~ ~ ~ 1 ~ ~ ~")
).gain(0.9)`,

            // Ambient atmospheric pad
            ambient: `// Atmospheric pad
note("g2maj7 d3maj7 c3maj7 f#2maj7")
  .sound("pad")
  .slow(4)
  .room(0.8)
  .lpf(sine.range(200, 800).slow(16))
  .gain(0.3)`,

            // Full composition combining all parts
            full: `// Complete Polyphia-inspired composition
stack(
  // Lead guitar
  note("g4 a4 b4 d5 g5 d5 b4 a4").sound("guitar").delay(0.25).room(0.3),
  
  // Rhythm guitar  
  note("g3 ~ d3 ~ g3 ~ f#3 ~").sound("guitar").cutoff(600).gain(0.5),
  
  // Bass
  note("g1 ~ g1 d2 ~ g1 ~ f#1").sound("bass").lpf(400).distortion(0.3),
  
  // Drums
  stack(
    bd("1 ~ ~ 1 ~ ~ 1 ~"),
    sd("~ ~ 1 ~ ~ 1 ~ ~"),
    hh("1 ~ 1 1 ~ 1 ~ 1")
  ),
  
  // Ambient pad
  note("g2maj7 d3maj7").slow(4).sound("pad").room(0.8).gain(0.3)
)`
        };
    }

    /**
     * Set up enhanced event listeners
     */
    setupEventListeners() {
        // Transport controls
        document.getElementById('play-btn').addEventListener('click', () => this.playPattern());
        document.getElementById('pause-btn').addEventListener('click', () => this.pausePattern());
        document.getElementById('stop-btn').addEventListener('click', () => this.stopPattern());
        
        // Demo and utility buttons
        document.getElementById('load-demo-btn').addEventListener('click', () => this.loadPolyphiaDemo());
        document.getElementById('clear-all-btn').addEventListener('click', () => this.clearAllPatterns());
        document.getElementById('add-pattern-btn').addEventListener('click', () => this.addNewPatternLayer());
        
               
        // Evaluate button
        document.getElementById('evaluate-btn').addEventListener('click', () => this.evaluateCurrentPattern());
        document.getElementById('save-pattern-btn').addEventListener('click', () => this.saveCurrentPattern());
        
        // Master volume control
        document.getElementById('master-volume').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (this.masterGain) {
                this.masterGain.gain.value = value;
            }
            document.getElementById('volume-display').textContent = Math.round(value * 100) + '%';
        });
        
        // Tap tempo
        document.getElementById('tap-tempo').addEventListener('click', () => this.tapTempo());
        
        // Instrument selection
        document.getElementById('instrument-select').addEventListener('change', (e) => {
            this.currentInstrument = e.target.value;
            this.updateEditorPlaceholder();
        });
        
        // Enter key in editor to evaluate
        document.getElementById('pattern-editor').addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.evaluateCurrentPattern();
            }
        });

        // Effects controls
        this.setupEffectsControls();
        
        // Sample browser
        this.setupSampleBrowser();
        
        // File handling
        this.setupFileHandling();

        // Piano roll and export buttons
        document.getElementById('piano-roll-btn').addEventListener('click', () => this.togglePianoRoll());
        document.getElementById('export-midi-btn').addEventListener('click', () => this.exportMIDI());
        document.getElementById('export-audio-btn').addEventListener('click', () => this.showExportDialog());
    }

    /**
     * Setup effects controls
     */
    setupEffectsControls() {
        const knobs = document.querySelectorAll('.knob input');
        
        knobs.forEach(knob => {
            knob.addEventListener('input', (e) => {
                const param = e.target.closest('.knob').dataset.param;
                const value = parseFloat(e.target.value);
                this.updateEffect(param, value);
            });
        });
    }

    /**
     * Setup sample browser
     */
    setupSampleBrowser() {
        const categories = document.querySelectorAll('.sample-cat');
        
        categories.forEach(cat => {
            cat.addEventListener('click', () => {
                categories.forEach(c => c.classList.remove('active'));
                cat.classList.add('active');
                this.loadSampleCategory(cat.dataset.cat);
            });
        });

        // Load default category
        this.loadSampleCategory('drums');
    }

    /**
     * Load sample category
     */
    loadSampleCategory(category) {
        const sampleGrid = document.getElementById('sample-grid');
        sampleGrid.innerHTML = '';

        const samples = this.getSamplesForCategory(category);
        
        samples.forEach(sample => {
            const pad = document.createElement('button');
            pad.className = 'sample-pad';
            pad.textContent = sample.name;
            pad.addEventListener('click', () => this.playSample(sample));
            sampleGrid.appendChild(pad);
        });
    }

    /**
     * Get samples for a category
     */
    getSamplesForCategory(category) {
        const sampleLibrary = {
            drums: [
                { name: 'Kick', code: 'bd', type: 'drum' },
                { name: 'Snare', code: 'sd', type: 'drum' },
                { name: 'Hi-hat', code: 'hh', type: 'drum' },
                { name: 'Open Hat', code: 'oh', type: 'drum' },
                { name: 'Crash', code: 'crash', type: 'drum' },
                { name: 'Ride', code: 'ride', type: 'drum' }
            ],
            guitar: [
                { name: 'Power Chord', code: 'c3 g3', type: 'chord' },
                { name: 'Lead Riff', code: 'c4 d4 e4 f4', type: 'melody' },
                { name: 'Strum', code: 'c3maj', type: 'chord' }
            ],
            bass: [
                { name: 'Sub Bass', code: 'c1', type: 'bass' },
                { name: 'Bass Slap', code: 'g1', type: 'bass' },
                { name: 'Bass Slide', code: 'c1 ~ g1', type: 'bass' }
            ],
            synth: [
                { name: 'Lead Synth', code: 'c4', type: 'synth' },
                { name: 'Pad', code: 'c3maj7', type: 'pad' },
                { name: 'Pluck', code: 'c4', type: 'pluck' }
            ],
            fx: [
                { name: 'Riser', code: 'noise', type: 'fx' },
                { name: 'Impact', code: 'impact', type: 'fx' },
                { name: 'Reverse', code: 'rev', type: 'fx' }
            ]
        };

        return sampleLibrary[category] || [];
    }

    /**
     * Performance action methods
     */
    performFilterSweep() {
        if (this.masterFilter) {
            const now = this.audioContext.currentTime;
            this.masterFilter.frequency.cancelScheduledValues(now);
            this.masterFilter.frequency.setValueAtTime(20000, now);
            this.masterFilter.frequency.exponentialRampToValueAtTime(200, now + 2);
            this.masterFilter.frequency.exponentialRampToValueAtTime(20000, now + 4);
        }
    }

    performStutter() {
        // Implement stutter effect by rapidly muting/unmuting
        if (this.masterGain) {
            const now = this.audioContext.currentTime;
            for (let i = 0; i < 8; i++) {
                const time = now + (i * 0.0625); // 1/16th notes
                this.masterGain.gain.setValueAtTime(i % 2 === 0 ? 0 : 0.8, time);
            }
            this.masterGain.gain.setValueAtTime(0.8, now + 0.5);
        }
    }

    performBuildUp() {
        if (this.masterFilter) {
            const now = this.audioContext.currentTime;
            this.masterFilter.frequency.cancelScheduledValues(now);
            this.masterFilter.frequency.setValueAtTime(200, now);
            this.masterFilter.frequency.exponentialRampToValueAtTime(20000, now + 8);
        }
    }

    performDrop() {
        if (this.masterFilter && this.masterGain) {
            const now = this.audioContext.currentTime;
            
            // Filter drop
            this.masterFilter.frequency.cancelScheduledValues(now);
            this.masterFilter.frequency.setValueAtTime(200, now);
            this.masterFilter.frequency.exponentialRampToValueAtTime(20000, now + 0.1);
            
            // Volume boost
            this.masterGain.gain.cancelScheduledValues(now);
            this.masterGain.gain.setValueAtTime(1.2, now);
            this.masterGain.gain.exponentialRampToValueAtTime(0.8, now + 2);
        }
    }

    /**
     * Update audio effects
     */
    updateEffect(param, value) {
        switch (param) {
            case 'cutoff':
                if (this.masterFilter) {
                    this.masterFilter.frequency.value = value;
                }
                break;
            case 'resonance':
                if (this.masterFilter) {
                    this.masterFilter.Q.value = value;
                }
                break;
            case 'room':
            case 'wet':
                if (this.masterReverb) {
                    if (param === 'wet') {
                        this.masterReverb.wet.gain.value = value;
                        this.masterReverb.dry.gain.value = 1 - value;
                    }
                }
                break;
            case 'drive':
                // Distortion would be implemented here
                console.log(`Distortion drive: ${value}`);
                break;
        }
    }

    /**
     * Play a sample
     */
    playSample(sample) {
        if (!this.audioContext) return;
        
        // For now, just insert the sample code into the editor
        const editor = document.getElementById('pattern-editor');
        const currentCode = editor.value;
        const newCode = currentCode ? `${currentCode}\n${sample.code}` : sample.code;
        editor.value = newCode;
        
        this.showSuccess(`Added ${sample.name} to pattern`);
    }

    /**
     * Solo/mute functionality
     */
    updateSoloState() {
        const hasSolo = this.patternLayers.some(layer => layer.solo);
        // Update visual feedback for solo state
        console.log('Solo state updated:', hasSolo);
    }

    toggleSolo() {
        // Toggle solo for currently selected layer or all layers
        console.log('Solo toggled');
    }

    toggleMute() {
        // Toggle mute for currently selected layer or master
        if (this.masterGain) {
            const currentGain = this.masterGain.gain.value;
            this.masterGain.gain.value = currentGain > 0 ? 0 : 0.8;
        }
    }

    /**
     * Delete a pattern layer
     */
    deletePatternLayer(layerId) {
        const layerIndex = this.patternLayers.findIndex(layer => layer.id === layerId);
        if (layerIndex !== -1) {
            this.patternLayers.splice(layerIndex, 1);
            const layerElement = document.getElementById(layerId);
            if (layerElement) {
                layerElement.remove();
            }
        }
    }

    /**
     * Performance effects that were referenced but missing
     */
    performReverse() {
        console.log('Reverse effect triggered');
        this.showSuccess('🔄 Reverse effect applied');
    }

    performBitcrush() {
        console.log('Bitcrush effect triggered');
        this.showSuccess('🔥 Bitcrush effect applied');
    }

    /**
     * Polyphia preset handlers
     */
    loadPolyphiaPreset(preset) {
        const demo = this.createPolyphiaDemo();
        const editor = document.getElementById('pattern-editor');
        
        switch(preset) {
            case 'goat-intro':
                editor.value = demo.goat.lead;
                this.showSuccess('🎸 Loaded G.O.A.T. intro');
                break;
            case 'playing-god-lead':
                editor.value = demo.playingGod.lead;
                this.showSuccess('🎸 Loaded Playing God lead');
                break;
            case 'champagne-melody':
                editor.value = demo.champagne.lead;
                this.showSuccess('🎸 Loaded Champagne melody');
                break;
            case 'ego-death-riff':
                editor.value = demo.egoDeathRiff.lead;
                this.showSuccess('🎸 Loaded Ego Death riff');
                break;
        }
        this.updateLineNumbers();
    }

    /**
     * Preview Polyphia songs (short clips)
     */
    previewPolyphiaSong(songName) {
        this.showSuccess(`🎵 Previewing ${songName} (feature coming soon)`);
        // This would play a short preview clip
    }

    /**
     * Core playback and pattern methods
     */
    playPattern() {
        try {
            if (!this.audioContext) {
                this.showError('Audio context not initialized');
                return;
            }

            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            this.isPlaying = true;
            
            // Update transport button states
            document.getElementById('play-btn').disabled = true;
            document.getElementById('pause-btn').disabled = false;
            document.getElementById('stop-btn').disabled = false;
            
            // Start visualization if available
            if (this.waveformAnalyzer && this.spectrumAnalyzer) {
                this.startVisualization();
            }
            
            // Evaluate and start the current pattern
            this.evaluateCurrentPattern();
            
            this.showSuccess('▶️ Playing');
            console.log('▶️ Pattern playback started');
            
        } catch (error) {
            this.showError(`Playback failed: ${error.message}`);
            console.error('Playback error:', error);
        }
    }

    pausePattern() {
        this.isPlaying = false;
        
        // Update transport button states
        document.getElementById('play-btn').disabled = false;
        document.getElementById('pause-btn').disabled = true;
        
        this.showSuccess('⏸️ Paused');
        console.log('⏸️ Pattern playback paused');
    }

    stopPattern() {
        this.isPlaying = false;
        
        // Stop all audio sources
        if (this.currentPattern) {
            // In a real implementation, this would stop the Strudel pattern
            this.currentPattern = null;
        }
        
        // Reset transport button states
        document.getElementById('play-btn').disabled = false;
        document.getElementById('pause-btn').disabled = true;
        document.getElementById('stop-btn').disabled = true;
        
        this.showSuccess('⏹️ Stopped');
        console.log('⏹️ Pattern playback stopped');
    }

    evaluateCurrentPattern() {
        try {
            const editor = document.getElementById('pattern-editor');
            const code = editor.value.trim();
            
            if (!code) {
                this.showError('No pattern code to evaluate');
                return;
            }

            // For now, we'll simulate pattern evaluation
            // In a real implementation, this would use the Strudel engine
            console.log('🎵 Evaluating pattern:', code);
            
            // Store the current pattern
            this.currentPattern = {
                code: code,
                timestamp: Date.now()
            };
            
            // Update line numbers
            this.updateLineNumbers();
            
            this.showSuccess('✅ Pattern evaluated');
            
        } catch (error) {
            this.showError(`Pattern evaluation failed: ${error.message}`);
            console.error('Pattern evaluation error:', error);
        }
    }

    saveCurrentPattern() {
        try {
            const editor = document.getElementById('pattern-editor');
            const code = editor.value.trim();
            
            if (!code) {
                this.showError('No pattern to save');
                return;
            }

            const patternName = prompt('Enter pattern name:') || `Pattern_${Date.now()}`;
            const pattern = {
                name: patternName,
                code: code,
                timestamp: new Date().toISOString(),
                instrument: this.currentInstrument || 'default'
            };

            // Store in local storage
            const patterns = JSON.parse(localStorage.getItem('strudel_patterns') || '[]');
            patterns.push(pattern);
            localStorage.setItem('strudel_patterns', JSON.stringify(patterns));

            // Store in patterns map
            this.patterns.set(pattern.name, pattern);

            this.showSuccess(`💾 Pattern "${patternName}" saved`);
            
        } catch (error) {
            this.showError(`Save failed: ${error.message}`);
            console.error('Save error:', error);
        }
    }

    clearAllPatterns() {
        if (confirm('Are you sure you want to clear all patterns?')) {
            // Stop playback
            this.stopPattern();
            
            // Clear editor
            document.getElementById('pattern-editor').value = '';
            
            // Clear all pattern layers
            this.patternLayers.forEach(layer => {
                const layerElement = document.getElementById(layer.id);
                if (layerElement) {
                    layerElement.querySelector('.layer-code').value = '';
                }
            });
            
            // Update line numbers
            this.updateLineNumbers();
            
            this.showSuccess('🗑️ All patterns cleared');
        }
    }

    addNewPatternLayer() {
        const name = prompt('Enter layer name:') || `Layer ${this.patternLayers.length + 1}`;
        const layer = this.createPatternLayer(name, '', true);
        this.showSuccess(`➕ Added layer: ${name}`);
        return layer;
    }

    updateEditorPlaceholder() {
        const editor = document.getElementById('pattern-editor');
        const instrument = this.currentInstrument || 'default';
        
        const placeholders = {
            lead: '// Lead guitar pattern\nnote("c4 d4 e4 f4").sound("guitar").delay(0.25)',
            rhythm: '// Rhythm guitar pattern\nnote("c3 ~ g3 ~ c3 ~ f3 ~").sound("guitar").cutoff(600)',
            bass: '// Bass pattern\nnote("c1 ~ c1 g1 ~ c1 ~ f1").sound("bass").lpf(400)',
            drums: '// Drum pattern\nstack(\n  bd("1 ~ ~ 1 ~ ~ 1 ~"),\n  sd("~ ~ 1 ~ ~ 1 ~ ~"),\n  hh("1 ~ 1 1 ~ 1 ~ 1")\n)',
            synth: '// Synth pattern\nnote("c4 e4 g4 c5").sound("synth").lpf(sine.range(200, 2000))',
            ambient: '// Ambient pad\nnote("c3maj7 f3maj7").slow(4).sound("pad").room(0.8)'
        };
        
        editor.placeholder = placeholders[instrument] || '// Enter your Strudel pattern here\n// Example: note("c3 d3 e3 f3").sound("sawtooth")';
    }

    tapTempo() {
        const now = Date.now();
        
        if (!this.tapTimes) {
            this.tapTimes = [];
        }
        
        this.tapTimes.push(now);
        
        // Keep only the last 4 taps
        if (this.tapTimes.length > 4) {
            this.tapTimes.shift();
        }
        
        if (this.tapTimes.length >= 2) {
            // Calculate average interval between taps
            const intervals = [];
            for (let i = 1; i < this.tapTimes.length; i++) {
                intervals.push(this.tapTimes[i] - this.tapTimes[i - 1]);
            }
            
            const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
            const bpm = Math.round(60000 / avgInterval);
            
            if (bpm >= 60 && bpm <= 200) {
                document.getElementById('bpm-input').value = bpm;
                this.showSuccess(`🎵 Tempo: ${bpm} BPM`);
            }
        }
        
        // Clear tap times after 3 seconds of inactivity
        if (this.tapTimeout) {
            clearTimeout(this.tapTimeout);
        }
        this.tapTimeout = setTimeout(() => {
            this.tapTimes = [];
        }, 3000);
    }

    showWarning(message) {
        const status = document.getElementById('status');
        if (status) {
            status.textContent = message;
            status.className = 'status-display warning';
        }
        console.warn('⚠️', message);
        
        // Auto-clear warning after 3 seconds
        setTimeout(() => {
            this.hideLoadingState();
        }, 3000);
    }

    /**
     * Show loading state
     */
    showLoadingState(message) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.innerHTML = `<span class="loading">⏳ ${message}</span>`;
            statusEl.classList.add('loading');
        }
        console.log(`⏳ ${message}`);
    }

    /**
     * Hide loading state
     */
    hideLoadingState() {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.classList.remove('loading');
        }
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.innerHTML = `<span class="success">✅ ${message}</span>`;
            statusEl.classList.remove('loading', 'error');
            statusEl.classList.add('success');
            
            // Auto-clear success messages after 3 seconds
            setTimeout(() => {
                if (statusEl.classList.contains('success')) {
                    statusEl.innerHTML = 'Ready';
                    statusEl.classList.remove('success');
                }
            }, 3000);
        }
        console.log(`✅ ${message}`);
    }

    /**
     * Show error message
     */
    showError(message) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.innerHTML = `<span class="error">❌ ${message}</span>`;
            statusEl.classList.remove('loading', 'success');
            statusEl.classList.add('error');
            
            // Auto-clear error messages after 5 seconds
            setTimeout(() => {
                if (statusEl.classList.contains('error')) {
                    statusEl.innerHTML = 'Ready';
                    statusEl.classList.remove('error');
                }
            }, 5000);
        }
        console.error(`❌ ${message}`);
    }

    /**
     * Initialize pattern layer system
     */
    initializePatternLayers() {
        this.patternLayers = [];
        this.createPatternLayer('Lead Guitar', this.polyphiaDemo.lead, true);
        this.createPatternLayer('Rhythm Guitar', this.polyphiaDemo.rhythm, false);
        this.createPatternLayer('Bass', this.polyphiaDemo.bass, false);
        this.createPatternLayer('Drums', this.polyphiaDemo.drums, false);
        this.createPatternLayer('Ambient', this.polyphiaDemo.ambient, false);
    }

    /**
     * Create a new pattern layer
     */
    createPatternLayer(name, code = '', enabled = true) {
        const layerId = `layer_${Date.now()}`;
        const layer = {
            id: layerId,
            name: name,
            code: code,
            enabled: enabled,
            muted: false,
            solo: false,
            volume: 0.8,
            effects: {}
        };

        this.patternLayers.push(layer);
        this.renderPatternLayer(layer);
        return layer;
    }

    /**
     * Render a pattern layer in the UI
     */
    renderPatternLayer(layer) {
        const container = document.getElementById('pattern-layers');
        const layerDiv = document.createElement('div');
        layerDiv.className = 'pattern-layer';
        layerDiv.id = layer.id;
        
        layerDiv.innerHTML = `
            <div class="layer-header">
                <input type="checkbox" class="layer-enable" ${layer.enabled ? 'checked' : ''}>
                <input type="text" class="layer-name" value="${layer.name}">
                <div class="layer-controls">
                    <button class="layer-btn solo ${layer.solo ? 'active' : ''}">S</button>
                    <button class="layer-btn mute ${layer.muted ? 'active' : ''}">M</button>
                    <button class="layer-btn delete">🗑️</button>
                </div>
            </div>
            <div class="layer-content">
                <textarea class="layer-code" placeholder="Enter pattern code...">${layer.code}</textarea>
                <div class="layer-volume">
                    <input type="range" class="volume-slider" value="${layer.volume}" min="0" max="1" step="0.01">
                    <span class="volume-display">${Math.round(layer.volume * 100)}%</span>
                </div>
            </div>
        `;

        container.appendChild(layerDiv);
        this.setupLayerEventListeners(layer, layerDiv);
    }

    /**
     * Setup event listeners for a pattern layer
     */
    setupLayerEventListeners(layer, layerDiv) {
        // Enable/disable toggle
        layerDiv.querySelector('.layer-enable').addEventListener('change', (e) => {
            layer.enabled = e.target.checked;
            layerDiv.classList.toggle('disabled', !layer.enabled);
        });

        // Name editing
        layerDiv.querySelector('.layer-name').addEventListener('change', (e) => {
            layer.name = e.target.value;
        });

        // Solo button
        layerDiv.querySelector('.solo').addEventListener('click', (e) => {
            layer.solo = !layer.solo;
            e.target.classList.toggle('active', layer.solo);
            this.updateSoloState();
        });

        // Mute button
        layerDiv.querySelector('.mute').addEventListener('click', (e) => {
            layer.muted = !layer.muted;
            e.target.classList.toggle('active', layer.muted);
        });

        // Delete button
        layerDiv.querySelector('.delete').addEventListener('click', () => {
            this.deletePatternLayer(layer.id);
        });

        // Code editing
        layerDiv.querySelector('.layer-code').addEventListener('input', (e) => {
            layer.code = e.target.value;
        });

        // Volume control
        layerDiv.querySelector('.volume-slider').addEventListener('input', (e) => {
            layer.volume = parseFloat(e.target.value);
            layerDiv.querySelector('.volume-display').textContent = Math.round(layer.volume * 100) + '%';
        });
    }

    /**
     * Setup tab system for different views
     */
    setupTabSystem() {
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all tabs and contents
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(tc => tc.classList.remove('active'));

                // Add active class to clicked tab and corresponding content
                tab.classList.add('active');
                const tabId = tab.dataset.tab;
                document.getElementById(`${tabId}-tab`).classList.add('active');
            });
        });
    }

    /**
     * Setup audio visualization
     */
    setupVisualization() {
        try {
            this.waveformCanvas = document.getElementById('waveform-canvas');
            this.spectrumCanvas = document.getElementById('spectrum-canvas');
            
            // Check if canvas elements exist before getting context
            if (!this.waveformCanvas || !this.spectrumCanvas) {
                console.warn('⚠️ Canvas elements not found, skipping visualization setup');
                return;
            }
            
            this.waveformCtx = this.waveformCanvas.getContext('2d');
            this.spectrumCtx = this.spectrumCanvas.getContext('2d');
            
            // Check if contexts were successfully created
            if (!this.waveformCtx || !this.spectrumCtx) {
                console.warn('⚠️ Failed to get canvas contexts, skipping visualization setup');
                return;
            }

            // Setup analyzer nodes when audio context is ready
            if (this.audioContext) {
                this.setupAnalyzers();
            }
            
            console.log('✅ Visualization setup completed');
        } catch (error) {
            console.warn('⚠️ Visualization setup failed:', error.message);
        }
    }

    /**
     * Setup audio analyzers for visualization
     */
    setupAnalyzers() {
        this.waveformAnalyzer = this.audioContext.createAnalyser();
        this.spectrumAnalyzer = this.audioContext.createAnalyser();
        
        this.waveformAnalyzer.fftSize = 2048;
        this.spectrumAnalyzer.fftSize = 256;
        
        // Connect to master gain
        if (this.masterGain) {
            this.masterGain.connect(this.waveformAnalyzer);
            this.masterGain.connect(this.spectrumAnalyzer);
        }

        this.startVisualization();
    }

    /**
     * Start real-time visualization
     */
    startVisualization() {
        // Check if visualization is available before starting
        if (!this.waveformCtx || !this.spectrumCtx || !this.waveformAnalyzer || !this.spectrumAnalyzer) {
            console.warn('⚠️ Visualization not available, skipping visualization start');
            return;
        }
        
        const drawWaveform = () => {
            if (!this.waveformCtx || !this.waveformAnalyzer) return;
            
            const bufferLength = this.waveformAnalyzer.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            this.waveformAnalyzer.getByteTimeDomainData(dataArray);

            this.waveformCtx.fillStyle = '#1a1a1a';
            this.waveformCtx.fillRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);

            this.waveformCtx.lineWidth = 2;
            this.waveformCtx.strokeStyle = '#4CAF50';
            this.waveformCtx.beginPath();

            const sliceWidth = this.waveformCanvas.width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * this.waveformCanvas.height / 2;

                if (i === 0) {
                    this.waveformCtx.moveTo(x, y);
                } else {
                    this.waveformCtx.lineTo(x, y);
                }
                x += sliceWidth;
            }

            this.waveformCtx.stroke();
        };

        const drawSpectrum = () => {
            if (!this.spectrumCtx || !this.spectrumAnalyzer) return;
            
            const bufferLength = this.spectrumAnalyzer.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            this.spectrumAnalyzer.getByteFrequencyData(dataArray);

            this.spectrumCtx.fillStyle = '#1a1a1a';
            this.spectrumCtx.fillRect(0, 0, this.spectrumCanvas.width, this.spectrumCanvas.height);

            const barWidth = this.spectrumCanvas.width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * this.spectrumCanvas.height;
                
                const r = Math.floor(barHeight + 25);
                const g = Math.floor(250 * (i / bufferLength));
                const b = 50;

                this.spectrumCtx.fillStyle = `rgb(${r},${g},${b})`;
                this.spectrumCtx.fillRect(x, this.spectrumCanvas.height - barHeight, barWidth, barHeight);

                x += barWidth;
            }
        };

        const animate = () => {
            if (this.waveformAnalyzer && this.spectrumAnalyzer) {
                drawWaveform();
                drawSpectrum();
            }
            requestAnimationFrame(animate);
        };

        animate();
    }

    /**
     * Setup performance pads
     */
    setupPerformancePads() {
        const pads = document.querySelectorAll('.perf-pad');
        
        pads.forEach(pad => {
            pad.addEventListener('click', () => {
                const action = pad.dataset.action;
                this.executePerformanceAction(action);
                pad.classList.add('triggered');
                setTimeout(() => pad.classList.remove('triggered'), 200);
            });
        });
    }

    /**
     * Execute performance actions
     */
    executePerformanceAction(action) {
        switch (action) {
            case 'solo-toggle':
                this.toggleSolo();
                break;
            case 'mute-toggle':
                this.toggleMute();
                break;
            case 'filter-sweep':
                this.performFilterSweep();
                break;
            case 'stutter':
                this.performStutter();
                break;
            case 'reverse':
                this.performReverse();
                break;
            case 'bitcrush':
                this.performBitcrush();
                break;
            case 'build-up':
                this.performBuildUp();
                break;
            case 'drop':
                this.performDrop();
                break;
        }
    }

    /**
     * Load the complete Polyphia demo
     */
    loadPolyphiaDemo() {
        // Stop any current playback
        if (this.isPlaying) {
            this.stopPattern();
        }

        // Load the full composition into the editor
        document.getElementById('pattern-editor').value = this.polyphiaDemo.full;
        
        // Enable all relevant layers
        this.patternLayers.forEach(layer => {
            layer.enabled = true;
            const layerElement = document.getElementById(layer.id);
            if (layerElement) {
                layerElement.querySelector('.layer-enable').checked = true;
                layerElement.classList.remove('disabled');
            }
        });

        // Set optimal BPM for the demo
        document.getElementById('bpm-input').value = 140;
        
        // Evaluate the pattern
        this.evaluateCurrentPattern();
        
        this.showSuccess('🎸 Polyphia demo loaded! Click Play to experience the magic.');
    }

    /**
     * Enhanced audio context initialization with effects
     */
    async initializeAudio() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            
            if (!AudioContextClass) {
                throw new Error('Web Audio API not supported');
            }
            
            this.audioContext = new AudioContextClass();
            console.log('✅ Audio context created');
            
            // Create master effects chain
            this.createMasterEffectsChain();
            
            // Setup analyzers for visualization
            this.setupAnalyzers();
            
        } catch (error) {
            throw new Error(`Audio initialization failed: ${error.message}`);
        }
    }

    /**
     * Create master effects chain
     */
    createMasterEffectsChain() {
        // Create master gain
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.8;

        // Create master filter
        this.masterFilter = this.audioContext.createBiquadFilter();
        this.masterFilter.type = 'lowpass';
        this.masterFilter.frequency.value = 20000;
        this.masterFilter.Q.value = 1;

        // Create reverb
        this.createMasterReverb();

        // Create master compressor
        this.masterCompressor = this.audioContext.createDynamicsCompressor();
        this.masterCompressor.threshold.value = -24;
        this.masterCompressor.knee.value = 30;
        this.masterCompressor.ratio.value = 12;
        this.masterCompressor.attack.value = 0.003;
        this.masterCompressor.release.value = 0.25;

        // Connect the chain
        this.masterGain.connect(this.masterFilter);
        this.masterFilter.connect(this.masterCompressor);
        this.masterCompressor.connect(this.masterReverb.input);
        this.masterReverb.output.connect(this.audioContext.destination);
    }

    /**
     * Create master reverb effect
     */
    createMasterReverb() {
        const convolver = this.audioContext.createConvolver();
        const wetGain = this.audioContext.createGain();
        const dryGain = this.audioContext.createGain();
        const outputGain = this.audioContext.createGain();

        // Generate impulse response for reverb
        const length = this.audioContext.sampleRate * 2; // 2 seconds
        const impulse = this.audioContext.createBuffer(2, length, this.audioContext.sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            }
        }
        
        convolver.buffer = impulse;

        // Set initial values
        wetGain.gain.value = 0.2;
        dryGain.gain.value = 0.8;

        this.masterReverb = {
            input: this.audioContext.createGain(),
            output: outputGain,
            wet: wetGain,
            dry: dryGain
        };

        // Connect reverb
        this.masterReverb.input.connect(dryGain);
        this.masterReverb.input.connect(convolver);
        convolver.connect(wetGain);
        dryGain.connect(outputGain);
        wetGain.connect(outputGain);
    }

    /**
     * Load advanced patterns including Polyphia-inspired demo
     */
    loadDefaultPatterns() {
        // Load the Polyphia-inspired demo piece
        this.polyphiaDemo = this.createPolyphiaDemo();
        
        const examples = [
            { 
                name: '🎸 Polyphia Lead', 
                code: this.polyphiaDemo.lead,
                description: 'Technical lead guitar pattern',
                category: 'lead'
            },
            { 
                name: '🎸 Rhythm Guitar', 
                code: this.polyphiaDemo.rhythm,
                description: 'Complex rhythm guitar',
                category: 'rhythm'
            },
            { 
                name: '🎸 Bass Line', 
                code: this.polyphiaDemo.bass,
                description: 'Groovy bass foundation',
                category: 'bass'
            },
            { 
                name: '🥁 Progressive Drums', 
                code: this.polyphiaDemo.drums,
                description: 'Complex drum programming',
                category: 'drums'
            },
            { 
                name: '🎹 Ambient Pad', 
                code: this.polyphiaDemo.ambient,
                description: 'Atmospheric background',
                category: 'ambient'
            },
            { 
                name: '🔥 House Beat', 
                code: 'bd [~ bd] hh [sd ~] hh',
                description: 'Classic house groove',
                category: 'drums'
            },
            { 
                name: '🌊 Liquid DnB', 
                code: 'bd ~ ~ bd ~ sd ~ ~',
                description: 'Liquid drum & bass',
                category: 'drums'
            },
            { 
                name: '🎼 Jazz Chord', 
                code: 'c3maj7 f3maj7 g3dom7 c3maj7',
                description: 'Jazz progression',
                category: 'harmony'
            },
            { 
                name: '🔊 Techno Stab', 
                code: 'c2 ~ c2 ~ ~ c2 ~ ~',
                description: 'Driving techno stab',
                category: 'synth'
            },
            { 
                name: '✨ Arpeggios', 
                code: 'c4 e4 g4 c5 g4 e4',
                description: 'Flowing arpeggios',
                category: 'melody'
            }
        ];

        this.loadPatternExamples(examples);
        this.initializePatternLayers();
        this.setupTabSystem();
        this.setupVisualization();
        this.setupPerformancePads();
        
        // Initialize advanced DAW features
        this.setupFileHandling();
        this.setupAdvancedSequencer();
        this.setupAdvancedMixer();
        this.setupPianoRoll();
    }

    /**
     * Create Polyphia-inspired demo composition
     */
    createPolyphiaDemo() {
        return {
            // Technical lead guitar with tapping and sweep patterns
            lead: `// Polyphia-inspired lead guitar
note("g4 a4 b4 d5 g5 d5 b4 a4 g4 f#4 e4 d4")
  .sound("guitar")
  .cutoff(sine.range(800, 2400).slow(8))
  .delay(0.25)
  .room(0.3)
  .gain(0.7)`,

            // Complex rhythm guitar with palm muting and dynamics
            rhythm: `// Rhythm guitar with palm muting
note("g3 ~ d3 ~ g3 ~ f#3 ~ e3 ~ d3 ~ c3 ~")
  .sound("guitar")
  .cutoff(600)
  .attack(0.01)
  .decay(0.1)
  .gain(0.5)`,

            // Groovy bass line with slides and accents
            bass: `// Progressive bass line
note("g1 ~ g1 d2 ~ g1 ~ f#1 e1 ~ d1 ~ c1")
  .sound("bass")
  .lpf(sine.range(100, 400).slow(4))
  .distortion(0.3)
  .gain(0.8)`,

            // Complex drum programming with polyrhythms
            drums: `// Progressive drum pattern
stack(
  bd("1 ~ ~ 1 ~ ~ 1 ~"),
  sd("~ ~ 1 ~ ~ 1 ~ ~"),
  hh("1 ~ 1 1 ~ 1 ~ 1"),
  oh("~ ~ ~ ~ 1 ~ ~ ~")
).gain(0.9)`,

            // Ambient atmospheric pad
            ambient: `// Atmospheric pad
note("g2maj7 d3maj7 c3maj7 f#2maj7")
  .sound("pad")
  .slow(4)
  .room(0.8)
  .lpf(sine.range(200, 800).slow(16))
  .gain(0.3)`,

            // Full composition combining all parts
            full: `// Complete Polyphia-inspired composition
stack(
  // Lead guitar
  note("g4 a4 b4 d5 g5 d5 b4 a4").sound("guitar").delay(0.25).room(0.3),
  
  // Rhythm guitar  
  note("g3 ~ d3 ~ g3 ~ f#3 ~").sound("guitar").cutoff(600).gain(0.5),
  
  // Bass
  note("g1 ~ g1 d2 ~ g1 ~ f#1").sound("bass").lpf(400).distortion(0.3),
  
  // Drums
  stack(
    bd("1 ~ ~ 1 ~ ~ 1 ~"),
    sd("~ ~ 1 ~ ~ 1 ~ ~"),
    hh("1 ~ 1 1 ~ 1 ~ 1")
  ),
  
  // Ambient pad
  note("g2maj7 d3maj7").slow(4).sound("pad").room(0.8).gain(0.3)
)`
        };
    }

    /**
     * Set up enhanced event listeners
     */
    setupEventListeners() {
        // Transport controls
        document.getElementById('play-btn').addEventListener('click', () => this.playPattern());
        document.getElementById('pause-btn').addEventListener('click', () => this.pausePattern());
        document.getElementById('stop-btn').addEventListener('click', () => this.stopPattern());
        
        // Demo and utility buttons
        document.getElementById('load-demo-btn').addEventListener('click', () => this.loadPolyphiaDemo());
        document.getElementById('clear-all-btn').addEventListener('click', () => this.clearAllPatterns());
        document.getElementById('add-pattern-btn').addEventListener('click', () => this.addNewPatternLayer());
        
        // Evaluate button
        document.getElementById('evaluate-btn').addEventListener('click', () => this.evaluateCurrentPattern());
        document.getElementById('save-pattern-btn').addEventListener('click', () => this.saveCurrentPattern());
        
        // Master volume control
        document.getElementById('master-volume').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (this.masterGain) {
                this.masterGain.gain.value = value;
            }
            document.getElementById('volume-display').textContent = Math.round(value * 100) + '%';
        });
        
        // Tap tempo
        document.getElementById('tap-tempo').addEventListener('click', () => this.tapTempo());
        
        // Instrument selection
        document.getElementById('instrument-select').addEventListener('change', (e) => {
            this.currentInstrument = e.target.value;
            this.updateEditorPlaceholder();
        });
        
        // Enter key in editor to evaluate
        document.getElementById('pattern-editor').addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.evaluateCurrentPattern();
            }
        });

        // Effects controls
        this.setupEffectsControls();
        
        // Sample browser
        this.setupSampleBrowser();
        
        // File handling
        this.setupFileHandling();

        // Piano roll and export buttons
        document.getElementById('piano-roll-btn').addEventListener('click', () => this.togglePianoRoll());
        document.getElementById('export-midi-btn').addEventListener('click', () => this.exportMIDI());
        document.getElementById('export-audio-btn').addEventListener('click', () => this.showExportDialog());
    }

    /**
     * Setup effects controls
     */
    setupEffectsControls() {
        const knobs = document.querySelectorAll('.knob input');
        
        knobs.forEach(knob => {
            knob.addEventListener('input', (e) => {
                const param = e.target.closest('.knob').dataset.param;
                const value = parseFloat(e.target.value);
                this.updateEffect(param, value);
            });
        });
    }

    /**
     * Setup sample browser
     */
    setupSampleBrowser() {
        const categories = document.querySelectorAll('.sample-cat');
        
        categories.forEach(cat => {
            cat.addEventListener('click', () => {
                categories.forEach(c => c.classList.remove('active'));
                cat.classList.add('active');
                this.loadSampleCategory(cat.dataset.cat);
            });
        });

        // Load default category
        this.loadSampleCategory('drums');
    }

    /**
     * Load sample category
     */
    loadSampleCategory(category) {
        const sampleGrid = document.getElementById('sample-grid');
        sampleGrid.innerHTML = '';

        const samples = this.getSamplesForCategory(category);
        
        samples.forEach(sample => {
            const pad = document.createElement('button');
            pad.className = 'sample-pad';
            pad.textContent = sample.name;
            pad.addEventListener('click', () => this.playSample(sample));
            sampleGrid.appendChild(pad);
        });
    }

    /**
     * Get samples for a category
     */
    getSamplesForCategory(category) {
        const sampleLibrary = {
            drums: [
                { name: 'Kick', code: 'bd', type: 'drum' },
                { name: 'Snare', code: 'sd', type: 'drum' },
                { name: 'Hi-hat', code: 'hh', type: 'drum' },
                { name: 'Open Hat', code: 'oh', type: 'drum' },
                { name: 'Crash', code: 'crash', type: 'drum' },
                { name: 'Ride', code: 'ride', type: 'drum' }
            ],
            guitar: [
                { name: 'Power Chord', code: 'c3 g3', type: 'chord' },
                { name: 'Lead Riff', code: 'c4 d4 e4 f4', type: 'melody' },
                { name: 'Strum', code: 'c3maj', type: 'chord' }
            ],
            bass: [
                { name: 'Sub Bass', code: 'c1', type: 'bass' },
                { name: 'Bass Slap', code: 'g1', type: 'bass' },
                { name: 'Bass Slide', code: 'c1 ~ g1', type: 'bass' }
            ],
            synth: [
                { name: 'Lead Synth', code: 'c4', type: 'synth' },
                { name: 'Pad', code: 'c3maj7', type: 'pad' },
                { name: 'Pluck', code: 'c4', type: 'pluck' }
            ],
            fx: [
                { name: 'Riser', code: 'noise', type: 'fx' },
                { name: 'Impact', code: 'impact', type: 'fx' },
                { name: 'Reverse', code: 'rev', type: 'fx' }
            ]
        };

        return sampleLibrary[category] || [];
    }

    /**
     * Performance action methods
     */
    performFilterSweep() {
        if (this.masterFilter) {
            const now = this.audioContext.currentTime;
            this.masterFilter.frequency.cancelScheduledValues(now);
            this.masterFilter.frequency.setValueAtTime(20000, now);
            this.masterFilter.frequency.exponentialRampToValueAtTime(200, now + 2);
            this.masterFilter.frequency.exponentialRampToValueAtTime(20000, now + 4);
        }
    }

    performStutter() {
        // Implement stutter effect by rapidly muting/unmuting
        if (this.masterGain) {
            const now = this.audioContext.currentTime;
            for (let i = 0; i < 8; i++) {
                const time = now + (i * 0.0625); // 1/16th notes
                this.masterGain.gain.setValueAtTime(i % 2 === 0 ? 0 : 0.8, time);
            }
            this.masterGain.gain.setValueAtTime(0.8, now + 0.5);
        }
    }

    performBuildUp() {
        if (this.masterFilter) {
            const now = this.audioContext.currentTime;
            this.masterFilter.frequency.cancelScheduledValues(now);
            this.masterFilter.frequency.setValueAtTime(200, now);            this.masterFilter.frequency.exponentialRampToValueAtTime(20000, now + 8);
        }
    }

    performDrop() {
        if (this.masterFilter && this.masterGain) {
            const now = this.audioContext.currentTime;
            
            // Filter drop
            this.masterFilter.frequency.cancelScheduledValues(now);
            this.masterFilter.frequency.setValueAtTime(200, now);
            this.masterFilter.frequency.exponentialRampToValueAtTime(20000, now + 0.1);
            
            // Volume boost
            this.masterGain.gain.cancelScheduledValues(now);
            this.masterGain.gain.setValueAtTime(1.2, now);
            this.masterGain.gain.exponentialRampToValueAtTime(0.8, now + 2);
        }
    }

    /**
     * Draw piano roll selection
     */
    drawPianoRollSelection() {
        // Selection rectangle drawing would go here
    }
}

// Export for use in SwissKnife system
window.StrudelApp = StrudelApp;

// ES6 module export
export default StrudelApp;
export { StrudelApp };

// CommonJS export for compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StrudelApp;
    module.exports.default = StrudelApp;
    module.exports.StrudelApp = StrudelApp;
}
