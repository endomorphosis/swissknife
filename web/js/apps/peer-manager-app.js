/**
 * PeerManagerApp
 *
 * A desktop application for managing P2P connections, viewing peer files,
 * and initiating file transfers.
 */
export class PeerManagerApp {
    constructor(desktop) {
        this.desktop = desktop;
        this.swissknife = desktop.swissknife;
        this.contentElement = null;
        this.peerListInterval = null;
    }

    createWindow() {
        return `
            <div class="peer-manager-app">
                <div class="app-header">
                    <h2>🔗 Peer Manager</h2>
                    <p>Manage your peer-to-peer connections and shared files</p>
                </div>
                
                <div class="peer-manager-tabs">
                    <button class="peer-tab active" data-tab="peers">Connected Peers</button>
                    <button class="peer-tab" data-tab="files">Shared Files</button>
                    <button class="peer-tab" data-tab="ucans">UCANs (Access Control)</button>
                </div>
                
                <div class="peer-manager-content">
                    <!-- Connected Peers Tab -->
                    <div class="peer-tab-content active" id="peers-tab">
                        <h3>Your Peer ID: <span id="local-peer-id">Loading...</span></h3>
                        <div class="peer-list" id="connected-peers-list">
                            <p>Loading connected peers...</p>
                        </div>
                    </div>
                    
                    <!-- Shared Files Tab -->
                    <div class="peer-tab-content" id="files-tab">
                        <h3>Files Shared by Peers</h3>
                        <div class="shared-files-list" id="shared-files-list">
                            <p>No files announced by peers yet.</p>
                        </div>
                    </div>

                    <!-- UCANs Tab -->
                    <div class="peer-tab-content" id="ucans-tab">
                        <h3>UCANs (User Controlled Authorization Networks)</h3>
                        <p>Manage delegated access to your files and services.</p>
                        <div class="ucan-management">
                            <button class="btn-primary">Create New UCAN</button>
                            <button class="btn-secondary">View My UCANs</button>
                        </div>
                        <p style="margin-top: 15px; font-style: italic;">UCAN integration is a future enhancement.</p>
                    </div>
                </div>
            </div>
        `;
    }

    async initialize(contentElement) {
        this.contentElement = contentElement;
        this.setupEventListeners();
        await this.updatePeerInfo();
        this.peerListInterval = setInterval(() => this.updatePeerInfo(), 5000); // Update every 5 seconds
    }

