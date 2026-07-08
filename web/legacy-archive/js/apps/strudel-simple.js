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
     * Create the user interface
     */
    createUI(container) {
        container.innerHTML = `
            <div class="strudel-app">
                <!-- Header with transport controls -->
                <div class="strudel-header">
                    <div class="transport-controls">
                        <button id="play-btn" class="play">▶️ Play</button>
                        <button id="pause-btn" class="pause" disabled>⏸️ Pause</button>
                        <button id="stop-btn" class="stop" disabled>⏹️ Stop</button>
                    </div>
                    
                    <div class="tempo-control">
                        <label>BPM:</label>
                        <input type="number" id="bpm-input" value="120" min="60" max="200">
                    </div>
                    
                    <div class="volume-control">
                        <label>Volume:</label>
                        <input type="range" id="volume-input" value="0.7" min="0" max="1" step="0.1">
                    </div>
                    
                    <div id="status" class="status">Ready</div>
                </div>

                <!-- Main content area -->
                <div class="strudel-content">
                    <!-- Pattern editor -->
                    <div class="editor-section">
                        <div class="editor-header">
                            <h3>Pattern Editor</h3>
                            <button id="evaluate-btn" class="evaluate">🎯 Run Pattern</button>
                        </div>
                        <textarea id="pattern-editor" class="pattern-input" placeholder="Enter your pattern here...
Examples:
bd hh sd hh    (drum pattern)
c3 d3 e3 f3    (melody)
c2 f2 g2 c2    (bassline)">bd hh sd hh</textarea>
                    </div>

                    <!-- Pattern examples -->
                    <div class="examples-section">
                        <h3>Pattern Examples</h3>
                        <div id="pattern-examples" class="pattern-examples"></div>
                    </div>
                </div>

                <!-- Status messages -->
                <div id="message-area" class="message-area"></div>
            </div>
        `;
    }

    /**
     * Initialize Web Audio API
     */
    async initializeAudio() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            
            if (!AudioContextClass) {
                throw new Error('Web Audio API not supported');
            }
            
            this.audioContext = new AudioContextClass();
            console.log('✅ Audio context created');
            
            // Create a master gain node for volume control
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            this.masterGain.gain.value = 0.7;
            
        } catch (error) {
            throw new Error(`Audio initialization failed: ${error.message}`);
        }
    }

    /**
     * Load default patterns
     */
    loadDefaultPatterns() {
        const examples = [
            { name: 'House Beat', code: 'bd hh sd hh', description: 'Classic house drum pattern' },
            { name: 'Techno', code: 'bd bd hh sd', description: 'Driving techno beat' },
            { name: 'Melody', code: 'c3 d3 e3 f3', description: 'Simple ascending melody' },
            { name: 'Bass', code: 'c2 c2 f2 g2', description: 'Funky bassline' },
            { name: 'Chord', code: 'c3 e3 g3 c4', description: 'Major chord arpeggio' }
        ];

        const container = document.getElementById('pattern-examples');
        container.innerHTML = '';

        examples.forEach(example => {
            const div = document.createElement('div');
            div.className = 'pattern-example';
            div.innerHTML = `
                <div class="example-name">${example.name}</div>
                <div class="example-description">${example.description}</div>
                <div class="example-code">${example.code}</div>
            `;
            
            div.addEventListener('click', () => {
                document.getElementById('pattern-editor').value = example.code;
                this.showSuccess(`Loaded: ${example.name}`);
            });
            
            container.appendChild(div);
        });

        // Set initial pattern
        this.patterns.set('pattern1', 'bd hh sd hh');
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Transport controls
        document.getElementById('play-btn').addEventListener('click', () => this.playPattern());
        document.getElementById('pause-btn').addEventListener('click', () => this.pausePattern());
        document.getElementById('stop-btn').addEventListener('click', () => this.stopPattern());
        
        // Evaluate button
        document.getElementById('evaluate-btn').addEventListener('click', () => this.evaluateCurrentPattern());
        
        // Volume control
        document.getElementById('volume-input').addEventListener('input', (e) => {
            if (this.masterGain) {
                this.masterGain.gain.value = parseFloat(e.target.value);
            }
        });
        
        // Enter key in editor to evaluate
        document.getElementById('pattern-editor').addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.evaluateCurrentPattern();
            }
        });
    }

    /**
     * Evaluate the current pattern
     */
    async evaluateCurrentPattern() {
        const editor = document.getElementById('pattern-editor');
        const code = editor.value.trim();
        
        if (!code) {
            this.showError('Please enter a pattern first');
            return;
        }
        
        try {
            await this.evaluatePattern(code);
        } catch (error) {
            this.showError(`Pattern error: ${error.message}`);
        }
    }

    /**
     * Evaluate a pattern string
     */
    async evaluatePattern(code) {
        console.log('🎵 Evaluating pattern:', code);
        
        if (!this.audioContext) {
            throw new Error('Audio context not available');
        }

        // Stop any currently playing pattern
        if (this.isPlaying) {
            this.stopPattern();
        }

        // Parse the pattern
        const pattern = this.parsePattern(code);
        
        this.currentPattern = {
            code: code,
            pattern: pattern,
            isPlaying: false,
            startTime: null,
            scheduledEvents: []
        };

        this.patterns.set(this.activeTab, code);
        this.showSuccess('✅ Pattern compiled! Click Play to hear it.');
    }

    /**
     * Parse a simple pattern string
     */
    parsePattern(code) {
        const events = [];
        const tokens = code.split(/\s+/);
        
        tokens.forEach((token, index) => {
            const time = index * 0.25; // Quarter note intervals
            
            // Check if it's a drum sound
            if (['bd', 'kick'].includes(token.toLowerCase())) {
                events.push({ type: 'drum', sound: 'kick', time });
            } else if (['sd', 'snare'].includes(token.toLowerCase())) {
                events.push({ type: 'drum', sound: 'snare', time });
            } else if (['hh', 'hihat'].includes(token.toLowerCase())) {
                events.push({ type: 'drum', sound: 'hihat', time });
            } else if (token.match(/^[a-g][#b]?\d+$/i)) {
                // Musical note (e.g., c3, f#4, bb2)
                events.push({ type: 'note', note: token, time });
            }
        });
        
        return {
            events: events,
            duration: Math.max(1.0, tokens.length * 0.25)
        };
    }

    /**
     * Play the current pattern
     */
    async playPattern() {
        if (!this.currentPattern) {
            this.showError('No pattern to play. Evaluate a pattern first.');
            return;
        }

        if (!this.audioContext) {
            this.showError('Audio context not available');
            return;
        }

        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
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
                try {
                    event.source.stop();
                } catch (e) {
                    // Source might already be stopped
                }
            }
        });
        this.currentPattern.scheduledEvents = [];

        // Schedule events from the pattern
        pattern.events.forEach(event => {
            const eventTime = startTime + (event.time * beatDuration);
            this.scheduleAudioEvent(event, eventTime);
        });

        // Schedule pattern to loop
        const patternDuration = pattern.duration * beatDuration;
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
            if (event.type === 'drum') {
                this.playDrumSound(event.sound, time);
            } else if (event.type === 'note') {
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
            kick: { freq: 60, type: 'sine', attack: 0.01, decay: 0.3, gain: 0.8 },
            snare: { freq: 200, type: 'square', attack: 0.01, decay: 0.1, gain: 0.6 },
            hihat: { freq: 8000, type: 'square', attack: 0.01, decay: 0.05, gain: 0.4 }
        };

        const config = drumConfig[soundName] || drumConfig.kick;

        oscillator.type = config.type;
        oscillator.frequency.setValueAtTime(config.freq, time);

        // Envelope
        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(config.gain, time + config.attack);
        gainNode.gain.exponentialRampToValueAtTime(0.01, time + config.decay);

        // Connect audio graph
        oscillator.connect(gainNode);
        gainNode.connect(this.masterGain);

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
        gainNode.connect(this.masterGain);

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
            'c': 0, 'c#': 1, 'db': 1, 'd': 2, 'd#': 3, 'eb': 3, 'e': 4, 'f': 5,
            'f#': 6, 'gb': 6, 'g': 7, 'g#': 8, 'ab': 8, 'a': 9, 'a#': 10, 'bb': 10, 'b': 11
        };

        const match = noteName.toLowerCase().match(/([a-g][#b]?)(\d+)/);
        if (!match) return 440; // Default to A4

        const [, note, octave] = match;
        const noteNumber = noteMap[note];
        const octaveNumber = parseInt(octave);

        // Calculate frequency using A4 = 440Hz as reference
        const semitonesFromA4 = (octaveNumber - 4) * 12 + (noteNumber - 9);
        return 440 * Math.pow(2, semitonesFromA4 / 12);
    }

    /**
     * Stop pattern playback
     */
    stopPattern() {
        this.isPlaying = false;

        if (this.currentPattern) {
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

        this.updateStatus('⏹️ Stopped');
        console.log('🛑 Pattern stopped');
    }

    /**
     * Pause pattern playback
     */
    pausePattern() {
        this.stopPattern(); // For simplicity, pause acts like stop
        this.updateStatus('⏸️ Paused');
    }

    /**
     * Get current BPM setting
     */
    getBPM() {
        const bpmInput = document.getElementById('bpm-input');
        return bpmInput ? parseInt(bpmInput.value) || 120 : 120;
    }

    /**
     * Update status display
     */
    updateStatus(message) {
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    /**
     * Show loading state
     */
    showLoadingState(message) {
        this.updateStatus(`⏳ ${message}`);
    }

    /**
     * Hide loading state
     */
    hideLoadingState() {
        this.updateStatus('Ready');
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    /**
     * Show error message
     */
    showError(message) {
        this.showMessage(message, 'error');
    }

    /**
     * Show message in message area
     */
    showMessage(message, type) {
        const messageArea = document.getElementById('message-area');
        if (!messageArea) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;

        messageArea.appendChild(messageDiv);

        // Remove message after 5 seconds
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 5000);

        console.log(type === 'error' ? `❌ ${message}` : `✅ ${message}`);
    }

    /**
     * Clean up when app is closed
     */
    cleanup() {
        try {
            if (this.isPlaying) {
                this.stopPattern();
            }

            if (this.audioContext && this.audioContext.state !== 'closed') {
                this.audioContext.close();
            }

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
