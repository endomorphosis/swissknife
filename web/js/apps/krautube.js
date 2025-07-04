/**
 * Krautube App for SwissKnife Web Desktop
 * Plays videos from IPFS sources
 */

export class KrautubeApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
  }

  async initialize() {
    this.swissknife = this.desktop.swissknife;
  }

  createWindow() {
    const content = `
      <div class="krautube-container">
        <div class="krautube-header">
          <h3>Krautube - IPFS Video Player</h3>
        </div>
        <div class="krautube-content">
          <input type="text" id="ipfs-cid-input" placeholder="Enter IPFS CID (e.g., Qm...)" style="width: 80%; padding: 8px; margin-bottom: 10px;">
          <button id="load-video-btn" style="padding: 8px 12px;">Load Video</button>
          <video id="video-player" controls style="width: 100%; margin-top: 20px;"></video>
          <div id="video-status" style="margin-top: 10px; color: #555;"></div>
        </div>
      </div>
    `;

    const window = this.desktop.createWindow({
      title: 'Krautube',
      content: content,
      width: 800,
      height: 600,
      resizable: true
    });

    this.setupEventListeners(window);
    return window;
  }

  setupEventListeners(window) {
    const loadVideoBtn = window.querySelector('#load-video-btn');
    loadVideoBtn.addEventListener('click', () => this.loadVideo(window));
  }

  async loadVideo(window) {
    const ipfsCidInput = window.querySelector('#ipfs-cid-input');
    const videoPlayer = window.querySelector('#video-player');
    const videoStatus = window.querySelector('#video-status');
    const cid = ipfsCidInput.value.trim();

    if (!cid) {
      videoStatus.textContent = 'Please enter an IPFS CID.';
      return;
    }

    videoStatus.textContent = 'Loading video from IPFS...';
    videoPlayer.src = ''; // Clear previous video

    try {
      // Assuming a public IPFS gateway for now. In a real app, you'd use a local IPFS node or a dedicated gateway.
      const gatewayUrl = `https://ipfs.io/ipfs/${cid}`; 
      videoPlayer.src = gatewayUrl;
      videoPlayer.load();
      videoPlayer.play();
      videoStatus.textContent = `Playing video from ${gatewayUrl}`;
    } catch (error) {
      videoStatus.textContent = `Error loading video: ${error.message}`;
      console.error('Error loading IPFS video:', error);
    }
  }
}
