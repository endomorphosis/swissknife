import { isAbsolute, resolve } from 'path'
import { getCwd, getOriginalCwd } from '../state'

// In-memory storage for file permissions that resets each session
// Sets of allowed directories for read and write operations
const readFileAllowedDirectories: Set<string> = new Set()
const writeFileAllowedDirectories: Set<string> = new Set()

/**
 * Ensures a path is absolute by resolving it relative to cwd if necessary
 * @param path The path to normalize
 * @returns Absolute path
 */
export function toAbsolutePath(path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(getCwd(), path)
}

/**
 * Ensures a path is in the original cwd path
 * @param directory The directory path to normalize
 * @returns Absolute path
 */
export function pathInOriginalCwd(path: string): boolean {
  const absolutePath = toAbsolutePath(path)
  return absolutePath.startsWith(toAbsolutePath(getOriginalCwd()))
}

/**
 * Check if read permission exists for the specified directory
 * @param directory The directory to check permission for
 * @returns true if read permission exists, false otherwise
 */
export function hasReadPermission(directory: string): boolean {
  const absolutePath = toAbsolutePath(directory)

  for (const allowedPath of readFileAllowedDirectories) {
    // Permission exists for this directory or a path prefix
    if (absolutePath.startsWith(allowedPath)) {
      return true
    }
  }
  return false
}

/**
 * Check if write permission exists for the specified directory
 * @param directory The directory to check permission for
 * @returns true if write permission exists, false otherwise
 */
export function hasWritePermission(directory: string): boolean {
  const absolutePath = toAbsolutePath(directory)

  for (const allowedPath of writeFileAllowedDirectories) {
    // Permission exists for this directory or a path prefix
    if (absolutePath.startsWith(allowedPath)) {
      return true
    }
  }
  return false
}

/**
 * Save read permission for a directory
 * @param directory The directory to grant read permission for
 */
function saveReadPermission(directory: string): void {
  const absolutePath = toAbsolutePath(directory)

  // Clean up any existing subdirectories of this path
  for (const allowedPath of readFileAllowedDirectories) {
    if (allowedPath.startsWith(absolutePath)) {
      readFileAllowedDirectories.delete(allowedPath)
    }
  }
  readFileAllowedDirectories.add(absolutePath)
}

export const saveReadPermissionForTest = saveReadPermission

/**
 * Grants read permission for the original project directory.
 * This is useful for initializing read access to the project root.
 */
export function grantReadPermissionForOriginalDir(): void {
  const originalProjectDir = getOriginalCwd()
  saveReadPermission(originalProjectDir)
}

/**
 * Save write permission for a directory
 * @param directory The directory to grant write permission for
 */
function saveWritePermission(directory: string): void {
  const absolutePath = toAbsolutePath(directory)

  // Clean up any existing subdirectories of this path
  for (const allowedPath of writeFileAllowedDirectories) {
    if (allowedPath.startsWith(absolutePath)) {
      writeFileAllowedDirectories.delete(allowedPath)
    }
  }
  writeFileAllowedDirectories.add(absolutePath)
}

/**
 * Grants write permission for the original project directory.
 * This is useful for initializing write access to the project root.
 */
export function grantWritePermissionForOriginalDir(): void {
  const originalProjectDir = getOriginalCwd()
  saveWritePermission(originalProjectDir)
}

// For testing purposes
export function clearFilePermissions(): void {
  readFileAllowedDirectories.clear()
  writeFileAllowedDirectories.clear()
}
