import { logger } from '../utils/logger';
import { Tensor } from '../tensor/tensor';

// Placeholder for model representation
type MLModel = any; 

/**
 * Interface for different execution backends (CPU, GPU via WebGL/WebGPU, WASM).
 */
interface ExecutionBackend {
  readonly type: string; // e.g., 'cpu', 'webgpu', 'wasm'
  isSupported(): Promise<boolean>;
  prepareInput(input: Tensor): any; // Prepare tensor data for this specific backend
  runInference(model: MLModel, preparedInput: any): Promise<any>; // Run inference, return backend-specific output
  formatOutput(backendOutput: any): Tensor; // Convert backend output back to standard Tensor
}

// --- Placeholder Backend Implementations ---

class CpuBackend implements ExecutionBackend {
  readonly type = 'cpu';
  async isSupported(): Promise<boolean> { return true; } // CPU is always supported
  prepareInput(input: Tensor): any { return input.getData(); /* Basic example */ }
  async runInference(model: MLModel, preparedInput: any): Promise<any> { 
    logger.warn('CPU backend inference not implemented.'); 
    return preparedInput; // Placeholder: echo input
  }
  formatOutput(backendOutput: any): Tensor { return new Tensor(backendOutput, []); /* Placeholder shape */ }
}

class GpuBackend implements ExecutionBackend {
  readonly type = 'gpu'; // Could be 'webgpu' or 'webgl' specifically
  async isSupported(): Promise<boolean> { 
    // TODO: Add actual check for WebGPU/WebGL support
    logger.warn('GPU support check not implemented.'); 
    return false; 
  }
  prepareInput(input: Tensor): any { throw new Error('GPU backend not implemented.'); }
  async runInference(model: MLModel, preparedInput: any): Promise<any> { throw new Error('GPU backend not implemented.'); }
  formatOutput(backendOutput: any): Tensor { throw new Error('GPU backend not implemented.'); }
}

// --- Hardware Accelerator Class ---

/**
 * Detects available hardware and selects the appropriate execution backend.
 */
export class HardwareAccelerator {
  private backends: ExecutionBackend[] = [];
  private preferredBackend: ExecutionBackend | null = null;

  constructor() {
    logger.debug('Initializing HardwareAccelerator...');
    // Order matters: prefer GPU > CPU generally
    this.backends.push(new GpuBackend()); 
    this.backends.push(new CpuBackend());
    // Could add WASM backend here too
    this.detectPreferredBackend();
  }

  private async detectPreferredBackend(): Promise<void> {
    logger.info('Detecting preferred ML execution backend...');
    for (const backend of this.backends) {
      try {
        if (await backend.isSupported()) {
          logger.info(`Preferred backend set to: ${backend.type}`);
          this.preferredBackend = backend;
          return;
        }
      } catch (error) {
         logger.warn(`Error checking support for backend ${backend.type}:`, error);
      }
    }
    // Should always find at least CPU
    if (!this.preferredBackend) {
        logger.error('Could not detect any supported backend (even CPU)!');
        this.preferredBackend = this.backends.find(b => b.type === 'cpu')!; // Fallback just in case
    }
  }

  /**
   * Gets the best available backend based on detection or target preference.
   * @param target Optional target hardware ('cpu', 'gpu', 'auto').
   * @returns The selected ExecutionBackend.
   * @throws If the target is specified but not supported.
   */
  getBackend(target: 'cpu' | 'gpu' | 'auto' = 'auto'): ExecutionBackend {
    logger.debug(`Getting backend for target: ${target}`);
    if (target === 'auto') {
      if (!this.preferredBackend) {
        // Should ideally wait for detection, but provide fallback
        logger.warn('Preferred backend detection might not be complete, falling back to CPU.');
        return this.backends.find(b => b.type === 'cpu')!;
      }
      return this.preferredBackend;
    }

    const selectedBackend = this.backends.find(b => b.type === target);
    if (!selectedBackend) {
      throw new Error(`Target backend "${target}" is not available or supported.`);
    }
    
    // We might want to check isSupported again here, but detection should handle it
    // if (!await selectedBackend.isSupported()) {
    //    throw new Error(`Target backend "${target}" is not supported on this system.`);
    // }

    return selectedBackend;
  }
}
