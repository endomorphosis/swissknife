// SwissKnife Core Engine - Browser Adapter
// This file adapts the existing TypeScript SwissKnife core for web usage

// Browser-specific implementations
class BrowserStorageEngine {
    constructor() {
        this.db = null;
        this.initIndexedDB();
    }
    
    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('SwissKnifeStorage', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object stores
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files', { keyPath: 'path' });
                }
                if (!db.objectStoreNames.contains('tasks')) {
                    db.createObjectStore('tasks', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('cache')) {
                    db.createObjectStore('cache', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', { keyPath: 'key' });
                }
            };
        });
    }
    
    async store(collection, key, data) {
        const transaction = this.db.transaction([collection], 'readwrite');
        const store = transaction.objectStore(collection);
        return store.put({ ...data, [collection === 'files' ? 'path' : 'key']: key });
    }
    
    async retrieve(collection, key) {
        const transaction = this.db.transaction([collection], 'readonly');
        const store = transaction.objectStore(collection);
        const request = store.get(key);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async list(collection) {
        const transaction = this.db.transaction([collection], 'readonly');
        const store = transaction.objectStore(collection);
        const request = store.getAll();
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

class BrowserTaskManager {
    constructor({ storage }) {
        this.storage = storage;
        this.tasks = new Map();
    }

    async loadTasks() {
        if (this.tasks.size > 0) return;

        try {
            const stored = await this.storage.list('tasks');
            for (const item of stored) {
                const task = item?.id ? item : item?.value;
                if (task?.id) {
                    this.tasks.set(task.id, task);
                }
            }
        } catch (error) {
            console.warn('Unable to load browser tasks:', error);
        }
    }

    async addTask(task) {
        this.tasks.set(task.id, task);
        await this.storage.store('tasks', task.id, task);
        return task;
    }

    async getTask(taskId) {
        await this.loadTasks();
        return this.tasks.get(taskId) || null;
    }

    async updateTask(task) {
        this.tasks.set(task.id, task);
        await this.storage.store('tasks', task.id, task);
        return task;
    }
}

class BrowserScheduler {
    constructor() {
        this.queue = [];
    }

    add(task) {
        this.queue.push(task);
        this.queue.sort((a, b) => String(a.priority || '').localeCompare(String(b.priority || '')));
    }

    list() {
        return [...this.queue];
    }
}

class BrowserGraphOfThought {
    constructor({ taskManager, aiEngine }) {
        this.taskManager = taskManager;
        this.aiEngine = aiEngine;
    }

    async decompose(goal) {
        return [{
            id: `thought-${Date.now()}`,
            goal,
            status: 'planned'
        }];
    }
}

// Browser AI Engine using WebNN/WebGPU when available
class BrowserAIEngine {
    constructor() {
        this.webnn = null;
        this.webgpu = null;
        this.initHardwareAcceleration();
    }
    
    async initHardwareAcceleration() {
        // Check for WebNN support
        if ('ml' in navigator) {
            try {
                this.webnn = await navigator.ml.createContext();
                console.log('WebNN initialized successfully');
            } catch (error) {
                console.warn('WebNN not available:', error);
            }
        }
        
        // Check for WebGPU support
        if ('gpu' in navigator) {
            try {
                const adapter = await navigator.gpu.requestAdapter();
                if (adapter) {
                    this.webgpu = await adapter.requestDevice();
                    console.log('WebGPU initialized successfully');
                }
            } catch (error) {
                console.warn('WebGPU not available:', error);
            }
        }
    }
    
    async inferLocal(model, input, options = {}) {
        // Use WebNN if available for local inference
        if (this.webnn && options.useLocalInference) {
            return this.inferWithWebNN(model, input, options);
        }
        
        // Fallback to API-based inference
        return this.inferWithAPI(model, input, options);
    }
    
    async inferWithWebNN(model, input, options) {
        // Implementation for WebNN-based local inference
        try {
            // This would implement actual WebNN model loading and inference
            // For now, return a placeholder
            return {
                result: 'WebNN inference result',
                performance: { 
                    inferenceTime: 50,
                    hardware: 'WebNN'
                }
            };
        } catch (error) {
            console.error('WebNN inference failed:', error);
            return this.inferWithAPI(model, input, options);
        }
    }
    
    async inferWithAPI(model, input, options) {
        // Standard API-based inference
        const apiKey = this.getApiKey(model.provider);
        if (!apiKey) {
            throw new Error(`API key not configured for ${model.provider}`);
        }
        
        const response = await fetch(model.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model.name,
                messages: input.messages || [{ role: 'user', content: input.prompt }],
                max_tokens: options.maxTokens || 2048,
                temperature: options.temperature || 0.7
            })
        });
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            result: data.choices?.[0]?.message?.content || data.content?.[0]?.text,
            performance: {
                inferenceTime: Date.now() - options.startTime,
                hardware: 'API'
            }
        };
    }
    
    getApiKey(provider) {
        // Get API key from localStorage or sessionStorage
        return localStorage.getItem(`${provider}_api_key`) || 
               sessionStorage.getItem(`${provider}_api_key`);
    }
}

