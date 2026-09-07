import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';
import { useVisualConfig, getVisualConfigValidationErrors } from '@/hooks/useVisualConfig';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import { CONFIG_SEARCH_DEFINITIONS } from '@/components/config/configCatalog';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

describe('shared streaming keepalive', () => {
  test('saves and reloads the existing field without a separate WebSocket setting', () => {
    const original = 'streaming:\n  keepalive-seconds: 15\n  unknown-option: keep\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    act(() => result.current.setVisualValues({ streaming: { ...result.current.visualValues.streaming, keepaliveSeconds: '7' } }));
    expect(result.current.visualDirtyFields).toContain('streaming.keepaliveSeconds');
    const saved = result.current.applyVisualChangesToYaml(original);
    expect(parse(saved).streaming).toMatchObject({ 'keepalive-seconds': 7, 'unknown-option': 'keep' });
    expect(parse(saved).streaming).not.toHaveProperty('websocket-keepalive-seconds');
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualValues.streaming.keepaliveSeconds).toBe('7');
    expect(result.current.visualDirty).toBe(false);
  });
  test.each(['', '0', '1', '9223372036', '-1', '1.5', '9223372037'])('validates interval %s', (value) => {
    const errors = getVisualConfigValidationErrors({ ...DEFAULT_VISUAL_VALUES, streaming: { ...DEFAULT_VISUAL_VALUES.streaming, keepaliveSeconds: value } });
    expect(Boolean(errors['streaming.keepaliveSeconds'])).toBe(['-1', '1.5', '9223372037'].includes(value));
  });
  test('explains Ping, hot updates, and limits in all four locales and search', () => {
    for (const locale of [en, ru, zhCN, zhTW]) {
      const hint = locale.config_management.visual.sections.streaming.keepalive_hint;
      expect(hint).toContain('WebSocket');
      expect(hint).toContain('Ping');
      expect(hint).toContain('9223372036');
    }
    expect(CONFIG_SEARCH_DEFINITIONS.find((entry) => entry.id === 'config-streaming')?.aliases).toContain('Ping');
  });
});
