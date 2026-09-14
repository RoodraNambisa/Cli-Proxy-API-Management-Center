import { act, renderHook } from '@testing-library/react';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { useVisualConfig } from './useVisualConfig';

describe('Sentinel sidecar YAML preservation', () => {
  it('preserves typed rules when unrelated visual configuration is saved', () => {
    const yaml = `chatgpt-web:
  sentinel:
    mode: remote
    remote:
      scopes: []
      nodes: [{name: retained, url: 'https://solver.example.com', api-key: 'test-secret'}]
      budget-seconds: 12
    go-vm-compatibility:
      enabled: true
      observer-state-auto-extend: false
      writable-window-properties: [__fixture]
      environment-properties:
        - {path: window.__false, type: boolean, value: false}
        - {path: window.__zero, type: number, value: 0}
        - {path: window.__null, type: "null", value: null}
        - {path: window.__undefined, type: undefined}
sentinel-solver:
  enabled: true
  api-keys: [server-secret]
  queue-size: 0
images: {}
`;
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    act(() => result.current.setVisualValues({ chatgptWebNormalizeMismatchedImageMime: true }));
    const output = result.current.applyVisualChangesToYaml(yaml);
    expect(parseYaml(output)['sentinel-solver']).toEqual(parseYaml(yaml)['sentinel-solver']);
    expect(parseYaml(output)['chatgpt-web'].sentinel).toEqual(
      parseYaml(yaml)['chatgpt-web'].sentinel
    );
    act(() => result.current.loadVisualValuesFromYaml(output));
    expect(result.current.visualDirty).toBe(false);
  });
});
