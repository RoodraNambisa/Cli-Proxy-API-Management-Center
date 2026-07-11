import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useNotificationStore, useThemeStore } from '@/stores';
import { oauthApi, type OAuthProvider } from '@/services/api/oauth';
import { authFilesApi } from '@/services/api/authFiles';
import { vertexApi, type VertexImportResponse } from '@/services/api/vertex';
import { copyToClipboard } from '@/utils/clipboard';
import styles from './OAuthPage.module.scss';
import iconCodex from '@/assets/icons/codex.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconAntigravity from '@/assets/icons/antigravity.svg';
import iconGemini from '@/assets/icons/gemini.svg';
import iconKimiLight from '@/assets/icons/kimi-light.svg';
import iconKimiDark from '@/assets/icons/kimi-dark.svg';
import iconVertex from '@/assets/icons/vertex.svg';
import iconGrok from '@/assets/icons/grok.svg';
import iconGrokDark from '@/assets/icons/grok-dark.svg';

interface ProviderState {
  url?: string;
  state?: string;
  status?: 'idle' | 'waiting' | 'success' | 'error';
  error?: string;
  polling?: boolean;
  projectId?: string;
  projectIdError?: string;
  callbackUrl?: string;
  callbackSubmitting?: boolean;
  callbackStatus?: 'success' | 'error';
  callbackError?: string;
  flow?: string;
  userCode?: string;
  remainingSeconds?: number;
  cancelling?: boolean;
}

interface VertexImportResult {
  projectId?: string;
  email?: string;
  location?: string;
  authFile?: string;
}

interface VertexImportState {
  file?: File;
  fileName: string;
  location: string;
  loading: boolean;
  error?: string;
  result?: VertexImportResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return typeof error === 'string' ? error : '';
}

function getErrorStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

const PROVIDERS: {
  id: OAuthProvider;
  titleKey: string;
  hintKey: string;
  urlLabelKey: string;
  icon: string | { light: string; dark: string };
}[] = [
  {
    id: 'codex',
    titleKey: 'auth_login.codex_oauth_title',
    hintKey: 'auth_login.codex_oauth_hint',
    urlLabelKey: 'auth_login.codex_oauth_url_label',
    icon: iconCodex,
  },
  {
    id: 'anthropic',
    titleKey: 'auth_login.anthropic_oauth_title',
    hintKey: 'auth_login.anthropic_oauth_hint',
    urlLabelKey: 'auth_login.anthropic_oauth_url_label',
    icon: iconClaude,
  },
  {
    id: 'antigravity',
    titleKey: 'auth_login.antigravity_oauth_title',
    hintKey: 'auth_login.antigravity_oauth_hint',
    urlLabelKey: 'auth_login.antigravity_oauth_url_label',
    icon: iconAntigravity,
  },
  {
    id: 'gemini-cli',
    titleKey: 'auth_login.gemini_cli_oauth_title',
    hintKey: 'auth_login.gemini_cli_oauth_hint',
    urlLabelKey: 'auth_login.gemini_cli_oauth_url_label',
    icon: iconGemini,
  },
  {
    id: 'kimi',
    titleKey: 'auth_login.kimi_oauth_title',
    hintKey: 'auth_login.kimi_oauth_hint',
    urlLabelKey: 'auth_login.kimi_oauth_url_label',
    icon: { light: iconKimiLight, dark: iconKimiDark },
  },
  {
    id: 'xai',
    titleKey: 'auth_login.xai_oauth_title',
    hintKey: 'auth_login.xai_oauth_hint',
    urlLabelKey: 'auth_login.xai_oauth_url_label',
    icon: { light: iconGrok, dark: iconGrokDark },
  },
];

const CALLBACK_SUPPORTED: OAuthProvider[] = ['codex', 'anthropic', 'antigravity', 'gemini-cli'];
const SUCCESS_RESET_DELAY_MS = 5000;
const getProviderI18nPrefix = (provider: OAuthProvider) => provider.replace('-', '_');
const getAuthKey = (provider: OAuthProvider, suffix: string) =>
  `auth_login.${getProviderI18nPrefix(provider)}_${suffix}`;

