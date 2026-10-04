import { beforeAll, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { AuthFileCard, type AuthFileCardProps } from '@/features/authFiles/components/AuthFileCard';
import zhCN from '@/i18n/locales/zh-CN.json';
import { normalizeAuthFileEntry } from '@/services/api/authFiles';

const i18n = createInstance();
beforeAll(() => i18n.init({ lng: 'zh-CN', resources: { 'zh-CN': { translation: zhCN } } }));
const now = Date.parse('2026-10-05T00:00:00Z');

test('normalizes independent upload cooldown fields without changing model cooldown', () => {
  const file = normalizeAuthFileEntry({
    name: 'upload.json',
    type: 'chatgpt-web',
    upload_cooldown_active: true,
    upload_cooldown_until: '2026-10-06T00:00:00Z',
    cooldown_active: false,
  });
  expect(file.uploadCooldownActive).toBe(true);
  expect(file.uploadCooldownUntil).toBe('2026-10-06T00:00:00Z');
  expect(file.cooldownActive).toBe(false);
  expect(normalizeAuthFileEntry({ name: 'legacy.json' }).uploadCooldownActive).toBeUndefined();
});

test.each([true, false])('shows upload cooldown separately in compact=%s', (compact) => {
  const props: AuthFileCardProps = {
    file: {
      name: 'upload.json',
      type: 'chatgpt-web',
      upload_cooldown_active: true,
      upload_cooldown_until: '2026-10-06T00:00:00Z',
      image_quota_remaining: 4,
      cooldown_active: false,
      lifecycle_state: 'active',
    },
    compact,
    cooldownAsOfMs: now,
    selected: false,
    resolvedTheme: 'light',
    disableControls: false,
    deleting: null,
    statusUpdating: {},
    xaiFieldsUpdating: {},
    quotaFilterType: null,
    keyStats: { bySource: {}, byAuthIndex: {} },
    statusBarCache: new Map(),
    usageSummaryCache: new Map(),
    usageLoading: false,
    onShowModels: vi.fn(),
    onDownload: vi.fn(),
    onOpenPrefixProxyEditor: vi.fn(),
    onDelete: vi.fn(),
    onToggleStatus: vi.fn(),
    onToggleXaiField: vi.fn(),
    onToggleSelect: vi.fn(),
  };
  const { rerender } = render(
    <I18nextProvider i18n={i18n}>
      <AuthFileCard {...props} />
    </I18nextProvider>
  );
  expect(screen.getByText(/上传冷却至.*仅暂停需要上传的请求/)).toBeTruthy();
  expect(screen.queryByText(/整个凭证冷却至/)).toBeNull();
  expect(screen.queryByText(/个模型冷却中/)).toBeNull();
  rerender(
    <I18nextProvider i18n={i18n}>
      <AuthFileCard {...props} cooldownAsOfMs={now + 86400000} />
    </I18nextProvider>
  );
  expect(screen.queryByText(/上传冷却至/)).toBeNull();
  rerender(
    <I18nextProvider i18n={i18n}>
      <AuthFileCard {...props} file={{ ...props.file, type: 'codex' }} />
    </I18nextProvider>
  );
  expect(screen.queryByText(/上传冷却至/)).toBeNull();
});
