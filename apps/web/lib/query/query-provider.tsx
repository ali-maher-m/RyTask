'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { ApiError } from '../api';

/**
 * TanStack Query provider (D7). Server-state cache for every list/detail read and the home of
 * optimistic mutations (onMutate snapshot → rollback → reconcile — D15). Created once, lazily,
 * so the cache survives client navigations but never leaks across requests on the server. Auth
 * is already handled by the fetch layer (silent refresh), so a `401`/`403`/`404` is not retried.
 */
function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status)) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
