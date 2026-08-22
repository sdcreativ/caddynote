// Cache utilities for CaddyNote

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class MemoryCache {
  private cache = new Map<string, CacheItem<any>>();

  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    const now = Date.now();
    if (now - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidatePattern(pattern: RegExp): void {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // Nettoyage automatique des éléments expirés
  cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Instance globale du cache
export const cache = new MemoryCache();

// Nettoyage automatique toutes les 5 minutes
setInterval(() => {
  cache.cleanup();
}, 5 * 60 * 1000);

// Helper functions
export const getCachedData = <T>(key: string): T | null => cache.get<T>(key);

export const setCachedData = <T>(key: string, data: T, ttl?: number): void => 
  cache.set(key, data, ttl);

export const invalidateCache = (key: string): void => cache.invalidate(key);

export const invalidateCachePattern = (pattern: RegExp): void => 
  cache.invalidatePattern(pattern);

// Cache keys for different data types
export const CACHE_KEYS = {
  INSTITUTIONS: 'institutions',
  CLASSES: (institutionId: string) => `classes:${institutionId}`,
  STUDENTS: (classId: string) => `students:${classId}`,
  ATTENDANCE: (classId: string, date: string) => `attendance:${classId}:${date}`,
  NOTIFICATIONS: (userId: string) => `notifications:${userId}`,
  USER_PROFILE: (userId: string) => `profile:${userId}`,
} as const;