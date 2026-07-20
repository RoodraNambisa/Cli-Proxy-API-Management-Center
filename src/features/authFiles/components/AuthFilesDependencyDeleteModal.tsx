import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { AuthFileDependencyAction } from '@/services/api';
import type { AuthFileDependencyDeleteState } from '@/features/authFiles/hooks/useAuthFilesData';
import styles from '@/pages/AuthFilesPage.module.scss';

export type AuthFilesDependencyDeleteModalProps = {
  state: AuthFileDependencyDeleteState;
  onClose: () => void;
  onConfirm: (action: AuthFileDependencyAction) => void | Promise<void>;
};

export function AuthFilesDependencyDeleteModal(props: AuthFilesDependencyDeleteModalProps) {
  const { t } = useTranslation();
  const { state, onClose, onConfirm } = props;
  const visibleDependents = state.dependentNames.slice(0, 8);
  const hiddenDependentCount = Math.max(0, state.dependentNames.length - visibleDependents.length);

  return (
    <Modal
      open={state.open}
      onClose={onClose}
      closeDisabled={state.submitting}
      width={620}
      title={t('auth_files.delete_dependency_title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={state.submitting}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void onConfirm('retain')}
            loading={state.submitting}
          >
            {t('auth_files.delete_dependency_retain')}
          </Button>
          <Button
            variant="danger"
            onClick={() => void onConfirm('cascade')}
            loading={state.submitting}
          >
            {t('auth_files.delete_dependency_cascade')}
          </Button>
        </>
      }
    >
      <div className={styles.dependencyDeleteContent}>
        <p>
          {t('auth_files.delete_dependency_summary', {
            sources: state.sourceCount,
            selected: state.names.length,
            dependents: state.dependentCount,
          })}
        </p>

        {visibleDependents.length > 0 ? (
          <div className={styles.dependencyDeleteNames}>
            <span>{t('auth_files.delete_dependency_web_files')}</span>
            <ul>
              {visibleDependents.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            {hiddenDependentCount > 0 ? (
              <small>
                {t('auth_files.delete_dependency_more', { count: hiddenDependentCount })}
              </small>
            ) : null}
          </div>
        ) : null}

        <div className={styles.dependencyDeleteChoices}>
          <div>
            <strong>{t('auth_files.delete_dependency_retain')}</strong>
            <span>{t('auth_files.delete_dependency_retain_hint')}</span>
          </div>
          <div className={styles.dependencyDeleteDangerChoice}>
            <strong>{t('auth_files.delete_dependency_cascade')}</strong>
            <span>{t('auth_files.delete_dependency_cascade_hint')}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
