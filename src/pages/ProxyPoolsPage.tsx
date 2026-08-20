import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconRefreshCw,
  IconSettings,
  IconTrash2,
  IconX,
} from '@/components/ui/icons';
import { proxyPoolsApi } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import type {
  ProxyBindingStatus,
  ApiError,
  ProxyCheckResult,
  ProxyCheckTask,
  ProxyHealthCheckConfig,
  ProxyHealthCheckRuntime,
  ProxyHealthEndpointTestResult,
  ProxyPool,
  ProxyPoolEntry,
  ProxyPoolStatus,
  ProxyRule,
} from '@/types';
import { formatDateTime } from '@/utils/format';
import styles from './ProxyPoolsPage.module.scss';

type ViewId = 'pools' | 'rules' | 'bindings';

type PoolEditorState = {
  original: ProxyPool | null;
  draft: ProxyPool;
};

const PROVIDER_OPTIONS = [
  'chatgpt-web',
  'codex',
  'xai',
  'claude',
  'antigravity',
  'gemini',
  'gemini-interactions',
  'aistudio',
  'vertex',
  'kimi',
  'iflow',
  'qwen',
  'openai-compatibility',
] as const;

const createEntry = (): ProxyPoolEntry => ({ id: '', 'url-template': '', ports: '' });
const createPool = (): ProxyPool => ({
  name: '',
  'placeholder-charset': '',
  'check-interval-seconds': 300,
  'bind-attempts': 3,
  'spread-bindings': false,
  entries: [createEntry()],
});

const DEFAULT_HEALTH_CHECK: ProxyHealthCheckConfig = {
  concurrency: 8,
  'endpoint-timeout-seconds': 8,
  'failure-threshold': 1,
  endpoints: [
    {
      name: 'cloudflare',
      url: 'https://cloudflare.com/cdn-cgi/trace',
      mode: 'cloudflare-trace',
    },
  ],
};

const cloneHealthCheck = (value: ProxyHealthCheckConfig): ProxyHealthCheckConfig => ({
  ...value,
  endpoints: value.endpoints.map((endpoint) => ({ ...endpoint })),
});

const taskIsActive = (task?: ProxyCheckTask): boolean =>
  task?.status === 'queued' || task?.status === 'running';

const errorStatus = (error: unknown): number | undefined => (error as ApiError | undefined)?.status;

const normalizeCheckSample = (value?: string): number => {
  const parsed = Math.trunc(Number(value));
  if (!value?.trim() || !Number.isFinite(parsed)) return 10;
  return Math.min(100, Math.max(1, parsed));
};

const clonePool = (pool: ProxyPool): ProxyPool => ({
  ...pool,
  entries: pool.entries.map((entry) => ({ ...entry })),
});

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? '');

const containsMaskedSecret = (value: string): boolean => {
  const values = [value];
  try {
    values.push(decodeURIComponent(value));
  } catch {
    // Keep validating the original value when percent decoding is invalid.
  }
  return values.some((item) => item.includes('********'));
};

const formatTime = (value?: string): string => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatDateTime(date);
};

const normalizeRule = (rule: ProxyRule): ProxyRule => ({
  name: rule.name.trim(),
  pool: rule.pool.trim(),
  providers: Array.from(new Set((rule.providers ?? []).map((item) => item.trim()).filter(Boolean))),
  priorities: Array.from(new Set(rule.priorities ?? [])).sort((left, right) => right - left),
});

