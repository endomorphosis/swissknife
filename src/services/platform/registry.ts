/**
 * Service Registry
 * 
 * Central registry for managing services, their dependencies,
 * and lifecycle methods.
 */

import { EventEmitter } from 'events';

export interface ServiceOptions {
  type?: string;
  dependencies?: string[];
  metadata?: Record<string, any>;
  inject?: (service: any, dependencies: Record<string, any>) => void;
}

export class ServiceRegistry extends EventEmitter {
  private static instance: ServiceRegistry;
  private services: Map<string, any> = new Map();
  private options: Map<string, ServiceOptions> = new Map();
  private initialized: Set<string> = new Set();
  private initializing: Set<string> = new Set();
  
  private constructor() {
    super();
  }
  
  /**
   * Get the singleton instance of ServiceRegistry
   */
  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }
  
  /**
   * Register a service with the registry
   */
  registerService(id: string, service: any, options: ServiceOptions = {}): void {
    if (this.services.has(id)) {
      throw new Error(`Service already registered with id: ${id}`);
    }
    
    // Check for circular dependencies
    if (options.dependencies) {
      this.checkCircularDependencies(id, options.dependencies, []);
    }
    
    this.services.set(id, service);
    this.options.set(id, options);
    
    // Emit event
    this.emit('serviceRegistered', { serviceId: id, service, options });
  }
  
  /**
   * Get a service by id
   */
  getService<T = any>(id: string): T | undefined {
    return this.services.get(id) as T | undefined;
  }
  
  /**
   * Get service by type
   */
  getServiceByType<T = any>(type: string): T | undefined {
    for (const [id, service] of this.services.entries()) {
      const options = this.options.get(id);
      if (options?.type === type) {
        return service as T;
      }
    }
    return undefined;
  }
  
  /**
   * Get all services of a specific type
   */
  getServicesByType<T = any>(type: string): T[] {
    const result: T[] = [];
    for (const [id, service] of this.services.entries()) {
      const options = this.options.get(id);
      if (options?.type === type) {
        result.push(service as T);
      }
    }
    return result;
  }
  
  /**
   * Get all services
   */
  getAllServices(): Map<string, any> {
    return new Map(this.services);
  }
  
  /**
   * Get service metadata
   */
  getServiceMetadata(id: string): Record<string, any> | undefined {
    return this.options.get(id)?.metadata;
  }
  
  /**
   * Initialize a service
   */
  async initializeService(id: string): Promise<boolean> {
    // Check if service exists
    const service = this.services.get(id);
    if (!service) {
      throw new Error(`Service not found: ${id}`);
    }
    
    // Check if already initialized
    if (this.initialized.has(id)) {
      return true;
    }
    
    // Check for circular dependencies during initialization
    if (this.initializing.has(id)) {
      throw new Error(`Circular dependency detected during initialization: ${id}`);
    }
    
    // Mark as initializing
    this.initializing.add(id);
    
    try {
      // Initialize dependencies first
      const options = this.options.get(id);
      if (options?.dependencies && options.dependencies.length > 0) {
        for (const depId of options.dependencies) {
          if (!this.services.has(depId)) {
            throw new Error(`Dependency not found: ${depId} (required by ${id})`);
          }
          
          // Initialize dependency
          const success = await this.initializeService(depId);
          if (!success) {
            throw new Error(`Failed to initialize dependency: ${depId} (required by ${id})`);
          }
        }
      }
      
      // Inject dependencies if specified
      if (options?.dependencies && options.dependencies.length > 0 && options.inject) {
        const dependencies: Record<string, any> = {};
        for (const depId of options.dependencies) {
          dependencies[depId] = this.services.get(depId);
        }
        options.inject(service, dependencies);
      }
      
      // Initialize service if it has an initialize method
      if (typeof service.initialize === 'function') {
        const result = await service.initialize();
        if (result === false) {
          throw new Error(`Service initialization returned false: ${id}`);
        }
      }
      
      // Mark as initialized
      this.initialized.add(id);
      this.initializing.delete(id);
      
      // Emit event
      this.emit('serviceInitialized', { serviceId: id, service });
      
      return true;
    } catch (error) {
      // Clean up
      this.initializing.delete(id);
      
      // Emit error event
      this.emit('serviceInitializationError', { serviceId: id, service, error });
      
      // Rethrow
      throw error;
    }
  }
  
  /**
   * Initialize all services in dependency order
   */
  async initializeAllServices(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    // Get sorted service IDs (topological sort)
    const sortedIds = this.getTopologicallySortedServiceIds();
    
    // Initialize in order
    for (const id of sortedIds) {
      try {
        const success = await this.initializeService(id);
        results.set(id, success);
      } catch (error) {
        console.error(`Failed to initialize service ${id}:`, error);
        results.set(id, false);
      }
    }
    
    return results;
  }
  
  /**
   * Shutdown a service
   */
  async shutdownService(id: string): Promise<boolean> {
    // Check if service exists
    const service = this.services.get(id);
    if (!service) {
      throw new Error(`Service not found: ${id}`);
    }
    
    // Check if initialized
    if (!this.initialized.has(id)) {
      return true;
    }
    
    try {
      // Shutdown service if it has a shutdown method
      if (typeof service.shutdown === 'function') {
        await service.shutdown();
      }
      
      // Mark as not initialized
      this.initialized.delete(id);
      
      // Emit event
      this.emit('serviceShutdown', { serviceId: id, service });
      
      return true;
    } catch (error) {
      // Emit error event
      this.emit('serviceShutdownError', { serviceId: id, service, error });
      
      // Rethrow
      throw error;
    }
  }
  
  /**
   * Shutdown all services in reverse dependency order
   */
  async shutdownAllServices(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    // Get sorted service IDs in reverse order
    const sortedIds = this.getTopologicallySortedServiceIds().reverse();
    
    // Shutdown in reverse order
    for (const id of sortedIds) {
      try {
        const success = await this.shutdownService(id);
        results.set(id, success);
      } catch (error) {
        console.error(`Failed to shutdown service ${id}:`, error);
        results.set(id, false);
      }
    }
    
    return results;
  }
  
  /**
   * Check for circular dependencies
   */
  private checkCircularDependencies(
    id: string,
    dependencies: string[],
    visited: string[]
  ): void {
    if (visited.includes(id)) {
      throw new Error(`Circular dependency detected: ${[...visited, id].join(' -> ')}`);
    }
    
    visited.push(id);
    
    for (const depId of dependencies) {
      const depOptions = this.options.get(depId);
      if (depOptions?.dependencies) {
        this.checkCircularDependencies(depId, depOptions.dependencies, [...visited]);
      } else {
        // If dependency has no further dependencies, just check if it's in visited
        if (visited.includes(depId)) {
          throw new Error(`Circular dependency detected: ${[...visited, depId].join(' -> ')}`);
        }
      }
    }
  }
  
  /**
   * Get services in topological order (dependencies first)
   */
  private getTopologicallySortedServiceIds(): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();
    
    // Recursive visit function
    const visit = (id: string) => {
      if (temp.has(id)) {
        throw new Error(`Circular dependency detected: ${id}`);
      }
      
      if (visited.has(id)) {
        return;
      }
      
      temp.add(id);
      
      const options = this.options.get(id);
      if (options?.dependencies) {
        for (const depId of options.dependencies) {
          visit(depId);
        }
      }
      
      temp.delete(id);
      visited.add(id);
      result.push(id);
    };
    
    // Visit all services
    for (const id of this.services.keys()) {
      if (!visited.has(id)) {
        visit(id);
      }
    }
    
    return result;
  }
}
