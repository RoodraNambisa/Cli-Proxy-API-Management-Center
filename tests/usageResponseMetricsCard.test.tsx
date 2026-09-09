import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { RequestEventsDetailsCard } from '@/components/usage/RequestEventsDetailsCard';
import { downloadBlob } from '@/utils/download';
import { formatDurationMs, type UsageDetail } from '@/utils/usage';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

const state = vi.hoisted(() => ({
  loadUsageDetails: vi.fn(),
  detailsLoading: false,
  detailsError: '',
}));

vi.mock('@/stores', () => ({
  useUsageStatsStore: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock('@/services/api/usage', () => ({
  usageApi: { getUsageFacets: vi.fn().mockResolvedValue({ items: [] }) },
}));
vi.mock('@/utils/download', () => ({ downloadBlob: vi.fn() }));
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const detail = (model: string, metrics: Partial<UsageDetail> = {}): UsageDetail => ({
  timestamp: '2026-09-09T00:00:00Z',
  source: 'fixture',
  auth_index: '1',
  __modelName: model,
  failed: false,
  latency_ms: 2000,
  tokens: { input_tokens: 2, output_tokens: 1, reasoning_tokens: 0, cached_tokens: 0, cache_creation_tokens: 0, total_tokens: 3 },
  ...metrics,
});

async function showDetails(details: UsageDetail[]) {
  state.loadUsageDetails.mockResolvedValue({ details, offset: 0, limit: 100, nextOffset: null, hasMore: false, totalMatched: details.length });
  render(<RequestEventsDetailsCard loading={false} geminiKeys={[]} interactionsKeys={[]} claudeConfigs={[]} codexConfigs={[]} vertexConfigs={[]} openaiProviders={[]} range={{}} availableModels={[]} availableSources={[]} authSummaries={[]} availabilityStatus="ready" />);
  fireEvent.click(screen.getByRole('button', { name: 'usage_stats.request_events_load' }));
  return screen.findByRole('table');
}

const readBlob = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});

beforeEach(() => { vi.clearAllMocks(); });

describe('usage response metrics display and export', () => {
  test('shows independent metrics, preserves false, and exports unavailable fields accurately', async () => {
    const table = await showDetails([
      detail('content-model', { stream: true, ttft_ms: 900, first_packet_ms: 125 }),
      detail('failed-model', { stream: false, failed: true, first_packet_ms: 30 }),
      detail('old-model'),
    ]);
    expect(within(table).getByRole('columnheader', { name: 'usage_stats.first_content_latency' })).toBeTruthy();
    expect(within(table).getByRole('columnheader', { name: 'usage_stats.first_packet_latency' })).toBeTruthy();
    const contentRow = within(table).getByText('content-model').closest('tr')!;
    const columnCount = within(table).getAllByRole('columnheader').length;
    for (const row of within(table).getAllByRole('row').slice(1)) {
      expect(within(row).getAllByRole('cell')).toHaveLength(columnCount);
    }
    expect(within(contentRow).getByText(formatDurationMs(900))).toBeTruthy();
    expect(within(contentRow).getByText(formatDurationMs(125))).toBeTruthy();
    expect(within(contentRow).getByText('usage_stats.response_streaming')).toBeTruthy();
    const failedRow = within(table).getByText('failed-model').closest('tr')!;
    expect(within(failedRow).getByText('usage_stats.response_non_streaming')).toBeTruthy();
    expect(within(failedRow).getByText('--')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'usage_stats.export_json' }));
    const exported: Record<string, unknown>[] = JSON.parse(await readBlob(vi.mocked(downloadBlob).mock.calls.at(-1)![0].blob));
    expect(exported.find((row) => row.model === 'content-model')).toMatchObject({ stream: true, ttft_ms: 900, first_packet_ms: 125, latency_ms: 2000 });
    const failed = exported.find((row) => row.model === 'failed-model')!;
    expect(failed).toMatchObject({ stream: false, failed: true, first_packet_ms: 30 });
    expect(failed).not.toHaveProperty('ttft_ms');
    const old = exported.find((row) => row.model === 'old-model')!;
    for (const field of ['stream', 'ttft_ms', 'first_packet_ms']) expect(old).not.toHaveProperty(field);

    fireEvent.click(screen.getByRole('button', { name: 'usage_stats.export_csv' }));
    const csv = await readBlob(vi.mocked(downloadBlob).mock.calls.at(-1)![0].blob);
    expect(csv.split('\n')[0]).toContain('stream,latency_ms,ttft_ms,first_packet_ms');
    expect(csv).toContain('"true","2000","900","125"');
    expect(csv).toContain('"false","2000","","30"');
  });

  test('keeps the old table shape when metrics were not recorded', async () => {
    const table = await showDetails([detail('old-model')]);
    for (const key of ['response_mode', 'first_content_latency', 'first_packet_latency']) {
      expect(within(table).queryByRole('columnheader', { name: `usage_stats.${key}` })).toBeNull();
    }
  });

  test('provides labels and explanations in all supported locales', () => {
    for (const locale of [en, ru, zhCN, zhTW]) {
      for (const key of ['response_mode', 'response_streaming', 'response_non_streaming', 'response_mode_hint', 'first_content_latency', 'first_packet_latency', 'response_timing_hint'] as const) {
        expect(locale.usage_stats[key]).toBeTruthy();
      }
    }
  });
});
