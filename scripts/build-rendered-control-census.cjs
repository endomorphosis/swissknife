#!/usr/bin/env node
'use strict';

/**
 * Render the virtual desktop, launch every manifest app, and write a census of
 * the controls that are actually in the rendered tree.
 *
 * Schema: swissknife.rendered-control-census.v1
 * Output: test-results/virtual-desktop-ipfs-mcp-orb/vog/rendered-control-census.json
 *
 * Tool buttons are never clicked. App source and main-simple.js are read only.
 * Each record stores app_id, launch_id, selector, role, and accessible_name.
 * source_template and clicked are false. Selectors that still contain ${ or
 * escapeHTML after render are rejected.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA = 'swissknife.rendered-control-census.v1';

const PREFERRED_MANIFESTS = [
  'apps/manifest.json',
  'manifest.json',
  'apps.json',
  'src/apps/manifest.json',
  'src/manifest.json',
  'src/apps.json',
  'public/apps/manifest.json',
  'public/manifest.json',
  'public/apps.json',
  'web/apps/manifest.json',
  'web/manifest.json',
  'web/apps.json',
  'desktop/manifest.json',
  'desktop/apps.json',
  'virtual-desktop/manifest.json',
  'virtual-desktop/apps/manifest.json',
  'virtual-desktop/apps.json',
  'virtual-desktop-ipfs-mcp-orb/manifest.json',
  'virtual-desktop-ipfs-mcp-orb/apps/manifest.json',
  'virtual-desktop-ipfs-mcp-orb/apps.json',
  'config/manifest.json',
  'config/apps.json',
  'data/manifest.json',
  'data/apps.json',
  'static/manifest.json',
  'static/apps.json',
];

const PREFERRED_SHELLS = [
  'index.html',
  'src/index.html',
  'public/index.html',
  'web/index.html',
  'desktop/index.html',
  'desktop.html',
  'virtual-desktop/index.html',
  'virtual-desktop.html',
  'app/index.html',
];

const PREFERRED_MAIN = [
  'main-simple.js',
  'src/main-simple.js',
  'public/main-simple.js',
  'js/main-simple.js',
  'scripts/main-simple.js',
  'web/main-simple.js',
  'desktop/main-simple.js',
  'virtual-desktop/main-simple.js',
];

const APP_ROOTS = [
  'apps',
  'applications',
  'src/apps',
  'public/apps',
  'web/apps',
  'desktop/apps',
  'virtual-desktop/apps',
  'virtual-desktop-ipfs-mcp-orb/apps',
  'packages',
];

const VOID_TAGS = {
  area: true,
  base: true,
  br: true,
  col: true,
  embed: true,
  hr: true,
  img: true,
  input: true,
  link: true,
  meta: true,
  param: true,
  source: true,
  track: true,
  wbr: true,
};

const RAW_TEXT_TAGS = {
  script: true,
  style: true,
  textarea: true,
  title: true,
};

const INPUT_ROLES = {
  button: 'button',
  submit: 'button',
  reset: 'button',
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  number: 'spinbutton',
  search: 'searchbox',
  email: 'textbox',
  tel: 'textbox',
  text: 'textbox',
  password: 'textbox',
  url: 'textbox',
  date: 'textbox',
  time: 'textbox',
  datetime: 'textbox',
  'datetime-local': 'textbox',
  month: 'textbox',
  week: 'textbox',
  color: 'textbox',
  file: 'button',
  image: 'button',
};

const CONTROL_ROLES = {
  button: true,
  link: true,
  textbox: true,
  checkbox: true,
  radio: true,
  switch: true,
  tab: true,
  menuitem: true,
  option: true,
  combobox: true,
  listbox: true,
  slider: true,
  spinbutton: true,
  searchbox: true,
  menuitemcheckbox: true,
  menuitemradio: true,
  treeitem: true,
};

const SKIP_DIRS = {
  node_modules: true,
  '.git': true,
  'test-results': true,
  coverage: true,
  '.grok': true,
};

function defaultOutPath(root) {
  return path.join(
    root,
    'test-results',
    'virtual-desktop-ipfs-mcp-orb',
    'vog',
    'rendered-control-census.json'
  );
}

function selectorRejected(selector) {
  const value = String(selector == null ? '' : selector);
  return value.length === 0 || value.indexOf('${') !== -1 || value.indexOf('escapeHTML') !== -1;
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHTML(value);
}

function decodeEntities(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, '&');
}

function norm(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isCssIdent(value) {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(value);
}

function readFileIfSmall(filePath, maxBytes) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    let text = fs.readFileSync(filePath, 'utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return text;
  } catch (err) {
    return null;
  }
}

function readJson(filePath) {
  const text = readFileIfSmall(filePath, 5000000);
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function walkFiles(dir, visitor) {
  const stack = [dir];
  let seen = 0;
  while (stack.length && seen < 8000) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (err) {
      continue;
    }
    for (let i = 0; i < entries.length; i++) {
      const ent = entries[i];
      if (SKIP_DIRS[ent.name]) continue;
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.isFile()) {
        seen += 1;
        if (visitor(full) === true) return;
      }
    }
  }
}

function isInsideRoot(root, filePath) {
  const rel = path.relative(root, filePath);
  return rel === '' || (rel.indexOf('..') !== 0 && !path.isAbsolute(rel));
}

function resolveInside(root, relPath) {
  if (typeof relPath !== 'string' || !relPath) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(relPath)) return null;
  const cleaned = relPath.replace(/^\.\//, '').replace(/^[/\\]+/, '');
  const full = path.resolve(root, cleaned);
  if (!isInsideRoot(root, full)) return null;
  return full;
}

function looksLikeHtml(value) {
  return /<[A-Za-z!/]/.test(value);
}

function looksLikePath(value) {
  if (!value || value.length > 400) return false;
  if (/[<>\n]/.test(value) || value.indexOf('${') !== -1) return false;
  return /\.html?$/i.test(value) || value.indexOf('/') !== -1 || value.indexOf('\\') !== -1;
}

function firstString(item, keys) {
  for (let i = 0; i < keys.length; i++) {
    const value = item[keys[i]];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && isFinite(value)) return String(value);
  }
  return '';
}

function coerceApps(json) {
  if (json == null) return null;
  let arr = null;
  if (Array.isArray(json)) {
    arr = json;
  } else if (typeof json === 'object') {
    if (Array.isArray(json.apps)) arr = json.apps;
    else if (Array.isArray(json.applications)) arr = json.applications;
    else if (Array.isArray(json.manifest)) arr = json.manifest;
    else if (json.apps && typeof json.apps === 'object' && !Array.isArray(json.apps)) {
      arr = Object.keys(json.apps).map(function (key) {
        const value = json.apps[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return Object.assign({ id: key }, value);
        }
        return { id: key, name: value };
      });
    }
  }
  if (!arr) return null;
  const apps = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (typeof item === 'string' && item.trim()) {
      apps.push({ id: item.trim() });
      continue;
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = firstString(item, ['app_id', 'appId', 'id', 'slug', 'key', 'title', 'name']);
    if (!id) continue;
    const copy = Object.assign({}, item);
    copy.id = id;
    apps.push(copy);
  }
  return apps;
}

function isManifestFilename(base) {
  const name = base.toLowerCase();
  if (name === 'package.json' || name === 'package-lock.json' || name === 'tsconfig.json') return false;
  return name === 'manifest.json' ||
    name === 'apps.json' ||
    name === 'applications.json' ||
    name === 'app-manifest.json' ||
    name.endsWith('.manifest.json');
}

function findManifest(root) {
  for (let i = 0; i < PREFERRED_MANIFESTS.length; i++) {
    const full = path.join(root, PREFERRED_MANIFESTS[i]);
    const apps = coerceApps(readJson(full));
    if (apps) return { file: full, apps: apps };
  }
  const found = [];
  walkFiles(root, function (filePath) {
    if (!isManifestFilename(path.basename(filePath))) return;
    const apps = coerceApps(readJson(filePath));
    if (!apps) return;
    found.push({ file: filePath, apps: apps });
  });
  if (!found.length) return null;
  found.sort(function (a, b) {
    const aManifest = path.basename(a.file) === 'manifest.json' ? 0 : 1;
    const bManifest = path.basename(b.file) === 'manifest.json' ? 0 : 1;
    if (aManifest !== bManifest) return aManifest - bManifest;
    const aDepth = a.file.split(path.sep).length;
    const bDepth = b.file.split(path.sep).length;
    if (aDepth !== bDepth) return aDepth - bDepth;
    if (a.file < b.file) return -1;
    if (a.file > b.file) return 1;
    return 0;
  });
  return found[0];
}

function findMainSimple(root) {
  for (let i = 0; i < PREFERRED_MAIN.length; i++) {
    const full = path.join(root, PREFERRED_MAIN[i]);
    if (readFileIfSmall(full, 1) != null || (fs.existsSync(full) && fs.statSync(full).isFile())) {
      return full;
    }
  }
  let found = null;
  walkFiles(root, function (filePath) {
    if (path.basename(filePath) === 'main-simple.js') {
      found = filePath;
      return true;
    }
  });
  return found;
}

function appsFromMainSimpleRef(root) {
  const mainPath = findMainSimple(root);
  if (!mainPath) return null;
  const source = readFileIfSmall(mainPath, 4000000);
  if (!source) return null;
  const match = source.match(/['"]([^'"]*(?:manifest|apps)[^'"]*\.json)['"]/i);
  if (!match) return null;
  const rel = match[1];
  const candidates = [
    resolveInside(root, rel),
    resolveInside(path.dirname(mainPath), rel),
    resolveInside(root, path.join('public', rel)),
    resolveInside(root, path.join('src', rel)),
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (!candidates[i]) continue;
    const apps = coerceApps(readJson(candidates[i]));
    if (apps) return apps;
  }
  return null;
}

function discoverAppsFromDirs(root) {
  const apps = [];
  const seen = Object.create(null);
  for (let r = 0; r < APP_ROOTS.length; r++) {
    const dir = path.join(root, APP_ROOTS[r]);
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      continue;
    }
    for (let i = 0; i < entries.length; i++) {
      const ent = entries[i];
      if (!ent.name || ent.name.charAt(0) === '.') continue;
      if (ent.isDirectory()) {
        const indexHtml = path.join(dir, ent.name, 'index.html');
        const appHtml = path.join(dir, ent.name, 'app.html');
        if (fs.existsSync(indexHtml) || fs.existsSync(appHtml)) {
          if (!seen[ent.name]) {
            seen[ent.name] = true;
            apps.push({ id: ent.name });
          }
        }
      } else if (ent.isFile() && /\.html?$/i.test(ent.name)) {
        const id = ent.name.replace(/\.html?$/i, '');
        if (!seen[id]) {
          seen[id] = true;
          apps.push({ id: id, htmlPath: path.join(dir, ent.name) });
        }
      }
    }
  }
  apps.sort(function (a, b) {
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
  return apps;
}

function loadManifestApps(root) {
  const manifest = findManifest(root);
  if (manifest) return manifest.apps;
  const fromMain = appsFromMainSimpleRef(root);
  if (fromMain) return fromMain;
  return discoverAppsFromDirs(root);
}

function renderDesktop(root) {
  for (let i = 0; i < PREFERRED_SHELLS.length; i++) {
    const text = readFileIfSmall(path.join(root, PREFERRED_SHELLS[i]), 5000000);
    if (text != null) return text;
  }
  let found = null;
  let foundDepth = Infinity;
  walkFiles(root, function (filePath) {
    if (!/\.html?$/i.test(filePath)) return;
    const depth = filePath.split(path.sep).length;
    if (depth >= foundDepth) return;
    const text = readFileIfSmall(filePath, 2000000);
    if (text && text.indexOf('main-simple.js') !== -1) {
      found = text;
      foundDepth = depth;
    }
  });
  if (found) return found;
  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div id="desktop"></div></body></html>';
}

function templateScope(app) {
  const data = {};
  const sources = [app, app && app.data, app && app.props, app && app.model, app && app.context, app && app.meta];
  for (let s = 0; s < sources.length; s++) {
    const src = sources[s];
    if (!src || typeof src !== 'object') continue;
    const keys = Object.keys(src);
    for (let k = 0; k < keys.length; k++) {
      if (data[keys[k]] === undefined) data[keys[k]] = src[keys[k]];
    }
  }
  return {
    app: app || {},
    data: data,
    props: (app && app.props) || {},
    model: (app && app.model) || {},
    context: data,
  };
}

function lookupPath(scope, expr) {
  const trimmed = String(expr == null ? '' : expr).trim();
  if (!trimmed) return undefined;
  const quote = trimmed.charAt(0);
  if ((quote === '"' || quote === "'") && trimmed.charAt(trimmed.length - 1) === quote) {
    return trimmed.slice(1, -1);
  }
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return trimmed;
  const parts = trimmed.split('.');
  let cur = scope;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part)) return undefined;
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

function isRenderableValue(value) {
  return value != null && typeof value !== 'object' && typeof value !== 'function';
}

function resolveExpr(scope, expr) {
  const raw = String(expr == null ? '' : expr).trim();
  const tries = [raw];
  const stripped = raw.replace(/^(app|data|props|model|context)\./, '');
  if (stripped !== raw) tries.push(stripped);
  const roots = [scope, scope.data, scope.app, scope.props, scope.model];
  for (let t = 0; t < tries.length; t++) {
    for (let r = 0; r < roots.length; r++) {
      const value = lookupPath(roots[r], tries[t]);
      if (isRenderableValue(value)) return value;
    }
  }
  return '';
}

function renderTemplate(tpl, app) {
  const src = String(tpl == null ? '' : tpl);
  if (src.indexOf('${') === -1) return src;
  const scope = templateScope(app || {});
  return src.replace(/\$\{([^}]*)\}/g, function (_match, raw) {
    const expr = String(raw).trim();
    const escapedCall = /^escapeHTML\s*\(\s*([\s\S]*?)\s*\)$/.exec(expr);
    const inner = escapedCall ? escapedCall[1] : expr;
    const value = resolveExpr(scope, inner);
    const text = value == null ? '' : String(value);
    return escapedCall ? escapeHTML(text) : text;
  });
}

function extractBody(html) {
  const match = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return match ? match[1] : html;
}

function extractHtmlTemplates(source) {
  const found = [];
  let i = 0;
  while (i < source.length) {
    const tick = source.indexOf('`', i);
    if (tick < 0) break;
    if (tick > 0 && source.charAt(tick - 1) === '\\') {
      i = tick + 1;
      continue;
    }
    let j = tick + 1;
    let buf = '';
    while (j < source.length) {
      const ch = source.charAt(j);
      if (ch === '\\') {
        buf += source.charAt(j + 1);
        j += 2;
        continue;
      }
      if (ch === '`') break;
      buf += ch;
      j += 1;
    }
    if (j >= source.length) break;
    if (/<[A-Za-z]/.test(buf) && /<(button|a|input|select|textarea|summary)\b|\brole\s*=/i.test(buf)) {
      found.push(buf);
    }
    i = j + 1;
  }
  return found;
}

function templateNearId(source, appId) {
  if (!source || !appId) return '';
  const patterns = [
    new RegExp('(?:id|app_id|appId)\\s*:\\s*([\'"])' + escapeRegExp(appId) + '\\1', 'g'),
    new RegExp('(?:^|[\\{,]\\s*)([\'"]?)' + escapeRegExp(appId) + '\\1\\s*:', 'gm'),
  ];
  for (let p = 0; p < patterns.length; p++) {
    const re = patterns[p];
    let match;
    while ((match = re.exec(source))) {
      const windowText = source.slice(match.index, match.index + 20000);
      const templates = extractHtmlTemplates(windowText);
      if (templates.length) return templates.join('\n');
    }
  }
  return '';
}

function considerHtmlValue(value, inline, paths) {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed) return;
  if (looksLikeHtml(trimmed)) inline.push(trimmed);
  else if (looksLikePath(trimmed)) paths.push(trimmed);
}

function collectHtmlFields(item, inline, paths) {
  if (!item || typeof item !== 'object') return;
  const keys = ['html', 'markup', 'template', 'content', 'body', 'windowHtml', 'ui', 'view'];
  for (let i = 0; i < keys.length; i++) considerHtmlValue(item[keys[i]], inline, paths);
  const pathKeys = ['htmlPath', 'templatePath', 'viewPath', 'entry', 'src', 'path', 'file', 'index', 'url', 'href', 'html_path'];
  for (let i = 0; i < pathKeys.length; i++) considerHtmlValue(item[pathKeys[i]], inline, paths);
  const lists = ['windows', 'views', 'panels', 'pages'];
  for (let i = 0; i < lists.length; i++) {
    const list = item[lists[i]];
    if (!Array.isArray(list)) continue;
    for (let j = 0; j < list.length; j++) {
      if (typeof list[j] === 'string') considerHtmlValue(list[j], inline, paths);
      else collectHtmlFields(list[j], inline, paths);
    }
  }
}

function readLocalHtml(root, relOrAbs) {
  const full = path.isAbsolute(relOrAbs) ? relOrAbs : resolveInside(root, relOrAbs);
  if (!full || !isInsideRoot(root, full)) return null;
  let stat;
  try {
    stat = fs.statSync(full);
  } catch (err) {
    return null;
  }
  if (stat.isDirectory()) {
    const names = ['index.html', 'app.html', 'window.html', 'view.html', 'template.html'];
    for (let i = 0; i < names.length; i++) {
      const text = readFileIfSmall(path.join(full, names[i]), 2000000);
      if (text != null) return text;
    }
    return null;
  }
  return readFileIfSmall(full, 2000000);
}

function conventionalHtml(root, appId) {
  const rels = [
    'apps/' + appId + '/index.html',
    'apps/' + appId + '/app.html',
    'apps/' + appId + '.html',
    'src/apps/' + appId + '/index.html',
    'src/apps/' + appId + '/app.html',
    'src/apps/' + appId + '.html',
    'public/apps/' + appId + '/index.html',
    'public/apps/' + appId + '.html',
    'web/apps/' + appId + '/index.html',
    'desktop/apps/' + appId + '/index.html',
    'virtual-desktop/apps/' + appId + '/index.html',
    'virtual-desktop-ipfs-mcp-orb/apps/' + appId + '/index.html',
    'applications/' + appId + '/index.html',
    'packages/' + appId + '/index.html',
  ];
  for (let i = 0; i < rels.length; i++) {
    const text = readLocalHtml(root, rels[i]);
    if (text != null) return text;
  }
  return null;
}

function resolveAppHtml(app, options) {
  const root = options && options.root ? options.root : ROOT;
  const inline = [];
  const paths = [];
  collectHtmlFields(app, inline, paths);
  if (inline.length) return renderTemplate(inline.join('\n'), app);
  for (let i = 0; i < paths.length; i++) {
    const text = readLocalHtml(root, paths[i]);
    if (text != null) return renderTemplate(extractBody(text), app);
  }
  const conventional = conventionalHtml(root, app.id);
  if (conventional != null) return renderTemplate(extractBody(conventional), app);
  const fromMain = templateNearId(options && options.mainSimpleSource, app.id);
  if (fromMain) return renderTemplate(fromMain, app);
  return '';
}

function safeDomId(appId, ordinal) {
  let safe = String(appId).split('${').join('').split('escapeHTML').join('');
  safe = safe.replace(/[^A-Za-z0-9_-]/g, '_');
  if (!safe || !/^[A-Za-z_]/.test(safe)) safe = 'a_' + safe;
  return 'launched_' + String(ordinal) + '_' + safe;
}

function makeLaunchId(appId, count) {
  if (count === 1) return 'launch:' + appId;
  return 'launch:' + appId + ':' + String(count);
}

function readOpenTag(html, index) {
  if (html.charAt(index) !== '<') return null;
  let j = index + 1;
  const tagMatch = /^[A-Za-z][\w:-]*/.exec(html.slice(j));
  if (!tagMatch) return null;
  const tag = tagMatch[0].toLowerCase();
  j += tagMatch[0].length;
  const attrs = Object.create(null);
  while (j < html.length) {
    while (j < html.length && /\s/.test(html.charAt(j))) j += 1;
    if (j >= html.length) break;
    if (html.charAt(j) === '>') {
      return { tag: tag, attrs: attrs, selfClosing: false, end: j + 1 };
    }
    if (html.charAt(j) === '/' && html.charAt(j + 1) === '>') {
      return { tag: tag, attrs: attrs, selfClosing: true, end: j + 2 };
    }
    const nameMatch = /^[^\s=\/>]+/.exec(html.slice(j));
    if (!nameMatch) {
      j += 1;
      continue;
    }
    const name = nameMatch[0].toLowerCase();
    j += nameMatch[0].length;
    while (j < html.length && /\s/.test(html.charAt(j))) j += 1;
    let value = '';
    if (html.charAt(j) === '=') {
      j += 1;
      while (j < html.length && /\s/.test(html.charAt(j))) j += 1;
      const quote = html.charAt(j);
      if (quote === '"' || quote === "'") {
        j += 1;
        const end = html.indexOf(quote, j);
        if (end < 0) {
          value = html.slice(j);
          j = html.length;
        } else {
          value = html.slice(j, end);
          j = end + 1;
        }
      } else {
        const valueMatch = /^[^\s>]+/.exec(html.slice(j));
        value = valueMatch ? valueMatch[0] : '';
        j += value.length;
      }
    }
    if (attrs[name] === undefined) attrs[name] = decodeEntities(value);
  }
  return { tag: tag, attrs: attrs, selfClosing: true, end: j };
}

