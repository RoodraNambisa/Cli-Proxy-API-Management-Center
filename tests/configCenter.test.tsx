import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { ConfigDisclosure } from '@/components/config/ConfigDisclosure';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import {
  CONFIG_PAGE_DEFINITIONS,
  configPageHasDirtyFields,
} from '@/components/config/configCatalog';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import {
  DEFAULT_FRONTEND_FEATURE_VISIBILITY,
  FRONTEND_FEATURE_VISIBILITY_STORAGE_KEY,
  useFrontendFeatureStore,
} from '@/stores';
import { DEFAULT_VISUAL_VALUES, type VisualConfigValues } from '@/types/visualConfig';

const translations: Record<string, string> = {
  'config_management.settings_center.nav': 'Configuration categories',
  'config_management.settings_center.groups.global': 'Global',
  'config_management.settings_center.groups.providers': 'Providers',
  'config_management.settings_center.groups.advanced': 'Advanced',
  'config_management.settings_center.pages.global_basics.title': 'Basics & Access',
  'config_management.settings_center.pages.global_interface.title': 'Interface & Features',
  'config_management.settings_center.pages.global_credentials.title': 'Credentials & Keys',
  'config_management.settings_center.pages.global_network.title': 'Network & Routing',
  'config_management.settings_center.pages.global_request.title': 'Requests & Errors',
  'config_management.settings_center.pages.global_observability.title':
    'Maintenance & Observability',
  'config_management.settings_center.pages.global_streaming.title': 'Streaming Responses',
  'config_management.settings_center.pages.provider_codex.title': 'Codex',
  'config_management.settings_center.pages.provider_antigravity.title': 'Antigravity',
  'config_management.settings_center.pages.provider_grok.title': 'Grok',
  'config_management.settings_center.pages.advanced_payload.title': 'Payload Rules',
  'config_management.settings_center.disclosures.credential_access.title':
    'Credential Storage & Management Access',
  'config_management.settings_center.disclosures.credential_access.description':
    'Manage credentials',
  'config_management.settings_center.disclosures.api_keys.title': 'API Keys',
  'config_management.settings_center.disclosures.api_keys.description': 'Manage API keys',
  'config_management.settings_center.disclosures.proxy.title': 'Proxy & Proxy Pools',
  'config_management.settings_center.disclosures.proxy.description': 'Manage proxies',
  'config_management.settings_center.disclosures.retry.title': 'Request Retry & Cooldown Waiting',
  'config_management.settings_center.disclosures.retry.description': 'Manage retries',
  'config_management.settings_center.disclosures.routing.title': 'Global Routing Strategy',
  'config_management.settings_center.disclosures.routing.description': 'Manage routing',
  'config_management.settings_center.disclosures.session_access.title':
    'Session & Protocol Options',
  'config_management.settings_center.disclosures.session_access.description':
    'Manage sessions and protocols',
  'config_management.settings_center.disclosures.cooldown_exceptions.title':
    'Cooldown Exception Status Codes',
  'config_management.settings_center.disclosures.cooldown_exceptions.description':
    'Manage cooldown exceptions',
  'config_management.settings_center.chatgpt_web.login_tasks': 'Open account login tasks',
  'config_management.settings_center.chatgpt_web.image_size_title':
    'Image aspect ratio and output size',
  'config_management.settings_center.chatgpt_web.adapt_size_to_aspect_ratio':
    'Adapt size to a Web aspect ratio',
  'config_management.settings_center.chatgpt_web.resize_to_requested_size':
    'Resize to the requested dimensions',
  'config_management.settings_center.chatgpt_web.aspect_ratio_max_error_percent':
    'Maximum aspect-ratio error (%)',
  'config_management.settings_center.frontend_features.title': 'Frontend feature visibility',
  'config_management.settings_center.frontend_features.codex_agent_identity':
    'Show Codex Agent Identity conversion tools',
  'config_management.visual.sections.network.routing_per_auth_request_limit':
    'Request limit per credential',
  'config_management.visual.sections.network.routing_per_auth_request_window_minutes':
    'Request limit window',
  'config_management.settings_center.search_placeholder': 'Search configuration',
  'config_management.status_dirty_short': 'Unsaved',
  'config_management.visual.validation_blocked_short': 'Fix errors',
  'config_management.visual.validation.validation_blocked':
    'Fix validation errors before saving',
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
    useFrontendFeatureStore.setState({
      visibility: { ...DEFAULT_FRONTEND_FEATURE_VISIBILITY },
    });
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

  test('keeps retired frontend tools hidden by default and persists an explicit opt-in', () => {
    const onChange = vi.fn();
    renderEditor('/config?section=global-interface', { onChange });

    expect(screen.getByRole('heading', { name: 'Interface & Features', level: 2 })).not.toBeNull();
    const toggle = screen.getByRole('checkbox', {
      name: 'Show Codex Agent Identity conversion tools',
    });
    expect((toggle as HTMLInputElement).checked).toBe(false);

    fireEvent.click(toggle);

    expect((toggle as HTMLInputElement).checked).toBe(true);
    const persisted = JSON.parse(
      localStorage.getItem(FRONTEND_FEATURE_VISIBILITY_STORAGE_KEY) ?? '{}'
    ) as { state?: { visibility?: { codexAgentIdentityConversion?: boolean } } };
    expect(persisted.state?.visibility?.codexAgentIdentityConversion).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('finds frontend visibility controls without treating them as backend YAML', () => {
    renderEditor('/config?section=global-basics');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search configuration' }), {
      target: { value: 'Agent Identity' },
    });
    fireEvent.click(screen.getByText('Frontend feature visibility'));

    expect(screen.getByTestId('location').textContent).toBe(
      '/config?section=config-frontend-features'
    );
  });

  test('searches YAML keys and navigates across pages', () => {
    renderEditor('/config?section=global-basics');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search configuration' }), {
      target: { value: 'request-body-audit' },
    });
    fireEvent.click(screen.getByText('request-body-audit'));

    expect(screen.getByTestId('location').textContent).toBe('/config?section=request-body-audit');
  });

  test('searches fully qualified nested YAML keys', () => {
    renderEditor('/config?section=global-basics');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search configuration' }), {
      target: { value: 'routing.fill-first-per-auth-rpm' },
    });
    fireEvent.click(screen.getByText('config_management.visual.sections.network.routing_strategy'));

    expect(screen.getByTestId('location').textContent).toBe('/config?section=config-routing');
  });

  test('finds the error response rewrite editor by its nested YAML key', () => {
    renderEditor('/config?section=global-basics');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search configuration' }), {
      target: { value: 'error-response-rewrites[].response-body' },
    });
    fireEvent.click(
      screen.getByText('config_management.visual.sections.network.error_response_rewrites')
    );

    expect(screen.getByTestId('location').textContent).toBe(
      '/config?section=config-error-response-rewrites'
    );
  });

  test('searches the generic request limiter by its displayed label', () => {
    renderEditor('/config?section=global-basics');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search configuration' }), {
      target: { value: 'Request limit per credential' },
    });
    fireEvent.click(screen.getByText('Request limit per credential'));

    expect(screen.getByTestId('location').textContent).toBe(
      '/config?section=config-routing-per-auth-request-limit'
    );
  });

  test('uses a catalog parent key to find newly added nested keys', () => {
    renderEditor('/config?section=global-basics');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search configuration' }), {
      target: { value: 'auth-maintenance.scan-interval-seconds' },
    });
    fireEvent.click(screen.getByText('config_management.visual.sections.maintenance.title'));

    expect(screen.getByTestId('location').textContent).toBe(
      '/config?section=config-auth-maintenance'
    );
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

  test('targets both ChatGPT Web dead cleanup settings from shareable links', async () => {
    const { unmount } = renderEditor(
      '/config?section=config-chatgpt-web-auto-delete-dead-priorities'
    );

    const priorities = document.getElementById('config-chatgpt-web-auto-delete-dead-priorities');
    expect(priorities).not.toBeNull();
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());
    unmount();

    renderEditor('/config?section=config-chatgpt-web-auto-delete-dead');
    expect(document.getElementById('config-chatgpt-web-auto-delete-dead')).not.toBeNull();
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());
  });

  test('keeps dead cleanup priorities editable while automatic deletion is off', () => {
    const values = cloneValues();
    values.chatgptWebAutoDeleteDeadAuths = false;
    values.chatgptWebAutoDeleteDeadPriorities = ['invalid'];
    renderEditor('/config?section=provider-chatgpt-web', { values });

    const input = screen.getByPlaceholderText(
      'config_management.settings_center.chatgpt_web.auto_delete_dead_priorities_placeholder'
    ) as HTMLInputElement;
    expect(input.disabled).toBe(false);
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

  test('assigns new routing and response rewrite errors to their owning pages', () => {
    renderEditor('/config?section=global-basics', {
      validationErrors: {
        routingPerAuthRequestLimit: 'non_negative_integer',
        'errorResponseRewrites.rule-1.responseBody': 'json_object',
      },
    });

    expect(screen.getByRole('button', { name: /Network & Routing/ }).textContent).toContain('1');
    expect(screen.getByRole('button', { name: /Requests & Errors/ }).textContent).toContain('1');
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

  test('collapses credential settings, persists expansion, and keeps ownership metadata', () => {
    const view = renderEditor('/config?section=global-credentials');

    const disclosure = screen.getByRole('button', {
      name: /Credential Storage & Management Access/,
    });
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('config-management-key')).toBeNull();
    fireEvent.click(disclosure);
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('config-management-key')).not.toBeNull();
    expect(localStorage.getItem('config-management:config-credential-access-expanded')).toBe(
      'true'
    );

    const byId = new Map(CONFIG_PAGE_DEFINITIONS.map((page) => [page.id, page]));
    expect(configPageHasDirtyFields(byId.get('global-credentials')!, ['rmSecretKey'])).toBe(true);
    expect(configPageHasDirtyFields(byId.get('global-basics')!, ['rmSecretKey'])).toBe(false);

    view.unmount();
    renderEditor('/config?section=global-credentials');
    expect(
      screen
        .getByRole('button', { name: /Credential Storage & Management Access/ })
        .getAttribute('aria-expanded')
    ).toBe('true');
  });

  test('opens the owning disclosure for deep links, dirty fields, and validation errors', () => {
    const linked = renderEditor('/config?section=config-routing-priority-overrides');

    expect(
      document
        .querySelector('#config-routing-priority-overrides button[aria-expanded]')
        ?.getAttribute('aria-expanded')
    ).toBe('true');
    linked.unmount();

    const dirty = renderEditor('/config?section=global-request', {
      dirtyFields: ['errorResponseRewrites'],
    });
    const rewriteDisclosure = document.querySelector(
      '#config-error-response-rewrites button[aria-expanded]'
    );
    expect(rewriteDisclosure?.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(rewriteDisclosure as HTMLButtonElement);
    expect(rewriteDisclosure?.getAttribute('aria-expanded')).toBe('true');
    dirty.unmount();

    renderEditor('/config?section=global-request', {
      validationErrors: { noCooldownStatusCodes: 'http_status_list' },
    });
    expect(
      document
        .querySelector('#config-no-cooldown-status-codes button[aria-expanded]')
        ?.getAttribute('aria-expanded')
    ).toBe('true');
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
    expect(configPageHasDirtyFields(byId.get('global-request')!, ['errorResponseRewrites'])).toBe(
      true
    );
    expect(configPageHasDirtyFields(byId.get('advanced-payload')!, ['payloadDefaultRules'])).toBe(
      true
    );
    expect(configPageHasDirtyFields(byId.get('provider-codex')!, ['routingStrategy'])).toBe(false);
  });

  test('removes retired Gemini CLI quota controls without hiding Antigravity credits', () => {
    const globalView = renderEditor('/config?section=global-request');

    expect(screen.queryByText('config_management.visual.sections.quota.switch_project')).toBeNull();
    expect(
      screen.queryByText('config_management.visual.sections.quota.switch_preview_model')
    ).toBeNull();

    globalView.unmount();
    renderEditor('/config?section=provider-antigravity');

    expect(
      screen.getByRole('checkbox', {
        name: 'config_management.visual.sections.quota.antigravity_credits',
      })
    ).not.toBeNull();
  });

  test('keeps only the login-task shortcut on the ChatGPT Web config page', () => {
    renderEditor('/config?section=provider-chatgpt-web', {
      renderChatGptWebSentinel: ({ active }) =>
        active ? <div>Sentinel configuration panel</div> : null,
    });

    expect(screen.getByRole('button', { name: /Open account login tasks/ })).not.toBeNull();
    expect(screen.getByText('Sentinel configuration panel')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /ChatGPT Web credentials/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /structured prox/i })).toBeNull();
  });

  test('links exact image resizing to ChatGPT Web aspect-ratio adaptation', () => {
    const defaultView = renderEditor('/config?section=provider-chatgpt-web');

    expect(screen.getByLabelText('Maximum aspect-ratio error (%)')).toHaveProperty(
      'disabled',
      true
    );
    expect(
      screen.getByRole('checkbox', { name: 'Resize to the requested dimensions' })
    ).toHaveProperty('disabled', true);

    defaultView.unmount();
    const values = cloneValues();
    values.chatgptWebAdaptSizeToAspectRatio = true;
    values.chatgptWebResizeToRequestedSize = true;
    const onChange = vi.fn();
    renderEditor('/config?section=provider-chatgpt-web', { values, onChange });

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Adapt size to a Web aspect ratio' })
    );
    expect(onChange).toHaveBeenCalledWith({
      chatgptWebAdaptSizeToAspectRatio: false,
      chatgptWebResizeToRequestedSize: false,
    });
  });

  test('counts ChatGPT Web image resize validation errors on the provider page', () => {
    renderEditor('/config?section=provider-chatgpt-web', {
      validationErrors: {
        chatgptWebAspectRatioMaxErrorPercent: 'number_range_0_10',
        chatgptWebMaxImageResponseMegabytes: 'integer_range_1_256',
      },
    });

    expect(screen.getByText('Fix validation errors before saving')).not.toBeNull();
    expect(screen.getAllByText('2')).toHaveLength(2);
  });

  test('searches Sentinel SDK keys and opens the ChatGPT Web config page', () => {
    renderEditor('/config?section=global-basics', {
      renderChatGptWebSentinel: ({ active }) =>
        active ? <div id="config-chatgpt-web-sentinel">Sentinel configuration panel</div> : null,
    });

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search configuration' }), {
      target: { value: 'chatgpt-web.sentinel.sdk-workers' },
    });
    fireEvent.click(screen.getByText('chatgpt_web.sentinel.title'));

    expect(screen.getByTestId('location').textContent).toBe(
      '/config?section=config-chatgpt-web-sentinel'
    );
    expect(screen.getByText('Sentinel configuration panel')).not.toBeNull();
  });

  test('searches account-info leaf keys and opens the ChatGPT Web config page', () => {
    renderEditor('/config?section=global-basics');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search configuration' }), {
      target: { value: 'chatgpt-web.account-info.refresh-queue-size' },
    });
    fireEvent.click(screen.getByText('chatgpt_web.account_info.title'));

    expect(screen.getByTestId('location').textContent).toBe(
      '/config?section=config-chatgpt-web-account-info'
    );
  });

  test('searches ChatGPT Web image resize leaf keys', () => {
    renderEditor('/config?section=global-basics');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search configuration' }), {
      target: { value: 'images.chatgpt-web.max-image-response-megabytes' },
    });
    fireEvent.click(screen.getAllByText('Image aspect ratio and output size')[0]!);

    expect(screen.getByTestId('location').textContent).toBe(
      '/config?section=config-chatgpt-web-adapt-size-to-aspect-ratio'
    );
  });

  test('searches login proxy and fallback Usage keys on the ChatGPT Web config page', () => {
    const view = renderEditor('/config?section=global-basics');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search configuration' }), {
      target: { value: 'chatgpt-web.login-proxy.url-template' },
    });
    fireEvent.click(screen.getByText('chatgpt_web.login_proxy.title'));
    expect(screen.getByTestId('location').textContent).toBe(
      '/config?section=config-chatgpt-web-login-proxy'
    );

    view.unmount();
    renderEditor('/config?section=global-basics');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search configuration' }), {
      target: { value: 'chatgpt-web.image-usage.fallback-usage.output-image-tokens' },
    });
    fireEvent.click(screen.getByText('chatgpt_web.usage_cache.title'));
    expect(screen.getByTestId('location').textContent).toBe(
      '/config?section=config-chatgpt-web-usage-cache'
    );
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
    expect(toggle.querySelector('path')?.getAttribute('d')).toBe('m9 18 6-6-6-6');
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
    expect(toggle.querySelector('path')?.getAttribute('d')).toBe('m6 9 6 6 6-6');
    expect(screen.getByText('Hidden fields')).not.toBeNull();
  });
});

