import { ModelExecutionService, ModelExecutionOptions, ModelExecutionResult } from '../../../../src/models/execution/service';
import { ModelRegistry, Model, Provider, ModelSource } from '../../../../src/models/registry';
import { IntegrationRegistry, IntegrationBridge } from '../../../../src/integration/registry';
import { ConfigurationManager } from '../../../../src/config/manager';
import { expect } from 'chai';
import * as sinon from 'sinon';

// Mock bridge class
class MockBridge implements IntegrationBridge {
  id: string;
  name: string;
  source: 'current';
  target: 'goose' | 'ipfs_accelerate' | 'swissknife_old';
  private initialized = false;
  private callStub: sinon.SinonStub;
  
  constructor(id: string, name: string, target: 'goose' | 'ipfs_accelerate' | 'swissknife_old') {
    this.id = id;
    this.name = name;
    this.source = 'current';
    this.target = target;
    this.callStub = sinon.stub();
  }
  
  isInitialized(): boolean {
    return this.initialized;
  }
  
  async initialize(): Promise<boolean> {
    this.initialized = true;
    return true;
  }
  
  async call<T>(method: string, args: any): Promise<T> {
    return this.callStub(method, args);
  }
  
  // Method to set up call mock responses
  setupCallResponse(method: string, response: any): void {
    this.callStub.withArgs(method, sinon.match.any).resolves(response);
  }
  
  // Method to set up call mock errors
  setupCallError(method: string, error: Error): void {
    this.callStub.withArgs(method, sinon.match.any).rejects(error);
  }
}