// Web Worker for background task processing
class BrowserTaskRunner {
    constructor() {
        this.workers = new Map();
        this.maxWorkers = navigator.hardwareConcurrency || 4;
    }
    
    async executeTask(task) {
        return new Promise((resolve, reject) => {
            const worker = this.getAvailableWorker();
            
            worker.postMessage({
                type: 'EXECUTE_TASK',
                task: task,
                timestamp: Date.now()
            });
            
            const handleMessage = (event) => {
                if (event.data.type === 'TASK_COMPLETE') {
                    worker.removeEventListener('message', handleMessage);
                    this.releaseWorker(worker);
                    resolve(event.data.result);
                } else if (event.data.type === 'TASK_ERROR') {
                    worker.removeEventListener('message', handleMessage);
                    this.releaseWorker(worker);
                    reject(new Error(event.data.error));
                }
            };
            
            worker.addEventListener('message', handleMessage);
        });
    }
    
    getAvailableWorker() {
        // Find available worker or create new one
        for (const [id, worker] of this.workers) {
            if (!worker.busy) {
                worker.busy = true;
                return worker;
            }
        }
        
        if (this.workers.size < this.maxWorkers) {
            const worker = new Worker(new URL('./task-worker.js', import.meta.url));
            worker.busy = true;
            worker.id = `worker-${this.workers.size}`;
            this.workers.set(worker.id, worker);
            return worker;
        }
        
        // If all workers busy, wait for one to become available
        return new Promise(resolve => {
            const checkWorkers = () => {
                for (const [id, worker] of this.workers) {
                    if (!worker.busy) {
                        worker.busy = true;
                        resolve(worker);
                        return;
                    }
                }
                setTimeout(checkWorkers, 10);
            };
            checkWorkers();
        });
    }
    
    releaseWorker(worker) {
        worker.busy = false;
    }
}

// Main SwissKnife Web Engine
export class SwissKnifeWebEngine {
    constructor(options = {}) {
        this.options = options;
        this.storage = new BrowserStorageEngine();
        this.ai = new BrowserAIEngine();
        this.taskRunner = new BrowserTaskRunner();
        this.taskManager = null;
        this.scheduler = null;
        this.graphOfThought = null;
        
        this.initialized = false;
        this.eventListeners = new Map();
    }
    
    async initialize() {
        if (this.initialized) return;
        
        try {
            // Initialize storage
            await this.storage.initIndexedDB();
            
            // Initialize AI engine
            await this.ai.initHardwareAcceleration();
            
            // Initialize browser-local task management. Host task managers and
            // worker-thread implementations are exposed only through host
            // entrypoints.
            this.scheduler = new BrowserScheduler();
            this.taskManager = new BrowserTaskManager({
                scheduler: this.scheduler,
                storage: this.storage
            });
            
            this.graphOfThought = new BrowserGraphOfThought({
                taskManager: this.taskManager,
                aiEngine: this.ai
            });
            
            this.initialized = true;
            this.emit('initialized');
            
            console.log('SwissKnife Web Engine initialized successfully');
        } catch (error) {
            console.error('Failed to initialize SwissKnife Web Engine:', error);
            throw error;
        }
    }
    
