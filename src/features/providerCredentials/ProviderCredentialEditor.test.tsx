import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  create: vi.fn(),
  discover: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/services/api/client', () => ({
  apiClient: { captureConnection: () => ({ apiBase: 'fixture' }) },
}));
vi.mock('./api', () => ({ providerCredentialsApi: mocks }));
vi.mock('@/services/api/authFiles', () => ({ authFilesApi: { probeModel: vi.fn() } }));
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));
import { ProviderCredentialEditor } from './ProviderCredentialEditor';
const fixture = {
  id: 'stable-id',
  kind: 'codex',
  revision: 'version-a',
  values: {
    'channel-name': 'Primary',
    'base-url': 'https://example.invalid',
    has_api_key: true,
    'models-mode': 'selected',
    models: [{ name: 'upstream', alias: 'public' }],
    headers: { 'X-Custom': 'keep' },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(fixture);
  mocks.save.mockResolvedValue({ status: 'ok' });
});

it('saves a renamed channel with its original identity and revision and keeps its key', async () => {
  const saved = vi.fn();
  render(<ProviderCredentialEditor id="stable-id" onClose={vi.fn()} onSaved={saved} />);
  fireEvent.change(await screen.findByDisplayValue('Primary'), { target: { value: 'Backup' } });
  fireEvent.click(screen.getByText('common.save'));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(mocks.save.mock.calls[0][0]).toMatchObject({ id: 'stable-id', revision: 'version-a' });
  expect(mocks.save.mock.calls[0][1]).toMatchObject({
    'channel-name': 'Backup',
    'api-key': '',
    headers: { 'X-Custom': 'keep' },
    models: [{ name: 'upstream', alias: 'public' }],
  });
});

it('keeps draft input on conflicts', async () => {
  mocks.save.mockRejectedValue({ status: 409 });
  render(<ProviderCredentialEditor id="stable-id" onClose={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.change(await screen.findByDisplayValue('Primary'), { target: { value: 'My change' } });
  fireEvent.click(screen.getByText('common.save'));
  await screen.findByText('api_credentials.conflict');
  expect(screen.getByDisplayValue('My change')).toBeTruthy();
});

it('restores child model inheritance using explicit nulls', async () => {
  mocks.get.mockResolvedValue({
    ...fixture,
    kind: 'openai',
    parent_id: 'parent',
    parent: { 'channel-name': 'Group', models: [{ name: 'shared' }] },
    values: { ...fixture.values, priority: 0 },
  });
  render(<ProviderCredentialEditor id="stable-id" onClose={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByDisplayValue('Primary');
  fireEvent.click(screen.getByText('api_credentials.inherit_models'));
  fireEvent.click(screen.getByText('common.save'));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(mocks.save.mock.calls[0][1]).toMatchObject({
    models: null,
    'models-mode': null,
    priority: 0,
  });
});

it('fetches a model catalog without saving configuration and exposes actual failure', async () => {
  mocks.discover.mockRejectedValue(new Error('HTTP 401: invalid key'));
  render(<ProviderCredentialEditor id="stable-id" onClose={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByDisplayValue('Primary');
  fireEvent.click(screen.getByText('api_credentials.fetch_models'));
  await screen.findByText('HTTP 401: invalid key');
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue('upstream')).toBeTruthy();
});

it('adds a manual model row and saves its mapping', async () => {
  render(<ProviderCredentialEditor id="stable-id" onClose={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByDisplayValue('Primary');
  fireEvent.click(screen.getByText('api_credentials.add_model'));
  const inputs = screen.getAllByPlaceholderText('model-name');
  expect(inputs).toHaveLength(2);
  fireEvent.change(inputs[1], { target: { value: 'manual-upstream' } });
  fireEvent.change(screen.getAllByPlaceholderText('alias (optional)')[1], {
    target: { value: 'manual-alias' },
  });
  fireEvent.click(screen.getByText('common.save'));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(mocks.save.mock.calls[0][1].models).toContainEqual({
    name: 'manual-upstream',
    alias: 'manual-alias',
  });
});

it('reuses discovery briefly and invalidates it when the connection draft changes', async () => {
  mocks.discover.mockResolvedValue([{ name: 'discovered' }]);
  render(<ProviderCredentialEditor id="stable-id" onClose={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByDisplayValue('Primary');
  fireEvent.click(screen.getByText('api_credentials.fetch_models'));
  await screen.findByText('discovered');
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'api_credentials.fetch_models' }) as HTMLButtonElement)
        .disabled
    ).toBe(false)
  );
  fireEvent.click(screen.getByText('api_credentials.fetch_models'));
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'api_credentials.fetch_models' }) as HTMLButtonElement)
        .disabled
    ).toBe(false)
  );
  expect(mocks.discover).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByLabelText('api_credentials.priority'), { target: { value: '-5' } });
  fireEvent.click(screen.getByText('api_credentials.fetch_models'));
  await waitFor(() => expect(mocks.discover).toHaveBeenCalledTimes(2));
  expect(mocks.discover.mock.lastCall?.[1].values.priority).toBe(-5);
  await waitFor(() =>
    expect(screen.getByLabelText('api_credentials.proxy').hasAttribute('disabled')).toBe(false)
  );
  fireEvent.change(screen.getByDisplayValue('https://example.invalid'), {
    target: { value: 'https://new.invalid' },
  });
  fireEvent.click(screen.getByText('api_credentials.fetch_models'));
  await waitFor(() => expect(mocks.discover).toHaveBeenCalledTimes(3));
});

it.each([
  [
    { error: 'proxy_unavailable', proxy_pool: 'catalog-pool' },
    'api_credentials.proxy_pool_unavailable',
  ],
  [{ error: 'proxy_unavailable' }, 'api_credentials.proxy_unavailable'],
])('explains a management proxy failure for a draft', async (data, label) => {
  mocks.discover.mockRejectedValue(
    Object.assign(new Error('proxy_unavailable'), { status: 503, data })
  );
  render(<ProviderCredentialEditor onClose={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.click(screen.getByText('api_credentials.fetch_models'));
  expect((await screen.findByRole('alert')).textContent).toBe(label);
});
