// test/browser-compat/browser-deployment-policy.test.js
//
// SWR-041: static assertions for the browser deployment policy (CSP, worker
// creation, storage APIs, WASM isolation headers, and offline mode). These
// checks mirror what `scripts/audit-browser-deployment-policy.mjs` verifies,
// so a regression here fails fast in the `test:browser-compat:static` lane
// instead of only showing up when someone remembers to re-run the audit.

const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function projectFileExists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

const REQUIRED_CSP_DIRECTIVES = [
  'default-src',
  'script-src',
  'style-src',
  'img-src',
  'font-src',
  'connect-src',
  'worker-src',
  'object-src',
  'base-uri',
];

const HOST_ONLY_SPECIFIERS = [
  'worker_threads',
  'node:worker_threads',
  'child_process',
  'node:child_process',
  'fs',
  'node:fs',
  'fs/promises',
  'node:fs/promises',
  'node:path',
  'node:os',
];

function extractCspContent(html) {
  const metaTagMatch = html.match(/<meta[^>]*http-equiv=(["'])Content-Security-Policy\1[^>]*>/i);
  expect(metaTagMatch).not.toBeNull();
  const contentAttrMatch = metaTagMatch[0].match(/\scontent=(["'])([\s\S]*?)\1/i);
  expect(contentAttrMatch).not.toBeNull();
  return contentAttrMatch[2];
}

describe('browser deployment policy (SWR-041)', () => {
  const html = readProjectFile('web/index.html');

  it('serves a Content-Security-Policy covering every required directive', () => {
    const content = extractCspContent(html);
    for (const directive of REQUIRED_CSP_DIRECTIVES) {
      expect(content).toMatch(new RegExp(`(?:^|;\\s*)${directive}\\s`));
    }
    expect(content).toMatch(/worker-src[^;]*'self'/);
  });

  it('links a web app manifest and registers a service worker from the web entry', () => {
    expect(html).toMatch(/<link\s+rel=["']manifest["']\s+href=["'][^"']+["']/i);
    expect(html).toMatch(/navigator\.serviceWorker\.register\s*\(/);
  });

  it('ships every required offline artifact', () => {
    for (const relativePath of [
      'web/public/service-worker.js',
      'web/public/manifest.webmanifest',
      'web/public/offline.html',
      'web/public/_headers',
    ]) {
      expect({ relativePath, exists: projectFileExists(relativePath) }).toEqual({ relativePath, exists: true });
    }
  });

  it('implements install/activate/fetch in the service worker using only the Cache Storage API', () => {
    const sw = readProjectFile('web/public/service-worker.js');
    expect(sw).toMatch(/addEventListener\s*\(\s*['"]install['"]/);
    expect(sw).toMatch(/addEventListener\s*\(\s*['"]activate['"]/);
    expect(sw).toMatch(/addEventListener\s*\(\s*['"]fetch['"]/);
    expect(sw).toMatch(/\bcaches\.(?:open|match|delete|keys)\s*\(/);

    for (const specifier of HOST_ONLY_SPECIFIERS) {
      const importRe = new RegExp(`(?:from|require\\s*\\(|import\\s*\\()\\s*["']${specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`);
      expect(sw).not.toMatch(importRe);
    }
  });

  it('declares a valid web app manifest with the required PWA fields', () => {
    const manifest = JSON.parse(readProjectFile('web/public/manifest.webmanifest'));
    for (const field of ['name', 'start_url', 'display', 'icons']) {
      expect(manifest).toHaveProperty(field);
    }
  });

  it('sets cross-origin isolation headers for WASM in the deployment headers file', () => {
    const headers = readProjectFile('web/public/_headers');
    expect(headers).toMatch(/Cross-Origin-Opener-Policy:\s*same-origin/);
    expect(headers).toMatch(/Cross-Origin-Embedder-Policy:\s*require-corp/);
    expect(headers).toMatch(/Content-Security-Policy:/);
  });

  it('configures matching cross-origin isolation headers on the Vite dev/preview servers', () => {
    const viteConfig = readProjectFile('build-tools/configs/vite.web.config.ts');
    expect(viteConfig).toMatch(/Cross-Origin-Opener-Policy/);
    expect(viteConfig).toMatch(/Cross-Origin-Embedder-Policy/);
    expect(viteConfig).toMatch(/worker:\s*\{\s*format:\s*['"]es['"]/);
  });

  it('keeps the browser worker and storage entrypoints free of host-only imports', () => {
    for (const relativePath of ['src/workers/browser.ts', 'src/storage/browser.ts']) {
      const source = readProjectFile(relativePath);
      for (const specifier of HOST_ONLY_SPECIFIERS) {
        const importRe = new RegExp(`(?:from|require\\s*\\(|import\\s*\\()\\s*["']${specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`);
        expect(source).not.toMatch(importRe);
      }
    }
  });

  it('externalizes every host-only worker module from the dedicated worker build', () => {
    const workersConfig = readProjectFile('build-tools/configs/vite.workers.config.ts');
    for (const specifier of HOST_ONLY_SPECIFIERS) {
      expect(
        workersConfig.includes(`'${specifier}'`) || workersConfig.includes(`"${specifier}"`),
      ).toBe(true);
    }
  });

  it('has a matching, generated browser deployment policy doc', () => {
    expect(projectFileExists('docs/browser-deployment-policy.md')).toBe(true);
    const doc = readProjectFile('docs/browser-deployment-policy.md');
    expect(doc).toMatch(/# Browser Deployment Policy/);
    expect(doc).toMatch(/scripts\/audit-browser-deployment-policy\.mjs/);
  });
});
