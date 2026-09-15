import { act, renderHook } from '@testing-library/react';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { useVisualConfig } from './useVisualConfig';

describe('Library cleanup opt-in', () => {
  it('defaults off, tracks dirtiness, saves and reloads the destructive switch', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('images: {}\n'));
    expect(result.current.visualValues.chatgptWebAutoCleanupLibraryOnFull).toBe(false);
    act(() => result.current.setVisualValues({ chatgptWebAutoCleanupLibraryOnFull: true }));
    expect(result.current.visualDirtyFields).toContain('chatgptWebAutoCleanupLibraryOnFull');
    const yaml = result.current.applyVisualChangesToYaml('images: {}\n');
    expect(parseYaml(yaml).images['chatgpt-web']['auto-cleanup-library-on-full']).toBe(true);
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    expect(result.current.visualValues.chatgptWebAutoCleanupLibraryOnFull).toBe(true);
    expect(result.current.visualDirty).toBe(false);
    act(() => result.current.setVisualValues({ chatgptWebAutoCleanupLibraryOnFull: false }));
    const disabled = result.current.applyVisualChangesToYaml(yaml);
    expect(parseYaml(disabled).images['chatgpt-web']['auto-cleanup-library-on-full']).toBe(false);
  });
});
