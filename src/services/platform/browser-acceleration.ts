/**
 * This service handles browser-specific acceleration capabilities,
 * adapting logic from the ipfs_accelerate_js library.
 */
import { HardwareAbstraction } from './hardware-abstraction.js'; // Assuming this will be created based on the plan
import { BrowserCapabilities } from '../../types/hardware.js'; // Assuming this will be created based on the plan

export class BrowserAccelerator {
  // Note: The HardwareAbstraction dependency assumes it will be created later as per the plan.
  // If HardwareAbstraction is not yet implemented, this class might need adjustments or mocks.
  private hardwareAbstraction: HardwareAbstraction;
  private browserCapabilities: BrowserCapabilities | null = null;

  constructor() {
    this.hardwareAbstraction = new HardwareAbstraction({
      preferredBackends: ['webgpu', 'webnn', 'wasm', 'cpu']
    });
  }

  /**
   * Initializes the accelerator by detecting hardware and browser capabilities.
   * @returns {Promise<boolean>} True if initialization is successful, false otherwise.
   */
  async initialize(): Promise<boolean> {
    // Initialize hardware detection
    const hwReady = await this.hardwareAbstraction.initialize();
    if (!hwReady && this.hardwareAbstraction.getAvailableBackends().length === 0) {
      console.warn('BrowserAccelerator: hardware abstraction found no backends.');
    }
    // Detect browser capabilities
    this.browserCapabilities = await this.detectCapabilities();
    return !!this.browserCapabilities;
  }

  /**
   * Detects various capabilities of the current browser environment.
   * @returns {Promise<BrowserCapabilities>} An object containing detected capabilities.
   */
  async detectCapabilities(): Promise<BrowserCapabilities> {
    // Check for existence of APIs safely, providing fallbacks
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;

    // Use index access for potentially non-standard properties after checking nav exists
    const webgpuSupported = !!(nav && 'gpu' in nav);
    const webnnSupported = !!(nav && 'ml' in nav && typeof (nav as any).ml.getNeuralNetworkContext === 'function');
    const wasmSupported = typeof WebAssembly !== 'undefined';
    // Safely access deviceMemory with a fallback using index access
    const deviceMemoryGB = nav && 'deviceMemory' in nav ? (nav as any).deviceMemory || 4 : 4;
    const hardwareConcurrency = nav?.hardwareConcurrency || 4; // Default to 4 cores if unavailable

    return {
      webgpuSupported,
      webnnSupported,
      wasmSupported,
      deviceMemoryGB,
      browser: this.detectBrowser(),
      hardwareConcurrency
    };
  }

  /**
   * Detects the type of the current browser based on the user agent string.
   * @returns {string} The detected browser name ('chrome', 'firefox', 'safari', 'edge', 'unknown').
   */
  detectBrowser(): string {
    if (typeof navigator === 'undefined') {
      return 'server'; // Indicate non-browser environment
    }
    const userAgent = navigator.userAgent;
    if (/Node\.js/i.test(userAgent)) return 'server';

    if (userAgent.indexOf("Firefox") > -1) return "firefox";
    // Edge user agent contains "Edg/" (note the capital 'E')
    if (userAgent.indexOf("Edg/") > -1) return "edge";
    // Chrome user agent contains "Chrome" but not "Edg/"
    if (userAgent.indexOf("Chrome") > -1 && userAgent.indexOf("Edg/") === -1) return "chrome";
    // Safari user agent contains "Safari" but not "Chrome" or "Edg/"
    if (userAgent.indexOf("Safari") > -1 && userAgent.indexOf("Chrome") === -1 && userAgent.indexOf("Edg/") === -1) return "safari";
    if (typeof process !== 'undefined' && process.versions?.node) return 'server';

    return "unknown";
  }

  /**
   * Returns the detected browser capabilities.
   * Ensure initialize() has been called first.
   * @returns {BrowserCapabilities | null} The detected capabilities or null if not initialized.
   */
  getCapabilities(): BrowserCapabilities | null {
    return this.browserCapabilities;
  }

  /**
   * Select the best backend for the current browser based on detected capabilities.
   * @returns Backend id string ('webgpu', 'webnn', 'wasm', 'cpu') or 'none'.
   */
  selectOptimalBackend(): string {
    const caps = this.browserCapabilities;
    if (!caps) return 'none';
    if (caps.webgpuSupported && caps.browser !== 'firefox') return 'webgpu';
    if (caps.webnnSupported) return 'webnn';
    if (caps.wasmSupported) return 'wasm';
    return 'cpu';
  }

  /**
   * Returns optimisation hints for the active backend based on device capabilities.
   */
  getOptimizationHints(): Record<string, unknown> {
    const caps = this.browserCapabilities;
    if (!caps) return {};
    return {
      preferFp16: caps.webgpuSupported,
      parallelism: Math.min(caps.hardwareConcurrency, 8),
      memoryBudgetMB: Math.floor(caps.deviceMemoryGB * 1024 * 0.4), // use ~40% of device RAM
      backend: this.selectOptimalBackend(),
    };
  }
}
