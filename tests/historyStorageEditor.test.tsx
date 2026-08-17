import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { DEFAULT_VISUAL_VALUES, type VisualConfigValues } from '@/types/visualConfig';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

const values = (): VisualConfigValues =>
  JSON.parse(JSON.stringify(DEFAULT_VISUAL_VALUES)) as VisualConfigValues;

describe('history storage visual editor', () => {
  test('renders every persistence and retention control and reports changes', () => {
    const current = values();
    current.usageStatisticsPersistenceEnabled = false;
    current.logsRetentionDays = '7';
    current.usageStatisticsDetailRetentionDays = '30';
    current.usageStatisticsMaxStorageMegabytes = '512';
    const onChange = vi.fn();

    render(
      <MemoryRouter initialEntries={['/config?section=global-observability']}>
        <VisualConfigEditor
          values={current}
          baselineValues={values()}
          onChange={onChange}
          renderRequestBodyPanels={() => null}
        />
      </MemoryRouter>
    );

    const persistence = screen.getByLabelText(
      'config_management.visual.sections.system.usage_statistics_persistence'
    );
    expect((persistence as HTMLInputElement).checked).toBe(false);
    expect(
      (
        screen.getByLabelText(
          'config_management.visual.sections.system.logs_retention_days'
        ) as HTMLInputElement
      ).value
    ).toBe('7');
    const retentionInput = screen.getByLabelText(
      'config_management.visual.sections.system.usage_statistics_retention_days'
    ) as HTMLInputElement;
    expect(retentionInput.value).toBe('30');
    expect(
      (
        screen.getByLabelText(
          'config_management.visual.sections.system.usage_statistics_max_storage'
        ) as HTMLInputElement
      ).value
    ).toBe('512');

    fireEvent.click(persistence);
    expect(onChange).toHaveBeenCalledWith({ usageStatisticsPersistenceEnabled: true });
  });
});