function insertInsideId(html, id, block) {
  const re = new RegExp('<([A-Za-z][\\w:-]*)\\b[^>]*\\bid\\s*=\\s*([\'"])' + escapeRegExp(id) + '\\2[^>]*>', 'i');
  const match = re.exec(html);
  if (!match) return null;
  const tag = match[1].toLowerCase();
  const openEnd = match.index + match[0].length;
  if (VOID_TAGS[tag] || /\/\s*>$/.test(match[0])) {
    return html.slice(0, openEnd) + block + html.slice(openEnd);
  }
  let i = openEnd;
  let depth = 1;
  while (i < html.length && depth > 0) {
    const lt = html.indexOf('<', i);
    if (lt < 0) return null;
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const end = html.indexOf('>', lt + 2);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    if (html.startsWith('</', lt)) {
      const close = /^<\/([A-Za-z][\w:-]*)\s*>/.exec(html.slice(lt));
      if (!close) {
        i = lt + 2;
        continue;
      }
      i = lt + close[0].length;
      if (close[1].toLowerCase() === tag) {
        depth -= 1;
        if (depth === 0) return html.slice(0, lt) + block + html.slice(lt);
      }
      continue;
    }
    const open = readOpenTag(html, lt);
    if (!open) {
      i = lt + 1;
      continue;
    }
    i = open.end;
    if (open.tag === tag && !open.selfClosing && !VOID_TAGS[open.tag]) depth += 1;
  }
  return null;
}

