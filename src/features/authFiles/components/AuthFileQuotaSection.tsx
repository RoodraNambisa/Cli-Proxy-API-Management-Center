import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ANTIGRAVITY_CONFIG,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  KIMI_CONFIG,
  XAI_CONFIG,
} from '@/components/quota';
import { Button } from '@/components/ui/Button';
import { useNotificationStore, useQuotaStore } from '@/stores';
import type { AuthFileItem, CodexRateLimitResetCredit } from '@/types';
import { formatShanghaiDateTime, getStatusFromError } from '@/utils/quota';
import {
  isRuntimeOnlyAuthFile,
  resolveQuotaErrorMessage,
  type QuotaProviderType,
} from '@/features/authFiles/constants';
import { QuotaProgressBar } from '@/features/authFiles/components/QuotaProgressBar';
import styles from '@/pages/AuthFilesPage.module.scss';

type QuotaState = { status?: string; error?: string; errorStatus?: number } | undefined;

const assertNever = (value: never): never => {
  throw new Error(`Unsupported quota type: ${value}`);
};

const getQuotaConfig = (type: QuotaProviderType) => {
  if (type === 'antigravity') return ANTIGRAVITY_CONFIG;
  if (type === 'claude') return CLAUDE_CONFIG;
  if (type === 'codex') return CODEX_CONFIG;
  if (type === 'kimi') return KIMI_CONFIG;
  if (type === 'xai') return XAI_CONFIG;
  return assertNever(type);
};

export type AuthFileQuotaSectionProps = {
  file: AuthFileItem;
  quotaType: QuotaProviderType;
  disableControls: boolean;
};

