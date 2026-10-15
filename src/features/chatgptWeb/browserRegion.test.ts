import { describe, expect, it } from 'vitest';
import { browserRegionDefaults, parseBrowserRegionDraft, regionToDraft } from './browserRegion';
import en from '@/i18n/locales/en.json';
import zh from '@/i18n/locales/zh-CN.json';
import tw from '@/i18n/locales/zh-TW.json';
import ru from '@/i18n/locales/ru.json';

describe('ChatGPT Web browser region configuration', () => {
  it('preserves defaults and independent toggles', () => {
    expect(parseBrowserRegionDraft(regionToDraft(browserRegionDefaults))).toEqual(
      browserRegionDefaults
    );
    expect(
      parseBrowserRegionDraft({ ...regionToDraft(browserRegionDefaults), 'auto-timezone': true })?.[
        'auto-language'
      ]
    ).toBe(false);
  });
  it('validates URLs, integer values, locale, timezone and nullable offset', () => {
    for (const patch of [
      { 'lookup-url': 'http://example.test/' },
      { 'lookup-url': 'https://{ip}/' },
      { 'lookup-url': 'https://user:secret@example.test/' },
      { 'lookup-url': 'https://example.test/{other}' },
      { 'cache-ttl-seconds': '0' },
      { 'route-cache-size': '1.5' },
      { timezone: 'Invalid/Zone' },
      { language: 'not a tag' },
      { 'timezone-offset-minutes': '841' },
    ]) {
      expect(
        parseBrowserRegionDraft({ ...regionToDraft(browserRegionDefaults), ...patch })
      ).toBeNull();
    }
    expect(
      parseBrowserRegionDraft({
        ...regionToDraft(browserRegionDefaults),
        'lookup-url': 'https://ipwho.is/',
        'ip-cache-size': '100000',
        'timezone-offset-minutes': '',
      })?.['ip-cache-size']
    ).toBe(100000);
  });
  it('has matching translations for every setting and safe diagnostic reason', () => {
    const keys = Object.keys(en.chatgpt_web.browser_region).sort();
    for (const locale of [zh, tw, ru]) {
      expect(Object.keys(locale.chatgpt_web.browser_region).sort()).toEqual(keys);
      expect(Object.keys(locale.chatgpt_web.browser_region.values).sort()).toEqual(
        Object.keys(en.chatgpt_web.browser_region.values).sort()
      );
    }
  });
});
