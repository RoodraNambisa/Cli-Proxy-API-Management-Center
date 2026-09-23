import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { SettingsDisclosure } from './SettingsDisclosure';
import { autoCookieConflict } from '@/utils/codexAutoCookie';
import type { CodexStateOverride } from '@/utils/codexStateOverride';

export function CodexAutoCookieEditor({
  enabled,
  override,
  state,
  onChange,
  disabled,
  dirty,
  focusTarget,
}: {
  enabled: boolean;
  override: boolean;
  state: CodexStateOverride;
  onChange: (value: { codexAutoCookie?: boolean; codexAutoCookieOverride?: boolean }) => void;
  disabled?: boolean;
  dirty?: boolean;
  focusTarget?: string;
}) {
  const { t } = useTranslation();
  const conflict = enabled && autoCookieConflict(state);
  return (
    <SettingsDisclosure
      id="config-codex-auto-cookie"
      title={t('codex_auto_cookie.title')}
      description={t('codex_auto_cookie.description')}
      summary={t(enabled ? 'common.enabled' : 'common.disabled')}
      errorCount={conflict ? 1 : 0}
      dirty={dirty}
      focusTarget={focusTarget}
    >
      <ToggleSwitch
        label={t('codex_auto_cookie.title')}
        checked={enabled}
        disabled={disabled}
        onChange={(codexAutoCookie) => onChange({ codexAutoCookie })}
      />
      <p className="hint">{t('codex_auto_cookie.hint')}</p>
      {enabled && (
        <>
          <ToggleSwitch
            label={t('codex_auto_cookie.override')}
            checked={override}
            disabled={disabled}
            onChange={(codexAutoCookieOverride) => onChange({ codexAutoCookieOverride })}
          />
          <p className="hint">
            {t(override ? 'codex_auto_cookie.override_hint' : 'codex_auto_cookie.explicit_hint')}
          </p>
        </>
      )}
      {conflict && (
        <div role="alert" className="error-box">
          {t('codex_auto_cookie.conflict', { rule: conflict })}
        </div>
      )}
    </SettingsDisclosure>
  );
}
