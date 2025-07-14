export interface ApplicationState {
  // Define your application state structure here
  // Example:
  // terminal: {
  //   cwd: string;
  //   history: string[];
  // };
  // ai: {
  //   currentModel: string;
  //   providers: any[];
  // };
  // tasks: {
  //   list: any[];
  //   statistics: any;
  // };
  // config: {
  //   [key: string]: any;
  // };
}

export interface StateSubscriber {
  onStateChange(path: string, value: any): void;
}

export class StateManager {
  private state: ApplicationState = {};
  private subscribers: Map<string, StateSubscriber[]> = new Map();
  
  updateState(path: string, value: any): void {
    this.setState(path, value);
    this.notifySubscribers(path, value);
  }
  
  private setState(path: string, value: any): void {
    // Simple deep merge for state updates
    const pathParts = path.split('.');
    let current: any = this.state;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    current[pathParts[pathParts.length - 1]] = value;
  }

  getState(path: string): any {
    const pathParts = path.split('.');
    let current: any = this.state;
    for (const part of pathParts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    return current;
  }

  private notifySubscribers(path: string, value: any): void {
    const subscribers = this.subscribers.get(path) || [];
    for (const subscriber of subscribers) {
      try {
        subscriber.onStateChange(path, value);
      } catch (error) {
        logError(`Error notifying subscriber for ${path}:`, error);
      }
    }
  }
  
  subscribe(path: string, subscriber: StateSubscriber): void {
    if (!this.subscribers.has(path)) {
      this.subscribers.set(path, []);
    }
    this.subscribers.get(path)!.push(subscriber);
  }

  unsubscribe(path: string, subscriber: StateSubscriber): void {
    const subscribers = this.subscribers.get(path);
    if (subscribers) {
      this.subscribers.set(path, subscribers.filter(s => s !== subscriber));
    }
  }
}
