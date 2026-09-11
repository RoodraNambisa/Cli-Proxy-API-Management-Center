import { describe, expect, it } from 'vitest';
import { readCompatibilityDraft, toCompatibilityDraft } from './sentinelCompatibility';
import type { ChatGptWebSentinelCompatibility, SentinelPropertyType } from '@/types';

describe('Sentinel compatibility drafts', () => {
  it('keeps defaults and exact primitive types through JSON and draft reloads', () => {
    expect(readCompatibilityDraft(toCompatibilityDraft())).toEqual({
      enabled: false,
      'observer-state-auto-extend': true,
      'writable-window-properties': [],
      'environment-properties': [],
    });
    const properties = [
      { type: 'string', value: '' },
      { type: 'boolean', value: false },
      { type: 'number', value: 0 },
      { type: 'null', value: null },
      { type: 'undefined' },
    ].map((property, index) => ({
      ...property,
      type: property.type as SentinelPropertyType,
      path: `window.__fixture${index}`,
      enumerable: false,
    }));
    const config: ChatGptWebSentinelCompatibility = {
      enabled: true,
      'observer-state-auto-extend': false,
      'writable-window-properties': ['__fixture_state'],
      'environment-properties': properties,
    };
    const result = readCompatibilityDraft(toCompatibilityDraft(JSON.parse(JSON.stringify(config))));
    expect(result).toEqual(config);
    expect(result?.['environment-properties'][4]).not.toHaveProperty('value');
  });

  it('deduplicates exact writable names and supports clearing both lists', () => {
    const draft = toCompatibilityDraft();
    draft.writable = '__test\n __test \n__Test\n';
    expect(readCompatibilityDraft(draft)?.['writable-window-properties']).toEqual([
      '__test',
      '__Test',
    ]);
    draft.writable = '';
    expect(readCompatibilityDraft(draft)?.['writable-window-properties']).toEqual([]);
  });

  it('rejects invalid types, unsafe values, protected paths and duplicate fields', () => {
    for (const [type, value] of [
      ['number', 'NaN'],
      ['number', '9007199254740992'],
      ['boolean', '0'],
      ['string', 'a'.repeat(2049)],
    ] as const) {
      const draft = toCompatibilityDraft();
      draft.properties = [{ path: 'window.__test', type, value, enumerable: false }];
      expect(readCompatibilityDraft(draft), `${type}: ${value.slice(0, 20)}`).toBeNull();
    }
    for (const path of [
      'window.__proto__',
      'window.a.b',
      'window.fetch()',
      'window.__test\n.bad',
    ]) {
      const draft = toCompatibilityDraft();
      draft.properties = [{ path, type: 'string', value: '', enumerable: false }];
      expect(readCompatibilityDraft(draft)).toBeNull();
    }
    const draft = toCompatibilityDraft();
    draft.properties = [{ path: 'window.__test', type: 'string', value: '', enumerable: false }];
    draft.writable = '__test';
    expect(readCompatibilityDraft(draft)).toBeNull();
    draft.writable = '';
    draft.properties.push({ ...draft.properties[0] });
    expect(readCompatibilityDraft(draft)).toBeNull();
    draft.properties = [];
    draft.writable = Array.from({ length: 65 }, (_, index) => `__test${index}`).join('\n');
    expect(readCompatibilityDraft(draft)).toBeNull();
  });
});
