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
  FixedErrorCooldownScope,
  FixedErrorCooldownVisualEntry,
  NativeImageEndpointVisualConfig,
  NonRetryableErrorVisualEntry,
  PayloadFilterRule,
  PayloadParamValidationErrorCode,
  PayloadRule,
  RoutingPriorityOverrideStrategy,
  RoutingPriorityOverrideVisualEntry,
  VisualConfigFieldPath,
  VisualConfigValidationErrorCode,
  VisualConfigValidationErrors,
  VisualConfigValues,
} from '@/types/visualConfig';
import { makeClientId } from '@/types/visualConfig';
import { configApi, type ProxyUrlCheckResult } from '@/services/api/config';
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
  'global-credentials': IconKey,
  'global-network': IconTrendingUp,
  'global-request': IconTimer,
  'global-observability': IconDiamond,
  'global-streaming': IconSatellite,
  'provider-codex': IconCode,
  'provider-antigravity': IconShield,
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
  renderRequestBodyPanels?: (options: { focusTarget?: string }) => ReactNode;
  onChange: (values: Partial<VisualConfigValues>) => void;
}

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
  renderRequestBodyPanels,
  onChange,
}: VisualConfigEditorProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const [activePageId, setActivePageId] = useState<ConfigPageId>(() => {
    const resolvedSection = resolveConfigSection(sectionParam);
    if (resolvedSection) return resolvedSection.pageId;
    const persisted = localStorage.getItem('config-management:visual-page');
    return isConfigPageId(persisted) ? persisted : DEFAULT_CONFIG_PAGE_ID;
  });
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

  const portError = getValidationMessage(t, validationErrors?.port);
  const rmAccessPathError = getValidationMessage(t, validationErrors?.rmAccessPath);
  const logsMaxSizeError = getValidationMessage(t, validationErrors?.logsMaxTotalSizeMb);
  const usageStatisticsPersistIntervalError = getValidationMessage(
    t,
    validationErrors?.usageStatisticsPersistIntervalSeconds
  );
  const requestRetryError = getValidationMessage(t, validationErrors?.requestRetry);
  const maxRetryCredentialsError = getValidationMessage(t, validationErrors?.maxRetryCredentials);
  const maxRetryIntervalError = getValidationMessage(t, validationErrors?.maxRetryInterval);
  const routingFillFirstRangeError = getValidationMessage(
    t,
    validationErrors?.routingFillFirstRange
  );
  const routingFillFirstPerAuthRpmError = getValidationMessage(
    t,
    validationErrors?.routingFillFirstPerAuthRpm
  );
  const noCooldownStatusCodesError = getValidationMessage(
    t,
    validationErrors?.noCooldownStatusCodes
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
  const getRoutingPriorityOverrideError = useCallback(
    (
      clientId: string,
      field: 'priority' | 'maxRetryCredentials' | 'fillFirstRange' | 'fillFirstPerAuthRpm'
    ) =>
      getValidationMessage(t, validationErrors?.[`routingPriorityOverrides.${clientId}.${field}`]),
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
  const addAuthModelExclusion = useCallback(() => {
    handleAuthModelExclusionsChange([
      ...values.authModelExclusions,
      {
        clientId: makeClientId(),
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
      'global-credentials': authModelExclusionsErrorCount,
      'global-network':
        countErrors([
          'requestRetry',
          'maxRetryCredentials',
          'maxRetryInterval',
          'routingFillFirstRange',
          'routingFillFirstPerAuthRpm',
        ]) + routingPriorityOverridesErrorCount,
      'global-request':
        nonRetryableErrorsErrorCount +
        fixedErrorCooldownsErrorCount +
        countErrors(['noCooldownStatusCodes']) +
        requestBodyErrorCount,
      'global-observability': countErrors([
        'logsMaxTotalSizeMb',
        'usageStatisticsPersistIntervalSeconds',
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
          'disabledImageGenerationToolError.statusCode',
          'images.unsupportedStatusCode',
          'images.streamFlushIntervalMs',
          'images.streamFlushMinBytes',
          'images.native.generations.unsupportedModelStatusCode',
          'images.native.edits.unsupportedModelStatusCode',
        ]),
      'provider-antigravity': 0,
      'provider-grok': 0,
      'advanced-payload': hasPayloadValidationErrors ? 1 : 0,
    }),
    [
      authModelExclusionsErrorCount,
      authSectionErrorCount,
      countErrors,
      fixedErrorCooldownsErrorCount,
      hasPayloadValidationErrors,
      nonRetryableErrorsErrorCount,
      routingPriorityOverridesErrorCount,
      requestBodyErrorCount,
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
          (page.id === 'global-request' && requestBodyDirty),
      })),
    [dirtyFields, pageErrorCounts, requestBodyDirty, t]
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
            <div className={styles.requestBodyPanels} hidden={activePageId !== 'global-request'}>
              {renderRequestBodyPanels?.({ focusTarget })}
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
                  <div id="config-api-keys" className={styles.subsection}>
                    <ApiKeysCardEditor
                      value={values.apiKeysText}
                      savedValue={baselineValues.apiKeysText}
                      disabled={disabled}
                      active={activePageId === 'global-credentials'}
                      onChange={handleApiKeysTextChange}
                    />
                  </div>
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
                <PageGroup
                  id="config-auth-model-exclusions"
                  active={activePageId === 'global-credentials'}
                >
                  <SectionSubsection
                    title={t('config_management.visual.sections.auth.auth_model_exclusions')}
                    description={t(
                      'config_management.visual.sections.auth.auth_model_exclusions_desc'
                    )}
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
                                  error={matchError}
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
                  </SectionSubsection>
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
                    placeholder="0"
                    value={values.logsMaxTotalSizeMb}
                    onChange={(e) => onChange({ logsMaxTotalSizeMb: e.target.value })}
                    disabled={disabled}
                    error={logsMaxSizeError}
                  />
                  <Input
                    label={t('config_management.visual.sections.system.usage_statistics_persist')}
                    type="number"
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
                                  {proxyCheckResult.tls && <span>TLS: {proxyCheckResult.tls}</span>}
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
                    </div>
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
                      hint={t('config_management.visual.sections.network.max_retry_interval_hint')}
                      error={maxRetryIntervalError}
                    />
                    <div id="config-routing" className={styles.pageGroup}>
                      <FieldShell
                        label={t('config_management.visual.sections.network.routing_strategy')}
                        labelId={routingStrategyLabelId}
                        hint={t('config_management.visual.sections.network.routing_strategy_hint')}
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
                              label: t('config_management.visual.sections.network.strategy_random'),
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
                          onChange={(e) => onChange({ routingFillFirstPerAuthRpm: e.target.value })}
                          disabled={disabled}
                          hint={t(
                            'config_management.visual.sections.network.routing_fill_first_per_auth_rpm_hint'
                          )}
                          error={routingFillFirstPerAuthRpmError}
                        />
                      </>
                    )}
                    <Input
                      label={t('config_management.visual.sections.network.session_affinity_ttl')}
                      placeholder="1h"
                      value={values.routingSessionAffinityTTL}
                      onChange={(e) => onChange({ routingSessionAffinityTTL: e.target.value })}
                      disabled={disabled}
                    />
                  </SectionGrid>

                  <div id="config-routing-priority-overrides">
                    <SectionSubsection
                      title={t('config_management.visual.sections.network.priority_overrides')}
                      description={t(
                        'config_management.visual.sections.network.priority_overrides_desc'
                      )}
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
                            const strategyLabelId = `routing-priority-${rule.clientId}-strategy-label`;
                            const effectiveStrategy = rule.strategy || values.routingStrategy;

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
                                        hint={t(
                                          'config_management.visual.sections.network.priority_overrides_fill_first_per_auth_rpm_hint'
                                        )}
                                        error={fillFirstPerAuthRpmError}
                                      />
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </SectionSubsection>
                  </div>
                </PageGroup>

                <PageGroup
                  id="config-non-retryable-errors"
                  active={activePageId === 'global-request'}
                >
                  <SectionSubsection
                    title={t('config_management.visual.sections.network.non_retryable_errors')}
                    description={t(
                      'config_management.visual.sections.network.non_retryable_errors_desc'
                    )}
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
                  </SectionSubsection>
                </PageGroup>

                <SectionGrid>
                  <PageGroup active={activePageId === 'global-network'}>
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
                        onChange={(routingSessionAffinity) => onChange({ routingSessionAffinity })}
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
                    <div id="config-ws-auth" className={styles.pageGroup}>
                      <ToggleRow
                        title={t('config_management.visual.sections.network.ws_auth')}
                        description={t('config_management.visual.sections.network.ws_auth_desc')}
                        checked={values.wsAuth}
                        disabled={disabled}
                        onChange={(wsAuth) => onChange({ wsAuth })}
                      />
                    </div>
                  </PageGroup>
                </SectionGrid>

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
                      <Input
                        label={t(
                          'config_management.visual.sections.network.codex_header_defaults_user_agent'
                        )}
                        value={values.codexHeaderDefaultsUserAgent}
                        onChange={(e) => onChange({ codexHeaderDefaultsUserAgent: e.target.value })}
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
                <SectionGrid>
                  <PageGroup id="config-quota-fallback" active={activePageId === 'global-request'}>
                    <ToggleRow
                      title={t('config_management.visual.sections.quota.switch_project')}
                      description={t('config_management.visual.sections.quota.switch_project_desc')}
                      checked={values.quotaSwitchProject}
                      disabled={disabled}
                      onChange={(quotaSwitchProject) => onChange({ quotaSwitchProject })}
                    />
                    <ToggleRow
                      title={t('config_management.visual.sections.quota.switch_preview_model')}
                      description={t(
                        'config_management.visual.sections.quota.switch_preview_model_desc'
                      )}
                      checked={values.quotaSwitchPreviewModel}
                      disabled={disabled}
                      onChange={(quotaSwitchPreviewModel) => onChange({ quotaSwitchPreviewModel })}
                    />
                  </PageGroup>
                  <PageGroup
                    id="config-antigravity-credits"
                    active={activePageId === 'provider-antigravity'}
                  >
                    <ToggleRow
                      title={t('config_management.visual.sections.quota.antigravity_credits')}
                      description={t(
                        'config_management.visual.sections.quota.antigravity_credits_desc'
                      )}
                      checked={values.quotaAntigravityCredits}
                      disabled={disabled}
                      onChange={(quotaAntigravityCredits) => onChange({ quotaAntigravityCredits })}
                    />
                  </PageGroup>
                </SectionGrid>
                <PageGroup
                  id="config-fixed-error-cooldowns"
                  active={activePageId === 'global-request'}
                >
                  <SectionSubsection
                    title={t('config_management.visual.sections.quota.fixed_error_cooldowns')}
                    description={t(
                      'config_management.visual.sections.quota.fixed_error_cooldowns_desc'
                    )}
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
                  </SectionSubsection>
                  <div id="config-no-cooldown-status-codes">
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
                  </div>
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
