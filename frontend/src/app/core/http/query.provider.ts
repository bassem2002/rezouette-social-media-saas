import type { Provider } from '@angular/core';
import {
  QueryClient,
  provideTanStackQuery,
} from '@tanstack/angular-query-experimental';

/// Provider TanStack Query pour l'application. Les valeurs par défaut
/// reproduisent le front React d'origine (`staleTime` 5 min, `retry` 1) afin de
/// conserver exactement le même comportement de cache/rafraîchissement.
export function provideAppQuery(): Provider[] {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        retry: 1,
      },
    },
  });

  return provideTanStackQuery(queryClient);
}