export function AuthFileQuotaSection(props: AuthFileQuotaSectionProps) {
  const { file, quotaType, disableControls } = props;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const [resetCreditsRefreshing, setResetCreditsRefreshing] = useState(false);
  const [resettingCreditId, setResettingCreditId] = useState<string | null>(null);

  const quota = useQuotaStore((state) => {
    if (quotaType === 'antigravity') return state.antigravityQuota[file.name] as QuotaState;
    if (quotaType === 'claude') return state.claudeQuota[file.name] as QuotaState;
    if (quotaType === 'codex') return state.codexQuota[file.name] as QuotaState;
    if (quotaType === 'kimi') return state.kimiQuota[file.name] as QuotaState;
    if (quotaType === 'xai') return state.xaiQuota[file.name] as QuotaState;
    return assertNever(quotaType);
  });

  const updateQuotaState = useQuotaStore((state) => {
    if (quotaType === 'antigravity')
      return state.setAntigravityQuota as unknown as (updater: unknown) => void;
    if (quotaType === 'claude')
      return state.setClaudeQuota as unknown as (updater: unknown) => void;
    if (quotaType === 'codex') return state.setCodexQuota as unknown as (updater: unknown) => void;
    if (quotaType === 'kimi') return state.setKimiQuota as unknown as (updater: unknown) => void;
    if (quotaType === 'xai') return state.setXaiQuota as unknown as (updater: unknown) => void;
    return assertNever(quotaType);
  });

  const refreshQuotaForFile = useCallback(async () => {
    if (disableControls) return;
    if (isRuntimeOnlyAuthFile(file)) return;
    if (file.disabled) return;
    if (quota?.status === 'loading') return;

    const config = getQuotaConfig(quotaType) as unknown as {
      i18nPrefix: string;
      fetchQuota: (file: AuthFileItem, t: TFunction) => Promise<unknown>;
      fetchResetCredits?: (file: AuthFileItem, t: TFunction) => Promise<unknown>;
      buildLoadingState: () => unknown;
      buildSuccessState: (data: unknown, previous?: unknown) => unknown;
      buildResetCreditsSuccessState?: (data: unknown, previous?: unknown) => unknown;
      getResetCreditsRefreshError?: (data: unknown) => string;
      buildErrorState: (message: string, status?: number) => unknown;
      renderQuotaItems: (quota: unknown, t: TFunction, helpers: unknown) => unknown;
    };

    updateQuotaState((prev: Record<string, unknown>) => ({
      ...prev,
      [file.name]: config.buildLoadingState(),
    }));

    try {
      const data = await config.fetchQuota(file, t);
      updateQuotaState((prev: Record<string, unknown>) => ({
        ...prev,
        [file.name]: config.buildSuccessState(data, prev[file.name]),
      }));
      showNotification(t('auth_files.quota_refresh_success', { name: file.name }), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('common.unknown_error');
      const status = getStatusFromError(err);
      updateQuotaState((prev: Record<string, unknown>) => ({
        ...prev,
        [file.name]: config.buildErrorState(message, status),
      }));
      showNotification(t('auth_files.quota_refresh_failed', { name: file.name, message }), 'error');
    }
  }, [disableControls, file, quota?.status, quotaType, showNotification, t, updateQuotaState]);

  const config = getQuotaConfig(quotaType) as unknown as {
    i18nPrefix: string;
    renderQuotaItems: (quota: unknown, t: TFunction, helpers: unknown) => unknown;
    fetchResetCredits?: (file: AuthFileItem, t: TFunction) => Promise<unknown>;
    resetQuota?: (file: AuthFileItem, t: TFunction, creditId: string) => Promise<unknown>;
    buildSuccessState: (data: unknown, previous?: unknown) => unknown;
    buildResetCreditsSuccessState?: (data: unknown, previous?: unknown) => unknown;
    getResetCreditsRefreshError?: (data: unknown) => string;
  };

  const resetQuotaForFile = useCallback(
    (credit: CodexRateLimitResetCredit) => {
      if (disableControls) return;
      if (isRuntimeOnlyAuthFile(file)) return;
      if (file.disabled) return;
      if (quota?.status === 'loading') return;
      if (resettingCreditId) return;

      const resetQuota = config.resetQuota;
      if (!resetQuota) return;
      const creditId = credit.id.trim();
      if (!creditId) return;

      showConfirmation({
        title: t('codex_quota.reset_confirm_title'),
        message: t('codex_quota.reset_credit_confirm_message', {
          name: file.name,
          expiresAt: formatShanghaiDateTime(credit.expiresAt) || credit.expiresAt,
        }),
        confirmText: t('codex_quota.reset_confirm_button'),
        variant: 'primary',
        onConfirm: async () => {
          setResettingCreditId(creditId);
          try {
            const data = await resetQuota(file, t, creditId);
            updateQuotaState((prev: Record<string, unknown>) => ({
              ...prev,
              [file.name]: config.buildSuccessState(data, prev[file.name]),
            }));
            showNotification(t('codex_quota.reset_success', { name: file.name }), 'success');
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : t('common.unknown_error');
            showNotification(t('codex_quota.reset_failed', { name: file.name, message }), 'error');
          } finally {
            setResettingCreditId((current) => (current === creditId ? null : current));
          }
        },
      });
    },
    [
      config,
      disableControls,
      file,
      quota?.status,
      resettingCreditId,
      showConfirmation,
      showNotification,
      t,
      updateQuotaState,
    ]
  );

  const refreshResetCreditsForFile = useCallback(async () => {
    if (disableControls) return;
    if (isRuntimeOnlyAuthFile(file)) return;
    if (file.disabled) return;
    if (resetCreditsRefreshing) return;
    const fetchResetCredits = config.fetchResetCredits;
    const buildResetCreditsSuccessState = config.buildResetCreditsSuccessState;
    if (!fetchResetCredits || !buildResetCreditsSuccessState) return;

    setResetCreditsRefreshing(true);
    try {
      const data = await fetchResetCredits(file, t);
      const refreshError = config.getResetCreditsRefreshError?.(data) ?? '';
      updateQuotaState((prev: Record<string, unknown>) => ({
        ...prev,
        [file.name]: buildResetCreditsSuccessState(data, prev[file.name]),
      }));

      if (refreshError) {
        showNotification(
          t('auth_files.reset_credits_refresh_failed', {
            name: file.name,
            message: refreshError,
          }),
          'warning'
        );
        return;
      }

      showNotification(
        t('auth_files.reset_credits_refresh_success', { name: file.name }),
        'success'
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('common.unknown_error');
      showNotification(
        t('auth_files.reset_credits_refresh_failed', { name: file.name, message }),
        'error'
      );
    } finally {
      setResetCreditsRefreshing(false);
    }
  }, [
    config,
    disableControls,
    file,
    resetCreditsRefreshing,
    showNotification,
    t,
    updateQuotaState,
  ]);

  const quotaStatus = quota?.status ?? 'idle';
  const canRefreshQuota = !disableControls && !file.disabled && !resettingCreditId;
  const supportsResetCredits = Boolean(
    config.fetchResetCredits && config.buildResetCreditsSuccessState
  );
  const showResetCreditControls = !disableControls && !file.disabled && supportsResetCredits;
  const canRefreshResetCredits = canRefreshQuota && supportsResetCredits;
  const quotaErrorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );

  return (
    <div className={styles.quotaSection}>
      {showResetCreditControls && (
        <div className={styles.quotaInlineActions}>
          <button
            type="button"
            className={styles.quotaInlineAction}
            onClick={() => void refreshQuotaForFile()}
            disabled={!canRefreshQuota || quotaStatus === 'loading' || resetCreditsRefreshing}
          >
            {t(`${config.i18nPrefix}.refresh_button`)}
          </button>
          <button
            type="button"
            className={styles.quotaInlineAction}
            onClick={() => void refreshResetCreditsForFile()}
            disabled={
              !canRefreshResetCredits || quotaStatus === 'loading' || resetCreditsRefreshing
            }
          >
            {resetCreditsRefreshing
              ? t('codex_quota.reset_credits_loading')
              : t('codex_quota.refresh_reset_credits_button')}
          </button>
        </div>
      )}
      {quotaStatus === 'loading' ? (
        <div className={styles.quotaMessage}>{t(`${config.i18nPrefix}.loading`)}</div>
      ) : quotaStatus === 'idle' ? (
        <button
          type="button"
          className={`${styles.quotaMessage} ${styles.quotaMessageAction}`}
          onClick={() => void refreshQuotaForFile()}
          disabled={!canRefreshQuota}
        >
          {t(`${config.i18nPrefix}.idle`)}
        </button>
      ) : quotaStatus === 'error' ? (
        <div className={styles.quotaError}>
          {t(`${config.i18nPrefix}.load_failed`, {
            message: quotaErrorMessage,
          })}
        </div>
      ) : quota ? (
        (config.renderQuotaItems(quota, t, {
          styles,
          QuotaProgressBar,
          renderResetCreditAction: config.resetQuota
            ? (credit: CodexRateLimitResetCredit) => (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className={styles.codexResetCreditAction}
                  onClick={() => resetQuotaForFile(credit)}
                  disabled={
                    disableControls ||
                    file.disabled ||
                    quotaStatus === 'loading' ||
                    resetCreditsRefreshing ||
                    resettingCreditId !== null
                  }
                  loading={resettingCreditId === credit.id.trim()}
                  title={t('codex_quota.use_reset_credit_button')}
                  aria-label={t('codex_quota.use_reset_credit_button')}
                >
                  {t('codex_quota.use_reset_credit_button')}
                </Button>
              )
            : undefined,
        }) as ReactNode)
      ) : (
        <div className={styles.quotaMessage}>{t(`${config.i18nPrefix}.idle`)}</div>
      )}
    </div>
  );
}