function mountLaunchedApp(html, launch) {
  const block = '<div id="' + escapeAttr(launch.domId) +
    '" data-app-id="' + escapeAttr(launch.appId) +
    '" data-launch-id="' + escapeAttr(launch.launchId) +
    '" data-rendered-launch="true">' + (launch.inner || '') + '</div>';
  const mounted = insertInsideId(html, 'desktop', block);
  if (mounted != null) return mounted;
  const body = html.search(/<\/body>/i);
  if (body >= 0) return html.slice(0, body) + block + html.slice(body);
  return html + block;
}

function launchManifestApps(desktopHtml, apps, options) {
  let html = String(desktopHtml == null ? '' : desktopHtml);
  const seen = new Map();
  const list = Array.isArray(apps) ? apps : [];
  for (let i = 0; i < list.length; i++) {
    const app = list[i];
    const appId = String(app && app.id != null ? app.id : '');
    if (!appId) continue;
    const count = (seen.get(appId) || 0) + 1;
    seen.set(appId, count);
    const launchId = makeLaunchId(appId, count);
    const domId = safeDomId(appId, i + 1);
    let inner = '';
    try {
      inner = resolveAppHtml(app, options || {});
    } catch (err) {
      inner = '';
    }
    html = mountLaunchedApp(html, {
      appId: appId,
      launchId: launchId,
      domId: domId,
      inner: inner,
    });
  }
  return { html: html };
}

