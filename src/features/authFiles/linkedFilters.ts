import type { AuthFileItem } from '@/types';
import { resolveCodexPlanType } from '@/utils/quota';
import { parsePriorityValue } from './constants';

export const ALL_PLAN_FILTER = 'all';
export const ALL_PRIORITY_FILTER = 'all';
export const UNSET_PRIORITY_FILTER = '__unset__';

export const matchesAuthFilePlanFilter = (file: AuthFileItem, planFilter: string): boolean =>
  planFilter === ALL_PLAN_FILTER || resolveCodexPlanType(file) === planFilter;

export const matchesAuthFilePriorityFilter = (
  file: AuthFileItem,
  priorityFilter: string
): boolean => {
  if (priorityFilter === ALL_PRIORITY_FILTER) return true;

  const priority = parsePriorityValue(file.priority ?? file['priority']);
  return priorityFilter === UNSET_PRIORITY_FILTER
    ? priority === undefined
    : priority !== undefined && String(priority) === priorityFilter;
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

export const getAvailablePriorityFilters = (
  files: readonly AuthFileItem[],
  planFilter: string
): string[] => {
  const priorities = new Set<number>();
  let hasUnsetPriority = false;

  files.forEach((file) => {
    if (!matchesAuthFilePlanFilter(file, planFilter)) return;
    const priority = parsePriorityValue(file.priority ?? file['priority']);
    if (priority === undefined) {
      hasUnsetPriority = true;
      return;
    }
    priorities.add(priority);
  });

  return [
    ...Array.from(priorities)
      .sort((a, b) => b - a)
      .map(String),
    ...(hasUnsetPriority ? [UNSET_PRIORITY_FILTER] : []),
  ];
};
