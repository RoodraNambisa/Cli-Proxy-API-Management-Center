import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialTargetModal } from '@/features/authFiles/components/CredentialTargetModal';
import { apiKeysApi } from '@/services/api/apiKeys';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';
import * as clipboard from '@/utils/clipboard';
import { normalizeClientApiKeyGroups } from '@/utils/apiKeyGroups';
import { ApiKeysCardEditor } from '@/components/config/VisualConfigEditorBlocks';

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

  it('saves independent test options under the issuing key and retains disabled options', async () => {
    vi.spyOn(apiKeysApi, 'getAccessSnapshot').mockResolvedValue({
      keys: ['sk-test'],
      groups: [{ apiKey: 'sk-test', providers: ['codex'], allowCredentialTargeting: true }],
      credentialTargetingSupported: true,
      credentialTargetOptionsSupported: true,
    });
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ status: 'ok' });
    render(<ApiKeysCardEditor value="sk-test" active onChange={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: /^config_management.visual.api_keys.restrictions:/ })
    );
    const state = await screen.findByRole('checkbox', { name: 'credential_target.respect_state' });
    const rewrite = screen.getByRole('checkbox', { name: 'credential_target.rewrite_model' });
    const limit = screen.getByRole('checkbox', { name: 'credential_target.respect_limit' });
    expect((limit as HTMLInputElement).checked).toBe(false);
    expect((state as HTMLInputElement).checked).toBe(false);
    expect((rewrite as HTMLInputElement).checked).toBe(false);
    fireEvent.click(state);
    await waitFor(() => expect((state as HTMLInputElement).checked).toBe(true));
    expect(patch).toHaveBeenLastCalledWith('/api-key-groups', {
      'api-key': 'sk-test',
      'credential-target-respect-state-policy': true,
    });
    fireEvent.click(rewrite);
    await waitFor(() => expect((rewrite as HTMLInputElement).checked).toBe(true));
    expect(patch).toHaveBeenLastCalledWith('/api-key-groups', {
      'api-key': 'sk-test',
      'credential-target-response-model-rewrite': true,
    });
    fireEvent.click(limit);
    await waitFor(() => expect((limit as HTMLInputElement).checked).toBe(true));
    expect(patch).toHaveBeenLastCalledWith('/api-key-groups', {
      'api-key': 'sk-test',
      'credential-target-respect-request-limit': true,
    });
    const permission = screen.getByRole('checkbox', { name: 'credential_target.allow' });
    fireEvent.click(permission);
    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: 'credential_target.respect_state' })).toBeNull()
    );
    fireEvent.click(permission);
    await waitFor(() =>
      expect(
        (
          screen.getByRole('checkbox', {
            name: 'credential_target.respect_state',
          }) as HTMLInputElement
        ).checked
      ).toBe(true)
    );
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'credential_target.respect_limit',
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'credential_target.rewrite_model',
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
  });

  it('keeps current options on a failed save and refuses unsupported backends', async () => {
    const snapshot = {
      keys: ['sk-test'],
      groups: [{ apiKey: 'sk-test', providers: [], allowCredentialTargeting: true }],
      credentialTargetingSupported: true,
      credentialTargetOptionsSupported: true,
    };
    vi.spyOn(apiKeysApi, 'getAccessSnapshot').mockResolvedValue(snapshot);
    vi.spyOn(apiClient, 'patch').mockRejectedValue(new Error('save failed'));
    const view = render(<ApiKeysCardEditor value="sk-test" active onChange={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: /^config_management.visual.api_keys.restrictions:/ })
    );
    const state = await screen.findByRole('checkbox', { name: 'credential_target.respect_state' });
    fireEvent.click(state);
    await waitFor(() => expect((state as HTMLInputElement).disabled).toBe(false));
    expect((state as HTMLInputElement).checked).toBe(false);
    view.unmount();
    vi.mocked(apiKeysApi.getAccessSnapshot).mockResolvedValue({
      ...snapshot,
      credentialTargetOptionsSupported: false,
    });
    render(<ApiKeysCardEditor value="sk-test" active onChange={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: /^config_management.visual.api_keys.restrictions:/ })
    );
    await screen.findByText('credential_target.options_upgrade');
    expect(screen.queryByRole('checkbox', { name: 'credential_target.respect_state' })).toBeNull();
  });

  it('shows selected-key behavior without placing policy switches in the credential modal', async () => {
    vi.spyOn(apiKeysApi, 'getAccessSnapshot').mockResolvedValue({
      keys: ['sk-test'],
      groups: [
        {
          apiKey: 'sk-test',
          providers: [],
          allowCredentialTargeting: true,
          credentialTargetRespectStatePolicy: true,
          credentialTargetRespectRequestLimit: true,
          credentialTargetResponseModelRewrite: true,
        },
      ],
      credentialTargetingSupported: true,
      credentialTargetOptionsSupported: true,
    });
    show();
    await screen.findByText('credential_target.state_obey_summary');
    expect(screen.getByText('credential_target.limit_obey_summary')).toBeTruthy();
    expect(screen.getByText('credential_target.model_apply_summary')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(
      normalizeClientApiKeyGroups([
        {
          'api-key': 'sk-test',
          providers: [],
          'credential-target-respect-state-policy': true,
          'credential-target-respect-request-limit': true,
          'credential-target-response-model-rewrite': false,
        },
      ])[0]
    ).toMatchObject({
      credentialTargetRespectStatePolicy: true,
      credentialTargetRespectRequestLimit: true,
      credentialTargetResponseModelRewrite: false,
    });
  });
});