function parseHtmlTree(html) {
  const root = { tag: '#root', attrs: Object.create(null), children: [], text: '', parent: null };
  const stack = [root];
  const source = String(html == null ? '' : html);
  let i = 0;
  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt < 0) {
      stack[stack.length - 1].text += source.slice(i);
      break;
    }
    if (lt > i) stack[stack.length - 1].text += source.slice(i, lt);
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      i = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<!', lt) || source.startsWith('<?', lt)) {
      const end = source.indexOf('>', lt + 2);
      i = end < 0 ? source.length : end + 1;
      continue;
    }
    if (source.charAt(lt + 1) === '/') {
      const close = /^<\/([A-Za-z][\w:-]*)\s*>/.exec(source.slice(lt));
      if (!close) {
        i = lt + 1;
        continue;
      }
      const tag = close[1].toLowerCase();
      i = lt + close[0].length;
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].tag === tag) {
          stack.length = s;
          break;
        }
      }
      continue;
    }
    const open = readOpenTag(source, lt);
    if (!open) {
      i = lt + 1;
      continue;
    }
    i = open.end;
    const el = {
      tag: open.tag,
      attrs: open.attrs,
      children: [],
      text: '',
      parent: null,
    };
    stack[stack.length - 1].children.push(el);
    const keepOpen = !open.selfClosing && !VOID_TAGS[open.tag];
    if (!keepOpen) continue;
    stack.push(el);
    if (!RAW_TEXT_TAGS[open.tag]) continue;
    const closeRe = new RegExp('</' + open.tag + '\\s*>', 'i');
    const rest = source.slice(i);
    const close = closeRe.exec(rest);
    if (close) {
      el.text += rest.slice(0, close.index);
      i = i + close.index + close[0].length;
    } else {
      el.text += rest;
      i = source.length;
    }
    stack.pop();
  }
  decodeTreeText(root);
  attachParents(root, null);
  return root;
}

