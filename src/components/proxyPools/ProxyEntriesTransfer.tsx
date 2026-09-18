import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { IconCopy, IconX } from '@/components/ui/icons';
import { useNotificationStore } from '@/stores';
import { copyToClipboard } from '@/utils/clipboard';
import {
  exportProxyEntries,
  importProxyEntries,
  PROXY_PROTOCOLS,
  type ProxyProtocol,
  type ProxyTransferFormat,
} from '@/utils/proxyTransfer';
import type { ProxyPoolEntry } from '@/types';
import styles from './ProxyEntriesTransfer.module.scss';

const proxyTransferFormatOptions = [
  { value: 'url', label: 'URL · protocol://USER:PASS@HOST:PORT' },
  { value: 'host-port-user-pass', label: 'HOST:PORT:USER:PASS' },
  { value: 'port-host-user-pass', label: 'PORT:HOST:USER:PASS' },
  { value: 'pass-port-host-user', label: 'PASS:PORT:HOST:USER' },
  { value: 'user-pass-host-port', label: 'USER:PASS@HOST:PORT' },
];

export function ProxyEntriesTransfer({
  mode,
  entries,
  onImport,
  onClose,
  disabled = false,
}: {
  mode: 'import' | 'copy';
  entries: ProxyPoolEntry[];
  onImport?: (entries: ProxyPoolEntry[]) => void;
  onClose?: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`proxy_transfer.${key}`);
  const { showNotification } = useNotificationStore();
  const [format, setFormat] = useState<ProxyTransferFormat>(
    mode === 'import' ? 'host-port-user-pass' : 'url'
  );
  const [protocol, setProtocol] = useState(mode === 'import' ? 'socks5' : 'all');
  const [input, setInput] = useState('');
  const [reading, setReading] = useState(false);
  const imported = useMemo(
    () =>
      mode === 'import'
        ? importProxyEntries(input, format, protocol as ProxyProtocol, entries)
        : null,
    [mode, input, format, protocol, entries]
  );
  const exported = useMemo(
    () => (mode === 'copy' ? exportProxyEntries(entries, format, protocol) : null),
    [mode, entries, format, protocol]
  );
  const issues = imported?.issues ?? exported?.issues ?? [];
  const count = imported?.entries.length ?? exported?.count ?? 0;
  const protocolOptions: { value: string; label: string }[] = PROXY_PROTOCOLS.map((value) => ({
    value,
    label: value.toUpperCase(),
  }));
  if (mode === 'copy') protocolOptions.unshift({ value: 'all', label: text('all_protocols') });
  const paste = async () => {
    setReading(true);
    try {
      const content = await navigator.clipboard.readText();
      setInput(content);
    } catch {
      showNotification(text('paste_fallback'), 'warning');
    } finally {
      setReading(false);
    }
  };
  const copy = async () => {
    if (!exported?.text || issues.length) return;
    const copied = await copyToClipboard(exported.text);
    showNotification(text(copied ? 'copied' : 'copy_failed'), copied ? 'success' : 'error');
  };
  return (
    <section className={styles.panel} aria-label={text(mode)}>
      <div className={styles.header}>
        <strong>{text(mode)}</strong>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={disabled}
            aria-label={t('common.close')}
          >
            <IconX size={16} />
          </Button>
        )}
      </div>
      <div className={styles.options}>
        <div className={styles.field}>
          <span>{text('format')}</span>
          <Select
            ariaLabel={text('format')}
            value={format}
            options={proxyTransferFormatOptions}
            onChange={(value) => setFormat(value as ProxyTransferFormat)}
            disabled={disabled}
          />
        </div>
        <div className={styles.field}>
          <span>{text(mode === 'import' ? 'protocol' : 'protocol_filter')}</span>
          <Select
            ariaLabel={text(mode === 'import' ? 'protocol' : 'protocol_filter')}
            value={protocol}
            options={protocolOptions}
            onChange={setProtocol}
            disabled={disabled || (mode === 'import' && format === 'url')}
          />
        </div>
      </div>
      <p className="hint">{text(mode === 'import' ? 'import_hint' : 'copy_hint')}</p>
      <textarea
        className={`input ${styles.textarea}`}
        aria-label={text(mode === 'import' ? 'input' : 'output')}
        value={mode === 'import' ? input : (exported?.text ?? '')}
        onChange={(event) => setInput(event.target.value)}
        readOnly={mode === 'copy'}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        data-1p-ignore="true"
        data-lpignore="true"
        placeholder={
          mode === 'import' ? '192.0.2.10:8080:user:password\n192.0.2.11:8080:user:password' : ''
        }
      />
      <div className={styles.summary} role="status">
        {t(`proxy_transfer.${mode === 'import' ? 'import_summary' : 'copy_summary'}`, {
          count,
          duplicates: imported?.duplicates ?? 0,
          errors: issues.length,
        })}
      </div>
      {issues.length > 0 && (
        <div className={styles.issues} role="alert">
          {issues.slice(0, 20).map((issue) => (
            <div key={issue.line}>
              {issue.line
                ? t(`proxy_transfer.${mode === 'import' ? 'line' : 'entry'}`, {
                    number: issue.line,
                  }) + ': '
                : ''}
              {text(`errors.${issue.code}`)}
            </div>
          ))}
          {issues.length > 20 && (
            <div>{t('proxy_transfer.more_errors', { count: issues.length - 20 })}</div>
          )}
        </div>
      )}
      <div className={styles.actions}>
        {mode === 'import' ? (
          <>
            <Button
              variant="secondary"
              onClick={() => void paste()}
              loading={reading}
              disabled={disabled}
            >
              {text('paste')}
            </Button>
            <Button
              disabled={disabled || !count || issues.length > 0}
              onClick={() => {
                if (imported && !issues.length) onImport?.(imported.entries);
              }}
            >
              {t('proxy_transfer.apply', { count })}
            </Button>
          </>
        ) : (
          <Button onClick={() => void copy()} disabled={disabled || !count || issues.length > 0}>
            <IconCopy size={15} />
            {t('proxy_transfer.copy_count', { count })}
          </Button>
        )}
      </div>
    </section>
  );
}
