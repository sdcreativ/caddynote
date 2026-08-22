import { useMemo } from 'react';
import { useQuery, UseQueryOptions } from '@tanstack/react-query';

interface OptimizedQueryOptions<T> extends Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'> {
  cacheTime?: number;
  staleTime?: number;
}

export function useOptimizedQuery<T>(
  queryKey: string[],
  queryFn: () => Promise<T>,
  options: OptimizedQueryOptions<T> = {}
) {
  const optimizedOptions = useMemo(() => ({
    cacheTime: 5 * 60 * 1000, // 5 minutes
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: 2,
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
    ...options,
  }), [options]);

  return useQuery({
    queryKey,
    queryFn,
    ...optimizedOptions,
  });
}

export default useOptimizedQuery;