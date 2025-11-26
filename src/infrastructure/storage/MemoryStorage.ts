import { IPolicyStorage } from '../../domain/interfaces/IPolicyStorage';

/**
 * In-memory implementation of IPolicyStorage.
 * Used as the default storage when no persistent backend is provided.
 */
export class MemoryStorage implements IPolicyStorage {
  private store: Map<string, any>;

  constructor() {
    this.store = new Map();
  }

  async get<T>(key: string): Promise<T | null> {
    return this.store.get(key) || null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

