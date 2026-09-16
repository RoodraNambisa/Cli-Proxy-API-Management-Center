import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialTargetModal } from '@/features/authFiles/components/CredentialTargetModal';
import { apiKeysApi } from '@/services/api/apiKeys';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';
import * as clipboard from '@/utils/clipboard';
import { normalizeClientApiKeyGroups } from '@/utils/apiKeyGroups';

const translate = (key: string) => key;
vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: translate }),
}));
const file = { name: 'test.json', auth_index: '1234567890abcdef', provider: 'xai' };
const show = () =>
  render(<CredentialTargetModal file={file} onClose={() => {}} onSaved={async () => {}} />);

describe('fixed credential test keys', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  it('only lists opted-in keys, saves an alias and copies a targeted client key', async () => {
    vi.spyOn(apiKeysApi, 'getAccessSnapshot').mockResolvedValue({
      keys: ['sk-disabled', 'sk-test'],
      groups: [
        { apiKey: 'sk-disabled', name: 'Disabled key', providers: [] },
        { apiKey: 'sk-test', name: 'Enabled key', providers: [], allowCredentialTargeting: true },
      ],
      credentialTargetingSupported: true,
    });
    const enable = vi.spyOn(apiKeysApi, 'updateCredentialTargeting').mockResolvedValue({});
    const save = vi.spyOn(authFilesApi, 'patchFields').mockResolvedValue({ status: 'ok' });
    const copy = vi.spyOn(clipboard, 'copyToClipboard').mockResolvedValue(true);
    show();
    const copyButton = screen.getByRole('button', { name: 'credential_target.copy' });
    expect((copyButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('checkbox', { name: 'credential_target.allow' })).toBeNull();
    await waitFor(() => expect((copyButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'credential_target.key' }));
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.queryByText(/Disabled key/)).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: /Enabled key/ }));
    expect(enable).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('test')).toBeTruthy();
    fireEvent.click(copyButton);
    await waitFor(() => expect(copy).toHaveBeenLastCalledWith('sk-test-auth-1234567890abcdef'));
    fireEvent.change(screen.getByLabelText('credential_target.alias'), {
      target: { value: 'TEST' },
    });
    expect((copyButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('test.json', { routing_alias: 'test' }));
    await waitFor(() => expect((copyButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(copyButton);
    await waitFor(() => expect(copy).toHaveBeenLastCalledWith('sk-test-auth-test'));
    fireEvent.change(screen.getByLabelText('credential_target.alias'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith('test.json', { routing_alias: '' }));
  });
  it('directs users with no eligible keys to key settings without editing permissions', async () => {
    vi.spyOn(apiKeysApi, 'getAccessSnapshot').mockResolvedValue({
      keys: ['sk-test'],
      groups: [],
      credentialTargetingSupported: true,
    });
    const enable = vi.spyOn(apiKeysApi, 'updateCredentialTargeting');
    show();
    await screen.findByText('credential_target.no_enabled_keys');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'credential_target.copy' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(enable).not.toHaveBeenCalled();
  });
  it('round-trips the access flag without overwriting permissions', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
    await apiKeysApi.updateCredentialTargeting('sk-test', false);
    expect(patch).toHaveBeenCalledWith('/api-key-groups', {
      'api-key': 'sk-test',
      'allow-credential-targeting': false,
    });
    expect(
      normalizeClientApiKeyGroups([
        {
          'api-key': 'sk-test',
          providers: ['xai'],
          'allowed-priorities': [3],
          'allow-credential-targeting': true,
        },
      ])[0]
    ).toEqual({
      apiKey: 'sk-test',
      providers: ['xai'],
      allowedPriorities: [3],
      allowCredentialTargeting: true,
    });
  });
});
