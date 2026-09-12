import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { beforeEach, expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { getVisualConfigValidationErrors } from '@/hooks/useVisualConfig';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

beforeEach(() => localStorage.clear());
const groupIds = ['config-model-catalog-fields', 'config-codex-custom-models', 'config-codex-image-tool',
  'config-codex-request-policies', 'config-codex-collaboration', 'config-codex-fingerprint',
  'config-codex-live', 'config-codex-live-media', 'config-codex-image-endpoints'];

test.each([['en', en], ['ru', ru], ['zh-CN', zhCN], ['zh-TW', zhTW]] as const)('Codex groups start compact without false validation badges or missing %s labels', async (language, messages) => {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({ lng: language, resources: { [language]: { translation: messages } }, interpolation: { escapeValue: false } });
  const onChange = vi.fn();
  render(<I18nextProvider i18n={i18n}><MemoryRouter initialEntries={['/config?section=provider-codex']}>
    <VisualConfigEditor values={DEFAULT_VISUAL_VALUES} baselineValues={DEFAULT_VISUAL_VALUES}
      validationErrors={getVisualConfigValidationErrors(DEFAULT_VISUAL_VALUES)} onChange={onChange} />
  </MemoryRouter></I18nextProvider>);
  for (const id of groupIds) {
    const group = document.getElementById(id)!;
    const button = group.querySelector('button')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.textContent).not.toContain('config_management.');
    expect(button.textContent?.trim()).not.toBe('');
  }
  expect(screen.queryByRole('checkbox')).toBeNull();
  const group = document.getElementById('config-codex-request-policies')!;
  fireEvent.click(group.querySelector('button')!);
  expect(within(group).getAllByRole('checkbox')).toHaveLength(4);
  fireEvent.click(group.querySelector('button')!);
  expect(within(group).queryByRole('checkbox')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});
