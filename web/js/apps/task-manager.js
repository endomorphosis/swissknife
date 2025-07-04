// Task Manager App - Simple stub
// Global version for the clean GUI

window.TaskManagerApp = class TaskManagerApp {
    constructor(contentElement, desktop) {
        this.contentElement = contentElement;
        this.desktop = desktop;
        console.log('TaskManagerApp initialized');
    }
    
    render() {
        if (this.contentElement) {
            this.contentElement.innerHTML = `
                <div class="app-placeholder">
                    <h2>⚡ Task Manager</h2>
                    <p>Task management functionality will be implemented here.</p>
                    <button onclick="this.closest('.window').querySelector('.window-control.close').click()">Close</button>
                </div>
            `;
        }
    }
};
