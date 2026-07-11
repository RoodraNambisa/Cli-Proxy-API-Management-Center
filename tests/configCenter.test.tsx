import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ConfigDisclosure } from '@/components/config/ConfigDisclosure';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import {
  CONFIG_PAGE_DEFINITIONS,
  configPageHasDirtyFields,
} from '@/components/config/configCatalog';
import { DEFAULT_VISUAL_VALUES, type VisualConfigValues } from '@/types/visualConfig';

const translations: Record<string, string> = {
  'config_management.settings_center.nav': 'Configuration categories',
  'config_management.settings_center.groups.global': 'Global',
  'config_management.settings_center.groups.providers': 'Providers',
  'config_management.settings_center.groups.advanced': 'Advanced',
  'config_management.settings_center.pages.global_basics.title': 'Basics & Access',
  'config_management.settings_center.pages.global_credentials.title': 'Credentials & Keys',
  'config_management.settings_center.pages.global_network.title': 'Network & Routing',
  'config_management.settings_center.pages.global_request.title': 'Requests & Errors',
  'config_management.settings_center.pages.global_observability.title':
    'Maintenance & Observability',
  'config_management.settings_center.pages.global_streaming.title': 'Streaming Responses',
  'config_management.settings_center.pages.provider_codex.title': 'Codex',
  'config_management.settings_center.pages.provider_antigravity.title': 'Antigravity',
  'config_management.settings_center.pages.provider_gemini_cli.title': 'Gemini CLI',
  'config_management.settings_center.pages.provider_grok.title': 'Grok',
  'config_management.settings_center.pages.advanced_payload.title': 'Payload Rules',
  'config_management.settings_center.search_placeholder': 'Search configuration',
  'config_management.status_dirty_short': 'Unsaved',
  'config_management.visual.validation_blocked_short': 'Fix errors',
};

let scrollIntoViewMock = vi.fn();

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => translations[key] ?? key,
    }),
  };
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function cloneValues(): VisualConfigValues {
  return JSON.parse(JSON.stringify(DEFAULT_VISUAL_VALUES)) as VisualConfigValues;
}

