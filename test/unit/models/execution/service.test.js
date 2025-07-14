// Mock common dependencies
jest.mock("chalk", () => ({ default: (str) => str, red: (str) => str, green: (str) => str, blue: (str) => str }));
jest.mock("nanoid", () => ({ nanoid: () => "test-id" }));
jest.mock("fs", () => ({ promises: { readFile: jest.fn(), writeFile: jest.fn(), mkdir: jest.fn() } }));
import { ModelExecutionService } from '@models/execution/service.js';
// Mock bridge class
class MockBridge {
    id;
    name;
    source;
    target;
    initialized = false;
    callStub;
    constructor(id, name, target) {
        this.id = id;
        this.name = name;
        this.source = 'current';
        this.target = target;
        this.callStub = sinon.stub();
    }
    isInitialized() {
        return this.initialized;
    }
    async initialize() {
        this.initialized = true;
        return true;
    }
    async call(method, args) {
        return this.callStub(method, args);
    }
    // Method to set up call mock responses
    setupCallResponse(method, response) {
        this.callStub.withArgs(method, sinon.match.any).resolves(response);
    }
    // Method to set up call mock errors
    setupCallError(method, error) {
        this.callStub.withArgs(method, sinon.match.any).rejects(error);
    }
}
describe('Model Execution Service', () => {
    let service;
    let modelRegistry;
    let integrationRegistry;
    let configManager;
    let gooseBridge;
    let ipfsAccelerateBridge;
    let swissKnifeOldBridge;
    beforeEach(() => {
        // Reset singletons
        ModelExecutionService.instance = null;
        service = ModelExecutionService.getInstance();
        // Set up ModelRegistry mock
        modelRegistry = ModelRegistry.getInstance();
        sinon.stub(modelRegistry, 'getModel');
        sinon.stub(modelRegistry, 'getProvider');
        sinon.stub(modelRegistry, 'getApiKey');
        // Set up IntegrationRegistry mock
        integrationRegistry = IntegrationRegistry.getInstance();
        sinon.stub(integrationRegistry, 'getBridge');
        // Set up bridge mocks
        gooseBridge = new MockBridge('goose-mcp', 'Goose MCP Bridge', 'goose');
        ipfsAccelerateBridge = new MockBridge('ipfs-accelerate', 'IPFS Accelerate Bridge', 'ipfs_accelerate');
        swissKnifeOldBridge = new MockBridge('swissknife-old', 'SwissKnife Old Bridge', 'swissknife_old');
        // Register bridges with registry mock
        integrationRegistry.getBridge
            .withArgs('goose-mcp').returns(gooseBridge);
        integrationRegistry.getBridge
            .withArgs('ipfs-accelerate').returns(ipfsAccelerateBridge);
        integrationRegistry.getBridge
            .withArgs('swissknife-old').returns(swissKnifeOldBridge);
        // Set up ConfigurationManager mock
        configManager = ConfigurationManager.getInstance();
        // Spy on emitted events
        sinon.spy(service, 'emit');
    });
    afterEach(() => {
        sinon.restore();
    });
    it('should execute a model from the current source', async () => {
        // Set up test model
        const model = {
            id: 'test-model',
            name: 'Test Model',
            provider: 'test-provider',
            source: 'current',
            capabilities: { streaming: true }
        };
        // Set up test provider
        const provider = {
            id: 'test-provider',
            name: 'Test Provider',
            models: [model],
            baseURL: 'https://api.test.com',
            envVar: 'TEST_API_KEY'
        };
        // Configure mock responses
        modelRegistry.getModel
            .withArgs('test-model').returns(model);
        modelRegistry.getProvider
            .withArgs('test-provider').returns(provider);
        modelRegistry.getApiKey
            .withArgs('test-provider').returns('test-api-key');
        // Execute model
        const result = await service.executeModel('test-model', 'Test prompt');
        // Verify results
        expect(result).toHaveProperty('response');
        expect(result.response).toContain('Test prompt');
        expect(result).toHaveProperty('usage');
        expect(result.usage).toHaveProperty('promptTokens');
        expect(result.usage).toHaveProperty('completionTokens');
        expect(result.usage).toHaveProperty('totalTokens');
        expect(result).toHaveProperty('timingMs');
        // Verify events were emitted
        expect(service.emit.calledWith('model:execution:start')).toBe(true);
        expect(service.emit.calledWith('model:execution:complete')).toBe(true);
        expect(service.emit.calledWith('model:execution:stats')).toBe(true);
    });
    it('should execute a model from the Goose source', async () => {
        // Set up test model
        const model = {
            id: 'goose-model',
            name: 'Goose Model',
            provider: 'goose-provider',
            source: 'goose',
            capabilities: { streaming: true }
        };
        // Set up test provider
        const provider = {
            id: 'goose-provider',
            name: 'Goose Provider',
            models: [model],
            baseURL: 'https://api.goose.ai',
            envVar: 'GOOSE_API_KEY'
        };
        // Configure mock responses
        modelRegistry.getModel
            .withArgs('goose-model').returns(model);
        modelRegistry.getProvider
            .withArgs('goose-provider').returns(provider);
        modelRegistry.getApiKey
            .withArgs('goose-provider').returns('goose-api-key');
        // Set up bridge response
        gooseBridge.setupCallResponse('generateCompletion', {
            completion: 'Response from Goose model',
            usage: {
                promptTokens: 10,
                completionTokens: 5,
                totalTokens: 15
            },
            timing_ms: 300
        });
        // Execute model
        const result = await service.executeModel('goose-model', 'Test prompt for Goose');
        // Verify results
        expect(result.response).toBe('Response from Goose model');
        expect(result.usage?.promptTokens).toBe(10);
        expect(result.usage?.completionTokens).toBe(5);
        expect(result.usage?.totalTokens).toBe(15);
        expect(result.timingMs).toBe(300);
        // Verify events were emitted
        expect(service.emit.calledWith('model:execution:start')).toBe(true);
        expect(service.emit.calledWith('model:execution:complete')).toBe(true);
        expect(service.emit.calledWith('model:execution:stats')).toBe(true);
    });
    it('should execute a model from the IPFS Accelerate source', async () => {
        // Set up test model
        const model = {
            id: 'ipfs-model',
            name: 'IPFS Model',
            provider: 'ipfs-provider',
            source: 'ipfs_accelerate',
            capabilities: { streaming: true }
        };
        // Set up test provider
        const provider = {
            id: 'ipfs-provider',
            name: 'IPFS Provider',
            models: [model],
            baseURL: 'https://api.ipfs.ai',
            envVar: 'IPFS_API_KEY'
        };
        // Configure mock responses
        modelRegistry.getModel
            .withArgs('ipfs-model').returns(model);
        modelRegistry.getProvider
            .withArgs('ipfs-provider').returns(provider);
        modelRegistry.getApiKey
            .withArgs('ipfs-provider').returns('ipfs-api-key');
        // Set up bridge response
        ipfsAccelerateBridge.setupCallResponse('modelInference', {
            output: 'Response from IPFS model',
            tokenUsage: {
                prompt: 15,
                completion: 8,
                total: 23
            },
            elapsedMs: 400
        });
        // Execute model
        const result = await service.executeModel('ipfs-model', 'Test prompt for IPFS');
        // Verify results
        expect(result.response).toBe('Response from IPFS model');
        expect(result.usage?.promptTokens).toBe(15);
        expect(result.usage?.completionTokens).toBe(8);
        expect(result.usage?.totalTokens).toBe(23);
        expect(result.timingMs).toBe(400);
        // Verify events were emitted
        expect(service.emit.calledWith('model:execution:start')).toBe(true);
        expect(service.emit.calledWith('model:execution:complete')).toBe(true);
        expect(service.emit.calledWith('model:execution:stats')).toBe(true);
    });
    it('should execute a model from the SwissKnife Old source', async () => {
        // Set up test model
        const model = {
            id: 'swissknife-model',
            name: 'SwissKnife Model',
            provider: 'swissknife-provider',
            source: 'swissknife_old',
            capabilities: { streaming: true }
        };
        // Set up test provider
        const provider = {
            id: 'swissknife-provider',
            name: 'SwissKnife Provider',
            models: [model],
            baseURL: 'https://api.swissknife.ai',
            envVar: 'SWISSKNIFE_API_KEY'
        };
        // Configure mock responses
        modelRegistry.getModel
            .withArgs('swissknife-model').returns(model);
        modelRegistry.getProvider
            .withArgs('swissknife-provider').returns(provider);
        modelRegistry.getApiKey
            .withArgs('swissknife-provider').returns('swissknife-api-key');
        // Set up bridge response
        swissKnifeOldBridge.setupCallResponse('executeModel', {
            text: 'Response from SwissKnife model',
            stats: {
                usage: {
                    promptTokens: 20,
                    completionTokens: 10,
                    totalTokens: 30
                },
                elapsedMs: 500
            }
        });
        // Execute model
        const result = await service.executeModel('swissknife-model', 'Test prompt for SwissKnife');
        // Verify results
        expect(result.response).toBe('Response from SwissKnife model');
        expect(result.usage?.promptTokens).toBe(20);
        expect(result.usage?.completionTokens).toBe(10);
        expect(result.usage?.totalTokens).toBe(30);
        expect(result.timingMs).toBe(500);
        // Verify events were emitted
        expect(service.emit.calledWith('model:execution:start')).toBe(true);
        expect(service.emit.calledWith('model:execution:complete')).toBe(true);
        expect(service.emit.calledWith('model:execution:stats')).toBe(true);
    });
    it('should handle model not found error', async () => {
        // Configure mock responses
        modelRegistry.getModel
            .withArgs('unknown-model').returns(undefined);
        // Execute model should throw error
        try {
            await service.executeModel('unknown-model', 'Test prompt');
            expect.fail('Should have thrown an error');
        }
        catch (error) {
            expect(error.message).toContain('Model not found');
        }
    });
    it('should handle provider not found error', async () => {
        // Set up test model
        const model = {
            id: 'test-model',
            name: 'Test Model',
            provider: 'unknown-provider',
            source: 'current',
            capabilities: { streaming: true }
        };
        // Configure mock responses
        modelRegistry.getModel
            .withArgs('test-model').returns(model);
        modelRegistry.getProvider
            .withArgs('unknown-provider').returns(undefined);
        // Execute model should throw error
        try {
            await service.executeModel('test-model', 'Test prompt');
            expect.fail('Should have thrown an error');
        }
        catch (error) {
            expect(error.message).toContain('Provider not found');
        }
    });
    it('should handle missing API key error', async () => {
        // Set up test model
        const model = {
            id: 'test-model',
            name: 'Test Model',
            provider: 'test-provider',
            source: 'current',
            capabilities: { streaming: true }
        };
        // Set up test provider
        const provider = {
            id: 'test-provider',
            name: 'Test Provider',
            models: [model],
            baseURL: 'https://api.test.com',
            envVar: 'TEST_API_KEY',
            authType: 'bearer'
        };
        // Configure mock responses
        modelRegistry.getModel
            .withArgs('test-model').returns(model);
        modelRegistry.getProvider
            .withArgs('test-provider').returns(provider);
        modelRegistry.getApiKey
            .withArgs('test-provider').returns(undefined);
        // Execute model should throw error
        try {
            await service.executeModel('test-model', 'Test prompt');
            expect.fail('Should have thrown an error');
        }
        catch (error) {
            expect(error.message).toContain('No API key found');
        }
    });
    it('should handle bridge error', async () => {
        // Set up test model
        const model = {
            id: 'goose-model',
            name: 'Goose Model',
            provider: 'goose-provider',
            source: 'goose',
            capabilities: { streaming: true }
        };
        // Set up test provider
        const provider = {
            id: 'goose-provider',
            name: 'Goose Provider',
            models: [model],
            baseURL: 'https://api.goose.ai',
            envVar: 'GOOSE_API_KEY'
        };
        // Configure mock responses
        modelRegistry.getModel
            .withArgs('goose-model').returns(model);
        modelRegistry.getProvider
            .withArgs('goose-provider').returns(provider);
        modelRegistry.getApiKey
            .withArgs('goose-provider').returns('goose-api-key');
        // Set up bridge error
        gooseBridge.setupCallError('generateCompletion', new Error('Bridge execution failed'));
        // Execute model should throw error
        try {
            await service.executeModel('goose-model', 'Test prompt');
            expect.fail('Should have thrown an error');
        }
        catch (error) {
            expect(error.message).toContain('Bridge execution failed');
        }
        // Verify events were emitted
        expect(service.emit.calledWith('model:execution:start')).toBe(true);
        expect(service.emit.calledWith('model:execution:error')).toBe(true);
    });
    it('should handle models that do not require authentication', async () => {
        // Set up test model
        const model = {
            id: 'test-model',
            name: 'Test Model',
            provider: 'test-provider',
            source: 'current',
            capabilities: { streaming: true }
        };
        // Set up test provider
        const provider = {
            id: 'test-provider',
            name: 'Test Provider',
            models: [model],
            baseURL: 'https://api.test.com',
            authType: 'none'
        };
        // Configure mock responses
        modelRegistry.getModel
            .withArgs('test-model').returns(model);
        modelRegistry.getProvider
            .withArgs('test-provider').returns(provider);
        modelRegistry.getApiKey
            .withArgs('test-provider').returns(undefined);
        // Execute model
        const result = await service.executeModel('test-model', 'Test prompt');
        // Verify results
        expect(result).toHaveProperty('response');
        // Verify events were emitted
        expect(service.emit.calledWith('model:execution:start')).toBe(true);
        expect(service.emit.calledWith('model:execution:complete')).toBe(true);
    });
    it('should track execution stats', async () => {
        // Set up test model
        const model = {
            id: 'test-model',
            name: 'Test Model',
            provider: 'test-provider',
            source: 'current',
            capabilities: { streaming: true },
            pricePerToken: 0.00001
        };
        // Set up test provider
        const provider = {
            id: 'test-provider',
            name: 'Test Provider',
            models: [model],
            baseURL: 'https://api.test.com',
            envVar: 'TEST_API_KEY'
        };
        // Configure mock responses
        modelRegistry.getModel
            .withArgs('test-model').returns(model);
        modelRegistry.getProvider
            .withArgs('test-provider').returns(provider);
        modelRegistry.getApiKey
            .withArgs('test-provider').returns('test-api-key');
        // Execute model
        await service.executeModel('test-model', 'Test prompt');
        // Get execution stats
        const stats = service.getExecutionStats();
        // Verify stats
        expect(stats).toBe('array');
        expect(stats.length).toBeGreaterThanOrEqual(1);
        const latestStats = stats[0];
        expect(latestStats.provider).toBe('test-provider');
        expect(latestStats.model).toBe('test-model');
        expect(latestStats.totalTokens).toBe('number');
        expect(latestStats.timingMs).toBe('number');
        expect(latestStats.cost).toBe('number');
    });
    it('should handle array prompts', async () => {
        // Set up test model
        const model = {
            id: 'test-model',
            name: 'Test Model',
            provider: 'test-provider',
            source: 'current',
            capabilities: { streaming: true }
        };
        // Set up test provider
        const provider = {
            id: 'test-provider',
            name: 'Test Provider',
            models: [model],
            baseURL: 'https://api.test.com',
            envVar: 'TEST_API_KEY'
        };
        // Configure mock responses
        modelRegistry.getModel
            .withArgs('test-model').returns(model);
        modelRegistry.getProvider
            .withArgs('test-provider').returns(provider);
        modelRegistry.getApiKey
            .withArgs('test-provider').returns('test-api-key');
        // Execute model with array prompt
        const result = await service.executeModel('test-model', ['Part 1', 'Part 2']);
        // Verify results
        expect(result).toHaveProperty('response');
        expect(result.response).toContain('Part 1');
        expect(result.response).toContain('Part 2');
    });
    it('should pass execution options to model', async () => {
        // Set up test model
        const model = {
            id: 'goose-model',
            name: 'Goose Model',
            provider: 'goose-provider',
            source: 'goose',
            capabilities: { streaming: true, functionCalling: true }
        };
        // Set up test provider
        const provider = {
            id: 'goose-provider',
            name: 'Goose Provider',
            models: [model],
            baseURL: 'https://api.goose.ai',
            envVar: 'GOOSE_API_KEY'
        };
        // Configure mock responses
        modelRegistry.getModel
            .withArgs('goose-model').returns(model);
        modelRegistry.getProvider
            .withArgs('goose-provider').returns(provider);
        modelRegistry.getApiKey
            .withArgs('goose-provider').returns('goose-api-key');
        // Set up bridge response
        const callStub = sinon.stub();
        callStub.resolves({
            completion: 'Response from Goose model with functions',
            usage: {
                promptTokens: 10,
                completionTokens: 5,
                totalTokens: 15
            },
            timing_ms: 300,
            function_calls: [{ name: 'test_function', arguments: { arg1: 'value1' } }]
        });
        gooseBridge.call = callStub;
        // Execution options
        const options = {
            temperature: 0.7,
            maxTokens: 100,
            functions: [{
                    name: 'test_function',
                    description: 'A test function',
                    parameters: {
                        type: 'object',
                        properties: {
                            arg1: { type: 'string' }
                        }
                    }
                }],
            functionCall: 'auto'
        };
        // Execute model with options
        const result = await service.executeModel('goose-model', 'Test prompt with functions', options);
        // Verify call was made with options
        expect(callStub.calledOnce).toBe(true);
        const callArgs = callStub.firstCall.args[1];
        expect(callArgs.options).toContain(options);
        // Verify function calls in result
        expect(result.functionCalls).toBeDefined();
        expect(result.functionCalls.length).toBe(1);
        expect(result.functionCalls[0].name).toBe('test_function');
    });
});
//# sourceMappingURL=service.test.js.map