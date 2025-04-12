#!/usr/bin/env tsx
/**
 * Modern build script for SwissKnife
 * 
 * This script bundles all features from the development environment into the production build,
 * ensuring consistency between development and production environments.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

console.log('🔪 Building SwissKnife with all features...');

// ES modules don't have __dirname, so we need to create it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '../..');
const TEMP_DIR = path.join(ROOT_DIR, 'temp');
const OUTPUT_FILE = path.join(ROOT_DIR, 'cli.mjs');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

try {
  console.log('📦 Bundling sources...');
  
  // Use esbuild for modern bundling (better than Bun's bundler for complex projects)
  // This preserves all the React/Ink components and advanced features
  execSync(`npx esbuild src/entrypoints/cli.tsx --bundle --format=esm --platform=node --target=node18 --minify --sourcemap --outfile=${OUTPUT_FILE}`, {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });
  
  console.log('🛠️ Fixing shebang...');
  
  // Read the bundled file
  let bundledCode = fs.readFileSync(OUTPUT_FILE, 'utf8');
  
  // Remove any existing shebang lines (esbuild might have preserved them from the source)
  bundledCode = bundledCode.replace(/^#!.*?\n/m, '');
  
  // Add our clean shebang at the top
  bundledCode = `#!/usr/bin/env node\n${bundledCode}`;
  
  // Write back the modified bundle
  fs.writeFileSync(OUTPUT_FILE, bundledCode);
  
  // Make the output file executable
  execSync(`chmod +x ${OUTPUT_FILE}`, { stdio: 'inherit' });
  
  console.log('✅ Build complete! Output: cli.mjs');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
