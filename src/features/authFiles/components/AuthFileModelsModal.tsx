import { GROK_UPSTREAM_MODES, GROK_UPSTREAM_URLS } from '@/utils/grokUpstream';
import type { GrokCatalogRefreshInfo } from '@/services/api/authFiles';
import routingStyles from '@/components/config/GrokModelRoutingEditor.module.scss';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AuthFileItem } from '@/types';
import type { AuthFileModelItem } from '@/features/authFiles/constants';
import {
  getAuthFileModelCapability,
  isModelExcluded,
  parseDisableCoolingValue,
} from '@/features/authFiles/constants';
import { formatDateTime } from '@/utils/format';
import { parseTimestampMs } from '@/utils/timestamp';
import styles from '@/pages/AuthFilesPage.module.scss';

export type AuthFileModelsModalProps = {
  open: boolean;
  onRefreshGrok?: () => Promise<void>;
  catalogInfo?: GrokCatalogRefreshInfo | null;
  fileName: string;
  fileType: string;
  loading: boolean;
  error: 'unsupported' | null;
  models: AuthFileModelItem[];
  loadedAtMs: number;
  snapshotOrder?: number;
  fileLoadedAtMs?: number;
  fileSnapshotOrder?: number;
  file?: AuthFileItem | null;
  excluded: Record<string, string[]>;
  onClose: () => void;
  onCopyText: (text: string) => void;
};

