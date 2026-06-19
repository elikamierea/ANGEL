import { AppPersistence, InMemoryPersistence, LocalStoragePersistence } from "./app-persistence";

export interface PersistenceFactory {
  create(key: string): AppPersistence;
}

export class BrowserPersistenceFactory implements PersistenceFactory {
  create(key: string): AppPersistence {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      return new LocalStoragePersistence(key);
    }

    return new InMemoryPersistence();
  }
}

export class MemoryPersistenceFactory implements PersistenceFactory {
  private map = new Map<string, InMemoryPersistence>();

  create(key: string): AppPersistence {
    if (!this.map.has(key)) {
      this.map.set(key, new InMemoryPersistence());
    }

    return this.map.get(key)!;
  }
}
