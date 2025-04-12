# SwissKnife CLI Troubleshooting Guide

This guide addresses common issues that may arise when building, developing, or running the SwissKnife CLI.

## Build Issues

### Error: `v$.default.color.ansi is not a function`

**Symptoms:**
- Build completes successfully, but CLI crashes with this error when run
- Error occurs in color formatting code

**Causes:**
- Terminal color libraries (chalk, kleur) are being bundled incorrectly
- Bundler transforms the library's internal structure, breaking API references

**Solutions:**

1. **Mark color libraries as external:**
   ```javascript
   // In build configuration
   external: ['chalk', 'kleur', 'ansi-colors']
   ```

2. **Use a wrapper utility:**
   Create a color utility file (`src/utils/color.ts`) that safely wraps the color library:
   ```typescript
   import chalk from 'chalk';
   
   // Safe wrapper functions that won't break during bundling
   export const red = (text: string) => chalk.red(text);
   export const green = (text: string) => chalk.green(text);
   export const blue = (text: string) => chalk.blue(text);
   // Add more as needed
   ```

3. **Try different build approaches:**
   - Use `npm run dev` for development (avoids bundling)
   - Try `npm run build:tsx` instead of `npm run build:bun`
   - If using Bun, check Bun version compatibility

### Error: `Dynamic require of "stream" is not supported`

**Symptoms:**
- Build fails or runtime errors mentioning dynamic requires
- Errors reference Node.js built-in modules

**Causes:**
- Bundler doesn't support dynamic requires of Node.js modules
- Code is using CommonJS-style dynamic requires in an ESM context

**Solutions:**

1. **Use static imports:**
   ```typescript
   // Before
   const fs = require('fs');
   
   // After
   import * as fs from 'fs';
   ```

2. **Mark Node.js modules as external:**
   ```javascript
   // In build configuration
   external: ['stream', 'fs', 'path', 'crypto', 'util', 'events']
   ```

3. **Create a dynamic import utility:**
   ```typescript
   // src/utils/dynamic-import.ts
   const moduleCache = new Map();
   
   export function dynamicImport(moduleName: string) {
     if (moduleCache.has(moduleName)) {
       return moduleCache.get(moduleName);
     }
     
     try {
       // Use a switch statement for better bundler compatibility
       let module;
       switch (moduleName) {
         case 'fs':
           module = require('fs');
           break;
         case 'stream':
           module = require('stream');
           break;
         // Add more as needed
         default:
           throw new Error(`Unsupported module: ${moduleName}`);
       }
       
       moduleCache.set(moduleName, module);
       return module;
     } catch (err) {
       console.error(`Error importing ${moduleName}:`, err);
       throw err;
     }
   }
   ```

### Error: Size Limit Exceeded

**Symptoms:**
- Build fails with message about size limits
- Warnings about large bundle size

**Causes:**
- Dependencies are being bundled that shouldn't be
- Large dependencies are included in the bundle

**Solutions:**

1. **Analyze bundle:**
   ```bash
   npx esbuild-visualizer --metadata ./cli.meta.json --filename stats.html
   ```

2. **Mark large dependencies as external:**
   ```javascript
   external: ['large-dependency-name']
   ```

3. **Use dynamic imports for large dependencies:**
   ```typescript
   const loadLargeDependency = async () => {
     const module = await import('large-dependency');
     return module;
   };
   ```

## Runtime Issues

### Terminal Colors Not Displaying

**Symptoms:**
- CLI works but colors don't appear
- Text formatting is incorrect or missing

**Causes:**
- Color libraries not properly bundled
- Terminal does not support colors
- `NO_COLOR` environment variable is set

**Solutions:**

1. **Check terminal support:**
   ```typescript
   import chalk from 'chalk';
   
   // Check if colors are supported
   if (chalk.supportsColor) {
     // Use colors
   } else {
     // Use plain text fallbacks
   }
   ```

2. **Create a safe color utility:**
   ```typescript
   // src/utils/safe-colors.ts
   import chalk from 'chalk';
   
   export const safeColor = {
     red: chalk.supportsColor ? (text: string) => chalk.red(text) : (text: string) => text,
     green: chalk.supportsColor ? (text: string) => chalk.green(text) : (text: string) => text,
     // Add more as needed
   };
   ```

3. **Check environment variables:**
   ```bash
   # Force colors on
   FORCE_COLOR=1 ./cli.mjs
   
   # Check if NO_COLOR is set
   echo $NO_COLOR
   ```

### CLI Crashes with Module Not Found

**Symptoms:**
- Error messages like "Cannot find module 'xyz'"
- CLI starts but crashes when accessing certain functionality

**Causes:**
- Module was not properly marked as external
- Dynamic requires not properly handled
- Missing dependencies

**Solutions:**

1. **Check dependencies:**
   ```bash
   npm ls module-name
   ```

2. **Verify externals configuration:**
   ```javascript
   // Make sure module is listed in externals
   external: ['module-name']
   ```

3. **Use try/catch for requires:**
   ```typescript
   try {
     const module = require('module-name');
     // Use module
   } catch (err) {
     console.error('Module not available:', err.message);
     // Provide fallback functionality
   }
   ```

### Performance Issues

**Symptoms:**
- CLI is slow to start
- Commands take a long time to execute

**Causes:**
- Large bundle size
- Too many dependencies being loaded at startup
- Inefficient lazy loading

**Solutions:**

1. **Optimize bundle size:**
   ```bash
   # Analyze bundle
   npx esbuild-visualizer --metadata ./cli.meta.json
   ```

2. **Implement lazy loading:**
   ```typescript
   // Only load modules when needed
   const loadModule = async () => {
     const module = await import('./heavy-module');
     return module;
   };
   ```

