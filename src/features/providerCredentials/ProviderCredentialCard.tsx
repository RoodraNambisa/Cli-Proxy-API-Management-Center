import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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
  onSelect: (name: string) => void;
  onEdit: (id: string) => void;
  onDelete: (name: string) => void;
  onToggle: (file: AuthFileItem, enabled: boolean) => void;
  onReorder?: (file: AuthFileItem) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ref = file.config_ref!;
  const limits = file.request_limit;
  return (
    <div
      className={`${styles.fileCard} ${compact ? styles.fileCardCompact : ''} ${selected ? styles.fileCardSelected : ''} ${file.disabled ? styles.fileCardDisabled : ''}`}
    >
      <div className={cardStyles.layout}>
        <div className={styles.fileCardMain}>
          <div className={styles.cardHeader}>
            <SelectionCheckbox
              checked={selected}
              onChange={() => onSelect(file.name)}
              ariaLabel={t('auth_files.batch_select_all')}
              className={styles.cardSelection}
            />
            <div className={styles.cardHeaderContent}>
              <div className={styles.cardBadgeRow}>
                <span className={styles.typeBadge}>{t(`api_credentials.kinds.${ref.kind}`)}</span>
                <span className={styles.stateBadge}>
                  {t(file.disabled ? 'api_credentials.disabled' : 'api_credentials.enabled')}
                </span>
              </div>
              <span className={styles.fileName}>
                {file.display_name || ref.parent_name || t(`api_credentials.kinds.${ref.kind}`)}
              </span>
              {ref.parent_name && (
                <div className={styles.noteText}>
                  {t('api_credentials.parent')}: {ref.parent_name}
                </div>
              )}
            </div>
          </div>
          {trafficVisible !== false && (
            <TrafficSummary value={traffic} stale={trafficStale} credential />
          )}
          <div className={cardStyles.metadata}>
            <div className={cardStyles.field}>
              <span className={styles.metaLabel}>API Key</span>
              <span className={styles.metaValue}>
                {file.api_key_mask || t('api_credentials.no_key')}
              </span>
            </div>
            <div className={cardStyles.field}>
              <span className={styles.metaLabel}>Base URL</span>
              <span className={styles.metaValue}>
                {file.base_url || t('api_credentials.default_endpoint')}
              </span>
            </div>
            <div className={cardStyles.field}>
              <span className={styles.metaLabel}>{t('api_credentials.priority')}</span>
              <span className={styles.metaValue}>{String(file.priority ?? 0)}</span>
            </div>
            <div className={cardStyles.field}>
              <span className={styles.metaLabel}>{t('api_credentials.models')}</span>
              <span className={styles.metaValue}>{file.models_count ?? 0}</span>
            </div>
            {Boolean(limits?.limit) && (
              <div className={cardStyles.field}>
                <span className={styles.metaLabel}>{t('credential_proxy.limit')}</span>
                <span className={styles.metaValue}>
                  {t('credential_proxy.limit_value', {
                    count: limits!.limit,
                    minutes: limits!.window_minutes,
                  })}{' '}
                  · {t(`credential_proxy.limit_sources.${limits!.source}`)}
                </span>
              </div>
            )}
            {Boolean(limits?.concurrency_limit) && (
              <div className={cardStyles.field}>
                <span className={styles.metaLabel}>{t('credential_proxy.concurrency')}</span>
                <span className={styles.metaValue}>
                  {limits!.concurrency_limit} ·{' '}
                  {t(`credential_proxy.limit_sources.${limits!.concurrency_source}`)}
                </span>
              </div>
            )}
            {file.fill_order && (
              <div className={cardStyles.field}>
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
          {file.status_message ? (
            <div className={styles.noteText}>{String(file.status_message)}</div>
          ) : null}
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
          <Button
            variant="danger"
            size="sm"
            onClick={() => onDelete(file.name)}
            disabled={disabled}
          >
            {t('common.delete')}
          </Button>
        </div>
      </div>
    </div>
  );
}
