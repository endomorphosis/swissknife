import { StorageProvider } from '@statsig/client-core'
import * as fs from 'fs'
import * as path from 'path'
import { homedir } from 'os'
import { logError } from '../utils/log'
import { existsSync, unlinkSync } from 'fs'

const STATSIG_DIR = path.join(homedir(), '.claude', 'statsig')

// Ensure the directory exists
try {
  fs.mkdirSync(STATSIG_DIR, { recursive: true })
} catch (error) {
  logError(`Failed to create statsig storage directory: ${error}`)
}

export class FileSystemStorageProvider implements StorageProvider {
  private cache: Map<string, string> = new Map()
  private ready = false

  constructor() {
    // Load all existing files into cache on startup
    try {
      if (!fs.existsSync(STATSIG_DIR)) {
        fs.mkdirSync(STATSIG_DIR, { recursive: true })
      }
      const files = fs.readdirSync(STATSIG_DIR)
      for (const file of files) {
        const key = decodeURIComponent(file)
        const value = fs.readFileSync(path.join(STATSIG_DIR, file), 'utf8')
        this.cache.set(key, value)
      }
      this.ready = true
    } catch (error) {
      logError(`Failed to initialize statsig storage: ${error}`)
      this.ready = true // Still mark as ready to avoid blocking
    }
  }

  isReady(): boolean {
    return this.ready
  }

  isReadyResolver(): Promise<void> | null {
    return this.ready ? Promise.resolve() : null
  }

  getProviderName(): string {
    return 'FileSystemStorageProvider'
  }

  getItem(key: string): string | null {
    return this.cache.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.cache.set(key, value)
    try {
      const encodedKey = encodeURIComponent(key)
      fs.writeFileSync(path.join(STATSIG_DIR, encodedKey), value, 'utf8')
    } catch (error) {
      logError(`Failed to write statsig storage item: ${error}`)
    }
  }

  removeItem(key: string): void {
    this.cache.delete(key)
    const encodedKey = encodeURIComponent(key)
    const file = path.join(STATSIG_DIR, encodedKey)
    if (!existsSync(file)) {
      return
    }
    try {
      unlinkSync(file)
    } catch (error) {
      logError(`Failed to remove statsig storage item: ${error}`)
    }
  }

  getAllKeys(): readonly string[] {
    return Array.from(this.cache.keys())
  }
}
