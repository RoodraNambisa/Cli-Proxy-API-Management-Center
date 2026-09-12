import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { LoginPage } from '@/pages/LoginPage';

const mocks = vi.hoisted(() => ({ restore: vi.fn(), login: vi.fn(), notify: vi.fn() }));
vi.mock('@/stores', () => ({
  useAuthStore: (selector: (state: object) => unknown) => selector({
    restoreSession: mocks.restore, login: mocks.login, isAuthenticated: false,
    apiBase: '', managementAccessPath: '', managementKey: '', rememberPassword: false,
  }),
  useLanguageStore: (selector: (state: object) => unknown) => selector({ language: 'en', setLanguage: vi.fn() }),
  useNotificationStore: () => ({ showNotification: mocks.notify }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function Destination() {
  const location = useLocation();
  return <div data-testid="destination">{location.pathname + location.search + location.hash}</div>;
}
function mount() {
  return render(<MemoryRouter initialEntries={[{ pathname: '/login', state: { from: { pathname: '/config', search: '?page=codex', hash: '#models' } } }]}>
    <Routes><Route path="/login" element={<LoginPage />} /><Route path="*" element={<Destination />} /></Routes>
  </MemoryRouter>);
}

describe('management login startup', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test('opens the original deep link as soon as session restoration succeeds', async () => {
    vi.useFakeTimers();
    try {
      mocks.restore.mockResolvedValue(true);
      mount();
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByTestId('destination').textContent).toBe('/config?page=codex#models');
    } finally { vi.useRealTimers(); }
  });

  test('still shows the login form after unsuccessful restoration and preserves its destination', async () => {
    mocks.restore.mockResolvedValue(false);
    mocks.login.mockResolvedValue(undefined);
    mount();
    await screen.findByLabelText('login.management_key_label');
    fireEvent.change(screen.getByLabelText('login.management_key_label'), { target: { value: 'test-only-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'login.submit_button' }));
    expect((await screen.findByTestId('destination')).textContent).toBe('/config?page=codex#models');
  });

  test('does not navigate when a pending restoration completes after leaving login', async () => {
    let finish!: (value: boolean) => void;
    mocks.restore.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    const view = mount();
    view.unmount();
    await act(async () => { finish(true); });
    expect(screen.queryByTestId('destination')).toBeNull();
  });
});
