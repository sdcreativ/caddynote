import React, { Suspense, lazy, memo } from 'react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ErrorBoundary from '@/components/common/ErrorBoundary';

interface LazyComponentProps {
  importFunction: () => Promise<{ default: React.ComponentType<any> }>;
  fallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
  props?: any;
}

const LazyComponent: React.FC<LazyComponentProps> = memo(({
  importFunction,
  fallback,
  errorFallback,
  props = {},
}) => {
  const Component = lazy(importFunction);

  const defaultFallback = (
    <div className="flex items-center justify-center min-h-[200px]">
      <LoadingSpinner size="lg" text="Chargement du composant..." />
    </div>
  );

  return (
    <ErrorBoundary fallback={errorFallback}>
      <Suspense fallback={fallback || defaultFallback}>
        <Component {...props} />
      </Suspense>
    </ErrorBoundary>
  );
});

LazyComponent.displayName = 'LazyComponent';

export default LazyComponent;