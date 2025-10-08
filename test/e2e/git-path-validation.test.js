/**
 * Git path validation tests
 * 
 * These tests verify that all tracked files in the repository
 * have valid filenames that are compatible with all major operating systems,
 * particularly Windows which has stricter filename restrictions.
 */

const { execSync } = require('child_process');
const path = require('path');

describe('Git Path Validation', () => {
  describe('Windows compatibility', () => {
    test('No files with backslashes in names', () => {
      try {
        const output = execSync('git ls-files', { 
          encoding: 'utf8',
          cwd: path.join(__dirname, '..', '..')
        });
        const files = output.split('\n').filter(f => f.trim());
        
        // Check for backslashes in filenames
        const filesWithBackslashes = files.filter(f => f.includes('\\'));
        
        expect(filesWithBackslashes).toEqual([]);
      } catch (error) {
        throw new Error(`Failed to check git files: ${error.message}`);
      }
    });

    test('No files with invalid Windows characters', () => {
      // Windows doesn't allow these characters in filenames: < > : " / \ | ? *
      // Note: / is used for path separation, so we only check for the others
      const invalidChars = ['<', '>', ':', '"', '|', '?', '*'];
      
      try {
        const output = execSync('git ls-files', { 
          encoding: 'utf8',
          cwd: path.join(__dirname, '..', '..')
        });
        const files = output.split('\n').filter(f => f.trim());
        
        const invalidFiles = files.filter(filename => {
          // Get just the filename part (not the path)
          const parts = filename.split('/');
          const basename = parts[parts.length - 1];
          
          return invalidChars.some(char => basename.includes(char));
        });
        
        expect(invalidFiles).toEqual([]);
      } catch (error) {
        throw new Error(`Failed to check git files: ${error.message}`);
      }
    });

    test('No backup files tracked by git', () => {
      try {
        const output = execSync('git ls-files', { 
          encoding: 'utf8',
          cwd: path.join(__dirname, '..', '..')
        });
        const files = output.split('\n').filter(f => f.trim());
        
        // Check for .bak files
        const bakFiles = files.filter(f => f.endsWith('.bak'));
        
        expect(bakFiles).toEqual([]);
      } catch (error) {
        throw new Error(`Failed to check git files: ${error.message}`);
      }
    });

    test('No files with double extensions like .py.ts', () => {
      try {
        const output = execSync('git ls-files', { 
          encoding: 'utf8',
          cwd: path.join(__dirname, '..', '..')
        });
        const files = output.split('\n').filter(f => f.trim());
        
        // Check for .py.ts files
        const pyTsFiles = files.filter(f => f.endsWith('.py.ts'));
        
        expect(pyTsFiles).toEqual([]);
      } catch (error) {
        throw new Error(`Failed to check git files: ${error.message}`);
      }
    });
  });

  describe('General path validation', () => {
    test('All tracked files have reasonable path lengths', () => {
      // Windows has a MAX_PATH of 260 characters by default
      // though this can be increased with longPathsEnabled
      const MAX_PATH_LENGTH = 260;
      
      try {
        const output = execSync('git ls-files', { 
          encoding: 'utf8',
          cwd: path.join(__dirname, '..', '..')
        });
        const files = output.split('\n').filter(f => f.trim());
        
        const longPaths = files.filter(f => f.length > MAX_PATH_LENGTH);
        
        // Log long paths if any exist (for debugging)
        if (longPaths.length > 0) {
          console.log('Files with paths longer than 260 characters:');
          longPaths.forEach(p => console.log(`  ${p} (${p.length} chars)`));
        }
        
        expect(longPaths.length).toBe(0);
      } catch (error) {
        throw new Error(`Failed to check git files: ${error.message}`);
      }
    });

    test('Git repository can be cloned', () => {
      // This test verifies that basic git operations work
      // It doesn't actually clone the repo, but checks that the current state is valid
      try {
        const status = execSync('git status --short', { 
          encoding: 'utf8',
          cwd: path.join(__dirname, '..', '..')
        });
        
        // After our cleanup, there should be no uncommitted deletions of tracked files
        const deletions = status.split('\n').filter(line => line.startsWith('D '));
        
        expect(deletions).toEqual([]);
      } catch (error) {
        throw new Error(`Failed to check git status: ${error.message}`);
      }
    });
  });
});
