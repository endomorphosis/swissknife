// src/types/common.js
/**
 * Common type definitions for SwissKnife
 * 
 * This file contains JSDoc type definitions that are used across multiple modules.
 */

/**
 * @typedef {string} CID - Content-addressable identifier
 */

/**
 * @typedef {string} TaskID - Unique identifier for a task
 */

/**
 * @typedef {string} GoTNodeID - Unique identifier for a Graph of Thought node
 */

/**
 * @typedef {Object} Result
 * @template T
 * @property {boolean} success - Whether the operation succeeded
 * @property {T} [data] - The result data if successful
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} Metadata
 * @property {number} createdAt - Creation timestamp
 * @property {number} updatedAt - Last update timestamp
 */

/**
 * @typedef {Object} PaginationOptions
 * @property {number} [limit] - Maximum number of items to return
 * @property {number} [offset] - Offset for pagination
 * @property {number} [page] - Page number for pagination
 */

/**
 * Sort direction enumeration
 * @enum {string}
 */
export const SortDirection = {
  ASC: 'asc',
  DESC: 'desc'
};

/**
 * @typedef {Object} SortOptions
 * @property {string} field - Field to sort by
 * @property {string} direction - Sort direction
 */

/**
 * @typedef {Object} FilterOptions
 * Key-value pairs for filtering
 */

/**
 * @typedef {Object} QueryOptions
 * @property {PaginationOptions} [pagination] - Pagination options
 * @property {SortOptions} [sort] - Sort options
 * @property {FilterOptions} [filter] - Filter options
 */

/**
 * Status enumeration for asynchronous operations
 * @enum {string}
 */
export const Status = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Priority levels enumeration
 * @enum {number}
 */
export const Priority = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3
};

/**
 * Check if a value is a JSON object
 * @param {*} value - Value to check
 * @returns {boolean} - True if the value is a JSON object
 */
export function isJSONObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Check if a value is a JSON array
 * @param {*} value - Value to check
 * @returns {boolean} - True if the value is a JSON array
 */
export function isJSONArray(value) {
  return Array.isArray(value);
}

export default {
  Status,
  Priority,
  SortDirection,
  isJSONObject,
  isJSONArray
};
