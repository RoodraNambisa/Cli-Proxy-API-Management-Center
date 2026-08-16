import { describe, expect, it } from 'vitest';
import { buildAuthFileFieldsPatch } from './useAuthFilesPrefixProxyEditor';

describe('buildAuthFileFieldsPatch ChatGPT Web login settings', () => {
  it('preserves the API798 URL exactly when selecting API798', () => {
    const api798Url =
      'https://api798.com/get_code?email=person%40example.com&auth_code=opaque%252Bvalue';

    expect(
      buildAuthFileFieldsPatch(
        { login_method: 'auto' },
        { login_method: 'api798', api798_url: api798Url },
        false,
        true
      )
    ).toEqual({ login_method: 'api798', api798_url: api798Url });
  });

  it('sends an empty API798 URL to remove a previously saved value', () => {
    expect(
      buildAuthFileFieldsPatch(
        { login_method: 'api798', api798_url: 'https://api798.com/get_code?secret' },
        { login_method: 'auto' },
        false,
        true
      )
    ).toEqual({ login_method: 'auto', api798_url: '' });
  });

  it('does not expose ChatGPT Web fields on other providers', () => {
    expect(
      buildAuthFileFieldsPatch(
        {},
        { login_method: 'api798', api798_url: 'https://api798.com/get_code?secret' },
        false,
        false
      )
    ).toEqual({});
  });
});

describe('buildAuthFileFieldsPatch Codex fingerprint settings', () => {
  it('writes the selected mode for Codex auth files', () => {
    expect(buildAuthFileFieldsPatch({}, { codex_fingerprint_mode: 'full' }, true, false)).toEqual({
      codex_fingerprint_mode: 'full',
    });
  });

  it('does not expose the Codex-only field on other providers', () => {
    expect(
      buildAuthFileFieldsPatch({}, { codex_fingerprint_mode: 'session' }, false, false)
    ).toEqual({});
  });
});
