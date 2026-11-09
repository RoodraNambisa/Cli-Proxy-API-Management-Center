import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { useVisualConfig } from './useVisualConfig';
import en from '@/i18n/locales/en.json';
import cn from '@/i18n/locales/zh-CN.json';
import tw from '@/i18n/locales/zh-TW.json';
import ru from '@/i18n/locales/ru.json';
import { CONFIG_SEARCH_DEFINITIONS } from '@/components/config/configCatalog';
describe('Web image refill YAML', () => {
  it('preserves implicit defaults and unrelated source fields', () => {
    const { result } = renderHook(() => useVisualConfig());
    const source = '# keep\nport: 8317\nimages:\n  chatgpt-web:\n    future: keep\n';
    act(() => result.current.loadVisualValuesFromYaml(source));
    expect(result.current.visualValues.chatgptWebNAggregationMaxRetries).toBe('1');
    expect(result.current.visualValues.chatgptWebNAggregationReturnPartial).toBe(false);
    act(() => result.current.setVisualValues({ port: '8318' }));
    expect(result.current.applyVisualChangesToYaml(source)).not.toContain(
      'n-aggregation-max-retries'
    );
    act(() =>
      result.current.setVisualValues({
        chatgptWebNAggregationMaxRetries: '0',
        chatgptWebNAggregationReturnPartial: true,
      })
    );
    const saved = result.current.applyVisualChangesToYaml(source);
    expect(parse(saved).images['chatgpt-web']).toMatchObject({
      'n-aggregation-max-retries': 0,
      'n-aggregation-return-partial': true,
      future: 'keep',
    });
    expect(saved).toContain('# keep');
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualDirty).toBe(false);
    act(() => result.current.setVisualValues({ chatgptWebNAggregationReturnPartial: false }));
    expect(
      parse(result.current.applyVisualChangesToYaml(saved)).images['chatgpt-web'][
        'n-aggregation-return-partial'
      ]
    ).toBe(false);
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualValues.chatgptWebNAggregationReturnPartial).toBe(true);
  });
  it('validates the retry bound and preserves fresh server changes to untouched fields', () => {
    const { result } = renderHook(() => useVisualConfig());
    const source = 'images:\n  chatgpt-web:\n    n-aggregation-max-retries: 1\n';
    act(() => result.current.loadVisualValuesFromYaml(source));
    for (const value of ['-1', '4', '1.5']) {
      act(() => result.current.setVisualValues({ chatgptWebNAggregationMaxRetries: value }));
      expect(result.current.visualValidationErrors.chatgptWebNAggregationMaxRetries).toBe(
        'integer_range_0_3'
      );
    }
    act(() => result.current.loadVisualValuesFromYaml(source));
    act(() => result.current.setVisualValues({ chatgptWebMaxN: '10' }));
    expect(
      parse(result.current.applyVisualChangesToYaml(source.replace(': 1', ': 3'))).images[
        'chatgpt-web'
      ]['n-aggregation-max-retries']
    ).toBe(3);
  });
  it('defines search keys and all four languages', () => {
    const keys = CONFIG_SEARCH_DEFINITIONS.flatMap((x) => x.yamlKeys ?? []);
    expect(keys).toContain('images.chatgpt-web.n-aggregation-max-retries');
    expect(keys).toContain('images.chatgpt-web.n-aggregation-return-partial');
    for (const locale of [en, cn, tw, ru]) {
      expect(locale.chatgpt_web.image_refill.retry_hint).toBeTruthy();
      expect(locale.usage_stats.image_aggregation.health).toBeTruthy();
      expect(locale.usage_stats.failure_error_codes.image_aggregation_discarded).toBeTruthy();
    }
  });
});
