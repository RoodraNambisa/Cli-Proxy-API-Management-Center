import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: (key: string) => key }) }));

test.each([
  'display-name', 'max-context-length',
  'thinking.levels', 'thinking.min', 'thinking.max', 'thinking.zero-allowed', 'thinking.dynamic-allowed',
  '推理能力', '推理預算', 'reasoning capabilities', 'возможности рассуждения',
  ...['codex-api-key', 'claude-api-key', 'gemini-api-key', 'interactions-api-key', 'vertex-api-key', 'openai-compatibility'].map((family) => `${family}[0].models[1].thinking.levels`),
  ...['codex-api-key', 'claude-api-key', 'gemini-api-key', 'interactions-api-key', 'vertex-api-key', 'openai-compatibility'].map((family) => `${family}[0].models[1].max-context-length`),
  'oauth-model-alias.codex[0].display-name',
])('model configuration search %s reaches its editor without changing values', (query) => {
  const onChange = vi.fn();
  render(<MemoryRouter initialEntries={['/config?section=global-basics']}><Routes>
    <Route path="/config" element={<VisualConfigEditor values={DEFAULT_VISUAL_VALUES} baselineValues={DEFAULT_VISUAL_VALUES} onChange={onChange} renderRequestBodyPanels={() => null} />} />
    <Route path="/ai-providers" element={<div>API models</div>} />
    <Route path="/auth-files/oauth-model-alias" element={<div>OAuth aliases</div>} />
  </Routes></MemoryRouter>);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
  fireEvent.click(screen.getByRole('button', { name: /common.model_catalog_label/ }));
  expect(document.getElementById('config-model-catalog-fields')?.closest('[hidden]')).toBeNull();
  expect(document.getElementById('config-model-catalog-fields')?.closest('section')?.id).toBe('auth');
  const oauth = query.startsWith('oauth-model-alias');
  fireEvent.click(screen.getByRole('button', { name: oauth ? 'common.oauth_model_display_name_manage' : 'common.model_catalog_manage' }));
  expect(screen.getByText(oauth ? 'OAuth aliases' : 'API models')).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
});

test.each([en, ru, zhCN, zhTW])('model catalog navigation labels are translated', (locale) => {
  expect(locale.common.model_catalog_label).toBeTruthy();
  expect(locale.common.model_catalog_manage).toBeTruthy();
  expect(locale.common.oauth_model_display_name_manage).toBeTruthy();
});