function decodeTreeText(node) {
  if (node.text) node.text = decodeEntities(node.text);
  const children = node.children || [];
  for (let i = 0; i < children.length; i++) decodeTreeText(children[i]);
}

function attachParents(node, parent) {
  node.parent = parent;
  const children = node.children || [];
  for (let i = 0; i < children.length; i++) attachParents(children[i], node);
}

function roleOf(el) {
  if (!el || !el.attrs) return '';
  if (el.attrs.role) {
    const explicit = el.attrs.role.trim().toLowerCase().split(/\s+/)[0];
    if (explicit) return explicit;
  }
  if (el.tag === 'button') return 'button';
  if (el.tag === 'a') return el.attrs.href !== undefined ? 'link' : '';
  if (el.tag === 'textarea') return 'textbox';
  if (el.tag === 'select') return el.attrs.multiple !== undefined ? 'listbox' : 'combobox';
  if (el.tag === 'option') return 'option';
  if (el.tag === 'summary') return 'button';
  if (el.tag === 'input') {
    const type = String(el.attrs.type || 'text').toLowerCase();
    if (type === 'hidden') return '';
    if (INPUT_ROLES[type]) return INPUT_ROLES[type];
    return 'textbox';
  }
  return '';
}

function isControl(el) {
  const role = roleOf(el);
  return !!role && !!CONTROL_ROLES[role];
}

