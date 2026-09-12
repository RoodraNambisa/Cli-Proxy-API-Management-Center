import { beforeAll, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { CodexQuotaObservationPanel } from '@/features/authFiles/components/CodexQuotaObservationPanel';
import {
  codexObservedQuotaWindows,
  normalizeCodexQuotaObservation,
} from '@/utils/codexQuotaObservation';
import en from '@/i18n/locales/en.json';

const i18n = createInstance();
beforeAll(() =>
  i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  })
);
const observedAt = '2026-09-13T00:00:00Z';
const snapshot = (values: Record<string, string>) =>
  normalizeCodexQuotaObservation({ observed_at: observedAt, source: 'http', signals: values })!;
const slot = (id: string, values: Record<string, string>) =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [`x-codex-${id}-${key}`, value]));
const zeros = { 'used-percent': '0', 'window-minutes': '0', 'reset-after-seconds': '0' };

test.each(['primary', 'secondary', 'code-review-primary', 'additional-spark-secondary'])(
  'hides the all-zero %s slot without discarding raw signals',
  (id) => {
    const observation = snapshot(slot(id, zeros));
    Object.freeze(observation.signals);
    expect(codexObservedQuotaWindows(observation)).toEqual([]);
    expect(observation.signals).toEqual(slot(id, zeros));
  }
);

test('also treats an explicit zero absolute reset as a placeholder', () => {
  expect(
    codexObservedQuotaWindows(snapshot(slot('secondary', { ...zeros, 'reset-at': '0' })))
  ).toEqual([]);
});

test.each([
  { 'used-percent': '25', 'window-minutes': '0', 'reset-after-seconds': '0' },
  { 'used-percent': '0', 'window-minutes': '300', 'reset-after-seconds': '0' },
  { 'used-percent': '0', 'window-minutes': '0', 'reset-after-seconds': '600' },
  { 'used-percent': '0', 'reset-after-seconds': '0' },
  { 'window-minutes': '0', 'reset-after-seconds': '0' },
  { 'used-percent': '0', 'window-minutes': '0' },
  { ...zeros, 'reset-at': '1789261200' },
  { ...zeros, 'reset-at': 'invalid' },
])('retains useful or incomplete quota data: %j', (values) => {
  expect(codexObservedQuotaWindows(snapshot(slot('secondary', values)))).toHaveLength(1);
});

test('renders real weekly quota without an empty second quota bar', () => {
  const observation = snapshot({
    ...slot('primary', {
      'used-percent': '5',
      'window-minutes': '10080',
      'reset-after-seconds': '3600',
    }),
    ...slot('secondary', zeros),
  });
  render(
    <I18nextProvider i18n={i18n}>
      <CodexQuotaObservationPanel
        compact={false}
        file={{
          name: 'fixture.json',
          type: 'codex',
          quota_observation_enabled: true,
          quota_observation: observation,
        }}
      />
    </I18nextProvider>
  );
  expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  expect(
    screen
      .getByRole('progressbar', { name: en.codex_quota.secondary_window })
      .getAttribute('aria-valuenow')
  ).toBe('95');
  expect(screen.queryByText(/period unknown/)).toBeNull();
  expect(screen.queryByText('100% remaining')).toBeNull();
});
