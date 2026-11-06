import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatGptWebImageUsageProfiles,
  type ImageUsageProfilesDraft,
} from './ChatGptWebImageUsageProfiles';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/services/api/client', () => ({
  apiClient: { captureConnection: () => ({ apiBase: 'test' }), getAtConnection: mocks.get },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const tr = (key: string) => `chatgpt_web.usage_profiles.${key}`;
function Harness({ connection = 'a' }: { connection?: string }) {
  const [value, setValue] = useState({
    chatgptWebImageUsageProfile: 'by-model' as ImageUsageProfilesDraft['mode'],
    chatgptWebImageUsageModelProfiles: {} as ImageUsageProfilesDraft['overrides'],
  });
  return (
    <>
      <ChatGptWebImageUsageProfiles
        draft={{
          mode: value.chatgptWebImageUsageProfile,
          overrides: value.chatgptWebImageUsageModelProfiles,
          models: ['gpt-image-2.5', 'gpt-image-2.6', 'custom'],
          legacyModel: '',
          dirty: true,
          onChange: (patch) => setValue((old) => ({ ...old, ...patch })),
        }}
        connectionKey={connection}
        active
        disabled={false}
        savedMode="by-model"
      />
      <output data-testid="state">{JSON.stringify(value)}</output>
    </>
  );
}
describe('image usage profile editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ features: ['image_usage_profiles_v1'] });
  });
  afterEach(cleanup);
  it('keeps overrides when switching to unified mode and restores automatic rules', async () => {
    render(<Harness />);
    const mode = screen.getByLabelText(tr('title')) as HTMLSelectElement;
    await waitFor(() => expect(mode.disabled).toBe(false));
    const summary = screen.getByText(`${tr('aliases')} (3)`);
    expect(summary.closest('details')?.open).toBe(false);
    fireEvent.click(summary);
    const custom = screen.getByLabelText(`custom ${tr('rule')}`) as HTMLSelectElement;
    fireEvent.change(custom, { target: { value: 'gpt-image-2.5' } });
    fireEvent.change(mode, { target: { value: 'gpt-image-2.6' } });
    expect(custom.disabled).toBe(true);
    expect(custom.value).toBe('gpt-image-2.5');
    expect(screen.getByText(tr('uniform_hint'))).toBeTruthy();
    fireEvent.change(mode, { target: { value: 'by-model' } });
    expect(custom.disabled).toBe(false);
    fireEvent.click(within(custom.parentElement!).getByText(tr('reset')));
    expect(custom.value).toBe('auto');
    expect(
      JSON.parse(screen.getByTestId('state').textContent!).chatgptWebImageUsageModelProfiles
    ).toEqual({});
  });
  it('does not enable controls from a previous connection', async () => {
    let finish!: (v: unknown) => void;
    mocks.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const view = render(<Harness />);
    mocks.get.mockResolvedValue({ features: [] });
    view.rerender(<Harness connection="b" />);
    await screen.findByText(tr('unsupported'), { selector: 'p' });
    await act(async () => {
      finish({ features: ['image_usage_profiles_v1'] });
    });
    expect((screen.getByLabelText(tr('title')) as HTMLSelectElement).disabled).toBe(true);
  });
  it('keeps capability failures read only', async () => {
    mocks.get.mockRejectedValue(new Error('offline'));
    render(<Harness />);
    await screen.findByText(tr('error'), { selector: 'p' });
    expect((screen.getByLabelText(tr('title')) as HTMLSelectElement).disabled).toBe(true);
  });
});
