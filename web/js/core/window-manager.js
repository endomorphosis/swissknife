// Window Manager - Core window management functionality
// Simple global version for the clean GUI

window.WindowManager = class WindowManager {
    constructor() {
        console.log('WindowManager initialized');
    }
    
    // Add window management methods here
    createWindow(options) {
        console.log('Creating window:', options);
    }
    
    closeWindow(windowId) {
        console.log('Closing window:', windowId);
    }
};

// Initialize global instance
window.windowManager = new window.WindowManager();
