import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en.json';
import cn from '@/i18n/locales/zh-CN.json';
import tw from '@/i18n/locales/zh-TW.json';
import ru from '@/i18n/locales/ru.json';
describe('alias output formats translations', () => {
  it.each([cn, tw, ru])('has the same translated fields', (locale) => {
    expect(Object.keys(locale.chatgpt_web.image_formats)).toEqual(
      Object.keys(en.chatgpt_web.image_formats)
    );
    for (const value of Object.values(locale.chatgpt_web.image_formats))
      expect(value.trim()).not.toBe('');
    expect(locale.config_management.visual.validation.image_output_formats).toBeTruthy();
  });
});
