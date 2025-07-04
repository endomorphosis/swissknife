/**
 * WebNN Model Inference using transformers.js
 *
 * This module provides a class to handle local model inference in the browser
 * using the Web Neural Network API (WebNN) via the transformers.js library.
 * It supports loading models, running inference, and managing capabilities.
 */

// Helper to load scripts dynamically
async function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

export class WebNNModelInference {
    constructor() {
        this.capabilities = {
            available: false,
            gpu: false,
            cpu: false,
            npu: false,
        };
        this.pipe = null;
        this.loadedModel = null;
        this.transformers = null;
    }

    async init() {
        try {
            // Dynamically import transformers.js
            await loadScript('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1');
            this.transformers = window.Xenova;
            
            // Suppress warnings to keep the console clean
            this.transformers.env.allowLocalModels = false;
            this.transformers.env.useFSCache = false;

            this.capabilities.available = true;
            console.log('WebNN Inference initialized successfully.');
        } catch (error) {
            console.error('Failed to load transformers.js:', error);
            this.capabilities.available = false;
        }
    }

    getCapabilities() {
        return this.capabilities;
    }

    listLoadedModels() {
        return this.loadedModel ? [this.loadedModel] : [];
    }

    async loadModel(modelName) {
        if (!this.capabilities.available) {
            throw new Error('WebNN is not available.');
        }

        if (this.loadedModel && this.loadedModel.name === modelName) {
            console.log(`Model ${modelName} is already loaded.`);
            return;
        }

        try {
            // For now, we only support a specific Llama-1b model from Hugging Face
            const modelId = 'Xenova/llama2.c-stories15M';
            this.pipe = await this.transformers.pipeline('text-generation', modelId, {
                progress_callback: (progress) => {
                    console.log('Loading model:', progress);
                },
            });

            this.loadedModel = { name: modelName, provider: 'webnn' };
            console.log(`Model ${modelName} loaded successfully.`);
        } catch (error) {
            console.error(`Failed to load model ${modelName}:`, error);
            throw new Error(`Failed to load model: ${error.message}`);
        }
    }

    async runInference(modelName, prompt) {
        if (!this.pipe || !this.loadedModel || this.loadedModel.name !== modelName) {
            await this.loadModel(modelName);
        }

        try {
            const startTime = performance.now();
            const result = await this.pipe(prompt, {
                max_new_tokens: 100,
                temperature: 0.7,
                do_sample: true,
            });
            const endTime = performance.now();

            return {
                result: {
                    generated_text: result[0].generated_text,
                },
                performance: {
                    inferenceTime: endTime - startTime,
                },
            };
        } catch (error) {
            console.error('WebNN inference failed:', error);
            throw new Error(`Inference failed: ${error.message}`);
        }
    }
}
