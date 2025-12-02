/**
 * Interface for policy state storage (e.g., Memory, Redis, SQL)
 * Follows the Repository pattern to abstract data persistence.
 */
export interface IPolicyStorage {
  /**
   * Retrieve a value by key
   * @param key Unique identifier for the data
   * @returns The value if found, null otherwise
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Save a value by key
   * @param key Unique identifier for the data
   * @param value The data to store
   * @param ttlSeconds Optional time-to-live in seconds
   */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Delete a value by key
   * @param key Unique identifier
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all data (mainly for testing/reset)
   */
  clear(): Promise<void>;

  /**
   * Export all data (for serialization)
   */
  export?(): Promise<Record<string, any>>;

  /**
   * Import data (for deserialization)
   */
  import?(data: Record<string, any>): Promise<void>;
}

