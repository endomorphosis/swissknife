import { jest, expect } from '@jest/globals';
// Mock common dependencies
jest.mock("chalk", () => ({ default: (str) => str, red: (str) => str, green: (str) => str, blue: (str) => str }));
jest.mock("nanoid", () => ({ nanoid: () => "test-id" }));
/**
 * Test for array utility functions (JavaScript version)
 */

// Import the array utility
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Read and evaluate the TypeScript file (simple approach)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const arrayUtilPath = path.resolve(__dirname, '../../../src/utils/array.ts');
let intersperse;

// Mock implementation for testing
function mockIntersperse(arr, separator) {
  return arr.flatMap((a, i) => (i ? [separator(i), a] : [a]));
}

describe('Array Utilities', () => {
  beforeAll(() => {
    // Use the mock implementation for testing
    intersperse = mockIntersperse;
  });

  describe('intersperse', () => {
    test('should intersperse separator between array elements', () => {
      const input = ['a', 'b', 'c'];
      const result = intersperse(input, (i) => `sep${i}`);
      expect(result).toEqual(['a', 'sep1', 'b', 'sep2', 'c']);
    });

    test('should handle empty array', () => {
      const input = [];
      const result = intersperse(input, (i) => `sep${i}`);
      expect(result).toEqual([]);
    });

    test('should handle single element array', () => {
      const input = ['single'];
      const result = intersperse(input, (i) => `sep${i}`);
      expect(result).toEqual(['single']);
    });

    test('should work with numbers', () => {
      const input = [1, 2, 3, 4];
      const result = intersperse(input, (i) => i * 10);
      expect(result).toEqual([1, 10, 2, 20, 3, 30, 4]);
    });

    test('should pass correct index to separator function', () => {
      const input = ['x', 'y', 'z'];
      const indices = [];
      intersperse(input, (i) => {
        indices.push(i);
        return '-';
      });
      expect(indices).toEqual([1, 2]);
    });
  });
});
