import { describe, expect, test } from 'vitest';
import { REQUEST_SCOPED_ERROR_ACTIONS } from '@/types/requestScopedErrors';
import {
  normalizeOAuthRequestScopedErrors,
  normalizeRequestScopedErrors,
  serializeOAuthRequestScopedErrors,
  serializeRequestScopedErrors,
  validateRequestScopedErrorRule,
} from '@/utils/requestScopedErrors';

describe('request-scoped error rule contract', () => {
  test('keeps rule order, significant whitespace, Go regex syntax and unknown fields', () => {
    const wire = REQUEST_SCOPED_ERROR_ACTIONS.map((action, index) => ({
      status: 400 + index,
      match: [' Case sensitive ', '', '  '],
      'match-regexr': ['(?i)temporary', '\\p{Han}+'],
      action,
      future: { mode: 'keep' },
    }));
    const parsed = normalizeRequestScopedErrors(wire)!;
    expect(serializeRequestScopedErrors(parsed)).toEqual(wire);
    parsed[0].match![0] = 'edited';
    parsed[0].matchRegexr![0] = 'edited';
    expect(wire[0].match[0]).toBe(' Case sensitive ');
    expect(wire[0]['match-regexr'][0]).toBe('(?i)temporary');
  });

  test('defaults, nulls and entirely empty entries remain inactive', () => {
    expect(normalizeRequestScopedErrors(undefined)).toBeUndefined();
    expect(normalizeRequestScopedErrors(null)).toBeUndefined();
    expect(serializeRequestScopedErrors([])).toEqual([]);
    expect(normalizeRequestScopedErrors([null, { match: [null] }])).toEqual([{}, { match: [''] }]);
    for (const rule of [{}, { status: 0, action: ' ', match: [''], matchRegexr: [] }])
      expect(validateRequestScopedErrorRule(rule)).toBeUndefined();
    expect(normalizeRequestScopedErrors([{ 'match-regexr': null, matchRegexr: ['old'] }])).toEqual([{}]);
  });

  test.each([
    { status: 99, action: 'stop', match: ['x'] },
    { status: 600, action: 'stop', match: ['x'] },
    { status: 500, action: 'unknown', match: ['x'] },
    { status: 500, action: 'stop', match: [''] },
    { status: 500 },
    { matchRegexr: ['x'] },
  ])('rejects an incomplete or invalid active rule before save: %j', (rule) => {
    expect(() => serializeRequestScopedErrors([rule])).toThrow(/invalid/);
  });

  test('structural errors cannot silently disappear from an existing list', () => {
    for (const value of [{}, false, 'x', [false], [{ status: '500' }], [{ status: 1.5 }],
      [{ status: Infinity }], [{ action: 5 }], [{ match: 'private-pattern' }],
      [{ match: [true] }], [{ 'match-regexr': [5] }]]) {
      expect(() => normalizeRequestScopedErrors(value)).toThrow();
    }
    try {
      normalizeRequestScopedErrors([{ match: 'private-pattern' }]);
    } catch (error) {
      expect(String(error)).not.toContain('private-pattern');
    }
    expect(() => serializeRequestScopedErrors([{ status: 500, action: ' STOP ', match: [' '] }])).not.toThrow();
  });

  test('provider map preserves spelling and unknown providers, rejects canonical duplicates', () => {
    const rules = { ' Codex ': [{ status: 500, matchRegexr: ['(?i)retry'], action: 'stop' }], future: [] };
    expect(normalizeOAuthRequestScopedErrors(rules)).toEqual(rules);
    expect(serializeOAuthRequestScopedErrors(rules)).toEqual({
      ' Codex ': [{ status: 500, 'match-regexr': ['(?i)retry'], action: 'stop' }], future: [],
    });
    expect(normalizeOAuthRequestScopedErrors({ codex: null })).toEqual({ codex: [] });
    expect(serializeOAuthRequestScopedErrors({})).toEqual({});
    for (const value of [[], { ' ': [] }, { Codex: [], codex: [] }, { codex: {} }])
      expect(() => normalizeOAuthRequestScopedErrors(value)).toThrow();
    const special = JSON.parse('{"__proto__":[],"constructor":[]}');
    expect(Object.keys(normalizeOAuthRequestScopedErrors(special)!)).toEqual(['__proto__', 'constructor']);
    expect({}).not.toHaveProperty('polluted');
  });
});
