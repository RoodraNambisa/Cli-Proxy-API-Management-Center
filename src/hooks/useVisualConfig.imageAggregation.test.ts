import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { useVisualConfig } from './useVisualConfig';

describe('Web image aggregation YAML', () => {
  it('keeps the default implicit and validates the range', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    expect(result.current.visualValues.chatgptWebNAggregationConcurrency).toBe('3');
    act(() => result.current.setVisualValues({ port: '8318' }));
    expect(result.current.applyVisualChangesToYaml('port: 8317\n')).not.toContain(
      'n-aggregation-concurrency'
    );
    for (const value of ['0', '11', '1.5']) {
      act(() => result.current.setVisualValues({ chatgptWebNAggregationConcurrency: value }));
      expect(result.current.visualValidationErrors.chatgptWebNAggregationConcurrency).toBe(
        'integer_range_1_10'
      );
    }
  });
  it('saves, reloads and resets a dirty concurrency without losing comments', () => {
    const { result } = renderHook(() => useVisualConfig());
    const source =
      '# keep\nimages:\n  chatgpt-web:\n    max-n: 10\n    n-aggregation-concurrency: 1 # serial\n    future: keep\n';
    act(() => result.current.loadVisualValuesFromYaml(source));
    act(() => result.current.setVisualValues({ chatgptWebNAggregationConcurrency: '5' }));
    expect(result.current.visualDirty).toBe(true);
    const saved = result.current.applyVisualChangesToYaml(source);
    expect(parse(saved).images['chatgpt-web']['n-aggregation-concurrency']).toBe(5);
    expect(saved).toContain('# serial');
    expect(saved).toContain('future: keep');
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualDirty).toBe(false);
    act(() => result.current.setVisualValues({ chatgptWebNAggregationConcurrency: '1' }));
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualValues.chatgptWebNAggregationConcurrency).toBe('5');
  });
  it('preserves a newer server setting when only another image field changes', () => {
    const { result } = renderHook(() => useVisualConfig());
    const source = 'images:\n  chatgpt-web:\n    n-aggregation-concurrency: 1\n';
    act(() => result.current.loadVisualValuesFromYaml(source));
    act(() => result.current.setVisualValues({ chatgptWebMaxN: '10' }));
    const saved = result.current.applyVisualChangesToYaml(source.replace(': 1', ': 7'));
    expect(parse(saved).images['chatgpt-web']['n-aggregation-concurrency']).toBe(7);
  });

});
