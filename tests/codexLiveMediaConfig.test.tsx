import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { DEFAULT_CODEX_LIVE_MEDIA } from '@/types/codexLiveMedia';
import { codexLiveMediaErrors, readCodexLiveMediaYaml, validCodexMediaICEURL } from '@/utils/codexLiveMedia';
import { CONFIG_PAGE_DEFINITIONS, configPageHasDirtyFields } from '@/components/config/configCatalog';

describe('Codex Live media configuration data', () => {
  test('defaults off and keeps old YAML untouched when unrelated fields change', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('{}\n'));
    expect(result.current.visualValues.codexLiveMediaRelay).toEqual(DEFAULT_CODEX_LIVE_MEDIA);
    act(() => result.current.setVisualValues({ debug: true }));
    expect(parse(result.current.applyVisualChangesToYaml('{}\n')).codex?.['live-media-relay']).toBeUndefined();
    act(() => result.current.setVisualValues({ codexLiveMediaRelay: { ...DEFAULT_CODEX_LIVE_MEDIA, enabled: true } }));
    expect(result.current.visualDirtyFields).toContain('codexLiveMediaRelay');
    expect(configPageHasDirtyFields(CONFIG_PAGE_DEFINITIONS.find((page) => page.id === 'provider-codex')!, result.current.visualDirtyFields)).toBe(true);
    const saved = result.current.applyVisualChangesToYaml('{}\n');
    expect(parse(saved).codex['live-media-relay'].enabled).toBe(true);
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualDirty).toBe(false);
    expect(result.current.visualValues.codexLiveMediaRelay.enabled).toBe(true);
  });

  test.each(['merge', 'alias', 'root'])('preserves secrets, aliases, unknown integers and ICE row identity: %s', (shape) => {
    const media = '{enabled: true, max-sessions: 32, future: 9007199254740993123, ice-servers: [{urls: ["turn:fixture.invalid"], username: " user ", credential: " secret ", row-future: retained}, {urls: ["stun:other.invalid"], row-future: second}]}';
    let original = `defaults: &media ${media}\ncodex: {live-media-relay: {<<: *media}}\n`;
    if (shape === 'alias') original = `defaults: &media ${media}\ncodex: {live-media-relay: *media}\n`;
    if (shape === 'root') original = `defaults: &root {codex: {live-media-relay: ${media}}}\n<<: *root\n`;
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualParseError).toBeNull();
    const current = result.current.visualValues.codexLiveMediaRelay;
    expect(current.iceServers[0].credential).toBe(' secret ');
    const next = { ...current, enabled: false, maxSessions: '0', iceServers: [current.iceServers[1], current.iceServers[0]] };
    act(() => result.current.setVisualValues({ codexLiveMediaRelay: next }));
    const saved = result.current.applyVisualChangesToYaml(original);
    const object = parse(saved, { intAsBigInt: true, merge: true });
    const relay = object.codex['live-media-relay'];
    expect(relay).toMatchObject({ enabled: false, 'max-sessions': 0n, future: 9007199254740993123n });
    expect(relay['ice-servers'][0]['row-future']).toBe('second');
    expect(relay['ice-servers'][1]).toMatchObject({ username: ' user ', credential: ' secret ', 'row-future': 'retained' });
    expect(shape === 'root' ? object.defaults.codex['live-media-relay'].enabled : object.defaults.enabled).toBe(true);
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualValues.codexLiveMediaRelay.iceServers[1].credential).toBe(' secret ');
    expect(result.current.visualDirty).toBe(false);
    act(() => result.current.setVisualValues({ codexLiveMediaRelay: { ...result.current.visualValues.codexLiveMediaRelay, iceServers: [] } }));
    const removed = parse(result.current.applyVisualChangesToYaml(saved));
    expect(removed.codex['live-media-relay']['ice-servers']).toEqual([]);
  });

  test('normalizes canonical and camel case API fields without requiring hidden secrets', () => {
    const config = normalizeConfigResponse({ codex: { 'live-media-relay': { enabled: false, maxSessions: 4, udpPortMin: 50000, udpPortMax: 50007, iceServers: [{ urls: ['turn:fixture.invalid'] }] } } });
    expect(config.codex?.liveMediaRelay).toMatchObject({ enabled: false, maxSessions: 4, udpPortMax: 50007 });
    expect(normalizeConfigResponse({ codex: { 'live-media-relay': null, liveMediaRelay: { enabled: true } } }).codex?.liveMediaRelay?.enabled).toBe(false);
    expect(readCodexLiveMediaYaml('codex: {liveMediaRelay: {enabled: true, maxSessions: 4}}\n').maxSessions).toBe('4');
    expect(() => normalizeConfigResponse({ codex: { 'live-media-relay': { 'max-sessions': '4' } } })).toThrow('max-sessions');
    expect(() => normalizeConfigResponse({ codex: { 'live-media-relay': { enabled: 'false' } } })).toThrow('enabled');
  });

  test.each(['enabled: "false"', 'enabled: yes', 'max-sessions: 1.0', 'max-sessions: 2147483648', 'max-sessions: 9007199254740993123', 'max-sessions: "32"', 'udp-port-max: 65536', 'public-ip: 32', 'ice-servers: [{urls: [42]}]', 'ice-servers: [{urls: ["stun:fixture.invalid"], credential: false}]'])(
    'rejects invalid YAML before coercion: %s', (field) => {
      const { result } = renderHook(() => useVisualConfig());
      act(() => result.current.loadVisualValuesFromYaml(`codex: {live-media-relay: {${field}}}\n`));
      expect(result.current.visualParseError).toContain('codex.live-media-relay');
    }
  );

  test('validates all edited values and preserves dirty state when serialization fails', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('{}\n'));
    const invalid = { ...DEFAULT_CODEX_LIVE_MEDIA, maxSessions: '2147483648', udpPortMin: '1', udpPortMax: '2', publicIp: 'wrong', iceServers: [{ id: 'new', urls: 'turn:fixture.invalid', username: '', credential: '' }] };
    act(() => result.current.setVisualValues({ codexLiveMediaRelay: invalid }));
    expect(result.current.visualValidationErrors['codexLiveMediaRelay.maxSessions']).toBe('codex_media_capacity');
    expect(Object.keys(codexLiveMediaErrors(invalid))).toHaveLength(5);
    expect(result.current.applyVisualChangesToYaml('{}\n')).toBe('{}\n');
    expect(result.current.visualDirty).toBe(true);
    expect(codexLiveMediaErrors({ ...DEFAULT_CODEX_LIVE_MEDIA, udpPortMin: '50000', udpPortMax: '50063' })).toEqual({});
  });

  test('checks STUN/TURN syntax without making network requests', () => {
    for (const url of ['stun:fixture.invalid', 'stuns:fixture.invalid:5349', 'stun:[2001:db8::1]', 'turn:fixture.invalid?transport=tcp']) expect(validCodexMediaICEURL(url)).toBe(true);
    for (const url of ['https://fixture.invalid', 'stun:', 'stun://fixture.invalid', 'stun:fixture.invalid:0', 'stun:fixture.invalid:65536', 'stun:fixture.invalid?transport=tcp', 'turn:fixture.invalid?transport=quic', 'turn:fixture.invalid?transport=tcp&transport=udp', 'stun:fixture.invalid#secret', 'stun:user@fixture.invalid']) expect(validCodexMediaICEURL(url)).toBe(false);
  });
});
