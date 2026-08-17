import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parse } from 'yaml';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { CONFIG_SEARCH_DEFINITIONS } from '@/components/config/configCatalog';
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

describe('ChatGPT Web background relogin capacity config', () => {
  beforeEach(() => localStorage.clear());

  test('reads camel aliases and writes only canonical bounded capacity keys', () => {
    const initialYaml = `chatgpt-web:
  auto-relogin: true
  autoReloginWorkers: 7
  autoReloginQueueSize: 9000
`;
    const { result } = renderHook(() => useVisualConfig());

    act(() => result.current.loadVisualValuesFromYaml(initialYaml));
    expect(result.current.visualValues).toMatchObject({
      chatgptWebAutoReloginWorkers: '7',
      chatgptWebAutoReloginQueueSize: '9000',
    });

    act(() =>
      result.current.setVisualValues({
        chatgptWebAutoReloginWorkers: '12',
        chatgptWebAutoReloginQueueSize: '12000',
      })
    );
    expect(result.current.visualDirtyFields).toEqual(
      expect.arrayContaining(['chatgptWebAutoReloginWorkers', 'chatgptWebAutoReloginQueueSize'])
    );

    const saved = parse(result.current.applyVisualChangesToYaml(initialYaml));
    expect(saved['chatgpt-web']).toMatchObject({
      'auto-relogin-workers': 12,
      'auto-relogin-queue-size': 12000,
    });
    expect(Object.keys(saved['chatgpt-web'])).not.toContain('autoReloginWorkers');
    expect(Object.keys(saved['chatgpt-web'])).not.toContain('autoReloginQueueSize');
  });

  test('preserves backend defaults and rejects invalid worker or queue values', () => {
    expect(DEFAULT_VISUAL_VALUES.chatgptWebAutoReloginWorkers).toBe('4');
    expect(DEFAULT_VISUAL_VALUES.chatgptWebAutoReloginQueueSize).toBe('4096');

    const values = cloneValues();
    values.chatgptWebAutoReloginWorkers = '0';
    values.chatgptWebAutoReloginQueueSize = String(Number.MAX_SAFE_INTEGER + 1);
    expect(getVisualConfigValidationErrors(values)).toMatchObject({
      chatgptWebAutoReloginWorkers: 'integer_range_1_256',
      chatgptWebAutoReloginQueueSize: 'integer_range_1_1000000',
    });
  });

  test('renders both controls behind progressive disclosure and indexes their YAML keys', () => {
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
      name: /config_management\.settings_center\.chatgpt_web\.auto_relogin_capacity_title/,
    });
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(disclosure);
    expect(document.getElementById('config-chatgpt-web-auto-relogin-workers')).not.toBeNull();
    expect(document.getElementById('config-chatgpt-web-auto-relogin-queue-size')).not.toBeNull();

    const searchEntry = CONFIG_SEARCH_DEFINITIONS.find(
      (entry) => entry.id === 'config-chatgpt-web-auto-relogin-capacity'
    );
    expect(searchEntry?.yamlKeys).toEqual(
      expect.arrayContaining([
        'chatgpt-web.auto-relogin-workers',
        'chatgpt-web.auto-relogin-queue-size',
      ])
    );
  });

  test('defines capacity labels in every supported locale', () => {
    for (const locale of [enLocale, ruLocale, zhCNLocale, zhTWLocale]) {
      const labels = locale.config_management.settings_center.chatgpt_web;
      expect(labels.auto_relogin_capacity_title).toBeTruthy();
      expect(labels.auto_relogin_capacity_description).toBeTruthy();
      expect(labels.auto_relogin_workers).toBeTruthy();
      expect(labels.auto_relogin_workers_description).toBeTruthy();
      expect(labels.auto_relogin_queue_size).toBeTruthy();
      expect(labels.auto_relogin_queue_size_description).toBeTruthy();
    }
  });
});
