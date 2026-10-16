import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { useVisualConfig } from './useVisualConfig';

describe('ChatGPT Web TLS switch YAML', () => {
  it('defaults to the original template without inserting an untouched field', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    expect(result.current.visualValues.chatgptWebTLSTrustAnchorsEnabled).toBe(true);
    act(() => result.current.setVisualValues({ port: '8318' }));
    expect(result.current.applyVisualChangesToYaml('port: 8317\n')).not.toContain(
      'tls-trust-anchors-enabled'
    );
  });
  it('round-trips explicit false, comments and unknown fields and resets dirty state', () => {
    const yaml =
      '# retained\nchatgpt-web:\n  tls-trust-anchors-enabled: false # TLS choice\n  future-setting: kept\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    expect(result.current.visualValues.chatgptWebTLSTrustAnchorsEnabled).toBe(false);
    act(() => result.current.setVisualValues({ chatgptWebTLSTrustAnchorsEnabled: true }));
    expect(result.current.visualDirtyFields).toContain('chatgptWebTLSTrustAnchorsEnabled');
    const saved = result.current.applyVisualChangesToYaml(yaml);
    expect(parse(saved)['chatgpt-web']).toMatchObject({
      'tls-trust-anchors-enabled': true,
      'future-setting': 'kept',
    });
    expect(saved).toContain('# retained');
    expect(saved).toContain('# TLS choice');
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualDirty).toBe(false);
    act(() => result.current.setVisualValues({ chatgptWebTLSTrustAnchorsEnabled: false }));
    expect(
      parse(result.current.applyVisualChangesToYaml(saved))['chatgpt-web'][
        'tls-trust-anchors-enabled'
      ]
    ).toBe(false);
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualValues.chatgptWebTLSTrustAnchorsEnabled).toBe(true);
  });
  it('preserves a concurrently changed TLS field when editing another setting', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    act(() => result.current.setVisualValues({ port: '8318' }));
    expect(
      parse(
        result.current.applyVisualChangesToYaml(
          'port: 8317\nchatgpt-web:\n  tls-trust-anchors-enabled: false\n'
        )
      )['chatgpt-web']['tls-trust-anchors-enabled']
    ).toBe(false);
  });
  it.each(['invalid', '1', '"false"', '[]'])('rejects non-boolean %s', (raw) => {
    const { result } = renderHook(() => useVisualConfig());
    let outcome: { ok: boolean } | undefined;
    act(() => {
      outcome = result.current.loadVisualValuesFromYaml(
        'chatgpt-web:\n  tls-trust-anchors-enabled: ' + raw + '\n'
      );
    });
    expect(outcome?.ok).toBe(false);
  });
});
