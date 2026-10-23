#!/usr/bin/env node
/**
 * VDL-010: the live-click helper must launch the real window and click once.
 * This check does not rewrite the helper.
 */

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const helperPath = path.join(projectRoot, 'test', 'e2e', 'helpers', 'live-click-session.ts');
const pngPath = path.join(projectRoot, 'test', 'e2e', 'helpers', 'live-click-png.cjs');
function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const helper = codeOnly(fs.readFileSync(helperPath, 'utf8'));
const png = fs.readFileSync(pngPath, 'utf8');
const problems = [];

if (!helper.includes('export async function runLiveClickTarget')) problems.push('missing runLiveClickTarget');
if (!helper.includes('.click(')) problems.push('missing locator click');
if (helper.includes('gatewayOnly')) problems.push('gatewayOnly is not allowed');
if (helper.includes('evaluateAll')) problems.push('evaluateAll batch clicks are not allowed');
if (!helper.includes('pageerror')) problems.push('missing pageerror');
if (!helper.includes('screenshot')) problems.push('missing screenshot');
if (!helper.includes('MCP_INVOCATION_OBSERVATION_ROUTE')) problems.push('missing MCP++ route');
if (!helper.includes('launchApp')) problems.push('missing launchApp');
if (!png.includes('function inspectPng')) problems.push('missing png inspect');
if (!png.includes('8192')) problems.push('missing 8 KB png floor');
if (fs.statSync(helperPath).size < 2000) problems.push('helper is too small');

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('live-click session check ok');