describe('legacy quota fallback config', () => {
  test('preserves retired Gemini CLI fields without injecting active settings', () => {
    const yaml = [
      'quota-exceeded:',
      '  switch-project: false',
      '  switch-preview-model: true',
      '',
    ].join('\n');
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      expect(result.current.loadVisualValuesFromYaml(yaml)).toEqual({ ok: true });
    });

    const merged = parseYaml(result.current.applyVisualChangesToYaml(yaml)) as Record<
      string,
      Record<string, unknown>
    >;
    expect(merged['quota-exceeded']).toEqual({
      'switch-project': false,
      'switch-preview-model': true,
    });
  });

  test('updates Antigravity credits independently of retired fields', () => {
    const yaml = [
      'quota-exceeded:',
      '  switch-project: false',
      '  switch-preview-model: true',
      '  antigravity-credits: false',
      '',
    ].join('\n');
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml(yaml);
    });
    act(() => {
      result.current.setVisualValues({ quotaAntigravityCredits: true });
    });

    const merged = parseYaml(result.current.applyVisualChangesToYaml(yaml)) as Record<
      string,
      Record<string, unknown>
    >;
    expect(merged['quota-exceeded']).toEqual({
      'switch-project': false,
      'switch-preview-model': true,
      'antigravity-credits': true,
    });
    expect(result.current.visualDirtyFields).toEqual(['quotaAntigravityCredits']);
  });
});
