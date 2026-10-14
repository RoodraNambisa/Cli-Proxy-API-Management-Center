import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseDocument } from 'yaml';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { HeaderInputList } from '@/components/ui/HeaderInputList';
import { useAuthStore } from '@/stores';
import { apiClient } from '@/services/api/client';
import { authFilesApi } from '@/services/api/authFiles';
import { writeGrokConfig } from '@/utils/grokConfig';
import type { HeaderEntry } from '@/utils/headers';
import type { GrokVisualConfig } from '@/types/grok';
import type { GrokOptions, GrokTransmission } from '@/types/grokDiagnostics';
import { GrokDiagnostics } from './GrokDiagnostics';
import styles from './GrokConfigEditor.module.scss';

export function GrokHeadersPreview({
  sourceYaml,
  value,
  baselineValue,
  disabled,
}: {
  sourceYaml?: string;
  value: GrokVisualConfig;
  baselineValue: GrokVisualConfig;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const text = (name: string) => t(`grok_diagnostics.${name}`);
  const scope = useAuthStore(
    (s) => `${s.apiBase}:${s.managementAccessPath}:${s.connectionGeneration}`
  );
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<GrokOptions>();
  const [yaml, setYaml] = useState('');
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [purpose, setPurpose] = useState('inference');
  const [protocol, setProtocol] = useState('responses');
  const [stream, setStream] = useState(false);
  const [headers, setHeaders] = useState<HeaderEntry[]>([]);
  const [body, setBody] = useState('');
  const [result, setResult] = useState<GrokTransmission>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const connection = apiClient.captureConnection();
    setOptions(undefined);
    setResult(undefined);
    setError('');
    void Promise.all([
      authFilesApi.getGrokOptions(connection, controller.signal),
      sourceYaml !== undefined
        ? Promise.resolve(sourceYaml)
        : apiClient.getAtConnection<string>(connection, '/config.yaml', {
            signal: controller.signal,
            responseType: 'text',
          }),
    ])
      .then(([next, source]) => {
        if (controller.signal.aborted) return;
        if (!next.capabilities?.headers_preview) {
          setError(text('upgrade'));
          return;
        }
        setOptions(next);
        setYaml(source);
        setName(next.credentials[0]?.name || '');
        setModel(next.credentials[0]?.models[0] || '');
      })
      .catch((e: { status?: number; message?: string }) => {
        if (!controller.signal.aborted)
          setError(
            e.status === 404 || e.status === 405 ? text('upgrade') : e.message || text('failed')
          );
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
    // Labels do not determine the connection or reload the local draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope]);
  useEffect(() => {
    request.current?.abort();
    setBusy(false);
    setResult(undefined);
    return () => request.current?.abort();
  }, [value, sourceYaml, name, model, purpose, protocol, stream, headers, body, scope]);
  const preview = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError('');
    setBusy(true);
    try {
      const doc = parseDocument(sourceYaml ?? yaml);
      if (doc.errors.length) throw new Error(text('invalid_config'));
      writeGrokConfig(doc, value, baselineValue);
      const config = doc.toJS()?.xai ?? {};
      const requestBody = body.trim() ? JSON.parse(body) : undefined;
      if (requestBody && (typeof requestBody !== 'object' || Array.isArray(requestBody)))
        throw new Error(text('invalid_body'));
      const next = await authFilesApi.previewGrokHeaders(
        {
          name,
          model,
          purpose,
          protocol,
          stream,
          config,
          client_headers: Object.fromEntries(
            headers.filter((h) => h.key.trim()).map((h) => [h.key.trim(), [h.value]])
          ),
          request_body: requestBody,
        },
        apiClient.captureConnection(),
        controller.signal
      );
      if (!controller.signal.aborted) setResult(next);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : text('failed'));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <details className={styles.preview} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{text('preview')}</summary>
      <p className={styles.notice}>{text('preview_hint')}</p>
      {options && (
        <p className={styles.notice}>
          {text('version')}：{options.client_version} · {text(`sources.${options.version_source}`)}
        </p>
      )}
      <div className={styles.grid}>
        <div className="form-group">
          <label>{text('credential')}</label>
          <Select
            ariaLabel={text('credential')}
            value={name}
            options={options?.credentials.map((c) => ({ value: c.name, label: c.name })) ?? []}
            onChange={(next) => {
              setName(next);
              setModel(options?.credentials.find((c) => c.name === next)?.models[0] || '');
            }}
            disabled={disabled || !options}
          />
        </div>
        <Input
          label={text('model')}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={disabled}
        />
        <div className="form-group">
          <label>{text('purpose')}</label>
          <Select
            ariaLabel={text('purpose')}
            value={purpose}
            options={['inference', 'quota', 'models', 'device-login', 'token-exchange'].map(
              (p) => ({ value: p, label: text(`purposes.${p}`) })
            )}
            onChange={setPurpose}
            disabled={disabled}
          />
        </div>
        <div className="form-group">
          <label>{text('protocol')}</label>
          <Select
            ariaLabel={text('protocol')}
            value={protocol}
            options={['responses', 'chat', 'websocket'].map((p) => ({ value: p, label: p }))}
            onChange={setProtocol}
            disabled={disabled || purpose !== 'inference'}
          />
        </div>
      </div>
      <div className={styles.toggle}>
        <label>{text('stream')}</label>
        <ToggleSwitch
          ariaLabel={text('stream')}
          checked={stream}
          onChange={setStream}
          disabled={disabled || purpose !== 'inference' || protocol === 'websocket'}
        />
      </div>
      <details>
        <summary>{text('client_headers')}</summary>
        <HeaderInputList
          entries={headers}
          onChange={setHeaders}
          addLabel={text('add_header')}
          disabled={disabled}
        />
      </details>
      <details>
        <summary>{text('request_body')}</summary>
        <textarea
          className="input"
          rows={5}
          aria-label={text('request_body')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={disabled}
        />
      </details>
      <Button
        onClick={() => void preview()}
        disabled={
          disabled || busy || !options?.capabilities?.headers_preview || !name || !model.trim()
        }
      >
        {busy ? text('loading') : text('preview')}
      </Button>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {result && <GrokDiagnostics values={[result]} />}
    </details>
  );
}