describe('Model Execution Service', () => {
  let service: ModelExecutionService;
  let modelRegistry: ModelRegistry;
  let integrationRegistry: IntegrationRegistry;
  let configManager: ConfigurationManager;
  let gooseBridge: MockBridge;
  let ipfsAccelerateBridge: MockBridge;
  let swissKnifeOldBridge: MockBridge;
  
  beforeEach(() => {
    // Reset singletons
    (ModelExecutionService as any).instance = null;
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
    (integrationRegistry.getBridge as sinon.SinonStub)
      .withArgs('goose-mcp').returns(gooseBridge);
    (integrationRegistry.getBridge as sinon.SinonStub)
      .withArgs('ipfs-accelerate').returns(ipfsAccelerateBridge);
    (integrationRegistry.getBridge as sinon.SinonStub)
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
    const model: Model = {
      id: 'test-model',
      name: 'Test Model',
      provider: 'test-provider',
      source: 'current',
      capabilities: { streaming: true }
    };
    
    // Set up test provider
    const provider: Provider = {
      id: 'test-provider',
      name: 'Test Provider',
      models: [model],
      baseURL: 'https://api.test.com',
      envVar: 'TEST_API_KEY'
    };
    
    // Configure mock responses
    (modelRegistry.getModel as sinon.SinonStub)
      .withArgs('test-model').returns(model);
    (modelRegistry.getProvider as sinon.SinonStub)
      .withArgs('test-provider').returns(provider);
    (modelRegistry.getApiKey as sinon.SinonStub)
      .withArgs('test-provider').returns('test-api-key');
    
    // Execute model
    const result = await service.executeModel('test-model', 'Test prompt');
    
    // Verify results
    expect(result).to.have.property('response');
    expect(result.response).to.include('Test prompt');
    expect(result).to.have.property('usage');
    expect(result.usage).to.have.property('promptTokens');
    expect(result.usage).to.have.property('completionTokens');
    expect(result.usage).to.have.property('totalTokens');
    expect(result).to.have.property('timingMs');
    
    // Verify events were emitted
    expect((service.emit as sinon.SinonSpy).calledWith('model:execution:start')).to.be.true;
    expect((service.emit as sinon.SinonSpy).calledWith('model:execution:complete')).to.be.true;
    expect((service.emit as sinon.SinonSpy).calledWith('model:execution:stats')).to.be.true;
  });
  
  it('should execute a model from the Goose source', async () => {
    // Set up test model
    const model: Model = {
      id: 'goose-model',
      name: 'Goose Model',
      provider: 'goose-provider',
      source: 'goose',
      capabilities: { streaming: true }
    };
    
    // Set up test provider
    const provider: Provider = {
      id: 'goose-provider',
      name: 'Goose Provider',
      models: [model],
      baseURL: 'https://api.goose.ai',
      envVar: 'GOOSE_API_KEY'
    };
    
    // Configure mock responses
    (modelRegistry.getModel as sinon.SinonStub)
      .withArgs('goose-model').returns(model);
    (modelRegistry.getProvider as sinon.SinonStub)
      .withArgs('goose-provider').returns(provider);
    (modelRegistry.getApiKey as sinon.SinonStub)
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
    expect(result.response).to.equal('Response from Goose model');
    expect(result.usage?.promptTokens).to.equal(10);
    expect(result.usage?.completionTokens).to.equal(5);
    expect(result.usage?.totalTokens).to.equal(15);
    expect(result.timingMs).to.equal(300);
    
    // Verify events were emitted
    expect((service.emit as sinon.SinonSpy).calledWith('model:execution:start')).to.be.true;
    expect((service.emit as sinon.SinonSpy).calledWith('model:execution:complete')).to.be.true;
    expect((service.emit as sinon.SinonSpy).calledWith('model:execution:stats')).to.be.true;
  });
  
  it('should execute a model from the IPFS Accelerate source', async () => {
    // Set up test model
    const model: Model = {
      id: 'ipfs-model',
      name: 'IPFS Model',
      provider: 'ipfs-provider',
      source: 'ipfs_accelerate',
      capabilities: { streaming: true }
    };
    
    // Set up test provider
    const provider: Provider = {
      id: 'ipfs-provider',
      name: 'IPFS Provider',
      models: [model],
      baseURL: 'https://api.ipfs.ai',
      envVar: 'IPFS_API_KEY'
    };
    
    // Configure mock responses
    (modelRegistry.getModel as sinon.SinonStub)
      .withArgs('ipfs-model').returns(model);
    (modelRegistry.getProvider as sinon.SinonStub)
      .withArgs('ipfs-provider').returns(provider);
    (modelRegistry.getApiKey as sinon.SinonStub)
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
    expect(result.response).to.equal('Response from IPFS model');
    expect(result.usage?.promptTokens).to.equal(15);
    expect(result.usage?.completionTokens).to.equal(8);
    expect(result.usage?.totalTokens).to.equal(23);
    expect(result.timingMs).to.equal(400);
    
    // Verify events were emitted
    expect((service.emit as sinon.SinonSpy).calledWith('model:execution:start')).to.be.true;
    expect((service.emit as sinon.SinonSpy).calledWith('model:execution:complete')).to.be.true;
    expect((service.emit as sinon.SinonSpy).calledWith('model:execution:stats')).to.be.true;
  });
  
  it('should execute a model from the SwissKnife Old source', async () => {
    // Set up test model
    const model: Model = {
      id: 'swissknife-model',
      name: 'SwissKnife Model',
      provider: 'swissknife-provider',
      source: 'swissknife_old',
      capabilities: { streaming: true }
    };
    
    // Set up test provider
    const provider: Provider = {
      id: 'swissknife-provider',
      name: 'SwissKnife Provider',
      models: [model],
      baseURL: 'https://api.swissknife.ai',
      envVar: 'SWISSKNIFE_API_KEY'
    };
    
    // Configure mock responses
    (modelRegistry.getModel as sinon.SinonStub)
      .withArgs('swissknife-model').returns(model);
    (modelRegistry.getProvider as sinon.SinonStub)
      .withArgs('swissknife-provider').returns(provider);
    (modelRegistry.getApiKey as sinon.SinonStub)
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
    expect(result.response).to.equal('Response from SwissKnife model');
    expect(result.usage?.promptTokens).to.equal(20);
    expect(result.usage?.completionTokens).to.equal(10);
    expect(result.usage?.totalTokens).to.equal(30);
    expect(result.timingMs).to.equal(500);
    
    // Verify events were emitted
    expect((service.emit as sinon.SinonSpy).calledWith('model:execution:start')).to.be.true;
    expect((service.emit as sinon.SinonSpy).calledWith('model:execution:complete')).to.be.true;
    expect((service.emit as sinon.SinonSpy).calledWith('model:execution:stats')).to.be.true;
  });
  
  it('should handle model not found error', async () => {
    // Configure mock responses
    (modelRegistry.getModel as sinon.SinonStub)
      .withArgs('unknown-model').returns(undefined);
    
    // Execute model should throw error
    try {
      await service.executeModel('unknown-model', 'Test prompt');
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).to.include('Model not found');
    }
  });
  
  it('should handle provider not found error', async () => {
    // Set up test model
    const model: Model = {
      id: 'test-model',
      name: 'Test Model',
      provider: 'unknown-provider',
      source: 'current',
      capabilities: { streaming: true }
    };
    
    // Configure mock responses
    (modelRegistry.getModel as sinon.SinonStub)
      .withArgs('test-model').returns(model);
    (modelRegistry.getProvider as sinon.SinonStub)
      .withArgs('unknown-provider').returns(undefined);
    
    // Execute model should throw error
    try {
      await service.executeModel('test-model', 'Test prompt');
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).to.include('Provider not found');
    }
  });
  
  it('should handle missing API key error', async () => {
    // Set up test model
    const model: Model = {
      id: 'test-model',
      name: 'Test Model',
      provider: 'test-provider',
      source: 'current',
      capabilities: { streaming: true }
    };
    
    // Set up test provider
    const provider: Provider = {
      id: 'test-provider',
      name: 'Test Provider',
      models: [model],
      baseURL: 'https://api.test.com',
      envVar: 'TEST_API_KEY',
      authType: 'bearer'
    };
    
    // Configure mock responses
    (modelRegistry.getModel as sinon.SinonStub)
      .withArgs('test-model').returns(model);
    (modelRegistry.getProvider as sinon.SinonStub)
      .withArgs('test-provider').returns(provider);
    (modelRegistry.getApiKey as sinon.SinonStub)
      .withArgs('test-provider').returns(undefined);
    
    // Execute model should throw error
    try {
      await service.executeModel('test-model', 'Test prompt');
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).to.include('No API key found');
    }
  });
  
  it('should handle bridge error', async () => {
    // Set up test model
    const model: Model = {
      id: 'goose-model',
      name: 'Goose Model',
      provider: 'goose-provider',
      source: 'goose',
      capabilities: { streaming: true }
    };
    
    // Set up test provider
    const provider: Provider = {
      id: 'goose-provider',
      name: 'Goose Provider',
      models: [model],
      baseURL: 'https://api.goose.ai',
      envVar: 'GOOSE_API_KEY'
    };
    
    // Configure mock responses
    (modelRegistry.getModel as sinon.SinonStub)
      .withArgs('goose-model').returns(model);
    (modelRegistry.getProvider as sinon.SinonStub)
      .withArgs('goose-provider').returns(provider);
    (modelRegistry.getApiKey as sinon.SinonStub)
      .withArgs('goose-provider').returns('goose-api-key');
      
    // Set up bridge error
    gooseBridge.setupCallError('generateCompletion', new Error('Bridge execution failed'));
    
    // Execute model should throw error
    try {
      await service.executeModel('goose-model', 'Test prompt');
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).to.include('Bridge execution failed');
    }
    
    // Verify events were emitted
    expect((service.emit as sinon.SinonSpy).calledWith('model:execution:start')).to.be.true;
    expect((service.emit as sinon.SinonSpy).calledWith('model:execution:error')).to.be.true;
  });
  
  it('should handle models that do not require authentication', async () => {
    // Set up test model
    const model: Model = {
      id: 'test-model',
      name: 'Test Model',
      provider: 'test-provider',
      source: 'current',
      capabilities: { streaming: true }
    };
    
    // Set up test provider
    const provider: Provider = {
      id: 'test-provider',
      name: 'Test Provider',
      models: [model],
      baseURL: 'https://api.test.com',
      authType: 'none'
    };
    
    // Configure mock responses
    (modelRegistry.getModel as sinon.SinonStub)
      .withArgs('test-model').returns(model);
    (modelRegistry.getProvider as sinon.SinonStub)
      .withArgs('test-provider').returns(provider);
    (modelRegistry.getApiKey as sinon.SinonStub)
      .withArgs('test-provider').returns(undefined);
    
    // Execute model
    const result = await service.executeModel('test-model', 'Test prompt');
    
    // Verify results
    expect(result).to.have.property('response');
    
    // Verify events were emitted
    expect((service.emit as sinon.SinonSpy).calledWith('model:execution:start')).to.be.true;
    expect((service.emit as sinon.SinonSpy).calledWith('model:execution:complete')).to.be.true;
  });
  
  it('should track execution stats', async () => {
    // Set up test model
    const model: Model = {
      id: 'test-model',
      name: 'Test Model',
      provider: 'test-provider',
      source: 'current',
      capabilities: { streaming: true },
      pricePerToken: 0.00001
    };
    
    // Set up test provider
    const provider: Provider = {
      id: 'test-provider',
      name: 'Test Provider',
      models: [model],
      baseURL: 'https://api.test.com',
      envVar: 'TEST_API_KEY'
    };
    
    // Configure mock responses
    (modelRegistry.getModel as sinon.SinonStub)
      .withArgs('test-model').returns(model);
    (modelRegistry.getProvider as sinon.SinonStub)
      .withArgs('test-provider').returns(provider);
    (modelRegistry.getApiKey as sinon.SinonStub)
      .withArgs('test-provider').returns('test-api-key');
    
    // Execute model
    await service.executeModel('test-model', 'Test prompt');
    
    // Get execution stats
    const stats = service.getExecutionStats();
    
    // Verify stats
    expect(stats).to.be.an('array');
    expect(stats.length).to.be.at.least(1);
    
    const latestStats = stats[0];
    expect(latestStats.provider).to.equal('test-provider');
    expect(latestStats.model).to.equal('test-model');
    expect(latestStats.totalTokens).to.be.a('number');
    expect(latestStats.timingMs).to.be.a('number');
    expect(latestStats.cost).to.be.a('number');
  });
  
  it('should handle array prompts', async () => {
    // Set up test model
    const model: Model = {
      id: 'test-model',
      name: 'Test Model',
      provider: 'test-provider',
      source: 'current',
      capabilities: { streaming: true }
    };
    
    // Set up test provider
    const provider: Provider = {
      id: 'test-provider',
      name: 'Test Provider',
      models: [model],
      baseURL: 'https://api.test.com',
      envVar: 'TEST_API_KEY'
    };
    
    // Configure mock responses
    (modelRegistry.getModel as sinon.SinonStub)
      .withArgs('test-model').returns(model);
    (modelRegistry.getProvider as sinon.SinonStub)
      .withArgs('test-provider').returns(provider);
    (modelRegistry.getApiKey as sinon.SinonStub)
      .withArgs('test-provider').returns('test-api-key');
    
    // Execute model with array prompt
    const result = await service.executeModel('test-model', ['Part 1', 'Part 2']);
    
    // Verify results
    expect(result).to.have.property('response');
    expect(result.response).to.include('Part 1');
    expect(result.response).to.include('Part 2');
  });
  
  it('should pass execution options to model', async () => {
    // Set up test model
    const model: Model = {
      id: 'goose-model',
      name: 'Goose Model',
      provider: 'goose-provider',
      source: 'goose',
      capabilities: { streaming: true, functionCalling: true }
    };
    
    // Set up test provider
    const provider: Provider = {
      id: 'goose-provider',
      name: 'Goose Provider',
      models: [model],
      baseURL: 'https://api.goose.ai',
      envVar: 'GOOSE_API_KEY'
    };
    
    // Configure mock responses
    (modelRegistry.getModel as sinon.SinonStub)
      .withArgs('goose-model').returns(model);
    (modelRegistry.getProvider as sinon.SinonStub)
      .withArgs('goose-provider').returns(provider);
    (modelRegistry.getApiKey as sinon.SinonStub)
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
    const options: ModelExecutionOptions = {
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
    expect(callStub.calledOnce).to.be.true;
    const callArgs = callStub.firstCall.args[1];
    expect(callArgs.options).to.include(options);
    
    // Verify function calls in result
    expect(result.functionCalls).to.exist;
    expect(result.functionCalls!.length).to.equal(1);
    expect(result.functionCalls![0].name).to.equal('test_function');
  });
});