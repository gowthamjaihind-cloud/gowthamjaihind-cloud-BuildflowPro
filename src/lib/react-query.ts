import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const queryKeys = {
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  tasks: (projectId: string) => ['tasks', projectId] as const,
  task: (projectId: string, taskId: string) => ['task', projectId, taskId] as const,
  inventory: (projectId: string) => ['inventory', projectId] as const,
  inventoryItem: (projectId: string, itemId: string) => ['inventory', projectId, itemId] as const,
  inventoryConfig: (projectId: string) => ['inventoryConfig', projectId] as const,
  laborRates: (projectId: string) => ['laborRates', projectId] as const,
  laborLogs: (projectId: string) => ['laborLogs', projectId] as const,
  vendors: (projectId: string) => ['vendors', projectId] as const,
  receipts: (projectId: string) => ['receipts', projectId] as const,
  ledgers: (projectId: string) => ['ledgers', projectId] as const,
  documents: (projectId: string) => ['documents', projectId] as const,
  materialIssues: (projectId: string) => ['materialIssues', projectId] as const,
  dailyReports: (projectId: string) => ['dailyReports', projectId] as const,
};
