import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { chatGptWebApi } from '@/services/api';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import type { SentinelSolverConfig, SentinelSolverSnapshot } from '@/types/sentinelCompute';
import { SentinelCompatibilityEditor } from '@/features/chatgptWeb/components/SentinelCompatibilityEditor';
import {
  readCompatibilityDraft,
  toCompatibilityDraft,
} from '@/features/chatgptWeb/sentinelCompatibility';
import styles from '@/features/chatgptWeb/components/ChatGptWebSentinelPanel.module.scss';

const numericFields = [
  ['go-workers', 0, 0, 4096],
  ['queue-size', 64, 0, 65536],
  ['max-sessions', 128, 1, 65536],
  ['memory-budget-mib', 512, 256, 1048576],
  ['sdk-workers', 0, 0, 4096],
  ['sdk-queue-size', 32, 0, 1024],
  ['sdk-cache-versions', 3, 1, 5],
  ['session-idle-seconds', 120, 60, 3600],
  ['drain-timeout-seconds', 120, 1, 3600],
] as const;
const normalize = (config: SentinelSolverConfig): SentinelSolverConfig => ({
  ...Object.fromEntries(numericFields.map(([key, fallback]) => [key, config[key] ?? fallback])),
  ...config,
  listen: config.listen ?? '127.0.0.1:8318',
  'api-keys': config['api-keys'] ?? [],
  tls: config.tls ?? { enable: false, cert: '', key: '' },
});

