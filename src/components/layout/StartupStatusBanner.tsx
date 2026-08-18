import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconInfo } from '@/components/ui/icons';
import { useStartupStatusStore } from '@/stores';
import styles from './StartupStatusBanner.module.scss';

export function StartupStatusBanner() {
  const { t } = useTranslation();
  const startup = useStartupStatusStore((state) => state.snapshot);

  if (!startup || startup.status === 'ready') return null;

  const visibleIssues = startup.issues.slice(0, 3);
  const hiddenIssueCount = Math.max(0, startup.issues.length - visibleIssues.length);
  const isFailure = startup.status === 'failed';

  return (
    <section
      className={styles.banner}
      data-status={startup.status}
      role={isFailure ? 'alert' : 'status'}
      aria-live={isFailure ? 'assertive' : 'polite'}
      data-testid="global-startup-status"
    >
      <IconInfo size={18} aria-hidden="true" />
      <div className={styles.copy}>
        <strong>{t(`system_info.startup.global.${startup.status}.title`)}</strong>
        <span>{t(`system_info.startup.global.${startup.status}.description`)}</span>
        {visibleIssues.length > 0 && (
          <div className={styles.issues}>
            {visibleIssues.map((issue) => (
              <span key={`${issue.stage}:${issue.code}`}>
                {t(`system_info.startup.issues.${issue.code}`, { defaultValue: issue.code })}
              </span>
            ))}
            {hiddenIssueCount > 0 && (
              <span>{t('system_info.startup.more_issues', { count: hiddenIssueCount })}</span>
            )}
          </div>
        )}
      </div>
      <Link to="/system">{t('system_info.startup.view_details')}</Link>
    </section>
  );
}
