import { act, renderHook } from '@testing-library/react';
import { parse, parseDocument } from 'yaml';
import { describe, expect, it } from 'vitest';
import { useVisualConfig, getVisualConfigValidationErrors } from './useVisualConfig';
import { readGrokConfig, writeGrokConfig } from '@/utils/grokConfig';

describe('Grok global settings', () => {
  it('preserves unknown sibling aliases when replacing a header map', () => {
    const doc = parseDocument(
      'xai:\n  headers: &headers\n    X-Fixture: old\n  future-headers: *headers\n'
    );
    const baseline = readGrokConfig(doc.toJS().xai);
    writeGrokConfig(doc, { ...baseline, headers: [{ key: 'X-Fixture', value: 'new' }] }, baseline);
    const saved = parse(doc.toString());
    expect(saved.xai.headers).toEqual({ 'X-Fixture': 'new' });
    expect(saved.xai['future-headers']).toEqual({ 'X-Fixture': 'old' });
  });
  it('removes the reasoning object when its default effort is cleared', () => {
    const doc = parseDocument(
      'xai:\n  request-defaults:\n    reasoning:\n      effort: high\n    temperature: 0.5\n'
    );
    const baseline = readGrokConfig(doc.toJS().xai);
    writeGrokConfig(
      doc,
      { ...baseline, defaults: { ...baseline.defaults, 'reasoning.effort': '' } },
      baseline
    );
    expect(doc.toJS().xai['request-defaults']).toEqual({ temperature: 0.5 });
  });
  it('does not add policies when an unrelated setting is saved', () => {
    const { result } = renderHook(() => useVisualConfig());
    const yaml = 'port: 8317\n';
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    expect(result.current.visualValues.grok).toMatchObject({
      passthrough: false,
      spoof: false,
      convergence: false,
      confuse: false,
      poolSize: '4',
    });
    act(() => result.current.setVisualValues({ port: '8318' }));
    expect(parse(result.current.applyVisualChangesToYaml(yaml))).not.toHaveProperty('xai');
  });

  it('round-trips combinations, false defaults and unknown fields', () => {
    const yaml =
      'xai:\n  future: retained\n  header-defaults:\n    future-header: preserved\n  request-defaults:\n    temperature: 0\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    const original = result.current.visualValues.grok;
    act(() =>
      result.current.setVisualValues({
        grok: {
          ...original,
          passthrough: true,
          convergence: true,
          confuse: true,
          poolSize: '64',
          headers: [{ key: 'X-Fixture', value: 'global' }],
          defaults: {
            ...original.defaults,
            parallel_tool_calls: 'false',
            max_output_tokens: '017',
          },
        },
      })
    );
    expect(result.current.visualDirtyFields).toContain('grok');
    expect(
      Object.keys(getVisualConfigValidationErrors(result.current.visualValues)).filter((name) =>
        name.startsWith('grok')
      )
    ).toEqual([]);
    const output = result.current.applyVisualChangesToYaml(yaml),
      saved = parse(output).xai;
    expect(saved).toMatchObject({
      future: 'retained',
      'header-defaults': { 'future-header': 'preserved' },
      'passthrough-client-identity': true,
      'session-identity-convergence': true,
      'identity-confuse': true,
      'session-identity-pool-size': 64,
      headers: { 'X-Fixture': 'global' },
      'request-defaults': { temperature: 0, parallel_tool_calls: false, max_output_tokens: 17 },
    });
    expect(saved).not.toHaveProperty('spoof-session-identity');
    act(() => result.current.loadVisualValuesFromYaml(output));
    expect(result.current.visualDirty).toBe(false);
  });

  it('detaches inherited maps without editing their anchor', () => {
    const doc = parseDocument(
      'profile: &profile\n  user-agent: inherited\n  other: untouched\nxai:\n  header-defaults: *profile\n'
    );
    const baseline = readGrokConfig({
      'header-defaults': { 'user-agent': 'inherited', other: 'untouched' },
    });
    writeGrokConfig(doc, { ...baseline, userAgent: 'new-agent' }, baseline);
    const saved = doc.toJS();
    expect(saved.profile['user-agent']).toBe('inherited');
    expect(saved.xai['header-defaults']).toEqual({ 'user-agent': 'new-agent', other: 'untouched' });
  });

  it('blocks duplicate headers, invalid pool sizes and malformed tool defaults', () => {
    const { result } = renderHook(() => useVisualConfig());
    const grok = result.current.visualValues.grok;
    const errors = getVisualConfigValidationErrors({
      ...result.current.visualValues,
      grok: {
        ...grok,
        poolSize: '65',
        headers: [
          { key: 'X-A', value: 'one' },
          { key: 'x-a', value: 'two' },
        ],
        defaults: { ...grok.defaults, tool_choice: '{broken' },
      },
    });
    expect(errors['grok.poolSize']).toBe('integer_range_1_64');
    expect(errors['grok.headers']).toBe('grok_headers');
    expect(errors['grok.tool_choice']).toBe('json_object');
  });
});
