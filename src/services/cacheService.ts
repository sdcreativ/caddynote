// Service de cache pour optimiser les performances en production
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiry: number;
}

export class CacheService {
  private static cache = new Map<string, CacheEntry<any>>();
  private static readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes par défaut
  private static hits = 0;
  private static misses = 0;

  static set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiry: Date.now() + ttl
    };
    
    this.cache.set(key, entry);
  }

  static get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses += 1;
      return null;
    }

    // Vérifier si l'entrée a expiré
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.misses += 1;
      return null;
    }

    this.hits += 1;
    return entry.data as T;
  }

  static has(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    // Vérifier si l'entrée a expiré
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  static delete(key: string): boolean {
    return this.cache.delete(key);
  }

  static clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  static cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }

  static getStats(): {
    size: number;
    hitRate: number;
    entries: Array<{ key: string; age: number; expiresIn: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: now - entry.timestamp,
      expiresIn: entry.expiry - now
    }));
    const total = this.hits + this.misses;

    return {
      size: this.cache.size,
      hitRate: total === 0 ? 0 : this.hits / total,
      entries
    };
  }

  // Méthodes utilitaires pour des patterns courants
  static async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<T> {
    const cached = this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }

    const data = await fetcher();
    this.set(key, data, ttl);
    return data;
  }

  static generateKey(...parts: (string | number)[]): string {
    return parts.map(part => String(part)).join(':');
  }

  // Cache spécialisé pour les queries Supabase
  static async cacheQuery<T>(
    queryKey: string,
    queryFn: () => Promise<T>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<T> {
    return this.getOrSet(`query:${queryKey}`, queryFn, ttl);
  }

  // Cache pour les métriques dashboard
  static async cacheDashboardMetrics<T>(
    institutionId: string | undefined,
    metricType: string,
    fetcher: () => Promise<T>,
    ttl: number = 10 * 60 * 1000 // 10 minutes pour les métriques
  ): Promise<T> {
    const key = this.generateKey('dashboard', institutionId || 'global', metricType);
    return this.getOrSet(key, fetcher, ttl);
  }

  // Cache pour les listes d'utilisateurs
  static async cacheUserList<T>(
    institutionId: string,
    role: string,
    fetcher: () => Promise<T>,
    ttl: number = 2 * 60 * 1000 // 2 minutes pour les listes d'utilisateurs
  ): Promise<T> {
    const key = this.generateKey('users', institutionId, role);
    return this.getOrSet(key, fetcher, ttl);
  }

  // Invalider les caches liés à une institution
  static invalidateInstitution(institutionId: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.includes(institutionId) || key.includes('global')) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  // Invalider les caches liés à un utilisateur
  static invalidateUser(userId: string, institutionId?: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.includes(userId) || 
          (institutionId && key.includes(institutionId)) ||
          key.includes('users:')) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

// Démarrer le nettoyage automatique du cache
if (typeof window !== 'undefined') {
  setInterval(() => {
    CacheService.cleanup();
  }, 60 * 1000); // Nettoyer toutes les minutes
}

export default CacheService;