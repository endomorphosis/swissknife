/**
 * This service handles browser-specific acceleration capabilities,
 * adapting logic from the ipfs_accelerate_js library.
 */
import { HardwareAbstraction } from './hardware-abstraction.js'; // Assuming this will be created based on the plan
import { BrowserCapabilities } from '../types/hardware'; // Assuming this will be created based on the plan

export class BrowserAccelerator {
  // Note: The HardwareAbstraction dependency assumes it will be created later as per the plan.
  // If HardwareAbstraction is not yet implemented, this class might need adjustments or mocks.
  private hardwareAbstraction: HardwareAbstraction;
  private browserCapabilities: BrowserCapabilities | null = null;

  constructor() {
    // TODO: Ensure HardwareAbstraction is implemented and available.
    // For now, we proceed assuming it will be.
    this.hardwareAbstraction = new HardwareAbstraction({
      preferredBackends: ['webgpu', 'webnn', 'wasm', 'cpu']
    });
  }

  /**
   * Initializes the accelerator by detecting hardware and browser capabilities.
   * @returns {Promise<boolean>} True if initialization is successful, false otherwise.
   */
  async initialize(): Promise<boolean> {
    // Initialize hardware detection (depends on HardwareAbstraction)
    // await this.hardwareAbstraction.initialize(); // Uncomment when HardwareAbstraction is ready

    // Detect browser capabilities
    this.browserCapabilities = await this.detectCapabilities();

    // TODO: Add check for successful hardwareAbstraction initialization when ready
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

    if (userAgent.indexOf("Firefox") > -1) return "firefox";
    // Edge user agent contains "Edg/" (note the capital 'E')
    if (userAgent.indexOf("Edg/") > -1) return "edge";
     // Chrome user agent contains "Chrome" but not "Edg/"
    if (userAgent.indexOf("Chrome") > -1 && userAgent.indexOf("Edg/") === -1) return "chrome";
    // Safari user agent contains "Safari" but not "Chrome" or "Edg/"
    if (userAgent.indexOf("Safari") > -1 && userAgent.indexOf("Chrome") === -1 && userAgent.indexOf("Edg/") === -1) return "safari";

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

  // TODO: Add more methods based on ipfs_accelerate_js functionality as needed
  // e.g., methods to select optimal backend based on capabilities,
  // methods to trigger specific optimizations, etc.
}
