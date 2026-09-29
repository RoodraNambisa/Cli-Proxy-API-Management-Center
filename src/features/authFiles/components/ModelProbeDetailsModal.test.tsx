import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ModelProbeResult } from '@/services/api/authFiles';
import { ModelProbeDetailsModal } from './ModelProbeDetailsModal';
import styles from './AuthFileModelProbe.module.scss';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

const result: ModelProbeResult = {
  success: true,
  name: 'codex-test.json',
  model: 'test-model',
  request_path: '/v1/responses',
  stream: false,
  latency_ms: 240,
  response: 'OK',
  codex_state: {
    mode: 'configured',
    source: 'none',
    sent_length: 0,
    returned_length: 780,
  },
};

describe('model probe Cookie details', () => {
  it.each([true, false])('uses the shared detail typography and field grid (sent=%s)', (sent) => {
    render(
      <ModelProbeDetailsModal
        model={result.model}
        result={{
          ...result,
          codex_cookie: {
            mode: 'configured',
            source: sent ? 'managed' : 'none',
            sent,
            names: sent ? ['cookie_a', 'cookie_b'] : [],
            digest: sent ? 'sample-digest' : undefined,
            version: sent ? 3 : undefined,
          },
        }}
        onClose={vi.fn()}
      />
    );

    const heading = screen.getByText('model_probe.cookie_details');
    expect(heading.tagName).toBe(screen.getByText('model_probe.state_details').tagName);
    const section = heading.closest('section')!;
    const list = section.querySelector('dl')!;
    expect(list.classList.contains(styles.detailMetadata)).toBe(true);
    expect(list.children).toHaveLength(5);

    const fields = [
      ['model_probe.cookie_mode', 'model_probe.cookie_modes.configured'],
      ['codex_auto_cookie.source', `codex_auto_cookie.sources.${sent ? 'managed' : 'none'}`],
      ['model_probe.cookie_sent', sent ? 'cookie_a, cookie_b' : '—'],
      ['model_probe.cookie_digest', sent ? 'sample-digest' : '—'],
      ['model_probe.cookie_version', sent ? '3' : '—'],
    ];
    for (const [label, value] of fields) {
      const term = within(list).getByText(label, { selector: 'dt' });
      expect(term.parentElement?.parentElement).toBe(list);
      expect(term.nextElementSibling?.tagName).toBe('DD');
      expect(term.nextElementSibling?.textContent).toBe(value);
    }
  });

  it('omits the Cookie section when the backend did not report it', () => {
    render(<ModelProbeDetailsModal model={result.model} result={result} onClose={vi.fn()} />);
    expect(screen.queryByText('model_probe.cookie_details')).toBeNull();
    expect(screen.getByText('model_probe.state_details')).toBeTruthy();
  });
});
