#!/usr/bin/env node
// scripts/audit-browser-deployment-policy.mjs
//
// SWR-041: Browser deployment policy audit.
//
// Verifies (and generates a Markdown policy report for) the deployment-time
// requirements that only show up once SwissKnife web is actually shipped to a
// browser, as opposed to compiled: Content-Security-Policy, worker creation,
// storage APIs (IndexedDB/OPFS/Cache Storage), cross-origin isolation for
// WASM (COOP/COEP), and offline behavior (service worker + web app manifest).
//
// This audit complements, but does not replace:
//   - `scripts/audit-browser-compat.mjs`               (module-level runtime classification)
//   - `scripts/audit-browser-dependencies.mjs`          (dependency allowlist / Node builtin denylist)
//   - `scripts/audit-web-bundle.mjs`                    (built bundle budgets + host leakage)
//
// It is the deployment-policy layer: it checks the actual served artifacts
// (`web/index.html`, `web/public/*`, Vite dev/preview/build configuration)
// against a single documented policy, and fails closed if a host-only worker
// or storage module could reach a browser deployment bundle.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_DIST_METADATA = 'dist/.vite/swissknife-bundle-metadata.json';

// ---------------------------------------------------------------------------
// Policy declaration
// ---------------------------------------------------------------------------

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

// Directives that are recommended but do not fail the audit on their own,
// because meta-tag CSP cannot express every hardening directive (for
// example `frame-ancestors` is ignored in a `<meta http-equiv>` CSP by
// specification and must come from the `_headers` file / HTTP response
// instead).
const RECOMMENDED_CSP_DIRECTIVES = ['manifest-src', 'frame-ancestors'];

const HOST_ONLY_WORKER_SPECIFIERS = [
  'worker_threads',
  'node:worker_threads',
  'child_process',
  'node:child_process',
  'fs',
  'node:fs',
  'fs/promises',
  'node:fs/promises',
  'path',
  'node:path',
];

const HOST_ONLY_STORAGE_SPECIFIERS = [
  'fs',
  'node:fs',
  'fs/promises',
  'node:fs/promises',
  'path',
  'node:path',
  'os',
  'node:os',
  'process',
  'node:process',
];

const REQUIRED_ISOLATION_HEADERS = [
  'Cross-Origin-Opener-Policy',
  'Cross-Origin-Embedder-Policy',
];

