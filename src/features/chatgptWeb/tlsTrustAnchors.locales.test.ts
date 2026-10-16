import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import { CONFIG_SEARCH_DEFINITIONS } from '@/components/config/configCatalog';

describe('ChatGPT Web TLS localized configuration', () => {
  it.each([en, ru, zhCN, zhTW])(
    'resolves every state in the runtime translation namespace',
    (locale) => {
      const messages = locale.chatgpt_web.tls_trust_anchors;
      for (const key of [
        'title',
        'enabled_description',
        'disabled_description',
        'loading',
        'unsupported',
        'error',
        'connection_changed',
      ] as const) {
        expect(messages[key].trim().length).toBeGreaterThan(0);
      }
    }
  );
  it('indexes the toggle in its ChatGPT Web page', () => {
    expect(
      CONFIG_SEARCH_DEFINITIONS.find((entry) => entry.id === 'config-chatgpt-web-tls-trust-anchors')
    ).toMatchObject({
      pageId: 'provider-chatgpt-web',
      labelKey: 'chatgpt_web.tls_trust_anchors.title',
      yamlKeys: ['chatgpt-web.tls-trust-anchors-enabled'],
    });
  });
});