    setupEventListeners() {
        // Tab switching
        const tabs = this.contentElement.querySelectorAll('.peer-tab');
        const tabContents = this.contentElement.querySelectorAll('.peer-tab-content');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                
                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Update active content
                tabContents.forEach(content => content.classList.remove('active'));
                const targetContent = this.contentElement.querySelector(`#${tabName}-tab`);
                if (targetContent) targetContent.classList.add('active');

                if (tabName === 'peers') {
                    this.updatePeerInfo();
                } else if (tabName === 'files') {
                    this.updateSharedFilesList();
                }
            });
        });
    }

    async updatePeerInfo() {
        const localPeerIdElement = this.contentElement.querySelector('#local-peer-id');
        const connectedPeersList = this.contentElement.querySelector('#connected-peers-list');

        if (!this.swissknife.network || !this.swissknife.network.libp2p || !this.swissknife.network.libp2p.isStarted()) {
            localPeerIdElement.textContent = 'Libp2p not started.';
            connectedPeersList.innerHTML = '<p>Libp2p network is not active. Please ensure it starts correctly.</p>';
            console.warn('PeerManagerApp: Libp2p network not ready.');
            return;
        }

        const localPeerId = this.swissknife.network.getPeerId();
        if (localPeerId) {
            localPeerIdElement.textContent = localPeerId;
        } else {
            localPeerIdElement.textContent = 'Unknown Peer ID';
        }

        try {
            const peers = await this.swissknife.network.getActivePeers();
            if (peers.length === 0) {
                connectedPeersList.innerHTML = '<p>No peers connected.</p>';
                return;
            }

            connectedPeersList.innerHTML = '';
            for (const peerId of peers) {
                if (peerId === localPeerId) continue; // Don't list self
                const peerItem = document.createElement('div');
                peerItem.className = 'peer-item';
                peerItem.innerHTML = `
                    <div class="peer-id">${peerId}</div>
                    <div class="peer-actions">
                        <button class="btn-small" data-peer-id="${peerId}" data-action="query-files">Query Files</button>
                        <button class="btn-small btn-danger" data-peer-id="${peerId}" data-action="disconnect">Disconnect</button>
                    </div>
                `;
                connectedPeersList.appendChild(peerItem);

                peerItem.querySelector('[data-action="query-files"]').addEventListener('click', async (e) => {
                    const targetPeerId = e.target.dataset.peerId;
                    console.log(`PeerManagerApp: Querying files from peer: ${targetPeerId}`);
                    try {
                        const files = await this.swissknife.network.queryFiles(targetPeerId);
                        if (files && files.length > 0) {
                            this.swissknife.replication.registerPeerFiles(targetPeerId, files);
                            this.updateSharedFilesList(); // Refresh shared files tab
                            this.desktop.showNotification(`Received ${files.length} files from ${targetPeerId.substring(0, 8)}...`, 'success');
                        } else {
                            this.desktop.showNotification(`No files found on ${targetPeerId.substring(0, 8)}...`, 'info');
                        }
                    } catch (queryError) {
                        this.desktop.showNotification(`Failed to query files from ${targetPeerId.substring(0, 8)}...: ${queryError.message}`, 'error');
                        console.error('PeerManagerApp: Error querying files:', queryError);
                    }
                });
                // Disconnect action is more complex, requires libp2p.hangup or similar
                // For now, it's a placeholder.
                peerItem.querySelector('[data-action="disconnect"]').addEventListener('click', (e) => {
                    const targetPeerId = e.target.dataset.peerId;
                    this.desktop.showNotification(`Disconnecting from ${targetPeerId.substring(0, 8)}... (Not yet implemented)`, 'info');
                });
            }
        } catch (error) {
            connectedPeersList.innerHTML = `<p style="color: red;">Error fetching peers: ${error.message}</p>`;
            console.error('PeerManagerApp: Error in updatePeerInfo:', error);
        }

        connectedPeersList.innerHTML = '';
        for (const peerId of peers) {
            if (peerId === localPeerId) continue; // Don't list self
            const peerItem = document.createElement('div');
            peerItem.className = 'peer-item';
            peerItem.innerHTML = `
                <div class="peer-id">${peerId}</div>
                <div class="peer-actions">
                    <button class="btn-small" data-peer-id="${peerId}" data-action="query-files">Query Files</button>
                    <button class="btn-small btn-danger" data-peer-id="${peerId}" data-action="disconnect">Disconnect</button>
                </div>
            `;
            connectedPeersList.appendChild(peerItem);

            peerItem.querySelector('[data-action="query-files"]').addEventListener('click', async (e) => {
                const targetPeerId = e.target.dataset.peerId;
                console.log(`Querying files from peer: ${targetPeerId}`);
                const files = await this.swissknife.network.queryFiles(targetPeerId);
                if (files && files.length > 0) {
                    this.swissknife.replication.registerPeerFiles(targetPeerId, files);
                    this.updateSharedFilesList(); // Refresh shared files tab
                    this.desktop.showNotification(`Received ${files.length} files from ${targetPeerId.substring(0, 8)}...`, 'success');
                } else {
                    this.desktop.showNotification(`No files found on ${targetPeerId.substring(0, 8)}...`, 'info');
                }
            });
            // Disconnect action is more complex, requires libp2p.hangup or similar
            // For now, it's a placeholder.
            peerItem.querySelector('[data-action="disconnect"]').addEventListener('click', (e) => {
                const targetPeerId = e.target.dataset.peerId;
                this.desktop.showNotification(`Disconnecting from ${targetPeerId.substring(0, 8)}... (Not yet implemented)`, 'info');
            });
        }
    }

    updateSharedFilesList() {
        const sharedFilesList = this.contentElement.querySelector('#shared-files-list');
        sharedFilesList.innerHTML = '';

        let totalFiles = 0;
        for (const [peerId, files] of this.swissknife.replication.peerFileIndex.entries()) {
            if (files.size > 0) {
                const peerSection = document.createElement('div');
                peerSection.className = 'peer-shared-section';
                peerSection.innerHTML = `<h4>Files from ${peerId.substring(0, 8)}... (${files.size} files)</h4>`;
                const ul = document.createElement('ul');
                for (const hash of files) {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <span>Hash: ${hash.substring(0, 12)}...</span>
                        <button class="btn-small" data-peer-id="${peerId}" data-hash="${hash}" data-action="request-file">Request File</button>
                    `;
                    ul.appendChild(li);

                    li.querySelector('[data-action="request-file"]').addEventListener('click', async (e) => {
                        const targetPeerId = e.target.dataset.peerId;
                        const targetHash = e.target.dataset.hash;
                        this.desktop.showNotification(`Requesting file ${targetHash.substring(0, 8)}... from ${targetPeerId.substring(0, 8)}...`, 'info');
                        try {
                            const fileContent = await this.swissknife.network.requestFile(targetPeerId, targetHash);
                            console.log(`Received file content for ${targetHash}:`, fileContent);
                            this.desktop.showNotification(`File ${targetHash.substring(0, 8)}... received! Check console.`, 'success');
                            // Here you would typically save the file to VFS or display it
                        } catch (error) {
                            this.desktop.showNotification(`Failed to get file ${targetHash.substring(0, 8)}...: ${error.message}`, 'error');
                        }
                    });
                }
                peerSection.appendChild(ul);
                sharedFilesList.appendChild(peerSection);
                totalFiles += files.size;
            }
        }

        if (totalFiles === 0) {
            sharedFilesList.innerHTML = '<p>No files announced by peers yet.</p>';
        }
    }

    cleanup() {
        if (this.peerListInterval) {
            clearInterval(this.peerListInterval);
        }
        // Additional cleanup for event listeners if necessary
    }
}
