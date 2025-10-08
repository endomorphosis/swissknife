#!/usr/bin/env node

/**
 * Validation script for PR #22 - Test all fixed applications
 * Takes screenshots and validates functionality
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Applications claimed to be fixed in PR #22
const applications = [
  { name: 'oauth-login', selector: '[data-app="oauth-login"]', title: 'OAuth Login' },
  { name: 'p2p-chat', selector: '[data-app="p2p-chat"]', title: 'P2P Chat' },
  { name: 'p2p-chat-unified', selector: '[data-app="p2p-chat-unified"]', title: 'P2P Chat Unified' },
  { name: 'p2p-chat-offline', selector: '[data-app="p2p-chat-offline"]', title: 'P2P Chat Offline' },
  { name: 'task-manager', selector: '[data-app="task-manager"]', title: 'Task Manager' },
  { name: 'system-monitor', selector: '[data-app="system-monitor"]', title: 'System Monitor' },
  { name: 'github', selector: '[data-app="github"]', title: 'GitHub' },
  { name: 'ai-chat', selector: '[data-app="ai-chat"]', title: 'AI Chat' },
  { name: 'friends-network', selector: '[data-app="friends-network"]', title: 'Friends List' },
  { name: 'navi', selector: '[data-app="navi"]', title: 'Navi' },
  { name: 'image-viewer', selector: '[data-app="image-viewer"]', title: 'Image Viewer' },
  { name: 'model-browser', selector: '[data-app="model-browser"]', title: 'Model Browser' },
  { name: 'device-manager', selector: '[data-app="device-manager"]', title: 'Device Manager' },
  { name: 'strudel-ai-daw', selector: '[data-app="strudel-ai-daw"]', title: 'Strudel AI DAW' },
  { name: 'vibecode-broken', selector: '[data-app="vibecode-broken"]', title: 'VibeCode Broken' },
  { name: 'file-manager', selector: '[data-app="file-manager"]', title: 'File Manager' },
  { name: 'ipfs-explorer', selector: '[data-app="ipfs-explorer"]', title: 'IPFS Explorer' },
  { name: 'ipfs-explorer-complete', selector: '[data-app="ipfs-explorer-complete"]', title: 'IPFS Explorer Complete' },
  { name: 'p2p-network', selector: '[data-app="p2p-network"]', title: 'P2P Network' },
  { name: 'neural-photoshop', selector: '[data-app="neural-photoshop"]', title: 'Neural Photoshop' },
  
  // Additional key applications to verify
  { name: 'terminal', selector: '[data-app="terminal"]', title: 'SwissKnife Terminal' },
  { name: 'vibecode', selector: '[data-app="vibecode"]', title: 'VibeCode' },
  { name: 'music-studio-unified', selector: '[data-app="music-studio-unified"]', title: 'Music Studio' },
];

async function validateApplications() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  const results = {
    working: [],
    mock: [],
    failed: [],
    notFound: []
  };
  
  const resultsDir = path.join(process.cwd(), 'test-results', 'pr22-validation');
  
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  console.log('\n🚀 Starting PR #22 Application Validation...\n');
  
  // Navigate to desktop
  try {
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('.desktop', { timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Take desktop overview
    await page.screenshot({ 
      path: path.join(resultsDir, '00-desktop-overview.png'),
      fullPage: true 
    });
    
    console.log('✅ Desktop loaded successfully\n');
  } catch (error) {
    console.error('❌ Failed to load desktop:', error.message);
    await browser.close();
    process.exit(1);
  }
  
  // Test each application
  for (const app of applications) {
    console.log(`Testing ${app.name}...`);
    
    try {
      const appIcon = page.locator(app.selector);
      
      // Check if icon exists
      if (await appIcon.count() === 0) {
        console.log(`  ⚠️  Icon not found on desktop`);
        results.notFound.push(app.name);
        continue;
      }
      
      // Click the icon
      await appIcon.click();
      await page.waitForTimeout(2000);
      
      // Check if window opened
      const windows = page.locator('.window');
      const windowCount = await windows.count();
      
      if (windowCount === 0) {
        console.log(`  ❌ No window opened`);
        results.failed.push(app.name);
        continue;
      }
      
      // Get the last opened window
      const appWindow = windows.last();
      
      // Take screenshot
      const screenshotPath = path.join(resultsDir, `${app.name}.png`);
      await appWindow.screenshot({ path: screenshotPath });
      
      // Check for mock indicators
      const windowContent = await appWindow.textContent();
      const mockIndicators = [
        'This is a mock',
        'placeholder',
        'Coming soon',
        'Not implemented',
        '[object Object]',
        'Failed to load',
        'Error loading',
        'TODO:',
        'MOCK'
      ];
      
      const isMock = mockIndicators.some(indicator => 
        windowContent.toLowerCase().includes(indicator.toLowerCase())
      );
      
      if (isMock) {
        console.log(`  ⚠️  Contains mock/placeholder indicators`);
        results.mock.push(app.name);
      } else {
        console.log(`  ✅ Appears functional`);
        results.working.push(app.name);
      }
      
      // Close window
      const closeButton = appWindow.locator('.window-close, .close-btn').first();
      if (await closeButton.count() > 0) {
        await closeButton.click();
        await page.waitForTimeout(500);
      }
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      results.failed.push(app.name);
    }
  }
  
  // Generate report
  console.log('\n' + '='.repeat(80));
  console.log('PR #22 VALIDATION RESULTS');
  console.log('='.repeat(80) + '\n');
  
  console.log(`✅ Working Applications (${results.working.length}):`);
  results.working.forEach(app => console.log(`   - ${app}`));
  
  console.log(`\n⚠️  Mock/Placeholder Applications (${results.mock.length}):`);
  results.mock.forEach(app => console.log(`   - ${app}`));
  
  console.log(`\n❌ Failed Applications (${results.failed.length}):`);
  results.failed.forEach(app => console.log(`   - ${app}`));
  
  console.log(`\n🔍 Not Found on Desktop (${results.notFound.length}):`);
  results.notFound.forEach(app => console.log(`   - ${app}`));
  
  const totalTested = results.working.length + results.mock.length + results.failed.length + results.notFound.length;
  const successRate = Math.round((results.working.length / totalTested) * 100);
  
  console.log(`\n📊 Overall Success Rate: ${successRate}% (${results.working.length}/${totalTested} fully functional)`);
  console.log(`\n📁 Screenshots saved to: ${resultsDir}\n`);
  
  // Save report to file
  const report = {
    timestamp: new Date().toISOString(),
    results,
    stats: {
      total: totalTested,
      working: results.working.length,
      mock: results.mock.length,
      failed: results.failed.length,
      notFound: results.notFound.length,
      successRate: successRate
    }
  };
  
  fs.writeFileSync(
    path.join(resultsDir, 'validation-report.json'),
    JSON.stringify(report, null, 2)
  );
  
  await browser.close();
  
  // Exit with error if too many issues
  if (results.mock.length + results.failed.length > results.working.length) {
    console.log('⚠️  WARNING: More issues than working apps!');
    process.exit(1);
  }
}

validateApplications().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
