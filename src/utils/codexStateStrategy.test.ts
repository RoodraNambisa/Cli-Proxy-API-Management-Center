import { describe, it, expect } from 'vitest';
import { parseDocument, parse } from 'yaml';
import { mergeStateSettings, stateNeedsTurnState } from './codexStateStrategy';
import {
  readCodexState,
  serializeCodexState,
  writeCodexState,
  codexStateError,
} from './codexStateOverride';
import { inheritedStateSettings } from './codexStateModelRules';

describe('State and Cookie strategy configuration', () => {
  it('normalizes units per layer, preserving explicit zero', () => {
    const a = mergeStateSettings(
      { 'ttl-seconds': 120, 'refresh-before-seconds': 15 },
      { 'ttl-minutes': 2, 'refresh-before-minutes': 1 }
    );
    expect(a).toEqual({ 'ttl-minutes': 2, 'refresh-before-minutes': 1 });
    const b = mergeStateSettings(a, {
      'ttl-minutes': 4,
      'ttl-seconds': 90,
      'refresh-before-seconds': 0,
    });
    expect(b['ttl-seconds']).toBe(90);
    expect(b['refresh-before-seconds']).toBe(0);
  });
  it('round-trips empty checks, false flags and unknown fields without losing zero', () => {
    const source = `codex:
  state-override:
    enabled: true
    strategy: cookie-only
    extension: retained
    ttl-seconds: 180
    refresh-before-seconds: 0
    cookie-verify-after-acquire: true
    rules:
      - id: one
        models: [model]
        settings:
          lengths: []
          cookie-verify-after-acquire: false
          cookie-max-age-seconds: 0
          extension: keep
`;
    const doc = parseDocument(source),
      value = readCodexState(parse(source).codex['state-override']);
    expect(codexStateError(value)).toBe(false);
    writeCodexState(doc, value);
    const saved = doc.toJS().codex['state-override'];
    expect(saved.extension).toBe('retained');
    expect(saved['refresh-before-seconds']).toBe(0);
    expect(saved.rules[0].settings).toEqual({
      lengths: [],
      'cookie-verify-after-acquire': false,
      'cookie-max-age-seconds': 0,
      extension: 'keep',
    });
    value['ttl-seconds'] = '';
    writeCodexState(doc, value);
    expect(doc.toJS().codex['state-override']['ttl-seconds']).toBeUndefined();
  });
  it('inherits legacy model strategy into rule overrides', () => {
    const value = readCodexState({
      strategy: 'cookie-only',
      'cookie-max-age-seconds': 120,
      'model-overrides': [
        { model: 'model', strategy: 'state', 'refresh-before-seconds': 0, 'ttl-seconds': 60 },
      ],
    });
    const inherited = inheritedStateSettings(value, { 'ttl-minutes': 2 }, 'model');
    expect(inherited.strategy).toBe('state');
    expect(inherited['ttl-seconds']).toBeUndefined();
    expect(inherited['ttl-minutes']).toBe(2);
    expect(stateNeedsTurnState(value)).toBe(true);
    expect(codexStateError(value)).toBe(false);
    expect(serializeCodexState(value)['strategy']).toBe('cookie-only');
  });
  it('preserves standby targets and explicit zero overrides', () => {
    const value = readCodexState({
      strategy: 'cookie-only',
      'cookie-backup-count': 2,
      rules: [{ id: 'rule', settings: { 'cookie-backup-count': 0 } }],
    });
    expect(codexStateError(value)).toBe(false);
    const data = serializeCodexState(value);
    expect(data['cookie-backup-count']).toBe(2);
    expect(
      (data.rules as Array<{ settings: Record<string, unknown> }>)[0].settings[
        'cookie-backup-count'
      ]
    ).toBe(0);
    for (const n of [-1, 11, 1.5]) {
      expect(codexStateError(readCodexState({ 'cookie-backup-count': n }))).toBe(true);
      expect(
        codexStateError(
          readCodexState({ rules: [{ id: 'rule', settings: { 'cookie-backup-count': n } }] })
        )
      ).toBe(true);
    }
  });
  it('rejects invalid legacy and rule strategy overrides', () => {
    for (const settings of [
      { strategy: '' },
      { 'ttl-seconds': 0 },
      { 'cookie-max-age-seconds': -1 },
      { 'cookie-verify-after-acquire': 'false' },
    ]) {
      expect(
        codexStateError(readCodexState({ 'model-overrides': [{ model: 'model', ...settings }] }))
      ).toBe(true);
      expect(codexStateError(readCodexState({ rules: [{ id: 'one', settings }] }))).toBe(true);
    }
  });
});
