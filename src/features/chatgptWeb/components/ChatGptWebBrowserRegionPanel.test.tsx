import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatGptWebBrowserRegionPanel } from './ChatGptWebBrowserRegionPanel';
import { browserRegionDefaults, type BrowserRegionConfig } from '../browserRegion';

const api = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), preview: vi.fn(), refresh: vi.fn() }));
const files = vi.hoisted(() => vi.fn());
const notify = vi.hoisted(() => vi.fn());
const capture = vi.hoisted(() => vi.fn(() => ({ id: 'connection' })));
const translate = vi.hoisted(() => (key: string) => key);
vi.mock('@/services/api/browserRegion', () => ({ browserRegionApi: api }));
vi.mock('@/services/api/authFiles', () => ({ authFilesApi: { listPaged: files } }));
vi.mock('@/services/api/client', () => ({ apiClient: { captureConnection: capture } }));
vi.mock('@/stores', () => ({
  useNotificationStore: (selector: (value: { showNotification: typeof notify }) => unknown) =>
    selector({ showNotification: notify }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }));
const key = (value: string) => `chatgpt_web.browser_region.${value}`;
const open = async () => {
  fireEvent.click(screen.getByText(key('title')));
  await waitFor(() =>
    expect((screen.getByLabelText(key('auto-timezone')) as HTMLInputElement).disabled).toBe(false)
  );
};
const save = () => screen.getByRole('button', { name: key('save') });

describe('ChatGPT Web region panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(browserRegionDefaults);
    api.save.mockResolvedValue({});
    files.mockResolvedValue({
      files: [{ name: 'fixture', authIndex: 'index-a' }],
      pagination: { total_pages: 2 },
    });
    api.preview.mockResolvedValue({
      timezone: 'UTC',
      language: 'en-US',
      cache_state: 'missing',
      refresh_state: 'idle',
      timezone_offset_minutes: 0,
      cache_age_seconds: 0,
    });
    api.refresh.mockResolvedValue({ refresh_state: 'queued' });
  });
  it('loads defaults, saves only changed fields and reports dirty state', async () => {
    const dirty = vi.fn();
    render(<ChatGptWebBrowserRegionPanel onDirtyChange={dirty} />);
    await open();
    fireEvent.click(screen.getByLabelText(key('auto-timezone')));
    fireEvent.click(save());
    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith(
        expect.anything(),
        { 'auto-timezone': true },
        expect.any(AbortSignal)
      )
    );
    await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(false));
  });
  it('keeps rejected edits and disables writes while startup is blocked', async () => {
    api.save.mockRejectedValue(new Error('failed'));
    const { rerender } = render(<ChatGptWebBrowserRegionPanel />);
    await open();
    fireEvent.change(screen.getByLabelText(key('language')), { target: { value: 'ja-JP' } });
    fireEvent.click(save());
    await screen.findByRole('alert');
    expect((screen.getByLabelText(key('language')) as HTMLInputElement).value).toBe('ja-JP');
    rerender(<ChatGptWebBrowserRegionPanel disabled />);
    expect((save() as HTMLButtonElement).disabled).toBe(true);
  });
  it('does not invent support on old backends', async () => {
    api.get.mockRejectedValue({ status: 404 });
    render(<ChatGptWebBrowserRegionPanel />);
    fireEvent.click(screen.getByText(key('title')));
    await screen.findByText(key('unsupported'));
    expect((save() as HTMLButtonElement).disabled).toBe(true);
    expect(files).not.toHaveBeenCalled();
  });
  it('uses paginated credential lookup, read-only preview and explicit background refresh', async () => {
    render(<ChatGptWebBrowserRegionPanel />);
    await open();
    await screen.findByRole('option', { name: 'fixture' });
    expect(files).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'chatgpt-web', pageSize: 20 }),
      expect.anything(),
      expect.any(AbortSignal)
    );
    fireEvent.change(screen.getByLabelText(key('credential')), { target: { value: 'index-a' } });
    await waitFor(() => expect(api.preview).toHaveBeenCalled());
    expect(api.refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: key('refresh') }));
    await waitFor(() => expect(api.refresh).toHaveBeenCalled());
  });
  it('aborts old connection reads and ignores late results', async () => {
    let resolve!: (config: BrowserRegionConfig) => void;
    api.get.mockImplementationOnce(
      () =>
        new Promise<BrowserRegionConfig>((done) => {
          resolve = done;
        })
    );
    const { rerender } = render(<ChatGptWebBrowserRegionPanel connectionGenerationKey="a" />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    const signal = api.get.mock.calls[0][1] as AbortSignal;
    rerender(<ChatGptWebBrowserRegionPanel connectionGenerationKey="b" />);
    await open();
    expect(signal.aborted).toBe(true);
    await act(async () => resolve({ ...browserRegionDefaults, language: 'ja-JP' }));
    expect((screen.getByLabelText(key('language')) as HTMLInputElement).value).toBe('');
  });
  it('keeps supported settings available when a credential disappears', async () => {
    api.preview.mockRejectedValue({ status: 404 });
    render(<ChatGptWebBrowserRegionPanel />);
    await open();
    await screen.findByRole('option', { name: 'fixture' });
    fireEvent.change(screen.getByLabelText(key('credential')), { target: { value: 'index-a' } });
    await screen.findByRole('alert');
    expect(screen.queryByText(key('unsupported'))).toBeNull();
    expect((screen.getByLabelText(key('auto-timezone')) as HTMLInputElement).disabled).toBe(false);
  });
  it('shows safe backpressure reasons and rejects incomplete settings responses', async () => {
    api.refresh.mockRejectedValue({ status: 429, details: { reason: 'queue_full' } });
    const view = render(<ChatGptWebBrowserRegionPanel />);
    await open();
    await screen.findByRole('option', { name: 'fixture' });
    fireEvent.change(screen.getByLabelText(key('credential')), { target: { value: 'index-a' } });
    fireEvent.click(screen.getByRole('button', { name: key('refresh') }));
    await screen.findByText(key('values.queue_full'));
    view.unmount();
    api.get.mockResolvedValue({ 'auto-timezone': true, 'auto-language': false });
    render(<ChatGptWebBrowserRegionPanel />);
    fireEvent.click(screen.getByText(key('title')));
    await screen.findByText(key('unsupported'));
  });
});
