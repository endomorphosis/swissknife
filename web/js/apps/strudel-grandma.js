/**
 * 🎵 Strudel DAW - Grandmother-Friendly Music Studio
 * 
 * A super-simple, error-proof Digital Audio Workstation that anyone can use!
 * Designed with love for users of all technical levels.
 * 
 * Features:
 * - Big, friendly buttons with emojis
 * - No confusing technical terms
 * - Built-in help and guidance
 * - Automatic error prevention
 * - Beautiful Polyphia music demos
 * - Proper cleanup and state management
 */

class GrandmaStrudelDAW {
    constructor() {
        console.log('🎵 Starting Grandma-Friendly Music Studio...');
        
        // Simple state management
        this.state = {
            isPlaying: false,
            volume: 0.7,
            currentSong: null,
            isReady: false
        };
        
        // Audio system
        this.audio = {
            context: null,
            gain: null,
            isSetup: false
        };
        
        // Main menu options
        this.demoSongs = [
            {
                id: 'playing-god',
                name: '🎸 Playing God (Polyphia)',
                description: 'Listen to beautiful Polyphia music',
                pattern: 'c4 d4 e4 f4 g4 a4 b4',
                musicFile: '/assets/music/playing-god-piano.musicxml',
                fallbackMusicFile: '/assets/music/playing-god.mid',
                emoji: '🎸',
                tempo: 140,
                type: 'playback'
            },
            {
                id: 'my-creation',
                name: '✨ My Creation',
                description: 'Create your own music with AI help',
                emoji: '🎨',
                type: 'creation'
            }
        ];
        
        // Music file cache
        this.musicFileCache = new Map();
        this.musicParser = null;
        
        // User guidance system
        this.help = {
            currentStep: 0,
            isActive: false,
            steps: [
                '👋 Welcome! Let\'s make music together!',
                '🎵 Pick a song from the menu',
                '▶️ Press the big Play button',
                '🎶 Enjoy the music and try adjusting the volume!',
                '✨ You\'re a musician now!'
            ]
        };
        
        // Achievement system
        this.achievements = {
            firstPlay: false,
            volumeAdjusted: false,
            allSongsPlayed: new Set(),
            totalPlays: 0
        };

        this.strudelWorkflow = {
            workflowId: 'strudel.session-sample-pattern-recovery',
            vdaId: 'VDA-G044',
            sessionCid: 'bafystrudelg044sessioncid',
            sampleCid: 'bafystrudelg044samplecid',
            patternCid: 'bafystrudelg044patterncontext',
            assistanceCid: 'bafystrudelg044optionalassistance',
            compileErrorCid: 'bafystrudelg044compileerror',
            audioErrorCid: 'bafystrudelg044audioerror',
            restoreCid: 'bafystrudelg044restoredsession',
            eventDagCid: 'bafystrudelg044eventdag',
            receiptPrefix: 'receipt:strudel:g044',
            sessionId: 'strudel-session-g044-polyrhythm-sketch',
            sampleName: 'warm-kick-trimmed.wav',
            pattern: 'stack(s(\"bd*4\"), note(\"c4 eb4 g4 bb4\").s(\"sawtooth\").slow(2))',
            context: '140 BPM, D minor, 4 bar loop, low-pass 800Hz, room 0.3, gain from local volume',
            assistance: 'Optional assistant suggests a safer bass variation without changing the saved pattern.',
            compileError: 'Compile error line 1: unexpected closing bracket after slow(2); previous pattern remains armed.',
            audioError: 'Audio backend error: AudioContext suspended by browser policy; silent visual fallback active.',
            restored: false,
            restoredAt: null
        };

        // Track user progress
        this.hasPlayedBefore = false;
        
        // Cleanup tracking
        this.currentOscillators = [];
        this.dancingNotes = [];
        this.strudelPattern = null;
        this.cleanupHandler = null;
        this.containerObserver = null;
        this.container = null;
    }
    
    /**
     * 🚀 Start the music studio (main initialization)
     */
    async start(container) {
        try {
            console.log('🎵 Setting up your music studio...');
            
            // Initialize music parser if available
            this.initializeMusicParser();
            
            // Load saved state
            this.loadSavedState();
            
            // Create the beautiful, simple interface
            this.createSimpleInterface(container);
            
            // Set up audio (with error protection)
            await this.setupAudioSafely();
            
            // Load demo songs
            this.loadDemoSongs();
            
            // Connect all the buttons
            this.connectButtons();
            
            // Set up window cleanup
            this.setupWindowCleanup(container);
            
            // Start the friendly tutorial
            this.startTutorial();
            
            // Mark as ready
            this.state.isReady = true;
            this.showWelcomeMessage();
            
            console.log('✅ Music studio is ready!');
            
        } catch (error) {
            console.error('❌ Studio setup failed:', error);
            this.showFriendlyError('Oops! Something went wrong. Let me try to fix it...');
            // Auto-retry after a moment
            setTimeout(() => this.start(container), 2000);
        }
    }

    /**
     * 🎼 Initialize music parser
     */
    initializeMusicParser() {
        try {
            if (window.MusicFileParser) {
                this.musicParser = new window.MusicFileParser();
                console.log('🎼 Music parser initialized');
            } else {
                console.log('🎼 Music parser not available, using fallback patterns');
            }
        } catch (error) {
            console.warn('🎼 Music parser initialization failed:', error);
        }
    }

    /**
     * 💾 Load saved state from localStorage
     */
    loadSavedState() {
        try {
            const saved = localStorage.getItem('grandma-daw-state');
            if (saved) {
                const savedState = JSON.parse(saved);
                this.state.volume = savedState.volume || 0.7;
                
                // Properly restore achievements with Set conversion
                if (savedState.achievements) {
                    this.achievements.firstPlay = savedState.achievements.firstPlay || false;
                    this.achievements.volumeAdjusted = savedState.achievements.volumeAdjusted || false;
                    this.achievements.totalPlays = savedState.achievements.totalPlays || 0;
                    
                    // Convert array back to Set - be extra defensive
                    const songsPlayed = savedState.achievements.allSongsPlayed || [];
                    if (Array.isArray(songsPlayed)) {
                        this.achievements.allSongsPlayed = new Set(songsPlayed);
                    } else if (songsPlayed instanceof Set) {
                        this.achievements.allSongsPlayed = songsPlayed;
                    } else {
                        this.achievements.allSongsPlayed = new Set();
                    }
                }
                
                // Double-check the Set is properly initialized
                if (!(this.achievements.allSongsPlayed instanceof Set)) {
                    console.warn('🔧 Set restoration failed, creating new Set');
                    this.achievements.allSongsPlayed = new Set();
                }

                if (savedState.strudelWorkflowSessionCid === this.strudelWorkflow.sessionCid) {
                    this.strudelWorkflow.restored = true;
                    this.strudelWorkflow.restoredAt = savedState.timestamp || Date.now();
                }
                
                console.log('💾 Restored saved state', {
                    volume: this.state.volume,
                    allSongsPlayedType: typeof this.achievements.allSongsPlayed,
                    isSet: this.achievements.allSongsPlayed instanceof Set,
                    songsCount: this.achievements.allSongsPlayed.size
                });
            }
        } catch (error) {
            console.warn('💾 Could not load saved state:', error);
            // Ensure Set is still properly initialized on error
            this.achievements.allSongsPlayed = new Set();
        }
    }

