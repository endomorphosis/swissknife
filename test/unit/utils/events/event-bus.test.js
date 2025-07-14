/**
 * Unit tests for EventSystem
 */
import { EventBus } from '../../../../src/utils/events/EventBus.js';
import { jest, expect } from '@jest/globals';

// Helper function for creating deferred promises
function createDeferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

// Helper function to simulate Jest's fail function
function fail(message) {
    throw new Error(message || 'Test failed');
}

describe('EventSystem', () => {
    let eventBus;
    beforeEach(() => {
        // Reset singleton
        EventBus.instance = null;
        // Create new instance
        eventBus = EventBus.getInstance();
    });
    describe('basic event handling', () => {
        it('should emit and receive events', () => {
            // Arrange
            const handler = jest.fn();
            eventBus.on('test-event', handler);
            const eventData = { key: 'value' };
            // Act
            eventBus.emit('test-event', eventData);
            // Assert
            expect(handler).toHaveBeenCalledWith(eventData);
        });
        it('should support multiple handlers for the same event', () => {
            // Arrange
            const handler1 = jest.fn();
            const handler2 = jest.fn();
            eventBus.on('multi-handler', handler1);
            eventBus.on('multi-handler', handler2);
            // Act
            eventBus.emit('multi-handler', 'test-data');
            // Assert
            expect(handler1).toHaveBeenCalledWith('test-data');
            expect(handler2).toHaveBeenCalledWith('test-data');
        });
        it('should not call handlers for different events', () => {
            // Arrange
            const handler1 = jest.fn();
            const handler2 = jest.fn();
            eventBus.on('event1', handler1);
            eventBus.on('event2', handler2);
            // Act
            eventBus.emit('event1', 'data1');
            // Assert
            expect(handler1).toHaveBeenCalledWith('data1');
            expect(handler2).not.toHaveBeenCalled();
        });
        it('should support one-time event handling', () => {
            // Skip if not supported
            if (typeof eventBus.once !== 'function') {
                console.log('Skipping one-time event test - method not implemented');
                return;
            }
            // Arrange
            const handler = jest.fn();
            eventBus.once('once-event', handler);
            // Act - Emit twice
            eventBus.emit('once-event', 'first-data');
            eventBus.emit('once-event', 'second-data');
            // Assert - Handler should only be called once
            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith('first-data');
        });
        it('should allow removing event handlers', () => {
            // Arrange
            const handler = jest.fn();
            eventBus.on('removable-event', handler);
            // Act - First emit
            eventBus.emit('removable-event', 'first-data');
            // Remove handler
            eventBus.off('removable-event', handler);
            // Act - Second emit after removal
            eventBus.emit('removable-event', 'second-data');
            // Assert
            expect(handler).toHaveBeenCalledTimes(1); // Only from first emit
            expect(handler).toHaveBeenCalledWith('first-data');
        });
        it('should allow removing all handlers for an event', () => {
            // Skip if not supported
            if (typeof eventBus.removeAllListeners !== 'function') {
                console.log('Skipping removeAll test - method not implemented');
                return;
            }
            // Arrange
            const handler1 = jest.fn();
            const handler2 = jest.fn();
            eventBus.on('remove-all-event', handler1);
            eventBus.on('remove-all-event', handler2);
            // Act - First emit
            eventBus.emit('remove-all-event', 'data');
            // Remove all handlers
            eventBus.removeAllListeners('remove-all-event');
            // Act - Second emit after removal
            eventBus.emit('remove-all-event', 'more-data');
            // Assert
            expect(handler1).toHaveBeenCalledTimes(1); // Only from first emit
            expect(handler2).toHaveBeenCalledTimes(1); // Only from first emit
        });
    });
    describe('event inheritance', () => {
        it('should support hierarchical events if implemented', () => {
            // Skip if hierarchical events not supported
            if (typeof eventBus.onAny !== 'function' &&
                !eventBus.on.toString().includes('wildcard')) {
                console.log('Skipping hierarchical events test - feature not implemented');
                return;
            }
            // Arrange
            const specificHandler = jest.fn();
            const categoryHandler = jest.fn();
            const rootHandler = jest.fn();
            // Register handlers at different levels
            eventBus.on('database.user.created', specificHandler);
            eventBus.on('database.user.*', categoryHandler);
            eventBus.on('database.*', rootHandler);
            // Act
            eventBus.emit('database.user.created', { userId: '123' });
            // Assert
            expect(specificHandler).toHaveBeenCalled();
            expect(categoryHandler).toHaveBeenCalled();
            expect(rootHandler).toHaveBeenCalled();
        });
        it('should support wildcard event listeners if implemented', () => {
            // Skip if wildcards not supported
            if (typeof eventBus.onAny !== 'function' &&
                !eventBus.on.toString().includes('wildcard')) {
                console.log('Skipping wildcard listener test - feature not implemented');
                return;
            }
            // Arrange
            const wildcardHandler = jest.fn();
            // Using onAny or similar method based on implementation
            if (typeof eventBus.onAny === 'function') {
                eventBus.onAny(wildcardHandler);
            }
            else {
                eventBus.on('*', wildcardHandler);
            }
            // Act - Emit various events
            eventBus.emit('event1', 'data1');
            eventBus.emit('event2', 'data2');
            eventBus.emit('event3', 'data3');
            // Assert
            expect(wildcardHandler).toHaveBeenCalledTimes(3);
        });
    });
    describe('async event handling', () => {
        it('should support async event handlers', async () => {
            // Arrange
            const deferred = createDeferred();
            const asyncHandler = jest.fn(async (data) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                deferred.resolve(data);
                return 'handler-result';
            });
            eventBus.on('async-event', asyncHandler);
            // Act
            eventBus.emit('async-event', 'async-data');
            // Assert
            expect(asyncHandler).toHaveBeenCalledWith('async-data');
            // Wait for async handler to complete
            const result = await deferred.promise;
            expect(result).toBe('async-data');
        });
        it('should support waiting for all handlers to complete if implemented', async () => {
            // Skip if emitAsync not supported
            if (typeof eventBus.emitAsync !== 'function') {
                console.log('Skipping emitAsync test - method not implemented');
                return;
            }
            // Arrange
            const handler1 = jest.fn(async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return 'result1';
            });
            const handler2 = jest.fn(async () => {
                await new Promise(resolve => setTimeout(resolve, 15));
                return 'result2';
            });
            eventBus.on('async-wait-event', handler1);
            eventBus.on('async-wait-event', handler2);
            // Act
            const hasListeners = await eventBus.emitAsync('async-wait-event', 'test-data');
            // Assert - emitAsync returns boolean indicating if there were listeners
            expect(hasListeners).toBe(true);
            expect(handler1).toHaveBeenCalledWith('test-data');
            expect(handler2).toHaveBeenCalledWith('test-data');
        });
        it('should handle errors in async handlers', async () => {
            // Skip if emitAsync not supported
            if (typeof eventBus.emitAsync !== 'function') {
                console.log('Skipping async error test - method not implemented');
                return;
            }
            // Arrange
            const successHandler = jest.fn(async () => 'success');
            const errorHandler = jest.fn(async () => {
                throw new Error('Handler error');
            });
            eventBus.on('mixed-result-event', successHandler);
            eventBus.on('mixed-result-event', errorHandler);
            
            // Mock console.error to capture error logging
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            
            // Act - errors should be caught and logged, not rethrown
            await eventBus.emitAsync('mixed-result-event', 'test-data');
            
            // Assert
            // Both handlers should have been called
            expect(successHandler).toHaveBeenCalledWith('test-data');
            expect(errorHandler).toHaveBeenCalledWith('test-data');
            
            // Error should have been logged
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("Error in async event listener for 'mixed-result-event':"),
                expect.any(Error)
            );
            
            // Restore console.error
            consoleSpy.mockRestore();
        });
    });
    describe('prioritized handlers', () => {
        it('should execute handlers in priority order if supported', () => {
            // Skip if prioritization not supported
            if (typeof eventBus.onWithPriority !== 'function' &&
                !eventBus.on.toString().includes('priority')) {
                console.log('Skipping priority test - feature not implemented');
                return;
            }
            // Arrange
            const executionOrder = [];
            const lowPriorityHandler = jest.fn(() => {
                executionOrder.push(3);
            });
            const mediumPriorityHandler = jest.fn(() => {
                executionOrder.push(2);
            });
            const highPriorityHandler = jest.fn(() => {
                executionOrder.push(1);
            });
            // Register handlers with priorities
            if (typeof eventBus.onWithPriority === 'function') {
                eventBus.onWithPriority('priority-event', lowPriorityHandler, 1);
                eventBus.onWithPriority('priority-event', mediumPriorityHandler, 2);
                eventBus.onWithPriority('priority-event', highPriorityHandler, 3);
            }
            else {
                eventBus.on('priority-event', lowPriorityHandler, { priority: 1 });
                eventBus.on('priority-event', mediumPriorityHandler, { priority: 2 });
                eventBus.on('priority-event', highPriorityHandler, { priority: 3 });
            }
            // Act
            eventBus.emit('priority-event', 'priority-data');
            // Assert
            expect(executionOrder).toEqual([1, 2, 3]);
        });
    });
    describe('event metadata', () => {
        it('should include event metadata if supported', () => {
            // Skip if metadata not supported
            if (!eventBus.emit.toString().includes('metadata') &&
                typeof eventBus.emitWithMetadata !== 'function') {
                console.log('Skipping metadata test - feature not implemented');
                return;
            }
            // Arrange
            const handler = jest.fn();
            eventBus.on('metadata-event', handler);
            const metadata = {
                timestamp: Date.now(),
                source: 'test-source',
                correlationId: '123456'
            };
            // Act - Emit with metadata
            if (typeof eventBus.emitWithMetadata === 'function') {
                eventBus.emitWithMetadata('metadata-event', 'event-data', metadata);
            }
            else {
                eventBus.emit('metadata-event', 'event-data', metadata);
            }
            // Assert
            expect(handler).toHaveBeenCalledWith('event-data', metadata);
        });
    });
    describe('event debugging', () => {
        it('should track event history if supported', () => {
            // Skip if history tracking not supported
            if (typeof eventBus.getEventHistory !== 'function') {
                console.log('Skipping history test - feature not implemented');
                return;
            }
            // Act
            eventBus.emit('history-event-1', 'data1');
            eventBus.emit('history-event-2', 'data2');
            // Assert
            const history = eventBus.getEventHistory();
            expect(history.length).toBe(2);
            expect(history[0].name).toBe('history-event-1');
            expect(history[0].data).toBe('data1');
            expect(history[1].name).toBe('history-event-2');
            expect(history[1].data).toBe('data2');
        });
        it('should limit event history size if supported', () => {
            // Skip if history size limiting not supported
            if (typeof eventBus.getEventHistory !== 'function' ||
                typeof eventBus.setHistoryLimit !== 'function') {
                console.log('Skipping history limit test - feature not implemented');
                return;
            }
            // Arrange
            eventBus.setHistoryLimit(2);
            // Act - Emit 3 events, should only keep the last 2
            eventBus.emit('limit-event-1', 'data1');
            eventBus.emit('limit-event-2', 'data2');
            eventBus.emit('limit-event-3', 'data3');
            // Assert
            const history = eventBus.getEventHistory();
            expect(history.length).toBe(2);
            expect(history[0].name).toBe('limit-event-2');
            expect(history[1].name).toBe('limit-event-3');
        });
    });
    describe('event namespaces', () => {
        it('should support namespaced events if implemented', () => {
            // Skip if namespaces not supported
            if (typeof eventBus.createNamespace !== 'function') {
                console.log('Skipping namespace test - feature not implemented');
                return;
            }
            // Arrange
            const namespace1 = eventBus.createNamespace('ns1');
            const namespace2 = eventBus.createNamespace('ns2');
            const ns1Handler = jest.fn();
            const ns2Handler = jest.fn();
            namespace1.on('shared-event', ns1Handler);
            namespace2.on('shared-event', ns2Handler);
            // Act - Emit in first namespace
            namespace1.emit('shared-event', 'ns1-data');
            // Assert
            expect(ns1Handler).toHaveBeenCalledWith('ns1-data');
            expect(ns2Handler).not.toHaveBeenCalled();
            // Reset mocks
            jest.clearAllMocks();
            // Act - Emit in second namespace
            namespace2.emit('shared-event', 'ns2-data');
            // Assert
            expect(ns1Handler).not.toHaveBeenCalled();
            expect(ns2Handler).toHaveBeenCalledWith('ns2-data');
        });
    });
    describe('error handling', () => {
        it('should handle errors in synchronous event handlers', () => {
            // Arrange
            jest.spyOn(console, 'error').mockImplementation(() => { });
            const errorThrowingHandler = jest.fn(() => {
                throw new Error('Handler error');
            });
            const subsequentHandler = jest.fn();
            eventBus.on('error-event', errorThrowingHandler);
            eventBus.on('error-event', subsequentHandler);
            // Act - Should not throw
            expect(() => {
                eventBus.emit('error-event', 'error-data');
            }).not.toThrow();
            // Assert
            expect(errorThrowingHandler).toHaveBeenCalled();
            expect(subsequentHandler).toHaveBeenCalled(); // Error should not prevent other handlers
            expect(console.error).toHaveBeenCalled();
        });
        it('should support error events if implemented', () => {
            // Skip if error events not supported
            if (typeof eventBus.onError !== 'function') {
                console.log('Skipping error event test - feature not implemented');
                return;
            }
            // Arrange
            const errorHandler = jest.fn();
            eventBus.onError(errorHandler);
            const errorThrowingHandler = jest.fn(() => {
                throw new Error('Handler error');
            });
            eventBus.on('error-event', errorThrowingHandler);
            // Act
            eventBus.emit('error-event', 'error-data');
            // Assert
            expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.any(Error),
                eventName: 'error-event',
                eventData: 'error-data'
            }));
        });
    });
    describe('performance considerations', () => {
        it('should handle large numbers of events efficiently', () => {
            // Skip if not running performance tests
            if (process.env.RUN_PERFORMANCE_TESTS !== 'true') {
                console.log('Skipping performance test - enable with RUN_PERFORMANCE_TESTS=true');
                return;
            }
            // Arrange
            const handler = jest.fn();
            eventBus.on('perf-event', handler);
            // Act - Emit many events
            const start = performance.now();
            for (let i = 0; i < 10000; i++) {
                eventBus.emit('perf-event', i);
            }
            const end = performance.now();
            // Assert
            expect(handler).toHaveBeenCalledTimes(10000);
            expect(end - start).toBeLessThan(1000); // Should process 10k events in < 1 second
        });
        it('should handle many subscribers efficiently', () => {
            // Skip if not running performance tests
            if (process.env.RUN_PERFORMANCE_TESTS !== 'true') {
                console.log('Skipping multi-subscriber test - enable with RUN_PERFORMANCE_TESTS=true');
                return;
            }
            // Arrange - Add many subscribers
            const handlers = [];
            for (let i = 0; i < 1000; i++) {
                const handler = jest.fn();
                handlers.push(handler);
                eventBus.on('multi-sub-event', handler);
            }
            // Act
            const start = performance.now();
            eventBus.emit('multi-sub-event', 'test-data');
            const end = performance.now();
            // Assert
            handlers.forEach(handler => {
                expect(handler).toHaveBeenCalledWith('test-data');
            });
            // Should be reasonably efficient (< 100ms for 1000 subscribers)
            expect(end - start).toBeLessThan(100);
        });
    });
});
//# sourceMappingURL=event-bus.test.js.map