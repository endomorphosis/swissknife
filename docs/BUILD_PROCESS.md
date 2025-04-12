# SwissKnife Build Process

This document outlines the build process for the SwissKnife CLI, including common issues and their solutions.

## Overview

SwissKnife uses a combination of TypeScript and various build tools to create a performant CLI. Understanding the build process is crucial for both contributing to the project and troubleshooting potential issues.

## Build Scripts

SwissKnife offers multiple build approaches, each with different characteristics:

### `npm run dev`

```bash
tsx ./src/entrypoints/cli.tsx --verbose
```

- **Purpose**: Development mode that runs TypeScript directly
- **Advantages**: 
  - No bundling issues
  - Proper module resolution
  - Direct access to node_modules
- **Use when**: Developing locally and testing changes

### `npm run build`

```bash
node --no-warnings=ExperimentalWarning ./build.js
```

- **Purpose**: Production build using auto-detected tools
- **Process**:
  - Detects if Bun is available, falling back to tsx if not
  - Bundles the CLI into a single file with proper shebang
  - Makes the output file executable
- **Use when**: Creating production releases

### `npm run build:tsx`

```bash
mkdir -p temp && tsx ./src/build/build.tsx
```

- **Purpose**: Build using tsx directly
- **Advantages**: More reliable for certain dependency structures
- **Use when**: Having issues with the default build

### `npm run build:bun`

```bash
bun build src/entrypoints/cli.tsx --minify --outfile cli.mjs --target=node
```

- **Purpose**: Build using Bun's bundler
- **Advantages**: Faster build times and better optimization
- **Use when**: Speed is a priority and dependencies are compatible

### `npm run build:legacy`

```bash
mkdir -p temp && node --no-warnings=ExperimentalWarning ./build-wrapper.js
```

- **Purpose**: Legacy build process
- **Use when**: Specific compatibility requirements apply

## Common Build Challenges

### 1. Color Formatting Issues

Problem: Errors like `v$.default.color.ansi is not a function` occur during bundling because terminal color libraries (chalk, kleur) are transformed in ways that break their APIs.

#### Solution Approaches:

1. **External Dependencies**:
   - Mark color libraries as external dependencies in the bundler configuration
   - Example for esbuild:
     ```js
     external: ['chalk', 'kleur', 'ansi-colors']
     ```

2. **Direct Import Fixes**:
   - Use a wrapper around problematic color imports
   - Create a utility file that safely imports and re-exports color functionality
   - Example:
     ```typescript
     // src/utils/color.ts
     import chalk from 'chalk';
     
     // Safe exports that won't break during bundling
     export const colorize = {
       red: (text: string) => chalk.red(text),
       green: (text: string) => chalk.green(text),
       // etc.
     };
     ```

### 2. Dynamic Requires

Problem: Errors like `Dynamic require of "stream" is not supported` occur when the bundler encounters dynamic requires of Node.js built-in modules.

#### Solution Approaches:

1. **Static Imports**:
   - Replace dynamic requires with static imports where possible
   - Example:
     ```typescript
     // Before
     const stream = require('stream');
     
     // After
     import * as stream from 'stream';
     ```

2. **External Modules**:
   - Mark Node.js built-in modules as external in the bundler configuration
   - Example for esbuild:
     ```js
     external: ['stream', 'fs', 'path', 'crypto']
     ```

3. **Dynamic Import Wrappers**:
   - Create wrappers that handle dynamic imports safely
   - Example:
     ```typescript
     // src/utils/dynamic-import.ts
     export const safeRequire = (moduleName: string) => {
       try {
         // This pattern is safer for bundlers
         return moduleName === 'stream' ? require('stream') : 
                moduleName === 'fs' ? require('fs') : 
                // etc.
                null;
       } catch (e) {
         console.error(`Failed to load module: ${moduleName}`);
         return null;
       }
     };
     ```

## Dependency Management

For reliable builds, follow these principles for dependencies:

1. **Direct Dependencies**: 
   - Keep direct dependencies to a minimum
   - Prefer dependencies with ESM support
   - Avoid dependencies with complex dynamic loading patterns

2. **Terminal UI Libraries**:
   - Be cautious with terminal UI libraries (ink, chalk, kleur)
   - Consider marking them as external in the bundler
   - Test build output thoroughly after adding new terminal UI libraries

3. **Node.js Built-in Modules**:
   - Always use static imports for Node.js built-in modules when possible
   - Mark Node.js built-in modules as external in bundler configuration

## Recommended Build Configuration

For the most reliable builds, we recommend:

```javascript
// build.config.js
module.exports = {
  // Use esbuild for speed and flexibility
  bundler: 'esbuild',
  
  // External dependencies that shouldn't be bundled
  external: [
    // Node.js built-ins
    'fs', 'path', 'os', 'stream', 'crypto', 'util', 'events',
    
    // Problematic UI libraries
    'chalk', 'kleur', 'ink',
    
    // Other dependencies with special handling
    'ansi-escapes', 'figures'
  ],
  
  // Output configuration
  output: {
    format: 'esm',
    target: 'node18',
  },
  
  // Specific handling for problematic patterns
  overrides: {
    // Handle specific import patterns
  }
};
```

## Testing Builds

Always test builds thoroughly:

1. **Basic Functionality**:
   ```bash
   ./cli.mjs --help
   ```

2. **Color Output**:
   ```bash
   ./cli.mjs model
   ```

3. **Interactive Features**:
   ```bash
   ./cli.mjs
   ```
   Then test interactive features and observe color output

4. **Error Handling**:
   ```bash
   ./cli.mjs --invalid-flag
   ```
   Verify error messages display correctly with proper formatting

## Continuous Integration

The CI pipeline should:

1. Build with each approach
2. Test the output
3. Verify color formatting
4. Check dynamic requires
5. Ensure the CLI works in different environments

## Further Reading

- [esbuild Documentation](https://esbuild.github.io/)
- [Bun Bundler Documentation](https://bun.sh/docs/bundler)
- [Node.js ESM Documentation](https://nodejs.org/api/esm.html)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
