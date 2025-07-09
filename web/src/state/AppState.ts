// web/src/state/AppState.ts
type StateStore<T> = any;
type StateChangeCallback = (state: any) => void;

export class AppState {
  private stores: Map<string, StateStore<any>> = new Map();
  
  getStore<T>(name: string): StateStore<T> {
    return this.stores.get(name) as StateStore<T>;
  }
  
  subscribeToChanges(callback: StateChangeCallback): void {
    // Real-time state updates
  }
}