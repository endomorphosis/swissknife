/**
 * Test for array utility functions
 */

import { intersperse } from '../../../src/utils/array';

describe('Array Utilities', () => {
  describe('intersperse', () => {
    test('should intersperse separator between array elements', () => {
      const input = ['a', 'b', 'c'];
      const result = intersperse(input, (i) => `sep${i}`);
      expect(result).toEqual(['a', 'sep1', 'b', 'sep2', 'c']);
    });

    test('should handle empty array', () => {
      const input: string[] = [];
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
      const indices: number[] = [];
      intersperse(input, (i) => {
        indices.push(i);
        return '-';
      });
      expect(indices).toEqual([1, 2]);
    });
  });
});
