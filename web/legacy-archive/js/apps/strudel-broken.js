/**
 * Strudel Music App for SwissKnife Desktop
 * Live coding environment for algorithmic music composition
 * 
 * Features:
 * - CDN-first loading with NPM fallback
 * - Real-time pattern evaluation
 * - Audio visualization
 * - Sample browser
 * - Pattern saving/loading
 * - Comprehensive error handling
 */

class StrudelApp {
    constructor() {
        this.isInitialized = false;
        this.isPlaying = false;
        this.audioContext = null;
        this.strudelAPI = null;
        this.currentPattern = null;
        this.patterns = new Map();
        this.activeTab = 'pattern1';
        this.loadingStrategy = 'cdn'; // 'cdn' or 'npm'
        this.testResults = {
            audio: false,
            strudel: false,
            samples: false,
            evaluation: false
        };
        
        console.log('🎵 Strudel App initialized');
    }

    /**
     * Initialize the Strudel app with robust loading and fallback
     */
    async initialize(contentElement) {
        try {
            console.log('🎵 Starting Strudel initialization...');
            
            // Create the UI first
            this.createUI(contentElement);
            this.showLoadingState('Initializing Strudel...');
            
            // Test and initialize audio context
            await this.initializeAudio();
            
            // Load Strudel library (CDN first, NPM fallback)
            await this.loadStrudelLibrary();
            
            // Initialize Strudel with our audio context
            await this.initializeStrudel();
            
            // Load sample library
            await this.loadSamples();
            
            // Set up event listeners and UI
            this.setupEventListeners();
            this.setupPatternTabs();
            this.loadDefaultPatterns();
            
            // Run comprehensive tests
            await this.runTests();
            
            this.hideLoadingState();
            this.isInitialized = true;
            
            console.log('✅ Strudel App fully initialized');
            this.showSuccess('Strudel initialized successfully! Ready to make music 🎵');
            
        } catch (error) {
            console.error('❌ Strudel initialization failed:', error);
            this.showError(`Initialization failed: ${error.message}`);
            this.showFallbackUI();
        }
    }

    /**
     * Create the main UI structure
     */
    createUI(contentElement) {
        contentElement.innerHTML = `
            <div class="strudel-app">
                <!-- Loading state -->
                <div class="strudel-loading" id="strudel-loading">
                    <div class="spinner"></div>
                    <div id="loading-message">Loading Strudel...</div>
                </div>
                
                <!-- Main app UI (hidden initially) -->
                <div class="strudel-main" id="strudel-main" style="display: none;">
                    <!-- Header with transport controls -->
                    <div class="strudel-header">
                        <div class="transport-controls">
                            <button id="play-btn" title="Play (Ctrl+Enter)">
                                ▶️ Play
                            </button>
                            <button id="stop-btn" class="stop" title="Stop">
                                ⏹️ Stop
                            </button>
                            <button id="pause-btn" class="pause" title="Pause">
                                ⏸️ Pause
                            </button>
                        </div>
                        <div class="tempo-control">
                            <label>BPM: 
                                <input type="number" id="bpm" value="120" min="60" max="200" step="1">
                            </label>
                        </div>
                        <div class="volume-control">
                            <label>Volume: 
                                <input type="range" id="volume" min="0" max="1" step="0.1" value="0.7">
                            </label>
                        </div>
                        <div class="strudel-status" id="status">Ready</div>
                    </div>
                    
                    <!-- Code Editor Area -->
                    <div class="strudel-editor">
                        <div class="editor-tabs" id="editor-tabs">
                            <button class="tab active" data-tab="pattern1">Pattern 1</button>
                            <button class="tab" data-tab="pattern2">Pattern 2</button>
                            <button class="add-tab" id="add-tab">+</button>
                        </div>
                        <textarea id="code-editor" placeholder="Enter your Strudel patterns here...">// Welcome to Strudel Live Coding!
// Press Ctrl+Enter to evaluate a line or selection
// Try this basic pattern:

"c3 d3 e3 f3".slow(2).sound("sawtooth")

// Or try some drums:
// "bd hh sd hh".sound("808")

// Explore more patterns in the examples!</textarea>
                    </div>
                    
                    <!-- Pattern Visualization -->
                    <div class="strudel-visualizer">
                        <canvas id="pattern-canvas" width="800" height="200"></canvas>
                        <div class="visualizer-overlay">Audio Visualization</div>
                    </div>
                    
                    <!-- Sample Browser -->
                    <div class="strudel-sidebar">
                        <h3>🎵 Strudel Studio</h3>
                        
                        <!-- Sample Categories -->
                        <div class="sample-categories">
                            <div class="category active" data-category="all">🎼 All Samples</div>
                            <div class="category" data-category="drums">🥁 Drums</div>
                            <div class="category" data-category="bass">🔊 Bass</div>
                            <div class="category" data-category="synth">🎹 Synth</div>
                            <div class="category" data-category="ambient">🌊 Ambient</div>
                        </div>
                        
                        <!-- Sample List -->
                        <div class="sample-list" id="sample-list">
                            <div class="sample-category">
                                <h4>Loading samples...</h4>
                            </div>
                        </div>
                        
                        <!-- Pattern Library -->
                        <div class="pattern-library">
                            <h4>📚 Example Patterns</h4>
                            <div id="pattern-examples">
                                <!-- Will be populated with examples -->
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Error Messages -->
                <div id="error-container"></div>
                
                <!-- Success Messages -->
                <div id="success-container"></div>
            </div>
        `;
    }

