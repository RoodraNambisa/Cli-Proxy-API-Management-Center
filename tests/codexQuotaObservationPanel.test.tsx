import { beforeAll, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { CodexQuotaObservationPanel } from '@/features/authFiles/components/CodexQuotaObservationPanel';
import { AuthFileCard, type AuthFileCardProps } from '@/features/authFiles/components/AuthFileCard';
import { apiClient } from '@/services/api/client';
import type { AuthFileItem } from '@/types/authFile';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

const i18n = createInstance();
beforeAll(() => i18n.init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } }));
const file = (signals: Record<string, string>, enabled = true): AuthFileItem => ({
  name: 'quota.json', type: 'codex', quota_observation_enabled: enabled,
  quota_observation: { observed_at: '2026-09-10T12:00:00Z', source: 'websocket', signals },
});
const panel = (entry: AuthFileItem) => <I18nextProvider i18n={i18n}><CodexQuotaObservationPanel file={entry} compact={false} /></I18nextProvider>;

describe('Codex passive quota display', () => {
  test('keeps the default layout unchanged and does not actively query when enabled', () => {
    const get = vi.spyOn(apiClient, 'get');
    const post = vi.spyOn(apiClient, 'post');
    try {
      const { container, rerender } = render(panel({ name: 'quota.json', type: 'codex' }));
      expect(container.textContent).toBe('');
      rerender(panel({ name: 'quota.json', type: 'codex', quota_observation_enabled: true }));
      expect(screen.getByText(en.codex_quota_observation.empty)).toBeTruthy();
      expect(screen.queryByRole('button')).toBeNull();
      expect(get).not.toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
    } finally { get.mockRestore(); post.mockRestore(); }
  });

  test('shows timestamp, zero usage and case-insensitive false credits', () => {
    const { container } = render(panel(file({ 'X-Codex-Primary-Used-Percent': '0', 'X-Codex-Primary-Window-Minutes': '300', 'X-Codex-Primary-Reset-After-Seconds': '60', 'X-Codex-Credits-Has-Credits': 'False', 'X-Codex-Credits-Balance': '0' })));
    expect(screen.getByText(en.codex_quota_observation.history_hint)).toBeTruthy();
    expect(screen.getByText('100% remaining')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByText('Has credits: No')).toBeTruthy();
    expect(screen.getByText('Credit balance: 0')).toBeTruthy();
    expect([...container.querySelectorAll('time')].map((node) => node.dateTime)).toEqual(['2026-09-10T12:00:00Z', '2026-09-10T12:01:00.000Z']);
  });

  test('does not fill partial observations from older windows or an active quota cache', () => {
    const { rerender } = render(panel(file({ 'X-Codex-Primary-Used-Percent': '50' })));
    expect(screen.getByText('50% remaining')).toBeTruthy();
    rerender(panel(file({ 'X-Codex-Secondary-Window-Minutes': '10080' })));
    expect(screen.queryByText('50% remaining')).toBeNull();
    expect(screen.queryByText('Primary window')).toBeNull();
    expect(screen.getByText(en.codex_quota.secondary_window)).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
    rerender(panel({ name: 'quota.json', type: 'codex' }));
    expect(screen.queryByText(en.codex_quota_observation.title)).toBeNull();
  });

  test('hides retained snapshots when disabled and restores them with the original timestamp', () => {
    const entry = file({ 'X-Codex-Primary-Used-Percent': '20' });
    const { container, rerender } = render(panel(entry));
    expect(screen.getByText('80% remaining')).toBeTruthy();
    rerender(panel({ ...entry, quota_observation_enabled: false }));
    expect(container.textContent).toBe('');
    rerender(panel(entry));
    expect(screen.getByText('80% remaining')).toBeTruthy();
    expect(container.querySelector('time')?.dateTime).toBe(entry.quota_observation?.observed_at);
  });

  test('labels periods by measured duration instead of the primary or secondary position', () => {
    render(panel(file({
      'X-Codex-Primary-Used-Percent': '2', 'X-Codex-Primary-Window-Minutes': '10080',
      'X-Codex-Secondary-Used-Percent': '0', 'X-Codex-Secondary-Window-Minutes': '300',
      'X-Codex-Additional-Spark-Limit-Name': 'Spark', 'X-Codex-Additional-Spark-Primary-Used-Percent': '0', 'X-Codex-Additional-Spark-Primary-Window-Minutes': '120',
      'X-Codex-Code-Review-Primary-Used-Percent': '0',
      'X-Codex-Code-Review-Secondary-Used-Percent': '10', 'X-Codex-Code-Review-Secondary-Window-Minutes': '42',
    })));
    expect(screen.getByRole('progressbar', { name: en.codex_quota.secondary_window }).getAttribute('aria-valuenow')).toBe('98');
    expect(screen.getByRole('progressbar', { name: en.codex_quota.primary_window })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Spark · 2-hour limit' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: /42-minute limit/ })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: /Quota window 1 \(period unknown\)/ })).toBeTruthy();
    expect(screen.queryByText('Primary window')).toBeNull();
  });

  test('mounts on compact Codex credential cards and provides complete translations', () => {
    const props: AuthFileCardProps = {
      file: file({ 'X-Codex-Primary-Used-Percent': '25' }), compact: true, cooldownAsOfMs: 0,
      selected: false, resolvedTheme: 'light', disableControls: false, deleting: null,
      statusUpdating: {}, xaiFieldsUpdating: {}, quotaFilterType: null,
      keyStats: { bySource: {}, byAuthIndex: {} }, statusBarCache: new Map(), usageSummaryCache: new Map(), usageLoading: false,
      onShowModels: vi.fn(), onDownload: vi.fn(), onOpenPrefixProxyEditor: vi.fn(), onDelete: vi.fn(), onToggleStatus: vi.fn(), onToggleXaiField: vi.fn(), onToggleSelect: vi.fn(),
    };
    const { container } = render(<I18nextProvider i18n={i18n}><AuthFileCard {...props} /></I18nextProvider>);
    expect(screen.getByText(en.codex_quota_observation.title)).toBeTruthy();
    expect(container.querySelector('details')?.open).toBe(false);
    for (const locale of [ru, zhCN, zhTW]) {
      expect(Object.keys(locale.codex_quota_observation).sort()).toEqual(Object.keys(en.codex_quota_observation).sort());
      expect(Object.values(locale.codex_quota_observation).every(Boolean)).toBe(true);
    }
  });
});
