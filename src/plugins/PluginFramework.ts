// src/plugins/PluginFramework.ts
export class PluginFramework {
  private plugins: Map<string, Plugin> = new Map();
  private hooks: Map<string, Hook[]> = new Map();
  private pluginLoader: PluginLoader;
  private sandboxManager: PluginSandboxManager;

  constructor() {
    this.pluginLoader = new PluginLoader();
    this.sandboxManager = new PluginSandboxManager();
    this.initializeHooks();
  }

  async loadPlugin(pluginPath: string): Promise<Plugin> {
    // Load and validate plugin
    const pluginManifest = await this.pluginLoader.loadManifest(pluginPath);
    this.validatePlugin(pluginManifest);

    // Create sandbox for plugin execution
    const sandbox = await this.sandboxManager.createSandbox(pluginManifest.permissions);

    // Load plugin code in sandbox
    const pluginCode = await this.pluginLoader.loadCode(pluginPath);
    const plugin = await sandbox.executePlugin(pluginCode);

    // Register plugin hooks
    this.registerPluginHooks(plugin);

    this.plugins.set(pluginManifest.id, plugin);
    return plugin;
  }

  private initializeHooks(): void {
    // Core hooks for extensibility
    this.registerHook('agent.before_message', []);
    this.registerHook('agent.after_message', []);
    this.registerHook('task.before_execution', []);
    this.registerHook('task.after_execution', []);
    this.registerHook('tool.before_call', []);
    this.registerHook('tool.after_call', []);
    this.registerHook('workflow.before_start', []);
    this.registerHook('workflow.after_complete', []);
  }

  async executeHook(hookName: string, context: any): Promise<any> {
    const hooks = this.hooks.get(hookName) || [];
    let modifiedContext = context;

    for (const hook of hooks) {
      try {
        modifiedContext = await hook.execute(modifiedContext);
      } catch (error) {
        console.error(`Hook ${hookName} failed:`, error);
      }
    }

    return modifiedContext;
  }
}