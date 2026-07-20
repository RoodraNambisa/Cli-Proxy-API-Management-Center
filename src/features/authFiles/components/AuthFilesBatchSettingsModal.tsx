import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { ChatGptWebMutationTaskPanel } from '@/features/chatgptWeb/components/ChatGptWebMutationTaskPanel';
import type {
  AuthFilesBatchSettingsField,
  AuthFilesBatchSettingsState,
} from '@/features/authFiles/hooks/useAuthFilesBatchSettings';
import type { ChatGptWebMutationTask } from '@/types';
import { isChatGptWebMutationTaskTerminal } from '@/types';
import styles from '@/pages/AuthFilesPage.module.scss';

export type AuthFilesBatchSettingsModalProps = {
  disableControls: boolean;
  state: AuthFilesBatchSettingsState;
  dirty: boolean;
  conversionTask: ChatGptWebMutationTask | null;
  conversionRefreshing: boolean;
  conversionCanceling: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  onChange: (field: AuthFilesBatchSettingsField, value: string) => void;
  onRefreshConversionTask: () => void;
  onCancelConversionTask: () => void;
};

export function AuthFilesBatchSettingsModal(props: AuthFilesBatchSettingsModalProps) {
  const { t } = useTranslation();
  const {
    disableControls,
    state,
    dirty,
    conversionTask,
    conversionRefreshing,
    conversionCanceling,
    onClose,
    onSave,
    onChange,
    onRefreshConversionTask,
    onCancelConversionTask,
  } = props;

  const booleanOptions = useMemo(
    () => [
      { value: '', label: t('auth_files.batch_settings_websockets_skip') },
      { value: 'true', label: t('auth_files.batch_settings_websockets_enable') },
      { value: 'false', label: t('auth_files.batch_settings_websockets_disable') },
    ],
    [t]
  );

  const conversionActive = Boolean(
    conversionTask && !isChatGptWebMutationTaskTerminal(conversionTask.state)
  );
  const fieldDisabled = disableControls || state.saving || conversionActive;

  return (
    <Modal
      open={state.open}
      onClose={onClose}
      closeDisabled={state.saving || conversionActive}
      width={conversionTask ? 980 : 720}
      title={t('auth_files.batch_settings_title', { count: state.names.length })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={state.saving || conversionActive}>
            {dirty ? t('common.cancel') : t('common.close')}
          </Button>
          <Button
            onClick={() => void onSave()}
            loading={state.saving}
            disabled={fieldDisabled || !dirty || Boolean(state.headersError)}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className={styles.prefixProxyEditor}>
        <div className="hint">{t('auth_files.batch_settings_hint')}</div>
        {state.failures.length > 0 && (
          <div className={styles.batchSettingsFailures} role="alert">
            <div className={styles.batchSettingsFailuresTitle}>
              {t('auth_files.batch_settings_failure_details')}
            </div>
            <div className={styles.batchSettingsFailureList}>
              {state.failures.map((failure) => (
                <div key={`${failure.name}-${failure.status ?? 'unknown'}`}>
                  <strong>{failure.name}</strong>
                  {failure.status ? ` (HTTP ${failure.status})` : ''}: {failure.error}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className={styles.prefixProxyFields}>
          <Input
            label={t('auth_files.prefix_label')}
            value={state.prefix}
            disabled={fieldDisabled}
            onChange={(e) => onChange('prefix', e.target.value)}
          />
          <Input
            label={t('auth_files.proxy_url_label')}
            value={state.proxyUrl}
            placeholder={t('auth_files.proxy_url_placeholder')}
            disabled={fieldDisabled}
            onChange={(e) => onChange('proxyUrl', e.target.value)}
          />
          <Input
            label={t('auth_files.priority_label')}
            value={state.priority}
            placeholder={t('auth_files.batch_settings_priority_placeholder')}
            hint={t('auth_files.batch_settings_priority_hint')}
            disabled={fieldDisabled}
            onChange={(e) => onChange('priority', e.target.value)}
          />
          <div className="form-group">
            <label>{t('auth_files.excluded_models_label')}</label>
            <textarea
              className="input"
              value={state.excludedModelsText}
              placeholder={t('auth_files.excluded_models_placeholder')}
              rows={4}
              disabled={fieldDisabled}
              onChange={(e) => onChange('excludedModelsText', e.target.value)}
            />
            <div className="hint">{t('auth_files.excluded_models_hint')}</div>
          </div>
          <div className="form-group">
            <label>{t('auth_files.headers_label')}</label>
            <textarea
              className={`input ${state.headersError ? styles.prefixProxyTextareaInvalid : ''}`}
              value={state.headersText}
              placeholder={t('auth_files.headers_placeholder')}
              rows={4}
              aria-invalid={Boolean(state.headersError)}
              disabled={fieldDisabled}
              onChange={(e) => onChange('headersText', e.target.value)}
            />
            {state.headersError && <div className="error-box">{state.headersError}</div>}
            <div className="hint">{t('auth_files.headers_hint')}</div>
          </div>
          <Input
            label={t('auth_files.disable_cooling_label')}
            value={state.disableCooling}
            placeholder={t('auth_files.disable_cooling_placeholder')}
            hint={t('auth_files.disable_cooling_hint')}
            disabled={fieldDisabled}
            onChange={(e) => onChange('disableCooling', e.target.value)}
          />
          <Input
            label={t('auth_files.note_label')}
            value={state.note}
            placeholder={t('auth_files.note_placeholder')}
            hint={t('auth_files.note_hint')}
            disabled={fieldDisabled}
            onChange={(e) => onChange('note', e.target.value)}
          />
          <div className="form-group">
            <label>{t('auth_files.batch_settings_using_api_label')}</label>
            <Select
              value={state.usingApi}
              options={booleanOptions}
              disabled={fieldDisabled}
              ariaLabel={t('auth_files.batch_settings_using_api_label')}
              onChange={(value) => onChange('usingApi', value)}
            />
            <div className="hint">{t('auth_files.batch_settings_using_api_hint')}</div>
          </div>
          <div className="form-group">
            <label>{t('auth_files.batch_settings_websockets_label')}</label>
            <Select
              value={state.websockets}
              options={booleanOptions}
              disabled={fieldDisabled}
              ariaLabel={t('auth_files.batch_settings_websockets_label')}
              onChange={(value) => onChange('websockets', value)}
            />
            <div className="hint">{t('auth_files.batch_settings_websockets_hint')}</div>
          </div>
          <div className={styles.batchConversionOption}>
            <div>
              <strong>{t('auth_files.chatgpt_web_conversion_toggle')}</strong>
              <span>
                {state.codexNames.length > 0
                  ? t('auth_files.chatgpt_web_conversion_hint', {
                      count: state.codexNames.length,
                    })
                  : t('auth_files.chatgpt_web_conversion_no_codex')}
              </span>
            </div>
            <ToggleSwitch
              checked={state.createChatGptWebCopy}
              ariaLabel={t('auth_files.chatgpt_web_conversion_toggle')}
              disabled={fieldDisabled || state.codexNames.length === 0 || Boolean(conversionTask)}
              onChange={(value) => onChange('createChatGptWebCopy', String(value))}
            />
          </div>
        </div>
        {conversionTask ? (
          <div className={styles.batchConversionTask}>
            <ChatGptWebMutationTaskPanel
              task={conversionTask}
              kind="conversion"
              refreshing={conversionRefreshing}
              canceling={conversionCanceling}
              onRefresh={onRefreshConversionTask}
              onCancel={onCancelConversionTask}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