function hasHiddenStyle(el) {
  const style = (el.attrs && el.attrs.style) || '';
  return /display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style);
}

function visibleText(el) {
  if (!el || el.tag === 'script' || el.tag === 'style') return '';
  let out = el.text || '';
  const children = el.children || [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child || !child.attrs) continue;
    if (child.attrs.hidden !== undefined) continue;
    if (child.attrs['aria-hidden'] === 'true') continue;
    if (child.tag === 'script' || child.tag === 'style') continue;
    out += ' ' + visibleText(child);
  }
  return out;
}

function wrappingLabel(el) {
  let parent = el.parent;
  while (parent) {
    if (parent.tag === 'label') return parent;
    parent = parent.parent;
  }
  return null;
}

function accessibleName(el, byId, labelsFor) {
  const labelledBy = el.attrs['aria-labelledby'];
  if (labelledBy) {
    const ids = labelledBy.split(/\s+/);
    const parts = [];
    for (let i = 0; i < ids.length; i++) {
      const ref = byId.get(ids[i]);
      if (ref) parts.push(visibleText(ref));
    }
    const joined = norm(parts.join(' '));
    if (joined) return joined;
  }
  const aria = norm(el.attrs['aria-label'] || '');
  if (aria) return aria;
  if (el.tag === 'input' || el.tag === 'textarea' || el.tag === 'select') {
    if (el.attrs.id && labelsFor.has(el.attrs.id)) {
      const fromFor = norm(labelsFor.get(el.attrs.id));
      if (fromFor) return fromFor;
    }
    const wrapped = wrappingLabel(el);
    if (wrapped) {
      const fromWrap = norm(visibleText(wrapped));
      if (fromWrap) return fromWrap;
    }
  }
  if (el.attrs.alt) {
    const alt = norm(el.attrs.alt);
    if (alt) return alt;
  }
  if (el.tag === 'input') {
    const type = String(el.attrs.type || 'text').toLowerCase();
    if ((type === 'button' || type === 'submit' || type === 'reset' || type === 'image') && el.attrs.value) {
      const value = norm(el.attrs.value);
      if (value) return value;
    }
  }
  if (el.tag === 'select') {
    let chosen = null;
    const children = el.children || [];
    for (let i = 0; i < children.length; i++) {
      if (children[i].tag !== 'option') continue;
      if (!chosen) chosen = children[i];
      if (children[i].attrs.selected !== undefined) {
        chosen = children[i];
        break;
      }
    }
    if (chosen) {
      const optionName = norm(visibleText(chosen) || chosen.attrs.label || '');
      if (optionName) return optionName;
    }
  } else if (el.tag === 'textarea') {
    const text = norm(el.text || '');
    if (text) return text;
  } else if (el.tag !== 'input') {
    const text = norm(visibleText(el));
    if (text) return text;
  }
  if (el.attrs.title) {
    const title = norm(el.attrs.title);
    if (title) return title;
  }
  return '';
}

