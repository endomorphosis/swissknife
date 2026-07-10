// Main exports for SwissKnife shared components
// This provides a unified interface for all shared functionality

// Type definitions
export * from './types/index.js'

// Event system
export * from './events/index.js'

// Utilities
export * from './utils/index.js'

// Browser/host service boundary contracts
export type * from './service-contracts/index.js'

// Constants
export * from './constants/index.js'

// AI providers
export * from './ai/index.js'

// Configuration management
export * from './config/index.js'

// CLI integration
export * from './cli/index.js'

// Version information
export const SWISSKNIFE_VERSION = '0.0.53'
export const SHARED_VERSION = '1.0.0'

// Component information
export const COMPONENTS = {
  CLI: 'cli',
  WEB: 'web',
  IPFS: 'ipfs'
} as const

// Quick access to commonly used exports
// Note: These are re-exported from their respective modules to avoid circular imports

// Type re-exports for convenience
export type {
  SwissKnifeConfig,
  SwissKnifeEvents,
  DesktopApp,
  WindowState,
  AIModel,
  AIProviderConfig,
  SwissKnifePlugin
} from './types/index.js'