function renderEditor(
  initialEntry = '/config',
  props: Partial<ComponentProps<typeof VisualConfigEditor>> = {}
) {
  const values = cloneValues();
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <VisualConfigEditor
        values={values}
        baselineValues={cloneValues()}
        onChange={vi.fn()}
        renderRequestBodyPanels={() => <div>Request body panels</div>}
        {...props}
      />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('configuration settings center', () => {
  beforeEach(() => {
    localStorage.clear();
    scrollIntoViewMock = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });
  });

  test('restores the page from the URL and updates the URL when navigation changes', () => {
    renderEditor('/config?section=provider-grok');

    expect(screen.getByRole('heading', { name: 'Grok', level: 2 })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Codex/ }));
    expect(screen.getByTestId('location').textContent).toBe('/config?section=provider-codex');
    expect(localStorage.getItem('config-management:visual-page')).toBe('provider-codex');
  });

  test('uses local memory when the URL has no section', () => {
    localStorage.setItem('config-management:visual-page', 'provider-antigravity');
    renderEditor();

    expect(screen.getByRole('heading', { name: 'Antigravity', level: 2 })).not.toBeNull();
    expect(screen.getByTestId('location').textContent).toBe('/config?section=provider-antigravity');
  });

  test('searches YAML keys and navigates across pages', () => {
    renderEditor('/config?section=global-basics');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search configuration' }), {
      target: { value: 'request-body-audit' },
    });
    fireEvent.click(screen.getByText('request-body-audit'));

    expect(screen.getByTestId('location').textContent).toBe('/config?section=request-body-audit');
  });

  test('scrolls a concrete control when a search target uses display contents', async () => {
    renderEditor('/config?section=global-basics');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search configuration' }), {
      target: { value: 'routing.strategy' },
    });
    fireEvent.click(screen.getByText('routing.strategy'));

    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());
    const routingGroup = document.getElementById('config-routing');
    expect(routingGroup).not.toBeNull();
    expect(scrollIntoViewMock.mock.instances.at(-1)).not.toBe(routingGroup);
  });

  test('supports shareable deep links for Codex Images', async () => {
    renderEditor('/config?section=codex-images');

    expect(screen.getByRole('heading', { name: 'Codex', level: 2 })).not.toBeNull();
    const disclosure = document.querySelector('#images-native-generations button[aria-expanded]');
    await waitFor(() => expect(disclosure?.getAttribute('aria-expanded')).toBe('true'));
  });

  test('shows dirty and validation indicators on the owning navigation page', () => {
    renderEditor('/config?section=provider-codex', {
      dirtyFields: ['images'],
      validationErrors: { port: 'port_range' },
    });

    expect(screen.getAllByLabelText('modified').length).toBeGreaterThan(0);
    const basicsButton = screen.getByRole('button', { name: /Basics & Access/ });
    expect(basicsButton.textContent).toContain('1');
  });

  test('keeps dirty and validation indicators in one navigation status cell', () => {
    renderEditor('/config?section=provider-codex', {
      dirtyFields: ['images'],
      validationErrors: { 'images.unsupportedStatusCode': 'invalid_status_code' },
    });

    const codexButton = screen.getByRole('button', { name: /Codex/ });
    expect(codexButton.children).toHaveLength(3);
    expect(codexButton.lastElementChild?.textContent).toContain('1');

    const mobilePicker = screen.getByRole('button', { name: 'Configuration categories' });
    expect(mobilePicker.textContent).toContain('Unsaved');
    expect(mobilePicker.textContent).toContain('Fix errors (1)');
  });

  test('assigns the management key to Credentials & Keys', () => {
    renderEditor('/config?section=global-credentials');

    expect(document.getElementById('config-management-key')).not.toBeNull();
    const byId = new Map(CONFIG_PAGE_DEFINITIONS.map((page) => [page.id, page]));
    expect(configPageHasDirtyFields(byId.get('global-credentials')!, ['rmSecretKey'])).toBe(true);
    expect(configPageHasDirtyFields(byId.get('global-basics')!, ['rmSecretKey'])).toBe(false);
  });

  test('restores Images disclosure defaults after async configuration loading', async () => {
    const initialValues = cloneValues();
    const loadedValues = cloneValues();
    loadedValues.images.native.generations.enabled = true;
    loadedValues.images.native.edits.enabled = true;

    const view = render(
      <MemoryRouter initialEntries={['/config?section=provider-codex']}>
        <VisualConfigEditor
          values={initialValues}
          baselineValues={cloneValues()}
          onChange={vi.fn()}
        />
      </MemoryRouter>
    );

    view.rerender(
      <MemoryRouter initialEntries={['/config?section=provider-codex']}>
        <VisualConfigEditor
          values={loadedValues}
          baselineValues={loadedValues}
          onChange={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        document
          .querySelector('#images-native-generations button[aria-expanded]')
          ?.getAttribute('aria-expanded')
      ).toBe('true');
      expect(
        document
          .querySelector('#config-images-legacy button[aria-expanded]')
          ?.getAttribute('aria-expanded')
      ).toBe('false');
    });
  });

  test('respects an explicit collapsed state for enabled Native Images', () => {
    localStorage.setItem('config-management:images-native-generations-expanded', 'false');
    const values = cloneValues();
    values.images.native.generations.enabled = true;

    renderEditor('/config?section=provider-codex', {
      values,
      baselineValues: values,
    });

    expect(
      document
        .querySelector('#images-native-generations button[aria-expanded]')
        ?.getAttribute('aria-expanded')
    ).toBe('false');
  });

  test('maps nested and prefixed dirty fields to their owning pages', () => {
    const byId = new Map(CONFIG_PAGE_DEFINITIONS.map((page) => [page.id, page]));

    expect(configPageHasDirtyFields(byId.get('global-basics')!, ['tlsEnable'])).toBe(true);
    expect(configPageHasDirtyFields(byId.get('global-network')!, ['routingStrategy'])).toBe(true);
    expect(configPageHasDirtyFields(byId.get('advanced-payload')!, ['payloadDefaultRules'])).toBe(
      true
    );
    expect(configPageHasDirtyFields(byId.get('provider-codex')!, ['routingStrategy'])).toBe(false);
  });
});

describe('ConfigDisclosure', () => {
  test('exposes accessible collapsed and expanded states', () => {
    const onExpandedChange = vi.fn();
    const view = render(
      <ConfigDisclosure
        id="sample-disclosure"
        title="Sample settings"
        summary="Disabled"
        expanded={false}
        onExpandedChange={onExpandedChange}
      >
        <div>Hidden fields</div>
      </ConfigDisclosure>
    );

    const toggle = screen.getByRole('button', { name: /Sample settings/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Hidden fields')).toBeNull();
    fireEvent.click(toggle);
    expect(onExpandedChange).toHaveBeenCalledWith(true);

    view.rerender(
      <ConfigDisclosure
        id="sample-disclosure"
        title="Sample settings"
        summary="Enabled"
        expanded
        onExpandedChange={onExpandedChange}
      >
        <div>Hidden fields</div>
      </ConfigDisclosure>
    );
    expect(screen.getByText('Hidden fields')).not.toBeNull();
  });
});