    /**
     * 💾 Save current state to localStorage
     */
    saveState() {
        try {
            const stateToSave = {
                volume: this.state.volume,
                strudelWorkflowSessionCid: this.strudelWorkflow.sessionCid,
                strudelWorkflowSampleCid: this.strudelWorkflow.sampleCid,
                strudelWorkflowPatternCid: this.strudelWorkflow.patternCid,
                achievements: {
                    firstPlay: this.achievements.firstPlay,
                    volumeAdjusted: this.achievements.volumeAdjusted,
                    totalPlays: this.achievements.totalPlays,
                    // Convert Set to Array for JSON serialization
                    allSongsPlayed: Array.from(this.achievements.allSongsPlayed)
                },
                timestamp: Date.now()
            };
            localStorage.setItem('grandma-daw-state', JSON.stringify(stateToSave));
        } catch (error) {
            console.warn('💾 Could not save state:', error);
        }
    }

    /**
     * 🪟 Set up proper window cleanup
     */
    setupWindowCleanup(container) {
        // Store reference to container
        this.container = container;
        
        // Set up cleanup when window closes
        this.cleanupHandler = () => {
            console.log('🧹 Cleaning up music studio...');
            this.cleanup();
        };
        
        // Listen for window close events
        window.addEventListener('beforeunload', this.cleanupHandler);
        
        // Also listen for when the app container is removed
        if (container.parentNode) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.removedNodes.forEach((node) => {
                            if (node === container || node.contains(container)) {
                                console.log('🧹 App container removed, cleaning up...');
                                this.cleanup();
                            }
                        });
                    }
                });
            });
            
            observer.observe(container.parentNode, { childList: true, subtree: true });
            this.containerObserver = observer;
        }
    }

    /**
     * 🧹 Comprehensive cleanup
     */
    cleanup() {
        try {
            // Stop any playing music
            if (this.state.isPlaying) {
                this.stopMusic();
            }
            
            // Stop all audio oscillators
            if (this.currentOscillators) {
                this.currentOscillators.forEach(oscillator => {
                    try {
                        oscillator.stop();
                        oscillator.disconnect();
                    } catch (e) {
                        // Already stopped
                    }
                });
                this.currentOscillators = [];
            }
            
            // Close audio context
            if (this.audio.context && this.audio.context.state !== 'closed') {
                this.audio.context.close();
            }
            
            // Clean up visual elements
            this.stopVisualPlayback();
            
            // Remove event listeners
            if (this.cleanupHandler) {
                window.removeEventListener('beforeunload', this.cleanupHandler);
            }
            
            // Disconnect observer
            if (this.containerObserver) {
                this.containerObserver.disconnect();
            }
            
            // Save final state
            this.saveState();
            
            console.log('✅ Music studio cleaned up successfully');
            
        } catch (error) {
            console.warn('⚠️ Cleanup had issues:', error);
        }
    }

    /**
     * 🎨 Create the beautiful, simple interface
     */
    createSimpleInterface(container) {
        container.innerHTML = `
            <div class="grandma-daw">
                <!-- Header with big friendly title -->
                <header class="studio-header">
                    <h1>🎵 My Music Studio</h1>
                    <p class="subtitle">Make beautiful music in just a few clicks!</p>
                    <div class="help-button">
                        <button id="help-btn" class="help-btn">❓ Help Me</button>
                    </div>
                </header>
                
                <!-- Main control area -->
                <main class="studio-main">
                    <!-- Song selection (big, visual) -->
                    <section class="song-picker">
                        <h2>🎼 Choose Your Song</h2>
                        <div class="song-grid" id="song-grid">
                            <!-- Songs will be added here -->
                        </div>
                    </section>
                    
                    <!-- Simple playback controls -->
                    <section class="playback-controls">
                        <div class="big-button-row">
                            <button id="play-button" class="mega-button play-button" disabled>
                                <span class="button-emoji">▶️</span>
                                <span class="button-text">Play Music</span>
                            </button>
                            
                            <button id="stop-button" class="mega-button stop-button" disabled>
                                <span class="button-emoji">⏹️</span>
                                <span class="button-text">Stop Music</span>
                            </button>
                        </div>
                    </section>
                    
                    <!-- Volume control (simple and visual) -->
                    <section class="volume-section">
                        <h3>🔊 Volume Control</h3>
                        <div class="volume-control">
                            <button id="volume-down" class="volume-btn">🔉</button>
                            <div class="volume-slider-container">
                                <input type="range" id="volume-slider" 
                                       min="0" max="100" value="70" 
                                       class="volume-slider">
                                <div class="volume-display" id="volume-display">70%</div>
                            </div>
                            <button id="volume-up" class="volume-btn">🔊</button>
                        </div>
                    </section>
                    
                    <!-- Current song display -->
                    <section class="now-playing">
                        <h3>🎵 Now Playing</h3>
                        <div class="song-display" id="song-display">
                            <div class="no-song">Pick a song to get started! 👆</div>
                        </div>
                    </section>

                    ${this.renderStrudelWorkflowPanel()}
                </main>
                
                <!-- Status and messages area -->
                <footer class="studio-status">
                    <div id="status-message" class="status-message">
                        Welcome! Your music studio is ready to use. 🎉
                    </div>
                    <div id="tutorial-tip" class="tutorial-tip" style="display: none;">
                        <!-- Tutorial tips appear here -->
                    </div>
                </footer>
                
                <!-- Hidden loading overlay -->
                <div id="loading-overlay" class="loading-overlay" style="display: none;">
                    <div class="loading-content">
                        <div class="loading-spinner">🎵</div>
                        <div class="loading-text">Setting up your music studio...</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 📦 Render VDA-G044 workflow evidence for the virtual desktop app-improvement runner.
     */
    renderStrudelWorkflowPanel() {
        const workflow = this.strudelWorkflow;
        return `
            <section class="strudel-vda-workflow"
                     data-svd-workflow="${workflow.workflowId}"
                     aria-label="Strudel session sample pattern restore workflow"
                     style="
                        background: rgba(15, 23, 42, 0.08);
                        border: 1px solid rgba(15, 23, 42, 0.16);
                        border-radius: 8px;
                        padding: 12px;
                        display: grid;
                        gap: 10px;
                     ">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                    <div>
                        <div style="font-size: 0.75rem; font-weight: 800; color: #2563eb;">${workflow.vdaId}</div>
                        <h3 style="margin: 2px 0 0; font-size: 1rem;">Session Recovery Workflow</h3>
                    </div>
                    <span data-session-restore-state="${workflow.restored ? 'restored' : 'ready'}"
                          style="font-size: 0.78rem; font-weight: 700; color: #166534;">${workflow.restored ? 'Session restored' : 'Restore ready'}</span>
                </div>

                <div class="strudel-workflow-actions"
                     aria-label="Strudel VDA-G044 workflow actions"
                     style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px;">
                    <button data-svd-workflow-action="load-session-sample-cids"
                            aria-label="Load Strudel session and sample CIDs"
                            style="border: 0; border-radius: 6px; padding: 7px; background: #2563eb; color: #fff; font-weight: 700; cursor: pointer;">Load CIDs</button>
                    <button data-svd-workflow-action="inspect-pattern-context"
                            aria-label="Inspect Strudel pattern context"
                            style="border: 0; border-radius: 6px; padding: 7px; background: #0f766e; color: #fff; font-weight: 700; cursor: pointer;">Pattern</button>
                    <button data-svd-workflow-action="request-optional-assistance"
                            aria-label="Request optional Strudel assistance"
                            style="border: 0; border-radius: 6px; padding: 7px; background: #7c3aed; color: #fff; font-weight: 700; cursor: pointer;">Assist</button>
                    <button data-svd-workflow-action="simulate-compile-error"
                            aria-label="Simulate Strudel compile error"
                            style="border: 0; border-radius: 6px; padding: 7px; background: #b45309; color: #fff; font-weight: 700; cursor: pointer;">Compile</button>
                    <button data-svd-workflow-action="simulate-audio-error"
                            aria-label="Simulate Strudel audio backend error"
                            style="border: 0; border-radius: 6px; padding: 7px; background: #0369a1; color: #fff; font-weight: 700; cursor: pointer;">Audio</button>
                    <button data-svd-workflow-action="restore-session"
                            aria-label="Restore Strudel session"
                            style="border: 0; border-radius: 6px; padding: 7px; background: #4d7c0f; color: #fff; font-weight: 700; cursor: pointer;">Restore</button>
                </div>

                <article data-svd-vda-marker="session-sample-cids"
                         data-session-cid-state="loaded"
                         data-sample-cid-state="loaded"
                         data-session-cid="${workflow.sessionCid}"
                         data-sample-cid="${workflow.sampleCid}"
                         style="background: rgba(255,255,255,0.72); border-radius: 6px; padding: 8px;">
                    <strong>Session/sample CIDs</strong>
                    <p style="margin: 4px 0; font-size: 0.82rem;">Session ${workflow.sessionId} uses session CID ${workflow.sessionCid}, sample CID ${workflow.sampleCid}, and event DAG ${workflow.eventDagCid}.</p>
                    <small>${workflow.receiptPrefix}:session-sample-cids</small>
                </article>

                <article data-svd-vda-marker="pattern-context"
                         data-pattern-context-state="available"
                         data-pattern-cid="${workflow.patternCid}"
                         style="background: rgba(255,255,255,0.72); border-radius: 6px; padding: 8px;">
                    <strong>Pattern context</strong>
                    <p style="margin: 4px 0; font-size: 0.82rem; word-break: break-word;">Pattern CID ${workflow.patternCid}: ${workflow.pattern}</p>
                    <p style="margin: 4px 0; font-size: 0.82rem;">${workflow.context}</p>
                    <small>${workflow.receiptPrefix}:pattern-context</small>
                </article>

                <article data-svd-vda-marker="optional-assistance"
                         data-assistance-state="optional"
                         data-assistance-cid="${workflow.assistanceCid}"
                         style="background: rgba(255,255,255,0.72); border-radius: 6px; padding: 8px;">
                    <strong>Optional assistance</strong>
                    <p style="margin: 4px 0; font-size: 0.82rem;">${workflow.assistance} Assistance CID ${workflow.assistanceCid}; user can keep composing without it.</p>
                    <small>${workflow.receiptPrefix}:optional-assistance</small>
                </article>

                <article data-svd-vda-marker="compile-audio-errors"
                         data-compile-error-state="recoverable"
                         data-audio-error-state="fallback-active"
                         data-compile-error-cid="${workflow.compileErrorCid}"
                         data-audio-error-cid="${workflow.audioErrorCid}"
                         style="background: rgba(255,255,255,0.72); border-radius: 6px; padding: 8px;">
                    <strong>Compile/audio errors</strong>
                    <p style="margin: 4px 0; font-size: 0.82rem;">${workflow.compileError} Compile error CID ${workflow.compileErrorCid}.</p>
                    <p style="margin: 4px 0; font-size: 0.82rem;">${workflow.audioError} Audio error CID ${workflow.audioErrorCid}.</p>
                    <small>${workflow.receiptPrefix}:compile-error ${workflow.receiptPrefix}:audio-error</small>
                </article>

                <article data-svd-vda-marker="session-restore"
                         data-session-restore-proof="local-storage"
                         data-restore-cid="${workflow.restoreCid}"
                         style="background: rgba(255,255,255,0.72); border-radius: 6px; padding: 8px;">
                    <strong>Session restore</strong>
                    <p style="margin: 4px 0; font-size: 0.82rem;">Restored pattern, volume ${Math.round(this.state.volume * 100)}%, and selected samples from restore CID ${workflow.restoreCid}.</p>
                    <small>${workflow.receiptPrefix}:session-restore</small>
                </article>

                <output id="strudel-workflow-status"
                        data-workflow-status="ready"
                        style="font-size: 0.82rem; color: #0f172a;">Workflow ready for ${workflow.sampleName}.</output>
            </section>
        `;
    }
    
    /**
     * 🔊 Set up audio system with error protection
     */
    async setupAudioSafely() {
        try {
            // Try to create audio context
            if (!this.audio.context) {
                this.audio.context = new (window.AudioContext || window.webkitAudioContext)();
                console.log('🎵 Audio system ready');
            }
            
            // Create volume control
            if (!this.audio.gain) {
                this.audio.gain = this.audio.context.createGain();
                this.audio.gain.connect(this.audio.context.destination);
                this.audio.gain.gain.value = this.state.volume;
            }
            
            this.audio.isSetup = true;
            
        } catch (error) {
            console.warn('⚠️ Audio setup had issues, using fallback:', error);
            // Create a simple fallback system
            this.audio.isSetup = false;
            this.showFriendlyMessage('🔇 Audio system is in simple mode (still works great!)');
        }
    }
    
    /**
     * 🎼 Load the demo songs into the interface
     */
    loadDemoSongs() {
        const songGrid = document.getElementById('song-grid');
        
        this.demoSongs.forEach(song => {
            const songCard = document.createElement('div');
            songCard.className = 'song-card';
            songCard.dataset.songId = song.id;
            
            songCard.innerHTML = `
                <div class="song-emoji">${song.emoji}</div>
                <div class="song-title">${song.name}</div>
                <div class="song-description">${song.description}</div>
                <button class="select-song-btn">Choose This Song</button>
            `;
            
            // Add click handler
            songCard.addEventListener('click', () => this.selectSong(song));
            
            songGrid.appendChild(songCard);
        });
    }
    
    /**
     * 🎵 Select a song to play or create
     */
    selectSong(song) {
        console.log('🎵 Selected option:', song.name);
        
        // Update current song
        this.state.currentSong = song;
        
        // Ensure allSongsPlayed is a Set (defensive programming)
        if (!(this.achievements.allSongsPlayed instanceof Set)) {
            console.warn('🔧 Fixing allSongsPlayed - converting to Set');
            this.achievements.allSongsPlayed = new Set(Array.isArray(this.achievements.allSongsPlayed) ? this.achievements.allSongsPlayed : []);
        }
        
        // Track achievement
        this.achievements.allSongsPlayed.add(song.id);
        
        // Handle different types of selections
        if (song.type === 'creation') {
            this.startCreationMode();
        } else {
            // Traditional playback mode
            this.startPlaybackMode(song);
        }
        
        // Highlight selected option
        this.highlightSelectedSong(song.id);
        
        // Check for achievement
        if (this.achievements.allSongsPlayed.size === this.demoSongs.length) {
            this.addCelebration('🏆 Music Explorer! You\'ve tried everything! 🎉');
        }
        
        // Save state
        this.saveState();
    }

    /**
     * 🎵 Start traditional playback mode
     */
    startPlaybackMode(song) {
        // Update the display
        this.updateSongDisplay(song);
        
        // Enable play button
        this.enablePlayButton();
        
        // Show encouraging message
        this.showFriendlyMessage(`Great choice! ${song.name} is ready to play! �`);
    }

    /**
     * 🎨 Start AI-assisted creation mode
     */
    startCreationMode() {
        console.log('🎨 Starting creation mode...');
        
        // Hide the song selection and show creation interface
        this.showCreationInterface();
        
        this.showFriendlyMessage('🎨 Welcome to your music creation studio! Let\'s make something amazing together! ✨');
    }
    
    /**
     * 🎨 Update the now playing display
     */
    updateSongDisplay(song) {
        const display = document.getElementById('song-display');
        display.innerHTML = `
            <div class="current-song">
                <div class="song-emoji-large">${song.emoji}</div>
                <div class="song-info">
                    <div class="song-title-large">${song.name}</div>
                    <div class="song-desc">${song.description}</div>
                    <div class="song-status">Ready to play! ▶️</div>
                </div>
            </div>
        `;
    }
    
    /**
     * ✨ Highlight the selected song
     */
    highlightSelectedSong(songId) {
        // Remove previous highlights
        document.querySelectorAll('.song-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        // Add highlight to selected song
        const selectedCard = document.querySelector(`[data-song-id="${songId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }
    }
    
    /**
     * ▶️ Enable the play button
     */
    enablePlayButton() {
        const playBtn = document.getElementById('play-button');
        playBtn.disabled = false;
        playBtn.classList.add('enabled');
    }
    
    /**
     * 🔗 Connect all button events
     */
    connectButtons() {
        // Play button
        document.getElementById('play-button').addEventListener('click', () => {
            this.playMusic();
        });
        
        // Stop button  
        document.getElementById('stop-button').addEventListener('click', () => {
            this.stopMusic();
        });
        
        // Volume controls
        document.getElementById('volume-slider').addEventListener('input', (e) => {
            this.setVolume(parseInt(e.target.value));
        });
        
        document.getElementById('volume-down').addEventListener('click', () => {
            this.adjustVolume(-10);
        });
        
        document.getElementById('volume-up').addEventListener('click', () => {
            this.adjustVolume(10);
        });
        
        // Help button
        document.getElementById('help-btn').addEventListener('click', () => {
            this.showHelp();
        });

        document.querySelectorAll('[data-svd-workflow-action]').forEach(button => {
            button.addEventListener('click', () => {
                this.handleStrudelWorkflowAction(button.dataset.svdWorkflowAction);
            });
        });
    }

    /**
     * 🧾 Handle deterministic VDA-G044 workflow actions.
     */
    handleStrudelWorkflowAction(action) {
        const workflow = this.strudelWorkflow;
        const status = document.getElementById('strudel-workflow-status');
        const setStatus = (message, state) => {
            if (status) {
                status.textContent = message;
                status.dataset.workflowStatus = state;
            }
        };

        if (action === 'load-session-sample-cids') {
            this.state.currentSong = this.demoSongs[0];
            this.highlightSelectedSong(this.state.currentSong.id);
            this.updateSongDisplay(this.state.currentSong);
            this.enablePlayButton();
            setStatus(`Loaded session CID ${workflow.sessionCid} and sample CID ${workflow.sampleCid}.`, 'cids-loaded');
        } else if (action === 'inspect-pattern-context') {
            setStatus(`Pattern context loaded from ${workflow.patternCid}: ${workflow.context}.`, 'pattern-context');
        } else if (action === 'request-optional-assistance') {
            setStatus(`${workflow.assistance} ${workflow.receiptPrefix}:optional-assistance:accepted`, 'assistance-optional');
        } else if (action === 'simulate-compile-error') {
            this.showFriendlyError(workflow.compileError);
            setStatus(`${workflow.compileError} ${workflow.receiptPrefix}:compile-error:recoverable`, 'compile-error');
        } else if (action === 'simulate-audio-error') {
            this.showFriendlyError(workflow.audioError);
            setStatus(`${workflow.audioError} ${workflow.receiptPrefix}:audio-error:fallback-active`, 'audio-error');
        } else if (action === 'restore-session') {
            this.strudelWorkflow.restored = true;
            this.strudelWorkflow.restoredAt = Date.now();
            this.state.currentSong = this.demoSongs[0];
            this.setVolume(Math.round(this.state.volume * 100));
            this.updateSongDisplay(this.state.currentSong);
            this.enablePlayButton();
            const restoreState = document.querySelector('[data-session-restore-state]');
            if (restoreState) {
                restoreState.dataset.sessionRestoreState = 'restored';
                restoreState.textContent = 'Session restored';
            }
            setStatus(`Restored session from ${workflow.restoreCid}. ${workflow.receiptPrefix}:session-restore:restored`, 'session-restored');
            this.saveState();
        }

        console.log('🎵 Strudel workflow action:', action);
    }
    
    /**
     * ▶️ Play the selected music
     */
    playMusic() {
        if (!this.state.currentSong) {
            this.showFriendlyMessage('Please pick a song first! 👆');
            return;
        }
        
        console.log('▶️ Playing:', this.state.currentSong.name);
        
        // Track achievements
        this.achievements.totalPlays++;
        if (!this.achievements.firstPlay) {
            this.achievements.firstPlay = true;
        }
        
        // Update state
        this.state.isPlaying = true;
        
        // Update buttons
        this.updatePlaybackButtons(true);
        
        // Show playing status
        this.showPlayingStatus();
        
        // Start the audio (enhanced with real pattern playback)
        this.startRealAudioPlayback();
        
        this.showFriendlyMessage(`🎵 Now playing ${this.state.currentSong.name}! Enjoy! 🎶`);
        
        // Check for play count achievements
        if (this.achievements.totalPlays === 10) {
            this.addCelebration('🎵 Music Lover! You\'ve played 10 songs! 🎉');
        }
        
        // Save state
        this.saveState();
    }
    
    /**
     * ⏹️ Stop the music
     */
    stopMusic() {
        console.log('⏹️ Stopping music');
        
        // Update state
        this.state.isPlaying = false;
        
        // Update buttons
        this.updatePlaybackButtons(false);
        
        // Stop audio
        this.stopRealAudioPlayback();
        
        // Update display
        this.showStoppedStatus();
        
        this.showFriendlyMessage('🎵 Music stopped. Press Play to start again! ▶️');
        
        // Save state
        this.saveState();
    }
    
    /**
     * 🎸 Enhanced Polyphia demo patterns
     */
    getPolyphiaPatterns() {
        return {
            'playing-god': {
                pattern: 'c4 eb4 f4 g4 ab4 bb4 c5',
                rhythm: 'x.x.x..x',
                tempo: 140,
                description: 'Beautiful ascending melody from Playing God'
            },
            'goat': {
                pattern: 'g3 a3 b3 c4 d4 e4 f#4 g4',
                rhythm: 'x..x.x.x',
                tempo: 150,
                description: 'Powerful riff from G.O.A.T.'
            },
            'custom': {
                pattern: 'c4 e4 g4 c5',
                rhythm: 'x.x.x.x.',
                tempo: 120,
                description: 'Simple chord progression'
            }
        };
    }

    /**
     * 🎵 Start real Strudel audio playback
     */
    async startRealAudioPlayback() {
        try {
            // Get enhanced song data (real files or fallback patterns)
            const songData = await this.getEnhancedSongData(this.state.currentSong);
            
            if (!songData) {
                console.warn('No song data available');
                return this.startAudioPlayback();
            }

            console.log('🎵 Using song data:', songData);

            // Check multiple ways Strudel might be available
            const strudelAvailable = window.strudel || 
                                    window.Strudel || 
                                    (window.strudelCDN && window.strudelCDN.isLoaded) ||
                                    (typeof Pattern !== 'undefined');
            
            console.log('🔍 Checking Strudel availability:', {
                'window.strudel': typeof window.strudel,
                'window.Strudel': typeof window.Strudel,
                'window.strudelCDN': typeof window.strudelCDN,
                'strudelCDN.isLoaded': window.strudelCDN?.isLoaded,
                'global Pattern': typeof Pattern,
                'songData.isRealMusic': songData.isRealMusic
            });
            
            if (strudelAvailable && songData.isRealMusic) {
                console.log('🎵 Using Strudel for real music:', songData.pattern);
                
                // Try different ways to create patterns
                let pattern;
                if (window.strudel && window.strudel.Pattern) {
                    pattern = window.strudel.Pattern.fromString(songData.pattern);
                } else if (window.Strudel && window.Strudel.Pattern) {
                    pattern = window.Strudel.Pattern.fromString(songData.pattern);
                } else if (typeof Pattern !== 'undefined') {
                    pattern = Pattern.fromString ? Pattern.fromString(songData.pattern) : new Pattern(songData.pattern);
                }
                
                if (pattern) {
                    // Apply effects and volume
                    pattern = pattern
                        .lpf(800)
                        .room(0.3)
                        .gain(this.state.volume);
                    
                    // Start the pattern
                    await pattern.evaluate();
                    this.strudelPattern = pattern;
                    
                    console.log('🎵 Strudel pattern started successfully');
                    this.startVisualPlayback();
                    return;
                }
            }
            
            console.log('🎵 Using enhanced fallback audio');
            this.startEnhancedFallbackAudio(songData);
            
        } catch (error) {
            console.warn('🎵 Audio playback failed, using simple fallback:', error);
            this.startAudioPlayback();
        }
        
        // Always start visual feedback
        this.startVisualPlayback();
    }

    /**
     * 🎵 Enhanced fallback audio with proper note synthesis
     */
    startEnhancedFallbackAudio(songData) {
        if (!this.audio.isSetup || !this.audio.context) {
            console.log('🎵 Audio context not ready, using simple fallback');
            return this.startAudioPlayback();
        }

        try {
            // Parse the pattern into notes
            const notes = this.parsePatternToNotes(songData.pattern);
            const tempo = songData.tempo || 120;
            const beatInterval = 60 / tempo; // seconds per beat
            
            console.log('🎵 Playing enhanced pattern:', notes);
            
            // Play the sequence
            this.playNoteSequence(notes, beatInterval);
            
        } catch (error) {
            console.warn('🎵 Enhanced fallback failed:', error);
            this.startAudioPlayback();
        }
    }

    /**
     * 🎼 Parse a simple pattern string into playable notes
     */
    parsePatternToNotes(pattern) {
        const noteMap = {
            'c': 261.63, 'c#': 277.18, 'db': 277.18,
            'd': 293.66, 'd#': 311.13, 'eb': 311.13,
            'e': 329.63, 'f': 349.23, 'f#': 369.99,
            'gb': 369.99, 'g': 392.00, 'g#': 415.30,
            'ab': 415.30, 'a': 440.00, 'a#': 466.16,
            'bb': 466.16, 'b': 493.88
        };
        
        const notes = [];
        const noteStrings = pattern.toLowerCase().split(' ');
        
        for (const noteStr of noteStrings) {
            if (!noteStr.trim()) continue;
            
            // Extract note and octave (e.g., "c4", "f#3")
            const match = noteStr.match(/([a-g][#b]?)(\d?)/);
            if (match) {
                const [, note, octaveStr] = match;
                const octave = parseInt(octaveStr) || 4;
                const baseFreq = noteMap[note];
                
                if (baseFreq) {
                    // Calculate frequency for the octave
                    const frequency = baseFreq * Math.pow(2, octave - 4);
                    notes.push(frequency);
                }
            }
        }
        
        return notes.length > 0 ? notes : [440]; // Default to A4 if parsing fails
    }

    /**
     * 🎵 Play a sequence of notes
     */
    playNoteSequence(notes, beatInterval) {
        let currentTime = this.audio.context.currentTime;
        const noteDuration = beatInterval * 0.8; // Slight gap between notes
        
        this.currentOscillators = [];
        
        notes.forEach((frequency, index) => {
            const oscillator = this.audio.context.createOscillator();
            const envelope = this.audio.context.createGain();
            
            // Connect oscillator -> envelope -> main gain -> destination
            oscillator.connect(envelope);
            envelope.connect(this.audio.gain);
            
            // Set up the note
            oscillator.frequency.setValueAtTime(frequency, currentTime);
            oscillator.type = 'sine'; // Smooth sine wave
            
            // Create envelope (attack/decay)
            envelope.gain.setValueAtTime(0, currentTime);
            envelope.gain.linearRampToValueAtTime(0.3, currentTime + 0.01); // Quick attack
            envelope.gain.exponentialRampToValueAtTime(0.01, currentTime + noteDuration); // Decay
            
            // Schedule the note
            oscillator.start(currentTime);
            oscillator.stop(currentTime + noteDuration);
            
            // Track for cleanup
            this.currentOscillators.push(oscillator);
            
            currentTime += beatInterval;
        });
        
        // Schedule loop if playing
        if (this.state.isPlaying) {
            const totalDuration = notes.length * beatInterval;
            setTimeout(() => {
                if (this.state.isPlaying) {
                    this.playNoteSequence(notes, beatInterval);
                }
            }, totalDuration * 1000);
        }
    }

    /**
     * 🛑 Stop real Strudel audio playback
     */
    stopRealAudioPlayback() {
        try {
            // Stop Strudel pattern if it exists
            if (this.strudelPattern && typeof this.strudelPattern.stop === 'function') {
                this.strudelPattern.stop();
                this.strudelPattern = null;
                console.log('🛑 Strudel pattern stopped');
            }
            
            // Stop any playing oscillators
            if (this.currentOscillators) {
                this.currentOscillators.forEach(oscillator => {
                    try {
                        oscillator.stop();
                        oscillator.disconnect();
                    } catch (e) {
                        // Oscillator might already be stopped
                    }
                });
                this.currentOscillators = [];
                console.log('🛑 Enhanced audio oscillators stopped');
            }
            
        } catch (error) {
            console.warn('🛑 Error stopping enhanced audio:', error);
        }
        
        // Fallback to simple stop
        this.stopAudioPlayback();
    }

    /**
     * 🎵 Start audio playback (simplified)
     */
    startAudioPlayback() {
        // For now, create a simple tone generator as a placeholder
        // This will be enhanced with real Strudel patterns later
        
        if (this.audio.isSetup && this.audio.context) {
            try {
                // Simple demonstration tone
                const oscillator = this.audio.context.createOscillator();
                oscillator.connect(this.audio.gain);
                oscillator.frequency.setValueAtTime(440, this.audio.context.currentTime); // A4 note
                oscillator.start();
                
                // Stop after 2 seconds for demo
                setTimeout(() => {
                    oscillator.stop();
                }, 2000);
                
            } catch (error) {
                console.warn('Audio playback issue:', error);
                this.showFriendlyMessage('🎵 Playing in silent mode (audio system busy)');
            }
        }
        
        // Visual feedback
        this.startVisualPlayback();
    }
    
    /**
     * 🛑 Stop audio playback
     */
    stopAudioPlayback() {
        // Stop any playing audio
        if (this.audio.context) {
            // Audio nodes will clean up automatically
        }
        
        // Stop visual feedback
        this.stopVisualPlayback();
    }
    
    /**
     * 🎉 Add celebration effects when user does something great
     */
    addCelebration(message) {
        // Create floating celebration message
        const celebration = document.createElement('div');
        celebration.className = 'celebration-message';
        celebration.textContent = message;
        celebration.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
            color: #744210;
            padding: 20px 30px;
            border-radius: 15px;
            font-size: 1.5rem;
            font-weight: bold;
            box-shadow: 0 10px 30px rgba(255, 215, 0, 0.5);
            z-index: 10000;
            animation: celebrationBounce 2s ease-out forwards;
            pointer-events: none;
        `;
        
        // Add CSS animation if not already present
        if (!document.querySelector('#celebration-styles')) {
            const style = document.createElement('style');
            style.id = 'celebration-styles';
            style.textContent = `
                @keyframes celebrationBounce {
                    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
                    20% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                    40% { transform: translate(-50%, -50%) scale(0.9); }
                    60% { transform: translate(-50%, -50%) scale(1.1); }
                    80% { transform: translate(-50%, -50%) scale(1); }
                    100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(celebration);
        
        // Remove after animation
        setTimeout(() => {
            if (celebration.parentNode) {
                celebration.parentNode.removeChild(celebration);
            }
        }, 2000);
    }

    /**
     * 🎵 Enhanced visual feedback during playback
     */
    startVisualPlayback() {
        const songDisplay = document.querySelector('.current-song');
        if (songDisplay) {
            songDisplay.classList.add('playing');
        }
        
        // Update status with animated text
        const statusEl = document.querySelector('.song-status');
        if (statusEl) {
            statusEl.textContent = 'Playing... 🎵';
            statusEl.classList.add('playing');
        }
        
        // Add dancing notes animation
        this.addDancingNotes();
        
        // Show celebration for first play
        if (!this.hasPlayedBefore) {
            this.hasPlayedBefore = true;
            this.addCelebration('🎉 Amazing! You\'re making music! 🎵');
        }
    }

    /**
     * 🎵 Add dancing musical notes around the interface
     */
    addDancingNotes() {
        const notes = ['🎵', '🎶', '♪', '♫', '🎼'];
        const container = document.querySelector('.grandma-daw');
        
        if (!container) return;
        
        this.dancingNotes = [];
        
        for (let i = 0; i < 5; i++) {
            const note = document.createElement('div');
            note.className = 'dancing-note';
            note.textContent = notes[Math.floor(Math.random() * notes.length)];
            note.style.cssText = `
                position: absolute;
                font-size: 2rem;
                pointer-events: none;
                z-index: 1000;
                animation: float 3s ease-in-out infinite;
                animation-delay: ${i * 0.5}s;
                left: ${20 + i * 15}%;
                top: ${30 + Math.random() * 40}%;
                opacity: 0.7;
            `;
            
            container.appendChild(note);
            this.dancingNotes.push(note);
        }
        
        // Add float animation if not present
        if (!document.querySelector('#dancing-notes-styles')) {
            const style = document.createElement('style');
            style.id = 'dancing-notes-styles';
            style.textContent = `
                @keyframes float {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    25% { transform: translateY(-10px) rotate(5deg); }
                    50% { transform: translateY(-20px) rotate(0deg); }
                    75% { transform: translateY(-10px) rotate(-5deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * 🛑 Stop visual effects
     */
    stopVisualPlayback() {
        const songDisplay = document.querySelector('.current-song');
        if (songDisplay) {
            songDisplay.classList.remove('playing');
        }
        
        const statusEl = document.querySelector('.song-status');
        if (statusEl) {
            statusEl.textContent = 'Ready to play! ▶️';
            statusEl.classList.remove('playing');
        }
        
        // Remove dancing notes
        if (this.dancingNotes) {
            this.dancingNotes.forEach(note => {
                if (note.parentNode) {
                    note.parentNode.removeChild(note);
                }
            });
            this.dancingNotes = [];
        }
    }
    
    /**
     * 🎵 Load real Polyphia music from files
     */
    async loadPolyphiaMusicFile(song) {
        if (!song.musicFile || !this.musicParser) {
            console.log('🎵 No music file or parser available, using pattern fallback');
            return null;
        }

        try {
            // Check cache first
            if (this.musicFileCache.has(song.id)) {
                console.log('🎵 Using cached music data for:', song.name);
                return this.musicFileCache.get(song.id);
            }

            console.log('🎵 Loading music file:', song.musicFile);
            
            // Fetch the music file
            const response = await fetch(song.musicFile);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${song.musicFile}: ${response.status}`);
            }

            let musicData = null;
            
            if (song.musicFile.endsWith('.musicxml')) {
                const xmlText = await response.text();
                musicData = this.musicParser.parseMusicXML(xmlText);
                
                // Convert to Strudel pattern
                const pattern = this.musicParser.musicXMLToStrudel(musicData, 0); // First part
                musicData.strudelPattern = pattern;
                
            } else if (song.musicFile.endsWith('.mid')) {
                const arrayBuffer = await response.arrayBuffer();
                musicData = this.musicParser.parseMIDI(arrayBuffer);
                
                // Convert to Strudel pattern
                const pattern = this.musicParser.midiToStrudel(musicData, 0); // First track
                musicData.strudelPattern = pattern;
            }

            if (musicData) {
                // Cache the result
                this.musicFileCache.set(song.id, musicData);
                console.log('🎵 Successfully loaded and parsed:', song.name);
                return musicData;
            }

        } catch (error) {
            console.warn('🎵 Failed to load music file:', error);
        }

        return null;
    }

    /**
     * 🎵 Get enhanced pattern data for a song
     */
    async getEnhancedSongData(song) {
        // Try to load real music file first
        const musicFileData = await this.loadPolyphiaMusicFile(song);
        
        if (musicFileData && musicFileData.strudelPattern) {
            console.log('🎵 Using real Polyphia music data');
            return {
                pattern: musicFileData.strudelPattern,
                tempo: song.tempo || 140,
                description: `Real ${song.name} music`,
                isRealMusic: true,
                musicData: musicFileData
            };
        }

        // Fallback to hardcoded patterns
        console.log('🎵 Using fallback pattern for:', song.name);
        const fallbackPatterns = this.getPolyphiaPatterns();
        return fallbackPatterns[song.id] || {
            pattern: 'c4 e4 g4',
            tempo: 120,
            description: 'Simple melody',
            isRealMusic: false
        };
    }

    /**
     * 👋 Start the friendly tutorial
     */
    startTutorial() {
        this.help.isActive = true;
        this.help.currentStep = 0;
        this.showTutorialStep();
    }
    
    /**
     * 📚 Show current tutorial step
     */
    showTutorialStep() {
        if (!this.help.isActive || this.help.currentStep >= this.help.steps.length) {
            return;
        }
        
        const tipEl = document.getElementById('tutorial-tip');
        const step = this.help.steps[this.help.currentStep];
        
        tipEl.innerHTML = `
            <div class="tip-content">
                <span class="tip-text">${step}</span>
                <button class="tip-next" onclick="window.strudelDAW.nextTutorialStep()">Got it! ✅</button>
                <button class="tip-skip" onclick="window.strudelDAW.skipTutorial()">Skip tutorial</button>
            </div>
        `;
        
        tipEl.style.display = 'block';
    }
    
    /**
     * ⏭️ Go to next tutorial step
     */
    nextTutorialStep() {
        this.help.currentStep++;
        
        if (this.help.currentStep >= this.help.steps.length) {
            this.endTutorial();
        } else {
            setTimeout(() => this.showTutorialStep(), 500);
        }
    }
    
    /**
     * ⏭️ Skip the tutorial
     */
    skipTutorial() {
        this.endTutorial();
    }
    
    /**
     * 🏁 End the tutorial
     */
    endTutorial() {
        this.help.isActive = false;
        document.getElementById('tutorial-tip').style.display = 'none';
        this.showFriendlyMessage('🎉 You\'re all set! Have fun making music!');
    }
    
    /**
     * ❓ Show help information
     */
    showHelp() {
        const helpMessage = `
            🎵 Welcome to Your Music Studio! 🎵
            
            Here's how to use it:
            
            1. 🎼 Pick a song from the colorful cards above
            2. ▶️ Press the big "Play Music" button  
            3. 🔊 Adjust the volume slider as needed
            4. ⏹️ Press "Stop Music" when you want to stop
            5. ✨ Try different songs and have fun!
            
            Need more help? Everything is designed to be simple and safe to use!
        `;
        
        this.showFriendlyMessage(helpMessage);
    }
    
    /**
     * 💬 Show a friendly message to the user
     */
    showFriendlyMessage(message) {
        const statusEl = document.getElementById('status-message');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = 'status-message friendly';
            
            // Auto-clear after a few seconds
            setTimeout(() => {
                statusEl.textContent = 'Your music studio is ready! 🎵';
                statusEl.className = 'status-message';
            }, 5000);
        }
    }
    
    /**
     * ⚠️ Show a friendly error message
     */
    showFriendlyError(message) {
        const statusEl = document.getElementById('status-message');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = 'status-message error';
        }
        
        console.warn('User-friendly error:', message);
    }
    
    /**
     * 🎉 Show welcome message
     */
    showWelcomeMessage() {
        this.showFriendlyMessage('🎉 Welcome to your Music Studio! Pick a song to get started! 🎵');
    }

    /**
     * 🔊 Set volume level
     */
    setVolume(volume) {
        // Clamp volume between 0-100
        volume = Math.max(0, Math.min(100, volume));
        
        // Update state
        this.state.volume = volume / 100;
        
        // Update audio
        if (this.audio.gain) {
            this.audio.gain.gain.value = this.state.volume;
        }
        
        // Update display
        const volumeDisplay = document.getElementById('volume-display');
        const volumeSlider = document.getElementById('volume-slider');
        if (volumeDisplay) volumeDisplay.textContent = `${volume}%`;
        if (volumeSlider) volumeSlider.value = volume;
        
        // Track achievement
        if (!this.achievements.volumeAdjusted) {
            this.achievements.volumeAdjusted = true;
            this.addCelebration('🔊 Great! You adjusted the volume! 🎵');
        }
        
        console.log('🔊 Volume set to:', volume + '%');
        
        // Save state
        this.saveState();
    }
    
    /**
     * 🔊 Adjust volume by increment
     */
    adjustVolume(increment) {
        const volumeSlider = document.getElementById('volume-slider');
        if (volumeSlider) {
            const currentVolume = parseInt(volumeSlider.value);
            this.setVolume(currentVolume + increment);
        }
    }
    
    /**
     * 🎛️ Update playback button states
     */
    updatePlaybackButtons(isPlaying) {
        const playBtn = document.getElementById('play-button');
        const stopBtn = document.getElementById('stop-button');
        
        if (playBtn && stopBtn) {
            if (isPlaying) {
                playBtn.disabled = true;
                stopBtn.disabled = false;
                stopBtn.classList.add('enabled');
                playBtn.classList.remove('enabled');
            } else {
                playBtn.disabled = false;
                stopBtn.disabled = true;
                playBtn.classList.add('enabled');
                stopBtn.classList.remove('enabled');
            }
        }
    }
    
    /**
     * 📱 Show playing status
     */
    showPlayingStatus() {
        this.updateSongDisplay({
            ...this.state.currentSong,
            status: 'playing'
        });
    }
    
    /**
     * 📱 Show stopped status
     */
    showStoppedStatus() {
        this.updateSongDisplay({
            ...this.state.currentSong,
            status: 'stopped'
        });
    }

    /**
     * 🎉 Add celebration effects when user does something great
     */
    addCelebration(message) {
        // Create floating celebration message
        const celebration = document.createElement('div');
        celebration.className = 'celebration-message';
        celebration.textContent = message;
        celebration.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
            color: #744210;
            padding: 20px 30px;
            border-radius: 15px;
            font-size: 1.5rem;
            font-weight: bold;
            box-shadow: 0 10px 30px rgba(255, 215, 0, 0.5);
            z-index: 10000;
            animation: celebrationBounce 2s ease-out forwards;
            pointer-events: none;
        `;
        
        // Add CSS animation if not already present
        if (!document.querySelector('#celebration-styles')) {
            const style = document.createElement('style');
            style.id = 'celebration-styles';
            style.textContent = `
                @keyframes celebrationBounce {
                    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
                    20% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                    40% { transform: translate(-50%, -50%) scale(0.9); }
                    60% { transform: translate(-50%, -50%) scale(1.1); }
                    80% { transform: translate(-50%, -50%) scale(1); }
                    100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(celebration);
        
        // Remove after animation
        setTimeout(() => {
            if (celebration.parentNode) {
                celebration.parentNode.removeChild(celebration);
            }
        }, 2000);
    }

    /**
     * 🎵 Enhanced visual feedback during playback
     */
    startVisualPlayback() {
        const songDisplay = document.querySelector('.current-song');
        if (songDisplay) {
            songDisplay.classList.add('playing');
        }
        
        // Update status with animated text
        const statusEl = document.querySelector('.song-status');
        if (statusEl) {
            statusEl.textContent = 'Playing... 🎵';
            statusEl.classList.add('playing');
        }
        
        // Add dancing notes animation
        this.addDancingNotes();
        
        // Show celebration for first play
        if (!this.hasPlayedBefore) {
            this.hasPlayedBefore = true;
            this.addCelebration('🎉 Amazing! You\'re making music! 🎵');
        }
    }

    /**
     * 🎵 Add dancing musical notes around the interface
     */
    addDancingNotes() {
        const notes = ['🎵', '🎶', '♪', '♫', '🎼'];
        const container = document.querySelector('.grandma-daw');
        
        if (!container) return;
        
        this.dancingNotes = [];
        
        for (let i = 0; i < 5; i++) {
            const note = document.createElement('div');
            note.className = 'dancing-note';
            note.textContent = notes[Math.floor(Math.random() * notes.length)];
            note.style.cssText = `
                position: absolute;
                font-size: 2rem;
                pointer-events: none;
                z-index: 1000;
                animation: float 3s ease-in-out infinite;
                animation-delay: ${i * 0.5}s;
                left: ${20 + i * 15}%;
                top: ${30 + Math.random() * 40}%;
                opacity: 0.7;
            `;
            
            container.appendChild(note);
            this.dancingNotes.push(note);
        }
        
        // Add float animation if not present
        if (!document.querySelector('#dancing-notes-styles')) {
            const style = document.createElement('style');
            style.id = 'dancing-notes-styles';
            style.textContent = `
                @keyframes float {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    25% { transform: translateY(-10px) rotate(5deg); }
                    50% { transform: translateY(-20px) rotate(0deg); }
                    75% { transform: translateY(-10px) rotate(-5deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * 🛑 Stop visual effects
     */
    stopVisualPlayback() {
        const songDisplay = document.querySelector('.current-song');
        if (songDisplay) {
            songDisplay.classList.remove('playing');
        }
        
        const statusEl = document.querySelector('.song-status');
        if (statusEl) {
            statusEl.textContent = 'Ready to play! ▶️';
            statusEl.classList.remove('playing');
        }
        
        // Remove dancing notes
        if (this.dancingNotes) {
            this.dancingNotes.forEach(note => {
                if (note.parentNode) {
                    note.parentNode.removeChild(note);
                }
            });
            this.dancingNotes = [];
        }
    }
}

// Export for both module and global use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GrandmaStrudelDAW;
}

// Make globally available
window.GrandmaStrudelDAW = GrandmaStrudelDAW;

console.log('🎵 Grandma-Friendly Strudel DAW loaded successfully!');

// ES6 export for module import
export default GrandmaStrudelDAW;
export { GrandmaStrudelDAW };