    // AI Operations
    async chat(message, options = {}) {
        await this.ensureInitialized();
        
        const model = options.model || this.getDefaultModel();
        const startTime = Date.now();
        
        try {
            const result = await this.ai.inferLocal(model, {
                prompt: message,
                messages: options.messages
            }, {
                ...options,
                startTime
            });
            
            this.emit('chat-response', { message, result, model });
            return result;
        } catch (error) {
            this.emit('chat-error', { message, error, model });
            throw error;
        }
    }
    
    // Task Management
    async createTask(taskData) {
        await this.ensureInitialized();
        
        const task = {
            id: this.generateTaskId(),
            ...taskData,
            status: 'pending',
            created: new Date(),
            updated: new Date()
        };
        
        await this.taskManager.addTask(task);
        this.emit('task-created', task);
        
        return task;
    }
    
    async executeTask(taskId, options = {}) {
        await this.ensureInitialized();
        
        const task = await this.taskManager.getTask(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }
        
        task.status = 'running';
        task.updated = new Date();
        await this.taskManager.updateTask(task);
        
        try {
            const result = await this.taskRunner.executeTask(task);
            
            task.status = 'completed';
            task.result = result;
            task.updated = new Date();
            await this.taskManager.updateTask(task);
            
            this.emit('task-completed', task);
            return result;
        } catch (error) {
            task.status = 'failed';
            task.error = error.message;
            task.updated = new Date();
            await this.taskManager.updateTask(task);
            
            this.emit('task-failed', task);
            throw error;
        }
    }
    
    // File Operations
    async storeFile(path, content, metadata = {}) {
        await this.ensureInitialized();
        
        const fileData = {
            path,
            content,
            metadata: {
                ...metadata,
                size: content.length,
                modified: new Date(),
                type: metadata.type || this.detectFileType(path)
            }
        };
        
        await this.storage.store('files', path, fileData);
        this.emit('file-stored', fileData);
        
        return fileData;
    }
    
    async retrieveFile(path) {
        await this.ensureInitialized();
        return this.storage.retrieve('files', path);
    }
    
    async listFiles(pattern = '*') {
        await this.ensureInitialized();
        const files = await this.storage.list('files');
        
        if (pattern === '*') return files;
        
        // Simple pattern matching
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return files.filter(file => regex.test(file.path));
    }
    
    // Configuration
    async setConfig(key, value) {
        await this.ensureInitialized();
        
        await this.storage.store('config', key, { key, value, updated: new Date() });
        this.emit('config-updated', { key, value });
    }
    
    async getConfig(key) {
        await this.ensureInitialized();
        
        const config = await this.storage.retrieve('config', key);
        return config?.value;
    }
    
    // Hardware acceleration status
    getHardwareStatus() {
        return {
            webnn: !!this.ai.webnn,
            webgpu: !!this.ai.webgpu,
            workers: this.taskRunner.workers.size,
            maxWorkers: this.taskRunner.maxWorkers
        };
    }
    
    // Event system
    on(event, listener) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(listener);
    }
    
    off(event, listener) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }
    
    emit(event, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }
    
    // Utility methods
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }
    
    generateTaskId() {
        return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    getDefaultModel() {
        return {
            name: 'gpt-3.5-turbo',
            provider: 'openai',
            endpoint: 'https://api.openai.com/v1/chat/completions'
        };
    }
    
    detectFileType(path) {
        const ext = path.split('.').pop().toLowerCase();
        const typeMap = {
            'js': 'application/javascript',
            'ts': 'application/typescript',
            'json': 'application/json',
            'md': 'text/markdown',
            'txt': 'text/plain',
            'html': 'text/html',
            'css': 'text/css'
        };
        return typeMap[ext] || 'application/octet-stream';
    }
}

// Create global instance
export const swissknife = new SwissKnifeWebEngine();

// Auto-initialize when loaded
swissknife.initialize().catch(console.error);
