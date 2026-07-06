/**
 * Provides an abstraction layer over different hardware backends (WebGPU, WebNN, WASM, CPU)
 * for model execution, adapting logic from ipfs_accelerate_js.
 */
import { HardwareBackend, HardwareAbstractionOptions } from '../../types/hardware.js';

export class HardwareAbstraction {
  private backends: HardwareBackend[] = [];
  private activeBackend: HardwareBackend | null = null;
  private options: HardwareAbstractionOptions;

  constructor(options: HardwareAbstractionOptions = {}) {
    // Default options + user options
    this.options = {
      preferredBackends: ['webgpu', 'webnn', 'wasm', 'cpu'], // Default preference order
      enableLogging: false,
      ...options,
    };
  }

  /**
   * Initializes the hardware abstraction layer by detecting available backends
   * and selecting the most suitable one based on preferences and availability.
   * @returns {Promise<boolean>} True if a backend was successfully selected, false otherwise.
   */
  async initialize(): Promise<boolean> {
    if (this.options.enableLogging) {
      console.log('Initializing Hardware Abstraction Layer...');
    }
    // Detect available hardware backends
    await this.detectHardware();

    // Select the optimal backend based on detected availability and preferences
    this.activeBackend = this.selectOptimalBackend();

    if (this.options.enableLogging) {
      if (this.activeBackend) {
        console.log(`Selected backend: ${this.activeBackend.name} (ID: ${this.activeBackend.id})`);
      } else {
        console.warn('No suitable hardware backend found or initialized.');
      }
    }

    return this.activeBackend !== null;
  }

  /**
   * Detects available hardware backends (WebGPU, WebNN, WASM, CPU).
   * This method should contain logic adapted from ipfs_accelerate_js's detection mechanisms.
   * @private
   */
  private async detectHardware(): Promise<void> {
    if (this.options.enableLogging) {
      console.log('Detecting available hardware backends...');
    }
    this.backends = []; // Reset detected backends

    // Detection logic: check browser APIs for WebGPU, WebNN, WASM, CPU
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const webgpuAvailable = !!(nav && 'gpu' in nav);
    if (webgpuAvailable) {
      // Further checks might be needed (e.g., adapter request)
      this.backends.push({
        id: 'webgpu',
        name: 'WebGPU',
        priority: this.options.preferredBackends?.indexOf('webgpu') ?? 0,
        isAvailable: true, // Assume available for now, real check needed
        capabilities: ['fp32', 'fp16'], // Example capabilities
      });
      if (this.options.enableLogging) console.log('WebGPU detected (availability check pending).');
    }

    // Example: Check WebNN safely
    const webnnAvailable = !!(nav && 'ml' in nav && typeof (nav as any).ml.getNeuralNetworkContext === 'function');
     if (webnnAvailable) {
       this.backends.push({
         id: 'webnn',
         name: 'WebNN',
         priority: this.options.preferredBackends?.indexOf('webnn') ?? 1,
         isAvailable: true, // Assume available for now, real check needed
         capabilities: ['fp32', 'fp16', 'int8'], // Example capabilities
       });
       if (this.options.enableLogging) console.log('WebNN detected (availability check pending).');
     }

    // Example: Check WASM (always available in modern browsers)
    this.backends.push({
      id: 'wasm',
      name: 'WebAssembly',
      priority: this.options.preferredBackends?.indexOf('wasm') ?? 2,
      isAvailable: true,
      capabilities: ['simd'], // Check for SIMD support if needed
    });
    if (this.options.enableLogging) console.log('WebAssembly detected.');


    // Example: CPU (always available fallback)
    this.backends.push({
      id: 'cpu',
      name: 'CPU (JavaScript)',
      priority: this.options.preferredBackends?.indexOf('cpu') ?? 3,
      isAvailable: true,
      capabilities: [],
    });
     if (this.options.enableLogging) console.log('CPU (JavaScript) fallback available.');

    // Sort backends by priority (lower number = higher priority)
    this.backends.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Selects the best available backend based on priority and availability.
   * @private
   * @returns {HardwareBackend | null} The selected backend or null if none are available.
   */
  private selectOptimalBackend(): HardwareBackend | null {
    // Prefer backends that match both priority AND the requested capabilities (if any)
    const requiredCaps = (this.options as Record<string, unknown>)['requiredCapabilities'] as string[] | undefined;
    for (const backend of this.backends) {
      if (!backend.isAvailable) continue;
      if (requiredCaps && requiredCaps.length > 0) {
        const meets = requiredCaps.every(cap => backend.capabilities.includes(cap));
        if (!meets) continue;
      }
      return backend;
    }
    // Fallback: return highest-priority available backend regardless of capabilities
    return this.backends.find(b => b.isAvailable) ?? null;
  }

  /**
   * Gets the currently active hardware backend.
   * Ensure initialize() has been called first.
   * @returns {HardwareBackend | null} The active backend or null if none selected.
   */
  getActiveBackend(): HardwareBackend | null {
    return this.activeBackend;
  }

  /**
   * Gets the list of all detected hardware backends, sorted by priority.
   * Ensure initialize() has been called first.
   * @returns {HardwareBackend[]} The list of detected backends.
   */
  getAvailableBackends(): HardwareBackend[] {
    return this.backends;
  }

  /**
   * Execute a model operation, dispatching to the active backend.
   * @param input - Serialisable model input (prompt string or typed array).
   * @param options - Backend-specific options forwarded to the implementation.
   * @returns The raw backend output.
   */
  async executeModel(input: unknown, options: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.activeBackend) {
      throw new Error('No active hardware backend. Call initialize() first.');
    }
    if (this.options.enableLogging) {
      console.log(`executeModel via backend=${this.activeBackend.id}`, options);
    }
    switch (this.activeBackend.id) {
      case 'webgpu':
        // WebGPU path: in a real impl, dispatch to a GPUComputePipeline
        return { backend: 'webgpu', input, result: null, note: 'WebGPU dispatch not yet wired' };
      case 'webnn':
        return { backend: 'webnn', input, result: null, note: 'WebNN dispatch not yet wired' };
      case 'wasm':
        return { backend: 'wasm', input, result: null, note: 'WASM dispatch not yet wired' };
      case 'cpu':
      default:
        // Pure-JS CPU fallback: return a stub result
        return { backend: 'cpu', input, result: null, note: 'CPU JS execution stub' };
    }
  }
}
