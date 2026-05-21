import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAuthStore, useNotificationStore } from '@/stores';
import {
  PPROF_FORMATS,
  PPROF_PROFILES,
  pprofApi,
  type PprofFormat,
  type PprofProfileName,
  type PprofProfileResult,
  type PprofRuntimeConfig,
} from '@/services/api/pprof';
import { downloadBlob } from '@/utils/download';
import styles from './PprofPage.module.scss';

type PreviewResult =
  | {
      kind: 'text';
      title: string;
      text: string;
      download: PprofProfileResult;
    }
  | {
      kind: 'svg';
      title: string;
      blobUrl: string;
      download: PprofProfileResult;
    }
  | {
      kind: 'download';
      title: string;
      filename: string;
    };

const isPprofProfileName = (value: string): value is PprofProfileName =>
  (PPROF_PROFILES as readonly string[]).includes(value);

const isPprofFormat = (value: string): value is PprofFormat =>
  (PPROF_FORMATS as readonly string[]).includes(value);

const defaultFormatForProfile = (
  profile: PprofProfileName,
  allowedFormats: PprofFormat[]
): PprofFormat => {
  if (profile === 'trace' && allowedFormats.includes('proto')) return 'proto';
  if (profile === 'goroutine' && allowedFormats.includes('text')) return 'text';
  if (allowedFormats.includes('top')) return 'top';
  return allowedFormats[0] ?? 'proto';
};

const defaultSecondsForProfile = (profile: PprofProfileName) => (profile === 'trace' ? '5' : '30');

const getAllowedFormats = (
  profile: PprofProfileName,
  runtimeConfig: PprofRuntimeConfig | null
): PprofFormat[] => {
  const supportedFormats = runtimeConfig?.management.formats?.length
    ? runtimeConfig.management.formats
    : [...PPROF_FORMATS];

  const allowed = supportedFormats.filter((format) => {
    if (profile === 'trace') return format === 'proto';
    if (profile === 'profile' && format === 'text') return false;
    if (
      (format === 'top' || format === 'svg') &&
      runtimeConfig?.management.goToolAvailable === false
    ) {
      return false;
    }
    if (format === 'svg' && runtimeConfig?.management.graphvizAvailable === false) {
      return false;
    }
    return true;
  });

  return allowed.length ? allowed : ['proto'];
};

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (!err || typeof err !== 'object') return '';
  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
};

