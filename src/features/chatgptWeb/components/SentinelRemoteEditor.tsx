import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { chatGptWebApi } from '@/services/api';
import type { SentinelRemote, SentinelScope, SentinelNodeStatus } from '@/types/sentinelCompute';
import { normalizeSentinelRemote } from '../sentinelRemote';
import styles from './ChatGptWebSentinelPanel.module.scss';

export function SentinelRemoteEditor({
  mode,
  remote,
  disabled,
  status,
  onChange,
}: {
  mode: 'local' | 'remote';
  remote: SentinelRemote;
  disabled: boolean;
  status?: SentinelNodeStatus[];
  onChange: (mode: 'local' | 'remote', remote: SentinelRemote) => void;
}) {
  const { t } = useTranslation();
  const [testing, setTesting] = useState<number | null>(null);
  const [result, setResult] = useState('');
  const value = normalizeSentinelRemote(remote);
  const update = (patch: SentinelRemote) => onChange(mode, { ...value, ...patch });
  return (
    <section className={styles.remoteEditor} id="config-chatgpt-web-sentinel-remote">
      <div className={styles.settingsGrid}>
        <label>
          {t('sentinel_compute.mode')}
          <select
            value={mode}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value as 'local' | 'remote', value)}
          >
            <option value="local">{t('sentinel_compute.local')}</option>
            <option value="remote">{t('sentinel_compute.remote')}</option>
          </select>
        </label>
        <label>
          {t('sentinel_compute.budget')}
          <input
            type="number"
            min={1}
            max={3600}
            value={Number.isFinite(value['budget-seconds']) ? value['budget-seconds'] : ''}
            disabled={disabled}
            onChange={(event) =>
              update({
                'budget-seconds': event.target.value === '' ? NaN : Number(event.target.value),
              })
            }
          />
        </label>
      </div>
      <p className="text-secondary">{t('sentinel_compute.remote_hint')}</p>
      <p className="text-secondary">{t('sentinel_compute.node_url_hint')}</p>
      <fieldset disabled={disabled}>
        <legend>{t('sentinel_compute.scopes')}</legend>
        {(['images', 'chat', 'login'] as SentinelScope[]).map((scope) => (
          <label key={scope} style={{ marginInlineEnd: 16 }}>
            <input
              type="checkbox"
              checked={value.scopes.includes(scope)}
              onChange={(event) =>
                update({
                  scopes: event.target.checked
                    ? [...value.scopes, scope]
                    : value.scopes.filter((entry) => entry !== scope),
                })
              }
            />{' '}
            {t(`sentinel_compute.${scope}`)}
          </label>
        ))}
      </fieldset>
      {value.nodes.map((node, index) => (
        <fieldset key={index} disabled={disabled}>
          <legend>
            {t('sentinel_compute.node')} {index + 1}
          </legend>
          <div className={styles.settingsGrid}>
            {(['name', 'url', 'api-key'] as const).map((key) => (
              <label key={key}>
                {t(`sentinel_compute.${key}`)}
                <input
                  type={key === 'api-key' ? 'password' : 'text'}
                  autoComplete="off"
                  value={node[key]}
                  onChange={(event) =>
                    update({
                      nodes: value.nodes.map((entry, current) =>
                        current === index ? { ...entry, [key]: event.target.value } : entry
                      ),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <Button
            variant="secondary"
            disabled={testing !== null}
            onClick={async () => {
              setTesting(index);
              setResult('');
              try {
                await chatGptWebApi.testSentinelNode(node);
                setResult(t('sentinel_compute.connection_ok'));
              } catch {
                setResult(t('sentinel_compute.connection_failed'));
              } finally {
                setTesting(null);
              }
            }}
          >
            {t('sentinel_compute.test')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => update({ nodes: value.nodes.filter((_, current) => current !== index) })}
          >
            {t('common.delete')}
          </Button>
        </fieldset>
      ))}
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => update({ nodes: [...value.nodes, { name: '', url: '', 'api-key': '' }] })}
      >
        {t('sentinel_compute.add_node')}
      </Button>
      {result && <p role="status">{result}</p>}
      <p>
        <a href="#/sentinel-solver">{t('sentinel_compute.server_title')}</a>
      </p>
      {status?.map((node) => (
        <p key={node.name}>
          <strong>{node.name}</strong>: Go {node.go_success} / SDK {node.sdk_success} /{' '}
          {t('sentinel_compute.fallback')} {node.local_fallbacks} / {t('sentinel_compute.failures')}{' '}
          {node.failures} / {node.last_latency_ms} ms {node.last_error}
        </p>
      ))}
    </section>
  );
}
