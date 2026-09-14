import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatGptWebSentinelPanel } from './ChatGptWebSentinelPanel';
import { toCompatibilityDraft, readCompatibilityDraft } from '../sentinelCompatibility';
import type { ChatGptWebSentinelConfigPatch, ChatGptWebSentinelSnapshot } from '@/types';

const api = vi.hoisted(() => ({ getSentinel: vi.fn(), patchSentinel: vi.fn() }));
const notify = vi.hoisted(() => vi.fn());
vi.mock('@/services/api', () => ({ chatGptWebApi: api }));
vi.mock('@/stores', () => ({ useNotificationStore: () => ({ showNotification: notify }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let current: ChatGptWebSentinelSnapshot;
const key = (name: string) => `chatgpt_web.sentinel.compatibility.${name}`;
const saveButton = () => screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement;
async function openEditor() {
  await waitFor(() =>
    expect((screen.getByLabelText(key('enabled')) as HTMLInputElement).disabled).toBe(false)
  );
  fireEvent.click(screen.getByText(key('title')));
}

describe('Sentinel compatibility panel saving', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    current = {
      'sdk-runtime-enabled': true,
      'sdk-workers': 0,
      'sdk-queue-size': 32,
      'sdk-cache-versions': 3,
      'go-vm-compatibility': readCompatibilityDraft(toCompatibilityDraft())!,
      initialized: false,
      available: true,
      go_vm_rule_count: 0,
    } as ChatGptWebSentinelSnapshot;
    api.getSentinel.mockImplementation(async () => structuredClone(current));
    api.patchSentinel.mockImplementation(async (patch: ChatGptWebSentinelConfigPatch) => {
      current = { ...current, ...patch };
    });
  });

  it('marks toggles dirty, saves only changed configuration and reloads it', async () => {
    const dirty = vi.fn();
    render(<ChatGptWebSentinelPanel onDirtyChange={dirty} />);
    await openEditor();
    expect(saveButton().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(key('enabled')));
    expect(saveButton().disabled).toBe(false);
    expect(dirty).toHaveBeenLastCalledWith(true);
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(api.patchSentinel).toHaveBeenCalledWith({
        'go-vm-compatibility': { ...readCompatibilityDraft(toCompatibilityDraft()), enabled: true },
      })
    );
    await waitFor(() => expect(saveButton().disabled).toBe(true));
    expect(dirty).toHaveBeenLastCalledWith(false);
    expect((screen.getByLabelText(key('enabled')) as HTMLInputElement).checked).toBe(true);
  });

  it('saves remote mode and explicit empty scopes without resetting SDK settings', async () => {
    current.mode = 'local';
    current.remote = { scopes: ['images'], nodes: [{ name: 'one', url: 'https://solver.example.com', 'api-key': 'secret' }], 'budget-seconds': 30 };
    render(<ChatGptWebSentinelPanel />);
    await openEditor();
    fireEvent.change(screen.getByLabelText('sentinel_compute.mode'), { target: { value: 'remote' } });
    fireEvent.click(screen.getByLabelText('sentinel_compute.images'));
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());
    await waitFor(() => expect(api.patchSentinel).toHaveBeenCalledWith({ mode: 'remote', remote: { ...current.remote, scopes: [] } }));
    await waitFor(() => expect(saveButton().disabled).toBe(true));
    expect(current['sdk-runtime-enabled']).toBe(true);
  });

  it('saves explicit empty lists when fields are deleted', async () => {
    current['go-vm-compatibility']!['writable-window-properties'] = ['__state'];
    current['go-vm-compatibility']!['environment-properties'] = [
      { path: 'window.__flag', type: 'boolean', value: false, enumerable: false },
    ];
    render(<ChatGptWebSentinelPanel />);
    await openEditor();
    fireEvent.change(screen.getByRole('textbox', { name: new RegExp(key('writable')) }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: key('remove') }));
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(api.patchSentinel).toHaveBeenCalledWith({
        'go-vm-compatibility': readCompatibilityDraft(toCompatibilityDraft()),
      })
    );
    await waitFor(() => expect(saveButton().disabled).toBe(true));
  });

  it('keeps the draft after a rejected save and supports reset', async () => {
    api.patchSentinel.mockRejectedValue(new Error('protected property'));
    render(<ChatGptWebSentinelPanel />);
    await openEditor();
    fireEvent.click(screen.getByLabelText(key('enabled')));
    fireEvent.click(saveButton());
    await waitFor(() => expect(notify).toHaveBeenCalled());
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    expect((screen.getByLabelText(key('enabled')) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'chatgpt_web.sentinel.reset' }));
    expect(saveButton().disabled).toBe(true);
  });

  it('does not send unsupported rules to older backends', async () => {
    delete current['go-vm-compatibility'];
    render(<ChatGptWebSentinelPanel />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/chatgpt_web.sentinel.queue_size/) as HTMLInputElement).disabled
      ).toBe(false)
    );
    fireEvent.change(screen.getByLabelText(/chatgpt_web.sentinel.queue_size/), {
      target: { value: '64' },
    });
    fireEvent.click(saveButton());
    await waitFor(() => expect(api.patchSentinel).toHaveBeenCalledWith({ 'sdk-queue-size': 64 }));
  });
});
