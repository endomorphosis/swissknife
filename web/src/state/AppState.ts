// web/src/state/AppState.ts
export class AppState {
  private stores: Map<string, StateStore> = new Map();
  
  getStore<T>(name: string): StateStore<T> {
    return this.stores.get(name) as StateStore<T>;
  }
  
  subscribeToChanges(callback: StateChangeCallback): void {
    // Real-time state updates
  }
}