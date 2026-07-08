/**
 * Manages pools of reusable resources (e.g., GPU buffers, worker threads)
 * for efficient execution in browser environments.
 * Adapts concepts from ipfs_accelerate_js.
 */

/**
 * Configuration options for the resource pool manager.
 */
export interface ResourcePoolOptions {
  maxResourcesPerType?: number; // Max number of resources of a specific type to keep pooled
  maxTotalResources?: number; // Overall limit on pooled resources
  idleTimeout?: number; // Time in ms before an idle resource is potentially released
  acquireTimeoutMs?: number; // How long acquire() will queue-wait before throwing (default 5000)
  enableFaultTolerance?: boolean; // Attempt to recreate resources if they become invalid
  // Add browser-specific preferences if needed (e.g., memory limits)
  // browserPreferences?: Record<string, string>;
}

/**
 * Represents a pooled resource with metadata.
 */
interface PooledResource<T> {
  resource: T;
  lastUsed: number; // Timestamp of last use
  inUse: boolean;
  id: string; // Unique ID for the resource instance
}

export class ResourcePoolManager {
  private options: ResourcePoolOptions;
  // Pool stores resources by type (e.g., 'gpuBuffer', 'worker')
  private pool: Map<string, Array<PooledResource<any>>> = new Map();
  private resourceCounter = 0; // For generating unique resource IDs

  /**
   * Creates an instance of ResourcePoolManager.
   * @param {ResourcePoolOptions} [options={}] - Configuration options.
   */
  constructor(options: ResourcePoolOptions = {}) {
    this.options = {
      maxResourcesPerType: 4, // Default limit per type
      maxTotalResources: 16, // Default overall limit
      idleTimeout: 60000, // Default 1 minute idle timeout
      acquireTimeoutMs: 5000,
      enableFaultTolerance: true,
      ...options
    };
    console.log('ResourcePoolManager initialized with options:', this.options);

    // Start cleanup interval if timeout is set; unref so the timer doesn't block process exit
    if (this.options.idleTimeout && this.options.idleTimeout > 0) {
      const timer = setInterval(() => this.cleanupIdleResources(), this.options.idleTimeout);
      if (typeof timer === 'object' && timer !== null && typeof (timer as NodeJS.Timeout).unref === 'function') {
        (timer as NodeJS.Timeout).unref();
      }
    }
  }

  /**
   * Initializes the resource pool manager.
   * (May pre-allocate some resources if needed).
   * @returns {Promise<boolean>} True if initialization is successful.
   */
  async initialize(preAllocate?: Record<string, { count: number; createFn: () => Promise<unknown> }>): Promise<boolean> {
    console.log('Initializing resource pools...');
    if (preAllocate) {
      for (const [type, { count, createFn }] of Object.entries(preAllocate)) {
        if (!this.pool.has(type)) this.pool.set(type, []);
        for (let i = 0; i < count; i++) {
          const resource = await createFn();
          const pooled: PooledResource<unknown> = {
            resource,
            lastUsed: Date.now(),
            inUse: false,
            id: `${type}-${this.resourceCounter++}`,
          };
          this.pool.get(type)!.push(pooled);
          console.log(`Pre-allocated resource ${pooled.id} of type ${type}`);
        }
      }
    }
    return true;
  }

  /**
   * Acquires a resource of the specified type from the pool or creates a new one.
   * @param {string} type - The type of resource to acquire (e.g., 'gpuBuffer', 'worker').
   * @param {() => Promise<T>} createFn - An async function to create a new resource if needed.
   * @param {any[]} [createArgs=[]] - Arguments to pass to the createFn.
   * @returns {Promise<T>} A promise resolving to the acquired resource.
   */
  async acquire<T>(type: string, createFn: (...args: any[]) => Promise<T>, ...createArgs: any[]): Promise<T> {
    if (!this.pool.has(type)) {
      this.pool.set(type, []);
    }

    const availableResources = this.pool.get(type)!;

    // Find an available resource in the pool
    const pooled = availableResources.find(pr => !pr.inUse);

    if (pooled) {
      console.log(`Reusing resource ${pooled.id} of type ${type}`);
      pooled.inUse = true;
      pooled.lastUsed = Date.now();
      return pooled.resource;
    }

    // Check if we can create a new resource based on limits
    const currentTypeCount = availableResources.length;
    const totalCount = Array.from(this.pool.values()).reduce((sum, arr) => sum + arr.length, 0);

    if (currentTypeCount >= this.options.maxResourcesPerType! || totalCount >= this.options.maxTotalResources!) {
      // Queue-based wait: poll until acquireTimeoutMs for a resource to become available
      const deadline = Date.now() + (this.options.acquireTimeoutMs ?? 5000);
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const freed = this.pool.get(type)!.find(pr => !pr.inUse);
        if (freed) {
          freed.inUse = true;
          freed.lastUsed = Date.now();
          console.log(`Acquired queued resource ${freed.id} of type ${type}`);
          return freed.resource as T;
        }
      }
      throw new Error(`Resource limit reached for type '${type}' — no resource freed within ${this.options.acquireTimeoutMs ?? 5000}ms`);
    }

    // Create a new resource
    console.log(`Creating new resource of type ${type}`);
    const newResource = await createFn(...createArgs);
    const newPooledResource: PooledResource<T> = {
      resource: newResource,
      lastUsed: Date.now(),
      inUse: true,
      id: `${type}-${this.resourceCounter++}`
    };

