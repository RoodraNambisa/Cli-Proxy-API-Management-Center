import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parse } from 'yaml';
import { describe, expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import {
  CONFIG_PAGE_DEFINITIONS,
  CONFIG_SEARCH_DEFINITIONS,
} from '@/components/config/configCatalog';
import { getVisualConfigValidationErrors, useVisualConfig } from '@/hooks/useVisualConfig';
import enLocale from '@/i18n/locales/en.json';
import ruLocale from '@/i18n/locales/ru.json';
import zhCNLocale from '@/i18n/locales/zh-CN.json';
import zhTWLocale from '@/i18n/locales/zh-TW.json';
import { DEFAULT_VISUAL_VALUES, type VisualConfigValues } from '@/types/visualConfig';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

const cloneValues = (): VisualConfigValues =>
  JSON.parse(JSON.stringify(DEFAULT_VISUAL_VALUES)) as VisualConfigValues;

describe('ChatGPT Web image concurrency and capacity config', () => {
  test('reads camel aliases and writes canonical kebab-case values', () => {
    const initialYaml = `images:
  chatgpt-web:
    maxInFlight: 70
    admissionQueueSize: 71
    admissionWaitMilliseconds: 1200
    maxFinalizers: 9
    completionReserveMegabytes: 2
    memoryCapacityMegabytes: 768
    pollConcurrency: 96
    memoryFinalizerConcurrency: 4
`;
    const { result } = renderHook(() => useVisualConfig());

    act(() => result.current.loadVisualValuesFromYaml(initialYaml));
    expect(result.current.visualValues).toMatchObject({
      chatgptWebImageMaxInFlight: '70',
      chatgptWebImageAdmissionQueueSize: '71',
      chatgptWebImageAdmissionWaitMilliseconds: '1200',
      chatgptWebImageMaxFinalizers: '9',
      chatgptWebImageCompletionReserveMegabytes: '2',
      chatgptWebImageMemoryCapacityMegabytes: '768',
      chatgptWebImagePollConcurrency: '96',
      chatgptWebImageMemoryFinalizerConcurrency: '4',
    });

    act(() =>
      result.current.setVisualValues({
        chatgptWebImageMaxInFlight: '96',
        chatgptWebImageAdmissionQueueSize: '128',
        chatgptWebImageAdmissionWaitMilliseconds: '2500',
        chatgptWebImageMaxFinalizers: '12',
        chatgptWebImageCompletionReserveMegabytes: '4',
        chatgptWebImageMemoryCapacityMegabytes: '1024',
        chatgptWebImagePollConcurrency: '128',
        chatgptWebImageMemoryFinalizerConcurrency: '6',
      })
    );
    expect(result.current.visualDirtyFields).toEqual(
      expect.arrayContaining([
        'chatgptWebImageMaxInFlight',
        'chatgptWebImageAdmissionQueueSize',
        'chatgptWebImageAdmissionWaitMilliseconds',
        'chatgptWebImageMaxFinalizers',
        'chatgptWebImageCompletionReserveMegabytes',
        'chatgptWebImageMemoryCapacityMegabytes',
        'chatgptWebImagePollConcurrency',
        'chatgptWebImageMemoryFinalizerConcurrency',
      ])
    );

    const saved = parse(result.current.applyVisualChangesToYaml(initialYaml));
    expect(saved.images['chatgpt-web']).toMatchObject({
      'max-in-flight': 96,
      'admission-queue-size': 128,
      'admission-wait-milliseconds': 2500,
      'max-finalizers': 12,
      'completion-reserve-megabytes': 4,
      'memory-capacity-megabytes': 1024,
      'poll-concurrency': 128,
      'memory-finalizer-concurrency': 6,
    });
    const savedKeys = Object.keys(saved.images['chatgpt-web']);
    for (const legacyKey of [
      'maxInFlight',
      'admissionQueueSize',
      'admissionWaitMilliseconds',
      'maxFinalizers',
      'completionReserveMegabytes',
      'memoryCapacityMegabytes',
      'pollConcurrency',
      'memoryFinalizerConcurrency',
    ]) {
      expect(savedKeys).not.toContain(legacyKey);
    }
  });

  test('uses backend-identical defaults and validation bounds', () => {
    expect(DEFAULT_VISUAL_VALUES).toMatchObject({
      chatgptWebImageMaxInFlight: '64',
      chatgptWebImageAdmissionQueueSize: '64',
      chatgptWebImageAdmissionWaitMilliseconds: '1000',
      chatgptWebImageMaxFinalizers: '8',
      chatgptWebImageCompletionReserveMegabytes: '1',
      chatgptWebImageMemoryCapacityMegabytes: '512',
      chatgptWebImagePollConcurrency: '64',
      chatgptWebImageMemoryFinalizerConcurrency: '1',
    });
    const values = cloneValues();
    Object.assign(values, {
      chatgptWebImageMaxInFlight: '4097',
      chatgptWebImageAdmissionQueueSize: '4097',
      chatgptWebImageAdmissionWaitMilliseconds: '30001',
      chatgptWebImageMaxFinalizers: '65',
      chatgptWebImageCompletionReserveMegabytes: '33',
      chatgptWebImageMemoryCapacityMegabytes: '63',
      chatgptWebImagePollConcurrency: '513',
      chatgptWebImageMemoryFinalizerConcurrency: '65',
    });
    expect(getVisualConfigValidationErrors(values)).toMatchObject({
      chatgptWebImageMaxInFlight: 'integer_range_1_4096',
      chatgptWebImageAdmissionQueueSize: 'integer_range_0_4096',
      chatgptWebImageAdmissionWaitMilliseconds: 'integer_range_0_30000',
      chatgptWebImageMaxFinalizers: 'integer_range_1_64',
      chatgptWebImageCompletionReserveMegabytes: 'integer_range_0_32',
      chatgptWebImageMemoryCapacityMegabytes: 'integer_range_64_8192',
      chatgptWebImagePollConcurrency: 'integer_range_1_512',
      chatgptWebImageMemoryFinalizerConcurrency: 'integer_range_1_64',
    });
  });

  test('accepts a bounded 2000-task lifecycle and queue without changing defaults', () => {
    const values = cloneValues();
    Object.assign(values, {
      chatgptWebImageMaxInFlight: '2000',
      chatgptWebImageAdmissionQueueSize: '2000',
    });
    const errors = getVisualConfigValidationErrors(values);
    expect(errors.chatgptWebImageMaxInFlight).toBeUndefined();
    expect(errors.chatgptWebImageAdmissionQueueSize).toBeUndefined();
    expect(DEFAULT_VISUAL_VALUES.chatgptWebImageMaxInFlight).toBe('64');
    expect(DEFAULT_VISUAL_VALUES.chatgptWebImageAdmissionQueueSize).toBe('64');
  });

  test('reads canonical poll and memory-finalizer keys', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() =>
      result.current.loadVisualValuesFromYaml(`images:
  chatgpt-web:
    poll-concurrency: 72
    memory-finalizer-concurrency: 5
`)
    );
    expect(result.current.visualValues).toMatchObject({
      chatgptWebImagePollConcurrency: '72',
      chatgptWebImageMemoryFinalizerConcurrency: '5',
    });
  });

  test('renders all eight controls behind one progressive disclosure', () => {
    render(
      <MemoryRouter initialEntries={['/config?section=provider-chatgpt-web']}>
        <VisualConfigEditor
          values={cloneValues()}
          baselineValues={cloneValues()}
          onChange={vi.fn()}
          renderRequestBodyPanels={() => null}
        />
      </MemoryRouter>
    );

    const disclosure = screen.getByRole('button', {
      name: /config_management\.settings_center\.chatgpt_web\.image_capacity_title/,
    });
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(disclosure);
    for (const id of [
      'config-chatgpt-web-image-memory-capacity-megabytes',
      'config-chatgpt-web-image-max-in-flight',
      'config-chatgpt-web-image-admission-queue-size',
      'config-chatgpt-web-image-admission-wait-milliseconds',
      'config-chatgpt-web-image-max-finalizers',
      'config-chatgpt-web-image-completion-reserve-megabytes',
      'config-chatgpt-web-image-poll-concurrency',
      'config-chatgpt-web-image-memory-finalizer-concurrency',
    ]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(
      document.getElementById('config-chatgpt-web-image-max-in-flight')?.getAttribute('max')
    ).toBe('4096');
    expect(
      document.getElementById('config-chatgpt-web-image-admission-queue-size')?.getAttribute('max')
    ).toBe('4096');
  });

  test('indexes all eight settings and defines labels in every locale', () => {
    const search = CONFIG_SEARCH_DEFINITIONS.find(
      (entry) => entry.id === 'config-chatgpt-web-image-capacity'
    );
    expect(search?.yamlKeys).toEqual(
      expect.arrayContaining([
        'images.chatgpt-web.max-in-flight',
        'images.chatgpt-web.admission-queue-size',
        'images.chatgpt-web.admission-wait-milliseconds',
        'images.chatgpt-web.max-finalizers',
        'images.chatgpt-web.completion-reserve-megabytes',
        'images.chatgpt-web.memory-capacity-megabytes',
        'images.chatgpt-web.poll-concurrency',
        'images.chatgpt-web.memory-finalizer-concurrency',
      ])
    );
    expect(
      CONFIG_PAGE_DEFINITIONS.find((entry) => entry.id === 'provider-chatgpt-web')?.dirtyPrefixes
    ).toContain('chatgptWebImageMemoryCapacityMegabytes');
    expect(
      CONFIG_PAGE_DEFINITIONS.find((entry) => entry.id === 'provider-chatgpt-web')?.dirtyPrefixes
    ).toContain('chatgptWebImagePollConcurrency');

    for (const locale of [enLocale, ruLocale, zhCNLocale, zhTWLocale]) {
      const labels = locale.config_management.settings_center.chatgpt_web;
      expect(labels.image_capacity_title).toBeTruthy();
      expect(labels.image_max_in_flight).toBeTruthy();
      expect(labels.image_admission_queue_size).toBeTruthy();
      expect(labels.image_admission_wait_milliseconds).toBeTruthy();
      expect(labels.image_max_finalizers).toBeTruthy();
      expect(labels.image_completion_reserve_megabytes).toBeTruthy();
      expect(labels.image_memory_capacity_megabytes).toBeTruthy();
      expect(labels.image_poll_concurrency).toBeTruthy();
      expect(labels.image_memory_finalizer_concurrency).toBeTruthy();
      expect(locale.config_management.visual.validation.integer_range_64_8192).toBeTruthy();
      expect(locale.config_management.visual.validation.integer_range_1_4096).toBeTruthy();
      expect(locale.config_management.visual.validation.integer_range_0_4096).toBeTruthy();
    }
  });
});
