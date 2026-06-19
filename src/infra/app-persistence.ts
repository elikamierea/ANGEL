export interface AppPersistence {
  load<T>(): T | null;
  save<T>(value: T): void;
  clear(): void;
}

export class LocalStoragePersistence implements AppPersistence {
  constructor(private readonly key: string) {}

  load<T>(): T | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) {
        return null;
      }

      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  save<T>(value: T): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(value));
    } catch {
      // ignore persistence errors in scaffold stage
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(this.key);
    } catch {
      // ignore persistence errors in scaffold stage
    }
  }
}

export class InMemoryPersistence implements AppPersistence {
  private raw: string | null = null;

  load<T>(): T | null {
    if (!this.raw) {
      return null;
    }

    return JSON.parse(this.raw) as T;
  }

  save<T>(value: T): void {
    this.raw = JSON.stringify(value);
  }

  clear(): void {
    this.raw = null;
  }
}
