import { IntegrationBridge } from '../../bridge/integration-bridge';

interface Feature {
  category: string;
  name: string;
  [key: string]: any; // Allow for other properties like 'models'
}

interface MenuConfig {
  selector: string;
  title: string;
  items: MenuItem[];
}

interface MenuItem {
  label: string;
  value: string;
  action: string; // e.g., 'openApp', 'executeCommand'
  [key: string]: any;
}

export class MenuUpdater {
  private bridge: IntegrationBridge;
  private menuConfigurations: Map<string, MenuConfig> = new Map();

  constructor(bridge: IntegrationBridge) {
    this.bridge = bridge;
    // Define initial menu configurations (can be loaded from config later)
    this.menuConfigurations.set('ai-chat-menu', {
      selector: '#ai-chat-menu',
      title: 'AI Chat Models',
      items: []
    });
    this.menuConfigurations.set('task-manager-menu', {
      selector: '#task-manager-menu',
      title: 'Task Manager Actions',
      items: []
    });
    this.menuConfigurations.set('terminal-menu', {
      selector: '#terminal-menu',
      title: 'Terminal Commands',
      items: []
    });
  }

  async updateMenus(): Promise<void> {
    console.log('Updating menus for accuracy...');
    // Get actual available features from bridge
    const features = await this.bridge.getAvailableFeatures();
    const cliCommands = await this.bridge.getCLICommands();

    // Update AI Chat menu
    const aiFeatures = features.filter(f => f.category === 'ai');
    this.updateAIChatMenu(aiFeatures);
    
    // Update Task Manager menu
    const taskFeatures = features.filter(f => f.category === 'tasks');
    this.updateTaskManagerMenu(taskFeatures);
    
    // Update Terminal menu
    this.updateTerminalMenu(cliCommands);

    console.log('Menus updated.');
  }

  private updateAIChatMenu(features: Feature[]): void {
    const menuConfig = this.menuConfigurations.get('ai-chat-menu');
    if (!menuConfig) return;

    const menuElement = document.querySelector(menuConfig.selector);
    if (!menuElement) return;
    
    // Clear existing menu items
    menuElement.innerHTML = '';
    
    // Add real feature options
    for (const feature of features) {
      if (feature.models && feature.models.length > 0) {
        const modelItems = feature.models.map((model: any) => ({
          label: `${feature.name} - ${model.name} (${model.provider})`,
          value: `${feature.name}|${model.name}|${model.provider}`,
          action: 'selectAIModel',
          model: model.name,
          provider: model.provider
        }));
        modelItems.forEach((item: MenuItem) => {
          const menuItem = this.createMenuItem(item);
          menuElement.appendChild(menuItem);
        });
      } else {
        const menuItem = this.createMenuItem({
          label: feature.name,
          value: feature.name,
          action: 'openApp',
          app: feature.name
        });
        menuElement.appendChild(menuItem);
      }
    }
  }

  private updateTaskManagerMenu(features: Feature[]): void {
    const menuConfig = this.menuConfigurations.get('task-manager-menu');
    if (!menuConfig) return;

    const menuElement = document.querySelector(menuConfig.selector);
    if (!menuElement) return;

    menuElement.innerHTML = '';

    for (const feature of features) {
      if (feature.tasks && feature.tasks.length > 0) {
        const taskItems = feature.tasks.map((task: any) => ({
          label: `${feature.name} - ${task.title} (${task.status})`,
          value: `${feature.name}|${task.id}`,
          action: 'viewTask',
          taskId: task.id
        }));
        taskItems.forEach((item: MenuItem) => {
          const menuItem = this.createMenuItem(item);
          menuElement.appendChild(menuItem);
        });
      } else {
        const menuItem = this.createMenuItem({
          label: feature.name,
          value: feature.name,
          action: 'openApp',
          app: feature.name
        });
        menuElement.appendChild(menuItem);
      }
    }
  }

  private updateTerminalMenu(commands: string[]): void {
    const menuConfig = this.menuConfigurations.get('terminal-menu');
    if (!menuConfig) return;

    const menuElement = document.querySelector(menuConfig.selector);
    if (!menuElement) return;

    menuElement.innerHTML = '';

    commands.forEach(command => {
      const menuItem = this.createMenuItem({
        label: command,
        value: command,
        action: 'executeCLICommand',
        command: command
      });
      menuElement.appendChild(menuItem);
    });
  }

  private createMenuItem(item: MenuItem): HTMLElement {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = item.label;
    a.dataset.action = item.action;
    a.dataset.value = item.value;
    // Add other data attributes as needed
    for (const key in item) {
      if (item.hasOwnProperty(key) && key !== 'label' && key !== 'value' && key !== 'action') {
        a.dataset[key] = String(item[key]);
      }
    }
    li.appendChild(a);
    return li;
  }
}
