import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';
import { useVisualConfig } from '@/hooks/useVisualConfig';

const original = `# keep root comment
future-root: keep
codex-api-key:
  - api-key: test-untouched
    future-credential: keep
    request-scoped-errors: [{status: 400, match: ["key-rule"], action: stop}]
oauth-request-scoped-errors:
  Codex:
    - status: 500
      match: [" exact "]
      match-regexr: ["(?i)busy"]
      action: stop
      future-rule: {keep: yes}
  future-provider: []
`;

describe('OAuth error rule YAML editing', () => {
  test('saves an edited rule without losing credential rules, unknown fields or significant spaces', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualParseError).toBeNull();
    expect(result.current.visualDirty).toBe(false);
    const baseline = result.current.visualValues.oauthRequestScopedErrors;
    const edited = { ...baseline, Codex: [{ ...baseline.Codex[0], action: 'continue-and-cooldown' }] };
    act(() => result.current.setVisualValues({ oauthRequestScopedErrors: edited }));
    expect(result.current.visualDirtyFields).toContain('oauthRequestScopedErrors');
    const saved = result.current.applyVisualChangesToYaml(original);
    const parsed = parse(saved);
    expect(parsed['oauth-request-scoped-errors'].Codex[0]).toEqual({
      ...parse(original)['oauth-request-scoped-errors'].Codex[0], action: 'continue-and-cooldown',
    });
    expect(parsed['oauth-request-scoped-errors']['future-provider']).toEqual([]);
    expect(parsed['codex-api-key']).toEqual(parse(original)['codex-api-key']);
    expect(parsed['future-root']).toBe('keep');
    expect(saved).toContain('# keep root comment');
    act(() => result.current.setVisualValues({ oauthRequestScopedErrors: baseline }));
    expect(result.current.visualDirty).toBe(false);
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualValues.oauthRequestScopedErrors).toEqual(edited);
    expect(result.current.visualDirty).toBe(false);
  });

  test('unrelated edits retain the original rule nodes and comments', () => {
    const yaml = original.replace('  Codex:', '  # keep provider comment\n  Codex:');
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    act(() => result.current.setVisualValues({ requestRetry: '3' }));
    const saved = result.current.applyVisualChangesToYaml(yaml);
    expect(saved).toContain('# keep provider comment');
    expect(parse(saved)['oauth-request-scoped-errors']).toEqual(parse(yaml)['oauth-request-scoped-errors']);
  });

  test('reads merged rule fields without interpreting unrelated business mappings', () => {
    const yaml = 'future-business: {"<<": opaque}\ndefaults: &rule {status: 500, action: stop}\noauth-request-scoped-errors:\n  codex: [{<<: *rule, match: [busy]}]\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    expect(result.current.visualParseError).toBeNull();
    expect(result.current.visualValues.oauthRequestScopedErrors).toEqual({ codex: [{ status: 500, action: 'stop', match: ['busy'] }] });
  });

  test.each([
    'oauth-request-scoped-errors: &rules {codex: [{status: 500, match: [busy], action: stop}]}\nfuture-copy: *rules\n',
    'defaults: &defaults\n  oauth-request-scoped-errors: {codex: [{status: 500, match: [busy], action: stop}]}\n<<: *defaults\n',
    'oauthRequestScopedErrors: {codex: [{status: 500, match: [busy], action: stop}]}\n',
    'oauth-request-scoped-errors:\n  codex: [&rule {status: 500, match: &patterns [busy], action: stop}]\nfuture-copy: *rule\nfuture-patterns: *patterns\n',
  ])('clears active rules including aliases and inherited maps', (yaml) => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    expect(result.current.visualValues.oauthRequestScopedErrors.codex).toHaveLength(1);
    act(() => result.current.setVisualValues({ oauthRequestScopedErrors: {} }));
    const saved = result.current.applyVisualChangesToYaml(yaml);
    expect(parse(saved, { merge: true })['oauth-request-scoped-errors']).toEqual({});
    expect(parse(saved)).not.toHaveProperty('oauthRequestScopedErrors');
    for (const key of ['future-copy', 'future-patterns']) {
      if (Object.prototype.hasOwnProperty.call(parse(yaml), key))
        expect(parse(saved)[key]).toEqual(parse(yaml)[key]);
    }
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualParseError).toBeNull();
    expect(result.current.visualValues.oauthRequestScopedErrors).toEqual({});
  });

  test('default absence stays absent; explicit canonical null shadows aliases', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('request-retry: 1\n'));
    expect(result.current.visualValues.oauthRequestScopedErrors).toEqual({});
    act(() => result.current.setVisualValues({ requestRetry: '2' }));
    expect(parse(result.current.applyVisualChangesToYaml('request-retry: 1\n'))).not.toHaveProperty('oauth-request-scoped-errors');
    act(() => result.current.loadVisualValuesFromYaml('oauth-request-scoped-errors: null\noauthRequestScopedErrors: {codex: [{status: 500, match: [busy], action: stop}]}\n'));
    expect(result.current.visualValues.oauthRequestScopedErrors).toEqual({});
  });

  test.each([
    '[]', '{codex: {}}', '{codex: [{status: "500"}]}', '{codex: [{status: 1.5}]}',
    '{codex: [{status: 9999999999999999999}]}', '{codex: [{match: [true]}]}', '{Codex: [], codex: []}',
  ])('rejects invalid source structure %s', (value) => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('oauth-request-scoped-errors: ' + value));
    expect(result.current.visualParseError).toBeTruthy();
  });

  test('invalid active rules retain dirty state and prevent serialization', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    for (const rule of [
      { status: 600, action: 'stop', match: ['x'] },
      { status: 500, action: 'invalid', match: ['x'] },
      { status: 500, action: 'stop', match: [] },
    ]) {
      act(() => result.current.setVisualValues({ oauthRequestScopedErrors: { codex: [rule] } }));
      expect(result.current.visualDirty).toBe(true);
      expect(Object.keys(result.current.visualValidationErrors).some((key) => key.startsWith('oauthRequestScopedErrors.'))).toBe(true);
      expect(result.current.applyVisualChangesToYaml(original)).toBe(original);
    }
  });
});
