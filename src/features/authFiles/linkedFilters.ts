import type { AuthFileItem } from '@/types';
import { resolveCodexPlanType } from '@/utils/quota';
import { parsePriorityValue } from './constants';

export const ALL_PLAN_FILTER = 'all';
export const ALL_PRIORITY_FILTER = 'all';
export const UNSET_PRIORITY_FILTER = '__unset__';

export const normalizeAuthFilePriorityFilter = (value: string): string =>
  value === UNSET_PRIORITY_FILTER ? '0' : value;

export const matchesAuthFilePlanFilter = (file: AuthFileItem, planFilter: string): boolean =>
  planFilter === ALL_PLAN_FILTER || resolveCodexPlanType(file) === planFilter;

export const matchesAuthFilePriorityFilter = (
  file: AuthFileItem,
  priorityFilter: string
): boolean => {
  if (priorityFilter === ALL_PRIORITY_FILTER) return true;

  const priority = parsePriorityValue(file.priority ?? file['priority']) ?? 0;
  return String(priority) === normalizeAuthFilePriorityFilter(priorityFilter);
};

export const getAvailablePlanFilters = (
  files: readonly AuthFileItem[],
  priorityFilter: string
): string[] => {
  const plans = new Set<string>();
  files.forEach((file) => {
    if (!matchesAuthFilePriorityFilter(file, priorityFilter)) return;
    const planType = resolveCodexPlanType(file);
    if (planType) plans.add(planType);
  });
  return Array.from(plans).sort((a, b) => a.localeCompare(b));
};

export const getAvailablePriorityFilters = (files: readonly AuthFileItem[]): string[] => {
  const priorities = new Set<number>();
  files.forEach((file) => {
    const priority = parsePriorityValue(file.priority ?? file['priority']) ?? 0;
    priorities.add(priority);
  });

  return Array.from(priorities).sort((a, b) => b - a).map(String);
};