function skipEmbedded(node) {
  return !node || node.tag === 'template' || node.tag === 'noscript';
}

function countIds(node, map) {
  if (skipEmbedded(node)) return;
  if (node.attrs && node.attrs.id) map.set(node.attrs.id, (map.get(node.attrs.id) || 0) + 1);
  const children = node.children || [];
  for (let i = 0; i < children.length; i++) countIds(children[i], map);
}

function countAttrs(node, attr, map) {
  if (skipEmbedded(node)) return;
  if (node.attrs && node.attrs[attr]) {
    const key = node.tag + '\0' + attr + '\0' + node.attrs[attr];
    map.set(key, (map.get(key) || 0) + 1);
  }
  const children = node.children || [];
  for (let i = 0; i < children.length; i++) countAttrs(children[i], attr, map);
}

function indexById(node, map) {
  if (skipEmbedded(node)) return;
  if (node.attrs && node.attrs.id && !map.has(node.attrs.id)) map.set(node.attrs.id, node);
  const children = node.children || [];
  for (let i = 0; i < children.length; i++) indexById(children[i], map);
}

function indexLabels(node, map) {
  if (skipEmbedded(node)) return;
  if (node.tag === 'label' && node.attrs && node.attrs.for && !map.has(node.attrs.for)) {
    map.set(node.attrs.for, norm(visibleText(node)));
  }
  const children = node.children || [];
  for (let i = 0; i < children.length; i++) indexLabels(children[i], map);
}

function pathSelector(el, idCounts) {
  const parts = [];
  let node = el;
  while (node && node.tag !== '#root') {
    const id = node.attrs && node.attrs.id;
    if (id && isCssIdent(id) && idCounts.get(id) === 1 && !selectorRejected(id)) {
      parts.push('#' + id);
      break;
    }
    const parent = node.parent;
    let nth = 1;
    if (parent && parent.children) {
      nth = 0;
      for (let i = 0; i < parent.children.length; i++) {
        const sib = parent.children[i];
        if (sib.tag === node.tag) nth += 1;
        if (sib === node) break;
      }
    }
    parts.push(node.tag + ':nth-of-type(' + nth + ')');
    node = parent;
  }
  return parts.reverse().join(' > ');
}

function chooseSelector(el, idCounts, attrCounts) {
  const id = (el.attrs && el.attrs.id) || '';
  if (id && isCssIdent(id) && idCounts.get(id) === 1 && !selectorRejected(id)) return '#' + id;
  const attrNames = ['data-testid', 'data-test-id', 'data-control', 'data-action'];
  for (let i = 0; i < attrNames.length; i++) {
    const attr = attrNames[i];
    const value = el.attrs[attr];
    if (!value || selectorRejected(value)) continue;
    const key = el.tag + '\0' + attr + '\0' + value;
    if (attrCounts.get(key) !== 1) continue;
    const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const selector = el.tag + '[' + attr + '="' + escaped + '"]';
    if (!selectorRejected(selector)) return selector;
  }
  const selector = pathSelector(el, idCounts);
  if (!selectorRejected(selector)) return selector;
  return null;
}

