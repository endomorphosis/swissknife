#!/usr/bin/env node

/**
 * Batch Application Testing Script
 * Tests multiple applications and generates comprehensive report
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// All 38 applications to test
const applications = [
  // Already tested (18) - from DESKTOP_VERIFICATION_REPORT.md
  { id: 'terminal', name: 'Terminal', tested: true, status: 'REAL' },
  { id: 'vibecode', name: 'VibeCode', tested: true, status: 'REAL' },
  { id: 'ai-chat', name: 'AI Chat', tested: true, status: 'REAL' },
  { id: 'calculator', name: 'Calculator', tested: true, status: 'REAL' },
  { id: 'settings', name: 'Settings', tested: true, status: 'REAL' },
  { id: 'file-manager', name: 'File Manager', tested: true, status: 'REAL' },
  { id: 'task-manager', name: 'Task Manager', tested: true, status: 'REAL' },
  { id: 'notes', name: 'Notes', tested: true, status: 'REAL' },
  { id: 'clock', name: 'Clock & Timers', tested: true, status: 'REAL' },
  { id: 'system-monitor', name: 'System Monitor', tested: true, status: 'REAL' },
  { id: 'huggingface', name: 'Hugging Face Hub', tested: true, status: 'REAL' },
  { id: 'openrouter', name: 'OpenRouter Hub', tested: true, status: 'REAL' },
  { id: 'calendar', name: 'Calendar & Events', tested: true, status: 'PLACEHOLDER' },
  { id: 'todo', name: 'Todo & Goals', tested: true, status: 'PLACEHOLDER' },
  { id: 'image-viewer', name: 'Image Viewer', tested: true, status: 'PLACEHOLDER' },
  { id: 'friends-list', name: 'Friends & Network', tested: true, status: 'PLACEHOLDER' },
  { id: 'music-studio-unified', name: 'Music Studio', tested: true, status: 'PLACEHOLDER' },
  { id: 'model-browser', name: 'AI Model Manager', tested: true, status: 'PARTIAL' },
  
  // Need to test (20) - remaining applications
  { id: 'ipfs-explorer', name: 'IPFS Explorer', tested: false },
  { id: 'device-manager', name: 'Device Manager', tested: false },
  { id: 'mcp-control', name: 'MCP Control', tested: false },
  { id: 'api-keys', name: 'API Keys', tested: false },
  { id: 'github', name: 'GitHub', tested: false },
  { id: 'oauth-login', name: 'OAuth Login', tested: false },
  { id: 'cron', name: 'AI Cron', tested: false },
  { id: 'navi', name: 'NAVI', tested: false },
  { id: 'p2p-network', name: 'P2P Network Manager', tested: false },
  { id: 'p2p-chat-unified', name: 'P2P Chat', tested: false },
  { id: 'neural-network-designer', name: 'Neural Network Designer', tested: false },
  { id: 'training-manager', name: 'Training Manager', tested: false },
  { id: 'peertube', name: 'PeerTube', tested: false },
  { id: 'media-player', name: 'Media Player', tested: false },
  { id: 'neural-photoshop', name: 'Neural Photoshop (Art)', tested: false },
  { id: 'cinema', name: 'Cinema', tested: false },
  { id: 'strudel', name: 'Strudel - Live Coding Music', tested: false },
  { id: 'strudel-ai-daw', name: 'Strudel AI DAW', tested: false },
  { id: 'music-studio', name: 'Music Studio Classic', tested: false },
  { id: 'p2p-chat', name: 'P2P Chat Classic', tested: false },
];

async function testApplication(page, app) {
  console.log(`\n🔍 Testing: ${app.name} (${app.id})`);
  
  try {
    // Find and click the icon
    const icon = await page.locator(`[data-app="${app.id}"]`).first();
    await icon.waitFor({ timeout: 5000 });
    await icon.click();
    await page.waitForTimeout(2000);
    
    // Check for windows
    const windows = await page.locator('.window').all();
    
    if (windows.length === 0) {
      console.log(`  ❌ NO WINDOW - App didn't open`);
      return { status: 'NO_WINDOW', implementation: 'MISSING' };
    }
    
    const lastWindow = windows[windows.length - 1];
    const content = await lastWindow.textContent();
    
    // Check for mock indicators
    const isMock = content?.includes('Mock') || content?.includes('Placeholder') || 
                   content?.includes('Coming Soon') || content?.includes('Under Construction');
    
    // Count interactive elements
    const buttons = await lastWindow.locator('button').count();
    const inputs = await lastWindow.locator('input, textarea, select').count();
    
    let status, implementation;
    if (isMock) {
      status = 'MOCK';
      implementation = 'MOCK';
      console.log(`  ⚠️  MOCK - Contains placeholder text`);
    } else if (buttons > 2 && inputs > 0) {
      status = 'REAL';
      implementation = 'REAL';
      console.log(`  ✅ REAL - ${buttons} buttons, ${inputs} inputs`);
    } else {
      status = 'BASIC';
      implementation = 'BASIC';
      console.log(`  ⚙️  BASIC - Limited interactivity`);
    }
    
    // Close window
    const closeBtn = lastWindow.locator('[title="Close"], button:has-text("×")').first();
    if (await closeBtn.isVisible({ timeout: 1000 })) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
    
    return { status, implementation, buttons, inputs };
  } catch (error) {
    console.log(`  ❌ ERROR - ${error.message}`);
    return { status: 'ERROR', implementation: 'ERROR', error: error.message };
  }
}

async function main() {
  console.log('🚀 Starting Batch Application Testing...\n');
  
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3001');
  await page.waitForSelector('.desktop', { timeout: 30000 });
  console.log('✅ Desktop loaded\n');
  
  const results = [];
  const appsToTest = applications.filter(app => !app.tested);
  
  console.log(`📊 Testing ${appsToTest.length} applications...`);
  
  for (const app of appsToTest) { // Test all remaining apps
    const result = await testApplication(page, app);
    results.push({ ...app, ...result });
    app.tested = true;
    app.status = result.status;
    
    // Small delay between apps
    await page.waitForTimeout(500);
  }
  
  await browser.close();
  
  // Generate report
  console.log('\n' + '='.repeat(60));
  console.log('📊 BATCH TESTING RESULTS');
  console.log('='.repeat(60));
  
  const real = results.filter(r => r.status === 'REAL').length;
  const mock = results.filter(r => r.status === 'MOCK').length;
  const basic = results.filter(r => r.status === 'BASIC').length;
  const errors = results.filter(r => r.status === 'ERROR' || r.status === 'NO_WINDOW').length;
  
  console.log(`\nTotal Tested: ${results.length}`);
  console.log(`✅ REAL: ${real}`);
  console.log(`⚠️  MOCK: ${mock}`);
  console.log(`⚙️  BASIC: ${basic}`);
  console.log(`❌ ERROR/NO_WINDOW: ${errors}`);
  
  // Save detailed results
  const reportPath = path.join(__dirname, '../docs/validation/batch-test-results.json');
  fs.writeFileSync(reportPath, JSON.stringify({ 
    timestamp: new Date().toISOString(),
    results,
    summary: { real, mock, basic, errors, total: results.length }
  }, null, 2));
  
  console.log(`\n📄 Detailed results saved to: ${reportPath}`);
}

main().catch(console.error);
