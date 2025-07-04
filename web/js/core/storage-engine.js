// Storage Engine - Core storage functionality
// Simple global version for the clean GUI

window.StorageEngine = class StorageEngine {
    constructor() {
        console.log('StorageEngine initialized');
        this.ready = false;
    }
    
    async initialize() {
        console.log('Initializing Storage Engine');
        this.ready = true;
        return { success: true };
    }
    
    async store(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
        return { success: true };
    }
    
    async retrieve(key) {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
    }
    
    getStatus() {
        return { ready: this.ready };
    }
};

// Initialize global instance
window.storageEngine = new window.StorageEngine();
