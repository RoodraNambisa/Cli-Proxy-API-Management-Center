import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GuardSettingsEditor } from './CodexResponseGuardEditor';
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('response guard inheritance controls', () => {
  it('distinguishes an explicit empty accepted-model list from inheritance', () => {
    const change = vi.fn();
    render(
      <GuardSettingsEditor
        value={{ 'allowed-returned-models': [] }}
        inherited={{ 'allowed-returned-models': ['alternate'] }}
        onChange={change}
      />
    );
    expect(screen.queryByText('alternate')).toBeNull();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'response_guard.customize response_guard.allowed-returned-models',
      })
    );
    expect(change.mock.calls[0][0]).not.toHaveProperty('allowed-returned-models');
  });
});
