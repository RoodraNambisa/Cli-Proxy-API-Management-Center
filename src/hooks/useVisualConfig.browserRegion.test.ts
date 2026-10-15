import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { expect, it } from 'vitest';
import { useVisualConfig } from './useVisualConfig';

it('preserves browser-region and manual timezone during source/visual roundtrips', () => {
  const yaml =
    'port: 8317\nchatgpt-web:\n  timezone: Asia/Tokyo\n  timezone-offset-minutes: -540\n  browser-region:\n    auto-timezone: true\n    auto-language: false\n    language: ja-JP\n    lookup-url: https://ipwho.is/{ip}\n    cache-ttl-seconds: 21600\n    route-cache-size: 100000\n    future-setting: retained\n';
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(yaml));
  act(() => result.current.setVisualValues({ port: '8318' }));
  const output = result.current.applyVisualChangesToYaml(yaml);
  expect(parse(output)['chatgpt-web']).toMatchObject(parse(yaml)['chatgpt-web']);
  act(() => result.current.loadVisualValuesFromYaml(output));
  expect(result.current.visualDirty).toBe(false);
});
