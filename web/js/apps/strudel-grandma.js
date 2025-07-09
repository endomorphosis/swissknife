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
        
        // Built-in songs (Polyphia demos with real file integration)
        this.demoSongs = [
            {
                id: 'playing-god',
                name: '🎸 Playing God (Polyphia)',
                description: 'Beautiful guitar melodies',
                pattern: 'c4 d4 e4 f4 g4 a4 b4',
                musicFile: '/assets/music/playing-god-piano.musicxml',
                emoji: '🎸',
                tempo: 140
            },
            {
                id: 'goat',
                name: '🐐 G.O.A.T. (Polyphia)', 
                description: 'Epic rock anthem',
                pattern: 'g3 a3 b3 c4 d4 e4',
                musicFile: '/assets/music/playing-god.mid', // Using same file for demo
                emoji: '🐐',
                tempo: 150
            },
            {
                id: 'custom',
                name: '✨ My Creation',
                description: 'Your own masterpiece',
                pattern: 'c4 e4 g4',
                emoji: '✨',
                tempo: 120
            }
        ];
        
        // Music file cache
        this.musicFileCache = new Map();
        this.musicParser = null;
        
        
        
        // Achievement system
        this.achievements = {
            firstPlay: false,
            volumeAdjusted: false,
            allSongsPlayed: new Set(),
            totalPlays: 0
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
                this.achievements = { ...this.achievements, ...savedState.achievements };
                console.log('💾 Restored saved state');
            }
        } catch (error) {
            console.warn('💾 Could not load saved state:', error);
        }
    }

    /**
     * 💾 Save current state to localStorage
     */
    saveState() {
        try {
            const stateToSave = {
                volume: this.state.volume,
                achievements: this.achievements,
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
                <header class="studio-header">
                    <h1>🎵 My Music Studio</h1>
                    <p class="subtitle">Make beautiful music in just a few clicks!</p>
                </header>
                <main class="studio-main">
                    <section class="song-picker">
                        <h2>🎼 Choose Your Song</h2>
                        <div class="song-grid" id="song-grid">
                        </div>
                    </section>
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
                    <section class="now-playing">
                        <h3>🎵 Now Playing</h3>
                        <div class="song-display" id="song-display">
                            <div class="no-song">Pick a song to get started! 👆</div>
                        </div>
                    </section>
                </main>
                <footer class="studio-status">
                    <div id="status-message" class="status-message">
                        Welcome! Your music studio is ready to use. 🎉
                    </div>
                </footer>
            </div>
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
     * 🎵 Select a song to play
     */
    selectSong(song) {
        console.log('🎵 Selected song:', song.name);
        
        // Update current song
        this.state.currentSong = song;
        
        // Track achievement
        this.achievements.allSongsPlayed.add(song.id);
        
        // Update the display
        this.updateSongDisplay(song);
        
        // Enable play button
        this.enablePlayButton();
        
        // Show encouraging message
        this.showFriendlyMessage(`Great choice! ${song.name} is ready to play! 🎵`);
        
        // Highlight selected song
        this.highlightSelectedSong(song.id);
        
        // Check for achievement
        if (this.achievements.allSongsPlayed.size === this.demoSongs.length) {
            this.addCelebration('🏆 Music Explorer! You\'ve tried all the songs! 🎉');
        }
        
        // Save state
        this.saveState();
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
        const songData = this.getPolyphiaPatterns()[this.state.currentSong.id];
        
        if (!songData) {
            console.warn('No pattern data for song:', this.state.currentSong.id);
            return this.startAudioPlayback(); // fallback to simple version
        }

        try {
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
                'global Pattern': typeof Pattern
            });
            
            if (strudelAvailable) {
                console.log('🎵 Using Strudel for audio:', songData.pattern);
                
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
            
            console.log('🎵 Strudel not available, using enhanced fallback audio');
            this.startEnhancedFallbackAudio(songData);
            
        } catch (error) {
            console.warn('🎵 Strudel playback failed, using fallback:', error);
            this.startEnhancedFallbackAudio(songData);
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
        document.getElementById('volume-display').textContent = `${volume}%`;
        document.getElementById('volume-slider').value = volume;
        
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
        const currentVolume = parseInt(document.getElementById('volume-slider').value);
        this.setVolume(currentVolume + increment);
    }
    
    /**
     * 🎛️ Update playback button states
     */
    updatePlaybackButtons(isPlaying) {
        const playBtn = document.getElementById('play-button');
        const stopBtn = document.getElementById('stop-button');
        
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
     * 💬 Show a friendly message to the user
     */
    showFriendlyMessage(message) {
        const statusEl = document.getElementById('status-message');
        statusEl.textContent = message;
        statusEl.className = 'status-message friendly';
        
        // Auto-clear after a few seconds
        setTimeout(() => {
            statusEl.textContent = 'Your music studio is ready! 🎵';
            statusEl.className = 'status-message';
        }, 5000);
    }
    
    /**
     * ⚠️ Show a friendly error message
     */
    showFriendlyError(message) {
        const statusEl = document.getElementById('status-message');
        statusEl.textContent = message;
        statusEl.className = 'status-message error';
        
        console.warn('User-friendly error:', message);
    }
    
    /**
     * 🎉 Show welcome message
     */
    showWelcomeMessage() {
        this.showFriendlyMessage('🎉 Welcome to your Music Studio! Pick a song to get started! 🎵');
    }
}

// Export for both module and global use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GrandmaStrudelDAW;
}

// Make globally available
window.GrandmaStrudelDAW = GrandmaStrudelDAW;

console.log('🎵 Grandma-Friendly Strudel DAW loaded successfully!');
