#!/usr/bin/env node
/**
 * Bun-specific build script for SwissKnife
 * 
 * This script uses Bun directly to build the SwissKnife CLI with all features.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

console.log('🔪 Building SwissKnife with Bun...');

const ROOT_DIR = process.cwd();
const TEMP_DIR = path.join(ROOT_DIR, 'temp');
const OUTPUT_FILE = path.join(ROOT_DIR, 'cli.mjs');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

try {
  console.log('📦 Bundling sources with Bun...');
  
  // Use Bun with absolute path to ensure we're using the right executable
  const bunPath = path.join(os.homedir(), '.bun', 'bin', 'bun');
  console.log(`Using Bun at: ${bunPath}`);
  console.log(`Current directory: ${process.cwd()}`);
  
  // List the src/entrypoints directory to confirm cli.tsx exists
  try {
    const entrypointsDir = path.join(ROOT_DIR, 'src', 'entrypoints');
    console.log(`Checking entrypoints directory: ${entrypointsDir}`);
    console.log('Files in entrypoints:', fs.readdirSync(entrypointsDir));
  } catch (err) {
    console.error('Error checking entrypoints directory:', err);
  }
  
  // Execute the bun build command
  const buildCommand = `${bunPath} build src/entrypoints/cli.tsx --minify --outfile ${OUTPUT_FILE} --target node --format esm`;
  console.log(`Running build command: ${buildCommand}`);
  execSync(buildCommand, {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });
  
  console.log('🛠️ Fixing shebang...');
  
  // Read the bundled file
  let bundledCode = fs.readFileSync(OUTPUT_FILE, 'utf8');
  
  // Remove any existing shebang lines
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
