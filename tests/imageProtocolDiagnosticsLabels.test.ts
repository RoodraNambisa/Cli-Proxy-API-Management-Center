import { expect, test } from 'vitest';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

test.each([en, ru, zhCN, zhTW])(
  'translates requirements phases and task page diagnostics',
  (locale) => {
    const runtime = locale.system_info.image_runtime;
    for (const key of [
      'web_requirements_bootstrap',
      'web_requirements_local_prepare',
      'web_requirements_prepare',
      'web_requirements_parse',
      'web_requirements_observer_init',
      'web_requirements_proof',
      'web_requirements_turnstile',
      'web_requirements_finalize',
      'web_requirements_observer_snapshot',
      'web_requirements_observer_cleanup',
    ] as const) {
      expect(runtime.phase_names[key].trim()).not.toBe('');
    }
    expect(Object.keys(runtime.task_diagnostics)).toEqual(
      Object.keys(en.system_info.image_runtime.task_diagnostics)
    );
    for (const value of Object.values(runtime.task_diagnostics)) {
      expect(value.trim()).not.toBe('');
    }
    expect(runtime.task_diagnostics_note.trim()).not.toBe('');
  }
);
