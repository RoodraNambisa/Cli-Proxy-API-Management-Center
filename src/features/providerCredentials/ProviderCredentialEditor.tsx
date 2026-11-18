import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { ModelInputList } from '@/components/ui/ModelInputList';
import type { ModelEntry } from '@/components/ui/modelInputListUtils';
import { normalizeModelAliases } from '@/services/api/transformers';
import { apiClient } from '@/services/api/client';
import { authFilesApi, type ModelProbeResult } from '@/services/api/authFiles';
import type { ModelInfo } from '@/utils/models';
import {
  providerCredentialsApi,
  type CredentialDetail,
  type CredentialValues,
  type ProviderKind,
} from './api';
import styles from './ProviderCredentialEditor.module.scss';

const kinds: ProviderKind[] = [
  'codex',
  'claude',
  'gemini',
  'interactions',
  'xai',
  'vertex',
  'openai',
];
export function ProviderCredentialEditor({
  id,
  onClose,
  onSaved,
}: {
  id?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const connection = useMemo(() => apiClient.captureConnection(), []);
  const controller = useRef<AbortController | null>(null);
  const executing = useRef(false);
  const discoveryCache = useRef<{ signature: string; at: number; models: ModelInfo[] } | undefined>(
    undefined
  );
  const [detail, setDetail] = useState<CredentialDetail>();
  const [kind, setKind] = useState<ProviderKind>('codex');
  const [values, setValues] = useState<CredentialValues>({ 'models-mode': 'selected', models: [] });
  const [loading, setLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<ModelInfo[]>([]);
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [newKey, setNewKey] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [testModel, setTestModel] = useState('');
  const [testResult, setTestResult] = useState<ModelProbeResult>();
  const [parentId, setParentId] = useState<string>();
  const targetId = parentId ?? id;
  const inherited = Boolean(detail?.parent);
  const modelInherited = inherited && values.models == null;
  const models = (modelInherited ? detail?.parent?.models : values.models) ?? [];
  const visible = catalog.filter((model) =>
    model.name.toLowerCase().includes(search.toLowerCase())
  );
  const set = (key: string, value: unknown) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  useEffect(() => {
    if (!targetId) return;
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setError('');
    setCatalog([]);
    providerCredentialsApi
      .get(targetId, connection, abort.signal)
      .then((data) => {
        if (!abort.signal.aborted) {
          setDetail(data);
          setKind(data.kind);
          setValues({ ...data.values, 'api-key': '' });
        }
      })
      .catch((err) => {
        if (!abort.signal.aborted) setError(String(err.message ?? err));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [targetId, connection]);
  useEffect(() => () => controller.current?.abort(), []);

  const execute = async (operation: (signal: AbortSignal) => Promise<void>) => {
    if (executing.current) return;
    executing.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError('');
    try {
      await operation(abort.signal);
    } catch (err) {
      if (!abort.signal.aborted)
        setError(
          (err as { status?: number }).status === 409
            ? t('api_credentials.conflict')
            : err instanceof Error
              ? err.message
              : String(err)
        );
    } finally {
      executing.current = false;
      if (!abort.signal.aborted) setBusy(false);
    }
  };
  const save = () =>
    execute(async (signal) => {
      if (
        values['models-mode'] === 'selected' &&
        !values.models?.some((m) => String(m.name ?? '').trim())
      )
        throw new Error(t('api_credentials.models_required'));
      const allowed = [
        'channel-name',
        'api-key',
        'base-url',
        'proxy-url',
        'proxy-region',
        'priority',
        'weight',
        'disabled',
        'prefix',
        'headers',
        'models',
        'models-mode',
        'models-endpoint',
        'excluded-models',
        'websockets',
        'alpha-search',
        'request-retry',
        'request-scoped-errors',
        'time-context',
        'cloak',
      ];
      const patch = Object.fromEntries(
        Object.entries(values).filter(([key]) => allowed.includes(key))
      ) as CredentialValues;
      if (Array.isArray(patch.models))
        patch.models = patch.models.filter((model) => String(model.name ?? '').trim());
      if (detail) await providerCredentialsApi.save(detail, patch, connection, signal);
      else await providerCredentialsApi.create(kind, patch, connection, signal);
      if (!signal.aborted) {
        onSaved();
        onClose();
      }
    });
  const discover = () =>
    execute(async (signal) => {
      const signature = JSON.stringify([
        targetId,
        detail?.revision,
        kind,
        ...['api-key', 'base-url', 'proxy-url', 'models-endpoint', 'headers'].map(
          (key) => values[key]
        ),
      ]);
      const cached = discoveryCache.current;
      const found =
        cached?.signature === signature && Date.now() - cached.at < 60000
          ? cached.models
          : await providerCredentialsApi.discover(targetId, { kind, values }, connection, signal);
      if (!signal.aborted) {
        discoveryCache.current = { signature, at: Date.now(), models: found };
        setCatalog(found);
        setChosen(new Set(models.map((m) => String(m.name))));
      }
    });
  const applySelection = () => {
    const previous = new Map(models.map((model) => [String(model.name), model]));
    const next = [
      ...models.filter((model) => !catalog.some((item) => item.name === model.name)),
      ...catalog
        .filter((model) => chosen.has(model.name))
        .map((model) => previous.get(model.name) ?? { name: model.name }),
    ];
    setValues((current) => ({ ...current, models: next, 'models-mode': 'selected' }));
  };
  const test = () =>
    execute(async (signal) => {
      if (!targetId || !testModel) return;
      const protocol = kind === 'codex' ? 'responses' : 'chat';
      const result = await authFilesApi.probeModel(
        { name: targetId, model: testModel, protocol, stream: true, prompt: 'Reply OK.' },
        connection,
        signal
      );
      if (!signal.aborted) setTestResult(result);
    });

  return (
    <Modal
      open
      title={t(targetId ? 'api_credentials.edit' : 'api_credentials.add')}
      onClose={onClose}
      width={900}
      closeDisabled={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void save()} disabled={loading || busy} loading={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {loading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <div className={styles.form}>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          {detail?.parent && (
            <div className={styles.toolbar}>
              <span>
                {t('api_credentials.parent')}:{' '}
                {String(detail.parent['channel-name'] || detail.parent.name || '')}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setParentId(detail.parent_id)}
                disabled={busy}
              >
                {t('api_credentials.edit_parent')}
              </Button>
            </div>
          )}
          <div className={styles.grid}>
            <Input
              label={t(inherited ? 'api_credentials.key_name' : 'api_credentials.channel_name')}
              value={String(values['channel-name'] ?? '')}
              onChange={(e) => set('channel-name', e.target.value)}
              disabled={busy}
            />
            <div className={styles.field}>
              <label>{t('api_credentials.protocol')}</label>
              <Select
                value={kind}
                options={kinds.map((value) => ({
                  value,
                  label: t(`api_credentials.kinds.${value}`),
                }))}
                onChange={(value) => setKind(value as ProviderKind)}
                disabled={Boolean(targetId) || busy}
              />
            </div>
            {!detail?.is_parent && (
              <Input
                label="API Key"
                type="password"
                autoComplete="off"
                value={String(values['api-key'] ?? '')}
                placeholder={values.has_api_key ? t('api_credentials.keep_key') : ''}
                onChange={(e) => set('api-key', e.target.value)}
                disabled={busy}
              />
            )}
            {!inherited && (
              <Input
                label="Base URL"
                value={String(values['base-url'] ?? '')}
                onChange={(e) => set('base-url', e.target.value)}
                disabled={busy}
              />
            )}
            <Input
              label={t('api_credentials.priority')}
              type="number"
              value={values.priority ?? ''}
              placeholder={
                inherited
                  ? t('api_credentials.inherit_priority', {
                      priority: detail?.parent?.priority ?? 0,
                    })
                  : '0'
              }
              onChange={(e) =>
                set(
                  'priority',
                  e.target.value === '' ? (inherited ? null : 0) : Number(e.target.value)
                )
              }
              disabled={busy}
            />
            <Input
              label={t('api_credentials.proxy')}
              value={String(values['proxy-url'] ?? '')}
              onChange={(e) => set('proxy-url', e.target.value)}
              disabled={busy || detail?.is_parent}
            />
          </div>
          {detail?.is_parent && (
            <section className={styles.section}>
              <strong>{t('api_credentials.channel_keys')}</strong>
              <div className={styles.toolbar}>
                {detail.keys?.map((key) => (
                  <Button
                    key={key.id}
                    variant="secondary"
                    size="sm"
                    onClick={() => setParentId(key.id)}
                    disabled={busy}
                  >
                    {key.name}
                  </Button>
                ))}
              </div>
              <div className={styles.grid}>
                <Input
                  label={t('api_credentials.key_name')}
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  disabled={busy}
                />
                <Input
                  label="API Key"
                  type="password"
                  autoComplete="off"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  disabled={busy}
                />
              </div>
              <Button
                variant="secondary"
                disabled={busy || !newKey.trim()}
                onClick={() =>
                  void execute(async (signal) => {
                    const result = await providerCredentialsApi.create(
                      'openai',
                      { 'api-key': newKey.trim(), 'channel-name': newKeyName.trim() },
                      connection,
                      signal,
                      detail
                    );
                    if (!signal.aborted) {
                      setNewKey('');
                      setNewKeyName('');
                      setParentId(result.id);
                      onSaved();
                    }
                  })
                }
              >
                {t('api_credentials.add_key')}
              </Button>
            </section>
          )}
          <ToggleSwitch
            label={t('api_credentials.enabled')}
            checked={!values.disabled}
            onChange={(enabled) => set('disabled', !enabled)}
            disabled={busy}
          />
          <section className={styles.section}>
            <div className={styles.toolbar}>
              <strong>{t('api_credentials.models')}</strong>
              <Button variant="secondary" size="sm" onClick={() => void discover()} disabled={busy}>
                {t('api_credentials.fetch_models')}
              </Button>
              {inherited && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setValues((current) => ({
                      ...current,
                      models: null,
                      'models-mode': null,
                    }))
                  }
                  disabled={busy}
                >
                  {t('api_credentials.inherit_models')}
                </Button>
              )}
              {modelInherited && (
                <span className={styles.hint}>{t('api_credentials.inherited')}</span>
              )}
            </div>
            <Input
              label={t('api_credentials.models_endpoint')}
              value={String(values['models-endpoint'] ?? '')}
              onChange={(e) => set('models-endpoint', e.target.value)}
              disabled={busy}
            />
            <div className={styles.field}>
              <label>{t('api_credentials.model_mode')}</label>
              <Select
                value={String(
                  values['models-mode'] ??
                    (modelInherited ? (detail?.parent?.['models-mode'] ?? 'default') : 'default')
                )}
                options={[
                  { value: 'selected', label: t('api_credentials.selected_models') },
                  { value: 'default', label: t('api_credentials.default_models') },
                ]}
                onChange={(value) =>
                  setValues((current) => ({
                    ...current,
                    'models-mode': value,
                    models: current.models ?? models,
                  }))
                }
                disabled={busy}
              />
            </div>
            <ModelInputList
              entries={
                models.map((model) => {
                  const normalized = normalizeModelAliases([model])?.[0] ?? model;
                  return {
                    ...normalized,
                    name: String(model.name ?? ''),
                    alias: String(model.alias ?? ''),
                  };
                }) as ModelEntry[]
              }
              onChange={(entries) =>
                setValues((current) => ({
                  ...current,
                  models: entries.map((m) => {
                    const result: Record<string, unknown> = { ...m, name: m.name.trim() };
                    for (const [from, to] of [
                      ['displayName', 'display-name'],
                      ['maxContextLength', 'max-context-length'],
                      ['inputModalities', 'input-modalities'],
                      ['isCompat', 'is-compat'],
                      ['testModel', 'test-model'],
                    ]) {
                      if (from in result) {
                        result[to] = result[from];
                        delete result[from];
                      }
                    }
                    return result;
                  }),
                  'models-mode': 'selected',
                }))
              }
              disabled={busy}
              addLabel={t('api_credentials.add_model')}
            />
            {catalog.length > 0 && (
              <>
                <Input
                  label={t('api_credentials.search_models')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className={styles.toolbar}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setChosen((current) => new Set([...current, ...visible.map((m) => m.name)]))
                    }
                  >
                    {t('api_credentials.select_filtered')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setChosen(new Set())}>
                    {t('api_credentials.clear_selection')}
                  </Button>
                  <Button size="sm" onClick={applySelection}>
                    {t('api_credentials.apply_models', { count: chosen.size })}
                  </Button>
                </div>
                <div className={styles.catalog}>
                  {visible.map((model) => (
                    <label key={model.name}>
                      <input
                        type="checkbox"
                        checked={chosen.has(model.name)}
                        onChange={(e) =>
                          setChosen((current) => {
                            const next = new Set(current);
                            if (e.target.checked) next.add(model.name);
                            else next.delete(model.name);
                            return next;
                          })
                        }
                      />
                      {model.name}
                    </label>
                  ))}
                </div>
              </>
            )}
          </section>
          {targetId && !detail?.is_parent && (
            <section className={styles.section}>
              <div className={styles.toolbar}>
                <Select
                  value={testModel}
                  options={[
                    { value: '', label: t('api_credentials.choose_test_model') },
                    ...models
                      .filter((m) => String(m.name ?? '').trim())
                      .map((m) => ({
                        value: String(m.alias || m.name),
                        label: String(m.alias || m.name),
                      })),
                  ]}
                  onChange={setTestModel}
                  disabled={busy}
                />
                <Button
                  variant="secondary"
                  onClick={() => void test()}
                  disabled={busy || !testModel}
                >
                  {t('api_credentials.test')}
                </Button>
              </div>
              {testResult && (
                <div className={styles.section} role="status">
                  <strong>
                    {t(
                      testResult.success
                        ? 'api_credentials.test_passed'
                        : 'api_credentials.test_failed'
                    )}{' '}
                    · HTTP {testResult.status_code ?? '—'} · {testResult.latency_ms} ms
                  </strong>
                  <div className={styles.result}>
                    {testResult.response || testResult.error || ''}
                  </div>
                  <details>
                    <summary>{t('api_credentials.diagnostics')}</summary>
                    <pre className={styles.result}>{JSON.stringify(testResult, null, 2)}</pre>
                  </details>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
