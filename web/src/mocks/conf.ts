class MockConf {
  private store: Map<string, any>;

  constructor() {
    this.store = new Map();
    try {
      const storedData = localStorage.getItem('mock-conf-store');
      if (storedData) {
        this.store = new Map(JSON.parse(storedData));
      }
    } catch (e) {
      console.error("Failed to load mock-conf-store from localStorage", e);
    }
  }

  get(key: string, defaultValue?: any): any {
    if (this.store.has(key)) {
      return this.store.get(key);
    }
    return defaultValue;
  }

  set(key: string, value: any): void {
    this.store.set(key, value);
    this.saveToLocalStorage();
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  delete(key: string): void {
    this.store.delete(key);
    this.saveToLocalStorage();
  }

  clear(): void {
    this.store.clear();
    this.saveToLocalStorage();
  }

  private saveToLocalStorage(): void {
    try {
      localStorage.setItem('mock-conf-store', JSON.stringify(Array.from(this.store.entries())));
    } catch (e) {
      console.error("Failed to save mock-conf-store to localStorage", e);
    }
  }
}

export default MockConf;