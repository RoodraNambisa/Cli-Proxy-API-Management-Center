import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  connection: { apiBase: 'first', managementKey: 'test', timeout: 1000 },
}));
vi.mock('@/services/api/client', () => ({
  apiClient: { captureConnection: () => ({ ...mocks.connection }), getAtConnection: mocks.get },
}));
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
import { ChatGptWebImageFormatsEditor } from './ChatGptWebImageFormatsEditor';
import {
  IMAGE_FORMATS_FEATURE,
  IMAGE_OUTPUT_FORMATS,
  type ModelOutputFormats,
} from '../imageOutputFormats';
const capability = {
  features: [IMAGE_FORMATS_FEATURE],
  image_model_output_formats: {
    supported_formats: IMAGE_OUTPUT_FORMATS,
    default_formats: ['png', 'jpeg', 'webp'],
    default_overrides: { 'gpt-image-2.6': ['png', 'jpeg', 'webp', 'gif'] },
    default_aliases: ['gpt-image-2.5', 'gpt-image-2.6'],
    aliases: [],
  },
};
const props = {
  models: [],
  overrides: {},
  legacyModel: '',
  connectionKey: 'first',
  active: true,
  onChange: vi.fn(),
};
function Harness() {
  const [value, setValue] = useState<{
    chatgptWebImageModels: string[];
    chatgptWebModelOutputFormats: ModelOutputFormats;
    chatgptWebImageUsageModelProfiles: import('../imageUsageProfiles').ImageUsageModelProfiles;
  }>({ chatgptWebImageModels: [], chatgptWebModelOutputFormats: {}, chatgptWebImageUsageModelProfiles: {'gpt-image-2.5':'gpt-image-2.6'} });
  return (
    <>
      <ChatGptWebImageFormatsEditor
        {...props}
        models={value.chatgptWebImageModels}
        overrides={value.chatgptWebModelOutputFormats}
        usageProfiles={value.chatgptWebImageUsageModelProfiles}
        onChange={(patch) => setValue((previous) => ({ ...previous, ...patch }))}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

async function expandFormats() {
  const checkbox = await screen.findByLabelText('gpt-image-2.6 GIF');
  const details = checkbox.closest('details')!;
  expect(details.open).toBe(false);
  fireEvent.click(details.querySelector('summary')!);
  expect(details.open).toBe(true);
  return details;
}

describe('alias formats editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(capability);
    mocks.connection.apiBase = 'first';
  });
  afterEach(cleanup);
  it('changes only the override and can restore the inherited default', async () => {
    render(<Harness />);
    const details = await expandFormats();
    const checkbox = screen.getByLabelText('gpt-image-2.6 GIF');
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('gpt-image-2.5 GIF') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(checkbox);
    const value = JSON.parse(screen.getByTestId('value').textContent!);
    expect(value.chatgptWebImageModels).toEqual([]);
    expect(value.chatgptWebModelOutputFormats).toEqual({
      'gpt-image-2.6': ['png', 'jpeg', 'webp'],
    });
    fireEvent.click(details.querySelector('summary')!);
    expect(details.open).toBe(false);
    expect(JSON.parse(screen.getByTestId('value').textContent!)).toEqual(value);
    fireEvent.click(details.querySelector('summary')!);
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    const row = checkbox.closest('div[role="group"]')!.parentElement!;
    fireEvent.click(within(row).getByText('chatgpt_web.image_formats.reset'));
    expect(
      JSON.parse(screen.getByTestId('value').textContent!).chatgptWebModelOutputFormats
    ).toEqual({});
  });
  it('moves a format override when renaming and removes it with the alias', async () => {
    render(<Harness />);
    await expandFormats();
    const checkbox = screen.getByLabelText('gpt-image-2.5 GIF');
    fireEvent.click(checkbox);
    const row = checkbox.closest('div[role="group"]')!.parentElement!;
    fireEvent.click(within(row).getByText('chatgpt_web.image_formats.rename'));
    fireEvent.change(screen.getByLabelText('chatgpt_web.image_formats.name'), {
      target: { value: 'custom' },
    });
    fireEvent.click(screen.getByText('chatgpt_web.image_formats.apply'));
    const value = JSON.parse(screen.getByTestId('value').textContent!);
    expect(value.chatgptWebImageModels).toEqual(['custom', 'gpt-image-2.6']);
    expect(value.chatgptWebImageUsageModelProfiles).toEqual({custom:'gpt-image-2.6'});
    expect(value.chatgptWebModelOutputFormats).toEqual({ custom: ['png', 'jpeg', 'webp', 'gif'] });
    const renamed = screen
      .getByLabelText('custom GIF')
      .closest('div[role="group"]')!.parentElement!;
    fireEvent.click(within(renamed).getByText('chatgpt_web.image_formats.delete'));
    expect(
      JSON.parse(screen.getByTestId('value').textContent!).chatgptWebModelOutputFormats
    ).toEqual({});
  });
  it('adds a custom alias with static defaults and prevents an empty format set', async () => {
    render(<Harness />);
    await expandFormats();
    fireEvent.click(screen.getByText('chatgpt_web.image_formats.add'));
    fireEvent.change(screen.getByLabelText('chatgpt_web.image_formats.name'), {
      target: { value: 'new-alias' },
    });
    fireEvent.click(screen.getByText('chatgpt_web.image_formats.apply'));
    expect((screen.getByLabelText('new-alias GIF') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText('new-alias JPEG'));
    fireEvent.click(screen.getByLabelText('new-alias WEBP'));
    expect((screen.getByLabelText('new-alias PNG') as HTMLInputElement).disabled).toBe(true);
  });
  it.each([{}, { features: [] }])(
    'does not offer format controls for an old backend',
    async (response) => {
      mocks.get.mockResolvedValue(response);
      render(<ChatGptWebImageFormatsEditor {...props} />);
      await screen.findByText('chatgpt_web.image_formats.unsupported');
      expect(screen.queryByLabelText('gpt-image-2.6 GIF')).toBeNull();
    }
  );
  it('cancels reads and ignores responses after changing connections or unmounting', async () => {
    let first!: (value: unknown) => void, second!: (value: unknown) => void;
    mocks.get
      .mockReturnValueOnce(
        new Promise((r) => {
          first = r;
        })
      )
      .mockReturnValueOnce(
        new Promise((r) => {
          second = r;
        })
      );
    const view = render(<ChatGptWebImageFormatsEditor {...props} />);
    const signal = mocks.get.mock.calls[0][2].signal;
    mocks.connection.apiBase = 'second';
    view.rerender(<ChatGptWebImageFormatsEditor {...props} connectionKey="second" />);
    expect(signal.aborted).toBe(true);
    await act(async () => first(capability));
    expect(screen.queryByLabelText('gpt-image-2.6 GIF')).toBeNull();
    await act(async () => second({ features: [] }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('unsupported'));
    view.unmount();
    expect(mocks.get.mock.calls[1][2].signal.aborted).toBe(true);
  });
});
