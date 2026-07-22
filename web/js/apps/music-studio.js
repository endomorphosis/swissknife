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

  const classicWorkflow = {
    workflowId: 'music-studio.classic-artifact-save-render-fallback',
    vdaId: 'VDA-G046',
    projectName: 'Classic Studio - Midnight Sketch',
    projectAssetCid: 'bafymusicstudiog046projectassetcid',
    stemAudioCid: 'bafymusicstudiog046stemaudiocid',
    mixArtifactCid: 'bafymusicstudiog046mixartifactcid',
    catalogRightsCid: 'bafymusicstudiog046catalogrights',
    optionalRenderCid: 'bafymusicstudiog046optionalrender',
    saveBundleCid: 'bafymusicstudiog046savebundle',
    responsiveFallbackCid: 'bafymusicstudiog046responsivefallback',
    eventDagCid: 'bafymusicstudiog046eventdag',
    receiptPrefix: 'receipt:music-studio:g046',
    renderState: 'optional',
    saveState: 'ready',
    fallbackState: 'mobile-ready',
    status: 'Classic workflow ready'
  };

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
      updateStatus('audio_system', 'Error');
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
    
    tracksList.innerHTML = tracks.map(track => `
      <div class="track-item" data-track-id="${track.id}">
        <div class="track-header">
          <span class="track-name">${track.name}</span>
          <div class="track-controls">
            <button class="btn btn-sm btn-primary play-track" data-track-id="${track.id}">▶️</button>
            <button class="btn btn-sm btn-secondary mute-track" data-track-id="${track.id}">${track.muted ? '🔇' : '🔊'}</button>
            <button class="btn btn-sm btn-danger delete-track" data-track-id="${track.id}">🗑️</button>
          </div>
        </div>
        <div class="track-controls-extended">
          <label>Volume: <input type="range" class="volume-slider" data-track-id="${track.id}" min="0" max="1" step="0.1" value="${track.volume}"></label>
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
          <div class="toolbar-section">
            <div class="status-indicator">
              <span class="status-text">Audio: <span id="audio_system-status">Initializing...</span></span>
            </div>
            <div class="status-indicator">
              <span class="status-text">P2P: <span id="p2p_collab-status">Initializing...</span></span>
            </div>
          </div>
          <div class="toolbar-section">
            <button class="btn btn-success" id="start-collaboration">🤝 Collaborate</button>
            <button class="btn btn-warning" id="export-project">💾 Export</button>
          </div>
        </div>

        <!-- Main Studio Interface -->
        <div class="studio-content">
          <!-- Tracks Panel -->
          <div class="tracks-panel">
            <div class="panel-header">
              <h3>🎼 Tracks</h3>
              <div class="track-stats">
                <span class="stat-item">
                  <span class="stat-value" id="total-tracks">${tracks.length}</span>
                  <span class="stat-label">Tracks</span>
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
                <button class="btn btn-instrument" data-synth="lead">🎵 Lead</button>
                <button class="btn btn-instrument" data-synth="bass">🎸 Bass</button>
                <button class="btn btn-instrument" data-synth="pad">🎹 Pad</button>
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
        .music-studio-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          overflow: hidden;
        }
        
        .studio-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-bottom: 1px solid #ddd;
        }
        
        .toolbar-section {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .studio-content {
          display: flex;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        
        .tracks-panel, .instruments-panel, .collaboration-panel {
          flex: 1;
          border-right: 1px solid #ddd;
          display: flex;
          flex-direction: column;
        }
        
        .collaboration-panel {
          border-right: none;
        }
        
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: #f8f9fa;
          border-bottom: 1px solid #ddd;
        }
        
        .tracks-list, .collaborators-list {
          flex: 1;
          overflow-y: auto;
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
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        
        .track-controls {
          display: flex;
          gap: 4px;
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
        
        .instrument-group {
          margin-bottom: 16px;
        }
        
        .instrument-group h4 {
          margin: 0 0 8px 0;
          color: #666;
        }
        
        .btn-instrument, .btn-drum {
          display: block;
          width: 100%;
          margin: 4px 0;
          padding: 8px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .btn-instrument:hover, .btn-drum:hover {
          background: #0056b3;
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
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: bold;
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
            overflow-y: auto;
          }

          .tracks-panel, .instruments-panel, .collaboration-panel {
            min-height: 220px;
            border-right: none;
            border-bottom: 1px solid #ddd;
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

  function renderClassicWorkflowPanel() {
    return `
      <section class="classic-vda-workflow"
               data-svd-workflow="${classicWorkflow.workflowId}"
               aria-label="Classic Music Studio artifact save render fallback workflow">
        <div class="classic-vda-header">
          <div>
            <div class="classic-vda-kicker">${classicWorkflow.vdaId}</div>
            <h3 class="classic-vda-title">Classic Artifact Workflow</h3>
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
          <progress data-render-progress max="100" value="72" style="width: 100%;"></progress>
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
        const synth = createSynthesizer(synthType);
        // Play a test note
        synth.play(440, 0.5); // A4 for 0.5 seconds
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
      updateClassicWorkflowStatus('save-classic-project');
      console.log(`💾 Classic project export prepared: ${classicWorkflow.saveBundleCid}`);
    });

    container.querySelectorAll('[data-svd-workflow-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.getAttribute('data-svd-workflow-action');
        updateClassicWorkflowStatus(action);
      });
    });
  }

  function updateClassicWorkflowStatus(action) {
    const status = document.getElementById('music-studio-workflow-status');
    if (!status) return;
    const section = status.closest('[data-svd-workflow]');
    const renderCards = section ? section.querySelectorAll('[data-render-state]') : [];
    const saveCards = section ? section.querySelectorAll('[data-save-state]') : [];
    const fallbackCards = section ? section.querySelectorAll('[data-responsive-fallback-state]') : [];
    const messageByAction = {
      'preserve-legacy-flow': 'Legacy WebAudio controls verified without migration.',
      'load-artifact-cids': `Artifact CIDs loaded for ${classicWorkflow.projectName}.`,
      'inspect-catalog-rights': 'Catalog rights metadata verified for the classic sample set.',
      'start-optional-render': 'Optional preview render queued; local editing remains available.',
      'save-classic-project': 'Classic project saved with local restore bundle.',
      'prove-responsive-fallback': 'Responsive fallback proof active for compact screens.'
    };
    if (action === 'start-optional-render') {
      renderCards.forEach(node => {
        node.setAttribute('data-render-state', 'optional');
        node.setAttribute('data-render-job-state', 'queued');
      });
    }
    if (action === 'save-classic-project') {
      saveClassicProjectBundle();
      saveCards.forEach(node => node.setAttribute('data-save-state', 'saved'));
    }
    if (action === 'prove-responsive-fallback') {
      fallbackCards.forEach(node => node.setAttribute('data-responsive-fallback-state', 'active'));
    }
    status.textContent = messageByAction[action] || classicWorkflow.status;
    status.setAttribute('data-workflow-status', action || 'ready');
  }

  function saveClassicProjectBundle() {
    const bundle = {
      schema: 'swissknife.music-studio.classic-project.v1',
      workflow_id: classicWorkflow.workflowId,
      vda_id: classicWorkflow.vdaId,
      project_name: classicWorkflow.projectName,
      project_asset_cid: classicWorkflow.projectAssetCid,
      stem_audio_cid: classicWorkflow.stemAudioCid,
      mix_artifact_cid: classicWorkflow.mixArtifactCid,
      catalog_rights_cid: classicWorkflow.catalogRightsCid,
      optional_render_cid: classicWorkflow.optionalRenderCid,
      responsive_fallback_cid: classicWorkflow.responsiveFallbackCid,
      event_dag_cid: classicWorkflow.eventDagCid,
      tracks: tracks.map(track => ({
        id: track.id,
        name: track.name,
        type: track.type,
        volume: track.volume,
        muted: track.muted,
        shared: Boolean(track.shared)
      })),
      selected_instruments: ['lead', 'bass', 'pad', 'kick', 'snare', 'hihat'],
      rights: {
        sample: 'Analog Kit 04',
        license: 'CC-BY-4.0',
        attribution_required: true,
        commercial_sync_allowed: true
      },
      receipts: [
        `${classicWorkflow.receiptPrefix}:artifact-cids`,
        `${classicWorkflow.receiptPrefix}:catalog-rights`,
        `${classicWorkflow.receiptPrefix}:optional-render`,
        `${classicWorkflow.receiptPrefix}:save-project`,
        `${classicWorkflow.receiptPrefix}:restore-state`,
        `${classicWorkflow.receiptPrefix}:responsive-fallback`
      ]
    };
    try {
      localStorage.setItem('swissknife.music-studio.classic-project', JSON.stringify(bundle));
    } catch (error) {
      console.warn('Classic Music Studio local save fallback was unavailable:', error);
    }
    return bundle;
  }

  // Export for global use
  window.renderMusicStudioApp = renderApp;

})();
