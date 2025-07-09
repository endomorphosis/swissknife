import { WebNNModelInference } from '../ml/webnn-inference.js';

/**
 * AI Engine - Core AI functionality
 * Integrates with WebNN for local inference and provides a unified interface for AI tasks.
 */
export class AIEngine {
    constructor(swissknife) {
        this.swissknife = swissknife;
        this.webnnInference = new WebNNModelInference();
        this.ready = false;
        this.models = [];
    }

    async initialize(options = {}) {
        console.log('Initializing AI Engine with options:', options);
        await this.webnnInference.init();
        this.ready = true;
        this.models = this.webnnInference.listLoadedModels();
        return { success: true };
    }

    async chat(message, modelId = 'default') {
        if (!this.ready) {
            return { success: false, error: 'AI Engine not initialized' };
        }

        // Fallback to WebNN or other methods if not a local IPFS Accelerate model
        try {
            const response = await this.swissknife.chat(message, { modelId: modelId });
            return { success: true, response: response.response };
        } catch (error) {
            console.error('AI Chat error:', error);
            return { success: false, error: error.message };
        }
    }

    getAvailableModels() {
        return this.models;
    }

    getStatus() {
        return { ready: this.ready, webnn: this.webnnInference.getCapabilities() };
    }
}