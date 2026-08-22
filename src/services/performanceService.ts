// Service de monitoring des performances pour la production
import { CacheService } from './cacheService';

export interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface NavigationTiming {
  dns: number;
  connect: number;
  request: number;
  response: number;
  dom: number;
  load: number;
  total: number;
}

export class PerformanceService {
  private static metrics: PerformanceMetric[] = [];
  private static readonly MAX_METRICS = 1000;

  // Mesurer le temps d'exécution d'une fonction
  static async measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const start = performance.now();
    
    try {
      const result = await fn();
      const duration = performance.now() - start;
      
      this.recordMetric({
        name,
        value: duration,
        timestamp: Date.now(),
        metadata: { ...metadata, status: 'success' }
      });
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      
      this.recordMetric({
        name,
        value: duration,
        timestamp: Date.now(),
        metadata: { 
          ...metadata, 
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        }
      });
      
      throw error;
    }
  }

  // Mesurer le temps d'exécution d'une fonction synchrone
  static measure<T>(
    name: string,
    fn: () => T,
    metadata?: Record<string, any>
  ): T {
    const start = performance.now();
    
    try {
      const result = fn();
      const duration = performance.now() - start;
      
      this.recordMetric({
        name,
        value: duration,
        timestamp: Date.now(),
        metadata: { ...metadata, status: 'success' }
      });
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      
      this.recordMetric({
        name,
        value: duration,
        timestamp: Date.now(),
        metadata: { 
          ...metadata, 
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        }
      });
      
      throw error;
    }
  }

  // Enregistrer une métrique personnalisée
  static recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    
    // Garder seulement les dernières métriques
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }

    // Log en console pour debug (seulement si pas en production)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📊 Performance: ${metric.name} took ${metric.value.toFixed(2)}ms`, metric.metadata);
    }
  }

  // Obtenir les métriques de navigation
  static getNavigationTiming(): NavigationTiming | null {
    if (typeof window === 'undefined' || !window.performance.navigation) {
      return null;
    }

    const timing = window.performance.timing;
    const navigationStart = timing.navigationStart;

    return {
      dns: timing.domainLookupEnd - timing.domainLookupStart,
      connect: timing.connectEnd - timing.connectStart,
      request: timing.responseStart - timing.requestStart,
      response: timing.responseEnd - timing.responseStart,
      dom: timing.domContentLoadedEventEnd - timing.domContentLoadedEventStart,
      load: timing.loadEventEnd - timing.loadEventStart,
      total: timing.loadEventEnd - navigationStart
    };
  }

  // Obtenir les métriques Web Vitals
  static getWebVitals(): Promise<{
    fcp?: number; // First Contentful Paint
    lcp?: number; // Largest Contentful Paint
    fid?: number; // First Input Delay
    cls?: number; // Cumulative Layout Shift
  }> {
    return new Promise((resolve) => {
      const vitals: any = {};

      // FCP (First Contentful Paint)
      if ('PerformanceObserver' in window) {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.name === 'first-contentful-paint') {
                vitals.fcp = entry.startTime;
              }
            }
          });
          observer.observe({ entryTypes: ['paint'] });
        } catch (e) {
          console.warn('FCP measurement not available');
        }

        // LCP (Largest Contentful Paint)
        try {
          const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1];
            vitals.lcp = lastEntry.startTime;
          });
          lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        } catch (e) {
          console.warn('LCP measurement not available');
        }

        // CLS (Cumulative Layout Shift)
        try {
          let clsValue = 0;
          const clsObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!(entry as any).hadRecentInput) {
                clsValue += (entry as any).value;
              }
            }
            vitals.cls = clsValue;
          });
          clsObserver.observe({ entryTypes: ['layout-shift'] });
        } catch (e) {
          console.warn('CLS measurement not available');
        }
      }

      // Résoudre après un délai pour collecter les métriques
      setTimeout(() => resolve(vitals), 3000);
    });
  }

  // Obtenir un résumé des métriques
  static getMetricsSummary(timeWindow: number = 60000): {
    totalRequests: number;
    averageResponseTime: number;
    errorRate: number;
    slowQueries: PerformanceMetric[];
    cacheStats: any;
  } {
    const now = Date.now();
    const recentMetrics = this.metrics.filter(
      metric => now - metric.timestamp <= timeWindow
    );

    const totalRequests = recentMetrics.length;
    const errors = recentMetrics.filter(
      metric => metric.metadata?.status === 'error'
    );
    
    const averageResponseTime = totalRequests > 0 
      ? recentMetrics.reduce((sum, metric) => sum + metric.value, 0) / totalRequests
      : 0;

    const errorRate = totalRequests > 0 ? errors.length / totalRequests : 0;
    
    const slowQueries = recentMetrics
      .filter(metric => metric.value > 1000) // Plus de 1 seconde
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return {
      totalRequests,
      averageResponseTime,
      errorRate,
      slowQueries,
      cacheStats: CacheService.getStats()
    };
  }

  // Marquer le début d'une mesure
  static startMark(name: string): void {
    if (typeof window !== 'undefined' && window.performance.mark) {
      window.performance.mark(`${name}-start`);
    }
  }

  // Marquer la fin d'une mesure et calculer la durée
  static endMark(name: string, metadata?: Record<string, any>): number {
    if (typeof window !== 'undefined' && window.performance.mark && window.performance.measure) {
      window.performance.mark(`${name}-end`);
      window.performance.measure(name, `${name}-start`, `${name}-end`);
      
      const measures = window.performance.getEntriesByName(name, 'measure');
      if (measures.length > 0) {
        const duration = measures[measures.length - 1].duration;
        
        this.recordMetric({
          name,
          value: duration,
          timestamp: Date.now(),
          metadata
        });
        
        return duration;
      }
    }
    
    return 0;
  }

  // Optimisations automatiques
  static enableAutoOptimizations(): void {
    // Précharger les ressources critiques
    this.preloadCriticalResources();
    
    // Optimiser les images
    this.optimizeImages();
    
    // Lazy loading automatique
    this.enableLazyLoading();
  }

  private static preloadCriticalResources(): void {
    // Précharger les polices importantes
    const criticalFonts = [
      '/fonts/inter.woff2',
      '/fonts/inter-bold.woff2'
    ];

    criticalFonts.forEach(font => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = font;
      link.as = 'font';
      link.type = 'font/woff2';
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });
  }

  private static optimizeImages(): void {
    // Observer pour lazy loading des images
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
              imageObserver.unobserve(img);
            }
          }
        });
      });

      // Observer les images avec data-src
      document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
      });
    }
  }

  private static enableLazyLoading(): void {
    // Lazy loading pour les composants
    if ('IntersectionObserver' in window) {
      const componentObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const element = entry.target as HTMLElement;
            if (element.dataset.component) {
              // Déclencher le chargement du composant
              element.dispatchEvent(new CustomEvent('lazy-load'));
              componentObserver.unobserve(element);
            }
          }
        });
      });

      document.querySelectorAll('[data-component]').forEach(el => {
        componentObserver.observe(el);
      });
    }
  }

  // Générer un rapport de performance
  static generateReport(): {
    navigation: NavigationTiming | null;
    metrics: PerformanceMetric[];
    summary: ReturnType<typeof PerformanceService.getMetricsSummary>;
    recommendations: string[];
  } {
    const navigation = this.getNavigationTiming();
    const summary = this.getMetricsSummary();
    const recommendations: string[] = [];

    // Analyser et générer des recommandations
    if (summary.averageResponseTime > 2000) {
      recommendations.push('Temps de réponse élevé - optimiser les requêtes database');
    }
    
    if (summary.errorRate > 0.05) {
      recommendations.push('Taux d\'erreur élevé - vérifier la gestion d\'erreurs');
    }
    
    if (summary.cacheStats.size === 0) {
      recommendations.push('Cache non utilisé - implémenter une stratégie de cache');
    }

    if (navigation && navigation.total > 3000) {
      recommendations.push('Temps de chargement initial élevé - optimiser les assets');
    }

    return {
      navigation,
      metrics: this.metrics,
      summary,
      recommendations
    };
  }
}

export default PerformanceService;