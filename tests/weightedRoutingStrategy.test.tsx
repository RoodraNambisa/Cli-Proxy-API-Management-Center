import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { parse } from 'yaml';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { CONFIG_SEARCH_DEFINITIONS } from '@/components/config/configCatalog';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import { configApi } from '@/services/api/config';
import { apiClient } from '@/services/api/client';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('weighted routing strategy', () => {
  test('reads aliases and saves strategies while preserving weights and unknown YAML', () => {
    const original =
      'routing:\n  strategy: round-robin\n  extension: keep\n  priority-overrides:\n    - priority: 2\n      strategy: WRR\ncodex-api-key:\n  - api-key: local-test\n    weight: 0\n    future-field: keep\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualValues.routingStrategy).toBe('round-robin');
    expect(result.current.visualValues.routingPriorityOverrides[0].strategy).toBe(
      'weighted-round-robin'
    );
    act(() => result.current.setVisualValues({ routingStrategy: 'weighted-round-robin' }));
    expect(result.current.visualDirtyFields).toContain('routingStrategy');
    const saved = result.current.applyVisualChangesToYaml(original);
    expect(parse(saved)).toMatchObject({
      routing: { strategy: 'weighted-round-robin', extension: 'keep' },
      'codex-api-key': [{ weight: 0, 'future-field': 'keep' }],
    });
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualDirty).toBe(false);
    expect(result.current.visualValues.routingStrategy).toBe('weighted-round-robin');
  });

  test('offers the new strategy in a searchable dropdown with four translations', () => {
    const onChange = vi.fn();
    render(
      <MemoryRouter initialEntries={['/config?section=global-network']}>
        <VisualConfigEditor
          values={DEFAULT_VISUAL_VALUES}
          baselineValues={DEFAULT_VISUAL_VALUES}
          onChange={onChange}
          renderRequestBodyPanels={() => null}
        />
      </MemoryRouter>
    );
    fireEvent.click(
      document.querySelector(
        'button[aria-controls="config-network-routing-content"]'
      ) as HTMLButtonElement
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'config_management.visual.sections.network.routing_strategy',
      })
    );
    fireEvent.click(
      screen.getByRole('option', {
        name: 'config_management.visual.sections.network.strategy_weighted_round_robin',
      })
    );
    expect(onChange).toHaveBeenCalledWith({ routingStrategy: 'weighted-round-robin' });
    expect(
      CONFIG_SEARCH_DEFINITIONS.find((item) => item.id === 'config-routing')?.aliases
    ).toContain('weighted-round-robin');
    for (const locale of [en, ru, zhCN, zhTW]) {
      expect(
        locale.config_management.visual.sections.network.strategy_weighted_round_robin
      ).toBeTruthy();
    }
  });

  test('management priority APIs retain weighted strategies on read and save', async () => {
    const rules = [{ priority: 2, strategy: 'weighted-round-robin' }];
    vi.spyOn(apiClient, 'get').mockResolvedValue({ 'priority-overrides': rules });
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ 'priority-overrides': rules });
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ 'priority-overrides': rules });
    expect(await configApi.getRoutingPriorityOverrides()).toEqual(rules);
    expect(await configApi.updateRoutingPriorityOverrides(rules)).toEqual(rules);
    expect(await configApi.patchRoutingPriorityOverrides(rules)).toEqual(rules);
    expect(put.mock.lastCall?.[1]).toEqual({ value: rules });
    expect(patch.mock.lastCall?.[1]).toEqual({ value: rules });
  });

  test.each([['WRR', 'weighted-round-robin'], ['weightedroundrobin', 'weighted-round-robin'], ['rr', 'round-robin'], ['ff', 'fill-first'], ['rand', 'random']])('recognizes existing and new alias %s', (alias, expected) => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(`routing:
  strategy: ${alias}
  priority-overrides:
    - priority: 1
      strategy: ${alias}
`));
    expect(result.current.visualValues.routingStrategy).toBe(expected);
    expect(result.current.visualValues.routingPriorityOverrides[0].strategy).toBe(expected);
  });
});
