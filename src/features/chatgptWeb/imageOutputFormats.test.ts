import { describe, expect, it } from 'vitest';
import {
  effectiveImageAliases,
  readModelOutputFormats,
  DEFAULT_WEB_IMAGE_ALIASES,
} from './imageOutputFormats';
describe('Web alias format configuration', () => {
  it('normalizes formats and aliases and resolves legacy/default lists', () => {
    expect(readModelOutputFormats({ ' ALIAS ': ['JPG', 'gif', 'JPEG'] }, ['alias'])).toEqual({
      alias: ['jpeg', 'gif'],
    });
    expect(effectiveImageAliases([], '')).toEqual(DEFAULT_WEB_IMAGE_ALIASES);
    expect(effectiveImageAliases([], 'custom')).toEqual(['custom']);
    expect(effectiveImageAliases([' X ', 'x', 'y'], 'custom')).toEqual(['X', 'y']);
  });
  it.each([
    { a: [] },
    { a: ['svg'] },
    { missing: ['png'] },
    { a: ['png'], ' A ': ['gif'] },
    { a: 'gif' },
    { a: [true] },
  ])('rejects invalid %j', (raw) => {
    expect(() => readModelOutputFormats(raw, ['a'])).toThrow('image_output_formats');
  });
  it('allows arbitrary alias names without prototype keys changing behavior', () => {
    expect(
      Object.keys(readModelOutputFormats(JSON.parse('{"__proto__":["png"],"constructor":["gif"]}')))
    ).toEqual(['__proto__', 'constructor']);
  });
});
