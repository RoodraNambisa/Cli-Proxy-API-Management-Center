import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useChatGptWebGIFAspectRatioCapability } from '../useChatGptWebGIFAspectRatioCapability';
import styles from '@/components/config/VisualConfigEditor.module.scss';

type Props = {
  enabled: boolean;
  tolerance: string;
  error?: string;
  onEnabledChange: (value: boolean) => void;
  onToleranceChange: (value: string) => void;
  connectionKey: string;
  active: boolean;
  disabled?: boolean;
};

export function ChatGptWebGIFAspectRatio(props: Props) {
  const { t } = useTranslation();
  const capability = useChatGptWebGIFAspectRatioCapability(props.connectionKey, props.active);
  const disabled = props.disabled || capability !== 'supported';
  const title = t('chatgpt_web.gif_aspect_ratio.title');
  return (
    <>
      <Input
        id="config-chatgpt-web-gif-aspect-ratio-max-error-percent"
        type="number"
        min={0}
        max={10}
        step={0.1}
        label={t('chatgpt_web.gif_aspect_ratio.tolerance')}
        hint={t('chatgpt_web.gif_aspect_ratio.tolerance_hint')}
        placeholder={t('chatgpt_web.gif_aspect_ratio.inherit')}
        value={props.tolerance}
        error={props.error}
        disabled={disabled}
        onChange={(event) => props.onToleranceChange(event.target.value)}
      />
      <div id="config-chatgpt-web-gif-allow-aspect-ratio-mismatch" className={styles.toggleRow}>
        <div className={styles.toggleCopy}>
          <div className={styles.toggleTitle}>{title}</div>
          <div className={styles.fieldHint} role="status">
            {t(
              `chatgpt_web.gif_aspect_ratio.${capability === 'supported' ? 'description' : capability}`
            )}
          </div>
        </div>
        <ToggleSwitch
          ariaLabel={title}
          checked={props.enabled}
          onChange={props.onEnabledChange}
          disabled={disabled}
        />
      </div>
    </>
  );
}
