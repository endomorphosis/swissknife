#!/usr/bin/env node
/**
 * VDL-011: the live-click browser config owns its server and runs one target.
 */

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const configPath = path.join(projectRoot, 'build-tools', 'configs', 'playwright.live-click.config.ts');
const specPath = path.join(projectRoot, 'test', 'e2e', 'virtual-desktop-live-click.spec.ts');
const runnerPath = path.join(projectRoot, 'scripts', 'run-live-click.mjs');
const packagePath = path.join(projectRoot, 'package.json');
const config = fs.readFileSync(configPath, 'utf8');
const spec = fs.readFileSync(specPath, 'utf8');
const runner = fs.readFileSync(runnerPath, 'utf8');
const packageJson = fs.readFileSync(packagePath, 'utf8');
const problems = [];

if (!config.includes('reuseExistingServer: false')) problems.push('server reuse must stay off');
if (!config.includes('workers: 1')) problems.push('workers must stay 1');
if (!config.includes('fullyParallel: false')) problems.push('fullyParallel must stay false');
if (!config.includes("channel: 'chrome'")) problems.push('channel must stay chrome');
if (!config.includes('SWISSKNIFE_LIVE_CLICK_E2E_PORT')) problems.push('missing owned port env');
if (!config.includes('npm run desktop -- --port ${port} --strictPort')) problems.push('missing strictPort desktop command');
if (!spec.includes('runLiveClickTarget')) problems.push('spec does not call the session');
if (!runner.includes('SWISSKNIFE_LIVE_CLICK_E2E_PORT')) problems.push('runner does not lease a port');
if (!packageJson.includes('"evidence:live-click"')) problems.push('missing evidence:live-click script');

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('live-click config check ok');
