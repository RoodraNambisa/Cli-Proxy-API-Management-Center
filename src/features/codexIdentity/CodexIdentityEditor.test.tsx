import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CodexIdentityEditor } from './CodexIdentityEditor';
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()), useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/components/config/SettingsDisclosure', () => ({
  SettingsDisclosure: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
it('shows explicit disabled overrides and restores inheritance', () => {
  const changed = vi.fn();
  render(
    <CodexIdentityEditor
      id="identity-test"
      value={{ 'identity-confuse': false }}
      onChange={changed}
    />
  );
  expect(screen.getByText('codex_identity.identity-confuse')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'codex_identity.reset' }));
  expect(changed).toHaveBeenCalledWith(undefined);
});
