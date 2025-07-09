declare global {
  interface Window {
    SwissKnife: any;
    desktop: any;
    APIKeysApp: any;
    showAbout: () => void;
    openTerminalHere: () => void;
    createNewFile: () => void;
    createNewFolder: () => void;
    refreshDesktop: () => void;
    showDesktopProperties: () => void;
    showNotification: (message: string, type?: string, duration?: number) => void;
  }
}

declare module "*.js";

declare class DesktopCore {
  windows: Map<string, any>;
  windowCounter: number;
  activeWindow: any;
  apps: Map<string, any>;
  swissknife: any;
  isSwissKnifeReady: boolean;
  enhancer: any;
  currentTheme: string;
  dragState: any;
  currentAppWindowId: string | null;

  constructor();
  init(): Promise<void>;
  debugDOMStructure(): void;
  initializeDesktop(): void;
  initializeEnhancer(): Promise<void>;
  initializeTheme(): void;
  addThemeToggle(): void;
  setTheme(theme: string): void;
  toggleTheme(): void;
  initializeApps(): void;
  launchApp(appId: string): Promise<void>;
  openApp(appId: string, options?: any): Promise<any>;
  createWindow(options: any): Promise<any>;
  loadAppComponent(window: any, componentName: string): Promise<void>;
  loadCronApp(contentElement: HTMLElement): void;
  initializeCronApp(contentElement: HTMLElement): void;
  createNewCron(contentElement: HTMLElement): void;
  calculateNextRun(scheduleType: string, time: string): string;
  scheduleCronJob(cronData: any): void;
  executeCronJob(cronData: any): Promise<void>;
  refreshActiveCrons(contentElement: HTMLElement): void;
  formatSchedule(cronData: any): string;
  showNotification(message: string, type?: string): void;
  setupWindowControls(windowElement: HTMLElement): void;
  makeWindowDraggable(windowElement: HTMLElement): void;
  addResizeHandles(windowElement: HTMLElement): void;
  startResize(windowElement: HTMLElement, direction: string, e: MouseEvent): void;
  focusWindow(windowElement: HTMLElement): void;
  minimizeWindow(windowElement: HTMLElement): void;
  toggleMaximizeWindow(windowElement: HTMLElement): void;
  closeWindow(windowElement: HTMLElement): void;
  addToTaskbar(window: any): void;
  removeFromTaskbar(window: any): void;
  updateTaskbar(): void;
  updateSystemTime(): void;
  updateSystemStatus(): void;
  setupContextMenu(): void;
  setupWindowSnapping(): void;
  createSnapZones(): void;
  handleWindowDragSnapping(e: MouseEvent): void;
  isInTriggerArea(mouseX: number, mouseY: number, trigger: any): boolean;
  showSnapPreview(zone: any): void;
  handleWindowSnapRelease(e: MouseEvent): void;
  snapWindowToZone(windowElement: HTMLElement, zone: any): void;
  unSnapWindow(windowElement: HTMLElement): void;
  setupDragBoundaries(): void;
  handleKeyboardShortcuts(e: KeyboardEvent): void;
  showContextMenu(x: number, y: number): void;
  showTaskbarContextMenu(x: number, y: number): void;
  showTaskbarAppContextMenu(x: number, y: number, windowId: string): void;
  handleTaskbarMenuAction(action: string): void;
  handleAppMenuAction(action: string, windowId: string): void;
  showAboutDialog(): void;
  startSystemMonitoring(): void;
  updateSystemMetrics(): void;
  calculateFPS(): number;
  loadExistingCrons(): void;
  loadAPIKeysApp(contentElement: HTMLElement): Promise<void>;
  loadMCPControlApp(contentElement: HTMLElement): void;
  loadTaskManagerApp(contentElement: HTMLElement): void;
}