const REQUIRED_OFFLINE_ARTIFACTS = [
  { path: 'web/public/service-worker.js', label: 'Service worker' },
  { path: 'web/public/manifest.webmanifest', label: 'Web app manifest' },
  { path: 'web/public/offline.html', label: 'Offline fallback page' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function abs(relativePath) {
  return path.resolve(repoRoot, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(abs(relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(abs(relativePath), 'utf8');
}

function readTextIfExists(relativePath) {
  if (!exists(relativePath)) return null;
  return readText(relativePath);
}

function readJsonIfExists(relativePath) {
  const text = readTextIfExists(relativePath);
  if (text === null) return null;
  return JSON.parse(text);
}

function writeText(relativePath, text) {
  const output = abs(relativePath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, text, 'utf8');
}

function writeJson(relativePath, payload) {
  writeText(relativePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function addFinding(findings, finding) {
  findings.push({ severity: 'finding', fail: false, ...finding });
}

function addFailure(findings, finding) {
  findings.push({ severity: 'violation', fail: true, ...finding });
}

function containsSpecifier(source, specifiers) {
  return specifiers.filter(specifier => {
    const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
      `(?:from|require\\s*\\(|import\\s*\\()\\s*["']${escaped}["']`,
    );
    return re.test(source);
  });
}

// ---------------------------------------------------------------------------
// CSP policy
// ---------------------------------------------------------------------------

function auditCsp(findings) {
  const entryHtmlPath = 'web/index.html';
  const html = readTextIfExists(entryHtmlPath);
  const result = {
    entry: entryHtmlPath,
    present: false,
    content: null,
    directives: {},
    missingRequired: [],
    missingRecommended: [],
    manifestLinked: false,
    serviceWorkerRegistered: false,
  };

  if (html === null) {
    addFailure(findings, {
      area: 'csp',
      file: entryHtmlPath,
      message: 'Web entry HTML is missing; no Content-Security-Policy can be enforced.',
    });
    return result;
  }

  const metaTagMatch = html.match(/<meta[^>]*http-equiv=(["'])Content-Security-Policy\1[^>]*>/i);
  if (!metaTagMatch) {
    addFailure(findings, {
      area: 'csp',
      file: entryHtmlPath,
      message: 'No <meta http-equiv="Content-Security-Policy"> tag found in the web entry HTML.',
    });
    return result;
  }

  const contentAttrMatch = metaTagMatch[0].match(/\scontent=(["'])([\s\S]*?)\1/i);
  if (!contentAttrMatch) {
    addFailure(findings, {
      area: 'csp',
      file: entryHtmlPath,
      message: 'Content-Security-Policy <meta> tag is missing a "content" attribute.',
    });
    return result;
  }

  result.present = true;
  result.content = contentAttrMatch[2];

  const directivePattern = /([a-z-]+)\s+([^;]*)/gi;
  let directiveMatch;
  while ((directiveMatch = directivePattern.exec(result.content))) {
    result.directives[directiveMatch[1].toLowerCase()] = directiveMatch[2].trim();
  }

  for (const directive of REQUIRED_CSP_DIRECTIVES) {
    if (!(directive in result.directives)) {
      result.missingRequired.push(directive);
      addFailure(findings, {
        area: 'csp',
        file: entryHtmlPath,
        message: `Content-Security-Policy is missing the required "${directive}" directive.`,
      });
    }
  }

  for (const directive of RECOMMENDED_CSP_DIRECTIVES) {
    if (!(directive in result.directives)) {
      result.missingRecommended.push(directive);
      addFinding(findings, {
        area: 'csp',
        file: entryHtmlPath,
        message: `Content-Security-Policy meta tag does not set "${directive}" (recommended; enforce via web/public/_headers for full effect).`,
      });
    }
  }

  const workerSrc = result.directives['worker-src'] || result.directives['default-src'] || '';
  if (!/'self'/.test(workerSrc)) {
    addFailure(findings, {
      area: 'csp',
      file: entryHtmlPath,
      message: '"worker-src" (or "default-src" fallback) must allow \'self\' so same-origin Web Workers and the service worker can load.',
    });
  }

  result.manifestLinked = /<link\s+rel=["']manifest["']\s+href=["'][^"']+["']/i.test(html);
  if (!result.manifestLinked) {
    addFailure(findings, {
      area: 'offline',
      file: entryHtmlPath,
      message: 'Web entry HTML does not link a <link rel="manifest"> web app manifest.',
    });
  }

  result.serviceWorkerRegistered = /navigator\.serviceWorker\.register\s*\(/.test(html);
  if (!result.serviceWorkerRegistered) {
    addFailure(findings, {
      area: 'offline',
      file: entryHtmlPath,
      message: 'Web entry HTML does not register a service worker (navigator.serviceWorker.register(...)).',
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Worker deployment policy
// ---------------------------------------------------------------------------

function auditWorkers(findings) {
  const browserPath = 'src/workers/browser.ts';
  const hostPath = 'src/workers/host.ts';
  const workersConfigPath = 'build-tools/configs/vite.workers.config.ts';
  const webConfigPath = 'build-tools/configs/vite.web.config.ts';

  const result = {
    browserEntrypoint: browserPath,
    hostEntrypoint: hostPath,
    browserEntrypointExists: exists(browserPath),
    hostEntrypointExists: exists(hostPath),
    browserEntrypointHostImports: [],
    workersConfigExternalizesHostModules: false,
    webConfigDeniesHostModules: false,
    webConfigUsesEsWorkerFormat: false,
  };

  if (!result.browserEntrypointExists) {
    addFailure(findings, { area: 'workers', file: browserPath, message: 'Browser worker entrypoint is missing.' });
  } else {
    const source = readText(browserPath);
    result.browserEntrypointHostImports = containsSpecifier(source, HOST_ONLY_WORKER_SPECIFIERS);
    for (const specifier of result.browserEntrypointHostImports) {
      addFailure(findings, {
        area: 'workers',
        file: browserPath,
        message: `Browser worker entrypoint imports host-only module "${specifier}".`,
      });
    }
  }

  if (!result.hostEntrypointExists) {
    addFinding(findings, {
      area: 'workers',
      file: hostPath,
      message: 'Host worker entrypoint is missing (informational: nothing to keep out of the browser bundle).',
    });
  }

  const workersConfig = readTextIfExists(workersConfigPath);
  if (workersConfig === null) {
    addFailure(findings, {
      area: 'workers',
      file: workersConfigPath,
      message: 'Dedicated browser worker Vite build config is missing.',
    });
  } else {
    const externalized = HOST_ONLY_WORKER_SPECIFIERS.every(specifier => workersConfig.includes(`'${specifier}'`) || workersConfig.includes(`"${specifier}"`));
    result.workersConfigExternalizesHostModules = externalized;
    if (!externalized) {
      addFailure(findings, {
        area: 'workers',
        file: workersConfigPath,
        message: 'Worker build config does not externalize every host-only worker module (worker_threads, child_process, fs, path, os).',
      });
    }
    const entryBlockMatch = workersConfig.match(/entry:\s*\{([^}]*)\}/is);
    const entryBlockReferencesHost = Boolean(entryBlockMatch && /workers\/host(?:\.ts)?['"]/.test(entryBlockMatch[1]));
    if (entryBlockReferencesHost) {
      addFailure(findings, {
        area: 'workers',
        file: workersConfigPath,
        message: 'Worker build config references the host worker entrypoint as a build entry.',
      });
    }
  }

  const webConfig = readTextIfExists(webConfigPath);
  if (webConfig !== null) {
    result.webConfigDeniesHostModules = HOST_ONLY_WORKER_SPECIFIERS
      .filter(specifier => specifier !== 'path') // 'path' is polyfilled for legacy modules, not denied, in vite.web.config.ts
      .every(specifier => webConfig.includes(`'${specifier}'`) || webConfig.includes(`"${specifier}"`));
    result.webConfigUsesEsWorkerFormat = /worker\s*:\s*\{[^}]*format\s*:\s*['"]es['"]/s.test(webConfig);
    if (!result.webConfigUsesEsWorkerFormat) {
      addFinding(findings, {
        area: 'workers',
        file: webConfigPath,
        message: 'Web Vite config does not pin worker.format to "es"; dynamically constructed workers may fall back to classic script workers.',
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Storage deployment policy
// ---------------------------------------------------------------------------

function auditStorage(findings) {
  const browserPath = 'src/storage/browser.ts';
  const hostPath = 'src/storage/host.ts';

  const result = {
    browserEntrypoint: browserPath,
    hostEntrypoint: hostPath,
    browserEntrypointExists: exists(browserPath),
    hostEntrypointExists: exists(hostPath),
    browserEntrypointHostImports: [],
    usesIndexedDb: false,
    usesOpfs: false,
    usesCacheStorage: false,
  };

  if (!result.browserEntrypointExists) {
    addFailure(findings, { area: 'storage', file: browserPath, message: 'Browser storage entrypoint is missing.' });
    return result;
  }

  const source = readText(browserPath);
  result.browserEntrypointHostImports = containsSpecifier(source, HOST_ONLY_STORAGE_SPECIFIERS);
  for (const specifier of result.browserEntrypointHostImports) {
    addFailure(findings, {
      area: 'storage',
      file: browserPath,
      message: `Browser storage entrypoint imports host-only module "${specifier}".`,
    });
  }

  result.usesIndexedDb = /\bindexedDB\b/.test(source);
  result.usesOpfs = /navigator\.storage\.getDirectory\s*\(/.test(source);
  result.usesCacheStorage = /\bcaches\.(?:open|match|delete|keys)\s*\(/.test(source);

  if (!result.usesIndexedDb) {
    addFailure(findings, { area: 'storage', file: browserPath, message: 'Browser storage entrypoint does not use IndexedDB.' });
  }
  if (!result.usesOpfs) {
    addFailure(findings, { area: 'storage', file: browserPath, message: 'Browser storage entrypoint does not use the Origin Private File System (navigator.storage.getDirectory()).' });
  }
  if (!result.usesCacheStorage) {
    addFailure(findings, { area: 'storage', file: browserPath, message: 'Browser storage entrypoint does not use the Cache Storage API.' });
  }

  if (!result.hostEntrypointExists) {
    addFinding(findings, {
      area: 'storage',
      file: hostPath,
      message: 'Host storage entrypoint is missing (informational: nothing to keep out of the browser bundle).',
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// WASM isolation policy (COOP/COEP for SharedArrayBuffer / threaded WASM)
// ---------------------------------------------------------------------------

function auditWasmIsolation(findings) {
  const webConfigPath = 'build-tools/configs/vite.web.config.ts';
  const headersPath = 'web/public/_headers';

  const result = {
    devServerHeaders: [],
    previewServerHeaders: [],
    deploymentHeadersFile: headersPath,
    deploymentHeadersFileExists: exists(headersPath),
    deploymentHeadersPresent: [],
  };

  const webConfig = readTextIfExists(webConfigPath);
  if (webConfig === null) {
    addFailure(findings, { area: 'wasm-isolation', file: webConfigPath, message: 'Web Vite config is missing.' });
  } else {
    for (const header of REQUIRED_ISOLATION_HEADERS) {
      if (webConfig.includes(header)) result.devServerHeaders.push(header);
    }
    if (result.devServerHeaders.length !== REQUIRED_ISOLATION_HEADERS.length) {
      addFailure(findings, {
        area: 'wasm-isolation',
        file: webConfigPath,
        message: `Vite dev/preview config does not configure all cross-origin isolation headers: ${REQUIRED_ISOLATION_HEADERS.join(', ')}.`,
      });
    }
    result.previewServerHeaders = result.devServerHeaders;
  }

  if (!result.deploymentHeadersFileExists) {
    addFailure(findings, {
      area: 'wasm-isolation',
      file: headersPath,
      message: 'No deployment `_headers` file found for cross-origin isolation / CSP on static hosting.',
    });
  } else {
    const headersText = readText(headersPath);
    for (const header of REQUIRED_ISOLATION_HEADERS) {
      if (headersText.includes(header)) result.deploymentHeadersPresent.push(header);
    }
    if (result.deploymentHeadersPresent.length !== REQUIRED_ISOLATION_HEADERS.length) {
      addFailure(findings, {
        area: 'wasm-isolation',
        file: headersPath,
        message: `Deployment headers file does not set all cross-origin isolation headers: ${REQUIRED_ISOLATION_HEADERS.join(', ')}.`,
      });
    }
    if (!headersText.includes('Content-Security-Policy')) {
      addFailure(findings, {
        area: 'wasm-isolation',
        file: headersPath,
        message: 'Deployment headers file does not set a Content-Security-Policy header.',
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Offline mode policy
// ---------------------------------------------------------------------------

function auditOffline(findings) {
  const result = {
    artifacts: [],
    serviceWorkerHostImports: [],
    serviceWorkerHasInstall: false,
    serviceWorkerHasFetch: false,
    serviceWorkerHasActivate: false,
    serviceWorkerUsesCacheStorage: false,
  };

  for (const artifact of REQUIRED_OFFLINE_ARTIFACTS) {
    const artifactExists = exists(artifact.path);
    result.artifacts.push({ ...artifact, exists: artifactExists });
    if (!artifactExists) {
      addFailure(findings, {
        area: 'offline',
        file: artifact.path,
        message: `${artifact.label} is missing from the deployment public assets.`,
      });
    }
  }

  const swPath = 'web/public/service-worker.js';
  const swSource = readTextIfExists(swPath);
  if (swSource !== null) {
    result.serviceWorkerHostImports = containsSpecifier(swSource, HOST_ONLY_STORAGE_SPECIFIERS);
    for (const specifier of result.serviceWorkerHostImports) {
      addFailure(findings, {
        area: 'offline',
        file: swPath,
        message: `Service worker imports host-only module "${specifier}"; ServiceWorkerGlobalScope cannot load Node built-ins.`,
      });
    }
    result.serviceWorkerHasInstall = /addEventListener\s*\(\s*['"]install['"]/.test(swSource);
    result.serviceWorkerHasFetch = /addEventListener\s*\(\s*['"]fetch['"]/.test(swSource);
    result.serviceWorkerHasActivate = /addEventListener\s*\(\s*['"]activate['"]/.test(swSource);
    result.serviceWorkerUsesCacheStorage = /\bcaches\.(?:open|match|delete|keys)\s*\(/.test(swSource);

    if (!result.serviceWorkerHasInstall || !result.serviceWorkerHasFetch || !result.serviceWorkerHasActivate) {
      addFailure(findings, {
        area: 'offline',
        file: swPath,
        message: 'Service worker does not implement install, fetch, and activate handlers.',
      });
    }
    if (!result.serviceWorkerUsesCacheStorage) {
      addFailure(findings, {
        area: 'offline',
        file: swPath,
        message: 'Service worker does not use the Cache Storage API for offline persistence.',
      });
    }
  }

  const manifestPath = 'web/public/manifest.webmanifest';
  const manifestJson = readJsonIfExists(manifestPath);
  if (manifestJson) {
    for (const field of ['name', 'start_url', 'display', 'icons']) {
      if (!(field in manifestJson)) {
        addFailure(findings, {
          area: 'offline',
          file: manifestPath,
          message: `Web app manifest is missing required field "${field}".`,
        });
      }
    }
  } else if (exists(manifestPath)) {
    addFailure(findings, { area: 'offline', file: manifestPath, message: 'Web app manifest is not valid JSON.' });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Bundle host-leakage (built output, if present)
// ---------------------------------------------------------------------------

function auditBundleHostLeakage(findings, distMetadataPath) {
  const result = {
    metadataPath: distMetadataPath,
    metadataPresent: exists(distMetadataPath),
    hostOnlyModulesInBundle: [],
  };

  if (!result.metadataPresent) return result;

  const metadata = readJsonIfExists(distMetadataPath);
  if (!metadata || !Array.isArray(metadata.chunks)) return result;

  const hostOnlyMarkers = ['src/workers/host', 'src/storage/host'];
  for (const chunk of metadata.chunks) {
    for (const module of chunk.modules ?? []) {
      const id = module.id ?? '';
      for (const marker of hostOnlyMarkers) {
        if (id.includes(marker)) {
          result.hostOnlyModulesInBundle.push({ chunk: chunk.fileName, module: id });
          addFailure(findings, {
            area: 'bundle-host-leakage',
            file: chunk.fileName,
            message: `Browser bundle chunk includes host-only module "${id}".`,
          });
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Audit orchestration
// ---------------------------------------------------------------------------

function runAudit(options) {
  const findings = [];

  const csp = auditCsp(findings);
  const workers = auditWorkers(findings);
  const storage = auditStorage(findings);
  const wasmIsolation = auditWasmIsolation(findings);
  const offline = auditOffline(findings);
  const bundleHostLeakage = auditBundleHostLeakage(findings, options.distMetadata);

  const violations = findings.filter(finding => finding.fail);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    package: readJsonIfExists('package.json')?.name ?? 'swissknife',
    version: readJsonIfExists('package.json')?.version ?? '0.0.0',
    csp,
    workers,
    storage,
    wasmIsolation,
    offline,
    bundleHostLeakage,
    findings,
    summary: {
      findings: findings.length,
      violations: violations.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

function renderReport(audit) {
  const lines = [];
  lines.push('# Browser Deployment Policy');
  lines.push('');
  lines.push(
    'Generated by `node scripts/audit-browser-deployment-policy.mjs --report docs/browser-deployment-policy.md`.',
  );
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push(
    '- Content-Security-Policy for the served web entry (`web/index.html`) and the deployment `_headers` file.',
  );
  lines.push(
    '- Worker creation: only `src/workers/browser.ts` (Web Worker APIs) may reach a browser deployment bundle; `src/workers/host.ts` (`worker_threads`/`child_process`) is host-only.',
  );
  lines.push(
    '- Storage APIs: only `src/storage/browser.ts` (IndexedDB, OPFS, Cache Storage, injected IPFS) may reach a browser deployment bundle; `src/storage/host.ts` (Node `fs`/`path`/`os`) is host-only.',
  );
  lines.push(
    '- WASM isolation: cross-origin isolation headers (`Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`) required for `SharedArrayBuffer` and multi-threaded WASM.',
  );
  lines.push(
    '- Offline behavior: service worker, web app manifest, and offline fallback page required for the browser deployment to keep working without a network connection.',
  );
  lines.push(
    '- Built bundle host-leakage: when `dist/.vite/swissknife-bundle-metadata.json` exists, verifies no chunk pulls in `src/workers/host.ts` or `src/storage/host.ts`.',
  );
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(`- Package: \`${audit.package}@${audit.version}\``);
  lines.push(`- CSP present: ${audit.csp.present ? 'yes' : 'no'}`);
  lines.push(`- CSP missing required directives: ${audit.csp.missingRequired.length}`);
  lines.push(`- Manifest linked from web entry: ${audit.csp.manifestLinked ? 'yes' : 'no'}`);
  lines.push(`- Service worker registered from web entry: ${audit.csp.serviceWorkerRegistered ? 'yes' : 'no'}`);
  lines.push(`- Browser worker entrypoint host-only imports: ${audit.workers.browserEntrypointHostImports.length}`);
  lines.push(`- Browser storage entrypoint host-only imports: ${audit.storage.browserEntrypointHostImports.length}`);
  lines.push(`- Storage uses IndexedDB / OPFS / Cache Storage: ${audit.storage.usesIndexedDb ? 'yes' : 'no'} / ${audit.storage.usesOpfs ? 'yes' : 'no'} / ${audit.storage.usesCacheStorage ? 'yes' : 'no'}`);
  lines.push(`- Cross-origin isolation headers (dev/preview): ${audit.wasmIsolation.devServerHeaders.length}/${REQUIRED_ISOLATION_HEADERS.length}`);
  lines.push(`- Cross-origin isolation headers (deployment \`_headers\`): ${audit.wasmIsolation.deploymentHeadersPresent.length}/${REQUIRED_ISOLATION_HEADERS.length}`);
  lines.push(`- Offline artifacts present: ${audit.offline.artifacts.filter(a => a.exists).length}/${audit.offline.artifacts.length}`);
  lines.push(`- Bundle metadata present: ${audit.bundleHostLeakage.metadataPresent ? 'yes' : 'no'}`);
  lines.push(`- Host-only modules found in built bundle: ${audit.bundleHostLeakage.hostOnlyModulesInBundle.length}`);
  lines.push(`- Findings: ${audit.summary.findings} (${audit.summary.violations} violation(s))`);
  lines.push('');

  lines.push('## Content-Security-Policy');
  lines.push('');
  lines.push(`Entry: \`${audit.csp.entry}\``);
  lines.push('');
  if (audit.csp.content) {
    lines.push('```');
    lines.push(audit.csp.content);
    lines.push('```');
    lines.push('');
    lines.push('| Directive | Required | Present | Value |');
    lines.push('| --- | --- | --- | --- |');
    const allDirectives = Array.from(new Set([
      ...REQUIRED_CSP_DIRECTIVES,
      ...RECOMMENDED_CSP_DIRECTIVES,
      ...Object.keys(audit.csp.directives),
    ])).sort();
    for (const directive of allDirectives) {
      const required = REQUIRED_CSP_DIRECTIVES.includes(directive) ? 'yes' : (RECOMMENDED_CSP_DIRECTIVES.includes(directive) ? 'recommended' : 'no');
      const present = directive in audit.csp.directives ? 'yes' : 'no';
      const value = audit.csp.directives[directive] ? `\`${audit.csp.directives[directive]}\`` : '';
      lines.push(`| \`${directive}\` | ${required} | ${present} | ${value} |`);
    }
  } else {
    lines.push('No Content-Security-Policy meta tag found.');
  }
  lines.push('');
  lines.push(
    'Directives such as `frame-ancestors` are ignored by browsers when set via `<meta http-equiv>` and must be delivered as a real HTTP response header; see `web/public/_headers` and the WASM Isolation section below.',
  );
  lines.push('');

  lines.push('## Worker Deployment Policy');
  lines.push('');
  lines.push(`- Browser worker entrypoint: \`${audit.workers.browserEntrypoint}\` (exists: ${audit.workers.browserEntrypointExists ? 'yes' : 'no'})`);
  lines.push(`- Host worker entrypoint: \`${audit.workers.hostEntrypoint}\` (exists: ${audit.workers.hostEntrypointExists ? 'yes' : 'no'}, host-only, never bundled for the browser)`);
  lines.push(`- Browser entrypoint host-only imports found: ${audit.workers.browserEntrypointHostImports.length}`);
  lines.push(`- \`build-tools/configs/vite.workers.config.ts\` externalizes all host-only worker modules: ${audit.workers.workersConfigExternalizesHostModules ? 'yes' : 'no'}`);
  lines.push(`- \`build-tools/configs/vite.web.config.ts\` denies host-only worker module imports at resolve time: ${audit.workers.webConfigDeniesHostModules ? 'yes' : 'no'}`);
  lines.push(`- \`build-tools/configs/vite.web.config.ts\` pins \`worker.format\` to \`es\`: ${audit.workers.webConfigUsesEsWorkerFormat ? 'yes' : 'no'}`);
  lines.push('');
  lines.push(
    'Browser code must reach worker execution only through `src/workers/browser.ts` (`Worker`/`SharedWorker` construction, `postMessage`/transferables). Node\'s `worker_threads`, subprocess, and filesystem-backed worker resolution in `src/workers/host.ts` is host-only.',
  );
  lines.push('');

  lines.push('## Storage Deployment Policy');
  lines.push('');
  lines.push(`- Browser storage entrypoint: \`${audit.storage.browserEntrypoint}\` (exists: ${audit.storage.browserEntrypointExists ? 'yes' : 'no'})`);
  lines.push(`- Host storage entrypoint: \`${audit.storage.hostEntrypoint}\` (exists: ${audit.storage.hostEntrypointExists ? 'yes' : 'no'}, host-only, never bundled for the browser)`);
  lines.push(`- Browser entrypoint host-only imports found: ${audit.storage.browserEntrypointHostImports.length}`);
  lines.push(`- Uses IndexedDB: ${audit.storage.usesIndexedDb ? 'yes' : 'no'}`);
  lines.push(`- Uses OPFS (\`navigator.storage.getDirectory()\`): ${audit.storage.usesOpfs ? 'yes' : 'no'}`);
  lines.push(`- Uses Cache Storage API: ${audit.storage.usesCacheStorage ? 'yes' : 'no'}`);
  lines.push('');
  lines.push(
    'Browser code must reach persistent storage only through `src/storage/browser.ts` (IndexedDB, OPFS, Cache Storage, or an explicitly injected IPFS transport). Node\'s filesystem, `path`, and process-driven storage in `src/storage/host.ts` is host-only.',
  );
  lines.push('');

  lines.push('## WASM Isolation Policy (COOP/COEP)');
  lines.push('');
  lines.push(
    '`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` opt the page into cross-origin isolation, which gates access to `SharedArrayBuffer` and multi-threaded WASM used by the browser ZKP/theorem-proving stack (`src/services/zkp`). These headers cannot be set via a `<meta>` tag; they must be real HTTP response headers from the dev server, the preview server, and the production host.',
  );
  lines.push('');
  lines.push(`- Vite dev/preview headers configured: ${audit.wasmIsolation.devServerHeaders.join(', ') || 'none'}`);
  lines.push(`- Deployment \`_headers\` file: \`${audit.wasmIsolation.deploymentHeadersFile}\` (exists: ${audit.wasmIsolation.deploymentHeadersFileExists ? 'yes' : 'no'})`);
  lines.push(`- Deployment headers configured: ${audit.wasmIsolation.deploymentHeadersPresent.join(', ') || 'none'}`);
  lines.push('');
  lines.push('### Hosting equivalents');
  lines.push('');
  lines.push('Static hosts that do not read a `_headers` file (Netlify/Cloudflare Pages format) must reproduce the same headers at the server/CDN layer:');
  lines.push('');
  lines.push('- **Vercel**: add a `headers` array to `vercel.json` with the same header/value pairs as `web/public/_headers`.');
  lines.push('- **nginx**: `add_header Cross-Origin-Opener-Policy same-origin always;` and `add_header Cross-Origin-Embedder-Policy require-corp always;` in the `server`/`location` block serving `dist/`.');
  lines.push('- **Apache**: `Header always set Cross-Origin-Opener-Policy "same-origin"` and `Header always set Cross-Origin-Embedder-Policy "require-corp"` in `.htaccess` or the vhost config.');
  lines.push('- **Cloudflare Workers / custom Express static servers**: set the same headers explicitly on every response, including cached ones.');
  lines.push('');
  lines.push(
    'WASM asset integrity (byte length + SHA-256 manifest metadata) is tracked separately by the browser ZKP artifact registry; see `docs/browser-zkp-artifacts.md`.',
  );
  lines.push('');

  lines.push('## Offline Mode Policy');
  lines.push('');
  lines.push('| Artifact | Path | Present |');
  lines.push('| --- | --- | --- |');
  for (const artifact of audit.offline.artifacts) {
    lines.push(`| ${artifact.label} | \`${artifact.path}\` | ${artifact.exists ? 'yes' : 'no'} |`);
  }
  lines.push('');
  lines.push(`- Service worker \`install\`/\`fetch\`/\`activate\` handlers present: ${audit.offline.serviceWorkerHasInstall && audit.offline.serviceWorkerHasFetch && audit.offline.serviceWorkerHasActivate ? 'yes' : 'no'}`);
  lines.push(`- Service worker uses Cache Storage API: ${audit.offline.serviceWorkerUsesCacheStorage ? 'yes' : 'no'}`);
  lines.push(`- Service worker host-only imports found: ${audit.offline.serviceWorkerHostImports.length}`);
  lines.push('');
  lines.push('Strategy (see `web/public/service-worker.js` for the implementation):');
  lines.push('');
  lines.push('- Navigation requests: network-first, falling back to the cached app shell and finally to `/offline.html`.');
  lines.push('- Same-origin static asset requests (script/style/image/font/worker): stale-while-revalidate against a runtime Cache Storage bucket.');
  lines.push('- Everything else (cross-origin requests, non-GET requests, IPFS gateway traffic): left entirely to the network so the service worker never intercepts non-idempotent requests or MCP/IPFS traffic with its own retry policy.');
  lines.push('- A minimal, author-maintained app shell precache list is used instead of a hashed-filename precache manifest, since this deployment has no separate PWA build step.');
  lines.push('');

  lines.push('## Bundle Host-Leakage Check');
  lines.push('');
  lines.push(`Metadata: \`${audit.bundleHostLeakage.metadataPath}\` (present: ${audit.bundleHostLeakage.metadataPresent ? 'yes' : 'no'})`);
  lines.push('');
  if (!audit.bundleHostLeakage.metadataPresent) {
    lines.push('No built bundle metadata found; run `npm run build:web` first for a build-time host-leakage check.');
  } else if (audit.bundleHostLeakage.hostOnlyModulesInBundle.length === 0) {
    lines.push('No host-only worker or storage modules found in the built browser bundle.');
  } else {
    lines.push('| Chunk | Module |');
    lines.push('| --- | --- |');
    for (const entry of audit.bundleHostLeakage.hostOnlyModulesInBundle) {
      lines.push(`| \`${entry.chunk}\` | \`${entry.module}\` |`);
    }
  }
  lines.push('');

  lines.push('## Findings');
  lines.push('');
  if (audit.findings.length === 0) {
    lines.push('No browser deployment policy findings.');
  } else {
    lines.push('| Severity | Area | File | Message |');
    lines.push('| --- | --- | --- | --- |');
    for (const finding of audit.findings) {
      lines.push(`| ${finding.severity} | ${finding.area} | \`${finding.file}\` | ${finding.message} |`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage() {
  return [
    'Usage: node scripts/audit-browser-deployment-policy.mjs [options]',
    '',
    'Options:',
    '  --report <path>                    Write a Markdown deployment policy report.',
    '  --json <path>                       Write the audit payload as deterministic JSON.',
    '  --dist-metadata <path>              Vite bundle metadata path. Default: dist/.vite/swissknife-bundle-metadata.json.',
    '  --fail-on-missing-csp               Exit non-zero when the required CSP directives are missing.',
    '  --fail-on-host-worker-leakage       Exit non-zero when a host-only module reaches a worker entrypoint or build.',
    '  --fail-on-host-storage-leakage      Exit non-zero when a host-only module reaches the storage entrypoint.',
    '  --fail-on-missing-isolation-headers Exit non-zero when COOP/COEP headers are missing from dev/preview/deployment config.',
    '  --fail-on-missing-offline           Exit non-zero when offline artifacts (service worker/manifest/offline page) are missing.',
    '  --fail-on-findings                  Exit non-zero on any violation, regardless of category.',
    '  --help, -h                          Show this help text.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    report: null,
    json: null,
    distMetadata: DEFAULT_DIST_METADATA,
    failOnMissingCsp: false,
    failOnHostWorkerLeakage: false,
    failOnHostStorageLeakage: false,
    failOnMissingIsolationHeaders: false,
    failOnMissingOffline: false,
    failOnFindings: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--report') {
      args.report = argv[++i];
      if (!args.report) throw new Error('--report requires an output path');
    } else if (arg === '--json') {
      args.json = argv[++i];
      if (!args.json) throw new Error('--json requires an output path');
    } else if (arg === '--dist-metadata') {
      args.distMetadata = argv[++i];
      if (!args.distMetadata) throw new Error('--dist-metadata requires a path');
    } else if (arg === '--fail-on-missing-csp') {
      args.failOnMissingCsp = true;
    } else if (arg === '--fail-on-host-worker-leakage') {
      args.failOnHostWorkerLeakage = true;
    } else if (arg === '--fail-on-host-storage-leakage') {
      args.failOnHostStorageLeakage = true;
    } else if (arg === '--fail-on-missing-isolation-headers') {
      args.failOnMissingIsolationHeaders = true;
    } else if (arg === '--fail-on-missing-offline') {
      args.failOnMissingOffline = true;
    } else if (arg === '--fail-on-findings') {
      args.failOnFindings = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function shouldFail(audit, args) {
  if (args.failOnFindings && audit.summary.violations > 0) return true;
  const byArea = area => audit.findings.some(finding => finding.fail && finding.area === area);
  if (args.failOnMissingCsp && byArea('csp')) return true;
  if (args.failOnHostWorkerLeakage && (byArea('workers') || byArea('bundle-host-leakage'))) return true;
  if (args.failOnHostStorageLeakage && (byArea('storage') || byArea('bundle-host-leakage'))) return true;
  if (args.failOnMissingIsolationHeaders && byArea('wasm-isolation')) return true;
  if (args.failOnMissingOffline && byArea('offline')) return true;
  return false;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const audit = runAudit(args);

  if (args.report) {
    writeText(args.report, renderReport(audit));
  }
  if (args.json) {
    writeJson(args.json, audit);
  }

  if (shouldFail(audit, args)) {
    console.error(`Browser deployment policy audit failed with ${audit.summary.violations} violation(s).`);
    for (const finding of audit.findings.filter(f => f.fail).slice(0, 20)) {
      console.error(`- [${finding.area}] ${finding.file}: ${finding.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Browser deployment policy audit: ${audit.summary.findings} finding(s), ${audit.summary.violations} violation(s).`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
