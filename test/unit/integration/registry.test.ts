import { IntegrationRegistry, IntegrationBridge, SystemType } from '../../../src/integration/registry';
import { expect } from 'chai';
import * as sinon from 'sinon';

/**
 * Mock bridge implementation for testing
 */
class MockBridge implements IntegrationBridge {
  id: string;
  name: string;
  source: SystemType;
  target: SystemType;
  
  private initialized: boolean = false;
  private initializeStub: sinon.SinonStub;
  private callStub: sinon.SinonStub;
  
  constructor(id: string, name: string, source: SystemType, target: SystemType) {
    this.id = id;
    this.name = name;
    this.source = source;
    this.target = target;
    
    this.initializeStub = sinon.stub().resolves(true);
    this.callStub = sinon.stub().callsFake((method: string, args: any) => {
      if (method === 'echo') {
        return Promise.resolve(args);
      } else if (method === 'error') {
        return Promise.reject(new Error('Test error'));
      } else {
        return Promise.resolve({ method, args });
      }
    });
  }
  
  isInitialized(): boolean {
    return this.initialized;
  }
  
  async initialize(): Promise<boolean> {
    const result = await this.initializeStub();
    this.initialized = result;
    return result;
  }
  
  async call<T>(method: string, args: any): Promise<T> {
    if (!this.isInitialized()) {
      throw new Error('Bridge not initialized');
    }
    
    return this.callStub(method, args) as Promise<T>;
  }
  
  // Methods to control stub behavior for testing
  setInitializeResult(result: boolean): void {
    this.initializeStub.resolves(result);
  }
  
  setInitializeError(error: Error): void {
    this.initializeStub.rejects(error);
  }
  
  setCallResult(method: string, result: any): void {
    this.callStub.withArgs(method, sinon.match.any).resolves(result);
  }
  
  setCallError(method: string, error: Error): void {
    this.callStub.withArgs(method, sinon.match.any).rejects(error);
  }
}

describe('Integration Registry', () => {
  let registry: IntegrationRegistry;
  let mockBridge: MockBridge;
  
  beforeEach(() => {
    // Reset the singleton for testing
    (IntegrationRegistry as any).instance = null;
    registry = IntegrationRegistry.getInstance();
    
    // Create mock bridge
    mockBridge = new MockBridge('mock-bridge', 'Mock Bridge', 'current', 'goose');
  });
  
  afterEach(() => {
    // Reset sinon
    sinon.restore();
  });
  
  it('should register and retrieve bridges', () => {
    registry.registerBridge(mockBridge);
    const retrievedBridge = registry.getBridge('mock-bridge');
    
    expect(retrievedBridge).to.equal(mockBridge);
    expect(registry.getAllBridges()).to.have.lengthOf(1);
    expect(registry.getAllBridges()[0]).to.equal(mockBridge);
  });
  
  it('should retrieve bridges by source and target', () => {
    const mockBridge2 = new MockBridge('mock-bridge-2', 'Mock Bridge 2', 'current', 'ipfs_accelerate');
    const mockBridge3 = new MockBridge('mock-bridge-3', 'Mock Bridge 3', 'goose', 'current');
    
    registry.registerBridge(mockBridge);
    registry.registerBridge(mockBridge2);
    registry.registerBridge(mockBridge3);
    
    const currentSourceBridges = registry.getBridgesBySource('current');
    expect(currentSourceBridges).to.have.lengthOf(2);
    expect(currentSourceBridges).to.include(mockBridge);
    expect(currentSourceBridges).to.include(mockBridge2);
    
    const currentTargetBridges = registry.getBridgesByTarget('current');
    expect(currentTargetBridges).to.have.lengthOf(1);
    expect(currentTargetBridges).to.include(mockBridge3);
  });
  
  it('should initialize a bridge', async () => {
    registry.registerBridge(mockBridge);
    const success = await registry.initializeBridge('mock-bridge');
    
    expect(success).to.be.true;
    expect(mockBridge.isInitialized()).to.be.true;
  });
  
  it('should initialize all bridges', async () => {
    const mockBridge2 = new MockBridge('mock-bridge-2', 'Mock Bridge 2', 'current', 'ipfs_accelerate');
    
    registry.registerBridge(mockBridge);
    registry.registerBridge(mockBridge2);
    
    const results = await registry.initializeAllBridges();
    
    expect(results.size).to.equal(2);
    expect(results.get('mock-bridge')).to.be.true;
    expect(results.get('mock-bridge-2')).to.be.true;
    expect(mockBridge.isInitialized()).to.be.true;
    expect(mockBridge2.isInitialized()).to.be.true;
  });
  
  it('should handle bridge initialization failure', async () => {
    mockBridge.setInitializeResult(false);
    registry.registerBridge(mockBridge);
    
    const success = await registry.initializeBridge('mock-bridge');
    
    expect(success).to.be.false;
    expect(mockBridge.isInitialized()).to.be.false;
  });
  
  it('should throw for unknown bridge', async () => {
    try {
      await registry.initializeBridge('unknown-bridge');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.message).to.include('Bridge not found');
    }
    
    try {
      await registry.callBridge('unknown-bridge', 'echo', {});
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.message).to.include('Bridge not found');
    }
  });
  
  it('should call a bridge method', async () => {
    registry.registerBridge(mockBridge);
    await registry.initializeBridge('mock-bridge');
    
    const testData = { test: 'value' };
    const result = await registry.callBridge<typeof testData>('mock-bridge', 'echo', testData);
    
    expect(result).to.deep.equal(testData);
  });
  
  it('should throw if bridge is not initialized', async () => {
    registry.registerBridge(mockBridge);
    
    try {
      await registry.callBridge('mock-bridge', 'echo', {});
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.message).to.include('not initialized');
    }
  });
  
  it('should throw if bridge method throws', async () => {
    registry.registerBridge(mockBridge);
    await registry.initializeBridge('mock-bridge');
    
    try {
      await registry.callBridge('mock-bridge', 'error', {});
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.message).to.equal('Test error');
    }
  });
  
  it('should emit events for bridge lifecycle', async () => {
    const registeredSpy = sinon.spy();
    const initializedSpy = sinon.spy();
    const errorSpy = sinon.spy();
    
    registry.on('bridge:registered', registeredSpy);
    registry.on('bridge:initialized', initializedSpy);
    registry.on('bridge:error', errorSpy);
    
    // Registration
    registry.registerBridge(mockBridge);
    expect(registeredSpy.calledWith('mock-bridge')).to.be.true;
    
    // Initialization
    await registry.initializeBridge('mock-bridge');
    expect(initializedSpy.calledWith({ id: 'mock-bridge', success: true })).to.be.true;
    
    // Error
    mockBridge.setCallError('error', new Error('Test error'));
    
    try {
      await registry.callBridge('mock-bridge', 'error', {});
    } catch (error) {
      // Expected error
    }
    
    expect(errorSpy.called).to.be.true;
  });
});