export function PprofPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const { showNotification } = useNotificationStore();

  const [runtimeConfig, setRuntimeConfig] = useState<PprofRuntimeConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState('');
  const [profile, setProfile] = useState<PprofProfileName>('goroutine');
  const [format, setFormat] = useState<PprofFormat>('text');
  const [seconds, setSeconds] = useState('30');
  const [collecting, setCollecting] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const profiles = useMemo(() => {
    const configuredProfiles = runtimeConfig?.management.profiles?.length
      ? runtimeConfig.management.profiles
      : [...PPROF_PROFILES];
    return configuredProfiles.filter(isPprofProfileName);
  }, [runtimeConfig]);

  const allowedFormats = useMemo(
    () => getAllowedFormats(profile, runtimeConfig),
    [profile, runtimeConfig]
  );

  const profileOptions = useMemo(
    () =>
      profiles.map((item) => ({
        value: item,
        label: t(`pprof.profiles.${item}`),
      })),
    [profiles, t]
  );

  const formatOptions = useMemo(
    () =>
      allowedFormats.map((item) => ({
        value: item,
        label: t(`pprof.formats.${item}`),
      })),
    [allowedFormats, t]
  );

  const maxSeconds = runtimeConfig?.management.maxSeconds ?? 120;
  const disabled = connectionStatus !== 'connected' || !runtimeConfig?.enable;
  const capabilityPills = [
    {
      label: t('pprof.capability_go_tool'),
      enabled: runtimeConfig?.management.goToolAvailable,
    },
    {
      label: t('pprof.capability_graphviz'),
      enabled: runtimeConfig?.management.graphvizAvailable,
    },
  ];

  const loadConfig = useCallback(async () => {
    if (connectionStatus !== 'connected') {
      setLoadingConfig(false);
      setConfigError('');
      return;
    }

    setLoadingConfig(true);
    setConfigError('');
    try {
      const nextConfig = await pprofApi.getConfig();
      setRuntimeConfig(nextConfig);
    } catch (err: unknown) {
      setConfigError(getErrorMessage(err) || t('pprof.config_load_failed'));
    } finally {
      setLoadingConfig(false);
    }
  }, [connectionStatus, t]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (profiles.length === 0) return;
    if (!profiles.includes(profile)) {
      const nextProfile = profiles[0];
      setProfile(nextProfile);
      setSeconds(defaultSecondsForProfile(nextProfile));
    }
  }, [profile, profiles]);

  useEffect(() => {
    if (!allowedFormats.includes(format)) {
      setFormat(defaultFormatForProfile(profile, allowedFormats));
    }
  }, [allowedFormats, format, profile]);

  useEffect(() => {
    return () => {
      if (preview?.kind === 'svg') {
        window.URL.revokeObjectURL(preview.blobUrl);
      }
    };
  }, [preview]);

  const handleProfileChange = (nextValue: string) => {
    if (!isPprofProfileName(nextValue)) return;
    const nextAllowedFormats = getAllowedFormats(nextValue, runtimeConfig);
    setProfile(nextValue);
    setFormat(defaultFormatForProfile(nextValue, nextAllowedFormats));
    setSeconds(defaultSecondsForProfile(nextValue));
    setPreview(null);
  };

  const handleFormatChange = (nextValue: string) => {
    if (!isPprofFormat(nextValue)) return;
    setFormat(nextValue);
    setPreview(null);
  };

  const handleCollect = async () => {
    if (disabled) {
      showNotification(t('pprof.disabled_notice'), 'warning');
      return;
    }

    const parsedSeconds = Number.parseInt(seconds, 10);
    const normalizedSeconds =
      Number.isFinite(parsedSeconds) && parsedSeconds > 0
        ? Math.min(parsedSeconds, maxSeconds)
        : Number.parseInt(defaultSecondsForProfile(profile), 10);

    setCollecting(true);
    try {
      const result = await pprofApi.collectProfile(profile, format, normalizedSeconds);
      if (preview?.kind === 'svg') {
        window.URL.revokeObjectURL(preview.blobUrl);
      }

      if (result.format === 'proto') {
        downloadBlob({ filename: result.filename, blob: result.blob });
        setPreview({
          kind: 'download',
          title: t('pprof.result_title', {
            profile: t(`pprof.profiles.${result.profile}`),
            format: t(`pprof.formats.${result.format}`),
          }),
          filename: result.filename,
        });
        showNotification(t('pprof.download_success'), 'success');
        return;
      }

      if (result.format === 'svg') {
        setPreview({
          kind: 'svg',
          title: t('pprof.result_title', {
            profile: t(`pprof.profiles.${result.profile}`),
            format: t(`pprof.formats.${result.format}`),
          }),
          blobUrl: window.URL.createObjectURL(result.blob),
          download: result,
        });
        showNotification(t('pprof.collect_success'), 'success');
        return;
      }

      const text = await result.blob.text();
      setPreview({
        kind: 'text',
        title: t('pprof.result_title', {
          profile: t(`pprof.profiles.${result.profile}`),
          format: t(`pprof.formats.${result.format}`),
        }),
        text,
        download: result,
      });
      showNotification(t('pprof.collect_success'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      showNotification(`${t('pprof.collect_failed')}${message ? `: ${message}` : ''}`, 'error');
    } finally {
      setCollecting(false);
    }
  };

  const handleDownloadPreview = () => {
    if (!preview || preview.kind === 'download') return;
    downloadBlob({ filename: preview.download.filename, blob: preview.download.blob });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>{t('pprof.title')}</h1>
          <p className={styles.pageDescription}>{t('pprof.description')}</p>
        </div>
        <Button variant="secondary" onClick={loadConfig} loading={loadingConfig}>
          {t('common.refresh')}
        </Button>
      </div>

      {connectionStatus !== 'connected' ? (
        <div className="error-box">{t('notification.connection_required')}</div>
      ) : null}
      {configError ? <div className="error-box">{configError}</div> : null}
      {runtimeConfig && !runtimeConfig.enable ? (
        <div className={styles.warningBox}>{t('pprof.disabled_notice')}</div>
      ) : null}

      <div className={styles.content}>
        <Card title={t('pprof.runtime_title')}>
          <div className={styles.runtimeGrid}>
            <div className={styles.runtimeItem}>
              <span className={styles.runtimeLabel}>{t('pprof.enable')}</span>
              <span
                className={`${styles.statusPill} ${
                  runtimeConfig?.enable ? styles.statusPillOn : styles.statusPillOff
                }`}
              >
                {runtimeConfig
                  ? runtimeConfig.enable
                    ? t('common.enabled')
                    : t('common.disabled')
                  : t('common.not_set')}
              </span>
            </div>
            <div className={styles.runtimeItem}>
              <span className={styles.runtimeLabel}>{t('pprof.addr')}</span>
              <span className={styles.runtimeValue}>
                {runtimeConfig?.addr || t('common.not_set')}
              </span>
            </div>
            <div className={styles.runtimeItem}>
              <span className={styles.runtimeLabel}>{t('pprof.max_seconds')}</span>
              <span className={styles.runtimeValue}>{maxSeconds}</span>
            </div>
            <div className={styles.runtimeItem}>
              <span className={styles.runtimeLabel}>{t('pprof.capabilities')}</span>
              <span className={styles.capabilityList}>
                {capabilityPills.map((pill) => (
                  <span
                    key={pill.label}
                    className={`${styles.capabilityPill} ${
                      pill.enabled ? '' : styles.capabilityPillOff
                    }`}
                  >
                    {pill.label}:{' '}
                    {pill.enabled === undefined
                      ? t('common.not_set')
                      : pill.enabled
                        ? t('common.yes')
                        : t('common.no')}
                  </span>
                ))}
              </span>
            </div>
          </div>
        </Card>

        <Card title={t('pprof.capture_title')}>
          <div className={styles.captureGrid}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('pprof.profile')}</span>
              <Select
                value={profile}
                options={profileOptions}
                onChange={handleProfileChange}
                disabled={loadingConfig || profiles.length === 0}
                ariaLabel={t('pprof.profile')}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('pprof.format')}</span>
              <Select
                value={format}
                options={formatOptions}
                onChange={handleFormatChange}
                disabled={loadingConfig || allowedFormats.length === 0}
                ariaLabel={t('pprof.format')}
              />
            </div>
            <Input
              label={t('pprof.seconds')}
              type="number"
              min={1}
              max={maxSeconds}
              placeholder={defaultSecondsForProfile(profile)}
              value={seconds}
              onChange={(event) => setSeconds(event.target.value)}
              disabled={loadingConfig}
              hint={t('pprof.seconds_hint', { max: maxSeconds })}
            />
            <div className={styles.captureAction}>
              <Button
                onClick={handleCollect}
                loading={collecting}
                disabled={disabled || loadingConfig}
              >
                {t('pprof.collect')}
              </Button>
            </div>
          </div>
          <p className={styles.captureHint}>{t('pprof.capture_hint')}</p>
        </Card>

        {preview ? (
          <Card
            title={preview.title}
            extra={
              preview.kind === 'download' ? null : (
                <Button variant="secondary" size="sm" onClick={handleDownloadPreview}>
                  {t('pprof.download_result')}
                </Button>
              )
            }
          >
            {preview.kind === 'download' ? (
              <div className={styles.downloadNotice}>
                {t('pprof.proto_downloaded', { filename: preview.filename })}
              </div>
            ) : preview.kind === 'svg' ? (
              <div className={styles.svgPreview}>
                <img src={preview.blobUrl} alt={preview.title} />
              </div>
            ) : (
              <pre className={styles.textPreview}>{preview.text}</pre>
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
