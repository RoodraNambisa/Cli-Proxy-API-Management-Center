import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodexQuotaAutoDisableEditor } from './CodexQuotaAutoDisableEditor';
import { readCodexQuotaAutoDisable } from '@/utils/codexQuotaAutoDisable';
import '@/i18n';

describe('Codex quota auto-disable editor', () => {
  it('requires observation before enabling but permits disabling a paused policy', () => {
    const props = {
      onChange: vi.fn(),
      focusTarget: 'config-codex-quota-auto-disable',
      observing: false,
    };
    const { rerender } = render(
      <CodexQuotaAutoDisableEditor {...props} value={{ enabled: false, rules: [] }} />
    );
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
    rerender(<CodexQuotaAutoDisableEditor {...props} value={{ enabled: true, rules: [] }} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(props.onChange).toHaveBeenCalledWith({ enabled: false, rules: [] });
  });

  it('allows clearing only the weekly threshold without altering the 5-hour limit', () => {
    const onChange = vi.fn();
    render(
      <CodexQuotaAutoDisableEditor
        observing
        focusTarget="config-codex-quota-auto-disable"
        onChange={onChange}
        value={readCodexQuotaAutoDisable({
          enabled: true,
          rules: [{ 'weekly-remaining-percent': 10, 'five-hour-remaining-percent': 5 }],
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /#1/, expanded: false }));
    const fields = screen.getAllByRole('spinbutton');
    expect(fields).toHaveLength(2);
    fireEvent.change(fields[0], { target: { value: '' } });
    expect(onChange.mock.calls[0][0].rules[0]).toMatchObject({
      weeklyRemainingPercent: '',
      fiveHourRemainingPercent: '5',
    });
    expect(
      screen.getAllByRole('button', { name: /Choose providers|选择提供方|選擇提供方/ })
    ).toHaveLength(1);
  });
});
