import { describe, it, expect } from 'vitest';
import { parseDocument } from 'yaml';
import { readCodexState, writeCodexState, codexStateError } from './codexStateOverride';

describe('managed Codex state configuration', () => {
  it('defaults to memory-only optional acquisition and a hard failure limit', () => {
    const value = readCodexState(undefined);
    expect(value.enabled).toBe(false);
    expect(value['max-attempts']).toBe('3');
    expect(value['missing-policy']).toBe('continue');
    expect(value.models).toBe('');
    expect(value.lengths).toBe('292');
    expect(codexStateError(value)).toBe(false);
  });
  it('preserves extension fields and all-model empty selection on YAML write', () => {
    const doc = parseDocument('codex:\n  state-override:\n    extension: keep\n    lengths: []\n');
    const value = readCodexState(doc.toJS().codex['state-override']);
    value.enabled = true;
    writeCodexState(doc, value);
    const stored = doc.toJS().codex['state-override'];
    expect(stored.models).toEqual([]);
    expect(stored.lengths).toEqual([]);
    expect(stored.extension).toBe('keep');
    expect(readCodexState(stored)).toEqual(value);
  });
  it('rejects invalid lifetime and placeholders without including proxy secrets in errors', () => {
    const value = readCodexState(undefined);
    value['ttl-minutes'] = '5';
    expect(codexStateError(value)).toBe(true);
    value['ttl-minutes'] = '60';
    value['proxy-mode'] = 'custom';
    value['proxy-url'] = 'http://user-{0}:secret@proxy:80';
    expect(codexStateError(value)).toBe(true);
    value['proxy-url'] = 'http://user-{12}:secret@proxy:80';
    expect(codexStateError(value)).toBe(false);
    value['max-attempts'] = '0';
    expect(codexStateError(value)).toBe(true);
  });
  it('supports different per-model validation without extending model scope', () => {
    const value = readCodexState(undefined);
    value.models = 'gpt-5.5';
    value['model-overrides'] = '[{"model":"gpt-5.5","lengths":[],"match-model":false}]';
    expect(codexStateError(value)).toBe(false);
    const doc = parseDocument('{}');
    writeCodexState(doc, value);
    expect(doc.toJS().codex['state-override']['model-overrides'][0].lengths).toEqual([]);
    value['model-overrides'] = '[{"model":"x"},{"model":"x"}]';
    expect(codexStateError(value)).toBe(true);
  });
});
