import { useRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { AiProvidersPage } from '@/pages/AiProvidersPage';
import { AiProvidersCodexEditPage } from '@/pages/AiProvidersCodexEditPage';
import { useConfigFieldFocus } from '@/hooks/useConfigFieldFocus';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import { useAuthStore, useConfigStore } from '@/stores';
import { apiClient } from '@/services/api/client';

vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: () => ({ allowNextNavigation: vi.fn() }) }));
vi.mock('@/components/providers', () => ({
  GeminiSection: () => null, ClaudeSection: () => null, OpenAISection: () => null, VertexSection: () => null, ProviderNav: () => null,
  CodexSection: ({ onEdit }: { onEdit: (index: number) => void }) => <button onClick={() => onEdit(1)}>Edit chosen credential</button>,
  useProviderStats: () => ({ keyStats: {}, usageDetails: [], loadKeyStats: () => Promise.resolve(), refreshKeyStats: vi.fn() }),
}));
beforeEach(() => {
  vi.restoreAllMocks(); localStorage.clear();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  useAuthStore.setState({ connectionStatus: 'connected' });
});
function Destination() { const location = useLocation(); return <output>{location.pathname + location.search}</output>; }

test.each([
  ['common.model_catalog_manage', '/ai-providers?provider=codex&section=models'],
  ['common.oauth_model_display_name_manage', '/auth-files/oauth-model-alias?provider=codex'],
  ['ai_providers.codex_alpha_search_manage', '/ai-providers?provider=codex&section=alpha-search'],
])('the %s shortcut retains the intended editor destination', (name, expected) => {
  render(<MemoryRouter initialEntries={['/config?section=config-model-catalog-fields']}><Routes>
    <Route path="/config" element={<VisualConfigEditor values={DEFAULT_VISUAL_VALUES} baselineValues={DEFAULT_VISUAL_VALUES} onChange={vi.fn()} />} />
    <Route path="*" element={<Destination />} />
  </Routes></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name }));
  expect(screen.getByRole('status').textContent).toBe(expected);
});

test.each(['models', 'alpha-search'])('the provider list forwards %s for the chosen credential', async (section) => {
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue({});
  vi.spyOn(apiClient, 'get').mockResolvedValue({});
  render(<MemoryRouter initialEntries={[`/ai-providers?provider=codex&section=${section}`]}><Routes>
    <Route path="/ai-providers" element={<AiProvidersPage />} />
    <Route path="/ai-providers/codex/:index" element={<Destination />} />
  </Routes></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Edit chosen credential' }));
  expect(screen.getByRole('status').textContent).toBe(`/ai-providers/codex/1?section=${section}`);
});

test.each(['models', 'alpha-search'])('the credential editor focuses %s after loading without editing it', async (section) => {
  vi.spyOn(useConfigStore.getState(), 'isCacheValid').mockReturnValue(false);
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([{ apiKey: 'fixture', alphaSearch: false, models: [{ name: 'example' }] }]);
  vi.spyOn(apiClient, 'get').mockResolvedValue({ 'codex-api-key': [{ 'api-key': 'fixture', models: [{ name: 'example' }] }] });
  const put = vi.spyOn(apiClient, 'put');
  render(<MemoryRouter initialEntries={[`/ai-providers/codex/0?section=${section}`]}><Routes>
    <Route path="/ai-providers/codex/:index" element={<AiProvidersCodexEditPage />} />
  </Routes></MemoryRouter>);
  await waitFor(() => expect(document.getElementById(`codex-${section}`)?.contains(document.activeElement)).toBe(true));
  expect(put).not.toHaveBeenCalled();
});

test('focus stays within the current page and does not steal it again after refresh', async () => {
  function Harness({ ready }: { ready: boolean }) {
    const root = useRef<HTMLDivElement>(null);
    useConfigFieldFocus(root, 'models', ready);
    return <><div id="models"><input aria-label="Outgoing layer" /></div><div ref={root}><div id="models"><input aria-label="Current layer" /></div><input aria-label="Another field" /></div></>;
  }
  const view = render(<MemoryRouter><Harness ready={false} /></MemoryRouter>);
  expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  view.rerender(<MemoryRouter><Harness ready /></MemoryRouter>);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Current layer')));
  screen.getByLabelText('Another field').focus();
  view.rerender(<MemoryRouter><Harness ready={false} /></MemoryRouter>);
  view.rerender(<MemoryRouter><Harness ready /></MemoryRouter>);
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
});
