import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { apiKeysApi, type ApiKeyAccessSnapshot } from '@/services/api/apiKeys';
import { authFilesApi } from '@/services/api/authFiles';
import { copyToClipboard } from '@/utils/clipboard';
import { maskApiKey } from '@/utils/format';
import { normalizeAuthIndex } from '@/utils/usage';
import { isRuntimeOnlyAuthFile } from '@/features/authFiles/constants';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';

export function CredentialTargetModal({
  file,
  onClose,
  onSaved,
}: {
  file: AuthFileItem;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const notify = useNotificationStore((state) => state.showNotification);
  const index = normalizeAuthIndex(file.auth_index ?? file.authIndex) ?? '';
  const [savedAlias, setSavedAlias] = useState(String(file.routing_alias ?? ''));
  const [alias, setAlias] = useState(savedAlias);
  const [snapshot, setSnapshot] = useState<ApiKeyAccessSnapshot>();
  const [keyIndex, setKeyIndex] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const normalized = alias.trim().toLowerCase();
  const valid = normalized === '' || /^[a-z0-9_-]{1,64}$/.test(normalized);
  const changed = normalized !== savedAlias;
  const enabledKeys = (snapshot?.keys ?? []).filter(
    (key) =>
      snapshot?.groups.find((group) => group.apiKey === key)?.allowCredentialTargeting === true
  );
  const apiKey = enabledKeys[Number(keyIndex)] ?? '';
  const selectedGroup = snapshot?.groups.find((group) => group.apiKey === apiKey);
  const enabled = apiKey !== '';
  const supported = snapshot?.credentialTargetingSupported === true;

  useEffect(() => {
    let active = true;
    apiKeysApi
      .getAccessSnapshot()
      .then((value) => {
        if (active) setSnapshot(value);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : t('credential_target.failed'));
      });
    return () => {
      active = false;
    };
  }, [t]);

  const saveAlias = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      await authFilesApi.patchFields(file.name, { routing_alias: normalized });
      setSavedAlias(normalized);
      setAlias(normalized);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('credential_target.failed'));
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!enabled || !apiKey || changed || busy) return;
    const ok = await copyToClipboard(`${apiKey}-auth-${savedAlias || index}`);
    notify(
      t(ok ? 'credential_target.copied' : 'credential_target.failed'),
      ok ? 'success' : 'error'
    );
  };

  return (
    <Modal
      open
      title={t('credential_target.title')}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button
            disabled={!supported || !enabled || !apiKey || changed || busy || !index}
            onClick={() => void copy()}
          >
            {t('credential_target.copy')}
          </Button>
        </>
      }
    >
      <p style={{ overflowWrap: 'anywhere' }}>{file.name}</p>
      <Input
        label={t('credential_target.id')}
        value={index}
        readOnly
        hint={t('credential_target.id_hint')}
      />
      <Input
        label={t('credential_target.alias')}
        value={alias}
        onChange={(event) => setAlias(event.target.value)}
        disabled={busy || !supported || isRuntimeOnlyAuthFile(file)}
        maxLength={64}
        placeholder="test"
        hint={t('credential_target.alias_hint')}
        error={!valid ? t('credential_target.invalid') : undefined}
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={!changed || !valid || busy || !supported || isRuntimeOnlyAuthFile(file)}
        onClick={() => void saveAlias()}
      >
        {t('common.save')}
      </Button>
      <div className="form-group" style={{ marginTop: 20 }}>
        <label>{t('credential_target.key')}</label>
        <Select
          ariaLabel={t('credential_target.key')}
          value={keyIndex}
          onChange={setKeyIndex}
          disabled={busy || !enabledKeys.length}
          options={enabledKeys.map((key, position) => ({
            value: String(position),
            label: `${snapshot?.groups.find((group) => group.apiKey === key)?.name || `#${position + 1}`} · ${maskApiKey(key)}`,
          }))}
        />
      </div>
      <p className="hint">{t('credential_target.enabled_keys_hint')}</p>
      <p className="hint">{t('credential_target.once')}</p>
      {enabled && snapshot?.credentialTargetOptionsSupported && (
        <div className="hint">
          <div>
            {t(
              selectedGroup?.credentialTargetRespectRequestLimit
                ? 'credential_target.limit_obey_summary'
                : 'credential_target.limit_bypass_summary'
            )}
          </div>
          <div>
            {t(
              selectedGroup?.credentialTargetRespectStatePolicy
                ? 'credential_target.state_obey_summary'
                : 'credential_target.state_bypass_summary'
            )}
          </div>
          <div>
            {t(
              selectedGroup?.credentialTargetResponseModelRewrite
                ? 'credential_target.model_apply_summary'
                : 'credential_target.model_raw_summary'
            )}
          </div>
        </div>
      )}
      {snapshot && !supported && <div className="hint">{t('credential_target.unsupported')}</div>}
      {snapshot && supported && !enabledKeys.length && (
        <div className="hint">{t('credential_target.no_enabled_keys')}</div>
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
