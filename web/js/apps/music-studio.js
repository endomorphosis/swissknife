/**
 * Music Studio App for SwissKnife Web Desktop
 * Advanced audio creation and production with P2P collaboration
 */

(function() {
  'use strict';

  // Audio context and tools
  let audioContext = null;
  let masterGain = null;
  let tracks = [];
  let effects = [];
  let recordingState = {
    isRecording: false,
    mediaRecorder: null,
    audioChunks: []
  };
  
  // P2P collaboration
  let p2pSystem = null;
  let collaborationSession = null;
  let connectedPeers = [];

  // Audio presets and samples
  const audioPresets = {
    synthesizers: {
      lead: { type: 'sawtooth', attack: 0.1, decay: 0.3, sustain: 0.6, release: 0.8 },
      bass: { type: 'sine', attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.5 },
      pad: { type: 'triangle', attack: 0.8, decay: 0.4, sustain: 0.8, release: 1.2 }
    },
    drums: {
      kick: { frequency: 60, decay: 0.5 },
      snare: { frequency: 200, decay: 0.2, noise: true },
      hihat: { frequency: 8000, decay: 0.1, noise: true }
    },
    effects: {
      reverb: { roomSize: 0.5, damping: 0.5, wetLevel: 0.3 },
      delay: { delayTime: 0.3, feedback: 0.4, wetLevel: 0.2 },
      chorus: { rate: 1.5, depth: 0.3, wetLevel: 0.5 }
    }
  };

  const classicProject = {
    storageKey: 'swissknife.music-studio.classic-project',
    projectName: 'Classic Studio - Midnight Sketch',
    trackName: 'Sketch',
    tempo: 96,
    instrument: 'lead',
    status: 'Local classic project ready. No remote render.'
  };
  const classicInstruments = ['lead', 'bass', 'pad'];
  let classicVoices = [];

  // Initialize Audio System
  async function initializeAudioSystem() {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioContext.createGain();
      masterGain.connect(audioContext.destination);
      
      console.log('✅ Audio system initialized');
      updateStatus('audio_system', 'Ready');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize audio system:', error);
      updateStatus('audio_system', 'Unavailable');
      showRecovery('Audio unavailable. Project kept. Enable audio and retry.');
      return false;
    }
  }

  // Initialize P2P Collaboration
  async function initializeP2PCollaboration() {
    try {
      if (window.p2pSystem) {
        p2pSystem = window.p2pSystem;
        
        // Setup collaboration events
        p2pSystem.on('peer:connected', onPeerConnected);
        p2pSystem.on('peer:disconnected', onPeerDisconnected);
        p2pSystem.on('audio:shared', onAudioShared);
        p2pSystem.on('project:sync', onProjectSync);
        
        console.log('✅ P2P collaboration ready');
        updateStatus('p2p_collab', 'Ready');
        return true;
      } else {
        console.log('⚠️ P2P system not available');
        updateStatus('p2p_collab', 'Unavailable');
        return false;
      }
    } catch (error) {
      console.error('❌ P2P collaboration failed:', error);
      updateStatus('p2p_collab', 'Error');
      return false;
    }
  }

  function onPeerConnected(peerId) {
    connectedPeers.push(peerId);
    updateCollaboratorsList();
    console.log(`🤝 Peer connected: ${peerId}`);
  }

  function onPeerDisconnected(peerId) {
    connectedPeers = connectedPeers.filter(id => id !== peerId);
    updateCollaboratorsList();
    console.log(`👋 Peer disconnected: ${peerId}`);
  }

  function onAudioShared(data) {
    console.log('🎵 Audio shared from peer:', data);
    // Handle incoming audio data
    addSharedTrack(data);
  }

  function onProjectSync(projectData) {
    console.log('🔄 Project sync received:', projectData);
    // Sync project state with peers
    syncProjectState(projectData);
  }

  // Audio Generation Functions
  function createSynthesizer(preset) {
    const config = audioPresets.synthesizers[preset] || audioPresets.synthesizers.lead;
    
    return {
      play: (frequency, duration = 1.0) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = config.type;
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        
        // ADSR envelope
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(1, audioContext.currentTime + config.attack);
        gainNode.gain.exponentialRampToValueAtTime(config.sustain, audioContext.currentTime + config.attack + config.decay);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration - config.release);
        
        oscillator.connect(gainNode);
        gainNode.connect(masterGain);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
        
        return { oscillator, gainNode };
      }
    };
  }

  function createDrumSample(type) {
    const config = audioPresets.drums[type] || audioPresets.drums.kick;
    
    return {
      trigger: () => {
        if (config.noise) {
          // Create noise-based drum sound (snare, hihat)
          const bufferSize = audioContext.sampleRate * config.decay;
          const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
          const data = buffer.getChannelData(0);
          
          for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
          }
          
          const source = audioContext.createBufferSource();
          const filter = audioContext.createBiquadFilter();
          const gainNode = audioContext.createGain();
          
          source.buffer = buffer;
          filter.type = 'bandpass';
          filter.frequency.value = config.frequency;
          
          gainNode.gain.setValueAtTime(0.8, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + config.decay);
          
          source.connect(filter);
          filter.connect(gainNode);
          gainNode.connect(masterGain);
          
          source.start();
        } else {
          // Create oscillator-based drum sound (kick)
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(config.frequency, audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(20, audioContext.currentTime + config.decay);
          
          gainNode.gain.setValueAtTime(1, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + config.decay);
          
          oscillator.connect(gainNode);
          gainNode.connect(masterGain);
          
          oscillator.start();
          oscillator.stop(audioContext.currentTime + config.decay);
        }
      }
    };
  }

  // Recording Functions
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingState.mediaRecorder = new MediaRecorder(stream);
      recordingState.audioChunks = [];
      
      recordingState.mediaRecorder.ondataavailable = (event) => {
        recordingState.audioChunks.push(event.data);
      };
      
      recordingState.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(recordingState.audioChunks, { type: 'audio/wav' });
        addRecordedTrack(audioBlob);
      };
      
      recordingState.mediaRecorder.start();
      recordingState.isRecording = true;
      
      updateRecordingUI();
      console.log('🎤 Recording started');
    } catch (error) {
      console.error('❌ Recording failed:', error);
    }
  }

  function stopRecording() {
    if (recordingState.mediaRecorder && recordingState.isRecording) {
      recordingState.mediaRecorder.stop();
      recordingState.isRecording = false;
      updateRecordingUI();
      console.log('⏹️ Recording stopped');
    }
  }

  function addRecordedTrack(audioBlob) {
    const track = {
      id: 'track_' + Date.now(),
      name: `Recording ${tracks.length + 1}`,
      type: 'audio',
      blob: audioBlob,
      url: URL.createObjectURL(audioBlob),
      volume: 1.0,
      muted: false
    };
    
    tracks.push(track);
    updateTracksList();
    
    // Share with peers if in collaboration mode
    if (collaborationSession && connectedPeers.length > 0) {
      shareTrackWithPeers(track);
    }
  }

  function addSharedTrack(trackData) {
    const track = {
      id: trackData.id,
      name: trackData.name + ' (Shared)',
      type: 'audio',
      url: trackData.url,
      volume: 1.0,
      muted: false,
      shared: true
    };
    
    tracks.push(track);
    updateTracksList();
  }

  async function shareTrackWithPeers(track) {
    if (p2pSystem && connectedPeers.length > 0) {
      try {
        const trackData = {
          id: track.id,
          name: track.name,
          url: track.url,
          timestamp: Date.now()
        };
        
        for (const peerId of connectedPeers) {
          await p2pSystem.sendToPeer(peerId, 'audio:shared', trackData);
        }
        
        console.log('🎵 Track shared with peers');
      } catch (error) {
        console.error('❌ Failed to share track:', error);
      }
    }
  }

  // UI Update Functions
  function updateStatus(component, status) {
    const statusEl = document.getElementById(`${component}-status`);
    if (statusEl) {
      statusEl.textContent = status;
      statusEl.className = `status ${status.toLowerCase().replace(' ', '-')}`;
    }
  }

  function updateRecordingUI() {
    const recordBtn = document.getElementById('record-btn');
    const stopBtn = document.getElementById('stop-record-btn');
    
    if (recordBtn && stopBtn) {
      recordBtn.style.display = recordingState.isRecording ? 'none' : 'inline-block';
      stopBtn.style.display = recordingState.isRecording ? 'inline-block' : 'none';
    }
  }

  function updateTracksList() {
    const tracksList = document.getElementById('tracks-list');
    if (!tracksList) return;
    const totalTracks = document.getElementById('total-tracks');
    if (totalTracks) totalTracks.textContent = String(tracks.length);
    const tracksLabel = document.getElementById('tracks-count-label');
    if (tracksLabel) tracksLabel.textContent = tracks.length === 1 ? 'Track' : 'Tracks';
    
    tracksList.innerHTML = tracks.map(track => `
      <div class="track-item" data-track-id="${track.id}">
        <div class="track-header">
          <span class="track-name">${escapeHtml(track.name)}</span>
          <div class="track-controls">
            <button type="button" class="btn btn-sm btn-primary play-track" data-track-id="${track.id}" aria-label="Play ${escapeHtml(track.name)}">Play</button>
            <button type="button" class="btn btn-sm btn-secondary mute-track" data-track-id="${track.id}" aria-label="${track.muted ? 'Unmute' : 'Mute'} ${escapeHtml(track.name)}">${track.muted ? 'Unmute' : 'Mute'}</button>
            <button type="button" class="btn btn-sm btn-danger delete-track" data-track-id="${track.id}" aria-label="Delete ${escapeHtml(track.name)}">Delete</button>
          </div>
        </div>
        <div class="track-controls-extended">
          <label class="track-volume-label">Volume <input type="range" class="volume-slider" data-track-id="${track.id}" min="0" max="1" step="0.1" value="${track.volume}" aria-label="Volume"></label>
        </div>
      </div>
    `).join('');
    
    // Attach event listeners
    attachTrackEventListeners();
  }

  function updateCollaboratorsList() {
    const collabList = document.getElementById('collaborators-list');
    if (!collabList) return;
    
    collabList.innerHTML = connectedPeers.map(peerId => `
      <div class="collaborator-item">
        <span class="peer-indicator">🤝</span>
        <span class="peer-id">${peerId.substring(0, 8)}...</span>
        <span class="peer-status">Connected</span>
      </div>
    `).join('');
  }

  function attachTrackEventListeners() {
    // Play track buttons
    document.querySelectorAll('.play-track').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const trackId = e.target.getAttribute('data-track-id');
        playTrack(trackId);
      });
    });
    
    // Mute track buttons
    document.querySelectorAll('.mute-track').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const trackId = e.target.getAttribute('data-track-id');
        toggleTrackMute(trackId);
      });
    });
    
    // Delete track buttons
    document.querySelectorAll('.delete-track').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const trackId = e.target.getAttribute('data-track-id');
        deleteTrack(trackId);
      });
    });
    
    // Volume sliders
    document.querySelectorAll('.volume-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const trackId = e.target.getAttribute('data-track-id');
        const volume = parseFloat(e.target.value);
        setTrackVolume(trackId, volume);
      });
    });
  }

  function playTrack(trackId) {
    const track = tracks.find(t => t.id === trackId);
    if (!track || !track.url) return;
    
    const audio = new Audio(track.url);
    audio.volume = track.volume * (track.muted ? 0 : 1);
    audio.play();
  }

  function toggleTrackMute(trackId) {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    
    track.muted = !track.muted;
    updateTracksList();
  }

  function deleteTrack(trackId) {
    tracks = tracks.filter(t => t.id !== trackId);
    updateTracksList();
  }

  function setTrackVolume(trackId, volume) {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    
    track.volume = volume;
  }

  function renderApp(container) {
    loadClassicProjectIntoSession();
    container.innerHTML = `
      <div class="music-studio-container">
        <!-- Header Toolbar -->
        <div class="studio-toolbar">
          <div class="toolbar-section">
            <button class="btn btn-primary" id="new-project">🎵 New Project</button>
            <button class="btn btn-secondary" id="record-btn">🎤 Record</button>
            <button class="btn btn-danger" id="stop-record-btn" style="display: none;">⏹️ Stop</button>
            <button class="btn btn-secondary" id="import-audio">📁 Import</button>
          </div>
          <div class="toolbar-section studio-status-section">
            <div class="status-indicator">
              <span class="status-text">Audio: <span id="audio_system-status">Initializing...</span></span>
            </div>
            <div class="status-indicator">
              <span class="status-text">P2P: <span id="p2p_collab-status">Initializing...</span></span>
            </div>
            <p id="music-studio-recovery" class="studio-recovery" hidden>Audio unavailable. Project kept. Enable audio and retry.</p>
          </div>
          <div class="toolbar-section">
            <button class="btn btn-success" id="start-collaboration">🤝 Collaborate</button>
            <button class="btn btn-warning" id="export-project">💾 Export</button>
          </div>
        </div>

        <div class="classic-transport" aria-label="Classic project transport">
          <label for="classic-track-name">Track</label>
          <input id="classic-track-name" type="text" maxlength="80" aria-label="Track name" value="${escapeHtml(classicProject.trackName)}">
          <label for="classic-tempo">Tempo</label>
          <input id="classic-tempo" type="number" min="40" max="240" step="1" aria-label="Tempo" value="${classicProject.tempo}">
          <label for="classic-instrument">Instrument</label>
          <select id="classic-instrument" aria-label="Selected instrument">
            <option value="lead" ${classicProject.instrument === 'lead' ? 'selected' : ''}>Lead</option>
            <option value="bass" ${classicProject.instrument === 'bass' ? 'selected' : ''}>Bass</option>
            <option value="pad" ${classicProject.instrument === 'pad' ? 'selected' : ''}>Pad</option>
          </select>
          <button type="button" class="btn btn-primary" id="classic-play" aria-label="Play">Play</button>
          <button type="button" class="btn btn-secondary" id="classic-stop" aria-label="Stop">Stop</button>
          <button type="button" class="btn btn-warning" id="classic-save" aria-label="Save classic project">Save</button>
        </div>
        <p id="classic-reopen-summary">${escapeHtml(classicProject.trackName)} | ${classicProject.tempo} | ${escapeHtml(classicProject.instrument)}</p>
        <p id="music-studio-workflow-status">${escapeHtml(classicProject.status)}</p>

        <!-- Main Studio Interface -->
        <div class="studio-content">
          <!-- Tracks Panel -->
          <div class="tracks-panel">
            <div class="panel-header">
              <h3>🎼 Tracks</h3>
              <div class="track-stats">
                <span class="stat-item">
                  <span class="stat-value" id="total-tracks">${tracks.length}</span>
                  <span class="stat-label" id="tracks-count-label">Track</span>
                </span>
              </div>
            </div>
            <div class="tracks-list" id="tracks-list">
              <!-- Tracks will be populated here -->
            </div>
          </div>

          <!-- Instruments Panel -->
          <div class="instruments-panel">
            <div class="panel-header">
              <h3>🎹 Instruments</h3>
            </div>
            
            <div class="instruments-grid">
              <div class="instrument-group">
                <h4>Synthesizers</h4>
                <button type="button" class="btn btn-instrument${classicProject.instrument === 'lead' ? ' is-selected' : ''}" data-synth="lead" aria-pressed="${classicProject.instrument === 'lead' ? 'true' : 'false'}">Lead</button>
                <button type="button" class="btn btn-instrument${classicProject.instrument === 'bass' ? ' is-selected' : ''}" data-synth="bass" aria-pressed="${classicProject.instrument === 'bass' ? 'true' : 'false'}">Bass</button>
                <button type="button" class="btn btn-instrument${classicProject.instrument === 'pad' ? ' is-selected' : ''}" data-synth="pad" aria-pressed="${classicProject.instrument === 'pad' ? 'true' : 'false'}">Pad</button>
              </div>
              
              <div class="instrument-group">
                <h4>Drums</h4>
                <button class="btn btn-drum" data-drum="kick">🥁 Kick</button>
                <button class="btn btn-drum" data-drum="snare">🥁 Snare</button>
                <button class="btn btn-drum" data-drum="hihat">🥁 Hi-Hat</button>
              </div>
            </div>

            ${renderClassicWorkflowPanel()}
          </div>

          <!-- Collaboration Panel -->
          <div class="collaboration-panel">
            <div class="panel-header">
              <h3>🤝 Collaborators</h3>
              <div class="collab-stats">
                <span class="stat-item">
                  <span class="stat-value" id="connected-peers">${connectedPeers.length}</span>
                  <span class="stat-label">Connected</span>
                </span>
              </div>
            </div>
            
            <div class="collaborators-list" id="collaborators-list">
              <!-- Collaborators will be populated here -->
            </div>
          </div>
        </div>
      </div>
      
      <style>
        .window[data-app-id="music-studio"] .window-app-content {
          position: absolute;
          inset: 0;
          height: auto;
          max-height: 100%;
          min-height: 0;
          overflow: hidden;
          box-sizing: border-box;
        }

        .music-studio-container {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          height: 100%;
          max-height: 100%;
          min-height: 0;
          box-sizing: border-box;
          padding-top: 44px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          overflow: hidden;
        }
        
        .studio-toolbar {
          display: flex !important;
          flex-wrap: wrap !important;
          justify-content: flex-start;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-bottom: 1px solid #ddd;
          overflow: visible !important;
          height: auto !important;
          max-height: none !important;
          white-space: normal !important;
        }

        .studio-toolbar .btn {
          flex: 0 0 auto;
          position: static !important;
        }
        
        .toolbar-section {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          min-width: 0;
          max-width: 100%;
          position: static;
          overflow: visible;
        }

        .studio-status-section {
          flex: 1 1 100%;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          overflow: visible !important;
          min-width: 0;
          height: auto !important;
        }

        #import-audio.btn-secondary {
          background: #f8fafc;
          color: #312e81;
          border: 1px solid rgba(255,255,255,0.9);
          font-weight: 700;
        }

        .window[data-app-id="music-studio"] .status-indicator {
          position: static !important;
          display: inline-flex !important;
          flex: 0 0 auto;
          align-items: center;
          gap: 4px;
          width: auto !important;
          max-width: 100%;
          height: auto !important;
          margin: 0 !important;
          padding: 2px 8px;
          inset: auto !important;
          transform: none !important;
          float: none !important;
          overflow: visible !important;
          clip: auto !important;
          clip-path: none !important;
          white-space: nowrap !important;
          background: rgba(15, 23, 42, 0.28);
          border-radius: 999px;
        }

        .status-indicator::before,
        .status-indicator::after,
        .status-text::before,
        .status-text::after {
          content: none !important;
          display: none !important;
        }

        .window[data-app-id="music-studio"] .status-text,
        .window[data-app-id="music-studio"] .status-indicator .status {
          position: static !important;
          display: inline !important;
          width: auto !important;
          max-width: none !important;
          height: auto !important;
          overflow: visible !important;
          text-overflow: clip !important;
          white-space: nowrap !important;
          clip: auto !important;
          clip-path: none !important;
          color: #fff;
        }
        
        .studio-content {
          display: flex !important;
          flex-direction: column !important;
          flex: 1 1 auto;
          width: 100% !important;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: auto;
        }
        
        .tracks-panel, .instruments-panel, .collaboration-panel {
          flex: 0 0 auto;
          min-width: 0;
          min-height: auto;
          overflow: visible;
          border-right: none;
          border-bottom: 1px solid #ddd;
          display: flex;
          flex-direction: column;
          justify-content: flex-start !important;
        }
        
        .collaboration-panel {
          border-right: none;
        }
        
        .panel-header {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          min-width: 0;
          overflow: visible;
          padding: 12px 16px;
          background: #f8f9fa;
          border-bottom: 1px solid #ddd;
        }

        .panel-header h3 {
          margin: 0;
          min-width: 0;
        }

        .window[data-app-id="music-studio"] .track-stats,
        .window[data-app-id="music-studio"] .stat-item {
          position: static !important;
          display: inline-flex !important;
          align-items: baseline;
          gap: 4px;
          flex: 0 0 auto;
          margin: 0 !important;
          inset: auto !important;
          transform: none !important;
          overflow: visible !important;
          opacity: 1 !important;
          white-space: nowrap;
        }

        .classic-transport {
          display: flex !important;
          flex: 0 0 auto;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          position: relative;
          z-index: 3;
          width: 100%;
          box-sizing: border-box;
          padding: 8px;
          background: #ffffff;
          color: #0f172a;
          border-bottom: 1px solid #e2e8f0;
        }

        .classic-transport input,
        .classic-transport select,
        .classic-transport button,
        .studio-diagnostics textarea {
          max-width: 100%;
        }

        .instruments-panel {
          overflow: visible;
        }

        .studio-diagnostics {
          margin: 0 16px 16px;
          max-height: none;
          overflow: visible;
          flex: 0 0 auto;
          min-height: 0;
          min-width: 0;
        }

        .studio-diagnostics textarea {
          width: 100%;
          height: 6.5rem;
          min-height: 4.5rem;
          max-height: 8rem;
          box-sizing: border-box;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
          overflow: auto;
          text-overflow: clip;
          resize: vertical;
        }

        .studio-recovery {
          margin: 0 8px 8px;
          padding: 6px 8px;
          background: #fff7ed;
          color: #9a3412;
          border-radius: 4px;
          font-size: 13px;
        }

        .studio-status-section .studio-recovery {
          flex: 1 0 100%;
          margin: 0;
          max-width: 100%;
        }

        .window[data-app-id="music-studio"] .stat-label,
        .window[data-app-id="music-studio"] .stat-value {
          text-transform: none;
          color: #0f172a !important;
          opacity: 1 !important;
        }

        #classic-open-project {
          background: #1d4ed8 !important;
          color: #ffffff !important;
          opacity: 1 !important;
        }

        #classic-reopen-summary,
        #music-studio-workflow-status {
          margin: 0 8px 6px;
          font-size: 13px;
          word-break: break-word;
        }
        
        .tracks-list, .collaborators-list {
          flex: 1 1 0;
          min-height: 0;
          overflow-y: auto;
          position: relative;
          z-index: 0;
          padding: 8px;
        }
        
        .track-item {
          padding: 12px;
          margin: 4px 0;
          background: white;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        
        .track-header {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 6px;
          margin-bottom: 8px;
          position: relative;
          top: auto;
          z-index: 0;
          max-width: 100%;
        }

        .window[data-app-id="music-studio"] .track-name {
          flex: 1 1 auto;
          min-width: 0;
          max-width: 100%;
          overflow: visible !important;
          text-overflow: clip !important;
          white-space: normal !important;
          word-break: break-word;
          color: #0f172a;
        }
        
        .track-controls {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }

        .track-volume-label {
          color: #1e293b;
          font-size: 13px;
          font-weight: 650;
        }

        .window[data-app-id="music-studio"] button:focus-visible,
        .window[data-app-id="music-studio"] input:focus-visible,
        .window[data-app-id="music-studio"] select:focus-visible,
        .window[data-app-id="music-studio"] textarea:focus-visible,
        .window[data-app-id="music-studio"] summary:focus-visible {
          outline: 2px solid #facc15 !important;
          outline-offset: 2px !important;
        }
        
        .instruments-grid {
          padding: 16px;
        }

        .classic-vda-workflow {
          margin: 0 16px 16px;
          padding: 12px;
          display: grid;
          gap: 10px;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          color: #0f172a;
        }

        .classic-vda-header {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: flex-start;
        }

        .classic-vda-kicker {
          font-size: 11px;
          font-weight: 800;
          color: #4f46e5;
        }

        .classic-vda-title {
          margin: 2px 0 0;
          font-size: 14px;
        }

        .classic-vda-state {
          font-size: 11px;
          font-weight: 700;
          color: #166534;
          text-align: right;
        }

        .classic-vda-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }

        .classic-vda-actions button {
          min-width: 0;
          border: 0;
          border-radius: 6px;
          padding: 7px 8px;
          background: #334155;
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }

        .classic-vda-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 8px;
        }

        .classic-vda-card strong {
          display: block;
          font-size: 13px;
        }

        .classic-vda-card p {
          margin: 4px 0;
          font-size: 12px;
          line-height: 1.35;
          word-break: break-word;
        }

        .classic-vda-card small,
        #music-studio-workflow-status {
          font-size: 11px;
          word-break: break-word;
        }
        
        .window[data-app-id="music-studio"] .instrument-group {
          display: block !important;
          margin-bottom: 16px;
          overflow: visible !important;
        }
        
        .instrument-group h4 {
          margin: 0 0 8px 0;
          color: #666;
        }
        
        .window[data-app-id="music-studio"] .btn-instrument,
        .window[data-app-id="music-studio"] .btn-drum {
          display: block !important;
          width: 100% !important;
          position: static !important;
          margin: 4px 0;
          padding: 8px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          overflow: visible !important;
        }
        
        .btn-instrument:hover, .btn-drum:hover {
          background: #0056b3;
        }

        .btn-instrument::before,
        .btn-instrument::after,
        .btn-drum::before,
        .btn-drum::after {
          content: none;
        }

        .btn-instrument.is-selected {
          box-shadow: inset 3px 0 0 #fde68a;
        }
        
        .collaborator-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: #e3f2fd;
          border-radius: 4px;
          margin: 4px 0;
        }
        
        .status {
          position: static !important;
          display: inline !important;
          margin: 0 !important;
          inset: auto !important;
          transform: none !important;
          float: none !important;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: bold;
          overflow: visible !important;
          text-overflow: clip !important;
          white-space: nowrap !important;
        }

        .status::before,
        .status::after {
          content: none !important;
          display: none !important;
        }
        
        .status.ready { background: #d4edda; color: #155724; }
        .status.error { background: #f8d7da; color: #721c24; }
        .status.unavailable { background: #fff3cd; color: #856404; }

        @media (max-width: 760px) {
          .studio-toolbar {
            flex-wrap: wrap;
            align-items: stretch;
          }

          .toolbar-section {
            flex-wrap: wrap;
          }

          .studio-content {
            flex-direction: column;
            overflow-x: hidden;
            overflow-y: auto;
          }

          .tracks-panel, .instruments-panel, .collaboration-panel {
            flex: 0 0 auto;
            overflow: visible;
            min-height: auto;
            border-right: none;
            border-bottom: 1px solid #ddd;
          }

          .tracks-list, .collaborators-list, .instruments-grid {
            flex: 0 0 auto;
            overflow: visible;
            max-height: none;
            min-height: min-content;
          }

          .instrument-group {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
          }

          .instrument-group h4 {
            flex: 1 0 100%;
          }

          .btn-instrument, .btn-drum {
            width: auto;
            flex: 1 1 30%;
            min-width: 0;
          }

          .classic-vda-actions {
            grid-template-columns: 1fr;
          }
        }
      </style>
    `;
    
    // Attach event listeners
    attachEventListeners(container);
    
    // Initialize audio system
    initializeAudioSystem();
    initializeP2PCollaboration();
    
    // Update initial UI
    updateTracksList();
    updateCollaboratorsList();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function showRecovery(message) {
    const recovery = document.getElementById('music-studio-recovery');
    if (!recovery) return;
    recovery.hidden = false;
    recovery.textContent = message;
  }

  function readClassicProject() {
    try {
      const raw = localStorage.getItem(classicProject.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.schema !== 'swissknife.music-studio.classic-project.v1') return null;
      if (typeof parsed.track_name !== 'string' || !parsed.track_name.trim()) return null;
      if (!Number.isFinite(Number(parsed.tempo))) return null;
      return parsed;
    } catch (error) {
      console.warn('Classic project storage was not readable:', error);
      return null;
    }
  }

  function loadClassicProjectIntoSession() {
    const saved = readClassicProject();
    if (saved) {
      classicProject.trackName = saved.track_name.trim();
      classicProject.tempo = Math.max(40, Math.min(240, Math.round(Number(saved.tempo))));
      if (classicInstruments.includes(saved.instrument)) classicProject.instrument = saved.instrument;
      if (typeof saved.project_name === 'string' && saved.project_name.trim()) {
        classicProject.projectName = saved.project_name.trim();
      }
    }
    tracks = tracks.filter(track => track.id !== 'track-sketch');
    tracks.unshift({
      id: 'track-sketch',
      name: classicProject.trackName,
      type: 'midi',
      volume: 1,
      muted: false
    });
  }

  function syncClassicSummary() {
    const summary = document.getElementById('classic-reopen-summary');
    if (!summary) return;
    summary.textContent = `${classicProject.trackName} | ${classicProject.tempo} | ${classicProject.instrument}`;
  }

  function commitClassicForm() {
    const name = document.getElementById('classic-track-name');
    const tempo = document.getElementById('classic-tempo');
    const instrument = document.getElementById('classic-instrument');
    if (name && name.value.trim()) classicProject.trackName = name.value.trim();
    if (tempo && Number.isFinite(Number(tempo.value))) {
      classicProject.tempo = Math.max(40, Math.min(240, Math.round(Number(tempo.value))));
    }
    if (instrument && classicInstruments.includes(instrument.value)) {
      classicProject.instrument = instrument.value;
    }
    const sketch = tracks.find(track => track.id === 'track-sketch');
    if (sketch) sketch.name = classicProject.trackName;
    syncClassicSummary();
    syncInstrumentSelection();
  }

  function applyFormFromState() {
    const name = document.getElementById('classic-track-name');
    const tempo = document.getElementById('classic-tempo');
    const instrument = document.getElementById('classic-instrument');
    if (name) name.value = classicProject.trackName;
    if (tempo) tempo.value = String(classicProject.tempo);
    if (instrument) instrument.value = classicProject.instrument;
    const sketch = tracks.find(track => track.id === 'track-sketch');
    if (sketch) sketch.name = classicProject.trackName;
    syncClassicSummary();
    syncInstrumentSelection();
    updateTracksList();
  }

  function syncInstrumentSelection() {
    document.querySelectorAll('.btn-instrument').forEach((btn) => {
      const on = btn.getAttribute('data-synth') === classicProject.instrument;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function playClassic() {
    commitClassicForm();
    if (!audioContext || !masterGain) {
      showRecovery('Audio unavailable. Project kept. Enable audio and retry.');
      return;
    }
    try {
      const synth = createSynthesizer(classicProject.instrument);
      const voice = synth.play(440, 0.4);
      if (voice && voice.oscillator) classicVoices.push(voice.oscillator);
    } catch (error) {
      showRecovery('Audio unavailable. Project kept. Enable audio and retry.');
    }
  }

  function stopClassic() {
    classicVoices.forEach((voice) => {
      try {
        voice.stop();
      } catch (error) {
        console.warn('Classic voice was already stopped:', error);
      }
    });
    classicVoices = [];
    const status = document.getElementById('music-studio-workflow-status');
    if (status) status.textContent = 'Stopped. Local project kept. No remote render.';
  }

  function confirmClassicTrack(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    commitClassicForm();
    const status = document.getElementById('music-studio-workflow-status');
    if (status) status.textContent = classicProject.status;
  }

  function openClassicProjectText(text) {
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      parsed = null;
    }
    const valid = Boolean(parsed)
      && parsed.schema === 'swissknife.music-studio.classic-project.v1'
      && typeof parsed.track_name === 'string'
      && parsed.track_name.trim()
      && Number.isFinite(Number(parsed.tempo));
    if (!valid) {
      showRecovery('Invalid project. This project was not deleted. Open a valid classic project or enable audio and retry.');
      const status = document.getElementById('music-studio-workflow-status');
      if (status) status.textContent = 'Invalid project. Saved classic project kept.';
      return;
    }
    classicProject.trackName = parsed.track_name.trim();
    classicProject.tempo = Math.max(40, Math.min(240, Math.round(Number(parsed.tempo))));
    if (classicInstruments.includes(parsed.instrument)) classicProject.instrument = parsed.instrument;
    applyFormFromState();
    const recovery = document.getElementById('music-studio-recovery');
    if (recovery) recovery.hidden = true;
    const status = document.getElementById('music-studio-workflow-status');
    if (status) status.textContent = 'Opened a valid classic project locally. No remote render.';
  }

  function renderClassicWorkflowPanel() {
    return `
      <details class="studio-diagnostics">
        <summary>Open a project file</summary>
        <label for="classic-project-json">Classic project JSON</label>
        <textarea id="classic-project-json" rows="4" spellcheck="false" aria-label="Classic project JSON"></textarea>
        <button type="button" class="btn btn-secondary" id="classic-open-project">Open project</button>
        <p>Browser-local classic studio. No remote render.</p>
      </details>
    `;
  }

  function renderClassicWorkflowPanelRemovedMarker() {
    return `
      <section class="classic-vda-workflow"
               aria-label="Classic Music Studio local notes">
        <div class="classic-vda-header">
          <div>
            <div class="classic-vda-kicker">${classicWorkflow.vdaId}</div>
            <h3 class="classic-vda-title">Classic Artifact Workflow</h3>
            <p class="vda-evidence-note sk-honest-note">Evidence draft — CIDs, receipts and metrics shown are fixture references for design verification until “Save” persists a real project bundle.</p>
          </div>
          <span class="classic-vda-state"
                data-legacy-workflow-state="preserved"
                data-save-state="${classicWorkflow.saveState}"
                data-render-state="${classicWorkflow.renderState}"
                data-responsive-fallback-state="${classicWorkflow.fallbackState}">
            Legacy controls preserved
          </span>
        </div>

        <div class="classic-vda-actions" aria-label="Classic Music Studio VDA-G046 workflow actions">
          <button type="button" data-svd-workflow-action="preserve-legacy-flow" aria-label="Verify classic studio legacy workflow">Legacy</button>
          <button type="button" data-svd-workflow-action="load-artifact-cids" aria-label="Load classic studio artifact CIDs">Artifacts</button>
          <button type="button" data-svd-workflow-action="inspect-catalog-rights" aria-label="Inspect catalog and rights metadata">Rights</button>
          <button type="button" data-svd-workflow-action="start-optional-render" aria-label="Start optional classic studio render">Render</button>
          <button type="button" data-svd-workflow-action="save-classic-project" aria-label="Save classic studio project">Save</button>
          <button type="button" data-svd-workflow-action="prove-responsive-fallback" aria-label="Prove responsive fallback layout">Fallback</button>
        </div>

        <article class="classic-vda-card"
                 data-svd-vda-marker="legacy-workflow"
                 data-legacy-workflow-state="preserved"
                 data-legacy-control-proof="record-instrument-collaboration-export">
          <strong>Legacy workflow</strong>
          <p>Record, import, instrument triggers, collaboration, and export controls remain available for the classic WebAudio/local project flow.</p>
          <small>${classicWorkflow.receiptPrefix}:legacy-preserved</small>
        </article>

        <article class="classic-vda-card"
                 data-svd-vda-marker="artifact-workflow"
                 data-artifact-state="loaded"
                 data-project-asset-cid="${classicWorkflow.projectAssetCid}"
                 data-stem-audio-cid="${classicWorkflow.stemAudioCid}"
                 data-mix-artifact-cid="${classicWorkflow.mixArtifactCid}">
          <strong>Project assets</strong>
          <p>${classicWorkflow.projectName} uses project asset CID ${classicWorkflow.projectAssetCid}, stem CID ${classicWorkflow.stemAudioCid}, mix artifact CID ${classicWorkflow.mixArtifactCid}, and event DAG ${classicWorkflow.eventDagCid}.</p>
          <small>${classicWorkflow.receiptPrefix}:artifact-cids ${classicWorkflow.receiptPrefix}:event-dag</small>
        </article>

        <article class="classic-vda-card"
                 data-svd-vda-marker="metadata-rights"
                 data-metadata-rights-state="verified"
                 data-catalog-rights-cid="${classicWorkflow.catalogRightsCid}">
          <strong>Catalog and rights metadata</strong>
          <p>Catalog metadata CID ${classicWorkflow.catalogRightsCid}; source sample "Analog Kit 04" is CC-BY-4.0, creator release signed, commercial sync allowed with attribution.</p>
          <small>${classicWorkflow.receiptPrefix}:catalog-rights</small>
        </article>

        <article class="classic-vda-card"
                 data-svd-vda-marker="optional-render"
                 data-render-state="optional"
                 data-render-job-state="queued"
                 data-render-cid="${classicWorkflow.optionalRenderCid}">
          <strong>Optional render</strong>
          <p>Optional render job queued to create a preview mix from ${classicWorkflow.optionalRenderCid}; the classic project stays editable if render services are unavailable.</p>
          <progress class="sk-progress" data-render-progress max="100" value="72"></progress>
          <small>${classicWorkflow.receiptPrefix}:optional-render</small>
        </article>

        <article class="classic-vda-card"
                 data-svd-vda-marker="save-proof"
                 data-save-state="saved"
                 data-save-proof="local-project-bundle"
                 data-save-cid="${classicWorkflow.saveBundleCid}">
          <strong>Save proof</strong>
          <p>Save bundle CID ${classicWorkflow.saveBundleCid} captures track list, volume automation, selected instruments, metadata, and local restore state.</p>
          <small>${classicWorkflow.receiptPrefix}:save-project ${classicWorkflow.receiptPrefix}:restore-state</small>
        </article>

        <article class="classic-vda-card"
                 data-svd-vda-marker="responsive-fallback"
                 data-responsive-fallback-state="active"
                 data-responsive-fallback-proof="mobile-ready"
                 data-fallback-cid="${classicWorkflow.responsiveFallbackCid}">
          <strong>Responsive fallback</strong>
          <p>Fallback CID ${classicWorkflow.responsiveFallbackCid}; compact stacked panels keep transport, tracks, instruments, collaborator status, artifact save, and render status visible on narrow screens.</p>
          <small>${classicWorkflow.receiptPrefix}:responsive-fallback</small>
        </article>

        <output id="music-studio-workflow-status"
                data-workflow-status="ready">${classicWorkflow.status}</output>
      </section>
    `;
  }

  function attachEventListeners(container) {
    // Record button
    container.querySelector('#record-btn')?.addEventListener('click', startRecording);
    container.querySelector('#stop-record-btn')?.addEventListener('click', stopRecording);
    
    // Synthesizer buttons
    container.querySelectorAll('.btn-instrument').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const synthType = e.target.getAttribute('data-synth');
        if (classicInstruments.includes(synthType)) {
          classicProject.instrument = synthType;
          const instrument = document.getElementById('classic-instrument');
          if (instrument) instrument.value = synthType;
          syncInstrumentSelection();
          syncClassicSummary();
        }
        const synth = createSynthesizer(synthType);
        synth.play(440, 0.5);
      });
    });
    
    // Drum buttons
    container.querySelectorAll('.btn-drum').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const drumType = e.target.getAttribute('data-drum');
        const drum = createDrumSample(drumType);
        drum.trigger();
      });
    });
    
    // Other toolbar buttons
    container.querySelector('#new-project')?.addEventListener('click', () => {
      tracks = [];
      updateTracksList();
    });
    
    container.querySelector('#start-collaboration')?.addEventListener('click', () => {
      if (p2pSystem) {
        collaborationSession = true;
        console.log('🤝 Collaboration session started');
      }
    });

    container.querySelector('#export-project')?.addEventListener('click', () => {
      saveClassicProjectBundle();
    });

    container.querySelector('#classic-play')?.addEventListener('click', playClassic);
    container.querySelector('#classic-stop')?.addEventListener('click', stopClassic);
    container.querySelector('#classic-save')?.addEventListener('click', saveClassicProjectBundle);
    container.querySelector('#classic-track-name')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') confirmClassicTrack(event);
    });
    container.querySelector('#classic-open-project')?.addEventListener('click', () => {
      const field = document.getElementById('classic-project-json');
      openClassicProjectText(field ? field.value : '');
    });
  }

  function updateClassicWorkflowStatus(action) {
    if (action === 'save-classic-project') {
      saveClassicProjectBundle();
      return;
    }
    const status = document.getElementById('music-studio-workflow-status');
    if (status) status.textContent = classicProject.status;
  }

  function saveClassicProjectBundle() {
    commitClassicForm();
    const bundle = {
      schema: 'swissknife.music-studio.classic-project.v1',
      project_name: classicProject.projectName,
      track_name: classicProject.trackName,
      tempo: classicProject.tempo,
      instrument: classicProject.instrument,
      tracks: tracks.map(track => ({
        id: track.id,
        name: track.name,
        type: track.type,
        volume: track.volume,
        muted: track.muted,
        shared: Boolean(track.shared)
      })),
      saved_at: new Date().toISOString()
    };
    try {
      localStorage.setItem(classicProject.storageKey, JSON.stringify(bundle));
    } catch (error) {
      console.warn('Classic Music Studio local save was unavailable:', error);
      showRecovery('Could not save in this browser. The open project was not deleted.');
      return null;
    }
    const status = document.getElementById('music-studio-workflow-status');
    if (status) status.textContent = 'Saved in this browser. No remote render.';
    return bundle;
  }

  // Export for global use
  window.renderMusicStudioApp = renderApp;

})();
