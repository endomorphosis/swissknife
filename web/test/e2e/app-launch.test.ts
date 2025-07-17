import { test, expect } from '@playwright/test';

test.describe('Application Launch Tests', () => {
  test('should launch the Terminal app', async ({ page }) => {
    await page.goto('/'); // Navigate to the base URL of the Vite app

    // Wait for the desktop to load and icons to be visible
    await page.waitForSelector('.desktop-icons .icon[data-app="terminal"]', { state: 'visible' });

    // Click on the Terminal app icon
    await page.click('.desktop-icons .icon[data-app="terminal"]');

    // Assert that the Terminal app window appears
    const terminalWindow = page.locator('.window[data-app="terminal"]');
    await expect(terminalWindow).toBeVisible();
    await expect(terminalWindow.locator('.window-title')).toHaveText('SwissKnife Terminal');
  });

  test('should launch the AI Chat app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="ai-chat"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="ai-chat"]');

    const aiChatWindow = page.locator('.window[data-app="ai-chat"]');
    await expect(aiChatWindow).toBeVisible();
    await expect(aiChatWindow.locator('.window-title')).toHaveText('AI Chat');
  });

  test('should launch the File Manager app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="file-manager"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="file-manager"]');

    const fileManagerWindow = page.locator('.window[data-app="file-manager"]');
    await expect(fileManagerWindow).toBeVisible();
    await expect(fileManagerWindow.locator('.window-title')).toHaveText('File Manager');
  });

  test('should launch the Settings app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="settings"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="settings"]');

    const settingsWindow = page.locator('.window[data-app="settings"]');
    await expect(settingsWindow).toBeVisible();
    await expect(settingsWindow.locator('.window-title')).toHaveText('Settings');
  });

  test('should launch the IPFS Explorer app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="ipfs-explorer"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="ipfs-explorer"]');

    const ipfsExplorerWindow = page.locator('.window[data-app="ipfs-explorer"]');
    await expect(ipfsExplorerWindow).toBeVisible();
    await expect(ipfsExplorerWindow.locator('.window-title')).toHaveText('IPFS Explorer');
  });

  test('should launch the Task Manager app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="task-manager"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="task-manager"]');

    const taskManagerWindow = page.locator('.window[data-app="task-manager"]');
    await expect(taskManagerWindow).toBeVisible();
    await expect(taskManagerWindow.locator('.window-title')).toHaveText('Task Manager');
  });

  test('should launch the Model Browser app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="model-browser"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="model-browser"]');

    const modelBrowserWindow = page.locator('.window[data-app="model-browser"]');
    await expect(modelBrowserWindow).toBeVisible();
    await expect(modelBrowserWindow.locator('.window-title')).toHaveText('Model Browser');
  });

  test('should launch the API Keys app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="api-keys"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="api-keys"]');

    const apiKeysWindow = page.locator('.window[data-app="api-keys"]');
    await expect(apiKeysWindow).toBeVisible();
    await expect(apiKeysWindow.locator('.window-title')).toHaveText('API Keys');
  });

  test('should launch the AI Cron Scheduler app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="cron"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="cron"]');

    const cronWindow = page.locator('.window[data-app="cron"]');
    await expect(cronWindow).toBeVisible();
    await expect(cronWindow.locator('.window-title')).toHaveText('AI Cron Scheduler');
  });

  test('should launch the Device Manager app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="device-manager"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="device-manager"]');

    const deviceManagerWindow = page.locator('.window[data-app="device-manager"]');
    await expect(deviceManagerWindow).toBeVisible();
    await expect(deviceManagerWindow.locator('.window-title')).toHaveText('Device Manager');
  });

  test('should launch the NAVI app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="navi"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="navi"]');

    const naviWindow = page.locator('.window[data-app="navi"]');
    await expect(naviWindow).toBeVisible();
    await expect(naviWindow.locator('.window-title')).toHaveText('NAVI');
  });

  test('should launch the Music Studio app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="strudel"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="strudel"]');

    const strudelWindow = page.locator('.window[data-app="strudel"]');
    await expect(strudelWindow).toBeVisible();
    await expect(strudelWindow.locator('.window-title')).toHaveText('🎵 Music Studio');
  });

  test('should launch the Phased Cleanup app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="phased-cleanup"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="phased-cleanup"]');

    const phasedCleanupWindow = page.locator('.window[data-app="phased-cleanup"]');
    await expect(phasedCleanupWindow).toBeVisible();
    await expect(phasedCleanupWindow.locator('.window-title')).toHaveText('🧹 Phased Cleanup');
  });

  test('should launch the Error Logs app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="error-logs"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="error-logs"]');

    const errorLogsWindow = page.locator('.window[data-app="error-logs"]');
    await expect(errorLogsWindow).toBeVisible();
    await expect(errorLogsWindow.locator('.window-title')).toHaveText('Error Logs');
  });

  test('should launch the Agent Studio app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="agent-studio"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="agent-studio"]');

    const agentStudioWindow = page.locator('.window[data-app="agent-studio"]');
    await expect(agentStudioWindow).toBeVisible();
    await expect(agentStudioWindow.locator('.window-title')).toHaveText('Agent Studio');
  });

  test('should launch the Config Manager app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="config-manager"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="config-manager"]');

    const configManagerWindow = page.locator('.window[data-app="config-manager"]');
    await expect(configManagerWindow).toBeVisible();
    await expect(configManagerWindow.locator('.window-title')).toHaveText('Config Manager');
  });

  test('should launch the Integration Hub app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="integration-hub"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="integration-hub"]');

    const integrationHubWindow = page.locator('.window[data-app="integration-hub"]');
    await expect(integrationHubWindow).toBeVisible();
    await expect(integrationHubWindow.locator('.window-title')).toHaveText('Integration Hub');
  });

  test('should launch the IPFS Browser app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="ipfs-browser"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="ipfs-browser"]');

    const ipfsBrowserWindow = page.locator('.window[data-app="ipfs-browser"]');
    await expect(ipfsBrowserWindow).toBeVisible();
    await expect(ipfsBrowserWindow.locator('.window-title')).toHaveText('IPFS Browser');
  });

  test('should launch the Model Dashboard app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="model-dashboard"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="model-dashboard"]');

    const modelDashboardWindow = page.locator('.window[data-app="model-dashboard"]');
    await expect(modelDashboardWindow).toBeVisible();
    await expect(modelDashboardWindow.locator('.window-title')).toHaveText('Model Dashboard');
  });

  test('should launch the Multi-Agent Dashboard app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="multi-agent-dashboard"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="multi-agent-dashboard"]');

    const multiAgentDashboardWindow = page.locator('.window[data-app="multi-agent-dashboard"]');
    await expect(multiAgentDashboardWindow).toBeVisible();
    await expect(multiAgentDashboardWindow.locator('.window-title')).toHaveText('Multi-Agent Dashboard');
  });

  test('should launch the Reasoning Studio app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="reasoning-studio"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="reasoning-studio"]');

    const reasoningStudioWindow = page.locator('.window[data-app="reasoning-studio"]');
    await expect(reasoningStudioWindow).toBeVisible();
    await expect(reasoningStudioWindow.locator('.window-title')).toHaveText('Reasoning Studio');
  });

  test('should launch the Storage Manager app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="storage-manager"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="storage-manager"]');

    const storageManagerWindow = page.locator('.window[data-app="storage-manager"]');
    await expect(storageManagerWindow).toBeVisible();
    await expect(storageManagerWindow.locator('.window-title')).toHaveText('Storage Manager');
  });

  test('should launch the TaskNet Visualizer app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="tasknet-visualizer"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="tasknet-visualizer"]');

    const taskNetVisualizerWindow = page.locator('.window[data-app="tasknet-visualizer"]');
    await expect(taskNetVisualizerWindow).toBeVisible();
    await expect(taskNetVisualizerWindow.locator('.window-title')).toHaveText('TaskNet Visualizer');
  });

  test('should launch the Tool Orchestrator app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="tool-orchestrator"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="tool-orchestrator"]');

    const toolOrchestratorWindow = page.locator('.window[data-app="tool-orchestrator"]');
    await expect(toolOrchestratorWindow).toBeVisible();
    await expect(toolOrchestratorWindow.locator('.window-title')).toHaveText('Tool Orchestrator');
  });

  test('should launch the VFS Browser app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="vfs-browser"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="vfs-browser"]');

    const vfsBrowserWindow = page.locator('.window[data-app="vfs-browser"]');
    await expect(vfsBrowserWindow).toBeVisible();
    await expect(vfsBrowserWindow.locator('.window-title')).toHaveText('VFS Browser');
  });

  test('should launch the VFS Explorer app', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('.desktop-icons .icon[data-app="vfs-explorer"]', { state: 'visible' });
    await page.click('.desktop-icons .icon[data-app="vfs-explorer"]');

    const vfsExplorerWindow = page.locator('.window[data-app="vfs-explorer"]');
    await expect(vfsExplorerWindow).toBeVisible();
    await expect(vfsExplorerWindow.locator('.window-title')).toHaveText('VFS Explorer');
  });
});
