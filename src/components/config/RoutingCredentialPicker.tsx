import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StateValuePicker } from './StateValuePicker';
import { apiClient } from '@/services/api/client';
import { useAuthStore } from '@/stores';
import { validRoutingCredential } from '@/utils/routingCredentials';

type CredentialOption = {
  id: string;
  name: string;
  provider: string;
  priority: number;
  disabled: boolean;
};

export function RoutingCredentialPicker({
  value,
  priority,
  onChange,
  disabled,
  error,
}: {
  value: string[];
  priority: string;
  onChange: (value: string[]) => void;
  disabled?: boolean;
  error?: string;
}) {
  const { t } = useTranslation();
  const scope = useAuthStore(
    (s) => `${s.apiBase}:${s.managementAccessPath}:${s.connectionGeneration ?? 0}`
  );
  const active = useRef(scope);
  active.current = scope;
  const pending = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{
    scope: string;
    credentials: CredentialOption[];
    error?: string;
  }>();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(false);
    return () => {
      pending.current?.abort();
    };
  }, [scope]);
  const refresh = async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const current = () => !controller.signal.aborted && active.current === scope;
    setLoading(true);
    try {
      const data = await apiClient.getAtConnection<{ credentials: CredentialOption[] }>(
        apiClient.captureConnection(),
        '/routing/credential-options',
        { signal: controller.signal }
      );
      if (!Array.isArray(data.credentials)) throw new Error('Invalid credential options');
      if (current()) setResult({ scope, credentials: data.credentials });
    } catch {
      if (current())
        setResult((old) => ({
          scope,
          credentials: old?.scope === scope ? old.credentials : [],
          error: t('routing_credentials.load_error'),
        }));
    } finally {
      if (current()) setLoading(false);
    }
  };
  const entries = result?.scope === scope ? result.credentials : [];
  const choices = entries
    .filter(
      (item) =>
        priority.trim() === '' || item.priority === Number(priority) || value.includes(item.id)
    )
    .map((item) => ({
      value: item.id,
      label: item.name,
      detail: `${item.provider} · ${t('routing_credentials.priority')} ${item.priority} · ID ${item.id}${item.disabled ? ' · ' + t('codex_state.disabled') : ''}`,
    }));
  return (
    <>
      <StateValuePicker
        key={scope}
        catalogHint={t('routing_credentials.catalog_hint')}
        label={t('routing_credentials.label')}
        value={value}
        onChange={onChange}
        disabled={disabled}
        choices={choices}
        maxItems={1024}
        emptyLabel={t('routing_credentials.empty')}
        hint={t('routing_credentials.hint')}
        onOpen={() => void refresh()}
        loading={loading}
        loadError={result?.scope === scope ? result.error : undefined}
        validate={(item) =>
          validRoutingCredential(item) ? undefined : t('routing_credentials.invalid')
        }
      />
      {error && (
        <div role="alert" className="error-box">
          {error}
        </div>
      )}
    </>
  );
}
