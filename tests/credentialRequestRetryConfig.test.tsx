import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { parse } from 'yaml';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { CONFIG_SEARCH_DEFINITIONS } from '@/components/config/configCatalog';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
beforeEach(() => {
  localStorage.clear();
});

const sections = [
  'codex-api-key',
  'claude-api-key',
  'gemini-api-key',
  'interactions-api-key',
  'vertex-api-key',
  'openai-compatibility',
];

test('saving global settings preserves credential retries, aliases and unknown YAML', () => {
  const original =
    'request-retry: 3\nretry-defaults: &retry\n  request-retry: 0\n  future-field: retained\n' +
    sections
      .map(
        (section, i) =>
          `${section}:\n  - <<: *retry\n    api-key: test-only\n    name: test-provider\n    weight: 5\n    request-retry: ${i === 0 ? 'null' : i === 1 ? '-1' : i === 2 ? '0' : '7'}\n`
      )
      .join('');
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(original));
  expect(result.current.visualParseError).toBeNull();
  act(() => result.current.setVisualValues({ requestRetry: '2' }));
  expect(result.current.visualDirty).toBe(true);
  const saved = result.current.applyVisualChangesToYaml(original);
  const before = parse(original, { merge: true });
  const after = parse(saved, { merge: true });
  expect(after['request-retry']).toBe(2);
  for (const section of sections) expect(after[section]).toEqual(before[section]);
  expect(saved).toContain('<<: *retry');
  expect(result.current.visualDirty).toBe(true);
  act(() => result.current.loadVisualValuesFromYaml(saved));
  expect(result.current.visualDirty).toBe(false);
});

test('all credential retry fields are searchable and lead to provider management', () => {
  render(
    <MemoryRouter initialEntries={['/config?section=global-network']}>
      <Routes>
        <Route
          path="/config"
          element={
            <VisualConfigEditor
              values={DEFAULT_VISUAL_VALUES}
              baselineValues={DEFAULT_VISUAL_VALUES}
              onChange={vi.fn()}
              renderRequestBodyPanels={() => null}
            />
          }
        />
        <Route path="/ai-providers" element={<div>provider management</div>} />
      </Routes>
    </MemoryRouter>
  );
  const search = screen.getByRole('searchbox', {
    name: 'config_management.settings_center.search_placeholder',
  });
  const entry = CONFIG_SEARCH_DEFINITIONS.find(
    (item) => item.id === 'config-credential-request-retry'
  )!;
  for (const query of [
    ...sections.map((section) => `${section}[].request-retry`),
    ...entry.aliases!,
  ]) {
    fireEvent.change(search, { target: { value: query } });
    expect(screen.getByRole('button', { name: /ai_providers.request_retry_label/ })).toBeTruthy();
  }
  fireEvent.click(screen.getByRole('button', { name: /ai_providers.request_retry_label/ }));
  expect(document.getElementById(entry.id)).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'ai_providers.request_retry_manage' }));
  expect(screen.getByText('provider management')).toBeTruthy();
  for (const locale of [en, ru, zhCN, zhTW])
    expect(locale.ai_providers.request_retry_manage).toBeTruthy();
});