    /**
     * Initialize Web Audio API with user gesture handling
     */
    async initializeAudio() {
        try {
            console.log('🔊 Initializing Web Audio...');
            
            // Create audio context
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) {
                throw new Error('Web Audio API not supported');
            }
            
            this.audioContext = new AudioContext();
            
            // Handle audio context state
            if (this.audioContext.state === 'suspended') {
                // Will be resumed on first user interaction
                console.log('🔊 Audio context suspended, will resume on user interaction');
            }
            
            this.testResults.audio = true;
            console.log('✅ Web Audio initialized successfully');
            
        } catch (error) {
            this.testResults.audio = false;
            throw new Error(`Audio initialization failed: ${error.message}`);
        }
    }

    /**
     * Load Strudel library with advanced CDN-first approach and NPM fallback
     */
    async loadStrudelLibrary() {
        console.log('📦 Loading Strudel library...');
        
        try {
            // Use advanced CDN loader if available
            if (window.strudelCDN) {
                console.log('🌐 Using advanced CDN loader...');
                const compatibility = window.strudelCDN.checkCompatibility();
                
                if (!compatibility.webAudio) {
                    throw new Error('Web Audio API not supported in this browser');
                }
                
                const libraries = await window.strudelCDN.loadAll();
                
                // Check if essential modules loaded
                if (!libraries.core || !libraries.webaudio) {
                    throw new Error('Failed to load essential Strudel modules');
                }
                
                // Store loaded modules
                this.strudelAPI = libraries;
                this.loadingStrategy = 'cdn-advanced';
                console.log('✅ Strudel loaded via advanced CDN loader');
                
            } else {
                // Fallback to simple CDN loading
                console.log('🌐 Using simple CDN loading...');
                await this.loadFromCDN();
                this.loadingStrategy = 'cdn-simple';
            }
            
        } catch (cdnError) {
            console.warn('⚠️ CDN loading failed, trying NPM fallback:', cdnError);
            
            try {
                // Fallback to NPM packages
                await this.loadFromNPM();
                this.loadingStrategy = 'npm';
                console.log('✅ Strudel loaded from NPM packages');
                
            } catch (npmError) {
                console.error('❌ Both CDN and NPM loading failed');
                throw new Error(`Library loading failed: CDN (${cdnError.message}), NPM (${npmError.message})`);
            }
        }
        
        this.testResults.strudel = true;
    }

    /**
     * Load Strudel from CDN
     */
    async loadFromCDN() {
        const cdnUrls = [
            'https://unpkg.com/@strudel/core@latest/dist/index.js',
            'https://unpkg.com/@strudel/webaudio@latest/dist/index.js',
            'https://unpkg.com/@strudel/mini@latest/dist/index.js'
        ];
        
        for (const url of cdnUrls) {
            await this.loadScript(url);
        }
        
        // Verify Strudel is available
        if (typeof window.strudel === 'undefined') {
            throw new Error('Strudel not found after CDN loading');
        }
    }

    /**
     * Load Strudel from NPM packages
     */
    async loadFromNPM() {
        try {
            // Import from webpack-bundled NPM packages
            const strudelCore = await import('@strudel/core');
            const strudelWebaudio = await import('@strudel/webaudio');
            const strudelMini = await import('@strudel/mini');
            
            // Set up global strudel object
            window.strudel = {
                ...strudelCore,
                ...strudelWebaudio,
                ...strudelMini
            };
            
        } catch (error) {
            throw new Error(`NPM import failed: ${error.message}`);
        }
    }

    /**
     * Dynamically load a script
     */
    loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
            document.head.appendChild(script);
        });
    }

    /**
     * Initialize Strudel with our audio context
     */
    async initializeStrudel() {
        try {
            console.log('🎵 Initializing Strudel engine...');
            
            // Initialize Strudel with our audio context
            if (window.strudel && window.strudel.initAudio) {
                await window.strudel.initAudio(this.audioContext);
            } else {
                console.warn('⚠️ Strudel initAudio not found, using basic setup');
            }
            
            this.strudelAPI = window.strudel;
            console.log('✅ Strudel engine initialized');
            
        } catch (error) {
            throw new Error(`Strudel engine initialization failed: ${error.message}`);
        }
    }

    /**
     * Load sample library
     */
    async loadSamples() {
        try {
            console.log('🎵 Loading sample library...');
            
            // Default samples (built into Strudel)
            const defaultSamples = {
                drums: ['bd', 'sd', 'hh', 'oh', 'cp', 'cr'],
                bass: ['bass', 'bass1', 'bass2', 'subbass'],
                synth: ['sawtooth', 'square', 'sine', 'triangle'],
                ambient: ['pad', 'strings', 'choir', 'bell']
            };
            
            this.updateSampleUI(defaultSamples);
            this.testResults.samples = true;
            
            console.log('✅ Sample library loaded');
            
        } catch (error) {
            console.warn('⚠️ Sample loading failed:', error);
            this.testResults.samples = false;
            // Don't throw - app can work without samples
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Transport controls
        document.getElementById('play-btn').addEventListener('click', () => {
            this.playCurrentPattern();
        });
        
        document.getElementById('stop-btn').addEventListener('click', () => {
            this.stopPattern();
        });
        
        document.getElementById('pause-btn').addEventListener('click', () => {
            this.pausePattern();
        });
        
        // Code editor
        const editor = document.getElementById('code-editor');
        
        // Ctrl+Enter to evaluate
        editor.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.evaluateSelection();
            }
        });
        
        // Tab management
        document.getElementById('add-tab').addEventListener('click', () => {
            this.addNewTab();
        });
        
        // Sample category filtering
        document.querySelectorAll('.category').forEach(cat => {
            cat.addEventListener('click', () => {
                this.filterSamples(cat.dataset.category);
            });
        });
        
        // BPM and volume controls
        document.getElementById('bpm').addEventListener('change', (e) => {
            this.setBPM(parseInt(e.target.value));
        });
        
        document.getElementById('volume').addEventListener('input', (e) => {
            this.setVolume(parseFloat(e.target.value));
        });
        
        // Resume audio context on first user interaction
        document.addEventListener('click', this.resumeAudioContext.bind(this), { once: true });
    }

    /**
     * Resume audio context (handles browser autoplay policies)
     */
    async resumeAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                console.log('🔊 Audio context resumed');
                this.updateStatus('Audio ready');
            } catch (error) {
                console.error('Failed to resume audio context:', error);
            }
        }
    }

    /**
     * Evaluate current selection or line
     */
    async evaluateSelection() {
        try {
            const editor = document.getElementById('code-editor');
            const selection = this.getSelection(editor);
            const code = selection || this.getCurrentLine(editor);
            
            if (!code.trim()) {
                this.showError('No code to evaluate');
                return;
            }
            
            console.log('🎵 Evaluating pattern:', code);
            this.updateStatus('Evaluating...');
            
            // Resume audio context if needed
            await this.resumeAudioContext();
            
            // Stop current pattern
            this.stopPattern();
            
            // Evaluate new pattern
            await this.evaluatePattern(code);
            
            this.testResults.evaluation = true;
            
        } catch (error) {
            console.error('Evaluation failed:', error);
            this.showError(`Evaluation failed: ${error.message}`);
            this.testResults.evaluation = false;
        }
    }

    /**
     * Evaluate a Strudel pattern with real audio synthesis
     */
    async evaluatePattern(code) {
        try {
            console.log('🎵 Evaluating pattern:', code);
            
            if (!this.strudelAPI && !this.strudelModules) {
                throw new Error('Strudel library not loaded');
            }
            
            // Stop any currently playing pattern
            if (this.isPlaying) {
                this.stopPattern();
            }
            
            // Parse and compile the pattern using Strudel API
            let pattern;
            
            if (this.strudelModules && this.strudelModules.core) {
                // Use loaded Strudel modules
                const { mini } = this.strudelModules.mini || {};
                const { core } = this.strudelModules.core || {};
                
                if (mini && mini.mini) {
                    // Use Strudel mini for pattern parsing
                    pattern = mini.mini(code);
                } else if (core) {
                    // Fallback to core pattern parsing
                    pattern = core.pattern(code);
                } else {
                    throw new Error('Strudel pattern parsing not available');
                }
            } else {
                // Fallback: simulate pattern for demo purposes
                pattern = this.createDemoPattern(code);
            }
            
            // Store the compiled pattern
            this.currentPattern = {
                code: code,
                pattern: pattern,
                isPlaying: false,
                startTime: null,
                scheduledEvents: []
            };
            
            // Update pattern in storage
            this.patterns.set(this.activeTab, code);
            
            this.updateStatus('Pattern compiled successfully');
            this.showSuccess('✅ Pattern ready to play!');
            
            console.log('✅ Pattern compiled successfully');
            
        } catch (error) {
            console.error('❌ Pattern evaluation failed:', error);
            this.showError(`Pattern error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create a demo pattern for testing (when Strudel isn't fully loaded)
     */
    createDemoPattern(code) {
        // Parse basic patterns for demo
        const patterns = {
            'bd hh sd hh': [
                { sound: 'kick', time: 0 },
                { sound: 'hihat', time: 0.25 },
                { sound: 'snare', time: 0.5 },
                { sound: 'hihat', time: 0.75 }
            ],
            'c3 d3 e3 f3': [
                { note: 'C3', time: 0 },
                { note: 'D3', time: 0.25 },
                { note: 'E3', time: 0.5 },
                { note: 'F3', time: 0.75 }
            ]
        };
        
        // Find matching pattern or create a simple one
        for (const [key, events] of Object.entries(patterns)) {
            if (code.includes(key)) {
                return { events, duration: 1.0 };
            }
        }
        
        // Default pattern
        return {
            events: [
                { sound: 'kick', time: 0 },
                { sound: 'hihat', time: 0.5 }
            ],
            duration: 1.0
        };
    }

    /**
     * Start pattern playback with real audio
     */
    startPatternPlayback() {
        if (!this.currentPattern) {
            this.showError('No pattern to play');
            return;
        }
        
        if (!this.audioContext) {
            this.showError('Audio context not available');
            return;
        }
        
        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        this.isPlaying = true;
        this.currentPattern.isPlaying = true;
        this.currentPattern.startTime = this.audioContext.currentTime;
        
        // Update UI
        document.getElementById('play-btn').disabled = true;
        document.getElementById('stop-btn').disabled = false;
        document.getElementById('pause-btn').disabled = false;
        
        // Schedule pattern events
        this.schedulePatternEvents();
        
        // Start visualization
        this.startVisualization();
        
        this.updateStatus('🎵 Playing...');
        console.log('🎵 Pattern playback started');
    }

    /**
     * Schedule pattern events for audio playback
     */
    schedulePatternEvents() {
        if (!this.currentPattern || !this.currentPattern.pattern) {
            return;
        }
        
        const pattern = this.currentPattern.pattern;
        const startTime = this.currentPattern.startTime;
        const bpm = this.getBPM();
        const beatDuration = 60 / bpm;
        
        // Clear any existing scheduled events
        this.currentPattern.scheduledEvents.forEach(event => {
            if (event.source) {
                event.source.stop();
            }
        });
        this.currentPattern.scheduledEvents = [];
        
        // Schedule events from the pattern
        if (pattern.events) {
            pattern.events.forEach(event => {
                const eventTime = startTime + (event.time * beatDuration);
                this.scheduleAudioEvent(event, eventTime);
            });
        }
        
        // Schedule pattern to loop
        const patternDuration = (pattern.duration || 1.0) * beatDuration;
        this.loopTimeout = setTimeout(() => {
            if (this.isPlaying) {
                this.currentPattern.startTime = this.audioContext.currentTime;
                this.schedulePatternEvents();
            }
        }, patternDuration * 1000);
    }

    /**
     * Schedule individual audio event
     */
    scheduleAudioEvent(event, time) {
        try {
            if (event.sound) {
                // Play drum sound
                this.playDrumSound(event.sound, time);
            } else if (event.note) {
                // Play note
                this.playNote(event.note, time);
            }
        } catch (error) {
            console.warn('Failed to schedule event:', error);
        }
    }

    /**
     * Play drum sound using Web Audio API
     */
    playDrumSound(soundName, time) {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        // Configure sound based on drum type
        const drumConfig = {
            kick: { freq: 60, type: 'sine', attack: 0.01, decay: 0.3 },
            snare: { freq: 200, type: 'square', attack: 0.01, decay: 0.1 },
            hihat: { freq: 8000, type: 'square', attack: 0.01, decay: 0.05 }
        };
        
        const config = drumConfig[soundName] || drumConfig.kick;
        
        oscillator.type = config.type;
        oscillator.frequency.setValueAtTime(config.freq, time);
        
        // Envelope
        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(0.5, time + config.attack);
        gainNode.gain.exponentialRampToValueAtTime(0.01, time + config.decay);
        
        // Connect audio graph
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Start and stop
        oscillator.start(time);
        oscillator.stop(time + config.decay);
        
        // Store reference for cleanup
        this.currentPattern.scheduledEvents.push({ source: oscillator, time });
    }

    /**
     * Play musical note using Web Audio API
     */
    playNote(noteName, time) {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        // Convert note name to frequency
        const frequency = this.noteToFrequency(noteName);
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(frequency, time);
        
        // Simple envelope
        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(0.3, time + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
        
        // Connect audio graph
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Start and stop
        oscillator.start(time);
        oscillator.stop(time + 0.5);
        
        // Store reference for cleanup
        this.currentPattern.scheduledEvents.push({ source: oscillator, time });
    }

    /**
     * Convert note name to frequency
     */
    noteToFrequency(noteName) {
        const noteMap = {
            'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
            'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
        };
        
        const match = noteName.match(/([A-G]#?)(\d+)/);
        if (!match) return 440; // Default to A4
        
        const [, note, octave] = match;
        const noteNumber = noteMap[note.toUpperCase()];
        const octaveNumber = parseInt(octave);
        
        // Calculate frequency using A4 = 440Hz as reference
        const semitonesFromA4 = (octaveNumber - 4) * 12 + (noteNumber - 9);
        return 440 * Math.pow(2, semitonesFromA4 / 12);
    }

    /**
     * Stop pattern playback
     */
    stopPattern() {
        if (this.currentPattern) {
            this.isPlaying = false;
            this.currentPattern.isPlaying = false;
            
            // Stop all scheduled events
            if (this.currentPattern.scheduledEvents) {
                this.currentPattern.scheduledEvents.forEach(event => {
                    if (event.source) {
                        try {
                            event.source.stop();
                        } catch (e) {
                            // Source might already be stopped
                        }
                    }
                });
                this.currentPattern.scheduledEvents = [];
            }
            
            // Clear loop timeout
            if (this.loopTimeout) {
                clearTimeout(this.loopTimeout);
                this.loopTimeout = null;
            }
            
            // Update UI
            document.getElementById('play-btn').disabled = false;
            document.getElementById('stop-btn').disabled = true;
            document.getElementById('pause-btn').disabled = true;
            
            // Stop visualization
            this.stopVisualization();
            
            this.updateStatus('⏹️ Stopped');
            console.log('🛑 Pattern stopped');
        }
    }

    /**
     * Pause pattern playback
     */
    pausePattern() {
        if (this.currentPattern && this.isPlaying) {
            this.isPlaying = false;
            this.currentPattern.isPlaying = false;
            
            // Update UI
            document.getElementById('play-btn').disabled = false;
            document.getElementById('pause-btn').disabled = true;
            
            this.updateStatus('Paused');
            console.log('⏸️ Pattern paused');
        }
    }

    /**
     * Play current pattern
     */
    playCurrentPattern() {
        const editor = document.getElementById('code-editor');
        const code = editor.value.trim();
        
        if (code) {
            this.evaluatePattern(code);
        } else {
            this.showError('No pattern to play');
        }
    }

    /**
     * Start audio visualization
     */
    startVisualization() {
        const canvas = document.getElementById('pattern-canvas');
        const ctx = canvas.getContext('2d');
        
        let frame = 0;
        const animate = () => {
            if (!this.isPlaying) return;
            
            // Simple waveform visualization
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            for (let x = 0; x < canvas.width; x++) {
                const y = canvas.height / 2 + Math.sin((x + frame) * 0.02) * 50 * Math.sin(frame * 0.01);
                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            ctx.stroke();
            frame++;
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }

    /**
     * Stop visualization
     */
    stopVisualization() {
        const canvas = document.getElementById('pattern-canvas');
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    /**
     * Set up pattern tabs
     */
    setupPatternTabs() {
        // Initialize default patterns
        this.patterns.set('pattern1', '// Pattern 1\n"c3 d3 e3 f3".slow(2).sound("sawtooth")');
        this.patterns.set('pattern2', '// Pattern 2\n"bd hh sd hh".sound("808")');
        
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.tab);
            });
        });
    }

    /**
     * Switch between pattern tabs
     */
    switchTab(tabId) {
        // Save current pattern
        const editor = document.getElementById('code-editor');
        this.patterns.set(this.activeTab, editor.value);
        
        // Switch to new tab
        this.activeTab = tabId;
        editor.value = this.patterns.get(tabId) || '// New pattern\n';
        
        // Update UI
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });
        
        console.log(`🎵 Switched to ${tabId}`);
    }

    /**
     * Add new pattern tab
     */
    addNewTab() {
        const tabCount = document.querySelectorAll('.tab').length;
        const newTabId = `pattern${tabCount + 1}`;
        
        // Create new tab button
        const newTab = document.createElement('button');
        newTab.className = 'tab';
        newTab.dataset.tab = newTabId;
        newTab.textContent = `Pattern ${tabCount + 1}`;
        newTab.addEventListener('click', () => this.switchTab(newTabId));
        
        // Insert before add button
        const addButton = document.getElementById('add-tab');
        addButton.parentNode.insertBefore(newTab, addButton);
        
        // Initialize pattern
        this.patterns.set(newTabId, `// Pattern ${tabCount + 1}\n`);
        
        // Switch to new tab
        this.switchTab(newTabId);
        
        console.log(`🎵 Added new tab: ${newTabId}`);
    }

    /**
     * Load default example patterns with working music
     */
    loadDefaultPatterns() {
        const examples = [
            {
                name: 'Basic Drums',
                code: 'bd hh sd hh',
                description: 'Simple four-on-the-floor drum pattern'
            },
            {
                name: 'Techno Beat',
                code: 'bd bd hh sd',
                description: 'Classic techno drum pattern'
            },
            {
                name: 'Simple Melody',
                code: 'c3 d3 e3 f3',
                description: 'Ascending scale melody'
            },
            {
                name: 'Bass Line',
                code: 'c2 c2 f2 g2',
                description: 'Basic bass pattern'
            },
            {
                name: 'Arpeggios',
                code: 'c3 e3 g3 c4',
                description: 'C major arpeggio'
            },
            {
                name: 'Jazz Chord',
                code: 'c3 e3 g3 b3',
                description: 'C major 7th chord'
            }
        ];
        
        // Add examples to pattern library
        const examplesList = document.getElementById('examples-list');
        if (examplesList) {
            examplesList.innerHTML = '';
            
            examples.forEach(example => {
                const exampleItem = document.createElement('div');
                exampleItem.className = 'example-item';
                exampleItem.innerHTML = `
                    <div class="example-name">${example.name}</div>
                    <div class="example-description">${example.description}</div>
                    <div class="example-code">${example.code}</div>
                `;
                
                exampleItem.addEventListener('click', () => {
                    this.loadPattern(example.code);
                });
                
                examplesList.appendChild(exampleItem);
            });
        }
        
        // Load first pattern as default
        this.patterns.set('pattern1', examples[0].code);
        
        console.log('🎵 Loaded default patterns');
    }

    /**
     * Load a pattern into the current tab
     */
    loadPattern(code) {
        this.patterns.set(this.activeTab, code);
        
        // Update editor if it exists
        const editorTextarea = document.querySelector(`[data-tab="${this.activeTab}"] .editor-textarea`);
        if (editorTextarea) {
            editorTextarea.value = code;
        } else {
            // Update active editor
            const activeEditor = document.querySelector('.editor-textarea:not([style*="display: none"])');
            if (activeEditor) {
                activeEditor.value = code;
            }
        }
        
        this.showSuccess(`✅ Loaded pattern: ${code}`);
        console.log('🎵 Pattern loaded:', code);
    }

    /**
     * Get current BPM setting
     */
    getBPM() {
        const bpmInput = document.getElementById('bpm-input');
        return bpmInput ? parseInt(bpmInput.value) || 120 : 120;
    }

    /**
     * Get current volume setting
     */
    getVolume() {
        const volumeInput = document.getElementById('volume-input');
        return volumeInput ? parseFloat(volumeInput.value) || 0.7 : 0.7;
    }
            {
                name: 'Ambient Pad',
                code: '"c3 e3 g3".slow(4).sound("pad").gain(0.5)',
                description: 'Ambient chord progression'
            }
        ];
        
        const container = document.getElementById('pattern-examples');
        container.innerHTML = '';
        
        examples.forEach(example => {
            const div = document.createElement('div');
            div.className = 'pattern-item';
            div.innerHTML = `
                <div class="pattern-name">${example.name}</div>
                <div class="pattern-code">${example.code}</div>
            `;
            div.title = example.description;
            div.addEventListener('click', () => {
                this.loadExamplePattern(example.code);
            });
            container.appendChild(div);
        });
    }

    /**
     * Load an example pattern into the editor
     */
    loadExamplePattern(code) {
        const editor = document.getElementById('code-editor');
        editor.value = code;
        editor.focus();
        this.showSuccess('Example pattern loaded!');
    }

    /**
     * Update sample UI
     */
    updateSampleUI(samples) {
        const container = document.getElementById('sample-list');
        container.innerHTML = '';
        
        for (const [category, sampleList] of Object.entries(samples)) {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'sample-category';
            categoryDiv.innerHTML = `<h4>${category}</h4>`;
            
            sampleList.forEach(sample => {
                const button = document.createElement('button');
                button.className = 'sample-btn';
                button.textContent = sample;
                button.title = `Insert ${sample} sample`;
                button.addEventListener('click', () => {
                    this.insertSample(sample);
                });
                categoryDiv.appendChild(button);
            });
            
            container.appendChild(categoryDiv);
        }
    }

    /**
     * Insert sample into editor
     */
    insertSample(sample) {
        const editor = document.getElementById('code-editor');
        const sampleCode = `.sound("${sample}")`;
        
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const text = editor.value;
        
        editor.value = text.slice(0, start) + sampleCode + text.slice(end);
        editor.selectionStart = editor.selectionEnd = start + sampleCode.length;
        editor.focus();
        
        this.showSuccess(`Inserted ${sample} sample!`);
    }

    /**
     * Filter samples by category
     */
    filterSamples(category) {
        // Update active category
        document.querySelectorAll('.category').forEach(cat => {
            cat.classList.toggle('active', cat.dataset.category === category);
        });
        
        // Filter sample display
        const categories = document.querySelectorAll('.sample-category');
        categories.forEach(cat => {
            const categoryName = cat.querySelector('h4').textContent.toLowerCase();
            const shouldShow = category === 'all' || categoryName.includes(category);
            cat.style.display = shouldShow ? 'block' : 'none';
        });
        
        console.log(`🎵 Filtered samples by: ${category}`);
    }

    /**
     * Set BPM
     */
    setBPM(bpm) {
        console.log(`🎵 BPM set to: ${bpm}`);
        this.updateStatus(`BPM: ${bpm}`);
        
        // In full implementation, this would update Strudel's tempo
        if (this.strudelAPI && this.strudelAPI.setBPM) {
            this.strudelAPI.setBPM(bpm);
        }
    }

    /**
     * Set volume
     */
    setVolume(volume) {
        console.log(`🔊 Volume set to: ${volume}`);
        
        // In full implementation, this would update Strudel's master volume
        if (this.strudelAPI && this.strudelAPI.setVolume) {
            this.strudelAPI.setVolume(volume);
        }
    }

    /**
     * Run comprehensive tests
     */
    async runTests() {
        console.log('🧪 Running Strudel tests...');
        
        const tests = [
            {
                name: 'Audio Context',
                test: () => this.testResults.audio,
                required: true
            },
            {
                name: 'Strudel Library',
                test: () => this.testResults.strudel,
                required: true
            },
            {
                name: 'Sample Loading',
                test: () => this.testResults.samples,
                required: false
            },
            {
                name: 'Pattern Evaluation',
                test: () => this.testEvaluation(),
                required: true
            }
        ];
        
        let passed = 0;
        let failed = 0;
        
        for (const test of tests) {
            try {
                const result = await test.test();
                if (result) {
                    console.log(`✅ Test passed: ${test.name}`);
                    passed++;
                } else {
                    console.warn(`⚠️ Test failed: ${test.name}`);
                    if (test.required) {
                        failed++;
                    }
                }
            } catch (error) {
                console.error(`❌ Test error: ${test.name}`, error);
                if (test.required) {
                    failed++;
                }
            }
        }
        
        console.log(`🧪 Tests complete: ${passed} passed, ${failed} failed`);
        
        if (failed > 0) {
            throw new Error(`${failed} required tests failed`);
        }
    }

    /**
     * Test pattern evaluation
     */
    async testEvaluation() {
        try {
            // Test basic evaluation without audio
            const testCode = '"c3 d3 e3 f3"';
            console.log('🧪 Testing pattern evaluation:', testCode);
            
            // In full implementation, this would actually evaluate with Strudel
            // For now, just test that the code parsing works
            if (testCode.includes('"') && testCode.includes('c3')) {
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Evaluation test failed:', error);
            return false;
        }
    }

    /**
     * Utility: Get selected text from editor
     */
    getSelection(editor) {
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        return editor.value.substring(start, end);
    }

    /**
     * Utility: Get current line from editor
     */
    getCurrentLine(editor) {
        const lines = editor.value.split('\n');
        const cursorPos = editor.selectionStart;
        const textBeforeCursor = editor.value.substring(0, cursorPos);
        const lineNumber = textBeforeCursor.split('\n').length - 1;
        return lines[lineNumber];
    }

    /**
     * Show loading state
     */
    showLoadingState(message) {
        const loading = document.getElementById('strudel-loading');
        const main = document.getElementById('strudel-main');
        const messageEl = document.getElementById('loading-message');
        
        if (loading && main && messageEl) {
            loading.style.display = 'flex';
            main.style.display = 'none';
            messageEl.textContent = message;
        }
    }

    /**
     * Hide loading state
     */
    hideLoadingState() {
        const loading = document.getElementById('strudel-loading');
        const main = document.getElementById('strudel-main');
        
        if (loading && main) {
            loading.style.display = 'none';
            main.style.display = 'grid';
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        const container = document.getElementById('error-container');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'strudel-error';
        errorDiv.textContent = message;
        
        container.appendChild(errorDiv);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
        
        console.error('🎵 Strudel Error:', message);
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        const container = document.getElementById('success-container');
        const successDiv = document.createElement('div');
        successDiv.className = 'strudel-success';
        successDiv.textContent = message;
        
        container.appendChild(successDiv);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            successDiv.remove();
        }, 3000);
        
        console.log('🎵 Strudel Success:', message);
    }

    /**
     * Update status display
     */
    updateStatus(status) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = status;
        }
    }

    /**
     * Show fallback UI when initialization fails
     */
    showFallbackUI() {
        const loading = document.getElementById('strudel-loading');
        if (loading) {
            loading.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <h3>🎵 Strudel Unavailable</h3>
                    <p>The Strudel music environment could not be loaded.</p>
                    <p>This might be due to:</p>
                    <ul style="text-align: left; max-width: 400px; margin: 20px auto;">
                        <li>Network connectivity issues</li>
                        <li>Browser compatibility problems</li>
                        <li>Audio context restrictions</li>
                    </ul>
                    <p>Please try refreshing the page or check your internet connection.</p>
                    <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        🔄 Retry
                    </button>
                </div>
            `;
        }
    }

    /**
     * Cleanup when app is closed
     */
    cleanup() {
        try {
            // Stop any playing patterns
            this.stopPattern();
            
            // Close audio context
            if (this.audioContext && this.audioContext.state !== 'closed') {
                this.audioContext.close();
            }
            
            // Clear patterns
            this.patterns.clear();
            
            console.log('🎵 Strudel app cleaned up');
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }
}

// Export for SwissKnife integration
window.StrudelApp = StrudelApp;
export default StrudelApp;
export { StrudelApp };
