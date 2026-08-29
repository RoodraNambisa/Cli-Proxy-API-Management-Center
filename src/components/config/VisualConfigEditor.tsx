import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconCode,
  IconDiamond,
  IconExternalLink,
  IconEye,
  IconKey,
  IconSatellite,
  IconSearch,
  IconSettings,
  IconShield,
  IconTimer,
  IconTrendingUp,
  type IconProps,
} from '@/components/ui/icons';
import { ConfigSection } from '@/components/config/ConfigSection';
import { ConfigDisclosure } from '@/components/config/ConfigDisclosure';
import {
  CONFIG_PAGE_DEFINITIONS,
  CONFIG_SEARCH_DEFINITIONS,
  DEFAULT_CONFIG_PAGE_ID,
  configPageHasDirtyFields,
  isConfigPageId,
  resolveConfigSection,
  type ConfigPageDefinition,
  type ConfigPageGroupId,
  type ConfigPageId,
} from '@/components/config/configCatalog';
import type {
  AuthModelExclusionVisualEntry,
  CodexCustomModelValidationErrors,
  ErrorResponseRewriteVisualEntry,
  FixedErrorCooldownScope,
  FixedErrorCooldownVisualEntry,
  NativeImageEndpointVisualConfig,
  NonRetryableErrorVisualEntry,
  PayloadFilterRule,
  PayloadParamValidationErrorCode,
  PayloadRule,
  RoutingPriorityOverrideStrategy,
  RoutingPriorityOverrideVisualEntry,
  RoutingSubscriptionOverrideVisualEntry,
  VisualConfigFieldPath,
  VisualConfigValidationErrorCode,
  VisualConfigValidationErrors,
  VisualConfigValues,
} from '@/types/visualConfig';
import { makeClientId } from '@/types/visualConfig';
import {
  CODEX_FINGERPRINT_MODES,
  MAX_CODEX_SESSION_IDENTITY_POOL_SIZE,
  MIN_CODEX_SESSION_IDENTITY_POOL_SIZE,
  type CodexFingerprintDefaultMode,
  type CodexTurnStatePolicy,
} from '@/types/config';
import { configApi, type ProxyUrlCheckResult } from '@/services/api/config';
import { chatGptWebApi } from '@/services/api/chatgptWeb';
import { useFrontendFeatureStore } from '@/stores';
import {
  isAuthModelExclusionAllMode,
  normalizeAuthModelExclusionModels,
} from '@/utils/authModelExclusions';
import {
  ApiKeysCardEditor,
  CodexCustomModelsEditor,
  PayloadFilterRulesEditor,
  PayloadRulesEditor,
  StringListEditor,
  TagListEditor,
} from './VisualConfigEditorBlocks';
import { RUNTIME_PROVIDER_OPTIONS } from './runtimeProviderOptions';
import styles from './VisualConfigEditor.module.scss';

type VisualPage = ConfigPageDefinition & {
  title: string;
  description: string;
  icon: ComponentType<IconProps>;
  errorCount: number;
  dirty: boolean;
};

const CONFIG_PAGE_ICONS: Record<ConfigPageId, ComponentType<IconProps>> = {
  'global-basics': IconSettings,
  'global-interface': IconEye,
  'global-credentials': IconKey,
  'global-network': IconTrendingUp,
  'global-request': IconTimer,
  'global-observability': IconDiamond,
  'global-streaming': IconSatellite,
  'provider-codex': IconCode,
  'provider-antigravity': IconShield,
  'provider-chatgpt-web': IconCode,
  'provider-grok': IconSatellite,
  'advanced-payload': IconCode,
};

const CONFIG_PAGE_GROUPS: ConfigPageGroupId[] = ['global', 'providers', 'advanced'];

interface VisualConfigEditorProps {
  values: VisualConfigValues;
  baselineValues: VisualConfigValues;
  validationErrors?: VisualConfigValidationErrors;
  codexCustomModelValidationErrors?: CodexCustomModelValidationErrors;
  hasPayloadValidationErrors?: boolean;
  disabled?: boolean;
  dirtyFields?: string[];
  requestBodyDirty?: boolean;
  requestBodyErrorCount?: number;
  chatGptWebSentinelDirty?: boolean;
  chatGptWebSentinelErrorCount?: number;
  chatGptWebConnectionGenerationKey?: string;
  renderRequestBodyPanels?: (options: { focusTarget?: string }) => ReactNode;
  renderChatGptWebSentinel?: (options: { active: boolean; focusTarget?: string }) => ReactNode;
  onChange: (values: Partial<VisualConfigValues>) => void;
}

const CHATGPT_WEB_AUTO_DELETE_STATS_POLL_MS = 15_000;

function getValidationMessage(
  t: ReturnType<typeof useTranslation>['t'],
  errorCode?: VisualConfigValidationErrorCode | PayloadParamValidationErrorCode
) {
  if (!errorCode) return undefined;
  return t(`config_management.visual.validation.${errorCode}`);
}

type ToggleRowProps = {
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
};

function ToggleRow({ title, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleCopy}>
        <div className={styles.toggleTitle}>{title}</div>
        {description ? <div className={styles.toggleDescription}>{description}</div> : null}
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} ariaLabel={title} />
    </div>
  );
}

function SectionGrid({ children }: { children: ReactNode }) {
  return <div className={styles.sectionGrid}>{children}</div>;
}

function SectionStack({ children }: { children: ReactNode }) {
  return <div className={styles.sectionStack}>{children}</div>;
}

function PageGroup({
  active,
  id,
  children,
}: {
  active: boolean;
  id?: string;
  children: ReactNode;
}) {
  if (!active) return null;
  return (
    <div id={id} className={styles.pageGroup}>
      {children}
    </div>
  );
}

function Divider() {
  return <div className={styles.divider} />;
}