const getIcon = (icon: string | { light: string; dark: string }, theme: 'light' | 'dark') => {
  return typeof icon === 'string' ? icon : icon[theme];
};

const formatCountdown = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
};

export function OAuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedProvider = searchParams.get('provider')?.trim().toLowerCase();
  const { showNotification } = useNotificationStore();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const [states, setStates] = useState<Record<OAuthProvider, ProviderState>>(
    {} as Record<OAuthProvider, ProviderState>
  );
  const [vertexState, setVertexState] = useState<VertexImportState>({
    fileName: '',
    location: '',
    loading: false,
  });
  const pollingTimers = useRef<Partial<Record<OAuthProvider, number>>>({});
  const countdownTimers = useRef<Partial<Record<OAuthProvider, number>>>({});
  const successResetTimers = useRef<Partial<Record<OAuthProvider, number>>>({});
  const activeSessions = useRef<Partial<Record<OAuthProvider, string>>>({});
  const vertexFileInputRef = useRef<HTMLInputElement | null>(null);

  const clearTimers = useCallback(() => {
    Object.values(pollingTimers.current).forEach((timer) => {
      if (timer !== undefined) window.clearInterval(timer);
    });
    Object.values(successResetTimers.current).forEach((timer) => {
      if (timer !== undefined) window.clearTimeout(timer);
    });
    Object.values(countdownTimers.current).forEach((timer) => {
      if (timer !== undefined) window.clearInterval(timer);
    });
    pollingTimers.current = {};
    countdownTimers.current = {};
    successResetTimers.current = {};
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      const pendingStates = Object.values(activeSessions.current).filter((state): state is string =>
        Boolean(state)
      );
      activeSessions.current = {};
      pendingStates.forEach((state) => {
        void oauthApi.cancelAuth(state).catch(() => {});
      });
    };
  }, [clearTimers]);

  useEffect(() => {
    if (!requestedProvider) return undefined;
    const provider = requestedProvider === 'grok' ? 'xai' : requestedProvider;
    if (!PROVIDERS.some((item) => item.id === provider)) return undefined;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(`oauth-provider-${provider}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [requestedProvider]);

  const updateProviderState = (provider: OAuthProvider, next: Partial<ProviderState>) => {
    setStates((prev) => ({
      ...prev,
      [provider]: { ...(prev[provider] ?? {}), ...next },
    }));
  };

  const clearPollingTimer = (provider: OAuthProvider) => {
    const timer = pollingTimers.current[provider];
    if (timer !== undefined) {
      window.clearInterval(timer);
      delete pollingTimers.current[provider];
    }
  };

  const clearSuccessResetTimer = (provider: OAuthProvider) => {
    const timer = successResetTimers.current[provider];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete successResetTimers.current[provider];
    }
  };

  const clearCountdownTimer = (provider: OAuthProvider) => {
    const timer = countdownTimers.current[provider];
    if (timer !== undefined) {
      window.clearInterval(timer);
      delete countdownTimers.current[provider];
    }
  };

  const clearProviderTimers = (provider: OAuthProvider) => {
    clearPollingTimer(provider);
    clearCountdownTimer(provider);
    clearSuccessResetTimer(provider);
  };

  const resetProviderAttempt = (provider: OAuthProvider) => {
    clearProviderTimers(provider);
    setStates((prev) => {
      const current = prev[provider] ?? {};
      const next: ProviderState = {};
      if (provider === 'gemini-cli' && current.projectId !== undefined) {
        next.projectId = current.projectId;
      }
      return {
        ...prev,
        [provider]: next,
      };
    });
  };

  const completeProviderAuth = (provider: OAuthProvider) => {
    delete activeSessions.current[provider];
    clearPollingTimer(provider);
    clearCountdownTimer(provider);
    clearSuccessResetTimer(provider);
    updateProviderState(provider, {
      url: undefined,
      state: undefined,
      status: 'success',
      error: undefined,
      polling: false,
      callbackUrl: '',
      callbackSubmitting: false,
      callbackStatus: undefined,
      callbackError: undefined,
      flow: undefined,
      userCode: undefined,
      remainingSeconds: undefined,
      cancelling: false,
    });
    if (provider === 'xai') {
      void authFilesApi.list().catch(() => {});
    }
    successResetTimers.current[provider] = window.setTimeout(() => {
      resetProviderAttempt(provider);
    }, SUCCESS_RESET_DELAY_MS);
  };

  const failProviderAuth = (
    provider: OAuthProvider,
    message: string,
    options?: { cancelPending?: boolean }
  ) => {
    const pendingState = activeSessions.current[provider];
    delete activeSessions.current[provider];
    clearProviderTimers(provider);
    updateProviderState(provider, {
      status: 'error',
      error: message,
      polling: false,
      remainingSeconds: undefined,
      cancelling: false,
    });
    if (options?.cancelPending && pendingState) {
      void oauthApi.cancelAuth(pendingState).catch(() => {});
    }
  };

  const startCountdown = (provider: OAuthProvider, state: string, expiresIn?: number) => {
    clearCountdownTimer(provider);
    const durationSeconds = Number(expiresIn);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return;

    const safeDuration = Math.max(1, Math.floor(durationSeconds));
    let remainingSeconds = safeDuration;
    updateProviderState(provider, { remainingSeconds: safeDuration });

    countdownTimers.current[provider] = window.setInterval(() => {
      remainingSeconds = Math.max(0, remainingSeconds - 1);
      if (activeSessions.current[provider] !== state) {
        clearCountdownTimer(provider);
        return;
      }
      if (remainingSeconds > 0) {
        updateProviderState(provider, { remainingSeconds });
        return;
      }

      failProviderAuth(provider, t('auth_login.xai_oauth_timeout'), { cancelPending: true });
      showNotification(t('auth_login.xai_oauth_timeout'), 'error');
    }, 1000);
  };

  const startPolling = (provider: OAuthProvider, state: string) => {
    clearPollingTimer(provider);
    const timer = window.setInterval(async () => {
      try {
        const res = await oauthApi.getAuthStatus(state);
        if (res.status === 'ok') {
          completeProviderAuth(provider);
          showNotification(t(getAuthKey(provider, 'oauth_status_success')), 'success');
        } else if (res.status === 'error') {
          const message = res.error || t(getAuthKey(provider, 'oauth_status_error'));
          failProviderAuth(provider, message);
          showNotification(
            `${t(getAuthKey(provider, 'oauth_status_error'))} ${res.error || ''}`,
            'error'
          );
        }
      } catch (err: unknown) {
        const message = getErrorMessage(err) || t(getAuthKey(provider, 'oauth_polling_error'));
        failProviderAuth(provider, message, { cancelPending: provider === 'xai' });
        showNotification(`${t(getAuthKey(provider, 'oauth_polling_error'))} ${message}`, 'error');
      }
    }, 3000);
    pollingTimers.current[provider] = timer;
  };

  const startAuth = async (provider: OAuthProvider) => {
    clearProviderTimers(provider);
    const previousState = activeSessions.current[provider];
    delete activeSessions.current[provider];
    if (provider === 'xai' && previousState) {
      void oauthApi.cancelAuth(previousState).catch(() => {});
    }
    const geminiState = provider === 'gemini-cli' ? states[provider] : undefined;
    const rawProjectId = provider === 'gemini-cli' ? (geminiState?.projectId || '').trim() : '';
    const projectId = rawProjectId
      ? rawProjectId.toUpperCase() === 'ALL'
        ? 'ALL'
        : rawProjectId
      : undefined;
    // 项目 ID 可选：留空自动选择第一个可用项目；输入 ALL 获取全部项目
    if (provider === 'gemini-cli') {
      updateProviderState(provider, { projectIdError: undefined });
    }
    updateProviderState(provider, {
      url: undefined,
      state: undefined,
      status: 'waiting',
      polling: true,
      error: undefined,
      callbackStatus: undefined,
      callbackError: undefined,
      callbackUrl: '',
      flow: undefined,
      userCode: undefined,
      remainingSeconds: undefined,
      cancelling: false,
    });
    try {
      const res = await oauthApi.startAuth(
        provider,
        provider === 'gemini-cli' ? { projectId: projectId || undefined } : undefined
      );
      if (!res.state) {
        const message = t('auth_login.missing_state');
        updateProviderState(provider, {
          url: res.url,
          state: undefined,
          status: 'error',
          error: message,
          polling: false,
        });
        showNotification(message, 'error');
        return;
      }
      if (provider === 'xai') {
        activeSessions.current[provider] = res.state;
      }
      updateProviderState(provider, {
        url: res.url,
        state: res.state,
        status: 'waiting',
        polling: true,
        flow: res.flow,
        userCode: typeof res.user_code === 'string' ? res.user_code.trim() : undefined,
      });
      if (provider === 'xai') {
        window.open(res.url, '_blank', 'noopener,noreferrer');
        startCountdown(provider, res.state, res.expires_in);
      }
      startPolling(provider, res.state);
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      updateProviderState(provider, { status: 'error', error: message, polling: false });
      showNotification(
        `${t(getAuthKey(provider, 'oauth_start_error'))}${message ? ` ${message}` : ''}`,
        'error'
      );
    }
  };

  const copyLink = async (url?: string) => {
    if (!url) return;
    const copied = await copyToClipboard(url);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const copyUserCode = async (userCode?: string) => {
    if (!userCode) return;
    const copied = await copyToClipboard(userCode);
    showNotification(
      t(copied ? 'auth_login.xai_user_code_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const cancelAuth = async (provider: OAuthProvider) => {
    const state = states[provider]?.state ?? activeSessions.current[provider];
    if (!state || states[provider]?.cancelling) return;

    updateProviderState(provider, { cancelling: true });
    clearProviderTimers(provider);
    delete activeSessions.current[provider];
    try {
      await oauthApi.cancelAuth(state);
      resetProviderAttempt(provider);
      showNotification(t('auth_login.xai_oauth_cancelled'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err) || t('auth_login.xai_oauth_cancel_failed');
      updateProviderState(provider, {
        status: 'error',
        error: message,
        polling: false,
        cancelling: false,
        remainingSeconds: undefined,
      });
      showNotification(`${t('auth_login.xai_oauth_cancel_failed')} ${message}`, 'error');
    }
  };

  const submitCallback = async (provider: OAuthProvider) => {
    const redirectUrl = (states[provider]?.callbackUrl || '').trim();
    if (!redirectUrl) {
      showNotification(t('auth_login.oauth_callback_required'), 'warning');
      return;
    }
    updateProviderState(provider, {
      callbackSubmitting: true,
      callbackStatus: undefined,
      callbackError: undefined,
    });
    try {
      await oauthApi.submitCallback(provider, redirectUrl);
      updateProviderState(provider, { callbackSubmitting: false, callbackStatus: 'success' });
      showNotification(t('auth_login.oauth_callback_success'), 'success');
    } catch (err: unknown) {
      const status = getErrorStatus(err);
      const message = getErrorMessage(err);
      const errorMessage =
        status === 404
          ? t('auth_login.oauth_callback_upgrade_hint', {
              defaultValue: 'Please update CLI Proxy API or check the connection.',
            })
          : message || undefined;
      updateProviderState(provider, {
        callbackSubmitting: false,
        callbackStatus: 'error',
        callbackError: errorMessage,
      });
      const notificationMessage = errorMessage
        ? `${t('auth_login.oauth_callback_error')} ${errorMessage}`
        : t('auth_login.oauth_callback_error');
      showNotification(notificationMessage, 'error');
    }
  };

  const handleVertexFilePick = () => {
    vertexFileInputRef.current?.click();
  };

  const handleVertexFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      showNotification(t('vertex_import.file_required'), 'warning');
      event.target.value = '';
      return;
    }
    setVertexState((prev) => ({
      ...prev,
      file,
      fileName: file.name,
      error: undefined,
      result: undefined,
    }));
    event.target.value = '';
  };

  const handleVertexImport = async () => {
    if (!vertexState.file) {
      const message = t('vertex_import.file_required');
      setVertexState((prev) => ({ ...prev, error: message }));
      showNotification(message, 'warning');
      return;
    }
    const location = vertexState.location.trim();
    setVertexState((prev) => ({ ...prev, loading: true, error: undefined, result: undefined }));
    try {
      const res: VertexImportResponse = await vertexApi.importCredential(
        vertexState.file,
        location || undefined
      );
      const result: VertexImportResult = {
        projectId: res.project_id,
        email: res.email,
        location: res.location,
        authFile: res['auth-file'] ?? res.auth_file,
      };
      setVertexState((prev) => ({ ...prev, loading: false, result }));
      showNotification(t('vertex_import.success'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setVertexState((prev) => ({
        ...prev,
        loading: false,
        error: message || t('notification.upload_failed'),
      }));
      const notification = message
        ? `${t('notification.upload_failed')}: ${message}`
        : t('notification.upload_failed');
      showNotification(notification, 'error');
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('nav.oauth', { defaultValue: 'OAuth' })}</h1>

      <div className={styles.content}>
        {PROVIDERS.map((provider) => {
          const state = states[provider.id] || {};
          const canSubmitCallback = CALLBACK_SUPPORTED.includes(provider.id) && Boolean(state.url);
          const loginButtonLabel =
            state.status === 'success'
              ? t('auth_login.login_another_account')
              : t(getAuthKey(provider.id, 'oauth_button'));
          const statusBadgeClassName = [
            'status-badge',
            state.status === 'success' ? 'success' : '',
            state.status === 'error' ? 'error' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={provider.id}
              id={`oauth-provider-${provider.id}`}
              className={styles.providerAnchor}
              tabIndex={-1}
            >
              <Card
                title={
                  <span className={styles.cardTitle}>
                    <img
                      src={getIcon(provider.icon, resolvedTheme)}
                      alt=""
                      className={styles.cardTitleIcon}
                    />
                    {t(provider.titleKey)}
                  </span>
                }
                extra={
                  <Button onClick={() => startAuth(provider.id)} loading={state.polling}>
                    {loginButtonLabel}
                  </Button>
                }
              >
                <div className={styles.cardContent}>
                  <div className={styles.cardHint}>{t(provider.hintKey)}</div>
                  {provider.id === 'gemini-cli' && (
                    <div className={styles.geminiProjectField}>
                      <Input
                        label={t('auth_login.gemini_cli_project_id_label')}
                        hint={t('auth_login.gemini_cli_project_id_hint')}
                        value={state.projectId || ''}
                        error={state.projectIdError}
                        disabled={Boolean(state.polling)}
                        onChange={(e) =>
                          updateProviderState(provider.id, {
                            projectId: e.target.value,
                            projectIdError: undefined,
                          })
                        }
                        placeholder={t('auth_login.gemini_cli_project_id_placeholder')}
                      />
                    </div>
                  )}
                  {state.url && (
                    <div className={styles.authUrlBox}>
                      <div className={styles.authUrlLabel}>{t(provider.urlLabelKey)}</div>
                      <div className={styles.authUrlValue}>{state.url}</div>
                      <div className={styles.authUrlActions}>
                        <Button variant="secondary" size="sm" onClick={() => copyLink(state.url!)}>
                          {t(getAuthKey(provider.id, 'copy_link'))}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => window.open(state.url, '_blank', 'noopener,noreferrer')}
                        >
                          {t(getAuthKey(provider.id, 'open_link'))}
                        </Button>
                        {provider.id === 'xai' && state.status === 'waiting' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void cancelAuth(provider.id)}
                            loading={state.cancelling}
                          >
                            {t('auth_login.xai_oauth_cancel')}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  {provider.id === 'xai' && state.userCode && state.status === 'waiting' && (
                    <div className={styles.deviceCodeBox}>
                      <div className={styles.deviceCodeContent}>
                        <span className={styles.deviceCodeLabel}>
                          {t('auth_login.xai_user_code_label')}
                        </span>
                        <code className={styles.deviceCodeValue}>{state.userCode}</code>
                      </div>
                      <div className={styles.deviceCodeActions}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void copyUserCode(state.userCode)}
                        >
                          {t('auth_login.xai_copy_user_code')}
                        </Button>
                        {typeof state.remainingSeconds === 'number' && (
                          <span className={styles.deviceCodeCountdown}>
                            {t('auth_login.xai_expires_in', {
                              time: formatCountdown(state.remainingSeconds),
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {canSubmitCallback && (
                    <div className={styles.callbackSection}>
                      <Input
                        label={t('auth_login.oauth_callback_label')}
                        hint={t('auth_login.oauth_callback_hint')}
                        value={state.callbackUrl || ''}
                        onChange={(e) =>
                          updateProviderState(provider.id, {
                            callbackUrl: e.target.value,
                            callbackStatus: undefined,
                            callbackError: undefined,
                          })
                        }
                        placeholder={t('auth_login.oauth_callback_placeholder')}
                      />
                      <div className={styles.callbackActions}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => submitCallback(provider.id)}
                          loading={state.callbackSubmitting}
                        >
                          {t('auth_login.oauth_callback_button')}
                        </Button>
                      </div>
                      {state.callbackStatus === 'success' && state.status === 'waiting' && (
                        <div className="status-badge success">
                          {t('auth_login.oauth_callback_status_success')}
                        </div>
                      )}
                      {state.callbackStatus === 'error' && (
                        <div className="status-badge error">
                          {t('auth_login.oauth_callback_status_error')} {state.callbackError || ''}
                        </div>
                      )}
                    </div>
                  )}
                  {state.status && state.status !== 'idle' && (
                    <div className={statusBadgeClassName}>
                      {state.status === 'success'
                        ? t(getAuthKey(provider.id, 'oauth_status_success'))
                        : state.status === 'error'
                          ? `${t(getAuthKey(provider.id, 'oauth_status_error'))} ${state.error || ''}`
                          : t(getAuthKey(provider.id, 'oauth_status_waiting'))}
                    </div>
                  )}
                  {state.status === 'success' && (
                    <div className={styles.successActions}>
                      <Button variant="secondary" size="sm" onClick={() => navigate('/auth-files')}>
                        {t('auth_login.view_auth_files')}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          );
        })}

        {/* Vertex JSON 登录 */}
        <Card
          title={
            <span className={styles.cardTitle}>
              <img src={iconVertex} alt="" className={styles.cardTitleIcon} />
              {t('vertex_import.title')}
            </span>
          }
          extra={
            <Button onClick={handleVertexImport} loading={vertexState.loading}>
              {t('vertex_import.import_button')}
            </Button>
          }
        >
          <div className={styles.cardContent}>
            <div className={styles.cardHint}>{t('vertex_import.description')}</div>
            <Input
              label={t('vertex_import.location_label')}
              hint={t('vertex_import.location_hint')}
              value={vertexState.location}
              onChange={(e) =>
                setVertexState((prev) => ({
                  ...prev,
                  location: e.target.value,
                }))
              }
              placeholder={t('vertex_import.location_placeholder')}
            />
            <div className={styles.formItem}>
              <label className={styles.formItemLabel}>{t('vertex_import.file_label')}</label>
              <div className={styles.filePicker}>
                <Button variant="secondary" size="sm" onClick={handleVertexFilePick}>
                  {t('vertex_import.choose_file')}
                </Button>
                <div
                  className={`${styles.fileName} ${
                    vertexState.fileName ? '' : styles.fileNamePlaceholder
                  }`.trim()}
                >
                  {vertexState.fileName || t('vertex_import.file_placeholder')}
                </div>
              </div>
              <div className={styles.cardHintSecondary}>{t('vertex_import.file_hint')}</div>
              <input
                ref={vertexFileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleVertexFileChange}
              />
            </div>
            {vertexState.error && <div className="status-badge error">{vertexState.error}</div>}
            {vertexState.result && (
              <div className={styles.connectionBox}>
                <div className={styles.connectionLabel}>{t('vertex_import.result_title')}</div>
                <div className={styles.keyValueList}>
                  {vertexState.result.projectId && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>
                        {t('vertex_import.result_project')}
                      </span>
                      <span className={styles.keyValueValue}>{vertexState.result.projectId}</span>
                    </div>
                  )}
                  {vertexState.result.email && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>{t('vertex_import.result_email')}</span>
                      <span className={styles.keyValueValue}>{vertexState.result.email}</span>
                    </div>
                  )}
                  {vertexState.result.location && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>
                        {t('vertex_import.result_location')}
                      </span>
                      <span className={styles.keyValueValue}>{vertexState.result.location}</span>
                    </div>
                  )}
                  {vertexState.result.authFile && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>{t('vertex_import.result_file')}</span>
                      <span className={styles.keyValueValue}>{vertexState.result.authFile}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