export function AuthFileModelsModal(props: AuthFileModelsModalProps) {
  const { t } = useTranslation();
  const {
    open,
    fileName,
    fileType,
    loading,
    error,
    models,
    loadedAtMs,
    snapshotOrder = loadedAtMs,
    fileLoadedAtMs = 0,
    fileSnapshotOrder = fileLoadedAtMs,
    file,
    excluded,
    onClose,
    onCopyText,
  } = props;
  const nodeLabel = (url: string) => {
    const base = url.replace(/\/models$/, '').replace(/\/$/, '');
    const mode = GROK_UPSTREAM_MODES.find((key) => GROK_UPSTREAM_URLS[key] === base);
    return mode ? t(`grok_upstream.modes.${mode}`) : base;
  };
  const normalizedFileType = fileType.trim().toLowerCase();
  const planType = String(file?.plan_type ?? file?.planType ?? '').trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('auth_files.models_title', { defaultValue: '支持的模型' }) + ` - ${fileName}`}
      footer={
        <>
        {normalizedFileType === 'xai' && props.onRefreshGrok && <Button variant="secondary" loading={loading} disabled={!file} onClick={() => void props.onRefreshGrok?.()}>{t('config_management.grok.refresh_models')}</Button>}
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
        </>
      }
    >
      {props.catalogInfo && <div className={routingStyles.hint} role="status">
        {props.catalogInfo.sources?.length ? props.catalogInfo.sources.map((source) => <div key={source.source} className={routingStyles.sourceStatus}>
          <strong>{source.source}</strong>
          <span>{t(source.error ? (source.model_count ? 'grok_routing.source_cached' : 'grok_routing.source_unavailable') : 'grok_routing.source_fresh', {count: source.model_count})}</span>
          {(!source.error || source.model_count > 0) && <span>{formatDateTime(source.updated_at)}</span>}
          {source.error && <span className={routingStyles.error}>{source.error}</span>}
        </div>) : <>
          {t(props.catalogInfo.using_cached ? 'config_management.grok.models_cached' : 'config_management.grok.models_fresh')}
          {' · '}{props.catalogInfo.source}{' · '}{props.catalogInfo.source === 'builtin' ? '—' : formatDateTime(props.catalogInfo.updated_at)}
          {props.catalogInfo.error && <div>{props.catalogInfo.error}</div>}
        </>}
      </div>}
      {loading ? (
        <div className={styles.hint}>
          {t('auth_files.models_loading', { defaultValue: '正在加载模型列表...' })}
        </div>
      ) : error === 'unsupported' ? (
        <EmptyState
          title={t('auth_files.models_unsupported', { defaultValue: '当前版本不支持此功能' })}
          description={t('auth_files.models_unsupported_desc', {
            defaultValue: '请更新 CLI Proxy API 到最新版本后重试',
          })}
        />
      ) : models.length === 0 ? (
        <EmptyState
          title={t('auth_files.models_empty', { defaultValue: '该凭证暂无可用模型' })}
          description={t('auth_files.models_empty_desc', {
            defaultValue: '该认证凭证可能尚未被服务器加载或没有绑定任何模型',
          })}
        />
      ) : (
        <>
          <div className={styles.hint}>
            {t('auth_files.models_registered_hint', {
              defaultValue: '列表为当前后端实际注册模型，已应用模型排除规则。',
            })}
          </div>
          {normalizedFileType === 'chatgpt-web' && planType ? (
            <div className={styles.hint}>
              {t('auth_files.chatgpt_web_plan_type')}: {planType}
            </div>
          ) : null}
          <div className={styles.modelsList}>
            {models.map((model) => {
              const excludedModel = isModelExcluded(model.id, fileType, excluded);
              const capability = getAuthFileModelCapability(model, fileType);
              const normalizedModelID = model.id.trim().toLowerCase();
              const imageModelByID =
                normalizedModelID === 'gpt-image-2' || normalizedModelID.endsWith('/gpt-image-2');
              const imageQuotaModel =
                typeof model.image_quota_model === 'boolean'
                  ? model.image_quota_model
                  : imageModelByID;
              const preferFileImageQuota =
                normalizedFileType === 'chatgpt-web' &&
                imageQuotaModel &&
                fileSnapshotOrder > snapshotOrder;
              const modelHasImageQuotaSnapshot = [
                'quota_state',
                'image_quota_remaining',
                'image_quota_reset_at',
                'quota_stale',
                'quota_next_refresh_at',
              ].some((key) => Object.prototype.hasOwnProperty.call(model, key));
              const useModelImageQuotaSnapshot =
                !preferFileImageQuota && modelHasImageQuotaSnapshot;
              const useFileImageQuotaSnapshot =
                preferFileImageQuota || (!useModelImageQuotaSnapshot && imageQuotaModel);
              const modelImageQuotaState = String(model.quota_state ?? '')
                .trim()
                .toLowerCase();
              const fileImageQuotaState = String(file?.quota_state ?? '')
                .trim()
                .toLowerCase();
              const imageQuotaState = useModelImageQuotaSnapshot
                ? modelImageQuotaState
                : useFileImageQuotaSnapshot
                  ? fileImageQuotaState
                  : '';
              const fileCooldownScope = String(file?.cooldown_scope ?? file?.cooldownScope ?? '')
                .trim()
                .toLowerCase();
              const fileCooldownActive = parseDisableCoolingValue(
                file?.cooldown_active ?? file?.cooldownActive
              );
              const newerFileClearsCooldown =
                fileSnapshotOrder > snapshotOrder && fileCooldownActive === false;
              const preferFileAuthCooldown =
                fileSnapshotOrder > snapshotOrder && fileCooldownScope === 'auth';
              const cooldownUntilMs = parseTimestampMs(
                preferFileAuthCooldown
                  ? (file?.cooldown_until ?? file?.cooldownUntil ?? model.until)
                  : model.until
              );
              const suppressRecoveredImageQuotaCooldown =
                preferFileImageQuota &&
                modelImageQuotaState === 'exhausted' &&
                imageQuotaState !== 'exhausted' &&
                !preferFileAuthCooldown;
              const cooldownActive =
                (parseDisableCoolingValue(
                  preferFileAuthCooldown
                    ? (file?.cooldown_active ??
                        file?.cooldownActive ??
                        model.cooldownActive ??
                        model.cooldown_active)
                    : (model.cooldownActive ?? model.cooldown_active)
                ) ??
                  false) &&
                Number.isFinite(cooldownUntilMs) &&
                cooldownUntilMs > Math.max(loadedAtMs, fileLoadedAtMs) &&
                !suppressRecoveredImageQuotaCooldown &&
                !newerFileClearsCooldown;
              const cooldownScope = String(
                preferFileAuthCooldown
                  ? (file?.cooldown_scope ?? file?.cooldownScope ?? '')
                  : (model.scope ?? '')
              )
                .trim()
                .toLowerCase();
              const imageQuotaRemainingValue = useModelImageQuotaSnapshot
                ? model.image_quota_remaining
                : useFileImageQuotaSnapshot
                  ? file?.image_quota_remaining
                  : undefined;
              const imageQuotaRemaining =
                typeof imageQuotaRemainingValue === 'number' &&
                Number.isFinite(imageQuotaRemainingValue)
                  ? Math.trunc(imageQuotaRemainingValue)
                  : null;
              const imageQuotaStale = useModelImageQuotaSnapshot
                ? model.quota_stale === true
                : useFileImageQuotaSnapshot && file?.quota_stale === true;
              const imageQuotaExhausted =
                normalizedFileType === 'chatgpt-web' &&
                imageQuotaModel &&
                imageQuotaState === 'exhausted';
              const imageQuotaResetAt = parseTimestampMs(
                useModelImageQuotaSnapshot
                  ? model.image_quota_reset_at
                  : useFileImageQuotaSnapshot
                    ? file?.image_quota_reset_at
                    : undefined
              );
              const imageQuotaNextRefreshAt = parseTimestampMs(
                useModelImageQuotaSnapshot
                  ? model.quota_next_refresh_at
                  : useFileImageQuotaSnapshot
                    ? file?.quota_next_refresh_at
                    : undefined
              );
              const imageQuotaRecoveryAt =
                cooldownActive && cooldownScope === 'model'
                  ? cooldownUntilMs
                  : Number.isFinite(imageQuotaNextRefreshAt)
                    ? imageQuotaNextRefreshAt
                    : imageQuotaResetAt;
              const explicitImageQuotaCooldown =
                imageQuotaModel &&
                imageQuotaExhausted &&
                cooldownActive &&
                cooldownScope === 'model';
              return (
                <div
                  key={model.id}
                  className={`${styles.modelItem} ${excludedModel ? styles.modelItemExcluded : ''}`}
                  onClick={() => {
                    onCopyText(model.id);
                  }}
                  title={
                    excludedModel
                      ? t('auth_files.models_excluded_hint', {
                          defaultValue: '此 OAuth 模型已被禁用',
                        })
                      : t('common.copy', { defaultValue: '点击复制' })
                  }
                >
                  <span className={styles.modelId}>{model.id}</span>
                  {normalizedFileType === 'xai' && model.upstream_url && <div className={routingStyles.modelRoute}>
                    <span title={model.upstream_url}>{t('grok_routing.effective_node')}: {nodeLabel(model.upstream_url)} · {t(`grok_routing.origin_${model.upstream_source ?? 'global'}`)}</span>
                    <span title={model.catalog_sources?.join(' · ')}>{t('grok_routing.catalog_origin')}: {model.catalog_sources?.length ? model.catalog_sources.map(nodeLabel).join(' · ') : t('grok_routing.builtin_or_manual')}</span>
                    {model.websocket_upstream_url && model.websocket_upstream_url !== model.upstream_url && <span title={model.websocket_upstream_url}>WS / Compact: {nodeLabel(model.websocket_upstream_url)}</span>}
                  </div>}
                  {normalizedFileType === 'xai' && model.routing_error && <span className={routingStyles.error}>{model.routing_error}</span>}
                  {normalizedFileType === 'xai' && model.upstream_id && model.upstream_id !== model.id && <span className={styles.hint}>→ {model.upstream_id}</span>}
                  {model.display_name && model.display_name !== model.id && (
                    <span className={styles.modelDisplayName}>{model.display_name}</span>
                  )}
                  {capability && (
                    <span
                      className={`${styles.modelCapability} ${styles[`modelCapability${capability.charAt(0).toUpperCase()}${capability.slice(1)}`]}`}
                    >
                      {t(`auth_files.model_capability_${capability}`)}
                    </span>
                  )}
                  {excludedModel && (
                    <span className={styles.modelExcludedBadge}>
                      {t('auth_files.models_excluded_badge', { defaultValue: '已禁用' })}
                    </span>
                  )}
                  {imageQuotaExhausted ? (
                    <>
                      <span
                        className={`${styles.modelCooldownBadge} ${styles.modelCooldownBadgeModel}`}
                      >
                        {t('auth_files.chatgpt_web_image_quota_model_badge')}
                      </span>
                      {Number.isFinite(imageQuotaRecoveryAt) ? (
                        <span className={styles.modelCooldownUntil}>
                          {t('auth_files.chatgpt_web_image_quota_recheck_at', {
                            until: formatDateTime(new Date(imageQuotaRecoveryAt)),
                          })}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                  {normalizedFileType === 'chatgpt-web' &&
                  imageQuotaModel &&
                  imageQuotaRemaining !== null ? (
                    <span className={styles.modelCooldownUntil}>
                      {t('auth_files.chatgpt_web_image_quota_remaining')}: {imageQuotaRemaining}
                    </span>
                  ) : null}
                  {normalizedFileType === 'chatgpt-web' && imageQuotaModel && imageQuotaStale ? (
                    <span className={styles.modelCooldownUntil}>
                      {t('auth_files.chatgpt_web_image_quota_stale')}
                    </span>
                  ) : null}
                  {cooldownActive && !explicitImageQuotaCooldown ? (
                    <>
                      <span
                        className={`${styles.modelCooldownBadge} ${
                          cooldownScope === 'auth'
                            ? styles.modelCooldownBadgeAuth
                            : styles.modelCooldownBadgeModel
                        }`}
                      >
                        {cooldownScope === 'auth'
                          ? t('auth_files.models_cooldown_auth_badge')
                          : t('auth_files.models_cooldown_model_badge')}
                      </span>
                      <span className={styles.modelCooldownUntil}>
                        {t('auth_files.models_cooldown_until', {
                          until: formatDateTime(new Date(cooldownUntilMs)),
                        })}
                      </span>
                    </>
                  ) : null}
                  {model.type && <span className={styles.modelType}>{model.type}</span>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}
