// Performance utilities for CaddyNote

export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): T => {
  let timeout: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  }) as T;
};

export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): T => {
  let inThrottle: boolean;
  return ((...args: any[]) => {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  }) as T;
};

export const memoize = <T extends (...args: any[]) => any>(fn: T): T => {
  const cache = new Map();
  return ((...args: any[]) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const measurePerformance = (name: string) => {
  const start = performance.now();
  return () => {
    if (!import.meta.env.DEV) return;
    const end = performance.now();
    console.log(`⚡ ${name}: ${(end - start).toFixed(2)}ms`);
  };
};

export const batchOperations = <T>(
  operations: Array<() => Promise<T>>,
  batchSize: number = 5
): Promise<T[]> => {
  const batches = [];
  for (let i = 0; i < operations.length; i += batchSize) {
    batches.push(operations.slice(i, i + batchSize));
  }

  return batches.reduce(async (acc, batch) => {
    const results = await acc;
    const batchResults = await Promise.all(batch.map(op => op()));
    return [...results, ...batchResults];
  }, Promise.resolve([] as T[]));
};