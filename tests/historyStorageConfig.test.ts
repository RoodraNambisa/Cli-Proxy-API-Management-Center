import { act, renderHook } from '@testing-library/react';
import { parse as parseYaml } from 'yaml';
import { describe, expect, test } from 'vitest';
import { CONFIG_SEARCH_DEFINITIONS } from '@/components/config/configCatalog';
import { getVisualConfigValidationErrors, useVisualConfig } from '@/hooks/useVisualConfig';
import { normalizeStorageHistory, normalizeStartupStatus } from '@/services/api/historyStorage';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import enLocale from '@/i18n/locales/en.json';
import ruLocale from '@/i18n/locales/ru.json';
import zhCNLocale from '@/i18n/locales/zh-CN.json';
import zhTWLocale from '@/i18n/locales/zh-TW.json';

describe('startup and history storage configuration', () => {
  test('loads camel aliases and saves canonical kebab keys without legacy duplicates', () => {
    const yaml = [
      'usage-statistics-enabled: true',
      'usageStatisticsPersistenceEnabled: false',
      'usageStatisticsPersistIntervalSeconds: 15',
      'usageStatisticsDetailRetentionDays: 7',
      'usageStatisticsMaxStorageMegabytes: 256',
      'logsMaxTotalSizeMb: 128',
      'logsRetentionDays: 3',
      '',
    ].join('\n');
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      expect(result.current.loadVisualValuesFromYaml(yaml)).toEqual({ ok: true });
    });
    expect(result.current.visualValues).toMatchObject({
      usageStatisticsPersistenceEnabled: false,
      usageStatisticsPersistIntervalSeconds: '15',
      usageStatisticsDetailRetentionDays: '7',
      usageStatisticsMaxStorageMegabytes: '256',
      logsMaxTotalSizeMb: '128',
      logsRetentionDays: '3',
    });

    act(() => {
      result.current.setVisualValues({
        usageStatisticsPersistenceEnabled: true,
        usageStatisticsDetailRetentionDays: '14',
      });
    });
    const saved = parseYaml(result.current.applyVisualChangesToYaml(yaml)) as Record<
      string,
      unknown
    >;
    expect(saved).toMatchObject({
      'usage-statistics-persistence-enabled': true,
      'usage-statistics-persist-interval-seconds': 15,
      'usage-statistics-detail-retention-days': 14,
      'usage-statistics-max-storage-megabytes': 256,
      'logs-max-total-size-mb': 128,
      'logs-retention-days': 3,
    });
    for (const alias of [
      'usageStatisticsPersistenceEnabled',
      'usageStatisticsPersistIntervalSeconds',
      'usageStatisticsDetailRetentionDays',
      'usageStatisticsMaxStorageMegabytes',
      'logsMaxTotalSizeMb',
      'logsRetentionDays',
    ]) {
      expect(Object.keys(saved)).not.toContain(alias);
    }
  });

  test('keeps legacy persistence enabled by default and rejects negative policies', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => {
      result.current.loadVisualValuesFromYaml('usage-statistics-enabled: true\n');
    });
    expect(result.current.visualValues.usageStatisticsPersistenceEnabled).toBe(true);

    const values = {
      ...DEFAULT_VISUAL_VALUES,
      logsRetentionDays: '-1',
      usageStatisticsDetailRetentionDays: '-2',
      usageStatisticsMaxStorageMegabytes: '-3',
    };
    expect(getVisualConfigValidationErrors(values)).toMatchObject({
      logsRetentionDays: 'non_negative_integer',
      usageStatisticsDetailRetentionDays: 'non_negative_integer',
      usageStatisticsMaxStorageMegabytes: 'non_negative_integer',
    });
  });

  test('indexes the complete storage policy in configuration search', () => {
    const usage = CONFIG_SEARCH_DEFINITIONS.find((item) => item.id === 'config-usage-statistics');
    const logs = CONFIG_SEARCH_DEFINITIONS.find((item) => item.id === 'config-logging');
    expect(usage?.yamlKeys).toEqual(
      expect.arrayContaining([
        'usage-statistics-persistence-enabled',
        'usage-statistics-detail-retention-days',
        'usage-statistics-max-storage-megabytes',
      ])
    );
    expect(logs?.yamlKeys).toContain('logs-retention-days');
  });

  test('normalizes missing and malformed management snapshots without NaN values', () => {
    expect(normalizeStartupStatus({ phase: 'ready', ready: true, stages: null })).toMatchObject({
      phase: 'ready',
      ready: true,
      stages: [],
    });
    const history = normalizeStorageHistory({
      usage: { detail_count: '12', meta: { total_requests: '90' }, storage: null },
      logs: { storage: { file_count: '3', total_bytes: '4096' } },
    });
    expect(history.usage.detail_count).toBe(12);
    expect(history.usage.total_requests).toBe(90);
    expect(history.usage.storage.total_bytes).toBe(0);
    expect(history.logs.storage.file_count).toBe(3);
    expect(history.logs.storage.total_bytes).toBe(4096);
  });

  test('ships configuration and management copy in every supported locale', () => {
    for (const locale of [enLocale, ruLocale, zhCNLocale, zhTWLocale]) {
      const system = locale.config_management.visual.sections.system;
      expect(system.usage_statistics_persistence).toBeTruthy();
      expect(system.usage_statistics_retention_days).toBeTruthy();
      expect(system.usage_statistics_max_storage).toBeTruthy();
      expect(system.logs_retention_days).toBeTruthy();
      expect(locale.dashboard.usage_statistics_shutdown_only).toBeTruthy();
      expect(locale.system_info.startup.title).toBeTruthy();
      expect(locale.system_info.history_storage.cleanup_usage).toBeTruthy();
    }
  });
});