function censusControls(html) {
  const tree = parseHtmlTree(html);
  const idCounts = new Map();
  const attrCounts = new Map();
  const byId = new Map();
  const labelsFor = new Map();
  countIds(tree, idCounts);
  const attrNames = ['data-testid', 'data-test-id', 'data-control', 'data-action'];
  for (let i = 0; i < attrNames.length; i++) countAttrs(tree, attrNames[i], attrCounts);
  indexById(tree, byId);
  indexLabels(tree, labelsFor);
  const controls = [];

  function walk(node, launch, hidden) {
    if (!node) return;
    if (node.tag === 'template' || node.tag === 'noscript') return;
    const attrs = node.attrs || {};
    const nextHidden = !!hidden ||
      attrs.hidden !== undefined ||
      attrs['aria-hidden'] === 'true' ||
      hasHiddenStyle(node);
    let nextLaunch = launch;
    if (attrs['data-launch-id']) {
      nextLaunch = {
        app_id: attrs['data-app-id'] || '',
        launch_id: attrs['data-launch-id'],
      };
    }
    if (!nextHidden && nextLaunch && node.tag !== '#root' && isControl(node)) {
      const selector = chooseSelector(node, idCounts, attrCounts);
      const role = roleOf(node);
      if (selector && role && !selectorRejected(selector)) {
        controls.push({
          app_id: String(nextLaunch.app_id),
          launch_id: String(nextLaunch.launch_id),
          selector: selector,
          role: role,
          accessible_name: accessibleName(node, byId, labelsFor),
          source_template: false,
          clicked: false,
        });
      }
    }
    const children = node.children || [];
    for (let i = 0; i < children.length; i++) walk(children[i], nextLaunch, nextHidden);
  }

  walk(tree, null, false);
  return controls;
}

function buildRenderedControlCensus(options) {
  const root = (options && options.root) || ROOT;
  const apps = (options && options.apps) || loadManifestApps(root);
  const rendered = (options && options.shellHtml != null) ? String(options.shellHtml) : renderDesktop(root);
  let mainSimpleSource = options && options.mainSimpleSource;
  if (mainSimpleSource == null) {
    const mainPath = findMainSimple(root);
    mainSimpleSource = mainPath ? (readFileIfSmall(mainPath, 4000000) || '') : '';
  }
  const launched = launchManifestApps(rendered, apps, {
    root: root,
    mainSimpleSource: mainSimpleSource,
  });
  return {
    schema: SCHEMA,
    controls: censusControls(launched.html),
  };
}

function assertValidCensus(census) {
  if (!census || census.schema !== SCHEMA) throw new Error('census schema must be ' + SCHEMA);
  if (!Array.isArray(census.controls)) throw new Error('census controls must be an array');
  for (let i = 0; i < census.controls.length; i++) {
    const row = census.controls[i];
    if (!row) throw new Error('missing control');
    if (typeof row.app_id !== 'string' || !row.app_id) throw new Error('missing app_id');
    if (typeof row.launch_id !== 'string' || !row.launch_id) throw new Error('missing launch_id');
    if (typeof row.selector !== 'string' || selectorRejected(row.selector)) throw new Error('rejected selector');
    if (typeof row.role !== 'string' || !row.role) throw new Error('missing role');
    if (typeof row.accessible_name !== 'string') throw new Error('missing accessible_name');
    if (row.source_template !== false) throw new Error('source_template must be false');
    if (row.clicked !== false) throw new Error('clicked must be false');
  }
}

function writeCensus(census, outPath) {
  assertValidCensus(census);
  const target = outPath || defaultOutPath(ROOT);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const body = {
    schema: census.schema,
    controls: census.controls.map(function (row) {
      return {
        app_id: row.app_id,
        launch_id: row.launch_id,
        selector: row.selector,
        role: row.role,
        accessible_name: row.accessible_name,
        source_template: false,
        clicked: false,
      };
    }),
  };
  fs.writeFileSync(target, JSON.stringify(body, null, 2) + '\n', 'utf8');
  return target;
}

function main() {
  const census = buildRenderedControlCensus();
  const out = writeCensus(census, defaultOutPath(ROOT));
  process.stdout.write(out + '\n' + String(census.controls.length) + '\n');
}

module.exports = {
  SCHEMA: SCHEMA,
  ROOT: ROOT,
  buildRenderedControlCensus: buildRenderedControlCensus,
  writeCensus: writeCensus,
  renderTemplate: renderTemplate,
  renderDesktop: renderDesktop,
  launchManifestApps: launchManifestApps,
  loadManifestApps: loadManifestApps,
  censusControls: censusControls,
  selectorRejected: selectorRejected,
  defaultOutPath: defaultOutPath,
};

if (require.main === module) main();
