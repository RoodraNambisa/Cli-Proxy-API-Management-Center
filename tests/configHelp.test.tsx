import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ConfigHelp } from '@/components/config/ConfigHelp';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const explanation = 'A full explanation with defaults, dependencies and hot reload behavior. '.repeat(8);

test('shows full help outside clipping containers on hover or keyboard focus and dismisses it', async () => {
  const { container, unmount } = render(<div style={{ overflow: 'hidden' }}><ConfigHelp title="Affinity" text={explanation} /></div>);
  const button = screen.getByRole('button');
  fireEvent.mouseEnter(button.parentElement!);
  const tip = screen.getByRole('tooltip');
  expect(tip.textContent).toContain(explanation);
  expect(container.contains(tip)).toBe(false);
  fireEvent.mouseLeave(button.parentElement!);
  fireEvent.mouseEnter(tip);
  expect(screen.getByRole('tooltip')).toBe(tip);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.focus(button);
  expect(screen.getByRole('tooltip').id).toBe(button.getAttribute('aria-describedby'));
  fireEvent.blur(button);
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.mouseEnter(button.parentElement!);
  fireEvent.scroll(window);
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.mouseEnter(button.parentElement!);
  fireEvent.mouseLeave(button.parentElement!);
  unmount();
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
});

test('click opens readable help without toggling the setting and Escape restores focus', async () => {
  const change = vi.fn();
  render(<div><ConfigHelp title="Affinity" text={explanation} /><ToggleSwitch checked={false} onChange={change} ariaLabel="Affinity" /></div>);
  const help = screen.getByRole('button');
  help.focus();
  fireEvent.click(help);
  const modal = await screen.findByRole('dialog');
  expect(within(modal).getByText(explanation.trim())).toBeTruthy();
  expect(change).not.toHaveBeenCalled();
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(help);
});
