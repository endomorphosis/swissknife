import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = process.env.SWISSKNIFE_REPO_ROOT ?? path.resolve(__dirname, '../../..');

const HOST_NODE_BUILTINS = new Set([
  'child_process',
  'cluster',
  'dgram',
  'dns',
  'fs',
  'fs/promises',
  'module',
  'net',
  'node:test',
  'perf_hooks',
  'readline',
  'readline/promises',
  'repl',
  'tls',
  'tty',
  'v8',
  'vm',
  'worker_threads',
]);

const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map(name => name.replace(/^node:/, '')),
]);

const FORBIDDEN_PACKAGES = new Map([
  ['@anthropic-ai/bedrock-sdk', 'host Bedrock credential resolution'],
  ['@anthropic-ai/claude-code', 'host CLI runtime'],
  ['@anthropic-ai/vertex-sdk', 'host Vertex credential resolution'],
  ['@img/sharp-darwin-arm64', 'native binary package'],
  ['@img/sharp-darwin-x64', 'native binary package'],
  ['@img/sharp-linux-arm', 'native binary package'],
  ['@img/sharp-linux-arm64', 'native binary package'],
  ['@img/sharp-linux-x64', 'native binary package'],
  ['@img/sharp-win32-x64', 'native binary package'],
  ['@inkjs/ui', 'terminal UI package'],
  ['@sentry/node', 'Node-only telemetry SDK'],
  ['ansi-escapes', 'terminal control package'],
  ['chalk', 'terminal color package'],
  ['cli-highlight', 'terminal highlighting package'],
  ['cli-table3', 'terminal table package'],
  ['figures', 'terminal symbol package'],
  ['glob', 'filesystem traversal package'],
  ['ink', 'terminal UI package'],
  ['ink-link', 'terminal UI package'],
  ['ora', 'terminal spinner package'],
  ['pyodide', 'Python runtime package'],
  ['sharp', 'native binary package'],
  ['spawn-rx', 'subprocess wrapper package'],
]);

const OPTIONAL_BROWSER_PROTOCOL_PACKAGES = new Set([
  '@chainsafe/libp2p-gossipsub',
  '@chainsafe/libp2p-noise',
  '@chainsafe/libp2p-yamux',
  '@libp2p/circuit-relay-v2',
  '@libp2p/gossipsub',
  '@libp2p/identify',
  '@libp2p/webrtc',
  '@libp2p/websockets',
  'libp2p',
]);