3. **Use Node.js worker threads for heavy operations:**
   ```typescript
   import { Worker } from 'worker_threads';
   
   const runHeavyTask = (data) => {
     return new Promise((resolve, reject) => {
       const worker = new Worker('./worker.js', {
         workerData: data
       });
       
       worker.on('message', resolve);
       worker.on('error', reject);
       worker.on('exit', (code) => {
         if (code !== 0) {
           reject(new Error(`Worker stopped with exit code ${code}`));
         }
       });
     });
   };
   ```

## Dependency Issues

### Incompatible Peer Dependencies

**Symptoms:**
- npm/yarn warns about incompatible peer dependencies
- Build or runtime errors related to specific modules

**Causes:**
- Dependency version conflicts
- Packages expecting different versions of shared dependencies

**Solutions:**

1. **Use `--legacy-peer-deps` flag:**
   ```bash
   npm install --legacy-peer-deps
   ```

2. **Use `override` in package.json:**
   ```json
   "overrides": {
     "problematic-dependency": "compatible-version"
   }
   ```

3. **Pin specific versions:**
   ```json
   "dependencies": {
     "dependency": "1.2.3"
   }
   ```

### ESM vs CommonJS Issues

**Symptoms:**
- Errors about mixing import styles
- "Cannot use import statement outside a module"
- "require() of ES modules is not supported"

**Causes:**
- Mixing CommonJS and ESM modules
- Incorrectly configured `type` field in package.json

**Solutions:**

1. **Check package.json `type` field:**
   ```json
   {
     "type": "module"  // or "commonjs"
   }
   ```

2. **Use dual packaging:**
   ```json
   {
     "main": "dist/index.cjs",
     "module": "dist/index.js",
     "exports": {
       "require": "./dist/index.cjs",
       "import": "./dist/index.js"
     }
   }
   ```

3. **Use dynamic imports for ESM compatibility:**
   ```javascript
   async function loadModule() {
     const module = await import('esm-only-module');
     return module;
   }
   ```

## Development Workflow Issues

### Hot Reload Not Working

**Symptoms:**
- Changes to code don't appear without restarting
- Development experience is slow

**Solutions:**

1. **Use `tsx watch` mode:**
   ```bash
   tsx watch ./src/entrypoints/cli.tsx
   ```

2. **Create a custom dev script:**
   ```json
   "scripts": {
     "dev:watch": "tsx watch ./src/entrypoints/cli.tsx"
   }
   ```

### Debugging Issues

**Symptoms:**
- Hard to track down bugs
- Console logs not appearing

**Solutions:**

1. **Enable source maps:**
   ```javascript
   // In build configuration
   sourcemap: true
   ```

2. **Use Node.js inspector:**
   ```bash
   node --inspect-brk ./cli.mjs
   ```

3. **Add debug mode:**
   ```typescript
   const isDebug = process.env.DEBUG === 'true';
   
   function debugLog(...args: any[]) {
     if (isDebug) {
       console.log('[DEBUG]', ...args);
     }
   }
   ```
   
   Run with:
   ```bash
   DEBUG=true ./cli.mjs
   ```

## Specific Features and Dependencies

### Chalk/Kleur/Terminal Colors

**Symptoms:**
- Colors not working
- Errors in color-related code

**Solutions:**

1. **Use a safe wrapper:**
   ```typescript
   // src/utils/terminal-colors.ts
   import chalk from 'chalk';
   
   export const colors = {
     red: (text: string) => {
       try {
         return chalk.red(text);
       } catch (e) {
         return text;
       }
     },
     // Add more colors as needed
   };
   ```

2. **Check for color support:**
   ```typescript
   import chalk from 'chalk';
   
   const useColors = chalk.supportsColor !== false && process.env.NO_COLOR === undefined;
   ```

### Ink/React Terminal UI

**Symptoms:**
- UI components not rendering correctly
- Errors in Ink-related code

**Solutions:**

1. **Keep Ink external:**
   ```javascript
   // In build configuration
   external: ['ink', 'react']
   ```

2. **Use fallback renderer:**
   ```typescript
   try {
     // Try to use Ink
     const { render } = require('ink');
     // Render UI
   } catch (e) {
     // Fallback to simple console output
     console.log('Simple mode: Ink not available');
     // Implement simple console-based UI
   }
   ```

## Advanced Troubleshooting

### Creating a Minimal Reproduction

If you encounter a complex issue:

1. Create a minimal reproduction case:
   ```bash
   # Create a new directory
   mkdir swissknife-repro
   cd swissknife-repro
   
   # Initialize package
   npm init -y
   
   # Add minimal dependencies
   npm install chalk tsx esbuild
   
   # Create a minimal test file
   echo "import chalk from 'chalk'; console.log(chalk.red('Test'));" > test.ts
   
   # Try to build
   npx esbuild test.ts --bundle --platform=node --outfile=out.js
   ```

2. Run the minimal case:
   ```bash
   node out.js
   ```

3. Compare with unbundled version:
   ```bash
   npx tsx test.ts
   ```

### Analyzing Bundle Content

To inspect what's in your bundle:

```bash
# Create source map
npm run build -- --sourcemap

# Analyze the bundle
npx source-map-explorer cli.mjs

# Or use esbuild-visualizer
npx esbuild-visualizer --metadata ./cli.meta.json
```

## Getting Help

If you've tried the solutions in this guide and still have issues:

1. Check existing GitHub issues
2. Search for similar problems in the codebase
3. Create a detailed issue with:
   - Error messages
   - Steps to reproduce
   - Your environment details
   - What you've tried already

Remember that some issues might be environment-specific, so providing detailed information about your setup is crucial.