function PriorityEditor({
  values,
  onChange,
  disabled,
}: {
  values: number[];
  onChange: (values: number[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = Number(draft);
    if (!Number.isSafeInteger(value) || values.includes(value)) return;
    onChange([...values, value]);
    setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    add();
  };

  return (
    <div className={styles.priorityEditor}>
      <div className={styles.chipList}>
        {values.map((value) => (
          <span key={value} className={styles.chip}>
            {value}
            <button
              type="button"
              onClick={() => onChange(values.filter((item) => item !== value))}
              disabled={disabled}
              title={t('proxy_pools.remove_priority')}
              aria-label={t('proxy_pools.remove_priority')}
            >
              <IconX size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className={styles.priorityInputRow}>
        <input
          className="input"
          type="number"
          step="1"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="-1, 0, 1"
          disabled={disabled}
        />
        <Button variant="secondary" size="sm" onClick={add} disabled={disabled || !draft.trim()}>
          <IconPlus size={14} />
          {t('common.add')}
        </Button>
      </div>
    </div>
  );
}

export function ProxyPoolsPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const { showNotification, showConfirmation } = useNotificationStore();
  const [view, setView] = useState<ViewId>('pools');
  const [pools, setPools] = useState<ProxyPool[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ProxyPoolStatus>>({});
  const [rules, setRules] = useState<ProxyRule[]>([]);
  const [baselineRules, setBaselineRules] = useState<ProxyRule[]>([]);
  const [bindings, setBindings] = useState<ProxyBindingStatus[]>([]);
  const [selectedAuthIds, setSelectedAuthIds] = useState<Set<string>>(new Set());
  const [checkResults, setCheckResults] = useState<Record<string, ProxyCheckResult[]>>({});
  const [checkTasks, setCheckTasks] = useState<Record<string, ProxyCheckTask>>({});
  const [asyncTasksSupported, setAsyncTasksSupported] = useState<boolean | null>(null);
  const [checkingPool, setCheckingPool] = useState('');
  const [checkSamples, setCheckSamples] = useState<Record<string, string>>({});
  const [editor, setEditor] = useState<PoolEditorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPool, setSavingPool] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [rebinding, setRebinding] = useState(false);
  const [error, setError] = useState('');
  const [healthConfig, setHealthConfig] = useState<ProxyHealthCheckConfig>(
    cloneHealthCheck(DEFAULT_HEALTH_CHECK)
  );
  const [baselineHealthConfig, setBaselineHealthConfig] = useState<ProxyHealthCheckConfig>(
    cloneHealthCheck(DEFAULT_HEALTH_CHECK)
  );
  const [healthRuntime, setHealthRuntime] = useState<ProxyHealthCheckRuntime | null>(null);
  const [healthSupported, setHealthSupported] = useState<boolean | null>(null);
  const [savingHealth, setSavingHealth] = useState(false);
  const [testingEndpoints, setTestingEndpoints] = useState(false);
  const [endpointTestResults, setEndpointTestResults] = useState<ProxyHealthEndpointTestResult[]>(
    []
  );
  const notifiedTasks = useRef(new Set<string>());
  const activeTasksRef = useRef<Array<[string, ProxyCheckTask]>>([]);
  const disabled = connectionStatus !== 'connected';

  const loadHealthCheck = useCallback(async () => {
    try {
      const response = await proxyPoolsApi.getHealthCheck();
      const normalized = cloneHealthCheck(response.config);
      setHealthConfig(normalized);
      setBaselineHealthConfig(cloneHealthCheck(normalized));
      setHealthRuntime(response.runtime ?? null);
      setHealthSupported(true);
    } catch (loadError) {
      if ([404, 405].includes(errorStatus(loadError) ?? 0)) {
        setHealthSupported(false);
        return;
      }
      throw loadError;
    }
  }, []);

  const loadCheckTasks = useCallback(async (nextPools: ProxyPool[]) => {
    if (nextPools.length === 0) return;
    const settled = await Promise.allSettled(
      nextPools.map(
        async (pool) => [pool.name, await proxyPoolsApi.getCheckTasks(pool.name)] as const
      )
    );
    let supported = false;
    let unsupported = false;
    const nextTasks: Record<string, ProxyCheckTask> = {};
    settled.forEach((result) => {
      if (result.status === 'fulfilled') {
        supported = true;
        const [name, tasks] = result.value;
        const task = tasks.find(taskIsActive) ?? tasks[0];
        if (task) nextTasks[name] = task;
        return;
      }
      if ([404, 405].includes(errorStatus(result.reason) ?? 0)) unsupported = true;
    });
    if (supported) {
      setAsyncTasksSupported(true);
      setCheckTasks(nextTasks);
      setCheckResults((current) => {
        const next = { ...current };
        Object.entries(nextTasks).forEach(([name, task]) => {
          if (Array.isArray(task.results)) next[name] = task.results;
        });
        return next;
      });
    } else if (unsupported) {
      setAsyncTasksSupported(false);
    }
  }, []);

  const loadStatuses = useCallback(async (nextPools: ProxyPool[]) => {
    const settled = await Promise.allSettled(
      nextPools.map(
        async (pool) => [pool.name, await proxyPoolsApi.getPoolStatus(pool.name)] as const
      )
    );
    const nextStatuses: Record<string, ProxyPoolStatus> = {};
    settled.forEach((result) => {
      if (result.status === 'fulfilled') nextStatuses[result.value[0]] = result.value[1];
    });
    setStatuses(nextStatuses);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextPools, nextRules, nextBindings] = await Promise.all([
        proxyPoolsApi.getPools(),
        proxyPoolsApi.getRules(),
        proxyPoolsApi.getBindings(),
      ]);
      setPools(nextPools);
      setRules(nextRules);
      setBaselineRules(nextRules);
      setBindings(nextBindings);
      setSelectedAuthIds((current) => {
        const available = new Set(nextBindings.map((binding) => binding.auth_id));
        return new Set(Array.from(current).filter((authId) => available.has(authId)));
      });
      void loadStatuses(nextPools);
      void loadCheckTasks(nextPools);
      void loadHealthCheck().catch((loadError) => {
        setError(getErrorMessage(loadError));
      });
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [loadCheckTasks, loadHealthCheck, loadStatuses]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (healthSupported !== true) return;
    let canceled = false;
    const refreshRuntime = async () => {
      try {
        const response = await proxyPoolsApi.getHealthCheck();
        if (!canceled) setHealthRuntime(response.runtime ?? null);
      } catch {
        // Keep the latest runtime snapshot when a transient management read fails.
      }
    };
    const timer = window.setInterval(() => void refreshRuntime(), 5000);
    return () => {
      canceled = true;
      window.clearInterval(timer);
    };
  }, [healthSupported]);

  const applyCheckTask = useCallback(
    async (poolName: string, task: ProxyCheckTask, notify: boolean) => {
      setCheckTasks((current) => ({ ...current, [poolName]: task }));
      if (Array.isArray(task.results)) {
        setCheckResults((current) => ({ ...current, [poolName]: task.results ?? [] }));
      }
      if (!taskIsActive(task)) {
        if (notify && !notifiedTasks.current.has(task.task_id)) {
          notifiedTasks.current.add(task.task_id);
          showNotification(
            task.status === 'completed'
              ? t('proxy_pools.check_complete')
              : t(`proxy_pools.task_errors.${task.error_code ?? 'proxy_check_failed'}`),
            task.status === 'completed' && task.failed === 0 ? 'success' : 'warning'
          );
        }
        try {
          const status = await proxyPoolsApi.getPoolStatus(poolName);
          setStatuses((current) => ({ ...current, [poolName]: status }));
        } catch {
          // The task result remains useful when a status refresh races a config change.
        }
      }
    },
    [showNotification, t]
  );

  activeTasksRef.current = Object.entries(checkTasks).filter(([, task]) => taskIsActive(task));
  const activeTaskSignature = activeTasksRef.current
    .map(([poolName, task]) => `${poolName}:${task.task_id}`)
    .sort()
    .join('|');

  useEffect(() => {
    const active = activeTasksRef.current;
    if (!activeTaskSignature || asyncTasksSupported === false) return;
    let canceled = false;
    let timer: number | undefined;
    const poll = async () => {
      const settled = await Promise.allSettled(
        active.map(
          async ([poolName, task]) =>
            [poolName, await proxyPoolsApi.getCheckTask(poolName, task.task_id)] as const
        )
      );
      if (canceled) return;
      settled.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          void applyCheckTask(result.value[0], result.value[1], true);
          return;
        }
        const status = errorStatus(result.reason);
        if (status === 404 || status === 405) {
          const [poolName, task] = active[index];
          setCheckTasks((current) => {
            const next = { ...current };
            delete next[poolName];
            return next;
          });
          if (!notifiedTasks.current.has(task.task_id)) {
            notifiedTasks.current.add(task.task_id);
            showNotification(t('proxy_pools.task_errors.proxy_check_lost'), 'warning');
          }
          if (status === 405) setAsyncTasksSupported(false);
        }
      });
      if (!canceled) timer = window.setTimeout(() => void poll(), 1000);
    };
    void poll();
    return () => {
      canceled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeTaskSignature, applyCheckTask, asyncTasksSupported, showNotification, t]);

  const poolOptions = useMemo(
    () => pools.map((pool) => ({ value: pool.name, label: pool.name })),
    [pools]
  );
  const rulesDirty = JSON.stringify(rules) !== JSON.stringify(baselineRules);
  const healthDirty = JSON.stringify(healthConfig) !== JSON.stringify(baselineHealthConfig);

  const validateHealthConfig = (): string => {
    const integerFields = [
      healthConfig.concurrency,
      healthConfig['endpoint-timeout-seconds'],
      healthConfig['failure-threshold'],
    ];
    if (integerFields.some((value) => !Number.isSafeInteger(value) || value < 1)) {
      return t('proxy_pools.health_settings.validation_positive_integer');
    }
    if (healthConfig.endpoints.length === 0) {
      return t('proxy_pools.health_settings.validation_endpoint_required');
    }
    const names = new Set<string>();
    for (const endpoint of healthConfig.endpoints) {
      const name = endpoint.name.trim().toLowerCase();
      if (!name || !endpoint.url.trim()) {
        return t('proxy_pools.health_settings.validation_endpoint_required');
      }
      if (names.has(name)) return t('proxy_pools.health_settings.validation_endpoint_duplicate');
      names.add(name);
      try {
        const url = new URL(endpoint.url);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
      } catch {
        return t('proxy_pools.health_settings.validation_endpoint_url');
      }
    }
    return '';
  };

  const saveHealthCheck = async () => {
    const validationError = validateHealthConfig();
    if (validationError) {
      showNotification(validationError, 'error');
      return;
    }
    setSavingHealth(true);
    try {
      const normalized: ProxyHealthCheckConfig = {
        ...healthConfig,
        endpoints: healthConfig.endpoints.map((endpoint) => ({
          ...endpoint,
          name: endpoint.name.trim(),
          url: endpoint.url.trim(),
        })),
      };
      await proxyPoolsApi.updateHealthCheck(normalized);
      setHealthConfig(cloneHealthCheck(normalized));
      setBaselineHealthConfig(cloneHealthCheck(normalized));
      setHealthSupported(true);
      showNotification(t('proxy_pools.health_settings.saved'), 'success');
      await loadHealthCheck();
    } catch (saveError) {
      showNotification(
        `${t('proxy_pools.health_settings.save_failed')}: ${getErrorMessage(saveError)}`,
        'error'
      );
    } finally {
      setSavingHealth(false);
    }
  };

  const testHealthEndpoints = async () => {
    if (healthDirty) {
      showNotification(t('proxy_pools.health_settings.save_before_test'), 'warning');
      return;
    }
    setTestingEndpoints(true);
    try {
      const results = await proxyPoolsApi.testHealthEndpoints();
      setEndpointTestResults(results);
      showNotification(
        results.every((result) => result.ok)
          ? t('proxy_pools.health_settings.test_success')
          : t('proxy_pools.health_settings.test_partial'),
        results.every((result) => result.ok) ? 'success' : 'warning'
      );
    } catch (testError) {
      showNotification(
        `${t('proxy_pools.health_settings.test_failed')}: ${getErrorMessage(testError)}`,
        'error'
      );
    } finally {
      setTestingEndpoints(false);
    }
  };

  const openCreatePool = () => setEditor({ original: null, draft: createPool() });
  const openEditPool = (pool: ProxyPool) =>
    setEditor({ original: clonePool(pool), draft: clonePool(pool) });

  const updatePoolDraft = (patch: Partial<ProxyPool>) => {
    setEditor((current) =>
      current ? { ...current, draft: { ...current.draft, ...patch } } : current
    );
  };

  const updatePoolEntry = (index: number, patch: Partial<ProxyPoolEntry>) => {
    if (!editor) return;
    updatePoolDraft({
      entries: editor.draft.entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry
      ),
    });
  };

  const updateHealthEndpoint = (
    index: number,
    patch: Partial<ProxyHealthCheckConfig['endpoints'][number]>
  ) => {
    setHealthConfig((current) => ({
      ...current,
      endpoints: current.endpoints.map((endpoint, endpointIndex) =>
        endpointIndex === index ? { ...endpoint, ...patch } : endpoint
      ),
    }));
  };

  const moveHealthEndpoint = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= healthConfig.endpoints.length) return;
    setHealthConfig((current) => {
      const endpoints = [...current.endpoints];
      [endpoints[index], endpoints[target]] = [endpoints[target], endpoints[index]];
      return { ...current, endpoints };
    });
  };

  const validatePool = (state: PoolEditorState): string => {
    const { draft, original } = state;
    if (!draft.name.trim()) return t('proxy_pools.validation_name');
    if (draft.entries.length === 0) return t('proxy_pools.validation_entries');
    const entryIds = new Set<string>();
    for (const entry of draft.entries) {
      const id = entry.id.trim().toLowerCase();
      if (!id || !entry['url-template'].trim()) return t('proxy_pools.validation_entry_required');
      if (entryIds.has(id)) return t('proxy_pools.validation_entry_duplicate');
      entryIds.add(id);
      const originalEntry = original?.entries.find((item) => item.id.trim().toLowerCase() === id);
      const urlTemplate = entry['url-template'].trim();
      const urlChanged = !originalEntry || originalEntry['url-template'].trim() !== urlTemplate;
      if (urlChanged && containsMaskedSecret(urlTemplate)) {
        return t('proxy_pools.validation_masked_url');
      }
    }
    return '';
  };

  const savePool = async () => {
    if (!editor) return;
    if (rulesDirty) {
      showNotification(t('proxy_pools.save_rules_before_pool_change'), 'warning');
      return;
    }
    const validationError = validatePool(editor);
    if (validationError) {
      showNotification(validationError, 'error');
      return;
    }
    setSavingPool(true);
    try {
      const draft: ProxyPool = {
        ...editor.draft,
        name: editor.draft.name.trim(),
        'placeholder-charset': editor.draft['placeholder-charset']?.trim() || undefined,
        entries: editor.draft.entries.map((entry) => ({
          id: entry.id.trim(),
          'url-template': entry['url-template'].trim(),
          ports: entry.ports?.trim() || undefined,
        })),
      };
      if (editor.original) {
        const nextIds = new Set(draft.entries.map((entry) => entry.id.toLowerCase()));
        await proxyPoolsApi.updatePool(editor.original.name, {
          name: draft.name,
          'placeholder-charset': draft['placeholder-charset'] ?? '',
          'check-interval-seconds': draft['check-interval-seconds'] ?? 0,
          'bind-attempts': draft['bind-attempts'] ?? 0,
          'spread-bindings': Boolean(draft['spread-bindings']),
          entries: draft.entries,
          'delete-entry-ids': editor.original.entries
            .filter((entry) => !nextIds.has(entry.id.toLowerCase()))
            .map((entry) => entry.id),
        });
      } else {
        await proxyPoolsApi.createPool(draft);
      }
      setEditor(null);
      showNotification(t('proxy_pools.pool_saved'), 'success');
      await loadAll();
    } catch (saveError) {
      showNotification(
        `${t('proxy_pools.pool_save_failed')}: ${getErrorMessage(saveError)}`,
        'error'
      );
    } finally {
      setSavingPool(false);
    }
  };

  const deletePool = (pool: ProxyPool) => {
    if (rulesDirty) {
      showNotification(t('proxy_pools.save_rules_before_pool_change'), 'warning');
      return;
    }
    showConfirmation({
      title: t('proxy_pools.delete_pool_title'),
      message: t('proxy_pools.delete_pool_message', { name: pool.name }),
      confirmText: t('common.delete'),
      variant: 'danger',
      onConfirm: async () => {
        try {
          await proxyPoolsApi.deletePool(pool.name);
          showNotification(t('proxy_pools.pool_deleted'), 'success');
          await loadAll();
        } catch (deleteError) {
          showNotification(
            `${t('proxy_pools.pool_delete_failed')}: ${getErrorMessage(deleteError)}`,
            'error'
          );
        }
      },
    });
  };

  const checkPool = async (pool: ProxyPool) => {
    setCheckingPool(pool.name);
    try {
      const sample = normalizeCheckSample(checkSamples[pool.name]);
      if (asyncTasksSupported !== false) {
        try {
          const task = await proxyPoolsApi.createCheckTask(pool.name, sample);
          setAsyncTasksSupported(true);
          setCheckTasks((current) => ({ ...current, [pool.name]: task }));
          showNotification(t('proxy_pools.check_task_started'), 'success');
          return;
        } catch (taskError) {
          if (errorStatus(taskError) === 409) {
            const tasks = await proxyPoolsApi.getCheckTasks(pool.name);
            const active = tasks.find(taskIsActive);
            if (active) {
              setCheckTasks((current) => ({ ...current, [pool.name]: active }));
              showNotification(t('proxy_pools.check_task_reused'), 'warning');
              return;
            }
          }
          if (![404, 405].includes(errorStatus(taskError) ?? 0)) throw taskError;
          setAsyncTasksSupported(false);
        }
      }
      const results = await proxyPoolsApi.checkPool(pool.name, sample);
      setCheckResults((current) => ({ ...current, [pool.name]: results }));
      const status = await proxyPoolsApi.getPoolStatus(pool.name);
      setStatuses((current) => ({ ...current, [pool.name]: status }));
      showNotification(
        t('proxy_pools.check_complete'),
        results.some((result) => !result.ok) ? 'warning' : 'success'
      );
    } catch (checkError) {
      showNotification(`${t('proxy_pools.check_failed')}: ${getErrorMessage(checkError)}`, 'error');
    } finally {
      setCheckingPool('');
    }
  };

  const addRule = () => {
    setRules((current) => [
      ...current,
      { name: '', pool: pools[0]?.name ?? '', providers: [], priorities: [] },
    ]);
  };

  const updateRule = (index: number, patch: Partial<ProxyRule>) => {
    setRules((current) =>
      current.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...patch } : rule))
    );
  };

  const moveRule = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    setRules((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const saveRules = async () => {
    const normalized = rules.map(normalizeRule);
    const names = new Set<string>();
    for (const rule of normalized) {
      if (!rule.name || !rule.pool) {
        showNotification(t('proxy_pools.validation_rule_required'), 'error');
        return;
      }
      const key = rule.name.toLowerCase();
      if (names.has(key)) {
        showNotification(t('proxy_pools.validation_rule_duplicate'), 'error');
        return;
      }
      names.add(key);
    }
    setSavingRules(true);
    try {
      await proxyPoolsApi.saveRules(normalized);
      setRules(normalized);
      setBaselineRules(normalized);
      showNotification(t('proxy_pools.rules_saved'), 'success');
    } catch (saveError) {
      showNotification(
        `${t('proxy_pools.rules_save_failed')}: ${getErrorMessage(saveError)}`,
        'error'
      );
    } finally {
      setSavingRules(false);
    }
  };

  const toggleBinding = (authId: string) => {
    setSelectedAuthIds((current) => {
      const next = new Set(current);
      if (next.has(authId)) next.delete(authId);
      else next.add(authId);
      return next;
    });
  };

  const rebindSelected = async () => {
    if (selectedAuthIds.size === 0) return;
    setRebinding(true);
    try {
      const results = await proxyPoolsApi.rebind({ auth_ids: Array.from(selectedAuthIds) });
      const failed = results.filter((result) => !result.updated);
      if (failed.length > 0) {
        showNotification(
          t('proxy_pools.rebind_partial', { failed: failed.length, total: results.length }),
          'warning'
        );
        setSelectedAuthIds(new Set(failed.map((result) => result.auth_id)));
      } else {
        showNotification(t('proxy_pools.rebind_success'), 'success');
        setSelectedAuthIds(new Set());
      }
      const nextBindings = await proxyPoolsApi.getBindings();
      setBindings(nextBindings);
      void loadStatuses(pools);
    } catch (rebindError) {
      showNotification(
        `${t('proxy_pools.rebind_failed')}: ${getErrorMessage(rebindError)}`,
        'error'
      );
    } finally {
      setRebinding(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>{t('proxy_pools.eyebrow')}</span>
          <h1>{t('proxy_pools.title')}</h1>
          <p>{t('proxy_pools.description')}</p>
        </div>
        <Button variant="secondary" onClick={() => void loadAll()} loading={loading}>
          <IconRefreshCw size={16} />
          {t('common.refresh')}
        </Button>
      </header>

      <div className={styles.viewTabs} role="tablist" aria-label={t('proxy_pools.title')}>
        {(['pools', 'rules', 'bindings'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={view === item}
            className={view === item ? styles.viewTabActive : ''}
            onClick={() => setView(item)}
          >
            {t(`proxy_pools.tabs.${item}`)}
          </button>
        ))}
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      {view === 'pools' ? (
        <section className={styles.viewSection}>
          {healthSupported === false ? (
            <div className={styles.compatibilityNotice}>
              {t('proxy_pools.health_settings.legacy_backend')}
            </div>
          ) : (
            <article className={styles.healthSettingsCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>{t('proxy_pools.health_settings.title')}</h2>
                  <p>{t('proxy_pools.health_settings.description')}</p>
                </div>
                <div className={styles.rowActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void testHealthEndpoints()}
                    loading={testingEndpoints}
                    disabled={disabled || savingHealth || healthSupported !== true}
                  >
                    <IconCheck size={14} />
                    {t('proxy_pools.health_settings.test_endpoints')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void saveHealthCheck()}
                    loading={savingHealth}
                    disabled={disabled || healthSupported !== true || !healthDirty}
                  >
                    {t('common.save')}
                  </Button>
                </div>
              </div>
              <div className={styles.healthSettingsGrid}>
                <Input
                  label={t('proxy_pools.health_settings.concurrency')}
                  hint={t('proxy_pools.health_settings.concurrency_hint')}
                  type="number"
                  min="1"
                  step="1"
                  value={healthConfig.concurrency}
                  onChange={(event) =>
                    setHealthConfig((current) => ({
                      ...current,
                      concurrency: Number(event.target.value),
                    }))
                  }
                  disabled={disabled || healthSupported !== true}
                />
                <Input
                  label={t('proxy_pools.health_settings.timeout')}
                  hint={t('proxy_pools.health_settings.timeout_hint')}
                  type="number"
                  min="1"
                  step="1"
                  value={healthConfig['endpoint-timeout-seconds']}
                  onChange={(event) =>
                    setHealthConfig((current) => ({
                      ...current,
                      'endpoint-timeout-seconds': Number(event.target.value),
                    }))
                  }
                  disabled={disabled || healthSupported !== true}
                />
                <Input
                  label={t('proxy_pools.health_settings.failure_threshold')}
                  hint={t('proxy_pools.health_settings.failure_threshold_hint')}
                  type="number"
                  min="1"
                  step="1"
                  value={healthConfig['failure-threshold']}
                  onChange={(event) =>
                    setHealthConfig((current) => ({
                      ...current,
                      'failure-threshold': Number(event.target.value),
                    }))
                  }
                  disabled={disabled || healthSupported !== true}
                />
                <div className={styles.healthRuntime}>
                  <strong>{t('proxy_pools.health_settings.runtime')}</strong>
                  <span>
                    {t('proxy_pools.health_settings.runtime_value', {
                      active: healthRuntime?.active ?? 0,
                      limit: healthRuntime?.limit ?? healthConfig.concurrency,
                      queued: healthRuntime?.queued ?? 0,
                      peak: healthRuntime?.peak_active ?? 0,
                      peakQueued: healthRuntime?.peak_queued ?? 0,
                      completed: healthRuntime?.completed ?? 0,
                      succeeded: healthRuntime?.succeeded ?? 0,
                      failed: healthRuntime?.failed ?? 0,
                    })}
                  </span>
                </div>
              </div>
              <div className={styles.endpointHeader}>
                <div>
                  <h3>{t('proxy_pools.health_settings.endpoints')}</h3>
                  <p>{t('proxy_pools.health_settings.endpoints_hint')}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setHealthConfig((current) => ({
                      ...current,
                      endpoints: [...current.endpoints, { name: '', url: '', mode: 'http-status' }],
                    }))
                  }
                  disabled={disabled || healthSupported !== true}
                >
                  <IconPlus size={14} />
                  {t('proxy_pools.health_settings.add_endpoint')}
                </Button>
              </div>
              <div className={styles.endpointList}>
                {healthConfig.endpoints.map((endpoint, index) => {
                  const testResult = endpointTestResults.find(
                    (result) => result.name === endpoint.name
                  );
                  return (
                    <div key={`${index}-${endpoint.name}`} className={styles.endpointItem}>
                      <div className={styles.endpointOrderControls}>
                        <span className={styles.endpointOrder}>{index + 1}</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => moveHealthEndpoint(index, -1)}
                          disabled={disabled || healthSupported !== true || index === 0}
                          title={t('common.move_up')}
                          aria-label={t('common.move_up')}
                        >
                          <IconChevronUp size={13} />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => moveHealthEndpoint(index, 1)}
                          disabled={
                            disabled ||
                            healthSupported !== true ||
                            index === healthConfig.endpoints.length - 1
                          }
                          title={t('common.move_down')}
                          aria-label={t('common.move_down')}
                        >
                          <IconChevronDown size={13} />
                        </Button>
                      </div>
                      <Input
                        label={t('proxy_pools.health_settings.endpoint_name')}
                        value={endpoint.name}
                        onChange={(event) =>
                          updateHealthEndpoint(index, { name: event.target.value })
                        }
                        disabled={disabled || healthSupported !== true}
                      />
                      <Input
                        label={t('proxy_pools.health_settings.endpoint_url')}
                        value={endpoint.url}
                        onChange={(event) =>
                          updateHealthEndpoint(index, { url: event.target.value })
                        }
                        disabled={disabled || healthSupported !== true}
                      />
                      <div className={styles.endpointMode}>
                        <label>{t('proxy_pools.health_settings.endpoint_mode')}</label>
                        <Select
                          value={endpoint.mode}
                          options={[
                            {
                              value: 'cloudflare-trace',
                              label: t('proxy_pools.health_settings.modes.cloudflare_trace'),
                            },
                            {
                              value: 'http-status',
                              label: t('proxy_pools.health_settings.modes.http_status'),
                            },
                          ]}
                          onChange={(value) =>
                            updateHealthEndpoint(index, {
                              mode: value as ProxyHealthCheckConfig['endpoints'][number]['mode'],
                            })
                          }
                          disabled={disabled || healthSupported !== true}
                        />
                      </div>
                      {testResult ? (
                        <span className={testResult.ok ? styles.checkOk : styles.checkFailed}>
                          {testResult.ok ? <IconCheck size={13} /> : <IconX size={13} />}
                          {testResult.elapsed_ms} ms
                          {!testResult.ok
                            ? ` · ${t(
                                `proxy_pools.health_settings.test_errors.${testResult.error ?? 'unknown'}`
                              )}`
                            : null}
                        </span>
                      ) : null}
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() =>
                          setHealthConfig((current) => ({
                            ...current,
                            endpoints: current.endpoints.filter(
                              (_, itemIndex) => itemIndex !== index
                            ),
                          }))
                        }
                        disabled={
                          disabled || healthSupported !== true || healthConfig.endpoints.length <= 1
                        }
                        title={t('common.delete')}
                        aria-label={t('common.delete')}
                      >
                        <IconTrash2 size={14} />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </article>
          )}
          <div className={styles.sectionHeader}>
            <div>
              <h2>{t('proxy_pools.pool_list_title')}</h2>
              <p>{t('proxy_pools.pool_list_description')}</p>
            </div>
            <Button onClick={openCreatePool} disabled={disabled}>
              <IconPlus size={16} />
              {t('proxy_pools.add_pool')}
            </Button>
          </div>
          {pools.length === 0 && !loading ? (
            <div className={styles.emptyState}>{t('proxy_pools.pool_empty')}</div>
          ) : (
            <div className={styles.poolList}>
              {pools.map((pool) => {
                const status = statuses[pool.name];
                const results = checkResults[pool.name] ?? [];
                const task = checkTasks[pool.name];
                const poolChecking = checkingPool === pool.name || taskIsActive(task);
                return (
                  <article key={pool.name} className={styles.poolItem}>
                    <div className={styles.poolHeader}>
                      <div>
                        <h3>{pool.name}</h3>
                        <span>
                          {t('proxy_pools.pool_entry_count', { count: pool.entries.length })}
                        </span>
                      </div>
                      <div className={styles.rowActions}>
                        <div className={styles.checkSampleField}>
                          <label htmlFor={`proxy-check-sample-${pool.name}`}>
                            {t('proxy_pools.unbound_sample_label')}
                          </label>
                          <input
                            id={`proxy-check-sample-${pool.name}`}
                            className="input"
                            type="number"
                            min="1"
                            max="100"
                            step="1"
                            value={checkSamples[pool.name] ?? '10'}
                            onChange={(event) =>
                              setCheckSamples((current) => ({
                                ...current,
                                [pool.name]: event.target.value,
                              }))
                            }
                            onBlur={() =>
                              setCheckSamples((current) => ({
                                ...current,
                                [pool.name]: String(normalizeCheckSample(current[pool.name])),
                              }))
                            }
                            disabled={disabled || poolChecking}
                          />
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void checkPool(pool)}
                          loading={poolChecking}
                          disabled={disabled}
                        >
                          <IconRefreshCw size={14} />
                          {t('proxy_pools.check_pool')}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditPool(pool)}
                          disabled={disabled}
                        >
                          <IconSettings size={14} />
                          {t('common.edit')}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => deletePool(pool)}
                          disabled={disabled}
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                        >
                          <IconTrash2 size={14} />
                        </Button>
                      </div>
                    </div>
                    <div className={styles.poolMetrics}>
                      <span>
                        {t('proxy_pools.binding_count', { count: status?.binding_count ?? 0 })}
                      </span>
                      <span className={styles.healthyText}>
                        {t('proxy_pools.healthy_count', { count: status?.healthy_count ?? 0 })}
                      </span>
                      <span className={styles.unhealthyText}>
                        {t('proxy_pools.unhealthy_count', { count: status?.unhealthy_count ?? 0 })}
                      </span>
                      <span>
                        {t('proxy_pools.last_check', { time: formatTime(status?.last_check_at) })}
                      </span>
                      <span>
                        {t('proxy_pools.check_interval', {
                          seconds: pool['check-interval-seconds'] ?? 300,
                        })}
                      </span>
                      <span>
                        {t('proxy_pools.next_check', { time: formatTime(status?.next_check_at) })}
                      </span>
                      {status?.check_running || (status?.check_total ?? 0) > 0 ? (
                        <span>
                          {t('proxy_pools.round_progress', {
                            completed: status?.check_completed ?? 0,
                            total: status?.check_total ?? 0,
                            failed: status?.check_failed ?? 0,
                          })}
                        </span>
                      ) : null}
                      <span>{t('proxy_pools.schedule_after_completion')}</span>
                      <span>
                        {t('proxy_pools.bind_attempts', { count: pool['bind-attempts'] ?? 3 })}
                      </span>
                      <span>
                        {t('proxy_pools.check_scope', {
                          count: normalizeCheckSample(checkSamples[pool.name]),
                        })}
                      </span>
                      {pool['spread-bindings'] ? (
                        <span className={styles.spreadBindingsBadge}>
                          {t('proxy_pools.spread_bindings_enabled')}
                        </span>
                      ) : null}
                    </div>
                    {task ? (
                      <div className={styles.taskProgress} data-status={task.status}>
                        <strong>{t(`proxy_pools.task_status.${task.status}`)}</strong>
                        <span>
                          {t('proxy_pools.task_progress', {
                            completed: task.completed,
                            total: task.total,
                            running: task.running,
                            succeeded: task.succeeded,
                            failed: task.failed,
                          })}
                        </span>
                        <span>
                          {t('proxy_pools.task_scope', {
                            bound: task.bound,
                            sampled: task.sampled,
                          })}
                        </span>
                        {task.results_truncated ? (
                          <span>{t('proxy_pools.results_truncated')}</span>
                        ) : null}
                      </div>
                    ) : asyncTasksSupported === false ? (
                      <div className={styles.compatibilityNotice}>
                        {t('proxy_pools.legacy_sync_warning')}
                      </div>
                    ) : null}
                    {results.length > 0 ? (
                      <div className={styles.checkResults}>
                        {results.map((result, index) => (
                          <div key={`${result.entry}-${result.port ?? ''}-${index}`}>
                            <span className={result.ok ? styles.checkOk : styles.checkFailed}>
                              {result.ok ? <IconCheck size={13} /> : <IconX size={13} />}
                              {result.entry}
                              {result.port ? `:${result.port}` : ''}
                            </span>
                            <span>
                              {[result.ip, result.loc, result.colo].filter(Boolean).join(' / ') ||
                                '-'}
                            </span>
                            <span>
                              {result.http || '-'} · {result.tls || '-'}
                            </span>
                            <span>{result.elapsed_ms ?? '-'} ms</span>
                            {!result.ok ? (
                              <span>{result.message || result.error || '-'}</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {view === 'rules' ? (
        <section className={styles.viewSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>{t('proxy_pools.rules_title')}</h2>
              <p>{t('proxy_pools.rules_description')}</p>
            </div>
            <div className={styles.rowActions}>
              <Button
                variant="secondary"
                onClick={addRule}
                disabled={disabled || pools.length === 0}
              >
                <IconPlus size={16} />
                {t('proxy_pools.add_rule')}
              </Button>
              <Button
                onClick={() => void saveRules()}
                loading={savingRules}
                disabled={disabled || !rulesDirty}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
          <div className={styles.ruleNotice}>{t('proxy_pools.first_match_notice')}</div>
          {rules.length === 0 ? (
            <div className={styles.emptyState}>{t('proxy_pools.rules_empty')}</div>
          ) : (
            <div className={styles.ruleList}>
              {rules.map((rule, index) => {
                const providers = rule.providers ?? [];
                const unknownProviders = providers.filter(
                  (provider) =>
                    !PROVIDER_OPTIONS.includes(provider as (typeof PROVIDER_OPTIONS)[number])
                );
                return (
                  <article key={`${index}-${rule.name}`} className={styles.ruleItem}>
                    <div className={styles.ruleOrder}>
                      <strong>{index + 1}</strong>
                      <button
                        type="button"
                        onClick={() => moveRule(index, -1)}
                        disabled={disabled || index === 0}
                        title={t('proxy_pools.move_up')}
                        aria-label={t('proxy_pools.move_up')}
                      >
                        <IconChevronUp size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveRule(index, 1)}
                        disabled={disabled || index === rules.length - 1}
                        title={t('proxy_pools.move_down')}
                        aria-label={t('proxy_pools.move_down')}
                      >
                        <IconChevronDown size={15} />
                      </button>
                    </div>
                    <div className={styles.ruleFields}>
                      <Input
                        label={t('proxy_pools.rule_name')}
                        value={rule.name}
                        onChange={(event) => updateRule(index, { name: event.target.value })}
                        disabled={disabled}
                      />
                      <div className="form-group">
                        <label>{t('proxy_pools.rule_pool')}</label>
                        <Select
                          value={rule.pool}
                          options={poolOptions}
                          onChange={(pool) => updateRule(index, { pool })}
                          disabled={disabled}
                        />
                      </div>
                      <div className={styles.ruleWideField}>
                        <label>{t('proxy_pools.rule_providers')}</label>
                        <div className={styles.providerChoices}>
                          {[...PROVIDER_OPTIONS, ...unknownProviders].map((provider) => (
                            <SelectionCheckbox
                              key={provider}
                              checked={providers.includes(provider)}
                              label={provider}
                              onChange={(checked) =>
                                updateRule(index, {
                                  providers: checked
                                    ? [...providers, provider]
                                    : providers.filter((item) => item !== provider),
                                })
                              }
                              disabled={disabled}
                            />
                          ))}
                        </div>
                        <span className={styles.fieldHint}>
                          {t('proxy_pools.providers_empty_hint')}
                        </span>
                      </div>
                      <div className={styles.ruleWideField}>
                        <label>{t('proxy_pools.rule_priorities')}</label>
                        <PriorityEditor
                          values={rule.priorities ?? []}
                          onChange={(priorities) => updateRule(index, { priorities })}
                          disabled={disabled}
                        />
                        <span className={styles.fieldHint}>
                          {t('proxy_pools.priorities_empty_hint')}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setRules((current) => current.filter((_, itemIndex) => itemIndex !== index))
                      }
                      disabled={disabled}
                      title={t('common.delete')}
                      aria-label={t('common.delete')}
                    >
                      <IconTrash2 size={15} />
                    </Button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {view === 'bindings' ? (
        <section className={styles.viewSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>{t('proxy_pools.bindings_title')}</h2>
              <p>{t('proxy_pools.bindings_description')}</p>
            </div>
            <Button
              onClick={() => void rebindSelected()}
              loading={rebinding}
              disabled={disabled || selectedAuthIds.size === 0}
            >
              <IconRefreshCw size={16} />
              {t('proxy_pools.rebind_selected', { count: selectedAuthIds.size })}
            </Button>
          </div>
          {bindings.length === 0 ? (
            <div className={styles.emptyState}>{t('proxy_pools.bindings_empty')}</div>
          ) : (
            <div className={styles.bindingTableWrap}>
              <table className={styles.bindingTable}>
                <thead>
                  <tr>
                    <th>
                      <SelectionCheckbox
                        checked={selectedAuthIds.size === bindings.length && bindings.length > 0}
                        onChange={(checked) =>
                          setSelectedAuthIds(
                            checked
                              ? new Set(bindings.map((binding) => binding.auth_id))
                              : new Set()
                          )
                        }
                        ariaLabel={t('proxy_pools.select_all_bindings')}
                      />
                    </th>
                    <th>{t('proxy_pools.binding_auth')}</th>
                    <th>{t('proxy_pools.binding_pool')}</th>
                    <th>{t('proxy_pools.binding_health')}</th>
                    <th>{t('proxy_pools.binding_exit')}</th>
                    <th>{t('proxy_pools.binding_latency')}</th>
                    <th>{t('proxy_pools.binding_last_check')}</th>
                  </tr>
                </thead>
                <tbody>
                  {bindings.map((binding) => (
                    <tr key={binding.binding_id || binding.auth_id}>
                      <td>
                        <SelectionCheckbox
                          checked={selectedAuthIds.has(binding.auth_id)}
                          onChange={() => toggleBinding(binding.auth_id)}
                          ariaLabel={binding.auth_index || binding.auth_id}
                        />
                      </td>
                      <td>
                        <strong>{binding.auth_index || binding.auth_id}</strong>
                        <span>{binding.provider || '-'}</span>
                      </td>
                      <td>
                        {binding.pool} / {binding.entry}
                        {binding.port ? `:${binding.port}` : ''}
                      </td>
                      <td>
                        <span
                          className={
                            binding.healthy === true
                              ? styles.healthGood
                              : binding.healthy === false
                                ? styles.healthBad
                                : styles.healthUnknown
                          }
                        >
                          {binding.healthy === true
                            ? t('proxy_pools.health.healthy')
                            : binding.healthy === false
                              ? t('proxy_pools.health.unhealthy')
                              : t('proxy_pools.health.unknown')}
                        </span>
                      </td>
                      <td>{[binding.ip, binding.loc].filter(Boolean).join(' / ') || '-'}</td>
                      <td>{binding.elapsed_ms ?? '-'} ms</td>
                      <td>{formatTime(binding.last_check_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <Modal
        open={Boolean(editor)}
        title={editor?.original ? t('proxy_pools.edit_pool') : t('proxy_pools.add_pool')}
        onClose={() => !savingPool && setEditor(null)}
        closeDisabled={savingPool}
        width={760}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditor(null)} disabled={savingPool}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void savePool()} loading={savingPool}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {editor ? (
          <div className={styles.poolEditor}>
            <div className={styles.editorGrid}>
              <Input
                label={t('proxy_pools.pool_name')}
                value={editor.draft.name}
                onChange={(event) => updatePoolDraft({ name: event.target.value })}
              />
              <Input
                label={t('proxy_pools.placeholder_charset')}
                value={editor.draft['placeholder-charset'] ?? ''}
                onChange={(event) => updatePoolDraft({ 'placeholder-charset': event.target.value })}
                hint={t('proxy_pools.placeholder_charset_hint')}
              />
              <Input
                type="number"
                min="0"
                step="1"
                label={t('proxy_pools.check_interval_seconds')}
                value={editor.draft['check-interval-seconds'] ?? 0}
                onChange={(event) =>
                  updatePoolDraft({
                    'check-interval-seconds': Math.max(
                      0,
                      Math.trunc(Number(event.target.value) || 0)
                    ),
                  })
                }
              />
              <Input
                type="number"
                min="0"
                max="20"
                step="1"
                label={t('proxy_pools.bind_attempts_label')}
                value={editor.draft['bind-attempts'] ?? 0}
                onChange={(event) =>
                  updatePoolDraft({
                    'bind-attempts': Math.min(
                      20,
                      Math.max(0, Math.trunc(Number(event.target.value) || 0))
                    ),
                  })
                }
              />
              <div className={styles.toggleField}>
                <div>
                  <strong>{t('proxy_pools.spread_bindings')}</strong>
                  <p>{t('proxy_pools.spread_bindings_hint')}</p>
                </div>
                <ToggleSwitch
                  checked={Boolean(editor.draft['spread-bindings'])}
                  onChange={(spreadBindings) =>
                    updatePoolDraft({ 'spread-bindings': spreadBindings })
                  }
                  ariaLabel={t('proxy_pools.spread_bindings')}
                />
              </div>
            </div>
            <div className={styles.entryHeader}>
              <div>
                <h3>{t('proxy_pools.entries_title')}</h3>
                <p>{t('proxy_pools.entries_description')}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  updatePoolDraft({ entries: [...editor.draft.entries, createEntry()] })
                }
              >
                <IconPlus size={14} />
                {t('proxy_pools.add_entry')}
              </Button>
            </div>
            <div className={styles.entryList}>
              {editor.draft.entries.map((entry, index) => (
                <div key={index} className={styles.entryItem}>
                  <Input
                    label={t('proxy_pools.entry_id')}
                    value={entry.id}
                    onChange={(event) => updatePoolEntry(index, { id: event.target.value })}
                  />
                  <Input
                    type="text"
                    autoComplete="off"
                    data-1p-ignore="true"
                    data-lpignore="true"
                    spellCheck={false}
                    label={t('proxy_pools.url_template')}
                    value={entry['url-template']}
                    onChange={(event) =>
                      updatePoolEntry(index, { 'url-template': event.target.value })
                    }
                    hint={
                      containsMaskedSecret(entry['url-template'])
                        ? t('proxy_pools.masked_url_hint')
                        : t('proxy_pools.url_template_hint')
                    }
                  />
                  <Input
                    label={t('proxy_pools.ports')}
                    value={entry.ports ?? ''}
                    onChange={(event) => updatePoolEntry(index, { ports: event.target.value })}
                    hint={t('proxy_pools.ports_hint')}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      updatePoolDraft({
                        entries: editor.draft.entries.filter(
                          (_, entryIndex) => entryIndex !== index
                        ),
                      })
                    }
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                  >
                    <IconTrash2 size={15} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