const HOST_SOURCE_PATTERNS = [
  [/\/cli\.mjs$/, 'host CLI binary entrypoint'],
  [/\/src\/cli(?:\/|\.tsx?$)/, 'host CLI implementation'],
  [/\/src\/commands(?:\/|\.tsx?$)/, 'host command implementation'],
  [/\/src\/command-registry\.tsx?$/, 'host command registry'],
  [/\/src\/entrypoints\//, 'host process entrypoint'],
  [/\/src\/platform\/host\.tsx?$/, 'host platform adapter'],
  [/\/src\/ai\/host\.tsx?$/, 'host AI adapter'],
  [/\/src\/models\/host\.tsx?$/, 'host model adapter'],
  [/\/src\/storage\/host\.tsx?$/, 'host storage adapter'],
  [/\/src\/workers\/host\.tsx?$/, 'host worker adapter'],
  [/\/src\/storage\/(?:backends\/filesystem|local\/file-storage)\.tsx?$/, 'host filesystem storage backend'],
  [/\/src\/utils\/(?:PersistentShell|execFileNoThrow|file|git|native-loader)\.tsx?$/, 'host filesystem/subprocess utility'],
  [/\/src\/components\/(?!browser\/)/, 'host terminal UI component'],
  [/\/src\/hooks\/(?!browser\/)/, 'host terminal UI hook'],
  [/\/src\/screens\/(?!browser\/)/, 'host terminal UI screen'],
  [/\/src\/workers\/(?:pool|worker-pool|worker-thread|thread|worker)\.tsx?$/, 'Node worker runtime'],
];

const FORBIDDEN_CODE_PATTERNS = [
  ['filesystem API', /\b(?:readFileSync|writeFileSync|createReadStream|createWriteStream|mkdirSync|statSync|readdirSync)\s*\(/],
  ['subprocess API', /(^|[^\w.])(?:spawn|spawnSync|exec|execFile|execFileSync|execSync)\s*\(/],
  ['native module loader', /(?:["'`][^"'`]+\.node["'`]|\bprocess\.binding\s*\(|\bnative-loader\b|\bloadNativeModule\b)/],
];

function normalizeId(id) {
  return id
    .replace(/\0/g, '')
    .replace(/\\/g, '/')
    .replace(/[?#].*$/, '');
}

function stripNodePrefix(specifier) {
  return specifier.startsWith('node:') ? specifier.slice(5) : specifier;
}

function packageNameForSpecifier(specifier) {
  const normalized = stripNodePrefix(specifier).replace(/[?#].*$/, '');
  if (normalized.startsWith('@')) {
    const [scope, name] = normalized.split('/');
    return scope && name ? `${scope}/${name}` : normalized;
  }
  return normalized.split('/')[0];
}

function packageNameFromId(id) {
  const normalized = normalizeId(id);
  const marker = '/node_modules/';
  const index = normalized.lastIndexOf(marker);
  if (index === -1) return null;
  return packageNameForSpecifier(normalized.slice(index + marker.length));
}

function isSwissknifeModule(id) {
  return normalizeId(id).includes('/node_modules/swissknife/');
}

function shortId(id) {
  const normalized = normalizeId(id);
  const cwd = normalizeId(process.cwd());
  if (normalized.startsWith(`${cwd}/`)) return normalized.slice(cwd.length + 1);
  return normalized;
}

function formatChain(chain) {
  if (!chain.length) return '  <entry>';
  return chain.map((item, index) => {
    const via = item.source ? ` via "${item.source}"` : '';
    return `  ${index + 1}. ${shortId(item.id)}${via}`;
  }).join('\n');
}

function browserPackageConsumerGuard() {
  const parentById = new Map();

  function chainFrom(importer, source) {
    const chain = [];
    if (importer) {
      let current = normalizeId(importer);
      const seen = new Set();
      while (current && !seen.has(current)) {
        seen.add(current);
        const parent = parentById.get(current);
        chain.unshift({
          id: current,
          source: parent?.source,
        });
        current = parent?.importer;
      }
    }
    if (source) {
      chain.push({
        id: source,
        source,
      });
    }
    return chain;
  }

  function fail(message, importer, source) {
    const chain = chainFrom(importer, source);
    this.error(`${message}\nImport chain:\n${formatChain(chain)}`);
  }

  return {
    name: 'swissknife-browser-package-consumer-guard',
    enforce: 'pre',
    resolveId(source, importer) {
      const normalizedSource = stripNodePrefix(source);
      if (HOST_NODE_BUILTINS.has(normalizedSource) || HOST_NODE_BUILTINS.has(source)) {
        fail.call(this, `Host-only Node builtin "${source}" entered the browser package consumer.`, importer, source);
      }

      if (NODE_BUILTINS.has(normalizedSource) && source.startsWith('node:')) {
        fail.call(this, `Node builtin "${source}" is not allowed in this browser-only package consumer.`, importer, source);
      }

      const packageName = packageNameForSpecifier(source);
      const forbiddenReason = FORBIDDEN_PACKAGES.get(packageName);
      if (forbiddenReason) {
        fail.call(this, `Forbidden host-only package "${packageName}" entered the browser package consumer: ${forbiddenReason}.`, importer, source);
      }

      return null;
    },
    moduleParsed(info) {
      const parentImports = [
        ...info.importedIds.map(id => ({
          id,
          source: id,
        })),
        ...info.dynamicallyImportedIds.map(id => ({ id, source: id })),
      ];
      for (const dependency of parentImports) {
        const child = normalizeId(dependency.id);
        if (!parentById.has(child)) {
          parentById.set(child, {
            importer: normalizeId(info.id),
            source: dependency.source,
          });
        }
      }
    },
    generateBundle(_, bundle) {
      const findings = [];
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;

        for (const id of Object.keys(chunk.modules)) {
          const normalized = normalizeId(id);
          const packageName = packageNameFromId(normalized);
          if (packageName && FORBIDDEN_PACKAGES.has(packageName)) {
            findings.push({
              message: `Forbidden host-only package "${packageName}" in ${chunk.fileName}: ${FORBIDDEN_PACKAGES.get(packageName)}.`,
              id: normalized,
            });
          }

          for (const [pattern, reason] of HOST_SOURCE_PATTERNS) {
            if (isSwissknifeModule(normalized) && pattern.test(normalized)) {
              findings.push({
                message: `Host-only SwissKnife source reached package consumer: ${reason}.`,
                id: normalized,
              });
            }
          }
        }

        for (const [label, pattern] of FORBIDDEN_CODE_PATTERNS) {
          if (pattern.test(chunk.code)) {
            findings.push({
              message: `Generated chunk ${chunk.fileName} contains forbidden ${label}.`,
              id: chunk.facadeModuleId ?? chunk.fileName,
            });
          }
        }
      }

      if (findings.length > 0) {
        const evidence = findings.map(finding => {
          const moduleInfo = this.getModuleInfo(finding.id);
          const importers = moduleInfo?.importers ?? [];
          const importer = importers[0] ?? finding.id;
          return `${finding.message}\nImport chain:\n${formatChain(chainFrom(importer, finding.id))}`;
        }).join('\n\n');
        this.error(`SwissKnife browser package consumer found host leakage:\n\n${evidence}`);
      }
    },
  };
}

function optionalBrowserProtocolDependencyStubs() {
  return {
    name: 'swissknife-browser-package-consumer-optional-protocol-stubs',
    enforce: 'pre',
    resolveId(source) {
      if (OPTIONAL_BROWSER_PROTOCOL_PACKAGES.has(source)) {
        return `\0swissknife-optional-browser-protocol:${source}`;
      }
      return null;
    },
    load(id) {
      if (id.startsWith('\0swissknife-optional-browser-protocol:')) {
        const packageName = id.slice('\0swissknife-optional-browser-protocol:'.length);
        return [
          `export const __swissknifeOptionalBrowserProtocolPackage = ${JSON.stringify(packageName)};`,
          'export default Object.freeze({});',
        ].join('\n');
      }
      return null;
    },
  };
}

export default defineConfig({
  root: process.cwd(),
  base: './',
  plugins: [
    browserPackageConsumerGuard(),
    optionalBrowserProtocolDependencyStubs(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    minify: false,
    sourcemap: false,
    target: 'es2020',
  },
  resolve: {
    alias: {
      react: path.resolve(repoRoot, 'node_modules/react'),
      'react/jsx-runtime': path.resolve(repoRoot, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(repoRoot, 'node_modules/react/jsx-dev-runtime.js'),
    },
    conditions: ['browser', 'module', 'import', 'default'],
    mainFields: ['browser', 'module', 'jsnext:main', 'jsnext'],
  },
  define: {
    global: 'globalThis',
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});
