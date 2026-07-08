// Global test setup for Vitest
import { vi } from 'vitest'

const jestCompat = vi as typeof vi & { setTimeout(timeout: number): void }
jestCompat.setTimeout = (timeout: number) => {
  vi.setConfig({ testTimeout: timeout })
}
;(globalThis as typeof globalThis & { jest?: typeof jestCompat }).jest = jestCompat

// Mock environment variables
vi.mock('process', () => ({
  env: {
    NODE_ENV: 'test',
    SWISSKNIFE_ENV: 'test'
  },
  cwd: () => '/tmp',
  argv: ['node', 'test']
}))

// Mock common Node.js modules for browser testing
<<<<<<< HEAD
vi.mock('fs', () => {
  const mockFs = {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn()
  }
  return {
    ...mockFs,
    default: mockFs
  }
})

  vi.doMock('path', async () => {
    const actual = await vi.importActual('path-browserify')
    return { ...(actual as Record<string, unknown>), default: actual }
  })
=======
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    default: actual,
    readFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  }
})

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return actual
})

vi.mock('path', async () => {
  const actual = await vi.importActual('path-browserify')
  return actual
})

vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path')
  return actual
})
>>>>>>> 1569811 (chore: add pending swissknife staged changes)

// Mock crypto for consistent testing
vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto')
  let randomUuidCounter = 0
  const randomUUID = vi.fn(() => {
    randomUuidCounter += 1
    return `00000000-0000-4000-8000-${String(randomUuidCounter).padStart(12, '0')}`
  })
  return {
    ...(actual as Record<string, unknown>),
    default: {
      ...((actual as { default?: Record<string, unknown> }).default ?? actual),
      randomUUID
    },
    randomUUID
  }
})

// Setup global objects that might be needed. Guarded so this shared setup file
// also works for test files that opt into the node environment
// (`// @vitest-environment node`), where `window` is undefined.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'navigator', {
    value: {
      userAgent: 'test-agent',
      gpu: {
        requestAdapter: vi.fn(() => Promise.resolve(null))
      }
    },
    writable: true
  })

  // Mock WebGPU for AI inference testing
  Object.defineProperty(window, 'GPU', {
    value: class MockGPU {
      requestAdapter = vi.fn(() => Promise.resolve({
        requestDevice: vi.fn(() => Promise.resolve({
          createShaderModule: vi.fn(),
          createBuffer: vi.fn(),
          createComputePipeline: vi.fn(),
          createCommandEncoder: vi.fn(),
          queue: {
            submit: vi.fn(),
            writeBuffer: vi.fn()
          }
        }))
      }))
    },
    writable: true
  })
}

// Setup console for better test output
console.info = vi.fn()
console.debug = vi.fn()
console.warn = vi.fn()

// Increase timeout for AI-related tests
vi.setConfig({
  testTimeout: 30000,
<<<<<<< HEAD
  hookTimeout: 10000
=======
  hookTimeout: 10000 
>>>>>>> 1569811 (chore: add pending swissknife staged changes)
})
