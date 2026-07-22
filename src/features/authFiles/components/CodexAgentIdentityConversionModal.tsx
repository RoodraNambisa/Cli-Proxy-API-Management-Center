import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { CodexAgentIdentityConversionState } from '@/features/authFiles/hooks/useCodexAgentIdentityConversion';
import { isCodexAgentIdentityTaskTerminal } from '@/types';
import { CodexAgentIdentityTaskPanel } from './CodexAgentIdentityTaskPanel';
import styles from './CodexAgentIdentityConversion.module.scss';

export type CodexAgentIdentityConversionModalProps = {
  state: CodexAgentIdentityConversionState;
  active: boolean;
  accessTokenCount: number;
  onClose: () => void;
  onAccessTokenTextChange: (value: string) => void;
  onStart: () => void;
  onRefresh: () => void;
  onCancel: () => void;
};

export function CodexAgentIdentityConversionModal({
  state,
  active,
  accessTokenCount,
  onClose,
  onAccessTokenTextChange,
  onStart,
  onRefresh,
  onCancel,
}: CodexAgentIdentityConversionModalProps) {
  const { t } = useTranslation();
  const tokenSource = state.source === 'access_tokens';
  const targetLabel =
    state.targetMode === 'agentIdentity' ? 'Agent Identity' : t('auth_files.codex_identity_oauth');
  const canStart = tokenSource ? accessTokenCount > 0 : state.names.length > 0;
  const terminal = Boolean(state.task && isCodexAgentIdentityTaskTerminal(state.task.status));

  return (
    <Modal
      open={state.open}
      onClose={onClose}
      closeDisabled={state.starting || active}
      width={state.task ? 1080 : 720}
      title={
        tokenSource
          ? t('auth_files.codex_identity_token_title')
          : t('auth_files.codex_identity_conversion_title', { target: targetLabel })
      }
      footer={
        state.task ? (
          <Button variant="secondary" onClick={onClose} disabled={!terminal}>
            {t('common.close')}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={state.starting}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onStart} loading={state.starting} disabled={!canStart}>
              {t('auth_files.codex_identity_start')}
            </Button>
          </>
        )
      }
    >
      {state.task ? (
        <CodexAgentIdentityTaskPanel
          task={state.task}
          refreshing={state.refreshing}
          canceling={state.canceling}
          onRefresh={onRefresh}
          onCancel={onCancel}
        />
      ) : tokenSource ? (
        <div className={styles.formBody}>
          <p>{t('auth_files.codex_identity_token_description')}</p>
          <div className="form-group">
            <label htmlFor="codex-agent-identity-access-tokens">
              {t('auth_files.codex_identity_token_label')}
            </label>
            <textarea
              id="codex-agent-identity-access-tokens"
              className={`input ${styles.tokenTextarea}`}
              value={state.accessTokenText}
              rows={9}
              spellCheck={false}
              autoComplete="off"
              placeholder={t('auth_files.codex_identity_token_placeholder')}
              onChange={(event) => onAccessTokenTextChange(event.target.value)}
            />
            <div className="hint">
              {t('auth_files.codex_identity_token_memory_hint', { count: accessTokenCount })}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.formBody}>
          <div className={styles.conversionSummary}>
            <span>{t('auth_files.codex_identity_target_mode')}</span>
            <strong>{targetLabel}</strong>
          </div>
          <p>
            {t('auth_files.codex_identity_in_place_hint', {
              count: state.names.length,
            })}
          </p>
          <div className={styles.nameList}>
            {state.names.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
