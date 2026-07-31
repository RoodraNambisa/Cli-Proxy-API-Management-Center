import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconChevronRight,
  IconDownload,
  IconEye,
  IconInfo,
  IconModelCluster,
  IconRefreshCw,
  IconSettings,
  IconTimer,
  IconTrash2,
} from '@/components/ui/icons';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import type { XaiAuthFileField } from '@/services/api';
import type { AuthFileItem, CodexAuthMode } from '@/types';
import { resolveAuthProvider, resolveCodexPlanType } from '@/utils/quota';
import { calculateStatusBarData, normalizeAuthIndex, type KeyStats } from '@/utils/usage';
import { formatDateTime, formatFileSize } from '@/utils/format';
import { parseTimestampMs } from '@/utils/timestamp';
import {
  QUOTA_PROVIDER_TYPES,
  formatModified,
  getAuthFileIcon,
  getAuthFileStatusMessage,
  getTypeColor,
  getTypeLabel,
  isRuntimeOnlyAuthFile,
  isXaiProvider,
  normalizeProviderKey,
  parseDisableCoolingValue,
  parsePriorityValue,
  readXaiAuthFileUsingApi,
  readXaiAuthFileWebsockets,
  resolveCodexAuthModeSummary,
  resolveAuthFileStats,
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import type { AuthFileStatusBarData } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import type { AuthFileUsageSummary } from '@/features/authFiles/hooks/useAuthFilesUsageSummary';
import { AuthFileQuotaSection } from '@/features/authFiles/components/AuthFileQuotaSection';
import { AuthFileUsageStatsPanel } from '@/features/authFiles/components/AuthFileUsageStatsPanel';
import styles from '@/pages/AuthFilesPage.module.scss';

const CHATGPT_WEB_CRITICAL_LIFECYCLE_STATES = new Set([
  'dead',
  'interaction_required',
  'reauth_required',
]);

const HEALTHY_STATUS_MESSAGES = new Set(['ok', 'healthy', 'ready', 'success', 'available']);
const PREMIUM_CODEX_PLAN_TYPES = new Set(['plus', 'team', 'pro', 'prolite']);

export type AuthFileCardProps = {
  file: AuthFileItem;
  cooldownAsOfMs: number;
  compact: boolean;
  selected: boolean;
  resolvedTheme: ResolvedTheme;
  disableControls: boolean;
  deleting: string | null;
  statusUpdating: Record<string, boolean>;
  xaiFieldsUpdating: Record<string, Partial<Record<XaiAuthFileField, boolean>>>;
  chatGptWebReloginUpdating?: Record<string, boolean>;
  chatGptWebAccountInfoRefreshing?: boolean;
  chatGptWebAccountInfoRefreshBusy?: boolean;
  chatGptWebAccountInfoRefreshUnsupported?: boolean;
  restoring?: Record<string, boolean>;
  codexIdentityConversionVisible?: boolean;
  codexIdentityConverting?: boolean;
  quotaFilterType: QuotaProviderType | null;
  keyStats: KeyStats;
  statusBarCache: Map<string, AuthFileStatusBarData>;
  usageSummaryCache: Map<string, AuthFileUsageSummary>;
  usageLoading: boolean;
  onShowModels: (file: AuthFileItem) => void;
  onDownload: (name: string) => void;
  onOpenPrefixProxyEditor: (file: AuthFileItem) => void;
  onDelete: (name: string) => void;
  onToggleStatus: (file: AuthFileItem, enabled: boolean) => void;
  onToggleXaiField: (file: AuthFileItem, field: XaiAuthFileField, value: boolean) => void;
  onChatGptWebRelogin?: (file: AuthFileItem) => void;
  onChatGptWebAccountInfoRefresh?: (file: AuthFileItem) => void;
  onRestore?: (file: AuthFileItem) => void;
  onConvertCodexAuthMode?: (file: AuthFileItem, targetMode: CodexAuthMode) => void;
  onToggleSelect: (name: string) => void;
};

const resolveQuotaType = (file: AuthFileItem): QuotaProviderType | null => {
  const provider = resolveAuthProvider(file);
  if (!QUOTA_PROVIDER_TYPES.has(provider as QuotaProviderType)) return null;
  return provider as QuotaProviderType;
};

export function AuthFileCard(props: AuthFileCardProps) {
  const { t } = useTranslation();
  const {
    file,
    cooldownAsOfMs,
    compact,
    selected,
    resolvedTheme,
    disableControls,
    deleting,
    statusUpdating,
    xaiFieldsUpdating,
    chatGptWebReloginUpdating = {},
    chatGptWebAccountInfoRefreshing = false,
    chatGptWebAccountInfoRefreshBusy = false,
    chatGptWebAccountInfoRefreshUnsupported = false,
    restoring = {},
    codexIdentityConversionVisible = false,
    codexIdentityConverting = false,
    quotaFilterType,
    keyStats,
    statusBarCache,
    usageSummaryCache,
    usageLoading,
    onShowModels,
    onDownload,
    onOpenPrefixProxyEditor,
    onDelete,
    onToggleStatus,
    onToggleXaiField,
    onChatGptWebRelogin = () => {},
    onChatGptWebAccountInfoRefresh = () => {},
    onRestore = () => {},
    onConvertCodexAuthMode,
    onToggleSelect,
  } = props;

  const fileStats = resolveAuthFileStats(file, keyStats);
  const isRuntimeOnly = isRuntimeOnlyAuthFile(file);
  const providerKey = normalizeProviderKey(String(file.provider ?? file.type ?? 'unknown'));
  const isRetiredGeminiCli = [file.provider, file.type].some(
    (value) => normalizeProviderKey(String(value ?? '')) === 'gemini-cli'
  );
  const isAistudio = providerKey === 'aistudio';
  const isXai = isXaiProvider(providerKey);
  const isChatGptWeb = providerKey === 'chatgpt-web';
  const isRetainedCodex =
    providerKey === 'codex' &&
    (file.retained_for_dependents === true || file.deletion_state === 'retained_for_dependents');
  const showModelsButton = !isRetiredGeminiCli && (!isRuntimeOnly || isAistudio || isXai);
  const typeColor = getTypeColor(providerKey, resolvedTheme);
  const typeLabel = getTypeLabel(t, providerKey);
  const providerIcon = getAuthFileIcon(providerKey, resolvedTheme);

  const resolvedQuotaType = resolveQuotaType(file);
  const quotaType =
    resolvedQuotaType === 'codex'
      ? 'codex'
      : quotaFilterType && resolvedQuotaType === quotaFilterType
        ? quotaFilterType
        : null;

  const showQuotaLayout = Boolean(quotaType) && !isRuntimeOnly && !compact;

  const providerCardClass =
    quotaType === 'antigravity'
      ? styles.antigravityCard
      : quotaType === 'claude'
        ? styles.claudeCard
        : quotaType === 'codex'
          ? styles.codexCard
          : quotaType === 'kimi'
            ? styles.kimiCard
            : quotaType === 'xai'
              ? styles.xaiCard
              : '';

  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndexKey = normalizeAuthIndex(rawAuthIndex);
  const statusData =
    (authIndexKey && statusBarCache.get(authIndexKey)) || calculateStatusBarData([]);
  const usageSummary = authIndexKey ? usageSummaryCache.get(authIndexKey) : undefined;
  const rawStatusMessage = getAuthFileStatusMessage(file);
  const lifecycleState = String(file.lifecycle_state ?? '')
    .trim()
    .toLowerCase();
  const lifecycleReason = String(file.lifecycle_reason ?? '').trim();
  const criticalLifecycleState = CHATGPT_WEB_CRITICAL_LIFECYCLE_STATES.has(lifecycleState);
  const lifecycleNeedsAttention = Boolean(lifecycleState && lifecycleState !== 'active');
  const credentialMode = String(file.credential_mode ?? '')
    .trim()
    .toLowerCase();
  const refreshStrategy = String(file.refresh_strategy ?? '')
    .trim()
    .toLowerCase();
  const tokenOnly = file.token_only === true || credentialMode === 'token_only';
  const sourceMissing = file.source_missing === true;
  const sourceAuthId = String(file.source_auth_id ?? '').trim();
  const dependentCountRaw = file.dependent_count;
  const dependentCount =
    typeof dependentCountRaw === 'number'
      ? Math.max(0, dependentCountRaw)
      : Math.max(0, Number.parseInt(String(dependentCountRaw ?? '0'), 10) || 0);
  const dependentNames = Array.isArray(file.dependent_names)
    ? file.dependent_names.map((name) => String(name).trim()).filter(Boolean)
    : [];
  const lifecycleLabelKey = lifecycleState
    ? `auth_files.chatgpt_web_lifecycle_${lifecycleState}`
    : '';
  const translatedLifecycleLabel = lifecycleLabelKey ? t(lifecycleLabelKey) : '';
  const lifecycleLabel =
    translatedLifecycleLabel && translatedLifecycleLabel !== lifecycleLabelKey
      ? translatedLifecycleLabel
      : lifecycleState;
  const credentialModeKey = credentialMode
    ? `auth_files.chatgpt_web_credential_modes.${credentialMode}`
    : '';
  const translatedCredentialMode = credentialModeKey ? t(credentialModeKey) : '';
  const credentialModeLabel =
    translatedCredentialMode && translatedCredentialMode !== credentialModeKey
      ? translatedCredentialMode
      : credentialMode || '-';
  const refreshStrategyKey = refreshStrategy
    ? `auth_files.chatgpt_web_refresh_strategies.${refreshStrategy}`
    : '';
  const translatedRefreshStrategy = refreshStrategyKey ? t(refreshStrategyKey) : '';
  const refreshStrategyLabel =
    translatedRefreshStrategy && translatedRefreshStrategy !== refreshStrategyKey
      ? translatedRefreshStrategy
      : refreshStrategy || '-';
  const chatGptWebStateLabel = criticalLifecycleState
    ? lifecycleLabel
    : sourceMissing
      ? t('auth_files.chatgpt_web_source_missing_state')
      : tokenOnly
        ? t('auth_files.chatgpt_web_token_only_state')
        : lifecycleLabel || t('auth_files.chatgpt_web_lifecycle_unknown');
  const lastErrorStatusCodeRaw = file.lastErrorStatusCode ?? file['last_error_status_code'];
  const lastErrorStatusCode =
    typeof lastErrorStatusCodeRaw === 'number'
      ? lastErrorStatusCodeRaw
      : typeof lastErrorStatusCodeRaw === 'string'
        ? Number.parseInt(lastErrorStatusCodeRaw, 10)
        : 0;
  const hasLastErrorStatusCode = Number.isFinite(lastErrorStatusCode) && lastErrorStatusCode > 0;
  const hasStatusWarning =
    isRetiredGeminiCli ||
    isRetainedCodex ||
    (isChatGptWeb && (sourceMissing || tokenOnly)) ||
    (isChatGptWeb && lifecycleNeedsAttention) ||
    hasLastErrorStatusCode ||
    (Boolean(rawStatusMessage) && !HEALTHY_STATUS_MESSAGES.has(rawStatusMessage.toLowerCase()));
  const displayStatusMessage = isRetiredGeminiCli
    ? t('auth_files.gemini_cli_unsupported')
    : rawStatusMessage;
  const healthStatusTitle = [
    hasLastErrorStatusCode ? `HTTP ${lastErrorStatusCode}` : '',
    displayStatusMessage,
  ]
    .filter(Boolean)
    .join(' ');

  const priorityValue = parsePriorityValue(file.priority ?? file['priority']);
  const cooldownUntilMs = parseTimestampMs(file.cooldownUntil ?? file.cooldown_until);
  const cooldownActive =
    (parseDisableCoolingValue(file.cooldownActive ?? file.cooldown_active) ?? false) &&
    Number.isFinite(cooldownUntilMs) &&
    cooldownUntilMs > cooldownAsOfMs;
  const cooldownScope = String(file.cooldownScope ?? file.cooldown_scope ?? '')
    .trim()
    .toLowerCase();
  const cooldownModelCountRaw = file.cooldownModelCount ?? file.cooldown_model_count;
  const cooldownModelCount =
    typeof cooldownModelCountRaw === 'number'
      ? cooldownModelCountRaw
      : Number.parseInt(String(cooldownModelCountRaw ?? '0'), 10) || 0;
  const cooldownUntilText = cooldownActive ? formatDateTime(new Date(cooldownUntilMs)) : '';
  const noteValue = typeof file.note === 'string' ? file.note.trim() : '';
  const xaiUsingApi = readXaiAuthFileUsingApi(file);
  const xaiWebsockets = readXaiAuthFileWebsockets(file);
  const xaiUsingApiUpdating = xaiFieldsUpdating[file.name]?.using_api === true;
  const xaiWebsocketsUpdating = xaiFieldsUpdating[file.name]?.websockets === true;
  const chatGptWebReloginBusy = chatGptWebReloginUpdating[file.name] === true;
  const restoreBusy = restoring[file.name] === true;
  const proxyBinding = file.proxy_binding;
  const metadataTime = (value: unknown) => {
    const timestamp = parseTimestampMs(value);
    return Number.isFinite(timestamp) ? formatDateTime(new Date(timestamp)) : '-';
  };
  const lifecycleUpdatedAt = metadataTime(file.lifecycle_updated_at);
  const tokenExpiresAt = metadataTime(file.token_expires_at);
  const lastLoginAt = metadataTime(file.last_login_at);
  const lastRefreshAt = metadataTime(file.last_refresh_at);
  const lastReloginAt = metadataTime(file.last_relogin_at);
  const chatGptWebPlanType = String(file.plan_type ?? file.planType ?? '').trim();
  const chatGptWebAccountType = String(file.account_type ?? '').trim();
  const imageQuotaState = String(file.quota_state ?? 'unknown')
    .trim()
    .toLowerCase();
  const imageQuotaRemainingRaw = file.image_quota_remaining;
  const imageQuotaRemaining =
    typeof imageQuotaRemainingRaw === 'number' && Number.isFinite(imageQuotaRemainingRaw)
      ? Math.max(0, imageQuotaRemainingRaw)
      : null;
  const imageQuotaExhausted = imageQuotaState === 'exhausted';
  const imageQuotaModelCooldown =
    isChatGptWeb && imageQuotaExhausted && cooldownActive && cooldownScope === 'model';
  const imageQuotaStale = file.quota_stale === true;
  const imageQuotaRefreshing = file.quota_refreshing === true;
  const imageQuotaResetAt = metadataTime(file.image_quota_reset_at);
  const imageQuotaUpdatedAt = metadataTime(file.quota_updated_at);
  const imageQuotaNextRefreshAt = metadataTime(file.quota_next_refresh_at);
  const imageQuotaLastError = String(file.quota_last_error ?? '').trim();
  const imageQuotaStateKey = `auth_files.chatgpt_web_image_quota_${imageQuotaState}`;
  const translatedImageQuotaState = t(imageQuotaStateKey);
  const imageQuotaStateLabel =
    translatedImageQuotaState !== imageQuotaStateKey
      ? translatedImageQuotaState
      : imageQuotaState || t('auth_files.chatgpt_web_image_quota_unknown');
  const codexPlanType = providerKey === 'codex' ? resolveCodexPlanType(file) : null;
  const codexPlanKey = codexPlanType ? `codex_quota.plan_${codexPlanType}` : '';
  const codexPlanLabel = codexPlanKey ? t(codexPlanKey) : '';
  const codexPlanDisplay =
    codexPlanLabel && codexPlanLabel !== codexPlanKey ? codexPlanLabel : codexPlanType;
  const codexPlanValueClass = PREMIUM_CODEX_PLAN_TYPES.has(codexPlanType ?? '')
    ? `${styles.codexPlanValue} ${styles.premiumPlanValue}`
    : styles.codexPlanValue;
  const codexAuthMode = resolveCodexAuthModeSummary(file);
  const stateLabel = isRetiredGeminiCli
    ? t('auth_files.health_status_unsupported')
    : isRuntimeOnly
      ? t('auth_files.type_virtual') || '虚拟认证文件'
      : isRetainedCodex
        ? t('auth_files.retained_codex_state')
        : file.disabled
          ? t('auth_files.health_status_disabled')
          : isChatGptWeb && criticalLifecycleState
            ? lifecycleLabel
            : isChatGptWeb && sourceMissing
              ? t('auth_files.chatgpt_web_source_missing_state')
              : isChatGptWeb && tokenOnly
                ? t('auth_files.chatgpt_web_token_only_state')
                : isChatGptWeb && lifecycleState
                  ? lifecycleLabel
                  : hasStatusWarning
                    ? t('auth_files.health_status_warning')
                    : rawStatusMessage
                      ? t('auth_files.health_status_healthy')
                      : t('auth_files.status_toggle_label');
  const stateBadgeClass = isRetiredGeminiCli
    ? styles.stateBadgeWarning
    : isRuntimeOnly
      ? styles.stateBadgeVirtual
      : isRetainedCodex
        ? styles.stateBadgeWarning
        : file.disabled
          ? styles.stateBadgeDisabled
          : isChatGptWeb &&
              (criticalLifecycleState || sourceMissing || tokenOnly || lifecycleNeedsAttention)
            ? styles.stateBadgeWarning
            : hasStatusWarning
              ? styles.stateBadgeWarning
              : styles.stateBadgeActive;
  const cooldownStatusText =
    cooldownScope === 'auth'
      ? t('auth_files.cooldown_auth_until', { until: cooldownUntilText })
      : t('auth_files.cooldown_models_until', {
          count: cooldownModelCount,
          until: cooldownUntilText,
        });
  const canOpenModelCooldownDetails = cooldownScope === 'model' && showModelsButton;
  return (
    <div
      className={`${styles.fileCard} ${compact ? styles.fileCardCompact : ''} ${providerCardClass} ${selected ? styles.fileCardSelected : ''} ${file.disabled ? styles.fileCardDisabled : ''}`}
    >
      <div className={styles.fileCardLayout}>
        <div className={styles.fileCardMain}>
          <div className={styles.cardHeader}>
            {!isRuntimeOnly && !isRetiredGeminiCli && (
              <SelectionCheckbox
                checked={selected}
                onChange={() => onToggleSelect(file.name)}
                className={styles.cardSelection}
                ariaLabel={
                  selected ? t('auth_files.batch_deselect') : t('auth_files.batch_select_all')
                }
                title={selected ? t('auth_files.batch_deselect') : t('auth_files.batch_select_all')}
              />
            )}
            <div
              className={styles.providerAvatar}
              style={{
                backgroundColor: typeColor.bg,
                color: typeColor.text,
                ...(typeColor.border ? { border: typeColor.border } : {}),
              }}
            >
              {providerIcon ? (
                <img src={providerIcon} alt="" className={styles.providerAvatarImage} />
              ) : (
                <span className={styles.providerAvatarFallback}>
                  {typeLabel.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className={styles.cardHeaderContent}>
              <div className={styles.cardBadgeRow}>
                <span
                  className={styles.typeBadge}
                  style={{
                    backgroundColor: typeColor.bg,
                    color: typeColor.text,
                    ...(typeColor.border ? { border: typeColor.border } : {}),
                  }}
                >
                  {typeLabel}
                </span>
                <span className={`${styles.stateBadge} ${stateBadgeClass}`}>{stateLabel}</span>
              </div>
              <span className={styles.fileName} title={file.name}>
                {file.name}
              </span>
              {!compact && noteValue && (
                <div className={styles.noteText} title={noteValue}>
                  <span className={styles.noteLabel}>{t('auth_files.note_display')}</span>
                  <span className={styles.noteValue}>{noteValue}</span>
                </div>
              )}
            </div>
          </div>

          <div className={`${styles.cardMeta} ${compact ? styles.cardMetaCompact : ''}`}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>{t('auth_files.file_size')}</span>
              <span className={styles.metaValue}>
                {file.size ? formatFileSize(file.size) : '-'}
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>{t('auth_files.file_modified')}</span>
              <span className={styles.metaValue}>{formatModified(file)}</span>
            </div>
            {priorityValue !== undefined && (
              <div className={`${styles.metaItem} ${styles.priorityBadge}`}>
                <span className={styles.metaLabel}>{t('auth_files.priority_display')}</span>
                <span className={`${styles.metaValue} ${styles.priorityValue}`}>
                  {priorityValue}
                </span>
              </div>
            )}
          </div>

          {codexPlanDisplay && (
            <div className={styles.codexPlan}>
              <span className={styles.codexPlanLabel}>{t('codex_quota.plan_label')}</span>
              <span className={codexPlanValueClass}>{codexPlanDisplay}</span>
            </div>
          )}

          {codexAuthMode && (
            <div
              className={`${styles.codexAuthModePanel} ${compact ? styles.codexAuthModePanelCompact : ''}`}
            >
              <div className={styles.codexAuthModeSummary}>
                <span>{t('auth_files.codex_identity_mode_label')}</span>
                <strong>{codexAuthMode.label}</strong>
              </div>
              {codexIdentityConversionVisible &&
                onConvertCodexAuthMode &&
                (codexAuthMode.canConvertToAgentIdentity || codexAuthMode.canConvertToOauth) && (
                  <div className={styles.codexAuthModeActions}>
                    {codexAuthMode.canConvertToAgentIdentity && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onConvertCodexAuthMode(file, 'agentIdentity')}
                        disabled={disableControls || codexIdentityConverting}
                        loading={codexIdentityConverting}
                      >
                        {t('auth_files.codex_identity_convert_to_agent')}
                      </Button>
                    )}
                    {codexAuthMode.canConvertToOauth && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onConvertCodexAuthMode(file, 'oauth')}
                        disabled={disableControls || codexIdentityConverting}
                        loading={codexIdentityConverting}
                      >
                        {t('auth_files.codex_identity_convert_to_oauth')}
                      </Button>
                    )}
                  </div>
                )}
            </div>
          )}

          {isRetainedCodex ? (
            <div
              className={styles.retainedCodexNotice}
              title={dependentNames.length > 0 ? dependentNames.join(', ') : undefined}
            >
              <IconInfo size={14} />
              <span>
                {t('auth_files.retained_codex_notice', {
                  count: dependentCount,
                })}
              </span>
            </div>
          ) : null}

          {isXai && (
            <div
              className={`${styles.xaiCredentialSettings} ${compact ? styles.xaiCredentialSettingsCompact : ''}`}
            >
              <div className={styles.xaiCredentialSetting}>
                <div className={styles.xaiCredentialSettingText}>
                  <span className={styles.xaiCredentialSettingLabel}>
                    {t('auth_files.using_api_label')}
                  </span>
                  {!compact && (
                    <span className={styles.xaiCredentialSettingHint}>
                      {t('auth_files.using_api_hint')}
                    </span>
                  )}
                </div>
                <ToggleSwitch
                  ariaLabel={t('auth_files.using_api_label')}
                  checked={xaiUsingApi}
                  disabled={disableControls || xaiUsingApiUpdating}
                  onChange={(value) => onToggleXaiField(file, 'using_api', value)}
                />
              </div>
              <div className={styles.xaiCredentialSetting}>
                <div className={styles.xaiCredentialSettingText}>
                  <span className={styles.xaiCredentialSettingLabel}>
                    {t('auth_files.websockets_label')}
                  </span>
                  {!compact && (
                    <span className={styles.xaiCredentialSettingHint}>
                      {t('auth_files.websockets_hint')}
                    </span>
                  )}
                </div>
                <ToggleSwitch
                  ariaLabel={t('auth_files.websockets_label')}
                  checked={xaiWebsockets}
                  disabled={disableControls || xaiWebsocketsUpdating}
                  onChange={(value) => onToggleXaiField(file, 'websockets', value)}
                />
              </div>
            </div>
          )}

          {isChatGptWeb && (
            <div className={styles.chatGptWebLifecyclePanel}>
              <div className={styles.chatGptWebLifecycleHeader}>
                <div>
                  <span className={styles.chatGptWebLifecycleLabel}>
                    {t('auth_files.chatgpt_web_lifecycle_label')}
                  </span>
                  <strong>{chatGptWebStateLabel}</strong>
                </div>
                {lifecycleReason ? <span>{lifecycleReason}</span> : null}
              </div>
              {!compact ? (
                <div className={styles.chatGptWebLifecycleGrid}>
                  <div>
                    <span>{t('auth_files.chatgpt_web_credential_mode')}</span>
                    <strong>{credentialModeLabel}</strong>
                  </div>
                  <div>
                    <span>{t('auth_files.chatgpt_web_refresh_strategy')}</span>
                    <strong>{refreshStrategyLabel}</strong>
                  </div>
                  <div>
                    <span>{t('auth_files.chatgpt_web_account_type')}</span>
                    <strong>{chatGptWebAccountType || '-'}</strong>
                  </div>
                  <div>
                    <span>{t('auth_files.chatgpt_web_plan_type')}</span>
                    <strong>{chatGptWebPlanType || '-'}</strong>
                  </div>
                  <div>
                    <span>{t('auth_files.chatgpt_web_source_auth')}</span>
                    <strong>{sourceAuthId || '-'}</strong>
                  </div>
                  <div>
                    <span>{t('auth_files.chatgpt_web_lifecycle_updated')}</span>
                    <strong>{lifecycleUpdatedAt}</strong>
                  </div>
                  <div>
                    <span>{t('auth_files.chatgpt_web_token_expires')}</span>
                    <strong>{tokenExpiresAt}</strong>
                  </div>
                  <div>
                    <span>{t('auth_files.chatgpt_web_token_status')}</span>
                    <strong>
                      {typeof file.token_expired !== 'boolean' &&
                      typeof file.token_refreshable !== 'boolean'
                        ? t('auth_files.chatgpt_web_token_unknown')
                        : file.token_expired
                          ? t('auth_files.chatgpt_web_token_expired')
                          : file.token_refreshable
                            ? t('auth_files.chatgpt_web_token_refreshable')
                            : t('auth_files.chatgpt_web_token_active')}
                    </strong>
                  </div>
                  <div>
                    <span>{t('auth_files.chatgpt_web_last_login')}</span>
                    <strong>{lastLoginAt}</strong>
                  </div>
                  <div>
                    <span>{t('auth_files.chatgpt_web_last_refresh')}</span>
                    <strong>{lastRefreshAt}</strong>
                  </div>
                  <div>
                    <span>{t('auth_files.chatgpt_web_last_relogin')}</span>
                    <strong>{lastReloginAt}</strong>
                  </div>
                </div>
              ) : null}
              <div
                className={`${styles.chatGptWebImageQuota} ${
                  imageQuotaExhausted
                    ? styles.chatGptWebImageQuotaExhausted
                    : imageQuotaState === 'available'
                      ? styles.chatGptWebImageQuotaAvailable
                      : styles.chatGptWebImageQuotaUnknown
                }`}
              >
                <div className={styles.chatGptWebImageQuotaHeader}>
                  <div>
                    <span>{t('auth_files.chatgpt_web_image_quota_label')}</span>
                    <strong>{imageQuotaStateLabel}</strong>
                  </div>
                  <div className={styles.chatGptWebImageQuotaFlags}>
                    {chatGptWebAccountType ? <span>{chatGptWebAccountType}</span> : null}
                    {imageQuotaRefreshing || chatGptWebAccountInfoRefreshing ? (
                      <span>{t('auth_files.chatgpt_web_image_quota_refreshing')}</span>
                    ) : null}
                    {imageQuotaStale ? (
                      <span>{t('auth_files.chatgpt_web_image_quota_stale')}</span>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onChatGptWebAccountInfoRefresh(file)}
                      className={styles.chatGptWebImageQuotaRefreshButton}
                      title={
                        chatGptWebAccountInfoRefreshUnsupported
                          ? t('auth_files.chatgpt_web_account_refresh_unsupported')
                          : t('auth_files.chatgpt_web_account_refresh_one')
                      }
                      aria-label={t('auth_files.chatgpt_web_account_refresh_one')}
                      disabled={
                        disableControls ||
                        chatGptWebAccountInfoRefreshBusy ||
                        chatGptWebAccountInfoRefreshUnsupported
                      }
                      loading={chatGptWebAccountInfoRefreshing}
                    >
                      {!chatGptWebAccountInfoRefreshing ? <IconRefreshCw size={13} /> : null}
                    </Button>
                  </div>
                </div>
                {!compact ? (
                  <div className={styles.chatGptWebImageQuotaGrid}>
                    <div>
                      <span>{t('auth_files.chatgpt_web_image_quota_remaining')}</span>
                      <strong>{imageQuotaRemaining ?? '-'}</strong>
                    </div>
                    <div>
                      <span>{t('auth_files.chatgpt_web_image_quota_reset')}</span>
                      <strong>{imageQuotaResetAt}</strong>
                    </div>
                    <div>
                      <span>{t('auth_files.chatgpt_web_image_quota_updated')}</span>
                      <strong>{imageQuotaUpdatedAt}</strong>
                    </div>
                    <div>
                      <span>{t('auth_files.chatgpt_web_image_quota_next_refresh')}</span>
                      <strong>{imageQuotaNextRefreshAt}</strong>
                    </div>
                  </div>
                ) : (
                  <span className={styles.chatGptWebImageQuotaCompact}>
                    {t('auth_files.chatgpt_web_image_quota_compact', {
                      remaining: imageQuotaRemaining ?? '-',
                      reset: imageQuotaResetAt,
                    })}{' '}
                    · {t('auth_files.chatgpt_web_image_quota_updated')}: {imageQuotaUpdatedAt}
                  </span>
                )}
                {imageQuotaLastError ? (
                  <span className={styles.chatGptWebImageQuotaError}>{imageQuotaLastError}</span>
                ) : null}
              </div>
              {proxyBinding ? (
                <div className={styles.chatGptWebProxyBinding}>
                  <span>{t('auth_files.chatgpt_web_proxy_binding')}</span>
                  <strong>
                    {[proxyBinding.pool, proxyBinding.entry, proxyBinding.port]
                      .filter((value) => value !== undefined && value !== '')
                      .join(' / ') || '-'}
                  </strong>
                  {!compact ? (
                    <span>
                      {[proxyBinding.ip, proxyBinding.loc].filter(Boolean).join(' / ') || '-'} ·{' '}
                      {proxyBinding.elapsed_ms ?? '-'} ms ·{' '}
                      {proxyBinding.healthy === true
                        ? t('auth_files.chatgpt_web_proxy_healthy')
                        : proxyBinding.healthy === false
                          ? t('auth_files.chatgpt_web_proxy_unhealthy')
                          : t('auth_files.chatgpt_web_proxy_unknown')}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          {isChatGptWeb && sourceMissing ? (
            <div className={styles.chatGptWebCredentialNotice} role="status">
              <IconInfo size={14} />
              <span>{t('auth_files.chatgpt_web_source_missing_hint')}</span>
            </div>
          ) : isChatGptWeb && tokenOnly ? (
            <div className={styles.chatGptWebCredentialNotice} role="status">
              <IconInfo size={14} />
              <span>{t('auth_files.chatgpt_web_token_only_hint')}</span>
            </div>
          ) : null}

          {cooldownActive &&
            !imageQuotaModelCooldown &&
            !criticalLifecycleState &&
            !sourceMissing &&
            !tokenOnly &&
            !isRetainedCodex &&
            (canOpenModelCooldownDetails ? (
              <button
                type="button"
                className={`${styles.cooldownStatusNotice} ${styles.cooldownStatusButton}`}
                onClick={() => onShowModels(file)}
                disabled={disableControls}
                title={t('auth_files.cooldown_models_view_details')}
              >
                <IconTimer size={14} />
                <span className={styles.cooldownStatusText}>{cooldownStatusText}</span>
                <IconChevronRight className={styles.cooldownStatusChevron} size={15} />
              </button>
            ) : (
              <div className={styles.cooldownStatusNotice}>
                <IconTimer size={14} />
                <span className={styles.cooldownStatusText}>{cooldownStatusText}</span>
              </div>
            ))}

          {hasStatusWarning && (displayStatusMessage || hasLastErrorStatusCode) && (
            <div className={styles.healthStatusMessage} title={healthStatusTitle}>
              <IconInfo className={styles.messageIcon} size={14} />
              <span className={styles.healthStatusContent}>
                {hasLastErrorStatusCode && (
                  <span className={styles.httpStatusBadge}>HTTP {lastErrorStatusCode}</span>
                )}
                {displayStatusMessage && <span>{displayStatusMessage}</span>}
              </span>
            </div>
          )}

          <div className={`${styles.cardInsights} ${compact ? styles.cardInsightsCompact : ''}`}>
            <div className={`${styles.cardStats} ${compact ? styles.cardStatsCompact : ''}`}>
              <div className={`${styles.statPill} ${styles.statSuccess}`}>
                <span className={styles.statLabel}>{t('stats.success')}</span>
                <span className={styles.statValue}>{fileStats.success}</span>
              </div>
              <div className={`${styles.statPill} ${styles.statFailure}`}>
                <span className={styles.statLabel}>{t('stats.failure')}</span>
                <span className={styles.statValue}>{fileStats.failure}</span>
              </div>
            </div>

            <div className={`${styles.statusPanel} ${compact ? styles.statusPanelCompact : ''}`}>
              <div className={styles.statusPanelLabel}>
                <span>{t('auth_files.health_status_label')}</span>
              </div>
              <ProviderStatusBar statusData={statusData} styles={styles} />
            </div>

            <AuthFileUsageStatsPanel
              summary={usageSummary}
              loading={usageLoading}
              compact={compact}
            />

            {showQuotaLayout && quotaType && (
              <AuthFileQuotaSection
                file={file}
                quotaType={quotaType}
                disableControls={disableControls}
              />
            )}
          </div>

          <div className={styles.cardActions}>
            <div className={styles.cardActionsMain}>
              {showModelsButton && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onShowModels(file)}
                  className={`${styles.primaryActionButton} ${styles.modelsActionButton}`}
                  title={t('auth_files.models_button', { defaultValue: '模型' })}
                  disabled={disableControls}
                >
                  <>
                    <span className={styles.modelsActionIconWrap}>
                      <IconModelCluster className={styles.actionIcon} size={16} />
                    </span>
                    <span className={styles.actionButtonLabel}>
                      {t('auth_files.models_button', { defaultValue: '模型' })}
                    </span>
                  </>
                </Button>
              )}
              {(!isRuntimeOnly || isRetiredGeminiCli) && (
                <div className={styles.cardUtilityActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onDownload(file.name)}
                    className={styles.iconButton}
                    title={t('auth_files.download_button')}
                    disabled={disableControls}
                  >
                    <IconDownload className={styles.actionIcon} size={16} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpenPrefixProxyEditor(file)}
                    className={styles.iconButton}
                    title={
                      isRetiredGeminiCli
                        ? t('auth_files.view_button')
                        : t('auth_files.prefix_proxy_button')
                    }
                    disabled={disableControls}
                  >
                    {isRetiredGeminiCli ? (
                      <IconEye className={styles.actionIcon} size={16} />
                    ) : (
                      <IconSettings className={styles.actionIcon} size={16} />
                    )}
                  </Button>
                  {isChatGptWeb && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onChatGptWebRelogin(file)}
                      className={styles.iconButton}
                      title={t('auth_files.chatgpt_web_relogin')}
                      aria-label={t('auth_files.chatgpt_web_relogin')}
                      disabled={disableControls || chatGptWebReloginBusy}
                      loading={chatGptWebReloginBusy}
                    >
                      {!chatGptWebReloginBusy && (
                        <IconRefreshCw className={styles.actionIcon} size={16} />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => onDelete(file.name)}
                    className={styles.iconButton}
                    title={t('auth_files.delete_button')}
                    disabled={disableControls || deleting === file.name}
                  >
                    {deleting === file.name ? (
                      <LoadingSpinner size={14} />
                    ) : (
                      <IconTrash2 className={styles.actionIcon} size={16} />
                    )}
                  </Button>
                </div>
              )}
            </div>
            {!isRuntimeOnly && !isRetiredGeminiCli && isRetainedCodex ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onRestore(file)}
                loading={restoreBusy}
                disabled={disableControls || restoreBusy}
                className={styles.restoreCodexButton}
              >
                <IconRefreshCw className={styles.actionIcon} size={16} />
                {t('auth_files.retained_codex_restore')}
              </Button>
            ) : !isRuntimeOnly && !isRetiredGeminiCli ? (
              <div className={styles.statusToggle}>
                <span className={styles.statusToggleLabel}>
                  {t('auth_files.status_toggle_label')}
                </span>
                <ToggleSwitch
                  ariaLabel={t('auth_files.status_toggle_label')}
                  checked={!file.disabled}
                  disabled={disableControls || statusUpdating[file.name] === true}
                  onChange={(value) => onToggleStatus(file, value)}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
