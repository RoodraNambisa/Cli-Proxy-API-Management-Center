import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CodexSection, useProviderStats } from '@/components/providers';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { Button } from '@/components/ui/Button';
import { providersApi } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { indexUsageDetailsByAuthIndex, indexUsageDetailsBySource } from '@/utils/usageIndex';
import {
  withDisableAllModelsRule,
  withoutDisableAllModelsRule,
} from '@/components/providers/utils';
import type { ProviderKeyConfig } from '@/types';
import { AiProvidersCodexEditPage } from './AiProvidersCodexEditPage';

function useConnectionKey() {
  return useAuthStore((state) =>
    JSON.stringify([
      state.apiBase,
      state.managementAccessPath,
      state.connectionStatus,
      state.connectionGeneration ?? 0,
    ])
  );
}

export function AiProvidersXaiPage() {
  const key = useConnectionKey();
  return <XaiKeys key={key} />;
}
export function AiProvidersXaiEditPage() {
  const key = useConnectionKey();
  return <AiProvidersCodexEditPage key={key} provider="xai" />;
}

function XaiKeys() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<ProviderKeyConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const revision = useRef(0);
  const connected = useAuthStore((state) => state.connectionStatus === 'connected');
  const { showConfirmation } = useNotificationStore();
  const clearCache = useConfigStore((state) => state.clearCache);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const { keyStats, usageDetails, loadKeyStats, refreshKeyStats } = useProviderStats({
    enabled: connected,
  });
  const bySource = useMemo(() => indexUsageDetailsBySource(usageDetails), [usageDetails]);
  const byIndex = useMemo(() => indexUsageDetailsByAuthIndex(usageDetails), [usageDetails]);
  const load = useCallback(async () => {
    const current = ++revision.current;
    setLoading(true);
    setError('');
    try {
      const next = await providersApi.getXaiConfigs();
      if (mounted.current && revision.current === current) {
        setConfigs(next);
        updateConfigValue('xai-api-key', next);
      }
    } catch (err) {
      if (mounted.current && revision.current === current)
        setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current && revision.current === current) setLoading(false);
    }
  }, [updateConfigValue]);
  useEffect(() => {
    if (connected) void loadKeyStats().catch(() => {});
  }, [connected, loadKeyStats]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      revision.current += 1;
    };
  }, [load]);
  const edit = (path: string) => navigate(path, { state: { fromAiProviders: true } });
  const update = async (action: () => Promise<unknown>) => {
    if (!mounted.current) return;
    setSaving(true);
    setError('');
    try {
      await action();
      if (mounted.current) {
        clearCache('xai-api-key');
        await load();
      }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setSaving(false);
    }
  };
  return (
    <SecondaryScreenShell
      title={t('ai_providers.xai_title')}
      onBack={() => navigate('/ai-providers')}
      backLabel={t('common.back')}
      rightAction={
        <Button
          variant="secondary"
          disabled={loading || saving}
          onClick={() => {
            void load();
            void refreshKeyStats().catch(() => {});
          }}
        >
          {t('common.refresh')}
        </Button>
      }
    >
      {error && (
        <div role="alert" className="error-box">
          {error}
        </div>
      )}
      <CodexSection
        provider="xai"
        configs={configs}
        keyStats={keyStats}
        usageDetailsBySource={bySource}
        usageDetailsByAuthIndex={byIndex}
        loading={loading}
        disableControls={!connected}
        isSwitching={saving}
        onAdd={() => edit('/ai-providers/xai/new')}
        onEdit={(index) => edit(`/ai-providers/xai/${index}`)}
        onToggle={(index, enabled) =>
          void update(() =>
            providersApi.updateXaiConfig(index, {
              ...configs[index],
              excludedModels: enabled
                ? withoutDisableAllModelsRule(configs[index].excludedModels)
                : withDisableAllModelsRule(configs[index].excludedModels),
            })
          )
        }
        onDelete={(index) =>
          showConfirmation({
            title: t('common.delete'),
            message: t('ai_providers.xai_delete_confirm'),
            variant: 'danger',
            onConfirm: () =>
              update(() =>
                providersApi.deleteXaiConfig(configs[index].apiKey, configs[index].baseUrl)
              ),
          })
        }
      />
    </SecondaryScreenShell>
  );
}
