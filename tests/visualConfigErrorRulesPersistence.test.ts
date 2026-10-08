import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parse, parseDocument } from 'yaml';
import { useVisualConfig } from '@/hooks/useVisualConfig';

const source = `port: 8317
api-keys:
  - fixture
api-key-groups:
  - api-key: fixture
    providers:
      - codex
    name: codex-0
    allowed-priorities:
      - 0
    excluded-priorities:
      - 3
non-retryable-errors:
  # Keep the explicit wildcard and this comment.
  - status-code: 0
    message-contains: this content was flagged
    future-setting: keep
  - status-code: 400
    type: image_generation_user_error
fixed-error-cooldowns:
  - status-code: 429
    message-contains: Rate limit exceeded
    cooldown-seconds: 10
    scope: auth
  - status-code: 0 # Match any status.
    message-contains: invalidated oauth token
    cooldown-seconds: 2592000
    scope: auth
  - status-code: 402
    message-contains: deactivated_workspace
    cooldown-seconds: 2592000
    scope: auth
    future-setting: keep
`;

function normalizeYaml(yaml: string): string {
  return parseDocument(yaml).toString({ indent: 2, lineWidth: 120, minContentWidth: 0 });
}

describe('visual config error rule persistence', () => {
  it('changes only the API key name without rewriting untouched error rules', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    act(() => result.current.setVisualValues({ apiKeyNames: { fixture: 'codex-0-' } }));

    expect(result.current.applyVisualChangesToYaml(source)).toBe(
      normalizeYaml(source.replace('name: codex-0', 'name: codex-0-'))
    );
  });

  it('retains newer server rules when saving an unrelated field', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    act(() => result.current.setVisualValues({ port: '8318' }));
    const latest = source
      .replace('cooldown-seconds: 10', 'cooldown-seconds: 20')
      .replace('status-code: 400', 'status-code: 403');

    expect(result.current.applyVisualChangesToYaml(latest)).toBe(
      normalizeYaml(latest.replace('port: 8317', 'port: 8318'))
    );
  });

  it('does not rewrite rules after an edit is reverted', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    const { fixedErrorCooldowns, nonRetryableErrors } = result.current.visualValues;
    act(() => result.current.setVisualValues({ fixedErrorCooldowns: [], nonRetryableErrors: [] }));
    act(() => result.current.setVisualValues({ fixedErrorCooldowns, nonRetryableErrors }));

    expect(result.current.visualDirty).toBe(false);
    expect(result.current.applyVisualChangesToYaml(source)).toBe(normalizeYaml(source));
  });

  it('still saves explicit rule edits and clearing', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    const { fixedErrorCooldowns, nonRetryableErrors } = result.current.visualValues;
    act(() =>
      result.current.setVisualValues({
        fixedErrorCooldowns: [{ ...fixedErrorCooldowns[0], cooldownSeconds: '20' }],
        nonRetryableErrors: [{ ...nonRetryableErrors[1], statusCode: '403' }],
      })
    );
    const saved = result.current.applyVisualChangesToYaml(source);
    expect(parse(saved)['fixed-error-cooldowns']).toEqual([
      {
        'status-code': 429,
        'message-contains': 'Rate limit exceeded',
        'cooldown-seconds': 20,
        scope: 'auth',
      },
    ]);
    expect(parse(saved)['non-retryable-errors']).toEqual([
      { 'status-code': 403, type: 'image_generation_user_error' },
    ]);

    act(() => result.current.loadVisualValuesFromYaml(saved));
    act(() => result.current.setVisualValues({ fixedErrorCooldowns: [], nonRetryableErrors: [] }));
    const cleared = parse(result.current.applyVisualChangesToYaml(saved));
    expect(cleared).not.toHaveProperty('fixed-error-cooldowns');
    expect(cleared['non-retryable-errors']).toEqual([]);
  });
});
