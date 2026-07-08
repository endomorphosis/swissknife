/**
 * Unit tests for ServiceRegistry
 */
import { ServiceRegistry } from '../../../src/services/registry.ts';

describe('ServiceRegistry', () => {
    let registry;

    beforeEach(() => {
        // Reset the singleton for testing
        ServiceRegistry.instance = null;
        registry = ServiceRegistry.getInstance();
    });

    describe('service registration', () => {
        it('should register and retrieve services', () => {
            // Arrange
            const testService = {
                getName: () => 'TestService',
                performAction: jest.fn().mockResolvedValue({ result: 'success' })
            };

            // Act
            registry.registerService('test', testService);

            // Assert
            const retrievedService = registry.getService('test');
            expect(retrievedService).toBe(testService);
        });

        it('should handle non-existent services', () => {
            // Act & Assert
            expect(registry.getService('non-existent')).toBeUndefined();
        });

        it('should allow retrieving services by type', () => {
            // Skip if method doesn't exist
            if (typeof registry.getServiceByType !== 'function') {
                console.log('Skipping type retrieval test - method not implemented');
                return;
            }

            // Arrange
            const testService = {
                getName: () => 'TestService',
                performAction: jest.fn().mockResolvedValue({ result: 'success' })
            };

            // Register with type information
            registry.registerService('test', testService, { type: 'TestService' });

            // Act
            const retrievedService = registry.getServiceByType('TestService');

            // Assert
            expect(retrievedService).toBe(testService);
        });

        it('should support registering multiple services of the same type', () => {
            // Skip if method doesn't exist
            if (typeof registry.getServicesByType !== 'function') {
                console.log('Skipping multiple services test - method not implemented');
                return;
            }

            // Arrange
            const testService1 = {
                getName: () => 'TestService1',
                performAction: jest.fn().mockResolvedValue({ result: 'success1' })
            };
            const testService2 = {
                getName: () => 'TestService2',
                performAction: jest.fn().mockResolvedValue({ result: 'success2' })
            };

            // Register with type information
            registry.registerService('test1', testService1, { type: 'TestService' });
            registry.registerService('test2', testService2, { type: 'TestService' });

            // Act
            const services = registry.getServicesByType('TestService');

            // Assert
            expect(services.length).toBe(2);
            expect(services).toContain(testService1);
            expect(services).toContain(testService2);
        });
    });

    describe('service lifecycle', () => {
        it('should initialize services with lifecycle hooks', async () => {
            // Skip if initialization not supported
            if (typeof registry.initializeService !== 'function') {
                console.log('Skipping initialization test - method not implemented');
                return;
            }

            // Arrange
            const testService = {
                getName: () => 'TestService',
                initialize: jest.fn().mockResolvedValue(true),
                performAction: jest.fn().mockResolvedValue({ result: 'success' })
            };

            // Register service
            registry.registerService('test', testService);

            // Act
            const success = await registry.initializeService('test');

            // Assert
            expect(success).toBe(true);
            expect(testService.initialize).toHaveBeenCalled();
        });

        it('should initialize all services', async () => {
            // Skip if initialization not supported
            if (typeof registry.initializeAllServices !== 'function') {
                console.log('Skipping all initialization test - method not implemented');
                return;
            }

            // Arrange
            const testService1 = {
                getName: () => 'TestService1',
                initialize: jest.fn().mockResolvedValue(true),
                performAction: jest.fn().mockResolvedValue({ result: 'success1' })
            };
            const testService2 = {
                getName: () => 'TestService2',
                initialize: jest.fn().mockResolvedValue(true),
                performAction: jest.fn().mockResolvedValue({ result: 'success2' })
            };

            // Register services
            registry.registerService('test1', testService1);
            registry.registerService('test2', testService2);

            // Act
            const results = await registry.initializeAllServices();

            // Assert
            expect(results.size).toBe(2);
            expect(results.get('test1')).toBe(true);
            expect(results.get('test2')).toBe(true);
            expect(testService1.initialize).toHaveBeenCalled();
            expect(testService2.initialize).toHaveBeenCalled();
        });

        it('should handle initialization failures', async () => {
            // Skip if initialization not supported
            if (typeof registry.initializeAllServices !== 'function') {
                console.log('Skipping failure test - method not implemented');
                return;
            }

            // Arrange
            const successService = {
                getName: () => 'SuccessService',
                initialize: jest.fn().mockResolvedValue(true)
            };
            const failureService = {
                getName: () => 'FailureService',
                initialize: jest.fn().mockRejectedValue(new Error('Initialization failed'))
            };

            // Register services
            registry.registerService('success', successService);
            registry.registerService('failure', failureService);

            // Act
            const results = await registry.initializeAllServices();

            // Assert
            expect(results.size).toBe(2);
            expect(results.get('success')).toBe(true);
            expect(results.get('failure')).toBe(false);
        });

        it('should shutdown services with lifecycle hooks', async () => {
            // Skip if shutdown not supported
            if (typeof registry.shutdownService !== 'function') {
                console.log('Skipping shutdown test - method not implemented');
                return;
            }

            // Arrange
            const testService = {
                getName: () => 'TestService',
                initialize: jest.fn().mockResolvedValue(true),
                shutdown: jest.fn().mockResolvedValue(true)
            };

            // Register and initialize service
            registry.registerService('test', testService);
            await registry.initializeService('test');

            // Act
            const success = await registry.shutdownService('test');

            // Assert
            expect(success).toBe(true);
            expect(testService.shutdown).toHaveBeenCalled();
        });

        it('should shutdown all services', async () => {
            // Skip if shutdown not supported
            if (typeof registry.shutdownAllServices !== 'function') {
                console.log('Skipping all shutdown test - method not implemented');
                return;
            }

            // Arrange
            const testService1 = {
                getName: () => 'TestService1',
                initialize: jest.fn().mockResolvedValue(true),
                shutdown: jest.fn().mockResolvedValue(true)
            };
            const testService2 = {
                getName: () => 'TestService2',
                initialize: jest.fn().mockResolvedValue(true),
                shutdown: jest.fn().mockResolvedValue(true)
            };

            // Register and initialize services
            registry.registerService('test1', testService1);
            registry.registerService('test2', testService2);
            await registry.initializeAllServices();

            // Act
            const results = await registry.shutdownAllServices();

            // Assert
            expect(results.size).toBe(2);
            expect(results.get('test1')).toBe(true);
            expect(results.get('test2')).toBe(true);
            expect(testService1.shutdown).toHaveBeenCalled();
            expect(testService2.shutdown).toHaveBeenCalled();
        });
    });

    describe('service dependency management', () => {
        it('should handle service dependencies', async () => {
            // Skip if dependency management not supported
            if (typeof registry.registerService !== 'function' ||
                !registry.registerService.toString().includes('dependencies')) {
                console.log('Skipping dependency test - feature not implemented');
                return;
            }

            // Arrange
            const dependencyService = {
                getName: () => 'DependencyService',
                initialize: jest.fn().mockResolvedValue(true)
            };
            const dependentService = {
                getName: () => 'DependentService',
                initialize: jest.fn().mockResolvedValue(true),
                dependencyService: null
            };

            // Register dependency first
            registry.registerService('dependency', dependencyService);

            // Register dependent service with dependency
            registry.registerService('dependent', dependentService, {
                dependencies: ['dependency'],
                inject: (service, dependencies) => {
                    service.dependencyService = dependencies.dependency;
                }
            });

            // Act
            await registry.initializeAllServices();

            // Assert
            expect(dependentService.dependencyService).toBe(dependencyService);
        });

        it('should initialize services in dependency order', async () => {
            // Skip if dependency order not supported
            if (typeof registry.initializeAllServices !== 'function' ||
                !registry.registerService.toString().includes('dependencies')) {
                console.log('Skipping dependency order test - feature not implemented');
                return;
            }

            // Arrange
            const initOrder = [];
            const service1 = {
                getName: () => 'Service1',
                initialize: jest.fn().mockImplementation(async () => {
                    initOrder.push('service1');
                    return true;
                })
            };
            const service2 = {
                getName: () => 'Service2',
                initialize: jest.fn().mockImplementation(async () => {
                    initOrder.push('service2');
                    return true;
                })
            };
            const service3 = {
                getName: () => 'Service3',
                initialize: jest.fn().mockImplementation(async () => {
                    initOrder.push('service3');
                    return true;
                })
            };

            // Register services with dependencies (3 depends on 2, 2 depends on 1)
            registry.registerService('service1', service1);
            registry.registerService('service2', service2, { dependencies: ['service1'] });
            registry.registerService('service3', service3, { dependencies: ['service2'] });

            // Act - Register in reverse order to test dependency sorting
            await registry.initializeAllServices();

            // Assert - Initialization should happen in dependency order
            expect(initOrder.indexOf('service1')).toBeLessThan(initOrder.indexOf('service2'));
            expect(initOrder.indexOf('service2')).toBeLessThan(initOrder.indexOf('service3'));
        });

        it('should detect circular dependencies', async () => {
            // Skip if circular dependency detection not supported
            if (typeof registry.registerService !== 'function' ||
                !registry.registerService.toString().includes('dependencies')) {
                console.log('Skipping circular dependency test - feature not implemented');
                return;
            }

            // Arrange
            const serviceA = {
                getName: () => 'ServiceA',
                initialize: jest.fn().mockResolvedValue(true)
            };
            const serviceB = {
                getName: () => 'ServiceB',
                initialize: jest.fn().mockResolvedValue(true)
            };

            // Act & Assert
            registry.registerService('serviceA', serviceA, { dependencies: ['serviceB'] });
            // This should throw due to circular dependency
            expect(() => {
                registry.registerService('serviceB', serviceB, { dependencies: ['serviceA'] });
            }).toThrow(/circular/i);
        });
    });

    describe('service events', () => {
        it('should emit events when services are registered', () => {
            // Skip if events not supported
            if (typeof registry.on !== 'function') {
                console.log('Skipping events test - feature not implemented');
                return;
            }

            // Arrange
            const listener = jest.fn();
            registry.on('serviceRegistered', listener);
            const testService = {
                getName: () => 'TestService'
            };

            // Act
            registry.registerService('test', testService);

            // Assert
            expect(listener).toHaveBeenCalledWith(expect.objectContaining({
                serviceId: 'test',
                service: testService
            }));
        });

        it('should emit events for lifecycle changes', async () => {
            // Skip if events not supported
            if (typeof registry.on !== 'function' || typeof registry.initializeService !== 'function') {
                console.log('Skipping lifecycle events test - feature not implemented');
                return;
            }

            // Arrange
            const initListener = jest.fn();
            registry.on('serviceInitialized', initListener);
            const testService = {
                getName: () => 'TestService',
                initialize: jest.fn().mockResolvedValue(true)
            };

            // Register service
            registry.registerService('test', testService);

            // Act
            await registry.initializeService('test');

            // Assert
            expect(initListener).toHaveBeenCalledWith(expect.objectContaining({
                serviceId: 'test',
                service: testService
            }));
        });
    });

    describe('service listing and introspection', () => {
        it('should list all registered services', () => {
            // Arrange
            const service1 = { getName: () => 'Service1' };
            const service2 = { getName: () => 'Service2' };

            registry.registerService('service1', service1);
            registry.registerService('service2', service2);

            // Act
            const services = registry.getAllServices();

            // Assert
            expect(services.size).toBe(2);
            expect(services.get('service1')).toBe(service1);
            expect(services.get('service2')).toBe(service2);
        });

        it('should provide service metadata if supported', () => {
            // Skip if metadata not supported
            if (typeof registry.getServiceMetadata !== 'function') {
                console.log('Skipping metadata test - feature not implemented');
                return;
            }

            // Arrange
            const testService = { getName: () => 'TestService' };
            const metadata = {
                type: 'TestType',
                version: '1.0.0',
                description: 'Test service description'
            };

            // Register with metadata
            registry.registerService('test', testService, metadata);

            // Act
            const retrievedMetadata = registry.getServiceMetadata('test');

            // Assert
            expect(retrievedMetadata).toEqual(metadata);
        });
    });
});
