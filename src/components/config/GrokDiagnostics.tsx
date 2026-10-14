import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { copyToClipboard } from '@/utils/clipboard';
import { useNotificationStore } from '@/stores';
import type { GrokTransmission } from '@/types/grokDiagnostics';
import styles from './GrokConfigEditor.module.scss';

export function GrokDiagnostics({ values }: { values: GrokTransmission[] }) {
  const { t } = useTranslation();
  const notify = useNotificationStore((s) => s.showNotification);
  const text = (name: string) => t(`grok_diagnostics.${name}`);
  const copy = async () => {
    const ok = await copyToClipboard(JSON.stringify(values, null, 2));
    notify(t(ok ? 'model_probe.copied' : 'model_probe.copy_failed'), ok ? 'success' : 'error');
  };
  return (
    <section className={styles.diagnostics}>
      <div className={styles.diagnosticHeading}>
        <strong>{text('title')}</strong>
        <Button variant="ghost" size="sm" onClick={() => void copy()}>
          {text('copy')}
        </Button>
      </div>
      <p className={styles.notice}>{text('redacted_hint')}</p>
      {values.map((value) => (
        <details key={value.id} open={value.preview || values.length === 1}>
          <summary>
            {text(`stages.${value.stage}`)} ·{' '}
            {value.status ? `HTTP ${value.status}` : text('no_status')}
          </summary>
          <code className={styles.upstreamUrl}>{value.url}</code>
          {value.url_source === 'missing-source' && (
            <p className={styles.notice}>{text('endpoint_missing')}</p>
          )}
          <div className={styles.notice}>
            {text('compression')}：{text(`reasons.${value.compression.reason}`)}
            {value.compression.settings_url && (
              <div>
                {text('settings')}：{value.compression.settings_url} ·{' '}
                {value.compression.supported === undefined
                  ? text('unverified')
                  : text(value.compression.supported ? 'supported' : 'unsupported')}
              </div>
            )}
            {value.compression.original_bytes !== undefined && (
              <div>
                {text('original_bytes')}：{value.compression.original_bytes.toLocaleString()} ·{' '}
                {text('sent_bytes')}：{value.compression.sent_bytes?.toLocaleString() ?? '—'}
              </div>
            )}
          </div>
          {value.capabilities && (
            <div className={styles.notice}>
              {text('capabilities')} · {value.capabilities.model}
              <div>
                {text('thinking')}：{text(`sources.${value.capabilities.thinking_source}`)}
              </div>
              <div>
                {text('images')}：{value.capabilities.max_edit_images} ·{' '}
                {text(`sources.${value.capabilities.image_source}`)}
              </div>
              <div>
                quality：{value.capabilities.quality_values?.join(', ') || '—'} ·{' '}
                {text(`sources.${value.capabilities.quality_source}`)}
              </div>
              <div>
                file_id：
                {value.capabilities.file_id_known
                  ? text(value.capabilities.file_id_inputs ? 'supported' : 'unsupported')
                  : text('unverified')}{' '}
                · {text(`sources.${value.capabilities.file_id_source}`)}
              </div>
            </div>
          )}
          <div className={styles.diagnosticTable}>
            <table>
              <thead>
                <tr>
                  <th>{text('header')}</th>
                  <th>{text('value')}</th>
                  <th>{text('source')}</th>
                </tr>
              </thead>
              <tbody>
                {value.headers.map((header) => (
                  <tr key={header.name}>
                    <td>
                      <code>{header.name}</code>
                    </td>
                    <td>
                      {header.missing ? text('missing') : header.value}
                      {header.example && <span> · {text('example')}</span>}
                    </td>
                    <td>
                      {t(`grok_diagnostics.sources.${header.source}`, {
                        defaultValue: header.source,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </section>
  );
}