function SectionSubsection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.subsection}>
      <div className={styles.subsectionHeader}>
        <h4 className={styles.subsectionTitle}>{title}</h4>
        {description ? <p className={styles.subsectionDescription}>{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function SettingsDisclosure({
  id,
  title,
  description,
  summary,
  focusTarget,
  targetIds = [],
  dirty = false,
  errorCount = 0,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  summary?: ReactNode;
  focusTarget?: string;
  targetIds?: string[];
  dirty?: boolean;
  errorCount?: number;
  children: ReactNode;
}) {
  const storageKey = `config-management:${id}-expanded`;
  const [expandedPreference, setExpandedPreference] = useState(
    () => localStorage.getItem(storageKey) === 'true'
  );
  const focusMatches =
    focusTarget === id || Boolean(focusTarget && targetIds.includes(focusTarget));
  const expanded = expandedPreference || focusMatches || dirty || errorCount > 0;

  return (
    <ConfigDisclosure
      id={id}
      title={title}
      description={description}
      summary={summary}
      expanded={expanded}
      onExpandedChange={(nextExpanded) => {
        setExpandedPreference(nextExpanded);
        localStorage.setItem(storageKey, String(nextExpanded));
      }}
      dirty={dirty}
      errorCount={errorCount}
    >
      {children}
    </ConfigDisclosure>
  );
}

function hasDirtyConfigField(dirtyFields: string[], prefixes: string[]) {
  return dirtyFields.some((field) =>
    prefixes.some((prefix) => field === prefix || field.startsWith(`${prefix}.`))
  );
}

function FieldShell({
  label,
  labelId,
  htmlFor,
  hint,
  hintId,
  error,
  errorId,
  children,
}: {
  label: string;
  labelId?: string;
  htmlFor?: string;
  hint?: string;
  hintId?: string;
  error?: string;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.fieldShell}>
      <label id={labelId} htmlFor={htmlFor} className={styles.fieldLabel}>
        {label}
      </label>
      {children}
      {error ? (
        <div id={errorId} className="error-box">
          {error}
        </div>
      ) : null}
      {hint ? (
        <div id={hintId} className={styles.fieldHint}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function NativeImageEndpointEditor({
  targetPrefix,
  title,
  description,
  value,
  disabled,
  dirty,
  statusCodeError,
  focusTarget,
  onChange,
}: {
  targetPrefix: 'images-native-generations' | 'images-native-edits';
  title: string;
  description: string;
  value: NativeImageEndpointVisualConfig;
  disabled?: boolean;
  dirty?: boolean;
  statusCodeError?: string;
  focusTarget?: string;
  onChange: (value: NativeImageEndpointVisualConfig) => void;
}) {
  const { t } = useTranslation();
  const storageKey = `config-management:${targetPrefix}-expanded`;
  const persistedExpansion = localStorage.getItem(storageKey);
  const [expandedPreference, setExpandedPreference] = useState<boolean | null>(() =>
    persistedExpansion === null ? null : persistedExpansion === 'true'
  );
  const expanded = expandedPreference ?? value.enabled;
  const updateValue = (patch: Partial<NativeImageEndpointVisualConfig>) =>
    onChange({ ...value, ...patch });

  useEffect(() => {
    if (!focusTarget?.startsWith(targetPrefix)) return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(focusTarget) ?? document.getElementById(targetPrefix);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusTarget, targetPrefix]);

  const handleExpandedChange = (nextExpanded: boolean) => {
    setExpandedPreference(nextExpanded);
    localStorage.setItem(storageKey, String(nextExpanded));
  };

  return (
    <ConfigDisclosure
      id={targetPrefix}
      title={title}
      description={description}
      summary={t(
        value.enabled
          ? 'config_management.settings_center.status_enabled'
          : 'config_management.settings_center.status_disabled'
      )}
      expanded={
        expanded ||
        Boolean(focusTarget?.startsWith(targetPrefix)) ||
        Boolean(statusCodeError) ||
        Boolean(dirty)
      }
      onExpandedChange={handleExpandedChange}
      dirty={dirty}
      errorCount={statusCodeError ? 1 : 0}
      actions={
        <ToggleSwitch
          checked={value.enabled}
          disabled={disabled}
          onChange={(enabled) => {
            setExpandedPreference(enabled);
            localStorage.setItem(storageKey, String(enabled));
            updateValue({ enabled });
          }}
          ariaLabel={t('config_management.visual.sections.images.native_enabled')}
        />
      }
    >
      <div id={`${targetPrefix}-models`} tabIndex={-1}>
        <FieldShell
          label={t('config_management.visual.sections.images.native_models')}
          hint={t('config_management.visual.sections.images.native_models_hint')}
        >
          <StringListEditor
            value={value.models}
            disabled={disabled}
            placeholder={t('config_management.visual.sections.images.native_models_placeholder')}
            inputAriaLabel={t('config_management.visual.sections.images.native_models')}
            onChange={(models) => updateValue({ models })}
          />
        </FieldShell>
      </div>
      <div id={`${targetPrefix}-param-rules`} tabIndex={-1}>
        <FieldShell
          label={t('config_management.visual.sections.images.native_param_rules')}
          hint={t('config_management.visual.sections.images.native_param_rules_hint')}
        >
          <StringListEditor
            value={value.paramRules}
            disabled={disabled}
            placeholder={t(
              'config_management.visual.sections.images.native_param_rules_placeholder'
            )}
            inputAriaLabel={t('config_management.visual.sections.images.native_param_rules')}
            onChange={(paramRules) => updateValue({ paramRules })}
          />
        </FieldShell>
      </div>
      <SectionGrid>
        <Input
          id={`${targetPrefix}-status-code`}
          label={t('config_management.visual.sections.images.native_unsupported_model_status_code')}
          type="number"
          placeholder="400"
          value={value.unsupportedModelStatusCode}
          onChange={(event) => updateValue({ unsupportedModelStatusCode: event.target.value })}
          disabled={disabled}
          hint={t(
            'config_management.visual.sections.images.native_unsupported_model_status_code_hint'
          )}
          error={statusCodeError}
        />
        <Input
          label={t('config_management.visual.sections.images.native_unsupported_model_message')}
          value={value.unsupportedModelMessage}
          onChange={(event) => updateValue({ unsupportedModelMessage: event.target.value })}
          disabled={disabled}
          hint={t('config_management.visual.sections.images.native_unsupported_model_message_hint')}
        />
      </SectionGrid>
    </ConfigDisclosure>
  );
}

function ImagesStreamFlushSettings({
  values,
  disabled,
  intervalError,
  minBytesError,
  onChange,
}: {
  values: VisualConfigValues;
  disabled?: boolean;
  intervalError?: string;
  minBytesError?: string;
  onChange: VisualConfigEditorProps['onChange'];
}) {
  const { t } = useTranslation();

  return (
    <>
      <SectionGrid>
        <Input
          label={t('config_management.visual.sections.images.stream_flush_interval_ms')}
          type="number"
          placeholder="0"
          value={values.images.streamFlushIntervalMs}
          onChange={(event) =>
            onChange({
              images: {
                ...values.images,
                streamFlushIntervalMs: event.target.value,
              },
            })
          }
          disabled={disabled}
          hint={t('config_management.visual.sections.images.stream_flush_interval_ms_hint')}
          error={intervalError}
        />
        <Input
          label={t('config_management.visual.sections.images.stream_flush_min_bytes')}
          type="number"
          placeholder="0"
          value={values.images.streamFlushMinBytes}
          onChange={(event) =>
            onChange({
              images: {
                ...values.images,
                streamFlushMinBytes: event.target.value,
              },
            })
          }
          disabled={disabled}
          hint={t('config_management.visual.sections.images.stream_flush_min_bytes_hint')}
          error={minBytesError}
        />
      </SectionGrid>
      <SectionGrid>
        <ToggleRow
          title={t('config_management.visual.sections.images.enable_stream_flush')}
          description={t('config_management.visual.sections.images.enable_stream_flush_desc')}
          checked={values.images.enableStreamFlush}
          disabled={disabled}
          onChange={(enableStreamFlush) =>
            onChange({
              images: {
                ...values.images,
                enableStreamFlush,
              },
            })
          }
        />
      </SectionGrid>
    </>
  );
}

function LegacyImagesSettings({
  values,
  disabled,
  unsupportedStatusCodeError,
  onChange,
}: {
  values: VisualConfigValues;
  disabled?: boolean;
  unsupportedStatusCodeError?: string;
  onChange: VisualConfigEditorProps['onChange'];
}) {
  const { t } = useTranslation();

  return (
    <>
      <SectionGrid>
        <Input
          label={t('config_management.visual.sections.images.codex_model')}
          placeholder="gpt-5.4"
          value={values.images.codexModel}
          onChange={(event) =>
            onChange({
              images: {
                ...values.images,
                codexModel: event.target.value,
              },
            })
          }
          disabled={disabled}
          hint={t('config_management.visual.sections.images.codex_model_hint')}
        />
        <Input
          label={t('config_management.visual.sections.images.image_model')}
          placeholder="gpt-image-2"
          value={values.images.imageModel}
          onChange={(event) =>
            onChange({
              images: {
                ...values.images,
                imageModel: event.target.value,
              },
            })
          }
          disabled={disabled}
          hint={t('config_management.visual.sections.images.image_model_hint')}
        />
        <Input
          label={t('config_management.visual.sections.images.unsupported_status_code')}
          type="number"
          placeholder="400"
          value={values.images.unsupportedStatusCode}
          onChange={(event) =>
            onChange({
              images: {
                ...values.images,
                unsupportedStatusCode: event.target.value,
              },
            })
          }
          disabled={disabled}
          hint={t('config_management.visual.sections.images.unsupported_status_code_hint')}
          error={unsupportedStatusCodeError}
        />
      </SectionGrid>
      <SectionGrid>
        <ToggleRow
          title={t('config_management.visual.sections.images.enable_free_plan_image_model')}
          description={t(
            'config_management.visual.sections.images.enable_free_plan_image_model_desc'
          )}
          checked={values.images.enableFreePlanImageModel}
          disabled={disabled}
          onChange={(enableFreePlanImageModel) =>
            onChange({
              images: {
                ...values.images,
                enableFreePlanImageModel,
              },
            })
          }
        />
        <ToggleRow
          title={t('config_management.visual.sections.images.enable_n_aggregation')}
          description={t('config_management.visual.sections.images.enable_n_aggregation_desc')}
          checked={values.images.enableNAggregation}
          disabled={disabled}
          onChange={(enableNAggregation) =>
            onChange({
              images: {
                ...values.images,
                enableNAggregation,
              },
            })
          }
        />
        <ToggleRow
          title={t('config_management.visual.sections.images.override_response_format_url')}
          description={t(
            'config_management.visual.sections.images.override_response_format_url_desc'
          )}
          checked={values.images.overrideResponseFormatUrl}
          disabled={disabled}
          onChange={(overrideResponseFormatUrl) =>
            onChange({
              images: {
                ...values.images,
                overrideResponseFormatUrl,
              },
            })
          }
        />
        <ToggleRow
          title={t('config_management.visual.sections.images.response_format_url_data_url')}
          description={t(
            'config_management.visual.sections.images.response_format_url_data_url_desc'
          )}
          checked={values.images.responseFormatUrlDataUrl}
          disabled={disabled}
          onChange={(responseFormatUrlDataUrl) =>
            onChange({
              images: {
                ...values.images,
                responseFormatUrlDataUrl,
              },
            })
          }
        />
        <ToggleRow
          title={t('config_management.visual.sections.images.override_transparent_background')}
          description={t(
            'config_management.visual.sections.images.override_transparent_background_desc'
          )}
          checked={values.images.overrideTransparentBackground}
          disabled={disabled}
          onChange={(overrideTransparentBackground) =>
            onChange({
              images: {
                ...values.images,
                overrideTransparentBackground,
              },
            })
          }
        />
        <ToggleRow
          title={t('config_management.visual.sections.images.override_input_fidelity')}
          description={t('config_management.visual.sections.images.override_input_fidelity_desc')}
          checked={values.images.overrideInputFidelity}
          disabled={disabled}
          onChange={(overrideInputFidelity) =>
            onChange({
              images: {
                ...values.images,
                overrideInputFidelity,
              },
            })
          }
        />
      </SectionGrid>
    </>
  );
}

export function VisualConfigEditor({
  values,
  baselineValues,
  validationErrors,
  codexCustomModelValidationErrors,
  hasPayloadValidationErrors = false,
  disabled = false,
  dirtyFields = [],
  requestBodyDirty = false,
  requestBodyErrorCount = 0,
  chatGptWebSentinelDirty = false,
  chatGptWebSentinelErrorCount = 0,
  chatGptWebConnectionGenerationKey = '',
  renderRequestBodyPanels,
  renderChatGptWebSentinel,
  onChange,
}: VisualConfigEditorProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const routingPlanTypeSuggestionOptions = useMemo(
    () => [
      {
        value: 'free',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_free'
        ),
      },
      {
        value: 'plus',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_plus'
        ),
      },
      {
        value: 'pro',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_pro'
        ),
      },
      {
        value: 'team',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_team'
        ),
      },
      {
        value: 'business',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_business'
        ),
      },
      {
        value: 'enterprise',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_enterprise'
        ),
      },
      {
        value: 'go',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_go'
        ),
      },
      {
        value: 'k12',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_k12'
        ),
      },
      {
        value: 'free_workspace',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_free_workspace'
        ),
      },
      {
        value: 'prolite',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_prolite'
        ),
      },
      {
        value: 'education',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_education'
        ),
      },
      {
        value: 'edu',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_edu'
        ),
      },
      {
        value: 'edu_plus',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_edu_plus'
        ),
      },
      {
        value: 'edu_pro',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_edu_pro'
        ),
      },
      {
        value: 'enterprise_cbp_automation',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_enterprise_cbp_automation'
        ),
      },
      {
        value: 'enterprise_cbp_usage_based',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_enterprise_cbp_usage_based'
        ),
      },
      {
        value: 'finserv',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_finserv'
        ),
      },
      {
        value: 'hc',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_hc'
        ),
      },
      {
        value: 'quorum',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_quorum'
        ),
      },
      {
        value: 'sci',
        label: t(
          'config_management.visual.sections.network.priority_subscription_overrides_plan_type_sci'
        ),
      },
    ],
    [t]
  );
  const codexAgentIdentityConversionVisible = useFrontendFeatureStore(
    (state) => state.visibility.codexAgentIdentityConversion
  );
  const setFrontendFeatureVisible = useFrontendFeatureStore((state) => state.setFeatureVisible);
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const [activePageId, setActivePageId] = useState<ConfigPageId>(() => {
    const resolvedSection = resolveConfigSection(sectionParam);
    if (resolvedSection) return resolvedSection.pageId;
    const persisted = localStorage.getItem('config-management:visual-page');
    return isConfigPageId(persisted) ? persisted : DEFAULT_CONFIG_PAGE_ID;
  });
  const [chatGptWebAutoDeletedCount, setChatGptWebAutoDeletedCount] = useState<number | null>(null);
  const [configSearchQuery, setConfigSearchQuery] = useState('');
  const [focusTarget, setFocusTarget] = useState<string | undefined>(
    () => resolveConfigSection(sectionParam)?.targetId
  );
  const routingStrategyLabelId = useId();
  const routingStrategyHintId = `${routingStrategyLabelId}-hint`;
  const maintenanceDeleteStatusCodesInputId = useId();
  const maintenanceDeleteStatusCodesHintId = `${maintenanceDeleteStatusCodesInputId}-hint`;
  const maintenanceDeleteStatusCodesErrorId = `${maintenanceDeleteStatusCodesInputId}-error`;
  const noCooldownStatusCodesInputId = useId();
  const noCooldownStatusCodesHintId = `${noCooldownStatusCodesInputId}-hint`;
  const noCooldownStatusCodesErrorId = `${noCooldownStatusCodesInputId}-error`;
  const keepaliveInputId = useId();
  const keepaliveHintId = `${keepaliveInputId}-hint`;
  const keepaliveErrorId = `${keepaliveInputId}-error`;
  const nonstreamKeepaliveInputId = useId();
  const nonstreamKeepaliveHintId = `${nonstreamKeepaliveInputId}-hint`;
  const nonstreamKeepaliveErrorId = `${nonstreamKeepaliveInputId}-error`;
  const isKeepaliveDisabled =
    values.streaming.keepaliveSeconds === '' || values.streaming.keepaliveSeconds === '0';
  const isNonstreamKeepaliveDisabled =
    values.streaming.nonstreamKeepaliveInterval === '' ||
    values.streaming.nonstreamKeepaliveInterval === '0';
  const [proxyCheckLoading, setProxyCheckLoading] = useState(false);
  const [proxyCheckResult, setProxyCheckResult] = useState<ProxyUrlCheckResult | null>(null);
  const [proxyCheckError, setProxyCheckError] = useState('');

  useEffect(() => {
    setChatGptWebAutoDeletedCount(null);
    if (
      disabled ||
      activePageId !== 'provider-chatgpt-web' ||
      chatGptWebConnectionGenerationKey.trim() === ''
    ) {
      return;
    }

    const controller = new AbortController();
    let disposed = false;
    let loadingStats = false;
    const loadStats = async () => {
      if (loadingStats) return;
      loadingStats = true;
      try {
        const stats = await chatGptWebApi.getAutoDeleteDeadStats(controller.signal);
        if (disposed) return;
        const count = Number(stats.deleted_count);
        setChatGptWebAutoDeletedCount(Number.isSafeInteger(count) && count >= 0 ? count : null);
      } catch {
        if (!disposed) setChatGptWebAutoDeletedCount(null);
      } finally {
        loadingStats = false;
      }
    };
    void loadStats();
    const timer = window.setInterval(() => void loadStats(), CHATGPT_WEB_AUTO_DELETE_STATS_POLL_MS);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [activePageId, chatGptWebConnectionGenerationKey, disabled]);
  const proxyUrlDirty = values.proxyUrl !== baselineValues.proxyUrl;
  const collapseLegacyImagesSettings =
    values.images.native.generations.enabled && values.images.native.edits.enabled;
  const nativeGenerationsDirty =
    JSON.stringify(values.images.native.generations) !==
    JSON.stringify(baselineValues.images.native.generations);
  const nativeEditsDirty =
    JSON.stringify(values.images.native.edits) !==
    JSON.stringify(baselineValues.images.native.edits);
  const legacyImagesDirty = (
    [
      'codexModel',
      'imageModel',
      'unsupportedStatusCode',
      'enableFreePlanImageModel',
      'enableNAggregation',
      'overrideResponseFormatUrl',
      'responseFormatUrlDataUrl',
      'overrideTransparentBackground',
      'overrideInputFidelity',
    ] as const
  ).some((field) => values.images[field] !== baselineValues.images[field]);
  const legacyImagesExpansionStorageKey = 'config-management:images-legacy-expanded';
  const persistedLegacyImagesExpansion = localStorage.getItem(legacyImagesExpansionStorageKey);
  const [legacyImagesExpandedPreference, setLegacyImagesExpandedPreference] = useState<
    boolean | null
  >(() =>
    persistedLegacyImagesExpansion === null ? null : persistedLegacyImagesExpansion === 'true'
  );
  const legacyImagesExpanded = legacyImagesExpandedPreference ?? !collapseLegacyImagesSettings;
  const fixedErrorCooldownScopeOptions = useMemo(
    () => [
      {
        value: 'model',
        label: t('config_management.visual.sections.quota.fixed_error_cooldowns_scope_model'),
      },
      {
        value: 'auth',
        label: t('config_management.visual.sections.quota.fixed_error_cooldowns_scope_auth'),
      },
    ],
    [t]
  );
  const routingPriorityOverrideStrategyOptions = useMemo(
    () => [
      {
        value: '',
        label: t('config_management.visual.sections.network.priority_overrides_strategy_inherit'),
      },
      {
        value: 'round-robin',
        label: t('config_management.visual.sections.network.strategy_round_robin'),
      },
      {
        value: 'fill-first',
        label: t('config_management.visual.sections.network.strategy_fill_first'),
      },
      {
        value: 'random',
        label: t('config_management.visual.sections.network.strategy_random'),
      },
    ],
    [t]
  );
  const disabledImageGenerationToolActionOptions = useMemo(
    () => [
      {
        value: 'remove',
        label: t('config_management.visual.sections.auth.disabled_image_tool_action_remove'),
      },
      {
        value: 'error',
        label: t('config_management.visual.sections.auth.disabled_image_tool_action_error'),
      },
    ],
    [t]
  );
  const chatGptWebResizeFilterOptions = useMemo(
    () => [
      {
        value: 'catmull-rom',
        label: t('config_management.settings_center.chatgpt_web.resize_filter_catmull_rom'),
      },
      {
        value: 'approx-bilinear',
        label: t('config_management.settings_center.chatgpt_web.resize_filter_approx_bilinear'),
      },
    ],
    [t]
  );
  const chatGptWebRemoteImageDownloadModeOptions = useMemo(
    () => [
      {
        value: 'direct',
        label: t('config_management.settings_center.chatgpt_web.remote_image_url_mode_direct'),
      },
      {
        value: 'credential-proxy',
        label: t(
          'config_management.settings_center.chatgpt_web.remote_image_url_mode_credential_proxy'
        ),
      },
    ],
    [t]
  );
  const managementDiagnosticsDetailOptions = useMemo(
    () => [
      {
        value: 'safe',
        label: t('config_management.visual.sections.remote.diagnostics_detail_safe'),
      },
      {
        value: 'full',
        label: t('config_management.visual.sections.remote.diagnostics_detail_full'),
      },
    ],
    [t]
  );
  const codexTurnStatePolicyOptions = useMemo(
    () => [
      {
        value: 'passthrough',
        label: t('config_management.visual.sections.network.codex_turn_state_policy_passthrough'),
      },
      {
        value: 'guard-cross-account',
        label: t(
          'config_management.visual.sections.network.codex_turn_state_policy_guard_cross_account'
        ),
      },
      {
        value: 'same-account-only',
        label: t(
          'config_management.visual.sections.network.codex_turn_state_policy_same_account_only'
        ),
      },
      {
        value: 'strip',
        label: t('config_management.visual.sections.network.codex_turn_state_policy_strip'),
      },
    ],
    [t]
  );
  const codexFingerprintDefaultModeOptions = useMemo(
    () =>
      CODEX_FINGERPRINT_MODES.map((mode) => ({
        value: mode,
        label: t(`auth_files.codex_fingerprint_modes.${mode}`),
      })),
    [t]
  );
  const codexTurnStatePolicyHint = {
    passthrough: t(
      'config_management.visual.sections.network.codex_turn_state_policy_passthrough_desc'
    ),
    'guard-cross-account': t(
      'config_management.visual.sections.network.codex_turn_state_policy_guard_cross_account_desc'
    ),
    'same-account-only': t(
      'config_management.visual.sections.network.codex_turn_state_policy_same_account_only_desc'
    ),
    strip: t('config_management.visual.sections.network.codex_turn_state_policy_strip_desc'),
  }[values.codexTurnStatePolicy];

  const portError = getValidationMessage(t, validationErrors?.port);
  const rmAccessPathError = getValidationMessage(t, validationErrors?.rmAccessPath);
  const logsMaxSizeError = getValidationMessage(t, validationErrors?.logsMaxTotalSizeMb);
  const logsRetentionDaysError = getValidationMessage(t, validationErrors?.logsRetentionDays);
  const usageStatisticsPersistIntervalError = getValidationMessage(
    t,
    validationErrors?.usageStatisticsPersistIntervalSeconds
  );
  const usageStatisticsDetailRetentionDaysError = getValidationMessage(
    t,
    validationErrors?.usageStatisticsDetailRetentionDays
  );
  const usageStatisticsMaxStorageMegabytesError = getValidationMessage(
    t,
    validationErrors?.usageStatisticsMaxStorageMegabytes
  );
  const requestRetryError = getValidationMessage(t, validationErrors?.requestRetry);
  const maxRetryCredentialsError = getValidationMessage(t, validationErrors?.maxRetryCredentials);
  const maxRetryIntervalError = getValidationMessage(t, validationErrors?.maxRetryInterval);
  const codexFingerprintSessionIdentityPoolSizeError = getValidationMessage(
    t,
    validationErrors?.codexFingerprintSessionIdentityPoolSize
  );
  const routingFillFirstRangeError = getValidationMessage(
    t,
    validationErrors?.routingFillFirstRange
  );
  const routingFillFirstPerAuthRpmError = getValidationMessage(
    t,
    validationErrors?.routingFillFirstPerAuthRpm
  );
  const routingPerAuthRequestLimitError = getValidationMessage(
    t,
    validationErrors?.routingPerAuthRequestLimit
  );
  const routingPerAuthRequestWindowMinutesError = getValidationMessage(
    t,
    validationErrors?.routingPerAuthRequestWindowMinutes
  );
  const noCooldownStatusCodesError = getValidationMessage(
    t,
    validationErrors?.noCooldownStatusCodes
  );
  const chatGptWebAutoDeleteDeadPrioritiesError = getValidationMessage(
    t,
    validationErrors?.chatgptWebAutoDeleteDeadPriorities
  );
  const chatGptWebAutoReloginWorkersError = getValidationMessage(
    t,
    validationErrors?.chatgptWebAutoReloginWorkers
  );
  const chatGptWebAutoReloginQueueSizeError = getValidationMessage(
    t,
    validationErrors?.chatgptWebAutoReloginQueueSize
  );
  const chatGptWebManualReloginConcurrencyError = getValidationMessage(
    t,
    validationErrors?.chatgptWebManualReloginConcurrency
  );
  const chatGptWebAspectRatioMaxErrorPercentError = getValidationMessage(
    t,
    validationErrors?.chatgptWebAspectRatioMaxErrorPercent
  );
  const chatGptWebStrictSizeError = getValidationMessage(t, validationErrors?.chatgptWebStrictSize);
  const chatGptWebMaxResizeEdgePixelsError = getValidationMessage(
    t,
    validationErrors?.chatgptWebMaxResizeEdgePixels
  );
  const chatGptWebResizeToRequestedSizeError = getValidationMessage(
    t,
    validationErrors?.chatgptWebResizeToRequestedSize
  );
  const chatGptWebResizeFilterError = getValidationMessage(
    t,
    validationErrors?.chatgptWebResizeFilter
  );
  const chatGptWebMaxImageResponseMegabytesError = getValidationMessage(
    t,
    validationErrors?.chatgptWebMaxImageResponseMegabytes
  );
  const chatGptWebMaxNError = getValidationMessage(t, validationErrors?.chatgptWebMaxN);
  const chatGptWebImageMaxInFlightError = getValidationMessage(
    t,
    validationErrors?.chatgptWebImageMaxInFlight
  );
  const chatGptWebImageAdmissionQueueSizeError = getValidationMessage(
    t,
    validationErrors?.chatgptWebImageAdmissionQueueSize
  );
  const chatGptWebImageAdmissionWaitMillisecondsError = getValidationMessage(
    t,
    validationErrors?.chatgptWebImageAdmissionWaitMilliseconds
  );
  const chatGptWebImageMaxFinalizersError = getValidationMessage(
    t,
    validationErrors?.chatgptWebImageMaxFinalizers
  );
  const chatGptWebImageCompletionReserveMegabytesError = getValidationMessage(
    t,
    validationErrors?.chatgptWebImageCompletionReserveMegabytes
  );
  const chatGptWebImageMemoryCapacityMegabytesError = getValidationMessage(
    t,
    validationErrors?.chatgptWebImageMemoryCapacityMegabytes
  );
  const chatGptWebImagePollConcurrencyError = getValidationMessage(
    t,
    validationErrors?.chatgptWebImagePollConcurrency
  );
  const chatGptWebImagePollStallSecondsError = getValidationMessage(
    t,
    validationErrors?.chatgptWebImagePollStallSeconds
  );
  const chatGptWebImageMemoryFinalizerConcurrencyError = getValidationMessage(
    t,
    validationErrors?.chatgptWebImageMemoryFinalizerConcurrency
  );
  const fixedErrorCooldownsErrorCount = useMemo(
    () =>
      Object.keys(validationErrors ?? {}).filter((key) => key.startsWith('fixedErrorCooldowns.'))
        .length,
    [validationErrors]
  );
  const nonRetryableErrorsErrorCount = useMemo(
    () =>
      Object.keys(validationErrors ?? {}).filter((key) => key.startsWith('nonRetryableErrors.'))
        .length,
    [validationErrors]
  );
  const errorResponseRewritesErrorCount = useMemo(
    () =>
      Object.keys(validationErrors ?? {}).filter((key) => key.startsWith('errorResponseRewrites.'))
        .length,
    [validationErrors]
  );
  const authModelExclusionsErrorCount = useMemo(
    () =>
      Object.keys(validationErrors ?? {}).filter((key) => key.startsWith('authModelExclusions.'))
        .length,
    [validationErrors]
  );
  const disabledImageGenerationToolStatusCodeError = getValidationMessage(
    t,
    validationErrors?.['disabledImageGenerationToolError.statusCode']
  );
  const routingPriorityOverridesErrorCount = useMemo(
    () =>
      Object.keys(validationErrors ?? {}).filter((key) =>
        key.startsWith('routingPriorityOverrides.')
      ).length,
    [validationErrors]
  );
  const credentialAccessDirty = hasDirtyConfigField(dirtyFields, ['rmSecretKey', 'authDir']);
  const apiKeysDirty = hasDirtyConfigField(dirtyFields, ['apiKeysText']);
  const authModelExclusionsDirty = hasDirtyConfigField(dirtyFields, ['authModelExclusions']);
  const proxySettingsDirty = hasDirtyConfigField(dirtyFields, ['proxyUrl']);
  const retrySettingsDirty = hasDirtyConfigField(dirtyFields, [
    'requestRetry',
    'maxRetryCredentials',
    'maxRetryInterval',
  ]);
  const routingSettingsDirty = hasDirtyConfigField(dirtyFields, [
    'routingStrategy',
    'routingFillFirstRange',
    'routingFillFirstPerAuthRpm',
    'routingPerAuthRequestLimit',
    'routingPerAuthRequestWindowMinutes',
  ]);
  const routingPriorityOverridesDirty = hasDirtyConfigField(dirtyFields, [
    'routingPriorityOverrides',
  ]);
  const sessionSettingsDirty = hasDirtyConfigField(dirtyFields, [
    'routingSessionAffinity',
    'routingSessionAffinityFailover',
    'routingSessionAffinityTTL',
    'forceModelPrefix',
    'wsAuth',
  ]);
  const nonRetryableErrorsDirty = hasDirtyConfigField(dirtyFields, ['nonRetryableErrors']);
  const errorResponseRewritesDirty = hasDirtyConfigField(dirtyFields, ['errorResponseRewrites']);
  const fixedErrorCooldownsDirty = hasDirtyConfigField(dirtyFields, ['fixedErrorCooldowns']);
  const noCooldownStatusCodesDirty = hasDirtyConfigField(dirtyFields, ['noCooldownStatusCodes']);
  const chatGptWebRemoteImageDirty = hasDirtyConfigField(dirtyFields, [
    'chatgptWebRemoteImageUrlEnabled',
    'chatgptWebRemoteImageUrlDownloadMode',
    'chatgptWebNormalizeRemoteImageMime',
  ]);
  const chatGptWebImageSizeDirty = hasDirtyConfigField(dirtyFields, [
    'chatgptWebAdaptSizeToAspectRatio',
    'chatgptWebStrictSize',
    'chatgptWebAspectRatioMaxErrorPercent',
    'chatgptWebMaxResizeEdgePixels',
    'chatgptWebResizeToRequestedSize',
    'chatgptWebResizeFilter',
    'chatgptWebMaxImageResponseMegabytes',
    'chatgptWebMaxN',
  ]);
  const chatGptWebImageSizeErrorCount = [
    chatGptWebStrictSizeError,
    chatGptWebAspectRatioMaxErrorPercentError,
    chatGptWebMaxResizeEdgePixelsError,
    chatGptWebResizeToRequestedSizeError,
    chatGptWebResizeFilterError,
    chatGptWebMaxImageResponseMegabytesError,
    chatGptWebMaxNError,
  ].filter(Boolean).length;
  const chatGptWebImageCapacityDirty = hasDirtyConfigField(dirtyFields, [
    'chatgptWebImageMaxInFlight',
    'chatgptWebImageAdmissionQueueSize',
    'chatgptWebImageAdmissionWaitMilliseconds',
    'chatgptWebImageMaxFinalizers',
    'chatgptWebImageCompletionReserveMegabytes',
    'chatgptWebImageMemoryCapacityMegabytes',
    'chatgptWebImagePollConcurrency',
    'chatgptWebImagePollStallBreakerEnabled',
    'chatgptWebImagePollStallSeconds',
    'chatgptWebImageMemoryFinalizerConcurrency',
  ]);
  const chatGptWebImageCapacityErrorCount = [
    chatGptWebImageMaxInFlightError,
    chatGptWebImageAdmissionQueueSizeError,
    chatGptWebImageAdmissionWaitMillisecondsError,
    chatGptWebImageMaxFinalizersError,
    chatGptWebImageCompletionReserveMegabytesError,
    chatGptWebImageMemoryCapacityMegabytesError,
    chatGptWebImagePollConcurrencyError,
    chatGptWebImagePollStallSecondsError,
    chatGptWebImageMemoryFinalizerConcurrencyError,
  ].filter(Boolean).length;
  const retrySettingsErrorCount = [
    requestRetryError,
    maxRetryCredentialsError,
    maxRetryIntervalError,
  ].filter(Boolean).length;
  const routingSettingsErrorCount = [
    routingFillFirstRangeError,
    routingFillFirstPerAuthRpmError,
    routingPerAuthRequestLimitError,
    routingPerAuthRequestWindowMinutesError,
  ].filter(Boolean).length;
  const imagesUnsupportedStatusCodeError = getValidationMessage(
    t,
    validationErrors?.['images.unsupportedStatusCode']
  );
  const imagesStreamFlushIntervalError = getValidationMessage(
    t,
    validationErrors?.['images.streamFlushIntervalMs']
  );
  const imagesStreamFlushMinBytesError = getValidationMessage(
    t,
    validationErrors?.['images.streamFlushMinBytes']
  );
  const imagesNativeGenerationsStatusCodeError = getValidationMessage(
    t,
    validationErrors?.['images.native.generations.unsupportedModelStatusCode']
  );
  const imagesNativeEditsStatusCodeError = getValidationMessage(
    t,
    validationErrors?.['images.native.edits.unsupportedModelStatusCode']
  );
  const authMaintenanceScanIntervalError = getValidationMessage(
    t,
    validationErrors?.['authMaintenance.scanIntervalSeconds']
  );
  const authMaintenanceDeleteIntervalError = getValidationMessage(
    t,
    validationErrors?.['authMaintenance.deleteIntervalSeconds']
  );
  const authMaintenanceDeleteStatusCodesError = getValidationMessage(
    t,
    validationErrors?.['authMaintenance.deleteStatusCodes']
  );
  const authMaintenanceQuotaStrikeThresholdError = getValidationMessage(
    t,
    validationErrors?.['authMaintenance.quotaStrikeThreshold']
  );
  const authMaintenanceDisableQuotaStrikeThresholdError = getValidationMessage(
    t,
    validationErrors?.['authMaintenance.disableQuotaStrikeThreshold']
  );
  const keepaliveError = getValidationMessage(t, validationErrors?.['streaming.keepaliveSeconds']);
  const bootstrapRetriesError = getValidationMessage(
    t,
    validationErrors?.['streaming.bootstrapRetries']
  );
  const streamFlushIntervalError = getValidationMessage(
    t,
    validationErrors?.['streaming.streamFlushIntervalMs']
  );
  const streamFlushMinBytesError = getValidationMessage(
    t,
    validationErrors?.['streaming.streamFlushMinBytes']
  );
  const nonstreamKeepaliveError = getValidationMessage(
    t,
    validationErrors?.['streaming.nonstreamKeepaliveInterval']
  );

  const handleApiKeysTextChange = useCallback(
    (apiKeysText: string) => onChange({ apiKeysText }),
    [onChange]
  );
  const handleCodexCustomModelsChange = useCallback(
    (codexCustomModels: VisualConfigValues['codexCustomModels']) => onChange({ codexCustomModels }),
    [onChange]
  );
  const handlePayloadDefaultRulesChange = useCallback(
    (payloadDefaultRules: PayloadRule[]) => onChange({ payloadDefaultRules }),
    [onChange]
  );
  const handlePayloadDefaultRawRulesChange = useCallback(
    (payloadDefaultRawRules: PayloadRule[]) => onChange({ payloadDefaultRawRules }),
    [onChange]
  );
  const handlePayloadOverrideRulesChange = useCallback(
    (payloadOverrideRules: PayloadRule[]) => onChange({ payloadOverrideRules }),
    [onChange]
  );
  const handlePayloadOverrideRawRulesChange = useCallback(
    (payloadOverrideRawRules: PayloadRule[]) => onChange({ payloadOverrideRawRules }),
    [onChange]
  );
  const handlePayloadFilterRulesChange = useCallback(
    (payloadFilterRules: PayloadFilterRule[]) => onChange({ payloadFilterRules }),
    [onChange]
  );
  const handleFixedErrorCooldownsChange = useCallback(
    (fixedErrorCooldowns: FixedErrorCooldownVisualEntry[]) => onChange({ fixedErrorCooldowns }),
    [onChange]
  );
  const handleNonRetryableErrorsChange = useCallback(
    (nonRetryableErrors: NonRetryableErrorVisualEntry[]) => onChange({ nonRetryableErrors }),
    [onChange]
  );
  const handleErrorResponseRewritesChange = useCallback(
    (errorResponseRewrites: ErrorResponseRewriteVisualEntry[]) =>
      onChange({ errorResponseRewrites }),
    [onChange]
  );
  const handleAuthModelExclusionsChange = useCallback(
    (authModelExclusions: AuthModelExclusionVisualEntry[]) => onChange({ authModelExclusions }),
    [onChange]
  );
  const handleRoutingPriorityOverridesChange = useCallback(
    (routingPriorityOverrides: RoutingPriorityOverrideVisualEntry[]) =>
      onChange({ routingPriorityOverrides }),
    [onChange]
  );
  const addRoutingPriorityOverride = useCallback(() => {
    handleRoutingPriorityOverridesChange([
      ...values.routingPriorityOverrides,
      {
        clientId: makeClientId(),
        priority: '',
        strategy: '',
        maxRetryCredentials: '',
        fillFirstRange: '',
        fillFirstPerAuthRpm: '',
        perAuthRequestLimit: '',
        perAuthRequestWindowMinutes: '',
        subscriptionOverrides: [],
      },
    ]);
  }, [handleRoutingPriorityOverridesChange, values.routingPriorityOverrides]);
  const updateRoutingPriorityOverride = useCallback(
    (clientId: string, patch: Partial<RoutingPriorityOverrideVisualEntry>) => {
      handleRoutingPriorityOverridesChange(
        values.routingPriorityOverrides.map((rule) =>
          rule.clientId === clientId ? { ...rule, ...patch } : rule
        )
      );
    },
    [handleRoutingPriorityOverridesChange, values.routingPriorityOverrides]
  );
  const removeRoutingPriorityOverride = useCallback(
    (clientId: string) => {
      handleRoutingPriorityOverridesChange(
        values.routingPriorityOverrides.filter((rule) => rule.clientId !== clientId)
      );
    },
    [handleRoutingPriorityOverridesChange, values.routingPriorityOverrides]
  );
  const addRoutingSubscriptionOverride = useCallback(
    (priorityClientId: string) => {
      const subscriptionOverride: RoutingSubscriptionOverrideVisualEntry = {
        clientId: makeClientId(),
        providers: [],
        planTypes: [],
        perAuthRequestLimit: '',
        perAuthRequestWindowMinutes: '',
      };
      handleRoutingPriorityOverridesChange(
        values.routingPriorityOverrides.map((rule) =>
          rule.clientId === priorityClientId
            ? {
                ...rule,
                subscriptionOverrides: [...rule.subscriptionOverrides, subscriptionOverride],
              }
            : rule
        )
      );
    },
    [handleRoutingPriorityOverridesChange, values.routingPriorityOverrides]
  );
  const updateRoutingSubscriptionOverride = useCallback(
    (
      priorityClientId: string,
      subscriptionClientId: string,
      patch: Partial<RoutingSubscriptionOverrideVisualEntry>
    ) => {
      handleRoutingPriorityOverridesChange(
        values.routingPriorityOverrides.map((rule) =>
          rule.clientId === priorityClientId
            ? {
                ...rule,
                subscriptionOverrides: rule.subscriptionOverrides.map((subscriptionRule) =>
                  subscriptionRule.clientId === subscriptionClientId
                    ? { ...subscriptionRule, ...patch }
                    : subscriptionRule
                ),
              }
            : rule
        )
      );
    },
    [handleRoutingPriorityOverridesChange, values.routingPriorityOverrides]
  );
  const removeRoutingSubscriptionOverride = useCallback(
    (priorityClientId: string, subscriptionClientId: string) => {
      handleRoutingPriorityOverridesChange(
        values.routingPriorityOverrides.map((rule) =>
          rule.clientId === priorityClientId
            ? {
                ...rule,
                subscriptionOverrides: rule.subscriptionOverrides.filter(
                  (subscriptionRule) => subscriptionRule.clientId !== subscriptionClientId
                ),
              }
            : rule
        )
      );
    },
    [handleRoutingPriorityOverridesChange, values.routingPriorityOverrides]
  );
  const getRoutingPriorityOverrideError = useCallback(
    (
      clientId: string,
      field:
        | 'priority'
        | 'maxRetryCredentials'
        | 'fillFirstRange'
        | 'fillFirstPerAuthRpm'
        | 'perAuthRequestLimit'
        | 'perAuthRequestWindowMinutes'
    ) =>
      getValidationMessage(t, validationErrors?.[`routingPriorityOverrides.${clientId}.${field}`]),
    [t, validationErrors]
  );
  const getRoutingSubscriptionOverrideError = useCallback(
    (
      priorityClientId: string,
      subscriptionClientId: string,
      field: 'planTypes' | 'perAuthRequestLimit' | 'perAuthRequestWindowMinutes'
    ) =>
      getValidationMessage(
        t,
        validationErrors?.[
          `routingPriorityOverrides.${priorityClientId}.subscriptionOverrides.${subscriptionClientId}.${field}`
        ]
      ),
    [t, validationErrors]
  );
  const addFixedErrorCooldown = useCallback(() => {
    handleFixedErrorCooldownsChange([
      ...values.fixedErrorCooldowns,
      {
        clientId: makeClientId(),
        statusCode: '',
        messageContains: '',
        cooldownSeconds: '',
        scope: 'model',
      },
    ]);
  }, [handleFixedErrorCooldownsChange, values.fixedErrorCooldowns]);
  const updateFixedErrorCooldown = useCallback(
    (clientId: string, patch: Partial<FixedErrorCooldownVisualEntry>) => {
      handleFixedErrorCooldownsChange(
        values.fixedErrorCooldowns.map((rule) =>
          rule.clientId === clientId ? { ...rule, ...patch } : rule
        )
      );
    },
    [handleFixedErrorCooldownsChange, values.fixedErrorCooldowns]
  );
  const removeFixedErrorCooldown = useCallback(
    (clientId: string) => {
      handleFixedErrorCooldownsChange(
        values.fixedErrorCooldowns.filter((rule) => rule.clientId !== clientId)
      );
    },
    [handleFixedErrorCooldownsChange, values.fixedErrorCooldowns]
  );
  const getFixedErrorCooldownError = useCallback(
    (clientId: string, field: 'statusCode' | 'messageContains' | 'cooldownSeconds') =>
      getValidationMessage(t, validationErrors?.[`fixedErrorCooldowns.${clientId}.${field}`]),
    [t, validationErrors]
  );
  const addNonRetryableError = useCallback(() => {
    handleNonRetryableErrorsChange([
      ...values.nonRetryableErrors,
      {
        clientId: makeClientId(),
        statusCode: '',
        type: '',
        code: '',
        messageContains: '',
      },
    ]);
  }, [handleNonRetryableErrorsChange, values.nonRetryableErrors]);
  const updateNonRetryableError = useCallback(
    (clientId: string, patch: Partial<NonRetryableErrorVisualEntry>) => {
      handleNonRetryableErrorsChange(
        values.nonRetryableErrors.map((rule) =>
          rule.clientId === clientId ? { ...rule, ...patch } : rule
        )
      );
    },
    [handleNonRetryableErrorsChange, values.nonRetryableErrors]
  );
  const removeNonRetryableError = useCallback(
    (clientId: string) => {
      handleNonRetryableErrorsChange(
        values.nonRetryableErrors.filter((rule) => rule.clientId !== clientId)
      );
    },
    [handleNonRetryableErrorsChange, values.nonRetryableErrors]
  );
  const getNonRetryableError = useCallback(
    (clientId: string, field: 'statusCode' | 'match') =>
      getValidationMessage(t, validationErrors?.[`nonRetryableErrors.${clientId}.${field}`]),
    [t, validationErrors]
  );
  const addErrorResponseRewrite = useCallback(() => {
    handleErrorResponseRewritesChange([
      ...values.errorResponseRewrites,
      {
        clientId: makeClientId(),
        statusCode: '',
        messageContains: '',
        responseStatusCode: '',
        responseBodyEnabled: false,
        responseBody: '{}',
      },
    ]);
  }, [handleErrorResponseRewritesChange, values.errorResponseRewrites]);
  const updateErrorResponseRewrite = useCallback(
    (clientId: string, patch: Partial<ErrorResponseRewriteVisualEntry>) => {
      handleErrorResponseRewritesChange(
        values.errorResponseRewrites.map((rule) =>
          rule.clientId === clientId ? { ...rule, ...patch } : rule
        )
      );
    },
    [handleErrorResponseRewritesChange, values.errorResponseRewrites]
  );
  const removeErrorResponseRewrite = useCallback(
    (clientId: string) => {
      handleErrorResponseRewritesChange(
        values.errorResponseRewrites.filter((rule) => rule.clientId !== clientId)
      );
    },
    [handleErrorResponseRewritesChange, values.errorResponseRewrites]
  );
  const getErrorResponseRewriteError = useCallback(
    (
      clientId: string,
      field: 'statusCode' | 'messageContains' | 'responseStatusCode' | 'responseBody'
    ) => getValidationMessage(t, validationErrors?.[`errorResponseRewrites.${clientId}.${field}`]),
    [t, validationErrors]
  );
  const addAuthModelExclusion = useCallback(() => {
    handleAuthModelExclusionsChange([
      ...values.authModelExclusions,
      {
        clientId: makeClientId(),
        providers: [],
        models: [''],
        priorities: [],
        keywordContains: [],
        disableImageGeneration: false,
      },
    ]);
  }, [handleAuthModelExclusionsChange, values.authModelExclusions]);
  const updateAuthModelExclusion = useCallback(
    (clientId: string, patch: Partial<AuthModelExclusionVisualEntry>) => {
      handleAuthModelExclusionsChange(
        values.authModelExclusions.map((rule) =>
          rule.clientId === clientId ? { ...rule, ...patch } : rule
        )
      );
    },
    [handleAuthModelExclusionsChange, values.authModelExclusions]
  );
  const removeAuthModelExclusion = useCallback(
    (clientId: string) => {
      handleAuthModelExclusionsChange(
        values.authModelExclusions.filter((rule) => rule.clientId !== clientId)
      );
    },
    [handleAuthModelExclusionsChange, values.authModelExclusions]
  );
  const getAuthModelExclusionError = useCallback(
    (clientId: string, field: 'models' | 'priorities' | 'match') =>
      getValidationMessage(t, validationErrors?.[`authModelExclusions.${clientId}.${field}`]),
    [t, validationErrors]
  );
  const handleProxyCheck = useCallback(async () => {
    if (disabled || proxyCheckLoading) return;
    setProxyCheckLoading(true);
    setProxyCheckError('');
    try {
      const result = proxyUrlDirty
        ? await configApi.checkProxyUrl(values.proxyUrl)
        : await configApi.checkSavedProxyUrl();
      setProxyCheckResult(result);
    } catch (error: unknown) {
      setProxyCheckResult(null);
      setProxyCheckError(
        error instanceof Error
          ? error.message
          : t('config_management.visual.sections.network.proxy_check_failed')
      );
    } finally {
      setProxyCheckLoading(false);
    }
  }, [disabled, proxyCheckLoading, proxyUrlDirty, t, values.proxyUrl]);

  useEffect(() => {
    setProxyCheckResult(null);
    setProxyCheckError('');
  }, [values.proxyUrl]);

  const countErrors = useCallback(
    (fields: VisualConfigFieldPath[]) =>
      fields.reduce((total, field) => total + (validationErrors?.[field] ? 1 : 0), 0),
    [validationErrors]
  );
  const authSectionErrorCount = useMemo(
    () =>
      Object.values(codexCustomModelValidationErrors ?? {}).reduce(
        (total, entry) => total + (entry.id ? 1 : 0) + (entry.groups ? 1 : 0),
        0
      ),
    [codexCustomModelValidationErrors]
  );

  const pageErrorCounts = useMemo<Record<ConfigPageId, number>>(
    () => ({
      'global-basics': countErrors(['port', 'rmAccessPath']),
      'global-interface': 0,
      'global-credentials': authModelExclusionsErrorCount,
      'global-network':
        countErrors([
          'requestRetry',
          'maxRetryCredentials',
          'maxRetryInterval',
          'routingFillFirstRange',
          'routingFillFirstPerAuthRpm',
          'routingPerAuthRequestLimit',
          'routingPerAuthRequestWindowMinutes',
        ]) + routingPriorityOverridesErrorCount,
      'global-request':
        nonRetryableErrorsErrorCount +
        errorResponseRewritesErrorCount +
        fixedErrorCooldownsErrorCount +
        countErrors(['noCooldownStatusCodes']) +
        requestBodyErrorCount,
      'global-observability': countErrors([
        'logsMaxTotalSizeMb',
        'logsRetentionDays',
        'usageStatisticsPersistIntervalSeconds',
        'usageStatisticsDetailRetentionDays',
        'usageStatisticsMaxStorageMegabytes',
        'authMaintenance.scanIntervalSeconds',
        'authMaintenance.deleteIntervalSeconds',
        'authMaintenance.deleteStatusCodes',
        'authMaintenance.quotaStrikeThreshold',
        'authMaintenance.disableQuotaStrikeThreshold',
      ]),
      'global-streaming': countErrors([
        'streaming.keepaliveSeconds',
        'streaming.bootstrapRetries',
        'streaming.streamFlushIntervalMs',
        'streaming.streamFlushMinBytes',
        'streaming.nonstreamKeepaliveInterval',
      ]),
      'provider-codex':
        authSectionErrorCount +
        countErrors([
          'codexFingerprintSessionIdentityPoolSize',
          'disabledImageGenerationToolError.statusCode',
          'images.unsupportedStatusCode',
          'images.streamFlushIntervalMs',
          'images.streamFlushMinBytes',
          'images.native.generations.unsupportedModelStatusCode',
          'images.native.edits.unsupportedModelStatusCode',
        ]),
      'provider-antigravity': 0,
      'provider-chatgpt-web':
        chatGptWebSentinelErrorCount +
        countErrors([
          'chatgptWebAutoDeleteDeadPriorities',
          'chatgptWebStrictSize',
          'chatgptWebAspectRatioMaxErrorPercent',
          'chatgptWebMaxResizeEdgePixels',
          'chatgptWebResizeToRequestedSize',
          'chatgptWebResizeFilter',
          'chatgptWebMaxImageResponseMegabytes',
          'chatgptWebMaxN',
          'chatgptWebImageMaxInFlight',
          'chatgptWebImageAdmissionQueueSize',
          'chatgptWebImageAdmissionWaitMilliseconds',
          'chatgptWebImageMaxFinalizers',
          'chatgptWebImageCompletionReserveMegabytes',
          'chatgptWebImageMemoryCapacityMegabytes',
          'chatgptWebImagePollConcurrency',
          'chatgptWebImagePollStallSeconds',
          'chatgptWebImageMemoryFinalizerConcurrency',
        ]),
      'provider-grok': 0,
      'advanced-payload': hasPayloadValidationErrors ? 1 : 0,
    }),
    [
      authModelExclusionsErrorCount,
      authSectionErrorCount,
      countErrors,
      errorResponseRewritesErrorCount,
      fixedErrorCooldownsErrorCount,
      hasPayloadValidationErrors,
      nonRetryableErrorsErrorCount,
      routingPriorityOverridesErrorCount,
      requestBodyErrorCount,
      chatGptWebSentinelErrorCount,
    ]
  );

  const pages = useMemo<VisualPage[]>(
    () =>
      CONFIG_PAGE_DEFINITIONS.map((page) => ({
        ...page,
        title: t(page.titleKey),
        description: t(page.descriptionKey),
        icon: CONFIG_PAGE_ICONS[page.id],
        errorCount: pageErrorCounts[page.id],
        dirty:
          configPageHasDirtyFields(page, dirtyFields) ||
          (page.id === 'global-request' && requestBodyDirty) ||
          (page.id === 'provider-chatgpt-web' && chatGptWebSentinelDirty),
      })),
    [chatGptWebSentinelDirty, dirtyFields, pageErrorCounts, requestBodyDirty, t]
  );

  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0];
  const ActivePageIcon = activePage?.icon;
  const hasValidationIssues = pages.some((page) => page.errorCount > 0);

  useEffect(() => {
    const resolvedSection = resolveConfigSection(sectionParam);
    if (resolvedSection) {
      if (resolvedSection.pageId !== activePageId) setActivePageId(resolvedSection.pageId);
      if (resolvedSection.targetId !== focusTarget) setFocusTarget(resolvedSection.targetId);
      localStorage.setItem('config-management:visual-page', resolvedSection.pageId);
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('section', activePageId);
    setSearchParams(nextParams, { replace: true });
  }, [activePageId, focusTarget, searchParams, sectionParam, setSearchParams]);

  useEffect(() => {
    if (!focusTarget) return undefined;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(focusTarget);
      if (!target) return;
      const focusable = target.matches('input, textarea, select, button')
        ? target
        : target.querySelector<HTMLElement>('input, textarea, select, button, [tabindex]');
      const visibleTarget =
        target.getClientRects().length > 0
          ? target
          : (focusable ?? (target.firstElementChild as HTMLElement | null) ?? target);
      visibleTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
      focusable?.focus({ preventScroll: true });
      visibleTarget.classList.add(styles.searchTargetHighlight);
      window.setTimeout(() => visibleTarget.classList.remove(styles.searchTargetHighlight), 1400);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [activePageId, focusTarget]);

  const handlePageChange = useCallback(
    (pageId: ConfigPageId, targetId?: string) => {
      setActivePageId(pageId);
      setFocusTarget(targetId);
      localStorage.setItem('config-management:visual-page', pageId);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('section', targetId ?? pageId);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const previousErrorCountsRef = useRef(pageErrorCounts);
  useEffect(() => {
    const previous = previousErrorCountsRef.current;
    previousErrorCountsRef.current = pageErrorCounts;
    const newlyInvalidPage = pages.find((page) => page.errorCount > (previous[page.id] ?? 0));
    if (newlyInvalidPage && newlyInvalidPage.id !== activePageId) {
      handlePageChange(newlyInvalidPage.id);
    }
  }, [activePageId, handlePageChange, pageErrorCounts, pages]);

  const normalizedConfigSearchQuery = configSearchQuery.trim().toLocaleLowerCase();
  const configSearchResults = useMemo(() => {
    if (!normalizedConfigSearchQuery) return [];
    const pageMap = new Map(pages.map((page) => [page.id, page]));
    return CONFIG_SEARCH_DEFINITIONS.map((item) => {
      const page = pageMap.get(item.pageId);
      const label = t(item.labelKey);
      const searchText = [
        label,
        page?.title ?? '',
        page?.description ?? '',
        ...item.yamlKeys,
        ...(item.aliases ?? []),
      ]
        .join(' ')
        .toLocaleLowerCase();
      const matchesNestedYamlKey = item.yamlKeys.some((yamlKey) => {
        const normalizedYamlKey = yamlKey.toLocaleLowerCase();
        return (
          normalizedConfigSearchQuery.startsWith(`${normalizedYamlKey}.`) ||
          normalizedConfigSearchQuery.startsWith(`${normalizedYamlKey}[`)
        );
      });
      return {
        item,
        page,
        label,
        matches: searchText.includes(normalizedConfigSearchQuery) || matchesNestedYamlKey,
      };
    })
      .filter((result) => result.matches && result.page)
      .slice(0, 12);
  }, [normalizedConfigSearchQuery, pages, t]);

  const mobilePageOptions = pages.map((page) => {
    const status = [
      page.dirty ? t('config_management.status_dirty_short') : '',
      page.errorCount > 0
        ? `${t('config_management.visual.validation_blocked_short')} (${page.errorCount})`
        : '',
    ].filter(Boolean);
    return {
      value: page.id,
      label: `${t(`config_management.settings_center.groups.${page.group}`)} / ${page.title}${
        status.length > 0 ? ` - ${status.join(', ')}` : ''
      }`,
    };
  });

  const navContent = (
    <nav className={styles.settingsNav} aria-label={t('config_management.settings_center.nav')}>
      {CONFIG_PAGE_GROUPS.map((group) => (
        <div key={group} className={styles.navGroup}>
          <div className={styles.navGroupLabel}>
            {t(`config_management.settings_center.groups.${group}`)}
          </div>
          <div className={styles.navList}>
            {pages
              .filter((page) => page.group === group)
              .map((page) => {
                const Icon = page.icon;
                return (
                  <button
                    key={page.id}
                    type="button"
                    className={`${styles.navButton} ${
                      activePageId === page.id ? styles.navButtonActive : ''
                    }`}
                    onClick={() => handlePageChange(page.id)}
                  >
                    <span className={styles.navIcon}>
                      <Icon size={15} />
                    </span>
                    <span className={styles.navLabel}>{page.title}</span>
                    {page.dirty || page.errorCount > 0 ? (
                      <span className={styles.navMeta}>
                        {page.dirty ? (
                          <span className={styles.navDirty} aria-label="modified" />
                        ) : null}
                        {page.errorCount > 0 ? (
                          <span className={styles.navBadge}>{page.errorCount}</span>
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className={styles.visualEditor}>
      <div className={styles.settingsToolbar}>
        <div className={styles.configSearch}>
          <IconSearch size={16} className={styles.configSearchIcon} />
          <input
            type="search"
            value={configSearchQuery}
            onChange={(event) => setConfigSearchQuery(event.target.value)}
            placeholder={t('config_management.settings_center.search_placeholder')}
            aria-label={t('config_management.settings_center.search_placeholder')}
          />
          {normalizedConfigSearchQuery ? (
            <div className={styles.configSearchResults}>
              {configSearchResults.length > 0 ? (
                configSearchResults.map(({ item, page, label }) => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.configSearchResult}
                    onClick={() => {
                      handlePageChange(item.pageId, item.id);
                      setConfigSearchQuery('');
                    }}
                  >
                    <span className={styles.configSearchResultPath}>
                      {t(`config_management.settings_center.groups.${page?.group}`)} / {page?.title}
                    </span>
                    <span className={styles.configSearchResultLabel}>{label}</span>
                    <code>{item.yamlKeys[0]}</code>
                  </button>
                ))
              ) : (
                <div className={styles.configSearchEmpty}>
                  {t('config_management.settings_center.search_empty')}
                </div>
              )}
            </div>
          ) : null}
        </div>
        {hasValidationIssues ? (
          <span className={styles.validationStatus}>
            {t('config_management.visual.validation.validation_blocked')}
          </span>
        ) : null}
        <div className={styles.mobilePagePicker}>
          <Select
            value={activePageId}
            options={mobilePageOptions}
            ariaLabel={t('config_management.settings_center.nav')}
            onChange={(pageId) => handlePageChange(pageId as ConfigPageId)}
          />
        </div>
      </div>

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>{navContent}</aside>
        <main className={styles.settingsContent}>
          {activePage ? (
            <header className={styles.activePageHeader}>
              <div className={styles.activePageIcon}>
                {ActivePageIcon ? <ActivePageIcon size={17} /> : null}
              </div>
              <div className={styles.activePageCopy}>
                <span className={styles.activePageEyebrow}>
                  {t(`config_management.settings_center.groups.${activePage.group}`)}
                </span>
                <h2>{activePage.title}</h2>
                <p>{activePage.description}</p>
              </div>
              <div className={styles.activePageMeta}>
                {activePage.dirty ? <span>{t('config_management.status_dirty_short')}</span> : null}
                {activePage.errorCount > 0 ? (
                  <span className={styles.activePageError}>{activePage.errorCount}</span>
                ) : null}
              </div>
            </header>
          ) : null}
          <div className={styles.sections}>
            <ConfigSection
              id="config-frontend-features"
              hidden={activePageId !== 'global-interface'}
              icon={<IconEye size={16} />}
              title={t('config_management.settings_center.frontend_features.title')}
              description={t('config_management.settings_center.frontend_features.description')}
            >
              <SectionStack>
                <div className={styles.localPreferenceNotice}>
                  {t('config_management.settings_center.frontend_features.local_only')}
                </div>
                <ToggleRow
                  title={t(
                    'config_management.settings_center.frontend_features.codex_agent_identity'
                  )}
                  description={t(
                    'config_management.settings_center.frontend_features.codex_agent_identity_description'
                  )}
                  checked={codexAgentIdentityConversionVisible}
                  onChange={(visible) =>
                    setFrontendFeatureVisible('codexAgentIdentityConversion', visible)
                  }
                />
              </SectionStack>
            </ConfigSection>

            <div className={styles.requestBodyPanels} hidden={activePageId !== 'global-request'}>
              {renderRequestBodyPanels?.({ focusTarget })}
            </div>

            <section
              id="config-chatgpt-web-auto-relogin"
              className={styles.providerHub}
              hidden={activePageId !== 'provider-chatgpt-web'}
              aria-labelledby="chatgpt-web-provider-hub-title"
            >
              <div className={styles.providerHubHeader}>
                <div>
                  <h3 id="chatgpt-web-provider-hub-title">
                    {t('config_management.settings_center.chatgpt_web.title')}
                  </h3>
                  <p>{t('config_management.settings_center.chatgpt_web.description')}</p>
                </div>
              </div>
              <ToggleRow
                title={t('config_management.settings_center.chatgpt_web.auto_relogin')}
                description={t(
                  'config_management.settings_center.chatgpt_web.auto_relogin_description'
                )}
                checked={values.chatgptWebAutoRelogin}
                disabled={disabled}
                onChange={(chatgptWebAutoRelogin) => onChange({ chatgptWebAutoRelogin })}
              />
              <SettingsDisclosure
                id="config-chatgpt-web-auto-relogin-capacity"
                title={t(
                  'config_management.settings_center.chatgpt_web.auto_relogin_capacity_title'
                )}
                description={t(
                  'config_management.settings_center.chatgpt_web.auto_relogin_capacity_description'
                )}
                summary={t(
                  'config_management.settings_center.chatgpt_web.auto_relogin_capacity_summary',
                  {
                    workers: values.chatgptWebAutoReloginWorkers,
                    queue: values.chatgptWebAutoReloginQueueSize,
                    manual: values.chatgptWebManualReloginConcurrency,
                  }
                )}
                focusTarget={focusTarget}
                targetIds={[
                  'config-chatgpt-web-auto-relogin-workers',
                  'config-chatgpt-web-auto-relogin-queue-size',
                  'config-chatgpt-web-manual-relogin-concurrency',
                ]}
                dirty={hasDirtyConfigField(dirtyFields, [
                  'chatgptWebAutoReloginWorkers',
                  'chatgptWebAutoReloginQueueSize',
                  'chatgptWebManualReloginConcurrency',
                ])}
                errorCount={
                  Number(Boolean(chatGptWebAutoReloginWorkersError)) +
                  Number(Boolean(chatGptWebAutoReloginQueueSizeError)) +
                  Number(Boolean(chatGptWebManualReloginConcurrencyError))
                }
              >
                <SectionGrid>
                  <Input
                    id="config-chatgpt-web-auto-relogin-workers"
                    type="number"
                    min={1}
                    max={256}
                    step={1}
                    label={t('config_management.settings_center.chatgpt_web.auto_relogin_workers')}
                    hint={t(
                      'config_management.settings_center.chatgpt_web.auto_relogin_workers_description'
                    )}
                    error={chatGptWebAutoReloginWorkersError}
                    value={values.chatgptWebAutoReloginWorkers}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({ chatgptWebAutoReloginWorkers: event.target.value })
                    }
                  />
                  <Input
                    id="config-chatgpt-web-auto-relogin-queue-size"
                    type="number"
                    min={1}
                    max={1_000_000}
                    step={1}
                    label={t(
                      'config_management.settings_center.chatgpt_web.auto_relogin_queue_size'
                    )}
                    hint={t(
                      'config_management.settings_center.chatgpt_web.auto_relogin_queue_size_description'
                    )}
                    error={chatGptWebAutoReloginQueueSizeError}
                    value={values.chatgptWebAutoReloginQueueSize}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({ chatgptWebAutoReloginQueueSize: event.target.value })
                    }
                  />
                  <Input
                    id="config-chatgpt-web-manual-relogin-concurrency"
                    type="number"
                    min={1}
                    step={1}
                    label={t(
                      'config_management.settings_center.chatgpt_web.manual_relogin_concurrency'
                    )}
                    hint={t(
                      'config_management.settings_center.chatgpt_web.manual_relogin_concurrency_description'
                    )}
                    error={chatGptWebManualReloginConcurrencyError}
                    value={values.chatgptWebManualReloginConcurrency}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({ chatgptWebManualReloginConcurrency: event.target.value })
                    }
                  />
                </SectionGrid>
              </SettingsDisclosure>
              <div id="config-chatgpt-web-api798-auto-login">
                <ToggleRow
                  title={t('config_management.settings_center.chatgpt_web.api798_auto_login')}
                  description={t(
                    'config_management.settings_center.chatgpt_web.api798_auto_login_description'
                  )}
                  checked={values.chatgptWebApi798AutoLoginEnabled}
                  disabled={disabled}
                  onChange={(chatgptWebApi798AutoLoginEnabled) =>
                    onChange({ chatgptWebApi798AutoLoginEnabled })
                  }
                />
              </div>
              <div id="config-chatgpt-web-session-cookie-refresh-on-token-failure">
                <ToggleRow
                  title={t(
                    'config_management.settings_center.chatgpt_web.session_cookie_refresh_on_token_failure'
                  )}
                  description={t(
                    'config_management.settings_center.chatgpt_web.session_cookie_refresh_on_token_failure_description'
                  )}
                  checked={values.chatgptWebSessionCookieRefreshOnTokenFailure}
                  disabled={disabled}
                  onChange={(chatgptWebSessionCookieRefreshOnTokenFailure) =>
                    onChange({ chatgptWebSessionCookieRefreshOnTokenFailure })
                  }
                />
              </div>
              <div id="config-chatgpt-web-force-session-refresh-on-import">
                <ToggleRow
                  title={t(
                    'config_management.settings_center.chatgpt_web.force_session_refresh_on_import'
                  )}
                  description={t(
                    'config_management.settings_center.chatgpt_web.force_session_refresh_on_import_description'
                  )}
                  checked={values.chatgptWebForceSessionRefreshOnImport}
                  disabled={disabled}
                  onChange={(chatgptWebForceSessionRefreshOnImport) =>
                    onChange({ chatgptWebForceSessionRefreshOnImport })
                  }
                />
              </div>
              <div id="config-chatgpt-web-auto-delete-dead">
                <ToggleRow
                  title={t('config_management.settings_center.chatgpt_web.auto_delete_dead_auths')}
                  description={t(
                    'config_management.settings_center.chatgpt_web.auto_delete_dead_auths_description'
                  )}
                  checked={values.chatgptWebAutoDeleteDeadAuths}
                  disabled={disabled}
                  onChange={(chatgptWebAutoDeleteDeadAuths) =>
                    onChange({ chatgptWebAutoDeleteDeadAuths })
                  }
                />
                <div id="config-chatgpt-web-invalid-passkey-response-as-dead">
                  <ToggleRow
                    title={t(
                      'config_management.settings_center.chatgpt_web.invalid_passkey_response_as_dead'
                    )}
                    description={t(
                      'config_management.settings_center.chatgpt_web.invalid_passkey_response_as_dead_description'
                    )}
                    checked={values.chatgptWebInvalidPasskeyResponseAsDead}
                    disabled={disabled}
                    onChange={(chatgptWebInvalidPasskeyResponseAsDead) =>
                      onChange({ chatgptWebInvalidPasskeyResponseAsDead })
                    }
                  />
                </div>
                <div className={styles.autoDeleteRuntimeCount} role="status" aria-live="polite">
                  <span>
                    {t(
                      'config_management.settings_center.chatgpt_web.auto_delete_dead_runtime_count'
                    )}
                  </span>
                  <strong>
                    {chatGptWebAutoDeletedCount === null
                      ? '—'
                      : chatGptWebAutoDeletedCount.toLocaleString()}
                  </strong>
                  <small>
                    {t(
                      'config_management.settings_center.chatgpt_web.auto_delete_dead_runtime_count_hint'
                    )}
                  </small>
                </div>
                <div id="config-chatgpt-web-auto-delete-dead-priorities">
                  <FieldShell
                    label={t(
                      'config_management.settings_center.chatgpt_web.auto_delete_dead_priorities'
                    )}
                    hint={t(
                      'config_management.settings_center.chatgpt_web.auto_delete_dead_priorities_description'
                    )}
                    error={chatGptWebAutoDeleteDeadPrioritiesError}
                  >
                    <TagListEditor
                      value={values.chatgptWebAutoDeleteDeadPriorities}
                      disabled={disabled}
                      placeholder={t(
                        'config_management.settings_center.chatgpt_web.auto_delete_dead_priorities_placeholder'
                      )}
                      emptyLabel={t(
                        'config_management.settings_center.chatgpt_web.auto_delete_dead_priorities_empty'
                      )}
                      onChange={(chatgptWebAutoDeleteDeadPriorities) =>
                        onChange({ chatgptWebAutoDeleteDeadPriorities })
                      }
                    />
                  </FieldShell>
                </div>
              </div>
              <SectionGrid>
                <Input
                  id="config-chatgpt-web-image-upstream-model"
                  label={t('config_management.settings_center.chatgpt_web.image_upstream_model')}
                  hint={t(
                    'config_management.settings_center.chatgpt_web.image_upstream_model_description'
                  )}
                  placeholder="gpt-5-5"
                  value={values.chatgptWebImageUpstreamModel}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({ chatgptWebImageUpstreamModel: event.target.value })
                  }
                />
              </SectionGrid>
              <ToggleRow
                title={t(
                  'config_management.settings_center.chatgpt_web.ignore_unsupported_image_params'
                )}
                description={t(
                  'config_management.settings_center.chatgpt_web.ignore_unsupported_image_params_description'
                )}
                checked={values.chatgptWebIgnoreUnsupportedImageParams}
                disabled={disabled}
                onChange={(chatgptWebIgnoreUnsupportedImageParams) =>
                  onChange({ chatgptWebIgnoreUnsupportedImageParams })
                }
              />
              <div id="config-chatgpt-web-normalize-image-mime">
                <ToggleRow
                  title={t(
                    'config_management.settings_center.chatgpt_web.normalize_mismatched_image_mime'
                  )}
                  description={t(
                    'config_management.settings_center.chatgpt_web.normalize_mismatched_image_mime_description'
                  )}
                  checked={values.chatgptWebNormalizeMismatchedImageMime}
                  disabled={disabled}
                  onChange={(chatgptWebNormalizeMismatchedImageMime) =>
                    onChange({ chatgptWebNormalizeMismatchedImageMime })
                  }
                />
              </div>
              <SettingsDisclosure
                id="config-chatgpt-web-remote-image-url"
                title={t('config_management.settings_center.chatgpt_web.remote_image_url_title')}
                description={t(
                  'config_management.settings_center.chatgpt_web.remote_image_url_description'
                )}
                summary={t(
                  values.chatgptWebRemoteImageUrlEnabled
                    ? values.chatgptWebRemoteImageUrlDownloadMode === 'credential-proxy'
                      ? 'config_management.settings_center.chatgpt_web.remote_image_url_status_proxy'
                      : 'config_management.settings_center.chatgpt_web.remote_image_url_status_direct'
                    : 'config_management.settings_center.status_disabled'
                )}
                focusTarget={focusTarget}
                targetIds={[
                  'config-chatgpt-web-remote-image-url-enabled',
                  'config-chatgpt-web-remote-image-url-download-mode',
                  'config-chatgpt-web-normalize-remote-image-mime',
                ]}
                dirty={chatGptWebRemoteImageDirty}
              >
                <SectionStack>
                  <div id="config-chatgpt-web-remote-image-url-enabled">
                    <ToggleRow
                      title={t(
                        'config_management.settings_center.chatgpt_web.remote_image_url_enabled'
                      )}
                      description={t(
                        'config_management.settings_center.chatgpt_web.remote_image_url_enabled_description'
                      )}
                      checked={values.chatgptWebRemoteImageUrlEnabled}
                      disabled={disabled}
                      onChange={(chatgptWebRemoteImageUrlEnabled) =>
                        onChange({ chatgptWebRemoteImageUrlEnabled })
                      }
                    />
                  </div>
                  <FieldShell
                    label={t(
                      'config_management.settings_center.chatgpt_web.remote_image_url_download_mode'
                    )}
                    htmlFor="config-chatgpt-web-remote-image-url-download-mode"
                    hint={t(
                      'config_management.settings_center.chatgpt_web.remote_image_url_download_mode_description'
                    )}
                  >
                    <Select
                      id="config-chatgpt-web-remote-image-url-download-mode"
                      value={values.chatgptWebRemoteImageUrlDownloadMode}
                      options={chatGptWebRemoteImageDownloadModeOptions}
                      disabled={disabled || !values.chatgptWebRemoteImageUrlEnabled}
                      onChange={(chatgptWebRemoteImageUrlDownloadMode) =>
                        onChange({
                          chatgptWebRemoteImageUrlDownloadMode:
                            chatgptWebRemoteImageUrlDownloadMode === 'credential-proxy'
                              ? 'credential-proxy'
                              : 'direct',
                        })
                      }
                    />
                  </FieldShell>
                  <div id="config-chatgpt-web-normalize-remote-image-mime">
                    <ToggleRow
                      title={t(
                        'config_management.settings_center.chatgpt_web.normalize_remote_image_mime'
                      )}
                      description={t(
                        'config_management.settings_center.chatgpt_web.normalize_remote_image_mime_description'
                      )}
                      checked={values.chatgptWebNormalizeRemoteImageMime}
                      disabled={disabled || !values.chatgptWebNormalizeMismatchedImageMime}
                      onChange={(chatgptWebNormalizeRemoteImageMime) =>
                        onChange({ chatgptWebNormalizeRemoteImageMime })
                      }
                    />
                  </div>
                  <div className={styles.localPreferenceNotice}>
                    {t(
                      'config_management.settings_center.chatgpt_web.remote_image_url_security_notice'
                    )}
                  </div>
                </SectionStack>
              </SettingsDisclosure>
              <SettingsDisclosure
                id="config-chatgpt-web-image-size"
                title={t('config_management.settings_center.chatgpt_web.image_size_title')}
                description={t(
                  'config_management.settings_center.chatgpt_web.image_size_description'
                )}
                summary={
                  <>
                    <span>
                      {t(
                        values.chatgptWebStrictSize
                          ? 'config_management.settings_center.chatgpt_web.image_size_status_strict'
                          : values.chatgptWebAdaptSizeToAspectRatio
                            ? 'config_management.settings_center.chatgpt_web.image_size_status_adapted'
                            : 'config_management.settings_center.status_disabled'
                      )}
                    </span>
                    <span>
                      {' · '}
                      {t(
                        'config_management.settings_center.chatgpt_web.image_size_status_max_n'
                      )}{' '}
                      {values.chatgptWebMaxN}
                    </span>
                  </>
                }
                focusTarget={focusTarget}
                targetIds={[
                  'config-chatgpt-web-adapt-size-to-aspect-ratio',
                  'config-chatgpt-web-strict-size',
                  'config-chatgpt-web-aspect-ratio-max-error-percent',
                  'config-chatgpt-web-max-resize-edge-pixels',
                  'config-chatgpt-web-resize-to-requested-size',
                  'config-chatgpt-web-resize-filter',
                  'config-chatgpt-web-max-image-response-megabytes',
                  'config-chatgpt-web-max-n',
                ]}
                dirty={chatGptWebImageSizeDirty}
                errorCount={chatGptWebImageSizeErrorCount}
              >
                <SectionStack>
                  <div id="config-chatgpt-web-adapt-size-to-aspect-ratio">
                    <ToggleRow
                      title={t(
                        'config_management.settings_center.chatgpt_web.adapt_size_to_aspect_ratio'
                      )}
                      description={t(
                        'config_management.settings_center.chatgpt_web.adapt_size_to_aspect_ratio_description'
                      )}
                      checked={values.chatgptWebAdaptSizeToAspectRatio}
                      disabled={disabled}
                      onChange={(chatgptWebAdaptSizeToAspectRatio) =>
                        onChange({
                          chatgptWebAdaptSizeToAspectRatio,
                          ...(chatgptWebAdaptSizeToAspectRatio
                            ? {}
                            : {
                                chatgptWebStrictSize: false,
                                chatgptWebResizeToRequestedSize: false,
                              }),
                        })
                      }
                    />
                  </div>
                  <div id="config-chatgpt-web-strict-size">
                    <ToggleRow
                      title={t('config_management.settings_center.chatgpt_web.strict_size')}
                      description={t(
                        'config_management.settings_center.chatgpt_web.strict_size_description'
                      )}
                      checked={values.chatgptWebStrictSize}
                      disabled={disabled || !values.chatgptWebAdaptSizeToAspectRatio}
                      onChange={(chatgptWebStrictSize) => onChange({ chatgptWebStrictSize })}
                    />
                    {chatGptWebStrictSizeError ? (
                      <div className="error-box">{chatGptWebStrictSizeError}</div>
                    ) : null}
                  </div>
                  <SectionGrid>
                    <Input
                      id="config-chatgpt-web-aspect-ratio-max-error-percent"
                      type="number"
                      min={0}
                      max={10}
                      step={0.1}
                      label={t(
                        'config_management.settings_center.chatgpt_web.aspect_ratio_max_error_percent'
                      )}
                      hint={t(
                        'config_management.settings_center.chatgpt_web.aspect_ratio_max_error_percent_description'
                      )}
                      error={chatGptWebAspectRatioMaxErrorPercentError}
                      value={values.chatgptWebAspectRatioMaxErrorPercent}
                      disabled={disabled || !values.chatgptWebAdaptSizeToAspectRatio}
                      onChange={(event) =>
                        onChange({ chatgptWebAspectRatioMaxErrorPercent: event.target.value })
                      }
                    />
                    <Input
                      id="config-chatgpt-web-max-resize-edge-pixels"
                      type="number"
                      min={1}
                      max={3840}
                      step={1}
                      label={t(
                        'config_management.settings_center.chatgpt_web.max_resize_edge_pixels'
                      )}
                      hint={t(
                        'config_management.settings_center.chatgpt_web.max_resize_edge_pixels_description'
                      )}
                      error={chatGptWebMaxResizeEdgePixelsError}
                      value={values.chatgptWebMaxResizeEdgePixels}
                      disabled={disabled || !values.chatgptWebAdaptSizeToAspectRatio}
                      onChange={(event) =>
                        onChange({ chatgptWebMaxResizeEdgePixels: event.target.value })
                      }
                    />
                  </SectionGrid>
                  <div id="config-chatgpt-web-resize-to-requested-size">
                    <ToggleRow
                      title={t(
                        'config_management.settings_center.chatgpt_web.resize_to_requested_size'
                      )}
                      description={t(
                        'config_management.settings_center.chatgpt_web.resize_to_requested_size_description'
                      )}
                      checked={values.chatgptWebResizeToRequestedSize}
                      disabled={disabled || !values.chatgptWebAdaptSizeToAspectRatio}
                      onChange={(chatgptWebResizeToRequestedSize) =>
                        onChange({ chatgptWebResizeToRequestedSize })
                      }
                    />
                    {chatGptWebResizeToRequestedSizeError ? (
                      <div className="error-box">{chatGptWebResizeToRequestedSizeError}</div>
                    ) : null}
                  </div>
                  <SectionGrid>
                    <FieldShell
                      label={t('config_management.settings_center.chatgpt_web.resize_filter')}
                      htmlFor="config-chatgpt-web-resize-filter"
                      hint={t(
                        'config_management.settings_center.chatgpt_web.resize_filter_description'
                      )}
                      error={chatGptWebResizeFilterError}
                    >
                      <Select
                        id="config-chatgpt-web-resize-filter"
                        value={values.chatgptWebResizeFilter}
                        options={chatGptWebResizeFilterOptions}
                        disabled={
                          disabled ||
                          !values.chatgptWebAdaptSizeToAspectRatio ||
                          !values.chatgptWebResizeToRequestedSize
                        }
                        onChange={(chatgptWebResizeFilter) => onChange({ chatgptWebResizeFilter })}
                      />
                    </FieldShell>
                    <Input
                      id="config-chatgpt-web-max-image-response-megabytes"
                      type="number"
                      min={1}
                      max={256}
                      step={1}
                      label={t(
                        'config_management.settings_center.chatgpt_web.max_image_response_megabytes'
                      )}
                      hint={t(
                        'config_management.settings_center.chatgpt_web.max_image_response_megabytes_description'
                      )}
                      error={chatGptWebMaxImageResponseMegabytesError}
                      value={values.chatgptWebMaxImageResponseMegabytes}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({ chatgptWebMaxImageResponseMegabytes: event.target.value })
                      }
                    />
                    <Input
                      id="config-chatgpt-web-max-n"
                      type="number"
                      min={1}
                      max={10}
                      step={1}
                      label={t('config_management.settings_center.chatgpt_web.max_n')}
                      hint={t('config_management.settings_center.chatgpt_web.max_n_description')}
                      error={chatGptWebMaxNError}
                      value={values.chatgptWebMaxN}
                      disabled={disabled}
                      onChange={(event) => onChange({ chatgptWebMaxN: event.target.value })}
                    />
                  </SectionGrid>
                </SectionStack>
              </SettingsDisclosure>
              <SettingsDisclosure
                id="config-chatgpt-web-image-capacity"
                title={t('config_management.settings_center.chatgpt_web.image_capacity_title')}
                description={t(
                  'config_management.settings_center.chatgpt_web.image_capacity_description'
                )}
                summary={t('config_management.settings_center.chatgpt_web.image_capacity_summary', {
                  inFlight: values.chatgptWebImageMaxInFlight,
                  queue: values.chatgptWebImageAdmissionQueueSize,
                })}
                focusTarget={focusTarget}
                targetIds={[
                  'config-chatgpt-web-image-max-in-flight',
                  'config-chatgpt-web-image-admission-queue-size',
                  'config-chatgpt-web-image-admission-wait-milliseconds',
                  'config-chatgpt-web-image-max-finalizers',
                  'config-chatgpt-web-image-completion-reserve-megabytes',
                  'config-chatgpt-web-image-memory-capacity-megabytes',
                  'config-chatgpt-web-image-poll-concurrency',
                  'config-chatgpt-web-image-poll-stall-breaker-enabled',
                  'config-chatgpt-web-image-poll-stall-seconds',
                  'config-chatgpt-web-image-memory-finalizer-concurrency',
                ]}
                dirty={chatGptWebImageCapacityDirty}
                errorCount={chatGptWebImageCapacityErrorCount}
              >
                <SectionStack>
                  <SectionGrid>
                    <Input
                      id="config-chatgpt-web-image-memory-capacity-megabytes"
                      type="number"
                      min={1}
                      step={1}
                      label={t(
                        'config_management.settings_center.chatgpt_web.image_memory_capacity_megabytes'
                      )}
                      hint={t(
                        'config_management.settings_center.chatgpt_web.image_memory_capacity_megabytes_description'
                      )}
                      error={chatGptWebImageMemoryCapacityMegabytesError}
                      value={values.chatgptWebImageMemoryCapacityMegabytes}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({
                          chatgptWebImageMemoryCapacityMegabytes: event.target.value,
                        })
                      }
                    />
                    <Input
                      id="config-chatgpt-web-image-max-in-flight"
                      type="number"
                      min={1}
                      step={1}
                      label={t('config_management.settings_center.chatgpt_web.image_max_in_flight')}
                      hint={t(
                        'config_management.settings_center.chatgpt_web.image_max_in_flight_description'
                      )}
                      error={chatGptWebImageMaxInFlightError}
                      value={values.chatgptWebImageMaxInFlight}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({ chatgptWebImageMaxInFlight: event.target.value })
                      }
                    />
                    <Input
                      id="config-chatgpt-web-image-poll-concurrency"
                      type="number"
                      min={1}
                      step={1}
                      label={t(
                        'config_management.settings_center.chatgpt_web.image_poll_concurrency'
                      )}
                      hint={t(
                        'config_management.settings_center.chatgpt_web.image_poll_concurrency_description'
                      )}
                      error={chatGptWebImagePollConcurrencyError}
                      value={values.chatgptWebImagePollConcurrency}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({ chatgptWebImagePollConcurrency: event.target.value })
                      }
                    />
                    <div id="config-chatgpt-web-image-poll-stall-breaker-enabled">
                      <ToggleRow
                        title={t(
                          'config_management.settings_center.chatgpt_web.image_poll_stall_breaker_enabled'
                        )}
                        description={t(
                          'config_management.settings_center.chatgpt_web.image_poll_stall_breaker_enabled_description'
                        )}
                        checked={values.chatgptWebImagePollStallBreakerEnabled}
                        disabled={disabled}
                        onChange={(chatgptWebImagePollStallBreakerEnabled) =>
                          onChange({ chatgptWebImagePollStallBreakerEnabled })
                        }
                      />
                    </div>
                    <Input
                      id="config-chatgpt-web-image-poll-stall-seconds"
                      type="number"
                      min={30}
                      max={3600}
                      step={1}
                      label={t(
                        'config_management.settings_center.chatgpt_web.image_poll_stall_seconds'
                      )}
                      hint={t(
                        'config_management.settings_center.chatgpt_web.image_poll_stall_seconds_description'
                      )}
                      error={chatGptWebImagePollStallSecondsError}
                      value={values.chatgptWebImagePollStallSeconds}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({ chatgptWebImagePollStallSeconds: event.target.value })
                      }
                    />
                    <Input
                      id="config-chatgpt-web-image-admission-queue-size"
                      type="number"
                      min={0}
                      step={1}
                      label={t(
                        'config_management.settings_center.chatgpt_web.image_admission_queue_size'
                      )}
                      hint={t(
                        'config_management.settings_center.chatgpt_web.image_admission_queue_size_description'
                      )}
                      error={chatGptWebImageAdmissionQueueSizeError}
                      value={values.chatgptWebImageAdmissionQueueSize}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({ chatgptWebImageAdmissionQueueSize: event.target.value })
                      }
                    />
                    <Input
                      id="config-chatgpt-web-image-admission-wait-milliseconds"
                      type="number"
                      min={0}
                      step={1}
                      label={t(
                        'config_management.settings_center.chatgpt_web.image_admission_wait_milliseconds'
                      )}
                      hint={t(
                        'config_management.settings_center.chatgpt_web.image_admission_wait_milliseconds_description'
                      )}
                      error={chatGptWebImageAdmissionWaitMillisecondsError}
                      value={values.chatgptWebImageAdmissionWaitMilliseconds}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({
                          chatgptWebImageAdmissionWaitMilliseconds: event.target.value,
                        })
                      }
                    />
                    <Input
                      id="config-chatgpt-web-image-max-finalizers"
                      type="number"
                      min={1}
                      step={1}
                      label={t(
                        'config_management.settings_center.chatgpt_web.image_max_finalizers'
                      )}
                      hint={t(
                        'config_management.settings_center.chatgpt_web.image_max_finalizers_description'
                      )}
                      error={chatGptWebImageMaxFinalizersError}
                      value={values.chatgptWebImageMaxFinalizers}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({ chatgptWebImageMaxFinalizers: event.target.value })
                      }
                    />
                    <Input
                      id="config-chatgpt-web-image-completion-reserve-megabytes"
                      type="number"
                      min={0}
                      step={1}
                      label={t(
                        'config_management.settings_center.chatgpt_web.image_completion_reserve_megabytes'
                      )}
                      hint={t(
                        'config_management.settings_center.chatgpt_web.image_completion_reserve_megabytes_description'
                      )}
                      error={chatGptWebImageCompletionReserveMegabytesError}
                      value={values.chatgptWebImageCompletionReserveMegabytes}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({
                          chatgptWebImageCompletionReserveMegabytes: event.target.value,
                        })
                      }
                    />
                    <Input
                      id="config-chatgpt-web-image-memory-finalizer-concurrency"
                      type="number"
                      min={1}
                      step={1}
                      label={t(
                        'config_management.settings_center.chatgpt_web.image_memory_finalizer_concurrency'
                      )}
                      hint={t(
                        'config_management.settings_center.chatgpt_web.image_memory_finalizer_concurrency_description'
                      )}
                      error={chatGptWebImageMemoryFinalizerConcurrencyError}
                      value={values.chatgptWebImageMemoryFinalizerConcurrency}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({
                          chatgptWebImageMemoryFinalizerConcurrency: event.target.value,
                        })
                      }
                    />
                  </SectionGrid>
                </SectionStack>
              </SettingsDisclosure>
              <div className={styles.providerHubActions}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/ai-providers/chatgpt-web')}
                >
                  {t('config_management.settings_center.chatgpt_web.login_tasks')}
                  <IconExternalLink size={15} />
                </Button>
              </div>
            </section>

            <div
              className={styles.providerSidecarPanels}
              hidden={activePageId !== 'provider-chatgpt-web'}
            >
              {renderChatGptWebSentinel?.({
                active: activePageId === 'provider-chatgpt-web',
                focusTarget,
              })}
            </div>

            <section
              id="config-grok-auth"
              className={styles.providerHub}
              hidden={activePageId !== 'provider-grok'}
              aria-labelledby="grok-provider-hub-title"
            >
              <div className={styles.providerHubHeader}>
                <div>
                  <h3 id="grok-provider-hub-title">
                    {t('config_management.settings_center.grok.title')}
                  </h3>
                  <p>{t('config_management.settings_center.grok.description')}</p>
                </div>
              </div>
              <div className={styles.providerHubActions}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/oauth?provider=xai')}
                >
                  {t('config_management.settings_center.grok.oauth')}
                  <IconExternalLink size={15} />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/auth-files?provider=xai')}
                >
                  {t('config_management.settings_center.grok.auth_files')}
                  <IconExternalLink size={15} />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/quota?provider=xai')}
                >
                  {t('config_management.settings_center.grok.quota')}
                  <IconExternalLink size={15} />
                </Button>
              </div>
            </section>

            <ConfigSection
              id="server"
              hidden={activePageId !== 'global-basics'}
              icon={<IconSettings size={16} />}
              title={t('config_management.visual.sections.server.title')}
              description={t('config_management.visual.sections.server.description')}
            >
              <SectionGrid>
                <Input
                  id="config-host"
                  label={t('config_management.visual.sections.server.host')}
                  placeholder="0.0.0.0"
                  value={values.host}
                  onChange={(e) => onChange({ host: e.target.value })}
                  disabled={disabled}
                />
                <Input
                  id="config-port"
                  label={t('config_management.visual.sections.server.port')}
                  type="number"
                  placeholder="8317"
                  value={values.port}
                  onChange={(e) => onChange({ port: e.target.value })}
                  disabled={disabled}
                  error={portError}
                />
              </SectionGrid>
            </ConfigSection>

            <ConfigSection
              id="config-tls"
              hidden={activePageId !== 'global-basics'}
              icon={<IconShield size={16} />}
              title={t('config_management.visual.sections.tls.title')}
              description={t('config_management.visual.sections.tls.description')}
            >
              <SectionStack>
                <ToggleRow
                  title={t('config_management.visual.sections.tls.enable')}
                  description={t('config_management.visual.sections.tls.enable_desc')}
                  checked={values.tlsEnable}
                  disabled={disabled}
                  onChange={(tlsEnable) => onChange({ tlsEnable })}
                />

                {values.tlsEnable ? (
                  <>
                    <Divider />
                    <SectionGrid>
                      <Input
                        label={t('config_management.visual.sections.tls.cert')}
                        placeholder="/path/to/cert.pem"
                        value={values.tlsCert}
                        onChange={(e) => onChange({ tlsCert: e.target.value })}
                        disabled={disabled}
                      />
                      <Input
                        label={t('config_management.visual.sections.tls.key')}
                        placeholder="/path/to/key.pem"
                        value={values.tlsKey}
                        onChange={(e) => onChange({ tlsKey: e.target.value })}
                        disabled={disabled}
                      />
                    </SectionGrid>
                  </>
                ) : null}
              </SectionStack>
            </ConfigSection>

            <ConfigSection
              id="config-remote-management"
              hidden={activePageId !== 'global-basics'}
              icon={<IconSatellite size={16} />}
              title={t('config_management.visual.sections.remote.title')}
              description={t('config_management.visual.sections.remote.description')}
            >
              <SectionStack>
                <ToggleRow
                  title={t('config_management.visual.sections.remote.allow_remote')}
                  description={t('config_management.visual.sections.remote.allow_remote_desc')}
                  checked={values.rmAllowRemote}
                  disabled={disabled}
                  onChange={(rmAllowRemote) => onChange({ rmAllowRemote })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.remote.disable_panel')}
                  description={t('config_management.visual.sections.remote.disable_panel_desc')}
                  checked={values.rmDisableControlPanel}
                  disabled={disabled}
                  onChange={(rmDisableControlPanel) => onChange({ rmDisableControlPanel })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.remote.auth_files_pagination')}
                  description={t(
                    'config_management.visual.sections.remote.auth_files_pagination_desc'
                  )}
                  checked={values.rmAuthFilesPagination}
                  disabled={disabled}
                  onChange={(rmAuthFilesPagination) => onChange({ rmAuthFilesPagination })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.remote.live_logs')}
                  description={t('config_management.visual.sections.remote.live_logs_desc')}
                  checked={values.rmLiveLogs}
                  disabled={disabled}
                  onChange={(rmLiveLogs) => onChange({ rmLiveLogs })}
                />
                <FieldShell
                  label={t('config_management.visual.sections.remote.diagnostics_detail_level')}
                  htmlFor="config-management-diagnostics-detail-level"
                  hint={t('config_management.visual.sections.remote.diagnostics_detail_level_desc')}
                >
                  <Select
                    id="config-management-diagnostics-detail-level"
                    value={values.rmDiagnosticsDetailLevel}
                    options={managementDiagnosticsDetailOptions}
                    disabled={disabled}
                    onChange={(rmDiagnosticsDetailLevel) =>
                      onChange({
                        rmDiagnosticsDetailLevel:
                          rmDiagnosticsDetailLevel === 'full' ? 'full' : 'safe',
                      })
                    }
                  />
                </FieldShell>
                {values.rmDiagnosticsDetailLevel === 'full' ? (
                  <div className={styles.diagnosticsRiskNotice}>
                    {t('config_management.visual.sections.remote.diagnostics_detail_full_warning')}
                  </div>
                ) : null}
                <SectionGrid>
                  <Input
                    label={t('config_management.visual.sections.remote.access_path')}
                    placeholder={t(
                      'config_management.visual.sections.remote.access_path_placeholder'
                    )}
                    value={values.rmAccessPath}
                    onChange={(e) => onChange({ rmAccessPath: e.target.value })}
                    disabled={disabled}
                    hint={t('config_management.visual.sections.remote.access_path_hint')}
                    error={rmAccessPathError}
                  />
                  <Input
                    label={t('config_management.visual.sections.remote.panel_repo')}
                    placeholder="https://github.com/router-for-me/Cli-Proxy-API-Management-Center"
                    value={values.rmPanelRepo}
                    onChange={(e) => onChange({ rmPanelRepo: e.target.value })}
                    disabled={disabled}
                  />
                </SectionGrid>
              </SectionStack>
            </ConfigSection>

            <ConfigSection
              id="auth"
              hidden={!['global-credentials', 'provider-codex'].includes(activePageId)}
              icon={<IconKey size={16} />}
              title={t(
                activePageId === 'provider-codex'
                  ? 'config_management.settings_center.subsections.codex_models_tools'
                  : 'config_management.visual.sections.auth.title'
              )}
              description={t(
                activePageId === 'provider-codex'
                  ? 'config_management.settings_center.subsections.codex_models_tools_desc'
                  : 'config_management.visual.sections.auth.description'
              )}
            >
              <SectionStack>
                <PageGroup active={activePageId === 'global-credentials'}>
                  <SettingsDisclosure
                    id="config-credential-access"
                    title={t(
                      'config_management.settings_center.disclosures.credential_access.title'
                    )}
                    description={t(
                      'config_management.settings_center.disclosures.credential_access.description'
                    )}
                    focusTarget={focusTarget}
                    targetIds={['config-management-key', 'config-auth-dir']}
                    dirty={credentialAccessDirty}
                  >
                    <SectionGrid>
                      <Input
                        id="config-management-key"
                        label={t('config_management.visual.sections.remote.secret_key')}
                        type="password"
                        placeholder={t(
                          'config_management.visual.sections.remote.secret_key_placeholder'
                        )}
                        value={values.rmSecretKey}
                        onChange={(e) => onChange({ rmSecretKey: e.target.value })}
                        disabled={disabled}
                      />
                      <Input
                        id="config-auth-dir"
                        label={t('config_management.visual.sections.auth.auth_dir')}
                        placeholder="~/.cli-proxy-api"
                        value={values.authDir}
                        onChange={(e) => onChange({ authDir: e.target.value })}
                        disabled={disabled}
                        hint={t('config_management.visual.sections.auth.auth_dir_hint')}
                      />
                    </SectionGrid>
                  </SettingsDisclosure>
                  <SettingsDisclosure
                    id="config-api-keys"
                    title={t('config_management.settings_center.disclosures.api_keys.title')}
                    description={t(
                      'config_management.settings_center.disclosures.api_keys.description'
                    )}
                    focusTarget={focusTarget}
                    dirty={apiKeysDirty}
                  >
                    <ApiKeysCardEditor
                      value={values.apiKeysText}
                      savedValue={baselineValues.apiKeysText}
                      disabled={disabled}
                      active={activePageId === 'global-credentials'}
                      onChange={handleApiKeysTextChange}
                    />
                  </SettingsDisclosure>
                </PageGroup>
                <PageGroup active={activePageId === 'provider-codex'}>
                  <SectionSubsection
                    title={t('config_management.visual.codex_custom_models.title')}
                    description={t('config_management.visual.codex_custom_models.description')}
                  >
                    <div id="config-codex-custom-models">
                      <CodexCustomModelsEditor
                        value={values.codexCustomModels}
                        validationErrors={codexCustomModelValidationErrors}
                        disabled={disabled}
                        onChange={handleCodexCustomModelsChange}
                      />
                    </div>
                  </SectionSubsection>
                </PageGroup>
                <PageGroup active={activePageId === 'global-credentials'}>
                  <SettingsDisclosure
                    id="config-auth-model-exclusions"
                    title={t('config_management.visual.sections.auth.auth_model_exclusions')}
                    description={t(
                      'config_management.visual.sections.auth.auth_model_exclusions_desc'
                    )}
                    summary={t('config_management.settings_center.rules_summary', {
                      count: values.authModelExclusions.length,
                    })}
                    focusTarget={focusTarget}
                    dirty={authModelExclusionsDirty}
                    errorCount={authModelExclusionsErrorCount}
                  >
                    <div className={styles.blockHeaderRow}>
                      <div className={styles.fieldHint}>
                        {t('config_management.visual.sections.auth.auth_model_exclusions_hint')}
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={addAuthModelExclusion}
                        disabled={disabled}
                      >
                        {t('config_management.visual.sections.auth.auth_model_exclusions_add')}
                      </Button>
                    </div>
                    {values.authModelExclusions.length === 0 ? (
                      <div className={styles.emptyState}>
                        {t('config_management.visual.sections.auth.auth_model_exclusions_empty')}
                      </div>
                    ) : (
                      <div className={styles.blockStack}>
                        {values.authModelExclusions.map((rule, index) => {
                          const modelsError = getAuthModelExclusionError(rule.clientId, 'models');
                          const prioritiesError = getAuthModelExclusionError(
                            rule.clientId,
                            'priorities'
                          );
                          const matchError = getAuthModelExclusionError(rule.clientId, 'match');
                          const modelTags = normalizeAuthModelExclusionModels(rule.models);
                          const allModelMode = isAuthModelExclusionAllMode(modelTags);

                          return (
                            <div key={rule.clientId} className={styles.ruleCard}>
                              <div className={styles.ruleCardHeader}>
                                <div className={styles.ruleCardTitle}>
                                  {t(
                                    'config_management.visual.sections.auth.auth_model_exclusions_rule',
                                    {
                                      index: index + 1,
                                    }
                                  )}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeAuthModelExclusion(rule.clientId)}
                                  disabled={disabled}
                                >
                                  {t('config_management.visual.common.delete')}
                                </Button>
                              </div>
                              <ToggleRow
                                title={t(
                                  'config_management.visual.sections.auth.auth_model_exclusions_disable_image_generation'
                                )}
                                description={t(
                                  'config_management.visual.sections.auth.auth_model_exclusions_disable_image_generation_desc'
                                )}
                                checked={rule.disableImageGeneration}
                                disabled={disabled}
                                onChange={(disableImageGeneration) =>
                                  updateAuthModelExclusion(rule.clientId, {
                                    disableImageGeneration,
                                  })
                                }
                              />
                              <FieldShell
                                label={t(
                                  'config_management.visual.sections.auth.auth_model_exclusions_models'
                                )}
                                hint={t(
                                  rule.disableImageGeneration
                                    ? 'config_management.visual.sections.auth.auth_model_exclusions_models_hint_disable_image'
                                    : 'config_management.visual.sections.auth.auth_model_exclusions_models_hint'
                                )}
                                error={modelsError}
                              >
                                <TagListEditor
                                  value={modelTags}
                                  disabled={disabled}
                                  placeholder={t(
                                    'config_management.visual.sections.auth.auth_model_exclusions_models_placeholder'
                                  )}
                                  emptyLabel={t(
                                    'config_management.visual.sections.auth.auth_model_exclusions_models_empty'
                                  )}
                                  onChange={(models) =>
                                    updateAuthModelExclusion(rule.clientId, {
                                      models: normalizeAuthModelExclusionModels(models),
                                    })
                                  }
                                />
                                {allModelMode ? (
                                  <div className={styles.fieldHint}>
                                    {t(
                                      'config_management.visual.sections.auth.auth_model_exclusions_models_all_mode_hint'
                                    )}
                                  </div>
                                ) : null}
                              </FieldShell>
                              <FieldShell
                                label={t(
                                  'config_management.visual.sections.auth.auth_model_exclusions_providers'
                                )}
                                hint={t(
                                  'config_management.visual.sections.auth.auth_model_exclusions_providers_hint'
                                )}
                                error={matchError}
                              >
                                <TagListEditor
                                  value={rule.providers}
                                  disabled={disabled}
                                  placeholder={t(
                                    'config_management.visual.sections.auth.auth_model_exclusions_providers_placeholder'
                                  )}
                                  emptyLabel={t(
                                    'config_management.visual.sections.auth.auth_model_exclusions_providers_empty'
                                  )}
                                  onChange={(providers) =>
                                    updateAuthModelExclusion(rule.clientId, { providers })
                                  }
                                />
                              </FieldShell>
                              <div className={styles.authModelExclusionGrid}>
                                <FieldShell
                                  label={t(
                                    'config_management.visual.sections.auth.auth_model_exclusions_priorities'
                                  )}
                                  hint={t(
                                    'config_management.visual.sections.auth.auth_model_exclusions_priorities_hint'
                                  )}
                                  error={prioritiesError}
                                >
                                  <TagListEditor
                                    value={rule.priorities}
                                    disabled={disabled}
                                    placeholder={t(
                                      'config_management.visual.sections.auth.auth_model_exclusions_priorities_placeholder'
                                    )}
                                    emptyLabel={t(
                                      'config_management.visual.sections.auth.auth_model_exclusions_priorities_empty'
                                    )}
                                    onChange={(priorities) =>
                                      updateAuthModelExclusion(rule.clientId, { priorities })
                                    }
                                  />
                                </FieldShell>
                                <FieldShell
                                  label={t(
                                    'config_management.visual.sections.auth.auth_model_exclusions_keyword_contains'
                                  )}
                                  hint={t(
                                    'config_management.visual.sections.auth.auth_model_exclusions_keyword_contains_hint'
                                  )}
                                >
                                  <TagListEditor
                                    value={rule.keywordContains}
                                    disabled={disabled}
                                    placeholder={t(
                                      'config_management.visual.sections.auth.auth_model_exclusions_keyword_contains_placeholder'
                                    )}
                                    emptyLabel={t(
                                      'config_management.visual.sections.auth.auth_model_exclusions_keyword_contains_empty'
                                    )}
                                    onChange={(keywordContains) =>
                                      updateAuthModelExclusion(rule.clientId, { keywordContains })
                                    }
                                  />
                                </FieldShell>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </SettingsDisclosure>
                </PageGroup>
                <PageGroup id="config-codex-image-tool" active={activePageId === 'provider-codex'}>
                  <SectionSubsection
                    title={t('config_management.visual.sections.auth.disabled_image_tool_policy')}
                    description={t(
                      'config_management.visual.sections.auth.disabled_image_tool_policy_desc'
                    )}
                  >
                    <ToggleRow
                      title={t(
                        'config_management.visual.sections.auth.disabled_image_tool_fallback'
                      )}
                      description={t(
                        'config_management.visual.sections.auth.disabled_image_tool_fallback_desc'
                      )}
                      checked={values.disabledImageGenerationToolFallback}
                      disabled={disabled}
                      onChange={(disabledImageGenerationToolFallback) =>
                        onChange({ disabledImageGenerationToolFallback })
                      }
                    />
                    <SectionGrid>
                      <FieldShell
                        label={t(
                          'config_management.visual.sections.auth.disabled_image_tool_action'
                        )}
                        hint={t(
                          'config_management.visual.sections.auth.disabled_image_tool_action_hint'
                        )}
                      >
                        <Select
                          value={values.disabledImageGenerationToolAction}
                          options={disabledImageGenerationToolActionOptions}
                          disabled={disabled}
                          ariaLabel={t(
                            'config_management.visual.sections.auth.disabled_image_tool_action'
                          )}
                          onChange={(disabledImageGenerationToolAction) =>
                            onChange({
                              disabledImageGenerationToolAction:
                                disabledImageGenerationToolAction as VisualConfigValues['disabledImageGenerationToolAction'],
                            })
                          }
                        />
                      </FieldShell>
                    </SectionGrid>
                    {values.disabledImageGenerationToolAction === 'error' ? (
                      <SectionGrid>
                        <Input
                          label={t(
                            'config_management.visual.sections.auth.disabled_image_tool_error_status_code'
                          )}
                          type="number"
                          placeholder="400"
                          value={values.disabledImageGenerationToolError.statusCode}
                          onChange={(event) =>
                            onChange({
                              disabledImageGenerationToolError: {
                                ...values.disabledImageGenerationToolError,
                                statusCode: event.target.value,
                              },
                            })
                          }
                          disabled={disabled}
                          error={disabledImageGenerationToolStatusCodeError}
                        />
                        <Input
                          label={t(
                            'config_management.visual.sections.auth.disabled_image_tool_error_type'
                          )}
                          placeholder="image_generation_disabled"
                          value={values.disabledImageGenerationToolError.type}
                          onChange={(event) =>
                            onChange({
                              disabledImageGenerationToolError: {
                                ...values.disabledImageGenerationToolError,
                                type: event.target.value,
                              },
                            })
                          }
                          disabled={disabled}
                        />
                        <Input
                          label={t(
                            'config_management.visual.sections.auth.disabled_image_tool_error_code'
                          )}
                          placeholder="image_generation_disabled"
                          value={values.disabledImageGenerationToolError.code}
                          onChange={(event) =>
                            onChange({
                              disabledImageGenerationToolError: {
                                ...values.disabledImageGenerationToolError,
                                code: event.target.value,
                              },
                            })
                          }
                          disabled={disabled}
                        />
                        <Input
                          label={t(
                            'config_management.visual.sections.auth.disabled_image_tool_error_message'
                          )}
                          placeholder="image_generation tool is disabled for this credential"
                          value={values.disabledImageGenerationToolError.message}
                          onChange={(event) =>
                            onChange({
                              disabledImageGenerationToolError: {
                                ...values.disabledImageGenerationToolError,
                                message: event.target.value,
                              },
                            })
                          }
                          disabled={disabled}
                        />
                      </SectionGrid>
                    ) : null}
                  </SectionSubsection>
                </PageGroup>
              </SectionStack>
            </ConfigSection>

            <ConfigSection
              id="system"
              hidden={activePageId !== 'global-observability'}
              icon={<IconDiamond size={16} />}
              title={t('config_management.visual.sections.system.title')}
              description={t('config_management.visual.sections.system.description')}
            >
              <SectionStack>
                <SectionGrid>
                  <div id="config-system-mode" className={styles.pageGroup}>
                    <ToggleRow
                      title={t('config_management.visual.sections.system.debug')}
                      description={t('config_management.visual.sections.system.debug_desc')}
                      checked={values.debug}
                      disabled={disabled}
                      onChange={(debug) => onChange({ debug })}
                    />
                    <ToggleRow
                      title={t('config_management.visual.sections.system.commercial_mode')}
                      description={t(
                        'config_management.visual.sections.system.commercial_mode_desc'
                      )}
                      checked={values.commercialMode}
                      disabled={disabled}
                      onChange={(commercialMode) => onChange({ commercialMode })}
                    />
                  </div>
                  <div id="config-logging" className={styles.pageGroup}>
                    <ToggleRow
                      title={t('config_management.visual.sections.system.logging_to_file')}
                      description={t(
                        'config_management.visual.sections.system.logging_to_file_desc'
                      )}
                      checked={values.loggingToFile}
                      disabled={disabled}
                      onChange={(loggingToFile) => onChange({ loggingToFile })}
                    />
                  </div>
                  <div id="config-usage-statistics" className={styles.pageGroup}>
                    <ToggleRow
                      title={t('config_management.visual.sections.system.usage_statistics')}
                      description={t(
                        'config_management.visual.sections.system.usage_statistics_desc'
                      )}
                      checked={values.usageStatisticsEnabled}
                      disabled={disabled}
                      onChange={(usageStatisticsEnabled) => onChange({ usageStatisticsEnabled })}
                    />
                    <ToggleRow
                      title={t(
                        'config_management.visual.sections.system.usage_statistics_persistence'
                      )}
                      description={t(
                        'config_management.visual.sections.system.usage_statistics_persistence_desc'
                      )}
                      checked={values.usageStatisticsPersistenceEnabled}
                      disabled={disabled}
                      onChange={(usageStatisticsPersistenceEnabled) =>
                        onChange({ usageStatisticsPersistenceEnabled })
                      }
                    />
                  </div>
                  <div id="config-pprof" className={styles.pageGroup}>
                    <ToggleRow
                      title={t('config_management.visual.sections.system.pprof_enable')}
                      description={t('config_management.visual.sections.system.pprof_enable_desc')}
                      checked={values.pprofEnable}
                      disabled={disabled}
                      onChange={(pprofEnable) => onChange({ pprofEnable })}
                    />
                  </div>
                </SectionGrid>

                <SectionGrid>
                  <Input
                    label={t('config_management.visual.sections.system.logs_max_size')}
                    type="number"
                    min={0}
                    placeholder="0"
                    value={values.logsMaxTotalSizeMb}
                    onChange={(e) => onChange({ logsMaxTotalSizeMb: e.target.value })}
                    disabled={disabled}
                    error={logsMaxSizeError}
                  />
                  <Input
                    label={t('config_management.visual.sections.system.logs_retention_days')}
                    type="number"
                    min={0}
                    placeholder="0"
                    value={values.logsRetentionDays}
                    onChange={(e) => onChange({ logsRetentionDays: e.target.value })}
                    disabled={disabled}
                    hint={t('config_management.visual.sections.system.logs_retention_days_desc')}
                    error={logsRetentionDaysError}
                  />
                  <Input
                    label={t('config_management.visual.sections.system.usage_statistics_persist')}
                    type="number"
                    min={0}
                    placeholder="0"
                    value={values.usageStatisticsPersistIntervalSeconds}
                    onChange={(e) =>
                      onChange({ usageStatisticsPersistIntervalSeconds: e.target.value })
                    }
                    disabled={disabled}
                    hint={t(
                      'config_management.visual.sections.system.usage_statistics_persist_desc'
                    )}
                    error={usageStatisticsPersistIntervalError}
                  />
                  <Input
                    label={t(
                      'config_management.visual.sections.system.usage_statistics_retention_days'
                    )}
                    type="number"
                    min={0}
                    placeholder="0"
                    value={values.usageStatisticsDetailRetentionDays}
                    onChange={(e) =>
                      onChange({ usageStatisticsDetailRetentionDays: e.target.value })
                    }
                    disabled={disabled}
                    hint={t(
                      'config_management.visual.sections.system.usage_statistics_retention_days_desc'
                    )}
                    error={usageStatisticsDetailRetentionDaysError}
                  />
                  <Input
                    label={t(
                      'config_management.visual.sections.system.usage_statistics_max_storage'
                    )}
                    type="number"
                    min={0}
                    placeholder="0"
                    value={values.usageStatisticsMaxStorageMegabytes}
                    onChange={(e) =>
                      onChange({ usageStatisticsMaxStorageMegabytes: e.target.value })
                    }
                    disabled={disabled}
                    hint={t(
                      'config_management.visual.sections.system.usage_statistics_max_storage_desc'
                    )}
                    error={usageStatisticsMaxStorageMegabytesError}
                  />
                  <Input
                    label={t('config_management.visual.sections.system.pprof_addr')}
                    placeholder="127.0.0.1:8316"
                    value={values.pprofAddr}
                    onChange={(e) => onChange({ pprofAddr: e.target.value })}
                    disabled={disabled || !values.pprofEnable}
                    hint={t('config_management.visual.sections.system.pprof_addr_desc')}
                  />
                </SectionGrid>
              </SectionStack>
            </ConfigSection>

            <ConfigSection
              id="network"
              hidden={
                !['global-network', 'global-request', 'provider-codex'].includes(activePageId)
              }
              icon={<IconTrendingUp size={16} />}
              title={t(
                activePageId === 'provider-codex'
                  ? 'config_management.settings_center.subsections.codex_transport'
                  : activePageId === 'global-request'
                    ? 'config_management.settings_center.subsections.request_error_rules'
                    : 'config_management.visual.sections.network.title'
              )}
              description={t(
                activePageId === 'provider-codex'
                  ? 'config_management.settings_center.subsections.codex_transport_desc'
                  : activePageId === 'global-request'
                    ? 'config_management.settings_center.subsections.request_error_rules_desc'
                    : 'config_management.visual.sections.network.description'
              )}
            >
              <SectionStack>
                <PageGroup active={activePageId === 'global-network'}>
                  <SettingsDisclosure
                    id="config-network-proxy"
                    title={t('config_management.settings_center.disclosures.proxy.title')}
                    description={t(
                      'config_management.settings_center.disclosures.proxy.description'
                    )}
                    focusTarget={focusTarget}
                    targetIds={['config-proxy-url', 'config-proxy-pools']}
                    dirty={proxySettingsDirty}
                  >
                    <SectionGrid>
                      <div className={styles.proxyCheckPanel}>
                        <div className={styles.proxyCheckRow}>
                          <Input
                            id="config-proxy-url"
                            label={t('config_management.visual.sections.network.proxy_url')}
                            placeholder="socks5://user:pass@127.0.0.1:1080/"
                            value={values.proxyUrl}
                            onChange={(e) => onChange({ proxyUrl: e.target.value })}
                            disabled={disabled}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleProxyCheck()}
                            loading={proxyCheckLoading}
                            disabled={disabled}
                            className={styles.proxyCheckButton}
                          >
                            {t('config_management.visual.sections.network.proxy_check')}
                          </Button>
                        </div>
                        {(proxyCheckResult || proxyCheckError) && (
                          <div
                            className={`${styles.proxyCheckResult} ${
                              proxyCheckResult?.ok
                                ? styles.proxyCheckResultOk
                                : styles.proxyCheckResultError
                            }`}
                          >
                            {proxyCheckResult && (
                              <>
                                <div className={styles.proxyCheckStatus}>
                                  {t(
                                    `config_management.visual.sections.network.proxy_check_mode_${proxyCheckResult.mode}`,
                                    { defaultValue: proxyCheckResult.mode }
                                  )}
                                </div>
                                {proxyCheckResult.ok ? (
                                  <div className={styles.proxyCheckMetrics}>
                                    {proxyCheckResult.ip && (
                                      <span>
                                        {t(
                                          'config_management.visual.sections.network.proxy_check_ip'
                                        )}
                                        : {proxyCheckResult.ip}
                                      </span>
                                    )}
                                    {proxyCheckResult.loc && (
                                      <span>
                                        {t(
                                          'config_management.visual.sections.network.proxy_check_loc'
                                        )}
                                        : {proxyCheckResult.loc}
                                      </span>
                                    )}
                                    {proxyCheckResult.colo && (
                                      <span>Colo: {proxyCheckResult.colo}</span>
                                    )}
                                    {proxyCheckResult.http && (
                                      <span>HTTP: {proxyCheckResult.http}</span>
                                    )}
                                    {proxyCheckResult.tls && (
                                      <span>TLS: {proxyCheckResult.tls}</span>
                                    )}
                                    {proxyCheckResult.elapsedMs !== null && (
                                      <span>{proxyCheckResult.elapsedMs}ms</span>
                                    )}
                                  </div>
                                ) : (
                                  <div className={styles.proxyCheckMessage}>
                                    {[proxyCheckResult.error, proxyCheckResult.message]
                                      .filter(Boolean)
                                      .join(' - ') ||
                                      t(
                                        'config_management.visual.sections.network.proxy_check_failed'
                                      )}
                                  </div>
                                )}
                              </>
                            )}
                            {proxyCheckError && (
                              <div className={styles.proxyCheckMessage}>{proxyCheckError}</div>
                            )}
                          </div>
                        )}
                        <div id="config-proxy-pools" className={styles.providerHubActions}>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => navigate('/config/proxy-pools')}
                          >
                            {t('proxy_pools.title')}
                            <IconExternalLink size={14} />
                          </Button>
                        </div>
                      </div>
                    </SectionGrid>
                  </SettingsDisclosure>
                  <SettingsDisclosure
                    id="config-network-retry"
                    title={t('config_management.settings_center.disclosures.retry.title')}
                    description={t(
                      'config_management.settings_center.disclosures.retry.description'
                    )}
                    focusTarget={focusTarget}
                    targetIds={[
                      'config-request-retry',
                      'config-max-retry-credentials',
                      'config-max-retry-interval',
                    ]}
                    dirty={retrySettingsDirty}
                    errorCount={retrySettingsErrorCount}
                  >
                    <SectionGrid>
                      <Input
                        id="config-request-retry"
                        label={t('config_management.visual.sections.network.request_retry')}
                        type="number"
                        placeholder="3"
                        value={values.requestRetry}
                        onChange={(e) => onChange({ requestRetry: e.target.value })}
                        disabled={disabled}
                        hint={t('config_management.visual.sections.network.request_retry_hint')}
                        error={requestRetryError}
                      />
                      <Input
                        id="config-max-retry-credentials"
                        label={t('config_management.visual.sections.network.max_retry_credentials')}
                        type="number"
                        placeholder="0"
                        value={values.maxRetryCredentials}
                        onChange={(e) => onChange({ maxRetryCredentials: e.target.value })}
                        disabled={disabled}
                        hint={t(
                          'config_management.visual.sections.network.max_retry_credentials_hint'
                        )}
                        error={maxRetryCredentialsError}
                      />
                      <Input
                        id="config-max-retry-interval"
                        label={t('config_management.visual.sections.network.max_retry_interval')}
                        type="number"
                        placeholder="30"
                        value={values.maxRetryInterval}
                        onChange={(e) => onChange({ maxRetryInterval: e.target.value })}
                        disabled={disabled}
                        hint={t(
                          'config_management.visual.sections.network.max_retry_interval_hint'
                        )}
                        error={maxRetryIntervalError}
                      />
                    </SectionGrid>
                  </SettingsDisclosure>
                  <SettingsDisclosure
                    id="config-network-routing"
                    title={t('config_management.settings_center.disclosures.routing.title')}
                    description={t(
                      'config_management.settings_center.disclosures.routing.description'
                    )}
                    focusTarget={focusTarget}
                    targetIds={[
                      'config-routing',
                      'config-routing-per-auth-request-limit',
                      'config-routing-per-auth-request-window-minutes',
                    ]}
                    dirty={routingSettingsDirty}
                    errorCount={routingSettingsErrorCount}
                  >
                    <SectionGrid>
                      <div id="config-routing" className={styles.pageGroup}>
                        <FieldShell
                          label={t('config_management.visual.sections.network.routing_strategy')}
                          labelId={routingStrategyLabelId}
                          hint={t(
                            'config_management.visual.sections.network.routing_strategy_hint'
                          )}
                          hintId={routingStrategyHintId}
                        >
                          <Select
                            value={values.routingStrategy}
                            options={[
                              {
                                value: 'round-robin',
                                label: t(
                                  'config_management.visual.sections.network.strategy_round_robin'
                                ),
                              },
                              {
                                value: 'fill-first',
                                label: t(
                                  'config_management.visual.sections.network.strategy_fill_first'
                                ),
                              },
                              {
                                value: 'random',
                                label: t(
                                  'config_management.visual.sections.network.strategy_random'
                                ),
                              },
                            ]}
                            id={`${routingStrategyLabelId}-select`}
                            disabled={disabled}
                            ariaLabelledBy={routingStrategyLabelId}
                            ariaDescribedBy={routingStrategyHintId}
                            onChange={(nextValue) =>
                              onChange({
                                routingStrategy: nextValue as VisualConfigValues['routingStrategy'],
                              })
                            }
                          />
                        </FieldShell>
                      </div>
                      <Input
                        id="config-routing-per-auth-request-limit"
                        label={t(
                          'config_management.visual.sections.network.routing_per_auth_request_limit'
                        )}
                        type="number"
                        min={0}
                        placeholder="0"
                        value={values.routingPerAuthRequestLimit}
                        onChange={(event) =>
                          onChange({ routingPerAuthRequestLimit: event.target.value })
                        }
                        disabled={disabled}
                        hint={t(
                          'config_management.visual.sections.network.routing_per_auth_request_limit_hint'
                        )}
                        error={routingPerAuthRequestLimitError}
                      />
                      <Input
                        id="config-routing-per-auth-request-window-minutes"
                        label={t(
                          'config_management.visual.sections.network.routing_per_auth_request_window_minutes'
                        )}
                        type="number"
                        min={1}
                        placeholder="1"
                        value={values.routingPerAuthRequestWindowMinutes}
                        onChange={(event) =>
                          onChange({ routingPerAuthRequestWindowMinutes: event.target.value })
                        }
                        disabled={disabled}
                        hint={t(
                          'config_management.visual.sections.network.routing_per_auth_request_window_minutes_hint'
                        )}
                        error={routingPerAuthRequestWindowMinutesError}
                      />
                      {values.routingStrategy === 'fill-first' && (
                        <>
                          <Input
                            label={t(
                              'config_management.visual.sections.network.routing_fill_first_range'
                            )}
                            type="number"
                            min={1}
                            placeholder="1"
                            value={values.routingFillFirstRange}
                            onChange={(e) => onChange({ routingFillFirstRange: e.target.value })}
                            disabled={disabled}
                            hint={t(
                              'config_management.visual.sections.network.routing_fill_first_range_hint'
                            )}
                            error={routingFillFirstRangeError}
                          />
                          <Input
                            label={t(
                              'config_management.visual.sections.network.routing_fill_first_per_auth_rpm'
                            )}
                            type="number"
                            min={0}
                            placeholder="0"
                            value={values.routingFillFirstPerAuthRpm}
                            onChange={(e) =>
                              onChange({ routingFillFirstPerAuthRpm: e.target.value })
                            }
                            disabled={disabled}
                            hint={`${t(
                              'config_management.visual.sections.network.routing_fill_first_per_auth_rpm_hint'
                            )}${
                              Number(values.routingPerAuthRequestLimit) > 0
                                ? ` ${t(
                                    'config_management.visual.sections.network.routing_generic_limit_precedence'
                                  )}`
                                : ''
                            }`}
                            error={routingFillFirstPerAuthRpmError}
                          />
                        </>
                      )}
                    </SectionGrid>
                  </SettingsDisclosure>

                  <SettingsDisclosure
                    id="config-routing-priority-overrides"
                    title={t('config_management.visual.sections.network.priority_overrides')}
                    description={t(
                      'config_management.visual.sections.network.priority_overrides_desc'
                    )}
                    summary={t('config_management.settings_center.rules_summary', {
                      count: values.routingPriorityOverrides.length,
                    })}
                    focusTarget={focusTarget}
                    dirty={routingPriorityOverridesDirty}
                    errorCount={routingPriorityOverridesErrorCount}
                  >
                    <div className={styles.blockHeaderRow}>
                      <div className={styles.fieldHint}>
                        {t('config_management.visual.sections.network.priority_overrides_hint')}
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={addRoutingPriorityOverride}
                        disabled={disabled}
                      >
                        {t('config_management.visual.sections.network.priority_overrides_add')}
                      </Button>
                    </div>
                    {values.routingPriorityOverrides.length === 0 ? (
                      <div className={styles.emptyState}>
                        {t('config_management.visual.sections.network.priority_overrides_empty')}
                      </div>
                    ) : (
                      <div className={styles.blockStack}>
                        {values.routingPriorityOverrides.map((rule, index) => {
                          const priorityError = getRoutingPriorityOverrideError(
                            rule.clientId,
                            'priority'
                          );
                          const maxRetryCredentialsError = getRoutingPriorityOverrideError(
                            rule.clientId,
                            'maxRetryCredentials'
                          );
                          const fillFirstRangeError = getRoutingPriorityOverrideError(
                            rule.clientId,
                            'fillFirstRange'
                          );
                          const fillFirstPerAuthRpmError = getRoutingPriorityOverrideError(
                            rule.clientId,
                            'fillFirstPerAuthRpm'
                          );
                          const perAuthRequestLimitError = getRoutingPriorityOverrideError(
                            rule.clientId,
                            'perAuthRequestLimit'
                          );
                          const perAuthRequestWindowMinutesError = getRoutingPriorityOverrideError(
                            rule.clientId,
                            'perAuthRequestWindowMinutes'
                          );
                          const strategyLabelId = `routing-priority-${rule.clientId}-strategy-label`;
                          const effectiveStrategy = rule.strategy || values.routingStrategy;
                          const effectivePerAuthRequestLimit = Number(
                            rule.perAuthRequestLimit.trim()
                              ? rule.perAuthRequestLimit
                              : values.routingPerAuthRequestLimit
                          );

                          return (
                            <div key={rule.clientId} className={styles.ruleCard}>
                              <div className={styles.ruleCardHeader}>
                                <div className={styles.ruleCardTitle}>
                                  {t(
                                    'config_management.visual.sections.network.priority_overrides_rule',
                                    {
                                      index: index + 1,
                                    }
                                  )}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeRoutingPriorityOverride(rule.clientId)}
                                  disabled={disabled}
                                >
                                  {t('config_management.visual.common.delete')}
                                </Button>
                              </div>
                              <div
                                className={`${styles.priorityOverrideGrid} ${
                                  effectiveStrategy === 'fill-first'
                                    ? styles.priorityOverrideGridWithFill
                                    : ''
                                }`}
                              >
                                <Input
                                  label={t(
                                    'config_management.visual.sections.network.priority_overrides_priority'
                                  )}
                                  type="number"
                                  placeholder="0"
                                  value={rule.priority}
                                  onChange={(event) =>
                                    updateRoutingPriorityOverride(rule.clientId, {
                                      priority: event.target.value,
                                    })
                                  }
                                  disabled={disabled}
                                  error={priorityError}
                                />
                                <FieldShell
                                  label={t(
                                    'config_management.visual.sections.network.priority_overrides_strategy'
                                  )}
                                  labelId={strategyLabelId}
                                >
                                  <Select
                                    value={rule.strategy}
                                    options={routingPriorityOverrideStrategyOptions}
                                    disabled={disabled}
                                    ariaLabelledBy={strategyLabelId}
                                    onChange={(strategy) =>
                                      updateRoutingPriorityOverride(rule.clientId, {
                                        strategy: strategy as RoutingPriorityOverrideStrategy,
                                      })
                                    }
                                  />
                                </FieldShell>
                                <Input
                                  label={t(
                                    'config_management.visual.sections.network.priority_overrides_max_retry_credentials'
                                  )}
                                  type="number"
                                  placeholder={t(
                                    'config_management.visual.sections.network.priority_overrides_inherit_global'
                                  )}
                                  value={rule.maxRetryCredentials}
                                  onChange={(event) =>
                                    updateRoutingPriorityOverride(rule.clientId, {
                                      maxRetryCredentials: event.target.value,
                                    })
                                  }
                                  disabled={disabled}
                                  error={maxRetryCredentialsError}
                                />
                                <Input
                                  label={t(
                                    'config_management.visual.sections.network.priority_overrides_per_auth_request_limit'
                                  )}
                                  type="number"
                                  min={0}
                                  placeholder={t(
                                    'config_management.visual.sections.network.priority_overrides_inherit_global'
                                  )}
                                  value={rule.perAuthRequestLimit}
                                  onChange={(event) =>
                                    updateRoutingPriorityOverride(rule.clientId, {
                                      perAuthRequestLimit: event.target.value,
                                    })
                                  }
                                  disabled={disabled}
                                  hint={t(
                                    'config_management.visual.sections.network.priority_overrides_per_auth_request_limit_hint'
                                  )}
                                  error={perAuthRequestLimitError}
                                />
                                <Input
                                  label={t(
                                    'config_management.visual.sections.network.priority_overrides_per_auth_request_window_minutes'
                                  )}
                                  type="number"
                                  min={1}
                                  placeholder={t(
                                    'config_management.visual.sections.network.priority_overrides_inherit_global'
                                  )}
                                  value={rule.perAuthRequestWindowMinutes}
                                  onChange={(event) =>
                                    updateRoutingPriorityOverride(rule.clientId, {
                                      perAuthRequestWindowMinutes: event.target.value,
                                    })
                                  }
                                  disabled={disabled}
                                  hint={t(
                                    'config_management.visual.sections.network.priority_overrides_per_auth_request_window_minutes_hint'
                                  )}
                                  error={perAuthRequestWindowMinutesError}
                                />
                                {effectiveStrategy === 'fill-first' && (
                                  <>
                                    <Input
                                      label={t(
                                        'config_management.visual.sections.network.priority_overrides_fill_first_range'
                                      )}
                                      type="number"
                                      min={1}
                                      placeholder={t(
                                        'config_management.visual.sections.network.priority_overrides_inherit_global'
                                      )}
                                      value={rule.fillFirstRange}
                                      onChange={(event) =>
                                        updateRoutingPriorityOverride(rule.clientId, {
                                          fillFirstRange: event.target.value,
                                        })
                                      }
                                      disabled={disabled}
                                      hint={t(
                                        'config_management.visual.sections.network.priority_overrides_fill_first_range_hint'
                                      )}
                                      error={fillFirstRangeError}
                                    />
                                    <Input
                                      label={t(
                                        'config_management.visual.sections.network.priority_overrides_fill_first_per_auth_rpm'
                                      )}
                                      type="number"
                                      min={0}
                                      placeholder={t(
                                        'config_management.visual.sections.network.priority_overrides_inherit_global'
                                      )}
                                      value={rule.fillFirstPerAuthRpm}
                                      onChange={(event) =>
                                        updateRoutingPriorityOverride(rule.clientId, {
                                          fillFirstPerAuthRpm: event.target.value,
                                        })
                                      }
                                      disabled={disabled}
                                      hint={`${t(
                                        'config_management.visual.sections.network.priority_overrides_fill_first_per_auth_rpm_hint'
                                      )}${
                                        effectivePerAuthRequestLimit > 0
                                          ? ` ${t(
                                              'config_management.visual.sections.network.routing_generic_limit_precedence'
                                            )}`
                                          : ''
                                      }`}
                                      error={fillFirstPerAuthRpmError}
                                    />
                                  </>
                                )}
                              </div>
                              <div className={styles.subscriptionOverrideSection}>
                                <div className={styles.blockHeaderRow}>
                                  <div>
                                    <div className={styles.blockLabel}>
                                      {t(
                                        'config_management.visual.sections.network.priority_subscription_overrides'
                                      )}
                                    </div>
                                    <div className={styles.fieldHint}>
                                      {t(
                                        'config_management.visual.sections.network.priority_subscription_overrides_hint'
                                      )}
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => addRoutingSubscriptionOverride(rule.clientId)}
                                    disabled={disabled}
                                  >
                                    {t(
                                      'config_management.visual.sections.network.priority_subscription_overrides_add'
                                    )}
                                  </Button>
                                </div>
                                {rule.subscriptionOverrides.length === 0 ? (
                                  <div className={styles.emptyState}>
                                    {t(
                                      'config_management.visual.sections.network.priority_subscription_overrides_empty'
                                    )}
                                  </div>
                                ) : (
                                  <div className={styles.subscriptionOverrideList}>
                                    {rule.subscriptionOverrides.map(
                                      (subscriptionRule, subscriptionIndex) => {
                                        const planTypesError = getRoutingSubscriptionOverrideError(
                                          rule.clientId,
                                          subscriptionRule.clientId,
                                          'planTypes'
                                        );
                                        const subscriptionLimitError =
                                          getRoutingSubscriptionOverrideError(
                                            rule.clientId,
                                            subscriptionRule.clientId,
                                            'perAuthRequestLimit'
                                          );
                                        const subscriptionWindowError =
                                          getRoutingSubscriptionOverrideError(
                                            rule.clientId,
                                            subscriptionRule.clientId,
                                            'perAuthRequestWindowMinutes'
                                          );
                                        const planTypesInputId = `routing-subscription-${subscriptionRule.clientId}-plan-types`;
                                        const planTypesHintId = `${planTypesInputId}-hint`;
                                        const planTypesErrorId = `${planTypesInputId}-error`;
                                        const providersInputId = `routing-subscription-${subscriptionRule.clientId}-providers`;
                                        const providersHintId = `${providersInputId}-hint`;
                                        return (
                                          <div
                                            key={subscriptionRule.clientId}
                                            className={styles.subscriptionOverrideItem}
                                          >
                                            <div className={styles.ruleCardHeader}>
                                              <div className={styles.ruleCardTitle}>
                                                {t(
                                                  'config_management.visual.sections.network.priority_subscription_overrides_rule',
                                                  {
                                                    index: subscriptionIndex + 1,
                                                  }
                                                )}
                                              </div>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                  removeRoutingSubscriptionOverride(
                                                    rule.clientId,
                                                    subscriptionRule.clientId
                                                  )
                                                }
                                                disabled={disabled}
                                              >
                                                {t('config_management.visual.common.delete')}
                                              </Button>
                                            </div>
                                            <div className={styles.subscriptionOverrideGrid}>
                                              <FieldShell
                                                label={t(
                                                  'config_management.visual.sections.network.priority_subscription_overrides_plan_types'
                                                )}
                                                htmlFor={planTypesInputId}
                                                hint={t(
                                                  'config_management.visual.sections.network.priority_subscription_overrides_plan_types_hint'
                                                )}
                                                hintId={planTypesHintId}
                                                error={planTypesError}
                                                errorId={planTypesErrorId}
                                              >
                                                <TagListEditor
                                                  value={subscriptionRule.planTypes}
                                                  disabled={disabled}
                                                  inputId={planTypesInputId}
                                                  inputAriaLabel={t(
                                                    'config_management.visual.sections.network.priority_subscription_overrides_plan_types'
                                                  )}
                                                  ariaDescribedBy={`${planTypesHintId}${
                                                    planTypesError ? ` ${planTypesErrorId}` : ''
                                                  }`}
                                                  ariaInvalid={Boolean(planTypesError)}
                                                  placeholder={t(
                                                    'config_management.visual.sections.network.priority_subscription_overrides_plan_types_placeholder'
                                                  )}
                                                  emptyLabel={t(
                                                    'config_management.visual.sections.network.priority_subscription_overrides_plan_types_empty'
                                                  )}
                                                  suggestionOptions={
                                                    routingPlanTypeSuggestionOptions
                                                  }
                                                  suggestionButtonLabel={t(
                                                    'config_management.visual.sections.network.priority_subscription_overrides_plan_types_choose'
                                                  )}
                                                  suggestionTitle={t(
                                                    'config_management.visual.sections.network.priority_subscription_overrides_plan_types_choose_title'
                                                  )}
                                                  suggestionDescription={t(
                                                    'config_management.visual.sections.network.priority_subscription_overrides_plan_types_choose_desc'
                                                  )}
                                                  onChange={(planTypes) =>
                                                    updateRoutingSubscriptionOverride(
                                                      rule.clientId,
                                                      subscriptionRule.clientId,
                                                      { planTypes }
                                                    )
                                                  }
                                                />
                                              </FieldShell>
                                              <FieldShell
                                                label={t(
                                                  'config_management.visual.sections.network.priority_subscription_overrides_providers'
                                                )}
                                                htmlFor={providersInputId}
                                                hint={t(
                                                  'config_management.visual.sections.network.priority_subscription_overrides_providers_hint'
                                                )}
                                                hintId={providersHintId}
                                              >
                                                <TagListEditor
                                                  value={subscriptionRule.providers}
                                                  disabled={disabled}
                                                  inputId={providersInputId}
                                                  inputAriaLabel={t(
                                                    'config_management.visual.sections.network.priority_subscription_overrides_providers'
                                                  )}
                                                  ariaDescribedBy={providersHintId}
                                                  placeholder={t(
                                                    'config_management.visual.sections.network.priority_subscription_overrides_providers_placeholder'
                                                  )}
                                                  emptyLabel={t(
                                                    'config_management.visual.sections.network.priority_subscription_overrides_providers_empty'
                                                  )}
                                                  suggestionOptions={RUNTIME_PROVIDER_OPTIONS}
                                                  suggestionButtonLabel={t(
                                                    'config_management.visual.sections.network.priority_subscription_overrides_providers_choose'
                                                  )}
                                                  suggestionTitle={t(
                                                    'config_management.visual.sections.network.priority_subscription_overrides_providers_choose_title'
                                                  )}
                                                  suggestionDescription={t(
                                                    'config_management.visual.sections.network.priority_subscription_overrides_providers_choose_desc'
                                                  )}
                                                  onChange={(providers) =>
                                                    updateRoutingSubscriptionOverride(
                                                      rule.clientId,
                                                      subscriptionRule.clientId,
                                                      { providers }
                                                    )
                                                  }
                                                />
                                              </FieldShell>
                                              <Input
                                                label={t(
                                                  'config_management.visual.sections.network.priority_subscription_overrides_limit'
                                                )}
                                                type="number"
                                                min={0}
                                                placeholder={t(
                                                  'config_management.visual.sections.network.priority_subscription_overrides_inherit_priority'
                                                )}
                                                value={subscriptionRule.perAuthRequestLimit}
                                                onChange={(event) =>
                                                  updateRoutingSubscriptionOverride(
                                                    rule.clientId,
                                                    subscriptionRule.clientId,
                                                    {
                                                      perAuthRequestLimit: event.target.value,
                                                    }
                                                  )
                                                }
                                                disabled={disabled}
                                                hint={t(
                                                  'config_management.visual.sections.network.priority_subscription_overrides_limit_hint'
                                                )}
                                                error={subscriptionLimitError}
                                              />
                                              <Input
                                                label={t(
                                                  'config_management.visual.sections.network.priority_subscription_overrides_window'
                                                )}
                                                type="number"
                                                min={1}
                                                placeholder={t(
                                                  'config_management.visual.sections.network.priority_subscription_overrides_inherit_priority'
                                                )}
                                                value={subscriptionRule.perAuthRequestWindowMinutes}
                                                onChange={(event) =>
                                                  updateRoutingSubscriptionOverride(
                                                    rule.clientId,
                                                    subscriptionRule.clientId,
                                                    {
                                                      perAuthRequestWindowMinutes:
                                                        event.target.value,
                                                    }
                                                  )
                                                }
                                                disabled={disabled}
                                                hint={t(
                                                  'config_management.visual.sections.network.priority_subscription_overrides_window_hint'
                                                )}
                                                error={subscriptionWindowError}
                                              />
                                            </div>
                                          </div>
                                        );
                                      }
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </SettingsDisclosure>
                </PageGroup>

                <PageGroup active={activePageId === 'global-request'}>
                  <SettingsDisclosure
                    id="config-non-retryable-errors"
                    title={t('config_management.visual.sections.network.non_retryable_errors')}
                    description={t(
                      'config_management.visual.sections.network.non_retryable_errors_desc'
                    )}
                    summary={t('config_management.settings_center.rules_summary', {
                      count: values.nonRetryableErrors.length,
                    })}
                    focusTarget={focusTarget}
                    dirty={nonRetryableErrorsDirty}
                    errorCount={nonRetryableErrorsErrorCount}
                  >
                    <div className={styles.blockHeaderRow}>
                      <div className={styles.fieldHint}>
                        {t('config_management.visual.sections.network.non_retryable_errors_hint')}
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={addNonRetryableError}
                        disabled={disabled}
                      >
                        {t('config_management.visual.sections.network.non_retryable_errors_add')}
                      </Button>
                    </div>
                    {values.nonRetryableErrors.length === 0 ? (
                      <div className={styles.emptyState}>
                        {t('config_management.visual.sections.network.non_retryable_errors_empty')}
                      </div>
                    ) : (
                      <div className={styles.blockStack}>
                        {values.nonRetryableErrors.map((rule, index) => {
                          const statusCodeError = getNonRetryableError(rule.clientId, 'statusCode');
                          const matchError = getNonRetryableError(rule.clientId, 'match');

                          return (
                            <div key={rule.clientId} className={styles.ruleCard}>
                              <div className={styles.ruleCardHeader}>
                                <div className={styles.ruleCardTitle}>
                                  {t(
                                    'config_management.visual.sections.network.non_retryable_errors_rule',
                                    {
                                      index: index + 1,
                                    }
                                  )}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeNonRetryableError(rule.clientId)}
                                  disabled={disabled}
                                >
                                  {t('config_management.visual.common.delete')}
                                </Button>
                              </div>
                              <div className={styles.nonRetryableErrorGrid}>
                                <Input
                                  label={t(
                                    'config_management.visual.sections.network.non_retryable_errors_status_code'
                                  )}
                                  type="number"
                                  placeholder="400"
                                  value={rule.statusCode}
                                  onChange={(event) =>
                                    updateNonRetryableError(rule.clientId, {
                                      statusCode: event.target.value,
                                    })
                                  }
                                  disabled={disabled}
                                  hint={t(
                                    'config_management.visual.sections.network.non_retryable_errors_status_code_hint'
                                  )}
                                  error={statusCodeError}
                                />
                                <Input
                                  label={t(
                                    'config_management.visual.sections.network.non_retryable_errors_type'
                                  )}
                                  placeholder="image_generation_user_error"
                                  value={rule.type}
                                  onChange={(event) =>
                                    updateNonRetryableError(rule.clientId, {
                                      type: event.target.value,
                                    })
                                  }
                                  disabled={disabled}
                                />
                                <Input
                                  label={t(
                                    'config_management.visual.sections.network.non_retryable_errors_code'
                                  )}
                                  placeholder="invalid_value"
                                  value={rule.code}
                                  onChange={(event) =>
                                    updateNonRetryableError(rule.clientId, {
                                      code: event.target.value,
                                    })
                                  }
                                  disabled={disabled}
                                />
                              </div>
                              <Input
                                label={t(
                                  'config_management.visual.sections.network.non_retryable_errors_message_contains'
                                )}
                                placeholder={t(
                                  'config_management.visual.sections.network.non_retryable_errors_message_placeholder'
                                )}
                                value={rule.messageContains}
                                onChange={(event) =>
                                  updateNonRetryableError(rule.clientId, {
                                    messageContains: event.target.value,
                                  })
                                }
                                disabled={disabled}
                                hint={t(
                                  'config_management.visual.sections.network.non_retryable_errors_message_hint'
                                )}
                                error={matchError}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </SettingsDisclosure>
                </PageGroup>

                <PageGroup active={activePageId === 'global-request'}>
                  <SettingsDisclosure
                    id="config-error-response-rewrites"
                    title={t('config_management.visual.sections.network.error_response_rewrites')}
                    description={t(
                      'config_management.visual.sections.network.error_response_rewrites_desc'
                    )}
                    summary={t('config_management.settings_center.rules_summary', {
                      count: values.errorResponseRewrites.length,
                    })}
                    focusTarget={focusTarget}
                    dirty={errorResponseRewritesDirty}
                    errorCount={errorResponseRewritesErrorCount}
                  >
                    <div className={styles.blockHeaderRow}>
                      <div className={styles.fieldHint}>
                        {t(
                          'config_management.visual.sections.network.error_response_rewrites_hint'
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={addErrorResponseRewrite}
                        disabled={disabled}
                      >
                        {t('config_management.visual.sections.network.error_response_rewrites_add')}
                      </Button>
                    </div>

                    <div className={styles.errorRewriteNotice} role="note">
                      <div>
                        {t(
                          'config_management.visual.sections.network.error_response_rewrites_streaming_notice'
                        )}
                      </div>
                      <div>
                        {t(
                          'config_management.visual.sections.network.error_response_rewrites_trust_sse_notice'
                        )}
                      </div>
                    </div>

                    {values.errorResponseRewrites.length === 0 ? (
                      <div className={styles.emptyState}>
                        {t(
                          'config_management.visual.sections.network.error_response_rewrites_empty'
                        )}
                      </div>
                    ) : (
                      <div className={styles.blockStack}>
                        {values.errorResponseRewrites.map((rule, index) => {
                          const statusCodeError = getErrorResponseRewriteError(
                            rule.clientId,
                            'statusCode'
                          );
                          const messageContainsError = getErrorResponseRewriteError(
                            rule.clientId,
                            'messageContains'
                          );
                          const responseStatusCodeError = getErrorResponseRewriteError(
                            rule.clientId,
                            'responseStatusCode'
                          );
                          const responseBodyError = getErrorResponseRewriteError(
                            rule.clientId,
                            'responseBody'
                          );
                          const responseBodyId = `error-response-rewrite-body-${rule.clientId}`;
                          const responseBodyHintId = `${responseBodyId}-hint`;
                          const responseBodyErrorId = `${responseBodyId}-error`;

                          return (
                            <div key={rule.clientId} className={styles.ruleCard}>
                              <div className={styles.ruleCardHeader}>
                                <div className={styles.ruleCardTitle}>
                                  {t(
                                    'config_management.visual.sections.network.error_response_rewrites_rule',
                                    { index: index + 1 }
                                  )}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeErrorResponseRewrite(rule.clientId)}
                                  disabled={disabled}
                                >
                                  {t('config_management.visual.common.delete')}
                                </Button>
                              </div>

                              <div className={styles.errorResponseRewriteGrid}>
                                <Input
                                  label={t(
                                    'config_management.visual.sections.network.error_response_rewrites_status_code'
                                  )}
                                  type="number"
                                  min={0}
                                  max={599}
                                  placeholder="400"
                                  value={rule.statusCode}
                                  onChange={(event) =>
                                    updateErrorResponseRewrite(rule.clientId, {
                                      statusCode: event.target.value,
                                    })
                                  }
                                  disabled={disabled}
                                  hint={t(
                                    'config_management.visual.sections.network.error_response_rewrites_status_code_hint'
                                  )}
                                  error={statusCodeError}
                                />
                                <Input
                                  label={t(
                                    'config_management.visual.sections.network.error_response_rewrites_message_contains'
                                  )}
                                  placeholder={t(
                                    'config_management.visual.sections.network.error_response_rewrites_message_placeholder'
                                  )}
                                  value={rule.messageContains}
                                  onChange={(event) =>
                                    updateErrorResponseRewrite(rule.clientId, {
                                      messageContains: event.target.value,
                                    })
                                  }
                                  disabled={disabled}
                                  hint={t(
                                    'config_management.visual.sections.network.error_response_rewrites_message_hint'
                                  )}
                                  error={messageContainsError}
                                />
                                <Input
                                  label={t(
                                    'config_management.visual.sections.network.error_response_rewrites_response_status_code'
                                  )}
                                  type="number"
                                  min={0}
                                  max={599}
                                  placeholder="429"
                                  value={rule.responseStatusCode}
                                  onChange={(event) =>
                                    updateErrorResponseRewrite(rule.clientId, {
                                      responseStatusCode: event.target.value,
                                    })
                                  }
                                  disabled={disabled}
                                  hint={t(
                                    'config_management.visual.sections.network.error_response_rewrites_response_status_code_hint'
                                  )}
                                  error={responseStatusCodeError}
                                />
                              </div>

                              <ToggleRow
                                title={t(
                                  'config_management.visual.sections.network.error_response_rewrites_response_body'
                                )}
                                description={t(
                                  'config_management.visual.sections.network.error_response_rewrites_response_body_toggle_hint'
                                )}
                                checked={rule.responseBodyEnabled}
                                onChange={(responseBodyEnabled) =>
                                  updateErrorResponseRewrite(rule.clientId, { responseBodyEnabled })
                                }
                                disabled={disabled}
                              />

                              {rule.responseBodyEnabled ? (
                                <FieldShell
                                  label={t(
                                    'config_management.visual.sections.network.error_response_rewrites_response_body_json'
                                  )}
                                  htmlFor={responseBodyId}
                                  hint={t(
                                    'config_management.visual.sections.network.error_response_rewrites_response_body_hint'
                                  )}
                                  hintId={responseBodyHintId}
                                  error={responseBodyError}
                                  errorId={responseBodyErrorId}
                                >
                                  <div className={styles.fieldControl}>
                                    <textarea
                                      id={responseBodyId}
                                      className={`input ${styles.fieldTextarea} ${styles.errorResponseBodyEditor}`}
                                      value={rule.responseBody}
                                      onChange={(event) =>
                                        updateErrorResponseRewrite(rule.clientId, {
                                          responseBody: event.target.value,
                                        })
                                      }
                                      disabled={disabled}
                                      rows={5}
                                      spellCheck={false}
                                      aria-invalid={Boolean(responseBodyError)}
                                      aria-describedby={`${responseBodyHintId} ${responseBodyError ? responseBodyErrorId : ''}`.trim()}
                                    />
                                  </div>
                                </FieldShell>
                              ) : responseBodyError ? (
                                <div className="error-box">{responseBodyError}</div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </SettingsDisclosure>
                </PageGroup>

                <PageGroup active={activePageId === 'global-network'}>
                  <SettingsDisclosure
                    id="config-network-session"
                    title={t('config_management.settings_center.disclosures.session_access.title')}
                    description={t(
                      'config_management.settings_center.disclosures.session_access.description'
                    )}
                    focusTarget={focusTarget}
                    targetIds={[
                      'config-force-model-prefix',
                      'config-session-affinity',
                      'config-ws-auth',
                    ]}
                    dirty={sessionSettingsDirty}
                  >
                    <SectionGrid>
                      <div id="config-force-model-prefix" className={styles.pageGroup}>
                        <ToggleRow
                          title={t('config_management.visual.sections.network.force_model_prefix')}
                          description={t(
                            'config_management.visual.sections.network.force_model_prefix_desc'
                          )}
                          checked={values.forceModelPrefix}
                          disabled={disabled}
                          onChange={(forceModelPrefix) => onChange({ forceModelPrefix })}
                        />
                      </div>
                      <div id="config-session-affinity" className={styles.pageGroup}>
                        <ToggleRow
                          title={t('config_management.visual.sections.network.session_affinity')}
                          checked={values.routingSessionAffinity}
                          disabled={disabled}
                          onChange={(routingSessionAffinity) =>
                            onChange({ routingSessionAffinity })
                          }
                        />
                        <ToggleRow
                          title={t(
                            'config_management.visual.sections.network.session_affinity_failover'
                          )}
                          description={t(
                            'config_management.visual.sections.network.session_affinity_failover_desc'
                          )}
                          checked={values.routingSessionAffinityFailover}
                          disabled={disabled}
                          onChange={(routingSessionAffinityFailover) =>
                            onChange({ routingSessionAffinityFailover })
                          }
                        />
                      </div>
                      <Input
                        label={t('config_management.visual.sections.network.session_affinity_ttl')}
                        placeholder="1h"
                        value={values.routingSessionAffinityTTL}
                        onChange={(e) => onChange({ routingSessionAffinityTTL: e.target.value })}
                        disabled={disabled}
                      />
                      <div id="config-ws-auth" className={styles.pageGroup}>
                        <ToggleRow
                          title={t('config_management.visual.sections.network.ws_auth')}
                          description={t('config_management.visual.sections.network.ws_auth_desc')}
                          checked={values.wsAuth}
                          disabled={disabled}
                          onChange={(wsAuth) => onChange({ wsAuth })}
                        />
                      </div>
                    </SectionGrid>
                  </SettingsDisclosure>
                </PageGroup>

                <PageGroup id="config-codex-fingerprint" active={activePageId === 'provider-codex'}>
                  <SectionGrid>
                    <ToggleRow
                      title={t('config_management.visual.sections.network.codex_identity_confuse')}
                      description={t(
                        'config_management.visual.sections.network.codex_identity_confuse_desc'
                      )}
                      checked={values.codexIdentityConfuse}
                      disabled={disabled}
                      onChange={(codexIdentityConfuse) => onChange({ codexIdentityConfuse })}
                    />
                    <ToggleRow
                      title={t(
                        'config_management.visual.sections.network.codex_spoof_session_identity'
                      )}
                      description={t(
                        'config_management.visual.sections.network.codex_spoof_session_identity_desc'
                      )}
                      checked={values.codexSpoofSessionIdentity}
                      disabled={disabled}
                      onChange={(codexSpoofSessionIdentity) =>
                        onChange({ codexSpoofSessionIdentity })
                      }
                    />
                    <FieldShell
                      label={t('config_management.visual.sections.network.codex_turn_state_policy')}
                      htmlFor="config-codex-turn-state-policy"
                      hint={codexTurnStatePolicyHint}
                    >
                      <Select
                        id="config-codex-turn-state-policy"
                        value={values.codexTurnStatePolicy}
                        options={codexTurnStatePolicyOptions}
                        disabled={disabled}
                        onChange={(codexTurnStatePolicy) =>
                          onChange({
                            codexTurnStatePolicy: codexTurnStatePolicy as CodexTurnStatePolicy,
                          })
                        }
                      />
                    </FieldShell>
                    <FieldShell
                      label={t(
                        'config_management.visual.sections.network.codex_fingerprint_default_mode'
                      )}
                      htmlFor="config-codex-fingerprint-default-mode"
                      hint={t(
                        'config_management.visual.sections.network.codex_fingerprint_default_mode_desc'
                      )}
                    >
                      <Select
                        id="config-codex-fingerprint-default-mode"
                        value={values.codexFingerprintDefaultMode}
                        options={codexFingerprintDefaultModeOptions}
                        disabled={disabled}
                        onChange={(codexFingerprintDefaultMode) =>
                          onChange({
                            codexFingerprintDefaultMode:
                              codexFingerprintDefaultMode as CodexFingerprintDefaultMode,
                          })
                        }
                      />
                    </FieldShell>
                    <Input
                      id="config-codex-fingerprint-session-identity-pool-size"
                      type="number"
                      min={MIN_CODEX_SESSION_IDENTITY_POOL_SIZE}
                      max={MAX_CODEX_SESSION_IDENTITY_POOL_SIZE}
                      step={1}
                      label={t(
                        'config_management.visual.sections.network.codex_fingerprint_session_identity_pool_size'
                      )}
                      hint={t(
                        'config_management.visual.sections.network.codex_fingerprint_session_identity_pool_size_desc'
                      )}
                      error={codexFingerprintSessionIdentityPoolSizeError}
                      value={values.codexFingerprintSessionIdentityPoolSize}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({
                          codexFingerprintSessionIdentityPoolSize: event.target.value,
                        })
                      }
                    />
                    <ToggleRow
                      title={t('config_management.visual.sections.network.codex_fingerprint_ja3')}
                      description={t(
                        'config_management.visual.sections.network.codex_fingerprint_ja3_desc'
                      )}
                      checked={values.codexFingerprintJA3}
                      disabled={disabled}
                      onChange={(codexFingerprintJA3) =>
                        onChange({
                          codexFingerprintJA3,
                          ...(codexFingerprintJA3
                            ? {
                                codexFingerprintForceHTTP1: false,
                                codexFingerprintImagesForceHTTP1: false,
                              }
                            : {}),
                        })
                      }
                    />
                    <ToggleRow
                      title={t(
                        'config_management.visual.sections.network.codex_fingerprint_force_http1'
                      )}
                      description={t(
                        'config_management.visual.sections.network.codex_fingerprint_force_http1_desc'
                      )}
                      checked={values.codexFingerprintForceHTTP1}
                      disabled={disabled || values.codexFingerprintJA3}
                      onChange={(codexFingerprintForceHTTP1) =>
                        onChange({
                          codexFingerprintForceHTTP1,
                          ...(codexFingerprintForceHTTP1 ? { codexFingerprintJA3: false } : {}),
                        })
                      }
                    />
                    <ToggleRow
                      title={t(
                        'config_management.visual.sections.network.codex_fingerprint_images_force_http1'
                      )}
                      description={t(
                        'config_management.visual.sections.network.codex_fingerprint_images_force_http1_desc'
                      )}
                      checked={values.codexFingerprintImagesForceHTTP1}
                      disabled={disabled || values.codexFingerprintJA3}
                      onChange={(codexFingerprintImagesForceHTTP1) =>
                        onChange({
                          codexFingerprintImagesForceHTTP1,
                          ...(codexFingerprintImagesForceHTTP1
                            ? { codexFingerprintJA3: false }
                            : {}),
                        })
                      }
                    />
                  </SectionGrid>

                  <div id="config-codex-headers">
                    <SectionGrid>
                      <ToggleRow
                        title={t(
                          'config_management.visual.sections.network.codex_enforce_software_identity'
                        )}
                        description={t(
                          'config_management.visual.sections.network.codex_enforce_software_identity_desc'
                        )}
                        checked={values.codexEnforceSoftwareIdentity}
                        disabled={disabled}
                        onChange={(codexEnforceSoftwareIdentity) =>
                          onChange({ codexEnforceSoftwareIdentity })
                        }
                      />
                      <Input
                        label={t(
                          'config_management.visual.sections.network.codex_header_defaults_user_agent'
                        )}
                        value={values.codexHeaderDefaultsUserAgent}
                        onChange={(e) => onChange({ codexHeaderDefaultsUserAgent: e.target.value })}
                        hint={t(
                          'config_management.visual.sections.network.codex_header_defaults_user_agent_hint'
                        )}
                        disabled={disabled}
                      />
                      <Input
                        label={t(
                          'config_management.visual.sections.network.codex_header_defaults_beta_features'
                        )}
                        value={values.codexHeaderDefaultsBetaFeatures}
                        onChange={(e) =>
                          onChange({ codexHeaderDefaultsBetaFeatures: e.target.value })
                        }
                        disabled={disabled}
                      />
                      <Input
                        label={t(
                          'config_management.visual.sections.network.codex_header_defaults_originator'
                        )}
                        value={values.codexHeaderDefaultsOriginator}
                        onChange={(e) =>
                          onChange({ codexHeaderDefaultsOriginator: e.target.value })
                        }
                        disabled={disabled}
                      />
                    </SectionGrid>
                  </div>
                </PageGroup>
              </SectionStack>
            </ConfigSection>

            <ConfigSection
              id="images"
              hidden={activePageId !== 'provider-codex'}
              icon={<IconDiamond size={16} />}
              title={t('config_management.visual.sections.images.title')}
              description={t('config_management.visual.sections.images.description')}
            >
              <SectionStack>
                <SectionSubsection
                  title={t('config_management.visual.sections.images.native_title')}
                  description={t('config_management.visual.sections.images.native_description')}
                >
                  <div className={styles.blockStack}>
                    <NativeImageEndpointEditor
                      targetPrefix="images-native-generations"
                      title={t('config_management.visual.sections.images.native_generations_title')}
                      description={t(
                        'config_management.visual.sections.images.native_generations_description'
                      )}
                      value={values.images.native.generations}
                      disabled={disabled}
                      dirty={nativeGenerationsDirty}
                      statusCodeError={imagesNativeGenerationsStatusCodeError}
                      focusTarget={focusTarget}
                      onChange={(generations) =>
                        onChange({
                          images: {
                            ...values.images,
                            native: {
                              ...values.images.native,
                              generations,
                            },
                          },
                        })
                      }
                    />
                    <NativeImageEndpointEditor
                      targetPrefix="images-native-edits"
                      title={t('config_management.visual.sections.images.native_edits_title')}
                      description={t(
                        'config_management.visual.sections.images.native_edits_description'
                      )}
                      value={values.images.native.edits}
                      disabled={disabled}
                      dirty={nativeEditsDirty}
                      statusCodeError={imagesNativeEditsStatusCodeError}
                      focusTarget={focusTarget}
                      onChange={(edits) =>
                        onChange({
                          images: {
                            ...values.images,
                            native: {
                              ...values.images.native,
                              edits,
                            },
                          },
                        })
                      }
                    />
                  </div>
                </SectionSubsection>

                <div id="config-images-stream-flush">
                  <SectionSubsection
                    title={t('config_management.visual.sections.images.stream_flush_settings')}
                    description={t(
                      'config_management.visual.sections.images.stream_flush_settings_desc'
                    )}
                  >
                    <ImagesStreamFlushSettings
                      values={values}
                      disabled={disabled}
                      intervalError={imagesStreamFlushIntervalError}
                      minBytesError={imagesStreamFlushMinBytesError}
                      onChange={onChange}
                    />
                  </SectionSubsection>
                </div>

                <ConfigDisclosure
                  id="config-images-legacy"
                  title={t(
                    'config_management.visual.sections.images.legacy_responses_tool_settings'
                  )}
                  description={t(
                    'config_management.visual.sections.images.legacy_responses_tool_settings_desc'
                  )}
                  summary={t(
                    collapseLegacyImagesSettings
                      ? 'config_management.settings_center.legacy_images_optional'
                      : 'config_management.settings_center.legacy_images_active'
                  )}
                  expanded={
                    legacyImagesExpanded ||
                    focusTarget === 'config-images-legacy' ||
                    Boolean(imagesUnsupportedStatusCodeError) ||
                    legacyImagesDirty
                  }
                  onExpandedChange={(expanded) => {
                    setLegacyImagesExpandedPreference(expanded);
                    localStorage.setItem(legacyImagesExpansionStorageKey, String(expanded));
                  }}
                  dirty={legacyImagesDirty}
                  errorCount={imagesUnsupportedStatusCodeError ? 1 : 0}
                >
                  <LegacyImagesSettings
                    values={values}
                    disabled={disabled}
                    unsupportedStatusCodeError={imagesUnsupportedStatusCodeError}
                    onChange={onChange}
                  />
                </ConfigDisclosure>
              </SectionStack>
            </ConfigSection>

            <ConfigSection
              id="quota"
              hidden={!['global-request', 'provider-antigravity'].includes(activePageId)}
              icon={<IconTimer size={16} />}
              title={t(
                activePageId === 'provider-antigravity'
                  ? 'config_management.settings_center.subsections.antigravity_credits'
                  : 'config_management.visual.sections.quota.title'
              )}
              description={t(
                activePageId === 'provider-antigravity'
                  ? 'config_management.settings_center.subsections.antigravity_credits_desc'
                  : 'config_management.visual.sections.quota.description'
              )}
            >
              <SectionStack>
                <PageGroup
                  id="config-antigravity-credits"
                  active={activePageId === 'provider-antigravity'}
                >
                  <SectionGrid>
                    <ToggleRow
                      title={t('config_management.visual.sections.quota.antigravity_credits')}
                      description={t(
                        'config_management.visual.sections.quota.antigravity_credits_desc'
                      )}
                      checked={values.quotaAntigravityCredits}
                      disabled={disabled}
                      onChange={(quotaAntigravityCredits) => onChange({ quotaAntigravityCredits })}
                    />
                  </SectionGrid>
                </PageGroup>
                <PageGroup active={activePageId === 'global-request'}>
                  <SettingsDisclosure
                    id="config-fixed-error-cooldowns"
                    title={t('config_management.visual.sections.quota.fixed_error_cooldowns')}
                    description={t(
                      'config_management.visual.sections.quota.fixed_error_cooldowns_desc'
                    )}
                    summary={t('config_management.settings_center.rules_summary', {
                      count: values.fixedErrorCooldowns.length,
                    })}
                    focusTarget={focusTarget}
                    dirty={fixedErrorCooldownsDirty}
                    errorCount={fixedErrorCooldownsErrorCount}
                  >
                    <div className={styles.blockHeaderRow}>
                      <div className={styles.fieldHint}>
                        {t('config_management.visual.sections.quota.fixed_error_cooldowns_hint')}
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={addFixedErrorCooldown}
                        disabled={disabled}
                      >
                        {t('config_management.visual.sections.quota.fixed_error_cooldowns_add')}
                      </Button>
                    </div>
                    {values.fixedErrorCooldowns.length === 0 ? (
                      <div className={styles.emptyState}>
                        {t('config_management.visual.sections.quota.fixed_error_cooldowns_empty')}
                      </div>
                    ) : (
                      <div className={styles.blockStack}>
                        {values.fixedErrorCooldowns.map((rule, index) => {
                          const statusCodeError = getFixedErrorCooldownError(
                            rule.clientId,
                            'statusCode'
                          );
                          const cooldownSecondsError = getFixedErrorCooldownError(
                            rule.clientId,
                            'cooldownSeconds'
                          );
                          const messageContainsError = getFixedErrorCooldownError(
                            rule.clientId,
                            'messageContains'
                          );

                          return (
                            <div key={rule.clientId} className={styles.ruleCard}>
                              <div className={styles.ruleCardHeader}>
                                <div className={styles.ruleCardTitle}>
                                  {t(
                                    'config_management.visual.sections.quota.fixed_error_cooldowns_rule',
                                    {
                                      index: index + 1,
                                    }
                                  )}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeFixedErrorCooldown(rule.clientId)}
                                  disabled={disabled}
                                >
                                  {t('config_management.visual.common.delete')}
                                </Button>
                              </div>
                              <div className={styles.fixedCooldownGrid}>
                                <Input
                                  label={t(
                                    'config_management.visual.sections.quota.fixed_error_cooldowns_status_code'
                                  )}
                                  type="number"
                                  placeholder="401"
                                  value={rule.statusCode}
                                  onChange={(event) =>
                                    updateFixedErrorCooldown(rule.clientId, {
                                      statusCode: event.target.value,
                                    })
                                  }
                                  disabled={disabled}
                                  error={statusCodeError}
                                />
                                <Input
                                  label={t(
                                    'config_management.visual.sections.quota.fixed_error_cooldowns_cooldown_seconds'
                                  )}
                                  type="number"
                                  placeholder="2592000"
                                  value={rule.cooldownSeconds}
                                  onChange={(event) =>
                                    updateFixedErrorCooldown(rule.clientId, {
                                      cooldownSeconds: event.target.value,
                                    })
                                  }
                                  disabled={disabled}
                                  error={cooldownSecondsError}
                                />
                                <div className="form-group">
                                  <label>
                                    {t(
                                      'config_management.visual.sections.quota.fixed_error_cooldowns_scope'
                                    )}
                                  </label>
                                  <Select
                                    value={rule.scope}
                                    options={fixedErrorCooldownScopeOptions}
                                    disabled={disabled}
                                    ariaLabel={t(
                                      'config_management.visual.sections.quota.fixed_error_cooldowns_scope'
                                    )}
                                    onChange={(scope) =>
                                      updateFixedErrorCooldown(rule.clientId, {
                                        scope: scope as FixedErrorCooldownScope,
                                      })
                                    }
                                  />
                                </div>
                              </div>
                              <Input
                                label={t(
                                  'config_management.visual.sections.quota.fixed_error_cooldowns_message_contains'
                                )}
                                placeholder={t(
                                  'config_management.visual.sections.quota.fixed_error_cooldowns_message_placeholder'
                                )}
                                value={rule.messageContains}
                                onChange={(event) =>
                                  updateFixedErrorCooldown(rule.clientId, {
                                    messageContains: event.target.value,
                                  })
                                }
                                disabled={disabled}
                                hint={t(
                                  'config_management.visual.sections.quota.fixed_error_cooldowns_message_hint'
                                )}
                                error={messageContainsError}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </SettingsDisclosure>
                  <SettingsDisclosure
                    id="config-no-cooldown-status-codes"
                    title={t(
                      'config_management.settings_center.disclosures.cooldown_exceptions.title'
                    )}
                    description={t(
                      'config_management.settings_center.disclosures.cooldown_exceptions.description'
                    )}
                    focusTarget={focusTarget}
                    dirty={noCooldownStatusCodesDirty}
                    errorCount={noCooldownStatusCodesError ? 1 : 0}
                  >
                    <FieldShell
                      label={t('config_management.visual.sections.quota.no_cooldown_status_codes')}
                      htmlFor={noCooldownStatusCodesInputId}
                      hint={t(
                        'config_management.visual.sections.quota.no_cooldown_status_codes_desc'
                      )}
                      hintId={noCooldownStatusCodesHintId}
                      error={noCooldownStatusCodesError}
                      errorId={noCooldownStatusCodesErrorId}
                    >
                      <div className={styles.fieldControl}>
                        <textarea
                          id={noCooldownStatusCodesInputId}
                          className={`input ${styles.fieldTextarea}`}
                          placeholder="404, 409"
                          value={values.noCooldownStatusCodes}
                          onChange={(e) => onChange({ noCooldownStatusCodes: e.target.value })}
                          disabled={disabled}
                          rows={3}
                          aria-invalid={Boolean(noCooldownStatusCodesError)}
                          aria-describedby={`${noCooldownStatusCodesHintId} ${noCooldownStatusCodesError ? noCooldownStatusCodesErrorId : ''}`.trim()}
                        />
                      </div>
                    </FieldShell>
                  </SettingsDisclosure>
                </PageGroup>
              </SectionStack>
            </ConfigSection>

            <ConfigSection
              id="config-auth-maintenance"
              hidden={activePageId !== 'global-observability'}
              icon={<IconShield size={16} />}
              title={t('config_management.visual.sections.maintenance.title')}
              description={t('config_management.visual.sections.maintenance.description')}
            >
              <SectionStack>
                <SectionGrid>
                  <ToggleRow
                    title={t('config_management.visual.sections.maintenance.enable')}
                    description={t('config_management.visual.sections.maintenance.enable_desc')}
                    checked={values.authMaintenance.enable}
                    disabled={disabled}
                    onChange={(enable) =>
                      onChange({
                        authMaintenance: {
                          ...values.authMaintenance,
                          enable,
                        },
                      })
                    }
                  />
                  <ToggleRow
                    title={t('config_management.visual.sections.maintenance.delete_quota_exceeded')}
                    description={t(
                      'config_management.visual.sections.maintenance.delete_quota_exceeded_desc'
                    )}
                    checked={values.authMaintenance.deleteQuotaExceeded}
                    disabled={disabled}
                    onChange={(deleteQuotaExceeded) =>
                      onChange({
                        authMaintenance: {
                          ...values.authMaintenance,
                          deleteQuotaExceeded,
                        },
                      })
                    }
                  />
                  <ToggleRow
                    title={t(
                      'config_management.visual.sections.maintenance.disable_quota_exceeded'
                    )}
                    description={t(
                      'config_management.visual.sections.maintenance.disable_quota_exceeded_desc'
                    )}
                    checked={values.authMaintenance.disableQuotaExceeded}
                    disabled={disabled}
                    onChange={(disableQuotaExceeded) =>
                      onChange({
                        authMaintenance: {
                          ...values.authMaintenance,
                          disableQuotaExceeded,
                        },
                      })
                    }
                  />
                </SectionGrid>

                <SectionGrid>
                  <Input
                    label={t('config_management.visual.sections.maintenance.scan_interval_seconds')}
                    type="number"
                    placeholder="30"
                    value={values.authMaintenance.scanIntervalSeconds}
                    onChange={(e) =>
                      onChange({
                        authMaintenance: {
                          ...values.authMaintenance,
                          scanIntervalSeconds: e.target.value,
                        },
                      })
                    }
                    disabled={disabled}
                    error={authMaintenanceScanIntervalError}
                  />
                  <Input
                    label={t(
                      'config_management.visual.sections.maintenance.delete_interval_seconds'
                    )}
                    type="number"
                    placeholder="5"
                    value={values.authMaintenance.deleteIntervalSeconds}
                    onChange={(e) =>
                      onChange({
                        authMaintenance: {
                          ...values.authMaintenance,
                          deleteIntervalSeconds: e.target.value,
                        },
                      })
                    }
                    disabled={disabled}
                    error={authMaintenanceDeleteIntervalError}
                    hint={t(
                      'config_management.visual.sections.maintenance.delete_interval_seconds_desc'
                    )}
                  />
                  <Input
                    label={t(
                      'config_management.visual.sections.maintenance.quota_strike_threshold'
                    )}
                    type="number"
                    placeholder="6"
                    value={values.authMaintenance.quotaStrikeThreshold}
                    onChange={(e) =>
                      onChange({
                        authMaintenance: {
                          ...values.authMaintenance,
                          quotaStrikeThreshold: e.target.value,
                        },
                      })
                    }
                    disabled={disabled}
                    error={authMaintenanceQuotaStrikeThresholdError}
                  />
                  <Input
                    label={t(
                      'config_management.visual.sections.maintenance.disable_quota_strike_threshold'
                    )}
                    type="number"
                    placeholder="6"
                    value={values.authMaintenance.disableQuotaStrikeThreshold}
                    onChange={(e) =>
                      onChange({
                        authMaintenance: {
                          ...values.authMaintenance,
                          disableQuotaStrikeThreshold: e.target.value,
                        },
                      })
                    }
                    disabled={disabled}
                    error={authMaintenanceDisableQuotaStrikeThresholdError}
                  />
                </SectionGrid>

                <FieldShell
                  label={t('config_management.visual.sections.maintenance.delete_status_codes')}
                  htmlFor={maintenanceDeleteStatusCodesInputId}
                  hint={t('config_management.visual.sections.maintenance.delete_status_codes_desc')}
                  hintId={maintenanceDeleteStatusCodesHintId}
                  error={authMaintenanceDeleteStatusCodesError}
                  errorId={maintenanceDeleteStatusCodesErrorId}
                >
                  <div className={styles.fieldControl}>
                    <textarea
                      id={maintenanceDeleteStatusCodesInputId}
                      className={`input ${styles.fieldTextarea}`}
                      placeholder="401, 403"
                      value={values.authMaintenance.deleteStatusCodes}
                      onChange={(e) =>
                        onChange({
                          authMaintenance: {
                            ...values.authMaintenance,
                            deleteStatusCodes: e.target.value,
                          },
                        })
                      }
                      disabled={disabled}
                      rows={3}
                      aria-invalid={Boolean(authMaintenanceDeleteStatusCodesError)}
                      aria-describedby={`${maintenanceDeleteStatusCodesHintId} ${authMaintenanceDeleteStatusCodesError ? maintenanceDeleteStatusCodesErrorId : ''}`.trim()}
                    />
                  </div>
                </FieldShell>
              </SectionStack>
            </ConfigSection>

            <ConfigSection
              id="config-streaming"
              hidden={activePageId !== 'global-streaming'}
              icon={<IconSatellite size={16} />}
              title={t('config_management.visual.sections.streaming.title')}
              description={t('config_management.visual.sections.streaming.description')}
            >
              <SectionStack>
                <SectionGrid>
                  <FieldShell
                    label={t('config_management.visual.sections.streaming.keepalive_seconds')}
                    htmlFor={keepaliveInputId}
                    hint={t('config_management.visual.sections.streaming.keepalive_hint')}
                    hintId={keepaliveHintId}
                    error={keepaliveError}
                    errorId={keepaliveErrorId}
                  >
                    <div className={styles.fieldControl}>
                      <input
                        id={keepaliveInputId}
                        className="input"
                        type="number"
                        placeholder="0"
                        value={values.streaming.keepaliveSeconds}
                        onChange={(e) =>
                          onChange({
                            streaming: {
                              ...values.streaming,
                              keepaliveSeconds: e.target.value,
                            },
                          })
                        }
                        disabled={disabled}
                      />
                      {isKeepaliveDisabled ? (
                        <span className={styles.inlinePill}>
                          {t('config_management.visual.sections.streaming.disabled')}
                        </span>
                      ) : null}
                    </div>
                  </FieldShell>

                  <Input
                    label={t('config_management.visual.sections.streaming.bootstrap_retries')}
                    type="number"
                    placeholder="1"
                    value={values.streaming.bootstrapRetries}
                    onChange={(e) =>
                      onChange({
                        streaming: {
                          ...values.streaming,
                          bootstrapRetries: e.target.value,
                        },
                      })
                    }
                    disabled={disabled}
                    hint={t('config_management.visual.sections.streaming.bootstrap_hint')}
                    error={bootstrapRetriesError}
                  />
                </SectionGrid>

                <SectionGrid>
                  <Input
                    label={t(
                      'config_management.visual.sections.streaming.stream_flush_interval_ms'
                    )}
                    type="number"
                    placeholder="0"
                    value={values.streaming.streamFlushIntervalMs}
                    onChange={(e) =>
                      onChange({
                        streaming: {
                          ...values.streaming,
                          streamFlushIntervalMs: e.target.value,
                        },
                      })
                    }
                    disabled={disabled}
                    hint={t(
                      'config_management.visual.sections.streaming.stream_flush_interval_hint'
                    )}
                    error={streamFlushIntervalError}
                  />
                  <Input
                    label={t('config_management.visual.sections.streaming.stream_flush_min_bytes')}
                    type="number"
                    placeholder="0"
                    value={values.streaming.streamFlushMinBytes}
                    onChange={(e) =>
                      onChange({
                        streaming: {
                          ...values.streaming,
                          streamFlushMinBytes: e.target.value,
                        },
                      })
                    }
                    disabled={disabled}
                    hint={t(
                      'config_management.visual.sections.streaming.stream_flush_min_bytes_hint'
                    )}
                    error={streamFlushMinBytesError}
                  />
                </SectionGrid>

                <SectionGrid>
                  <ToggleRow
                    title={t('config_management.visual.sections.streaming.enable_stream_flush')}
                    description={t(
                      'config_management.visual.sections.streaming.enable_stream_flush_desc'
                    )}
                    checked={values.streaming.enableStreamFlush}
                    disabled={disabled}
                    onChange={(enableStreamFlush) =>
                      onChange({
                        streaming: {
                          ...values.streaming,
                          enableStreamFlush,
                        },
                      })
                    }
                  />
                  <ToggleRow
                    title={t('config_management.visual.sections.streaming.trust_upstream_sse')}
                    description={t(
                      'config_management.visual.sections.streaming.trust_upstream_sse_desc'
                    )}
                    checked={values.streaming.trustUpstreamSSE}
                    disabled={disabled}
                    onChange={(trustUpstreamSSE) =>
                      onChange({
                        streaming: {
                          ...values.streaming,
                          trustUpstreamSSE,
                        },
                      })
                    }
                  />
                </SectionGrid>

                <SectionGrid>
                  <FieldShell
                    label={t('config_management.visual.sections.streaming.nonstream_keepalive')}
                    htmlFor={nonstreamKeepaliveInputId}
                    hint={t('config_management.visual.sections.streaming.nonstream_keepalive_hint')}
                    hintId={nonstreamKeepaliveHintId}
                    error={nonstreamKeepaliveError}
                    errorId={nonstreamKeepaliveErrorId}
                  >
                    <div className={styles.fieldControl}>
                      <input
                        id={nonstreamKeepaliveInputId}
                        className="input"
                        type="number"
                        placeholder="0"
                        value={values.streaming.nonstreamKeepaliveInterval}
                        onChange={(e) =>
                          onChange({
                            streaming: {
                              ...values.streaming,
                              nonstreamKeepaliveInterval: e.target.value,
                            },
                          })
                        }
                        disabled={disabled}
                      />
                      {isNonstreamKeepaliveDisabled ? (
                        <span className={styles.inlinePill}>
                          {t('config_management.visual.sections.streaming.disabled')}
                        </span>
                      ) : null}
                    </div>
                  </FieldShell>
                </SectionGrid>
              </SectionStack>
            </ConfigSection>

            <ConfigSection
              id="config-payload-rules"
              hidden={activePageId !== 'advanced-payload'}
              icon={<IconCode size={16} />}
              title={t('config_management.visual.sections.payload.title')}
              description={t('config_management.visual.sections.payload.description')}
            >
              <SectionStack>
                <SectionSubsection
                  title={t('config_management.visual.sections.payload.default_rules')}
                  description={t('config_management.visual.sections.payload.default_rules_desc')}
                >
                  <PayloadRulesEditor
                    value={values.payloadDefaultRules}
                    disabled={disabled}
                    onChange={handlePayloadDefaultRulesChange}
                  />
                </SectionSubsection>

                <SectionSubsection
                  title={t('config_management.visual.sections.payload.default_raw_rules')}
                  description={t(
                    'config_management.visual.sections.payload.default_raw_rules_desc'
                  )}
                >
                  <PayloadRulesEditor
                    value={values.payloadDefaultRawRules}
                    disabled={disabled}
                    rawJsonValues
                    onChange={handlePayloadDefaultRawRulesChange}
                  />
                </SectionSubsection>

                <SectionSubsection
                  title={t('config_management.visual.sections.payload.override_rules')}
                  description={t('config_management.visual.sections.payload.override_rules_desc')}
                >
                  <PayloadRulesEditor
                    value={values.payloadOverrideRules}
                    disabled={disabled}
                    protocolFirst
                    onChange={handlePayloadOverrideRulesChange}
                  />
                </SectionSubsection>

                <SectionSubsection
                  title={t('config_management.visual.sections.payload.override_raw_rules')}
                  description={t(
                    'config_management.visual.sections.payload.override_raw_rules_desc'
                  )}
                >
                  <PayloadRulesEditor
                    value={values.payloadOverrideRawRules}
                    disabled={disabled}
                    protocolFirst
                    rawJsonValues
                    onChange={handlePayloadOverrideRawRulesChange}
                  />
                </SectionSubsection>

                <SectionSubsection
                  title={t('config_management.visual.sections.payload.filter_rules')}
                  description={t('config_management.visual.sections.payload.filter_rules_desc')}
                >
                  <PayloadFilterRulesEditor
                    value={values.payloadFilterRules}
                    disabled={disabled}
                    onChange={handlePayloadFilterRulesChange}
                  />
                </SectionSubsection>
              </SectionStack>
            </ConfigSection>
          </div>
        </main>
      </div>
    </div>
  );
}