export function SentinelSolverPage() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<SentinelSolverSnapshot | null>(null);
  const [draft, setDraft] = useState<SentinelSolverConfig | null>(null);
  const [saved, setSaved] = useState('');
  const [rules, setRules] = useState(toCompatibilityDraft());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const sequence = useRef(0);
  const load = async (reset: boolean) => {
    const current = ++sequence.current;
    const next = await chatGptWebApi.getSentinelSolver();
    if (current !== sequence.current) return;
    setSnapshot(next);
    if (reset) {
      const normalized = normalize(next.config);
      const compatibility = toCompatibilityDraft(next.config['go-vm-compatibility']);
      setDraft(normalized);
      setRules(compatibility);
      setSaved(JSON.stringify({ config: normalized, rules: compatibility }));
    }
  };
  useEffect(() => {
    void load(true).catch(() => setMessage('sentinel_compute.load_failed'));
    return () => {
      sequence.current += 1;
    };
  }, []);
  useHeaderRefresh(() => load(false), !busy);
  const dirty = draft !== null && saved !== JSON.stringify({ config: draft, rules });
  const validRules = readCompatibilityDraft(rules);
  const valid =
    draft &&
    validRules &&
    numericFields.every(
      ([key, , min, max]) =>
        Number.isSafeInteger(draft[key]) && draft[key]! >= min && draft[key]! <= max
    ) &&
    (!draft.enabled ||
      (draft['api-keys']?.length && draft['api-keys'].every((key) => key.trim()))) &&
    (!draft.tls?.enable || (draft.tls.cert.trim() && draft.tls.key.trim()));
  const update = (patch: Partial<SentinelSolverConfig>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));
  const status = snapshot?.status;

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <h2>{t('sentinel_compute.server_title')}</h2>
          <p>{t('sentinel_compute.server_hint')}</p>
        </div>
      </div>
      {message && <p role="status">{t(message)}</p>}
      {draft && (
        <>
          <Card title={t('sentinel_compute.listener')}>
            <div className={styles.runtimeRow}>
              <strong>{t('sentinel_compute.enabled')}</strong>
              <ToggleSwitch
                checked={draft.enabled}
                onChange={(enabled) => update({ enabled })}
                disabled={busy}
                ariaLabel={t('sentinel_compute.enabled')}
              />
            </div>
            <div className={styles.settingsGrid}>
              <label>
                {t('sentinel_compute.listen')}
                <input
                  value={draft.listen}
                  disabled={busy}
                  onChange={(event) => update({ listen: event.target.value })}
                />
              </label>
            </div>
            <p className="text-secondary">{t('sentinel_compute.keys_hint')}</p>
            {(draft['api-keys'] ?? []).map((key, index) => (
              <div className={`${styles.settingsGrid} ${styles.solverKeyRow}`} key={index}>
                <label>
                  {t('sentinel_compute.api-key')} {index + 1}
                  <input
                    type="password"
                    autoComplete="off"
                    disabled={busy}
                    value={key}
                    onChange={(event) =>
                      update({
                        'api-keys': draft['api-keys']!.map((entry, at) =>
                          at === index ? event.target.value : entry
                        ),
                      })
                    }
                  />
                </label>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    update({ 'api-keys': draft['api-keys']!.filter((_, at) => at !== index) })
                  }
                >
                  {t('common.delete')}
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => update({ 'api-keys': [...(draft['api-keys'] ?? []), ''] })}
            >
              {t('sentinel_compute.add_key')}
            </Button>
            <div className={styles.runtimeRow}>
              <strong>TLS</strong>
              <ToggleSwitch
                checked={draft.tls?.enable ?? false}
                disabled={busy}
                onChange={(enable) => update({ tls: { cert: '', key: '', ...draft.tls, enable } })}
                ariaLabel="TLS"
              />
            </div>
            <div className={styles.settingsGrid}>
              {(['cert', 'key'] as const).map((field) => (
                <label key={field}>
                  {t(`sentinel_compute.tls_${field}`)}
                  <input
                    value={draft.tls?.[field] ?? ''}
                    disabled={busy || !draft.tls?.enable}
                    onChange={(event) =>
                      update({
                        tls: {
                          enable: false,
                          cert: '',
                          key: '',
                          ...draft.tls,
                          [field]: event.target.value,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </Card>
          <Card title={t('sentinel_compute.resources')}>
            <div className={styles.runtimeRow}>
              <strong>{t('sentinel_compute.server_sdk')}</strong>
              <ToggleSwitch
                checked={draft['sdk-fallback-enabled']}
                disabled={busy}
                onChange={(value) => update({ 'sdk-fallback-enabled': value })}
                ariaLabel={t('sentinel_compute.server_sdk')}
              />
            </div>
            <div className={styles.settingsGrid}>
              {numericFields.map(([key, , min, max]) => (
                <label key={key}>
                  {t(`sentinel_compute.${key}`)}
                  <input
                    type="number"
                    min={min}
                    max={max}
                    disabled={busy}
                    value={Number.isFinite(draft[key]) ? draft[key] : ''}
                    onChange={(event) =>
                      update({
                        [key]: event.target.value === '' ? NaN : Number(event.target.value),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <p className="text-secondary">{t('sentinel_compute.resources_hint')}</p>
            <SentinelCompatibilityEditor
              draft={rules}
              onChange={setRules}
              disabled={busy}
              supported
            />
          </Card>
          {!valid && <p className={styles.validationError}>{t('sentinel_compute.invalid')}</p>}
          <div className={styles.footerActions}>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await load(true);
                  setMessage('');
                } catch {
                  setMessage('sentinel_compute.load_failed');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('sentinel_compute.reload')}
            </Button>
            <Button
              disabled={busy || !dirty || !valid}
              onClick={async () => {
                if (!validRules) return;
                setBusy(true);
                try {
                  await chatGptWebApi.patchSentinelSolver({
                    ...draft,
                    'go-vm-compatibility': validRules,
                  });
                  setSaved(JSON.stringify({ config: draft, rules }));
                  setMessage('sentinel_compute.saved');
                  try {
                    await load(true);
                  } catch {
                    setMessage('sentinel_compute.saved_refresh_failed');
                  }
                } catch {
                  setMessage('sentinel_compute.save_failed');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('common.save')}
            </Button>
          </div>
        </>
      )}
      <Card
        title={t('sentinel_compute.status')}
        extra={
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void load(false).catch(() => setMessage('sentinel_compute.load_failed'))}
          >
            {t('sentinel_compute.refresh')}
          </Button>
        }
      >
        {status?.restart_required && <p role="status">{t('sentinel_compute.restart_required')}</p>}
        {status && (
          <dl className={styles.statusGrid}>
            <div>
              <dt>{t('sentinel_compute.listen')}</dt>
              <dd>{status.address || '-'}</dd>
            </div>
            <div>
              <dt>{t('sentinel_compute.running')}</dt>
              <dd>{String(status.running)}</dd>
            </div>
            {Object.entries(status.runtime)
              .filter(
                ([key]) => !['sdk', 'limits', 'instance', 'protocol', 'enabled'].includes(key)
              )
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{t(`sentinel_compute.${key}`, { defaultValue: key })}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            <div>
              <dt>SDK</dt>
              <dd>{status.runtime.sdk?.sdk_version || '-'}</dd>
            </div>
          </dl>
        )}
      </Card>
    </div>
  );
}
