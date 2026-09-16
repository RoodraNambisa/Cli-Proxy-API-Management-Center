import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { TagListEditor } from '@/components/config/VisualConfigEditorBlocks';
import { AuthFilesOAuthModelAliasEditPage } from '@/pages/AuthFilesOAuthModelAliasEditPage';
import { AuthFilesOAuthExcludedEditPage } from '@/pages/AuthFilesOAuthExcludedEditPage';
import { RUNTIME_PROVIDER_OPTIONS } from '@/utils/providers';
import { authFilesApi } from '@/services/api/authFiles';
import { useAuthStore } from '@/stores';

const mocks = vi.hoisted(() => ({
  t: (key: string) => key,
  guard: { allowNextNavigation: vi.fn() },
}));
vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: mocks.t }),
}));
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => mocks.guard,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ connectionStatus: 'connected' });
});

test('provider picker offers supported integrations and preserves existing custom routes', () => {
  const change = vi.fn();
  render(<TagListEditor value={['custom-route']} onChange={change}
    suggestionOptions={RUNTIME_PROVIDER_OPTIONS} suggestionButtonLabel="Providers" />);
  fireEvent.click(screen.getByRole('button', { name: 'Providers' }));
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.queryByRole('checkbox', { name: /Qwen|iFlow|GeminiCLI/i })).toBeNull();
  for (const name of ['Codex', 'Grok', 'AI Studio', 'Vertex', 'Kimi', 'Google Interactions']) {
    expect(dialog.getByRole('checkbox', { name: new RegExp(name) })).toBeTruthy();
  }
  fireEvent.click(dialog.getByRole('checkbox', { name: /Grok/ }));
  fireEvent.click(dialog.getByRole('button', { name: 'common.confirm' }));
  expect(change).toHaveBeenCalledWith(['custom-route', 'xai']);
});

test.each(['aliases', 'exclusions'])('%s suggestions do not resurrect retired providers from old files or settings', async (page) => {
  const list = vi.spyOn(authFilesApi, 'list').mockResolvedValue({ files: [
    { name: 'legacy-qwen.json', type: 'qwen' },
    { name: 'legacy-iflow.json', type: 'iflow' },
    { name: 'legacy-gemini.json', type: 'gemini-cli' },
  ] });
  vi.spyOn(authFilesApi, 'getOauthExcludedModels').mockResolvedValue({ qwen: ['*'], iflow: ['*'] });
  const mappings = vi.spyOn(authFilesApi, 'getOauthModelAlias').mockResolvedValue({
    qwen: [{ name: 'old', alias: 'local' }], iflow: [{ name: 'old', alias: 'local' }],
  });
  vi.spyOn(authFilesApi, 'getModelDefinitions').mockResolvedValue([]);
  render(<MemoryRouter>{page === 'aliases' ? <AuthFilesOAuthModelAliasEditPage /> : <AuthFilesOAuthExcludedEditPage />}</MemoryRouter>);
  await waitFor(() => expect(mappings).toHaveBeenCalled());
  expect(await screen.findByRole('button', { name: 'Grok' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Qwen|iFlow|Gemini-cli/i })).toBeNull();
  if (page === 'aliases') expect(list).not.toHaveBeenCalled();
});
