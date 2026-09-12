import { beforeAll, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { AuthFileCard, type AuthFileCardProps } from '@/features/authFiles/components/AuthFileCard';
import type { AuthFileItem } from '@/types';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

const i18n = createInstance();
beforeAll(() => i18n.init({ lng: 'zh-CN', resources: { 'zh-CN': { translation: zhCN } }, interpolation: { escapeValue: false } }));

function renderCard(file: AuthFileItem, compact = true) {
  const props: AuthFileCardProps = {
    file, compact, cooldownAsOfMs: 0, selected: false, resolvedTheme: 'light',
    disableControls: false, deleting: null, statusUpdating: {}, xaiFieldsUpdating: {},
    quotaFilterType: null, keyStats: { bySource: {}, byAuthIndex: {} },
    statusBarCache: new Map(), usageSummaryCache: new Map(), usageLoading: false,
    onShowModels: vi.fn(), onDownload: vi.fn(), onOpenPrefixProxyEditor: vi.fn(),
    onDelete: vi.fn(), onToggleStatus: vi.fn(), onToggleXaiField: vi.fn(), onToggleSelect: vi.fn(),
  };
  render(<I18nextProvider i18n={i18n}><AuthFileCard {...props} /></I18nextProvider>);
  return screen.getByText(zhCN.auth_files.priority_display).parentElement!;
}

test.each([true, false])('shows default zero without adding a saved value, compact=%s', (compact) => {
  const file = Object.freeze({ name: 'default-priority.json', type: 'codex' });
  const badge = renderCard(file, compact);
  expect(within(badge).getByText('0（默认）')).toBeTruthy();
  expect(badge.title).toBe(zhCN.auth_files.priority_default_hint);
  expect(file).not.toHaveProperty('priority');
});

test.each([null, '', 'invalid'])('shows effective zero for a legacy value %s', (priority) => {
  const badge = renderCard({ name: 'legacy.json', type: 'codex', priority });
  expect(within(badge).getByText('0（默认）')).toBeTruthy();
});

test.each([0, '0', -1, '4'])('preserves an explicit priority %s', (priority) => {
  const badge = renderCard({ name: 'explicit.json', type: 'codex', priority });
  expect(within(badge).getByText(String(priority))).toBeTruthy();
  expect(within(badge).queryByText('0（默认）')).toBeNull();
  expect(badge.title).toBe('');
});

test('all locales identify default zero in the card and filter separately from explicit zero', () => {
  for (const { auth_files: text } of [en, ru, zhCN, zhTW]) {
    expect(text.priority_default_value).toContain('0');
    expect(text.priority_default_hint).toContain('0');
    expect(text.priority_filter_unset).toContain('0');
    expect(text.priority_filter_explicit_zero).toContain('0');
    expect(text.priority_filter_unset).not.toBe(text.priority_filter_explicit_zero);
  }
});
