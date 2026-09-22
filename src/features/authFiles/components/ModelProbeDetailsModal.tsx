import { ResponseGuardDetails } from './ResponseGuardDetails';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { copyToClipboard } from '@/utils/clipboard';
import { useNotificationStore } from '@/stores';
import type { ModelProbeResult, ModelProbeUsage } from '@/services/api/authFiles';
import styles from './AuthFileModelProbe.module.scss';

const pretty = (text: string) => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};

export function ModelProbeDetailsModal({
  model,
  result,
  error,
  onClose,
  onUseState,
}: {
  model: string;
  result?: ModelProbeResult;
  error?: string;
  onClose: () => void;
  onUseState?: (value: string) => void;
}) {
  const { t } = useTranslation();
  const notify = useNotificationStore((state) => state.showNotification);
  const copy = async (text: string) => {
    const ok = await copyToClipboard(text);
    notify(t(ok ? 'model_probe.copied' : 'model_probe.copy_failed'), ok ? 'success' : 'error');
  };
  const usageFields: (keyof ModelProbeUsage)[] = [
    'input_tokens',
    'output_tokens',
    'total_tokens',
    'cached_tokens',
    'reasoning_tokens',
    'cache_creation_tokens',
  ];
  const metadata = [
    ['model', result?.model || model],
    ['actual_model', result?.upstream_model],
    ['returned_model', result?.returned_model],
    ['finish_reason', result?.finish_reason],
    ['response_id', result?.response_id],
    ['request_id', result?.request_id],
    ['protocol', result?.request_path],
    ['upstream_url', result?.upstream_url],
  ];
  const payloads = [
    ['request_body', result?.request_body],
    ['upstream_request_body', result?.upstream_request_body],
    ['response_body', result?.response_body],
  ];
  return (
    <Modal
      open
      width={1000}
      title={`${t('model_probe.details')} · ${model}`}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div className={styles.detailBody}>
        {result && (
          <div className={result.success ? styles.success : styles.failed}>
            {t(`model_probe.states.${result.success ? 'success' : 'failed'}`)} ·{' '}
            {(result.latency_ms / 1000).toFixed(2)} s
            {result.status_code ? ` · HTTP ${result.status_code}` : ''}
          </div>
        )}
        {(result?.error || error) && <div className="error-box">{result?.error || error}</div>}
        <section>
          <div className={styles.detailHeading}>
            <strong>{t('model_probe.answer')}</strong>
            {result?.response && (
              <Button size="sm" variant="ghost" onClick={() => void copy(result.response!)}>
                {t('model_probe.copy_answer')}
              </Button>
            )}
          </div>
          <pre className={styles.answer}>{result?.response || t('model_probe.no_text')}</pre>
        </section>
        <dl className={styles.detailMetadata}>
          {metadata.map(([label, value]) => (
            <div key={label}>
              <dt>{t(`model_probe.${label}`)}</dt>
              <dd>{value || t('model_probe.not_reported')}</dd>
            </div>
          ))}
        </dl>
        {result?.codex_response_guard && <section><h3>{t('response_guard.title')}</h3><ResponseGuardDetails record={result.codex_response_guard}/></section>}
        {result?.codex_cookie && (
          <section>
            <h3>{t('model_probe.cookie_details')}</h3>
            <dl>
              <dt>{t('model_probe.cookie_mode')}</dt>
              <dd>{t(`model_probe.cookie_modes.${result.codex_cookie.mode}`)}</dd>
              <dt>{t('model_probe.cookie_sent')}</dt>
              <dd>{result.codex_cookie.sent ? result.codex_cookie.names.join(', ') : '—'}</dd>
              <dt>{t('model_probe.cookie_digest')}</dt>
              <dd>{result.codex_cookie.digest || '—'}</dd>
              <dt>{t('model_probe.cookie_version')}</dt>
              <dd>{result.codex_cookie.version || '—'}</dd>
            </dl>
          </section>
        )}
        {result?.codex_state && (
          <section>
            <strong>{t('model_probe.state_details')}</strong>
            <dl className={styles.detailMetadata}>
              <div>
                <dt>{t('model_probe.state_source')}</dt>
                <dd>{t(`model_probe.state_sources.${result.codex_state.source}`)}</dd>
              </div>
              <div>
                <dt>{t('model_probe.sent_state_length')}</dt>
                <dd>{result.codex_state.sent_length}</dd>
              </div>
              <div>
                <dt>{t('model_probe.sent_state_digest')}</dt>
                <dd>{result.codex_state.sent_digest || '—'}</dd>
              </div>
              <div>
                <dt>{t('model_probe.returned_state_length')}</dt>
                <dd>{result.codex_state.returned_length}</dd>
              </div>
              <div>
                <dt>{t('model_probe.returned_state_digest')}</dt>
                <dd>{result.codex_state.returned_digest || '—'}</dd>
              </div>
            </dl>
            {result.codex_state['x-codex-turn-state'] ? (
              <details className={styles.rawDetails}>
                <summary>{t('model_probe.returned_state')}</summary>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void copy(result.codex_state!['x-codex-turn-state']!)}
                >
                  {t('model_probe.copy_state')}
                </Button>
                {onUseState && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onUseState(result.codex_state!['x-codex-turn-state']!)}
                  >
                    {t('model_probe.use_state')}
                  </Button>
                )}
                <pre className={styles.stateValue}>{result.codex_state['x-codex-turn-state']}</pre>
              </details>
            ) : (
              <div className={styles.hint}>{t('model_probe.state_not_returned')}</div>
            )}
          </section>
        )}
        <div className={styles.usageGrid}>
          {usageFields.map((field) => (
            <div key={field}>
              <span>{t(`model_probe.${field}`)}</span>
              <strong>
                {result?.usage?.[field]?.toLocaleString() ?? t('model_probe.not_reported')}
              </strong>
            </div>
          ))}
        </div>
        {result?.details_truncated && (
          <div className={styles.hint}>{t('model_probe.truncated')}</div>
        )}
        {payloads
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <details className={styles.rawDetails} key={label}>
              <summary>{t(`model_probe.${label}`)}</summary>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`${t('common.copy')} ${t(`model_probe.${label}`)}`}
                onClick={() => void copy(value!)}
              >
                {t('common.copy')}
              </Button>
              <pre>{pretty(value!)}</pre>
            </details>
          ))}
      </div>
    </Modal>
  );
}
