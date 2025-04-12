#!/usr/bin/env node
/**
 * Enhanced build script for SwissKnife
 * This script provides a unified build process that works reliably in all environments
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Get directory name in ES module context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔪 Building SwissKnife...');

const ROOT_DIR = process.cwd();
const TEMP_DIR = path.join(ROOT_DIR, 'temp');
const OUTPUT_FILE = path.join(ROOT_DIR, 'cli.mjs');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// Ensure required directories exist
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

try {
  // Detect available build tools
  let buildTool = 'tsx';
  try {
    execSync('bun --version', { stdio: 'ignore' });
    buildTool = 'bun';
    console.log('📦 Using Bun for building...');
  } catch (e) {
    console.log('📦 Bun not available, falling back to tsx...');
  }

  // Check if build config exists
  const BUILD_CONFIG_PATH = path.join(ROOT_DIR, 'build.config.js');
  let buildConfig = { external: [] };
  
  if (fs.existsSync(BUILD_CONFIG_PATH)) {
    try {
      console.log('📦 Loading build configuration...');
      const configModule = await import(`./build.config.js`);
      buildConfig = configModule.default || configModule;
      console.log(`📦 Found ${buildConfig.external?.length || 0} external dependencies in config`);
    } catch (err) {
      console.warn('⚠️ Failed to load build config:', err.message);
    }
  }

  // Use the detected build tool
  if (buildTool === 'bun') {
    console.log('📦 Bundling with Bun...');
    
    // Build externals string
    const externals = buildConfig.external || [];
    const externalsArg = externals.length > 0 
      ? `--external=${externals.join(' --external=')}` 
      : '';
    
    // Run bun build with externals
    execSync(`bun build src/entrypoints/cli.tsx --minify --outfile ${OUTPUT_FILE} --target node --format esm ${externalsArg}`, {
      cwd: ROOT_DIR,
      stdio: 'inherit'
    });
  } else {
    console.log('📦 Bundling with tsx...');
    
    // Create temp config for tsx build if needed
    if (buildConfig.external?.length) {
      console.log(`📦 Applying externals configuration to tsx build...`);
    }
    
    execSync(`tsx ./src/build/build.tsx`, {
      cwd: ROOT_DIR,
      stdio: 'inherit'
    });
  }

  console.log('🛠️ Fixing shebang...');
  
  // Read the bundled file
  let bundledCode = fs.readFileSync(OUTPUT_FILE, 'utf8');
  
  // Add shebang if not present
  if (!bundledCode.startsWith('#!/usr/bin')) {
    bundledCode = `#!/usr/bin/env -S node --no-warnings=ExperimentalWarning --enable-source-maps\n${bundledCode}`;
    fs.writeFileSync(OUTPUT_FILE, bundledCode);
  }
  
  // Make the file executable
  try {
    fs.chmodSync(OUTPUT_FILE, '755');
    console.log('📄 Made output file executable');
  } catch (err) {
    console.warn('⚠️ Could not make output file executable:', err.message);
  }
  
  console.log('✅ Build completed successfully!');
  console.log(`📄 Output file: ${OUTPUT_FILE}`);
  
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
