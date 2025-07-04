// WebNN Engine - WebNN and hardware acceleration functionality
// Simple global version for the clean GUI

window.WebNNEngine = class WebNNEngine {
    constructor() {
        console.log('WebNNEngine initialized');
        this.available = false;
        this.webgpu = false;
        this.webnn = false;
    }
    
    async initialize() {
        console.log('Checking WebNN/WebGPU support');
        
        // Check WebGPU support
        if (navigator.gpu) {
            try {
                const adapter = await navigator.gpu.requestAdapter();
                if (adapter) {
                    this.webgpu = true;
                    console.log('WebGPU support detected');
                }
            } catch (e) {
                console.log('WebGPU not available:', e.message);
            }
        }
        
        // Check WebNN support
        if (navigator.ml) {
            this.webnn = true;
            console.log('WebNN support detected');
        }
        
        this.available = this.webgpu || this.webnn;
        return { success: true };
    }
    
    getHardwareStatus() {
        return {
            webgpu: this.webgpu,
            webnn: this.webnn,
            available: this.available
        };
    }
};

// Initialize global instance
window.webnnEngine = new window.WebNNEngine();
