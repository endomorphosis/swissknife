class PhasedCleanupApp {
    private phases = [
        { id: 'phase1', name: 'Phase 1: Create Organizational Structure', description: 'Create target directories without moving files yet.', status: 'Not Started' },
        { id: 'phase2', name: 'Phase 2: Archive Legacy Test Infrastructure', description: 'Move superseded test files to archive.', status: 'Not Started' },
        { id: 'phase3', name: 'Phase 3: Consolidate Active Configurations', description: 'Organize active configurations and remove duplicates.', status: 'Not Started' },
        { id: 'phase4', name: 'Phase 4: Reorganize Scripts and Tools', description: 'Move scripts to appropriate tool directories.', status: 'Not Started' },
        { id: 'phase5', 'name': 'Phase 5: Clean Documentation and Reports', description: 'Organize documentation and archive old reports.', status: 'Not Started' },
        { id: 'phase6', name: 'Phase 6: Final Validation and Cleanup', description: 'Verify everything works and remove empty directories.', status: 'Not Started' }
    ];

    constructor() {
        console.log("PhasedCleanupApp initialized.");
        this.loadPhaseStatus();
    }

    private loadPhaseStatus() {
        const savedStatus = localStorage.getItem('phasedCleanupStatus');
        if (savedStatus) {
            const parsedStatus = JSON.parse(savedStatus);
            this.phases = this.phases.map(phase => ({
                ...phase,
                status: parsedStatus[phase.id] || phase.status
            }));
        }
    }

    private savePhaseStatus() {
        const statusToSave = this.phases.reduce((acc, phase) => {
            acc[phase.id] = phase.status;
            return acc;
        }, {});
        localStorage.setItem('phasedCleanupStatus', JSON.stringify(statusToSave));
    }

    private updatePhaseStatus(phaseId: string, newStatus: string) {
        const phaseIndex = this.phases.findIndex(p => p.id === phaseId);
        if (phaseIndex > -1) {
            this.phases[phaseIndex].status = newStatus;
            this.savePhaseStatus();
            this.renderPhases(); // Re-render to reflect status change
        }
    }

    private runPhase(phaseId: string) {
        console.log(`Attempting to run ${phaseId}...`);
        this.updatePhaseStatus(phaseId, 'In Progress');
        // In a real scenario, this would trigger a shell command via SwissKnifeCLIAdapter
        // For now, simulate completion after a delay
        setTimeout(() => {
            this.updatePhaseStatus(phaseId, 'Completed');
            console.log(`${phaseId} completed.`);
        }, 2000);
    }

    render(parentElement: HTMLElement) {
        const container = document.createElement('div');
        container.className = 'phased-cleanup-app';
        container.innerHTML = `
            <style>
                .phased-cleanup-app {
                    padding: 20px;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    color: #333;
                    background-color: #f0f2f5;
                    height: 100%;
                    overflow-y: auto;
                }
                .phased-cleanup-app h1 {
                    color: #0056b3;
                    margin-bottom: 20px;
                    text-align: center;
                }
                .phase-list {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 20px;
                }
                .phase-card {
                    background-color: #fff;
                    border-radius: 8px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    transition: transform 0.2s ease-in-out;
                }
                .phase-card:hover {
                    transform: translateY(-5px);
                }
                .phase-card h2 {
                    color: #333;
                    font-size: 1.4em;
                    margin-top: 0;
                    margin-bottom: 10px;
                }
                .phase-card p {
                    font-size: 0.9em;
                    color: #666;
                    flex-grow: 1;
                    margin-bottom: 15px;
                }
                .phase-status {
                    font-weight: bold;
                    padding: 5px 10px;
                    border-radius: 4px;
                    font-size: 0.8em;
                    text-align: center;
                    margin-bottom: 10px;
                }
                .status-Not-Started { background-color: #e0e0e0; color: #555; }
                .status-In-Progress { background-color: #ffe0b2; color: #fb8c00; }
                .status-Completed { background-color: #c8e6c9; color: #2e7d32; }
                .phase-actions button {
                    background-color: #007bff;
                    color: white;
                    border: none;
                    padding: 10px 15px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 0.9em;
                    transition: background-color 0.2s ease-in-out;
                    width: 100%;
                }
                .phase-actions button:hover {
                    background-color: #0056b3;
                }
                .phase-actions button:disabled {
                    background-color: #cccccc;
                    cursor: not-allowed;
                }
            </style>
            <h1>SwissKnife Phased Cleanup Manager</h1>
            <div class="phase-list"></div>
        `;
        parentElement.appendChild(container);
        this.renderPhases();
    }

    private renderPhases() {
        const phaseListContainer = document.querySelector('.phased-cleanup-app .phase-list');
        if (!phaseListContainer) return;
        phaseListContainer.innerHTML = ''; // Clear existing content

        this.phases.forEach(phase => {
            const phaseCard = document.createElement('div');
            phaseCard.className = 'phase-card';
            phaseCard.innerHTML = `
                <h2>${phase.name}</h2>
                <p>${phase.description}</p>
                <div class="phase-status status-${phase.status.replace(/ /g, '-')}" data-phase-id="${phase.id}">Status: ${phase.status}</div>
                <div class="phase-actions">
                    <button data-phase-id="${phase.id}" ${phase.status === 'In Progress' || phase.status === 'Completed' ? 'disabled' : ''}>Run Phase</button>
                </div>
            `;
            phaseListContainer.appendChild(phaseCard);

            const runButton = phaseCard.querySelector('button');
            if (runButton) {
                runButton.addEventListener('click', () => this.runPhase(phase.id));
            }
        });
    }
}

export default PhasedCleanupApp;