    availableResources.push(newPooledResource);
    console.log(`Created and acquired resource ${newPooledResource.id}`);
    return newResource;
  }

  /**
   * Releases a resource back to the pool, making it available for reuse.
   * @param {string} type - The type of the resource being released.
   * @param {T} resourceInstance - The specific resource instance to release.
   * @param {(resource: T) => Promise<void>} [destroyFn] - Optional function to destroy the resource if it's invalid or pool is full.
   */
  async release<T>(type: string, resourceInstance: T, destroyFn?: (resource: T) => Promise<void>): Promise<void> {
    const availableResources = this.pool.get(type);
    if (!availableResources) {
      console.warn(`Attempted to release resource of unknown type: ${type}`);
      // If a destroy function is provided, call it anyway
      if (destroyFn) await destroyFn(resourceInstance);
      return;
    }

    const pooled = availableResources.find(pr => pr.resource === resourceInstance);

    if (pooled) {
      if (!pooled.inUse) {
        console.warn(`Resource ${pooled.id} of type ${type} was already released.`);
        return;
      }
      pooled.inUse = false;
      pooled.lastUsed = Date.now();
      console.log(`Released resource ${pooled.id} of type ${type} back to pool.`);

      // Optional: Check if resource is still valid before keeping it?
      // Optional: Check pool size and potentially destroy oldest idle resource if over limit?

    } else {
      console.warn(`Attempted to release resource not managed by pool (type: ${type}). Destroying if function provided.`);
      if (destroyFn) await destroyFn(resourceInstance);
    }
  }

  /**
   * Cleans up idle resources that have exceeded the timeout.
   * @param {(resource: T, type: string) => Promise<void>} [destroyFn] - Function to destroy a resource.
   * @private
   */
  private async cleanupIdleResources<T>(destroyFn?: (resource: T, type: string) => Promise<void>): Promise<void> {
    const now = Date.now();
    console.log('Running idle resource cleanup...');

    for (const [type, resources] of this.pool.entries()) {
      const resourcesToKeep: Array<PooledResource<T>> = [];
      const resourcesToDestroy: Array<PooledResource<T>> = [];

      for (const pooled of resources) {
        if (!pooled.inUse && (now - pooled.lastUsed > this.options.idleTimeout!)) {
          resourcesToDestroy.push(pooled);
        } else {
          resourcesToKeep.push(pooled);
        }
      }

      if (resourcesToDestroy.length > 0) {
        console.log(`Destroying ${resourcesToDestroy.length} idle resource(s) of type ${type}`);
        this.pool.set(type, resourcesToKeep); // Update pool with remaining resources

        if (destroyFn) {
          for (const pooled of resourcesToDestroy) {
            try {
              await destroyFn(pooled.resource, type);
              console.log(`Destroyed idle resource ${pooled.id}`);
            } catch (error) {
              console.error(`Failed to destroy idle resource ${pooled.id}:`, error);
              // Decide if we should retry or just log
            }
          }
        } else {
           console.warn(`No destroy function provided for idle resources of type ${type}. They were removed from pool but not explicitly destroyed.`);
        }
      }
    }
  }

  /**
   * Destroys all resources in the pool.
   * @param {(resource: T, type: string) => Promise<void>} destroyFn - Function to destroy a resource.
   */
  async destroyAll<T>(destroyFn: (resource: T, type: string) => Promise<void>): Promise<void> {
    console.log('Destroying all resources in the pool...');
    for (const [type, resources] of this.pool.entries()) {
      for (const pooled of resources) {
        try {
          await destroyFn(pooled.resource, type);
          console.log(`Destroyed resource ${pooled.id} of type ${type}`);
        } catch (error) {
          console.error(`Failed to destroy resource ${pooled.id} during shutdown:`, error);
        }
      }
    }
    this.pool.clear();
    this.resourceCounter = 0;
    console.log('Resource pool cleared.');
  }

  // Fault tolerance: validate a resource and recreate it if invalid
  async checkResourceHealth<T>(
    type: string,
    resourceInstance: T,
    healthFn: (r: T) => Promise<boolean>,
    createFn: (...args: unknown[]) => Promise<T>,
  ): Promise<T> {
    if (!this.options.enableFaultTolerance) return resourceInstance;
    const healthy = await healthFn(resourceInstance).catch(() => false);
    if (healthy) return resourceInstance;
    console.warn(`Resource of type '${type}' failed health check — recreating.`);
    // Remove the invalid resource from the pool
    const resources = this.pool.get(type);
    if (resources) {
      const idx = resources.findIndex(pr => pr.resource === resourceInstance);
      if (idx !== -1) resources.splice(idx, 1);
    }
    const fresh = await createFn();
    const pooled: PooledResource<T> = { resource: fresh, lastUsed: Date.now(), inUse: true, id: `${type}-${this.resourceCounter++}` };
    this.pool.get(type)?.push(pooled);
    console.log(`Recreated resource ${pooled.id} of type ${type}`);
    return fresh;
  }

  getPoolStats(): Record<string, { total: number; inUse: number; idle: number }> {
    const stats: Record<string, { total: number; inUse: number; idle: number }> = {};
    for (const [type, resources] of this.pool.entries()) {
      const inUse = resources.filter(r => r.inUse).length;
      stats[type] = { total: resources.length, inUse, idle: resources.length - inUse };
    }
    return stats;
  }
}
