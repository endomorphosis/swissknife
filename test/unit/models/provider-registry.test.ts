import { ProviderRegistry } from '../../../src/models/provider-registry.ts';
import { BaseProvider } from '@ai/models/provider.ts';

// Define a mock Provider class extending BaseProvider
class MockProvider extends BaseProvider {
    constructor(options: any) {
        super(options);
    }
    
    async generate(input: any): Promise<any> {
        return {
            output: `Mock response for ${input.prompt || 'test'}`,
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
        };
    }
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    // Reset the singleton before each test
    (ProviderRegistry as any).instance = undefined;
    registry = ProviderRegistry.getInstance();
  });

  test('should be a singleton', async () => {
    const instance1 = ProviderRegistry.getInstance();
    const instance2 = ProviderRegistry.getInstance();
    expect(instance1).toBe(instance2);
  });

  test('should register and retrieve a provider', () => {
    const provider1 = new MockProvider({ id: 'provider-1', name: 'Provider One', baseURL: 'http://example.com' });
    registry.registerProvider(provider1);

    const retrievedProvider = registry.getProviderSync('provider-1');
    expect(retrievedProvider).toBeDefined();
    expect(retrievedProvider?.id).toBe('provider-1'); 
    expect(retrievedProvider).toBe(provider1); 
  });

  test('should return undefined for a non-existent provider ID', () => {
    const retrievedProvider = registry.getProviderSync('non-existent-provider');
    expect(retrievedProvider).toBeUndefined();
  });

  test('should register multiple providers and allow retrieving them individually', () => {
    const provider1 = new MockProvider({ id: 'provider-1', name: 'Provider One', baseURL: 'http://example.com/1' });
    const provider2 = new MockProvider({ id: 'provider-2', name: 'Provider Two', baseURL: 'http://example.com/2' });
    registry.registerProvider(provider1);
    registry.registerProvider(provider2);

    expect(registry.getProviderSync('provider-1')).toBe(provider1);
    expect(registry.getProviderSync('provider-2')).toBe(provider2);
  });

  test('should set the first registered provider as default', () => {
    const provider1 = new MockProvider({ id: 'provider-1', name: 'Provider One', baseURL: 'http://example.com/1' });
    const provider2 = new MockProvider({ id: 'provider-2', name: 'Provider Two', baseURL: 'http://example.com/2' });

    registry.registerProvider(provider1);
    expect(registry.getProviderSync('default')).toBe(provider1);

    registry.registerProvider(provider2);
    expect(registry.getProviderSync('default')).toBe(provider1);
  });

  test('should overwrite a provider if registered with the same ID', () => {
    const provider1 = new MockProvider({ id: 'provider-1', name: 'Provider One', baseURL: 'http://example.com/old' });
    const provider1Overwrite = new MockProvider({ id: 'provider-1', name: 'Provider One Overwritten', baseURL: 'http://example.com/new' });
    registry.registerProvider(provider1);
    registry.registerProvider(provider1Overwrite);

    const retrievedProvider = registry.getProviderSync('provider-1');
    expect(retrievedProvider).toBe(provider1Overwrite);
    expect(registry.getProviderSync('provider-1')).not.toBe(provider1);
  });

  test('should handle retrieving default when no providers are registered', () => {
    expect(registry.getProviderSync('default')).toBeUndefined();
  });
});
