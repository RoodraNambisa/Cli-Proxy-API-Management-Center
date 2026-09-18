import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModelProbeDetailsModal } from './ModelProbeDetailsModal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { apiClient } from '@/services/api/client';
import { authFilesApi, type ModelProbeResult } from '@/services/api/authFiles';
import { getAuthFileModelCapability, type AuthFileModelItem } from '@/features/authFiles/constants';
import { GROK_UPSTREAM_MODES, normalizeGrokBaseUrl } from '@/utils/grokUpstream';
import styles from './AuthFileModelProbe.module.scss';

type ProbeState = {
  state: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  result?: ModelProbeResult;
  error?: string;
};

export function AuthFileModelProbe({
  fileName,
  provider,
  models,
}: {
  fileName: string;
  provider: string;
  models: AuthFileModelItem[];
}) {
  const { t } = useTranslation();
  const [protocol, setProtocol] = useState(
    provider === 'codex' || provider === 'xai' ? 'responses' : 'chat'
  );
  const [prompt, setPrompt] = useState('');
  const [requestBody, setRequestBody] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [detailModel, setDetailModel] = useState<string | null>(null);
  const [stream, setStream] = useState(false);
  const [stateMode, setStateMode] = useState<'configured' | 'none' | 'custom' | 'managed'>(
    'configured'
  );
  const [customState, setCustomState] = useState('');
  const [upstream, setUpstream] = useState('configured');
  const [customURL, setCustomURL] = useState('');
  const [search, setSearch] = useState('');
  const [manualModel, setManualModel] = useState('');
  const [extraModels, setExtraModels] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, ProbeState>>({});
  const [running, setRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const allModels = useMemo(
    () => [
      ...new Set([
        ...models
          .filter(
            (model) =>
              (getAuthFileModelCapability(model, provider) ??
                (/image|video/i.test(model.id) ? 'image' : 'text')) === 'text'
          )
          .map((model) => model.id),
        ...extraModels,
      ]),
    ],
    [models, provider, extraModels]
  );
  const visibleModels = allModels.filter((model) =>
    model.toLowerCase().includes(search.trim().toLowerCase())
  );
  const normalizedURL = normalizeGrokBaseUrl(customURL);
  const invalidURL = provider === 'xai' && upstream === 'custom' && !normalizedURL;
  const temporary = useMemo(() => {
    if (!requestBody.trim()) return { body: undefined, invalid: false };
    try {
      const body: unknown = JSON.parse(requestBody);
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        new TextEncoder().encode(requestBody).length > 65536
      )
        return { body: undefined, invalid: true };
      return { body: body as Record<string, unknown>, invalid: false };
    } catch {
      return { body: undefined, invalid: true };
    }
  }, [requestBody]);
  const outputLimit = maxTokens.trim() ? Number(maxTokens) : undefined;
  const invalidLimit =
    outputLimit !== undefined &&
    (!/^\d+$/.test(maxTokens.trim()) || outputLimit < 1 || outputLimit > 32768);
  const invalidPrompt = new TextEncoder().encode(prompt).length > 16384;
  const invalidState =
    provider === 'codex' &&
    stateMode === 'custom' &&
    !/^[\x21-\x7e]{1,8192}$/.test(customState.trim());
  const invalidRequest =
    invalidURL || temporary.invalid || invalidLimit || invalidPrompt || invalidState;

  useEffect(
    () => () => {
      generation.current += 1;
      controller.current?.abort();
    },
    []
  );

  const cancel = () => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
    setRunning(false);
    setResults((current) =>
      Object.fromEntries(
        Object.entries(current).map(([model, value]) => [
          model,
          value.state === 'running' || value.state === 'queued' ? { state: 'cancelled' } : value,
        ])
      )
    );
  };
  const resetOptions = (change: () => void) => {
    change();
    setResults({});
    setDetailModel(null);
  };
  const run = async (targets: string[]) => {
    if (controller.current || !targets.length || invalidRequest) return;
    const abort = new AbortController();
    controller.current = abort;
    const currentGeneration = ++generation.current;
    const connection = apiClient.captureConnection();
    setRunning(true);
    setDetailModel(null);
    setResults((current) => ({
      ...current,
      ...Object.fromEntries(targets.map((model) => [model, { state: 'queued' as const }])),
    }));
    try {
      for (const model of targets) {
        if (abort.signal.aborted || generation.current !== currentGeneration) break;
        setResults((current) => ({ ...current, [model]: { state: 'running' } }));
        try {
          const result = await authFilesApi.probeModel(
            {
              name: fileName,
              model,
              protocol,
              stream,
              ...(prompt.trim() ? { prompt } : {}),
              ...(outputLimit !== undefined ? { max_output_tokens: outputLimit } : {}),
              ...(temporary.body ? { request_body: temporary.body } : {}),
              ...(provider === 'codex' && stateMode !== 'configured'
                ? {
                    codex_state: {
                      mode: stateMode,
                      ...(stateMode === 'custom'
                        ? { 'x-codex-turn-state': customState.trim() }
                        : {}),
                    },
                  }
                : {}),
              ...(provider === 'xai'
                ? { upstream: upstream === 'custom' ? normalizedURL! : upstream }
                : {}),
            },
            connection,
            abort.signal
          );
          if (abort.signal.aborted || generation.current !== currentGeneration) break;
          setResults((current) => ({
            ...current,
            [model]: { state: result.success ? 'success' : 'failed', result },
          }));
        } catch (error) {
          if (abort.signal.aborted || generation.current !== currentGeneration) break;
          setResults((current) => ({
            ...current,
            [model]: {
              state: 'failed',
              error: error instanceof Error ? error.message : String(error),
            },
          }));
        }
      }
    } finally {
      if (generation.current === currentGeneration) {
        controller.current = null;
        setRunning(false);
      }
    }
  };
  const select = (model: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(model);
      else next.delete(model);
      return next;
    });
  const finished = Object.values(results).filter(
    (value) => value.state === 'success' || value.state === 'failed'
  ).length;

  return (
    <div className={styles.root}>
      <div className={styles.hint}>{t('model_probe.hint')}</div>
      <div className={styles.options}>
        <div>
          <label>{t('model_probe.protocol')}</label>
          <Select
            ariaLabel={t('model_probe.protocol')}
            value={protocol}
            disabled={running}
            onChange={(value) => resetOptions(() => setProtocol(value))}
            options={[
              'responses',
              'chat',
              ...(provider === 'xai' ? ['chat-direct', 'chat-responses'] : []),
            ].map((value) => ({ value, label: t(`model_probe.protocols.${value}`) }))}
          />
        </div>
        {provider === 'xai' && (
          <div>
            <label>{t('model_probe.upstream')}</label>
            <Select
              ariaLabel={t('model_probe.upstream')}
              value={upstream}
              disabled={running}
              onChange={(value) => resetOptions(() => setUpstream(value))}
              options={[
                { value: 'configured', label: t('model_probe.configured') },
                ...GROK_UPSTREAM_MODES.map((value) => ({
                  value,
                  label: t(`grok_upstream.modes.${value}`),
                })),
                { value: 'custom', label: t('grok_upstream.modes.custom') },
              ]}
            />
          </div>
        )}
        <div>
          <label>{t('model_probe.stream')}</label>
          <ToggleSwitch
            checked={stream}
            disabled={running}
            onChange={(value) => resetOptions(() => setStream(value))}
            ariaLabel={t('model_probe.stream')}
            label={stream ? 'SSE' : t('model_probe.non_stream')}
          />
        </div>
      </div>
      {provider === 'codex' && (
        <>
          <div className={styles.hint}>{t('model_probe.codex_conversion')}</div>
          <div className={styles.options}>
            <div>
              <label>{t('model_probe.state_mode')}</label>
              <Select
                ariaLabel={t('model_probe.state_mode')}
                value={stateMode}
                disabled={running}
                onChange={(value) => resetOptions(() => setStateMode(value as typeof stateMode))}
                options={(['configured', 'managed', 'custom', 'none'] as const).map((value) => ({
                  value,
                  label: t(`model_probe.state_modes.${value}`),
                }))}
              />
            </div>
          </div>
          <div className={styles.hint}>{t('model_probe.state_hint')}</div>
          {stateMode === 'custom' && (
            <label className={styles.custom}>
              {t('model_probe.custom_state')}
              <textarea
                className={`input ${styles.jsonInput}`}
                rows={3}
                autoComplete="off"
                spellCheck={false}
                value={customState}
                disabled={running}
                aria-invalid={invalidState}
                onChange={(event) => resetOptions(() => setCustomState(event.target.value))}
              />
              {invalidState && (
                <span role="alert" className={styles.failed}>
                  {t('model_probe.invalid_state')}
                </span>
              )}
            </label>
          )}
        </>
      )}
      {provider === 'xai' && upstream === 'custom' && (
        <label className={styles.custom}>
          {t('model_probe.custom_url')}
          <input
            className="input"
            value={customURL}
            disabled={running}
            placeholder="https://relay.example/v1"
            onChange={(event) => resetOptions(() => setCustomURL(event.target.value))}
          />
          {invalidURL && (
            <span role="alert" className={styles.failed}>
              {t('model_probe.invalid_url')}
            </span>
          )}
        </label>
      )}
      <div className={styles.requestEditor}>
        <label>
          <span>{t('model_probe.prompt')}</span>
          <textarea
            className="input"
            rows={3}
            value={prompt}
            disabled={running}
            placeholder={t('model_probe.prompt_placeholder')}
            aria-invalid={invalidPrompt}
            onChange={(event) => resetOptions(() => setPrompt(event.target.value))}
          />
        </label>
        <label>
          <span>{t('model_probe.output_limit')}</span>
          <input
            className="input"
            type="number"
            min={1}
            max={32768}
            step={1}
            placeholder="1024"
            value={maxTokens}
            disabled={running}
            aria-invalid={invalidLimit}
            onChange={(event) => resetOptions(() => setMaxTokens(event.target.value))}
          />
        </label>
      </div>
      {(invalidPrompt || invalidLimit) && (
        <div role="alert" className={styles.failed}>
          {t(invalidPrompt ? 'model_probe.prompt_too_large' : 'model_probe.invalid_limit')}
        </div>
      )}
      <details className={styles.advancedRequest}>
        <summary>{t('model_probe.temporary_json')}</summary>
        <div className={styles.hint}>{t('model_probe.temporary_json_hint')}</div>
        <textarea
          className={`input ${styles.jsonInput}`}
          rows={5}
          aria-label={t('model_probe.temporary_json')}
          placeholder={'{ "temperature": 0 }'}
          value={requestBody}
          disabled={running}
          aria-invalid={temporary.invalid}
          onChange={(event) => resetOptions(() => setRequestBody(event.target.value))}
        />
        {temporary.invalid && (
          <div role="alert" className={styles.failed}>
            {t('model_probe.invalid_json')}
          </div>
        )}
      </details>
      <div className={styles.toolbar}>
        <Button
          disabled={running || !visibleModels.length || invalidRequest}
          onClick={() => void run(visibleModels)}
        >
          {t('model_probe.test_visible', { count: visibleModels.length })}
        </Button>
        <Button
          variant="secondary"
          disabled={running || !allModels.some((model) => selected.has(model)) || invalidRequest}
          onClick={() => void run(allModels.filter((model) => selected.has(model)))}
        >
          {t('model_probe.test_selected', { count: selected.size })}
        </Button>
        <Button
          variant="secondary"
          disabled={running || !Object.values(results).some((value) => value.state === 'success')}
          onClick={() =>
            setSelected(new Set(allModels.filter((model) => results[model]?.state === 'success')))
          }
        >
          {t('model_probe.select_success')}
        </Button>
        {running && (
          <Button variant="danger" onClick={cancel}>
            {t('model_probe.cancel')}
          </Button>
        )}
        <input
          className="input"
          aria-label={t('model_probe.filter')}
          placeholder={t('model_probe.filter')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label={t('model_probe.select_visible')}
                  disabled={running || !visibleModels.length}
                  checked={
                    visibleModels.length > 0 && visibleModels.every((model) => selected.has(model))
                  }
                  onChange={(event) =>
                    setSelected((current) => {
                      const next = new Set(current);
                      for (const model of visibleModels) {
                        if (event.target.checked) next.add(model);
                        else next.delete(model);
                      }
                      return next;
                    })
                  }
                />
              </th>
              <th>{t('model_probe.model')}</th>
              <th>{t('model_probe.status')}</th>
              <th>{t('model_probe.result')}</th>
              <th>{t('model_probe.action')}</th>
            </tr>
          </thead>
          <tbody>
            {visibleModels.map((model) => {
              const entry = results[model];
              const result = entry?.result;
              return (
                <tr key={model}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${t('model_probe.select')} ${model}`}
                      disabled={running}
                      checked={selected.has(model)}
                      onChange={(event) => select(model, event.target.checked)}
                    />
                  </td>
                  <td className={styles.model}>{model}</td>
                  <td
                    className={
                      entry?.state === 'success'
                        ? styles.success
                        : entry?.state === 'failed'
                          ? styles.failed
                          : ''
                    }
                  >
                    {t(`model_probe.states.${entry?.state ?? 'idle'}`)}
                  </td>
                  <td>
                    {result && (
                      <span>
                        {(result.latency_ms / 1000).toFixed(2)} s
                        {result.status_code ? ` · ${result.status_code}` : ''}
                      </span>
                    )}
                    {(result || entry?.error) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetailModel(model)}
                        aria-label={`${t('model_probe.details')} ${model}`}
                      >
                        {t('model_probe.details')}
                      </Button>
                    )}
                    {!result && !entry?.error && '—'}
                  </td>
                  <td>
                    <Button
                      variant="secondary"
                      disabled={running || invalidRequest}
                      onClick={() => void run([model])}
                      aria-label={`${t('model_probe.test')} ${model}`}
                    >
                      {t('model_probe.test')}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visibleModels.length && <div className={styles.hint}>{t('model_probe.empty')}</div>}
      </div>
      {detailModel && (
        <ModelProbeDetailsModal
          model={detailModel}
          result={results[detailModel]?.result}
          error={results[detailModel]?.error}
          onClose={() => setDetailModel(null)}
          onUseState={
            provider === 'codex'
              ? (value) =>
                  resetOptions(() => {
                    setStateMode('custom');
                    setCustomState(value);
                  })
              : undefined
          }
        />
      )}
      <form
        className={styles.toolbar}
        onSubmit={(event) => {
          event.preventDefault();
          const model = manualModel.trim();
          if (model && !running) {
            setExtraModels((current) => [...new Set([...current, model])]);
            setManualModel('');
            setSearch('');
          }
        }}
      >
        <input
          className="input"
          aria-label={t('model_probe.manual_model')}
          placeholder={t('model_probe.manual_model')}
          maxLength={256}
          value={manualModel}
          disabled={running}
          onChange={(event) => setManualModel(event.target.value)}
        />
        <Button variant="secondary" type="submit" disabled={running || !manualModel.trim()}>
          {t('model_probe.add_model')}
        </Button>
        <span className={styles.hint} role="status">
          {t('model_probe.progress', { count: finished, total: allModels.length })}
        </span>
      </form>
    </div>
  );
}
