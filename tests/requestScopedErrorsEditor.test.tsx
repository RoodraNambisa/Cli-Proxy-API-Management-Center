import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { RequestScopedErrorsEditor } from '@/components/providers/RequestScopedErrorsEditor';
import type { RequestScopedErrorRule } from '@/types/requestScopedErrors';
import { serializeRequestScopedErrors } from '@/utils/requestScopedErrors';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, args?: { index?: number }) => key + (args?.index ? ` ${args.index}` : '') }) }));

function Harness({ initial = [], disabled = false }: { initial?: RequestScopedErrorRule[]; disabled?: boolean }) {
  const [rules, setRules] = useState(initial);
  return <><RequestScopedErrorsEditor value={rules} onChange={setRules} disabled={disabled} /><output data-testid="rules">{JSON.stringify(rules)}</output></>;
}
const current = (): RequestScopedErrorRule[] => JSON.parse(screen.getByTestId('rules').textContent!);

describe('request error rule editor', () => {
  test('adds constrained fields, chooses an action and preserves multiline patterns', () => {
    render(<Harness />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'request_scoped_errors.add_rule' }));
    const status = screen.getByRole('spinbutton', { name: 'request_scoped_errors.status' });
    expect(status.getAttribute('min')).toBe('100');
    expect(status.getAttribute('max')).toBe('599');
    expect(status.getAttribute('step')).toBe('1');
    fireEvent.change(status, { target: { value: '503' } });
    fireEvent.click(screen.getByRole('button', { name: 'request_scoped_errors.action' }));
    expect(screen.getAllByRole('option')).toHaveLength(4);
    fireEvent.click(screen.getByRole('option', { name: 'request_scoped_errors.actions.continue-and-cooldown' }));
    fireEvent.click(screen.getByRole('button', { name: 'request_scoped_errors.add_match' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'request_scoped_errors.match 1' }), { target: { value: '  exact\ntext  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'request_scoped_errors.add_matchRegexr' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'request_scoped_errors.matchRegexr 1' }), { target: { value: '(?i)busy' } });
    expect(serializeRequestScopedErrors(current())).toEqual([{ status: 503, action: 'continue-and-cooldown', match: ['  exact\ntext  '], 'match-regexr': ['(?i)busy'] }]);
    fireEvent.click(screen.getAllByRole('button', { name: 'request_scoped_errors.remove_pattern 1' })[0]);
    expect(current()[0].match).toEqual([]);
    expect(current()[0].matchRegexr).toEqual(['(?i)busy']);
  });

  test('reorders whole rules without dropping unknown fields and allows clearing', () => {
    render(<Harness initial={[{ status: 500, action: 'stop', match: ['first'], future: 'keep' }, { status: 501, action: 'continue', match: ['second'] }]} />);
    const groups = screen.getAllByRole('group');
    fireEvent.click(within(groups[1]).getByRole('button', { name: 'common.move_up' }));
    expect(current().map((rule) => rule.status)).toEqual([501, 500]);
    expect(current()[1].future).toBe('keep');
    fireEvent.click(within(screen.getAllByRole('group')[0]).getByRole('button', { name: 'request_scoped_errors.remove_rule' }));
    fireEvent.click(screen.getByRole('button', { name: 'request_scoped_errors.remove_rule' }));
    expect(current()).toEqual([]);
  });

  test('disabled controls cannot alter rules; invalid values remain visible', () => {
    const initial = [{ status: 600, action: 'invalid', match: ['private'] }];
    const { rerender } = render(<Harness initial={initial} disabled />);
    fireEvent.click(screen.getByRole('button', { name: 'request_scoped_errors.remove_rule' }));
    expect(current()).toEqual(initial);
    expect(screen.getByText('request_scoped_errors.invalid_status')).toBeTruthy();
    rerender(<Harness initial={initial} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '500' } });
    expect(screen.getByText('request_scoped_errors.invalid_action')).toBeTruthy();
  });

  test('all four locales cover the same controls and action labels', () => {
    for (const locale of [ru, zhCN, zhTW]) {
      expect(Object.keys(locale.request_scoped_errors).sort()).toEqual(Object.keys(en.request_scoped_errors).sort());
      expect(Object.keys(locale.request_scoped_errors.actions).sort()).toEqual(Object.keys(en.request_scoped_errors.actions).sort());
      for (const value of Object.values(locale.request_scoped_errors)) expect(value).toBeTruthy();
    }
  });
});
