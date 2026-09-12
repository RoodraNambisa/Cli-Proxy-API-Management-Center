import { describe, expect, test } from 'vitest';
import {
  ALL_PRIORITY_FILTER,
  UNSET_PRIORITY_FILTER,
  getAvailablePlanFilters,
  getAvailablePriorityFilters,
  matchesAuthFilePlanFilter,
  matchesAuthFilePriorityFilter,
  normalizeAuthFilePriorityFilter,
} from '@/features/authFiles/linkedFilters';
import type { AuthFileItem } from '@/types';

const files: AuthFileItem[] = [
  { name: 'pro-4.json', type: 'codex', plan_type: 'pro', priority: 4 },
  { name: 'team-4.json', type: 'codex', plan_type: 'team', priority: 4 },
  { name: 'team-1.json', type: 'codex', plan_type: 'team', priority: 1 },
  { name: 'free-1.json', type: 'codex', plan_type: 'free', priority: 1 },
  { name: 'free-unset.json', type: 'codex', plan_type: 'free' },
  { name: 'xai-4.json', type: 'xai', priority: 4 },
];

describe('linked auth file filters', () => {
  test('limits plan choices to the selected priority', () => {
    expect(getAvailablePlanFilters(files, '4')).toEqual(['pro', 'team']);
    expect(getAvailablePlanFilters(files, '1')).toEqual(['free', 'team']);
    expect(getAvailablePlanFilters(files, UNSET_PRIORITY_FILTER)).toEqual(['free']);
    expect(getAvailablePlanFilters(files, ALL_PRIORITY_FILTER)).toEqual(['free', 'pro', 'team']);
  });

  test('keeps priority choices independent from the selected plan', () => {
    expect(getAvailablePriorityFilters(files)).toEqual(['4', '1', '0']);
  });

  test('uses the same matching semantics for options and final filtering', () => {
    expect(matchesAuthFilePlanFilter(files[0], 'pro')).toBe(true);
    expect(matchesAuthFilePlanFilter(files[0], 'free')).toBe(false);
    expect(matchesAuthFilePriorityFilter(files[0], '4')).toBe(true);
    expect(matchesAuthFilePriorityFilter(files[4], UNSET_PRIORITY_FILTER)).toBe(true);
  });

  test('merges implicit and explicit zero for choices, matching and saved legacy filters', () => {
    const both = [...files, { name: 'explicit-zero.json', type: 'codex', priority: 0, plan_type: 'plus' }];
    expect(getAvailablePriorityFilters(both)).toEqual(['4', '1', '0']);
    for (const filter of ['0', UNSET_PRIORITY_FILTER]) {
      expect(both.filter((file) => matchesAuthFilePriorityFilter(file, filter)).map((file) => file.name)).toEqual(['free-unset.json', 'explicit-zero.json']);
      expect(getAvailablePlanFilters(both, filter)).toEqual(['free', 'plus']);
    }
    expect(normalizeAuthFilePriorityFilter(UNSET_PRIORITY_FILTER)).toBe('0');
  });
});
