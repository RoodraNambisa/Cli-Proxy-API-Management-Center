import type { Config } from '@/types';

export const shouldShowLogsNavigation = (config?: Config | null): boolean =>
  Boolean(config?.loggingToFile || config?.remoteManagement?.liveLogs?.enabled);
