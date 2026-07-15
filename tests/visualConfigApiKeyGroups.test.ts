import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';
import { useVisualConfig } from '@/hooks/useVisualConfig';

const initialYaml = `api-keys:
  - key-a
  - key-b
api-key-groups:
  - api-key: key-a
    providers: [codex, xai]
  - api-key: key-b
    providers: [claude]
`;

describe('visual config API Key provider groups', () => {
  test('migrates a provider restriction when its API Key is renamed', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml(initialYaml);
    });
    act(() => {
      result.current.setVisualValues({ apiKeysText: 'key-renamed\nkey-b' });
    });

    const merged = parse(result.current.applyVisualChangesToYaml(initialYaml));
    expect(merged['api-key-groups']).toEqual([
      { 'api-key': 'key-renamed', providers: ['codex', 'xai'] },
      { 'api-key': 'key-b', providers: ['claude'] },
    ]);
  });

  test('removes restrictions for deleted API Keys without changing retained groups', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml(initialYaml);
    });
    act(() => {
      result.current.setVisualValues({ apiKeysText: 'key-b' });
    });

    const latestYaml = initialYaml.replace('providers: [claude]', 'providers: [claude, xai]');
    const merged = parse(result.current.applyVisualChangesToYaml(latestYaml));
    expect(merged['api-key-groups']).toEqual([
      { 'api-key': 'key-b', providers: ['claude', 'xai'] },
    ]);
  });
});
