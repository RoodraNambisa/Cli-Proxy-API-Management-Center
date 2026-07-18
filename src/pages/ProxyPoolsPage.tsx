import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
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
  ProxyCheckResult,
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
  entries: [createEntry()],
});
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
  const [checkingPool, setCheckingPool] = useState('');
  const [editor, setEditor] = useState<PoolEditorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPool, setSavingPool] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [rebinding, setRebinding] = useState(false);
  const [error, setError] = useState('');
  const disabled = connectionStatus !== 'connected';

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
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [loadStatuses]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const poolOptions = useMemo(
    () => pools.map((pool) => ({ value: pool.name, label: pool.name })),
    [pools]
  );
  const rulesDirty = JSON.stringify(rules) !== JSON.stringify(baselineRules);

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
      const results = await proxyPoolsApi.checkPool(pool.name);
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
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void checkPool(pool)}
                          loading={checkingPool === pool.name}
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
                        {t('proxy_pools.bind_attempts', { count: pool['bind-attempts'] ?? 3 })}
                      </span>
                    </div>
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
                    type="password"
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
