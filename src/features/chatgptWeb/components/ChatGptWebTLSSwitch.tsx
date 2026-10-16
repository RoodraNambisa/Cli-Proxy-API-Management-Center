import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useChatGptWebTLSCapability } from '../useChatGptWebTLSCapability';
import styles from '@/components/config/VisualConfigEditor.module.scss';

export function ChatGptWebTLSSwitch({
  enabled,
  onChange,
  connectionKey,
  active,
  disabled,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  connectionKey: string;
  active: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const capability = useChatGptWebTLSCapability(connectionKey, active);
  const title = t('chatgpt_web.tls_trust_anchors.title');
  const description =
    capability === 'supported'
      ? t(
          enabled
            ? 'chatgpt_web.tls_trust_anchors.enabled_description'
            : 'chatgpt_web.tls_trust_anchors.disabled_description'
        )
      : t(`chatgpt_web.tls_trust_anchors.${capability}`);
  return (
    <div id="config-chatgpt-web-tls-trust-anchors" className={styles.toggleRow}>
      <div className={styles.toggleCopy}>
        <div className={styles.toggleTitle}>{title}</div>
        <div className={styles.fieldHint} role="status">
          {description}
        </div>
      </div>
      <ToggleSwitch
        ariaLabel={title}
        checked={enabled}
        onChange={onChange}
        disabled={disabled || capability !== 'supported'}
      />
    </div>
  );
}
