import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AuthFileProxyStatus } from '@/features/authFiles/components/AuthFileProxyStatus';
import { AuthFileErrorHistory } from '@/features/authFiles/components/AuthFileErrorHistory';
import { AuthFileResponseModelStatus } from '@/features/authFiles/components/AuthFileResponseModelStatus';
import { AuthFileUsageStatsPanel } from '@/features/authFiles/components/AuthFileUsageStatsPanel';
import { CodexQuotaObservationPanel } from '@/features/authFiles/components/CodexQuotaObservationPanel';
import {
  getAuthFileIcon,
  getAuthFileStatusMessage,
  getTypeColor,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import type { AuthFileUsageSummary } from '@/features/authFiles/hooks/useAuthFilesUsageSummary';
import { normalizeAuthIndex } from '@/utils/usage';
import type { AuthFileItem } from '@/types/authFile';
import { Button } from '@/components/ui/Button';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { TrafficSummary } from '@/features/traffic/TrafficSummary';
import type { TrafficSnapshot } from '@/features/traffic/types';
import styles from '@/pages/AuthFilesPage.module.scss';
import cardStyles from './ProviderCredentialCard.module.scss';

export function ProviderCredentialCard({
  file,
  selected,
  compact,
  disabled,
  traffic,
  trafficStale,
  trafficVisible,
  trafficUnsupported,
  resolvedTheme,
  usageSummary,
  usageLoading,
  onSelect,
  onEdit,
  onDelete,
  onToggle,
  onReorder,
}: {
  file: AuthFileItem;
  selected: boolean;
  compact: boolean;
  disabled: boolean;
  traffic?: TrafficSnapshot;
  trafficStale?: boolean;
  trafficVisible?: boolean;
  trafficUnsupported?: boolean;
  resolvedTheme: ResolvedTheme;
  usageSummary?: AuthFileUsageSummary;
  usageLoading: boolean;
  onSelect: (name: string) => void;
  onEdit: (id: string) => void;
  onDelete: (name: string) => void;
  onToggle: (file: AuthFileItem, enabled: boolean) => void;
  onReorder?: (file: AuthFileItem) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ref = file.config_ref!;
  const authIndex = normalizeAuthIndex(file.auth_index ?? file.authIndex);
  const typeLabel = t(`api_credentials.kinds.${ref.kind}`);
  const name = file.display_name || ref.parent_name || typeLabel;
  const provider = ref.kind === 'interactions' ? 'gemini' : ref.kind;
  const icon = getAuthFileIcon(provider, resolvedTheme);
  const color = getTypeColor(provider, resolvedTheme);
  const providerStyle = { backgroundColor: color.bg, color: color.text, border: color.border };
  const statusMessage = getAuthFileStatusMessage(file);
  const lastErrorStatus = Number(
    file.lastErrorStatusCode ?? file.last_error_status_code ?? file.last_error?.http_status
  );
  const hasUsage = usageSummary !== undefined && usageSummary.requestCount > 0;
  return (
    <div
      className={`${styles.fileCard} ${styles.apiCredentialCard} ${compact ? styles.fileCardCompact : ''} ${selected ? styles.fileCardSelected : ''} ${file.disabled ? styles.fileCardDisabled : ''}`}
    >
      <div className={styles.fileCardMain}>
        <div className={styles.cardHeader}>
          <SelectionCheckbox
            checked={selected}
            onChange={() => onSelect(file.name)}
            ariaLabel={name}
            className={styles.cardSelection}
          />
          <div className={styles.providerAvatar} style={providerStyle} aria-hidden="true">
            {icon ? (
              <img src={icon} alt="" className={styles.providerAvatarImage} />
            ) : (
              <span className={styles.providerAvatarFallback}>{typeLabel.slice(0, 1)}</span>
            )}
          </div>
          <div className={styles.cardHeaderContent}>
            <div className={styles.cardBadgeRow}>
              <span className={styles.typeBadge} style={providerStyle}>
                {typeLabel}
              </span>
              <span
                className={`${styles.stateBadge} ${file.disabled ? styles.stateBadgeDisabled : styles.stateBadgeActive}`}
              >
                {t(file.disabled ? 'api_credentials.disabled' : 'api_credentials.enabled')}
              </span>
            </div>
            <span className={styles.fileName} title={name}>
              {name}
            </span>
            {ref.parent_name && ref.parent_name !== name && (
              <div className={styles.noteText}>
                {t('api_credentials.parent')}: {ref.parent_name}
              </div>
            )}
          </div>
        </div>
        {trafficVisible !== false && (
          <TrafficSummary
            value={traffic}
            stale={trafficStale}
            unsupported={trafficUnsupported}
            credential
          />
        )}
        <dl className={cardStyles.connection}>
          {authIndex && (
            <>
              <dt>ID</dt>
              <dd>
                <code>{authIndex}</code>
              </dd>
            </>
          )}
          <dt>API Key</dt>
          <dd>
            <code>{file.api_key_mask || t('api_credentials.no_key')}</code>
          </dd>
          <dt>Base URL</dt>
          <dd>{file.base_url || t('api_credentials.default_endpoint')}</dd>
        </dl>
        <div className={`${styles.cardMeta} ${compact ? styles.cardMetaCompact : ''}`}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>{t('api_credentials.priority')}</span>
            <span className={styles.metaValue}>{String(file.priority ?? 0)}</span>
          </div>
          {file.weight !== undefined && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>{t('ai_providers.weight_label')}</span>
              <span className={styles.metaValue}>{file.weight}</span>
            </div>
          )}
          {file.models_count !== undefined && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>{t('api_credentials.models')}</span>
              <span className={styles.metaValue}>{file.models_count}</span>
            </div>
          )}
          {file.fill_order && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>{t('fill_order.position')}</span>
              <span className={styles.metaValue}>{file.fill_order.position}</span>
              {onReorder && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onReorder(file)}
                  disabled={disabled}
                >
                  {t('fill_order.adjust')}
                </Button>
              )}
            </div>
          )}
        </div>
        <AuthFileProxyStatus
          file={file}
          disabled={disabled}
          traffic={traffic}
          trafficStale={trafficStale}
          showUnlimitedLimits={false}
        />
        {(statusMessage || lastErrorStatus > 0) && (
          <div
            className={
              lastErrorStatus > 0 || file.unavailable ? styles.healthStatusMessage : styles.noteText
            }
          >
            {lastErrorStatus > 0 && (
              <span className={styles.httpStatusBadge}>HTTP {lastErrorStatus}</span>
            )}
            {statusMessage && <span>{statusMessage}</span>}
          </div>
        )}
        <AuthFileErrorHistory file={file} disabled={disabled} />
        {!compact && <AuthFileResponseModelStatus file={file} disabled={disabled} />}
        {hasUsage ? (
          <div className={styles.cardInsights}>
            <div className={styles.cardStats}>
              <span className={`${styles.statPill} ${styles.statSuccess}`}>
                <span className={styles.statLabel}>{t('stats.success')}</span>
                <strong className={styles.statValue}>{usageSummary.successCount}</strong>
              </span>
              <span className={`${styles.statPill} ${styles.statFailure}`}>
                <span className={styles.statLabel}>{t('stats.failure')}</span>
                <strong className={styles.statValue}>{usageSummary.failureCount}</strong>
              </span>
            </div>
            {!compact && (
              <AuthFileUsageStatsPanel
                summary={usageSummary}
                compact={compact}
                loading={usageLoading}
              />
            )}
          </div>
        ) : (
          <span className={styles.noteText}>
            {t(usageLoading ? 'auth_files.usage_stats_loading' : 'auth_files.usage_stats_empty')}
          </span>
        )}
        {!compact && ref.kind === 'codex' && file.quota_observation && (
          <CodexQuotaObservationPanel file={file} compact={compact} />
        )}
      </div>
      <div className={`${styles.cardActions} ${cardStyles.actions}`}>
        <Button variant="secondary" size="sm" onClick={() => onEdit(ref.id)} disabled={disabled}>
          {t('api_credentials.edit')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            navigate(
              `/config?section=config-routing-priority-overrides&priority=${file.priority ?? 0}&credential=${encodeURIComponent(String(file.auth_index ?? file.authIndex ?? file.id ?? file.name))}`
            )
          }
        >
          {t('api_credentials.edit_limits')}
        </Button>
        <ToggleSwitch
          checked={!file.disabled}
          onChange={(enabled) => onToggle(file, enabled)}
          disabled={disabled}
          label={t('api_credentials.enabled')}
        />
        <Button variant="danger" size="sm" onClick={() => onDelete(file.name)} disabled={disabled}>
          {t('common.delete')}
        </Button>
      </div>
    </div>
  );
}
