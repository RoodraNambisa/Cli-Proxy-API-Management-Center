import { useTranslation } from 'react-i18next';
import { SettingsDisclosure } from './SettingsDisclosure';
import { ConfigHelp } from './ConfigHelp';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { HeaderInputList } from '@/components/ui/HeaderInputList';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { GROK_DEFAULT_KEYS, type GrokVisualConfig } from '@/types/grok';
import { grokConfigErrors } from '@/utils/grokConfig';
import {
  GROK_UPSTREAM_MODES,
  GROK_UPSTREAM_URLS,
  type GrokUpstreamMode,
} from '@/utils/grokUpstream';
import styles from './GrokConfigEditor.module.scss';

export function GrokConfigEditor({
  value,
  baselineValue,
  focusTarget,
  disabled,
  onChange,
}: {
  value: GrokVisualConfig;
  baselineValue: GrokVisualConfig;
  focusTarget?: string;
  disabled?: boolean;
  onChange: (value: GrokVisualConfig) => void;
}) {
  const { t } = useTranslation();
  const key = (name: string) => t(`config_management.grok.${name}`);
  const patch = (next: Partial<GrokVisualConfig>) => onChange({ ...value, ...next });
  const errors = grokConfigErrors(value);
  const changed = (...fields: Array<keyof GrokVisualConfig>) =>
    fields.some((field) => JSON.stringify(value[field]) !== JSON.stringify(baselineValue[field]));
  const errorCount = (...fields: string[]) =>
    fields.filter((field) => errors[`grok.${field}`]).length;
  const error = (name: string) =>
    errors[`grok.${name}`]
      ? t(`config_management.visual.validation.${errors[`grok.${name}`]}`)
      : undefined;
  const toggle = (
    name: 'passthrough' | 'spoof' | 'convergence' | 'confuse' | 'webSearch' | 'xSearch'
  ) => (
    <div key={name} className={styles.toggle} id={`config-grok-${name}`}>
      <div>
        <strong>{key(name)}</strong>
        <ConfigHelp title={key(name)} text={key(`${name}_hint`)} />
      </div>
      <ToggleSwitch
        checked={value[name]}
        onChange={(checked) => patch({ [name]: checked })}
        disabled={disabled}
        ariaLabel={key(name)}
      />
    </div>
  );
  return (
    <div className={styles.sections}>
      <SettingsDisclosure
        id="config-grok-upstream"
        title={t('grok_upstream.title')}
        description={t('grok_upstream.default_hint')}
        focusTarget={focusTarget}
        dirty={changed('upstreamMode')}
        errorCount={errorCount('upstreamMode')}
      >
        <div className={styles.pool}>
          <div className="form-group">
            <label>{t('grok_upstream.default_label')}</label>
            <Select
              ariaLabel={t('grok_upstream.default_label')}
              value={value.upstreamMode}
              disabled={disabled}
              onChange={(upstreamMode) => patch({ upstreamMode })}
              options={GROK_UPSTREAM_MODES.map((mode) => ({
                value: mode,
                label: t(`grok_upstream.modes.${mode}`),
              }))}
            />
          </div>
        </div>
        <code className={styles.upstreamUrl}>
          {GROK_UPSTREAM_URLS[value.upstreamMode as GrokUpstreamMode] ?? ''}
        </code>
        {error('upstreamMode') && (
          <p role="alert" className={styles.error}>
            {error('upstreamMode')}
          </p>
        )}
        <ConfigHelp title={t('grok_upstream.title')} text={t('grok_upstream.transport_hint')} />
      </SettingsDisclosure>
      <SettingsDisclosure
        id="config-grok-headers"
        title={key('headers')}
        description={key('global_hint')}
        focusTarget={focusTarget}
        dirty={changed('userAgent', 'clientVersion', 'clientIdentifier', 'headers')}
        errorCount={errorCount('userAgent', 'clientVersion', 'clientIdentifier', 'headers')}
      >
        <div className={styles.grid}>
          {(['userAgent', 'clientVersion', 'clientIdentifier'] as const).map((name) => (
            <Input
              key={name}
              label={key(name)}
              value={value[name]}
              placeholder={
                name === 'clientVersion'
                  ? '0.2.120'
                  : name === 'clientIdentifier'
                    ? 'grok-shell'
                    : 'xai-grok-workspace/0.2.120'
              }
              error={error(name)}
              disabled={disabled}
              onChange={(event) => patch({ [name]: event.target.value })}
            />
          ))}
        </div>
        <ConfigHelp title={key('headers')} text={key('headers_hint')} />
        <div className={styles.headers}>
          <HeaderInputList
            entries={value.headers}
            onChange={(headers) => patch({ headers })}
            disabled={disabled}
            addLabel={key('add_header')}
            removeButtonTitle={t('common.delete')}
            removeButtonAriaLabel={t('common.delete')}
            keyPlaceholder={key('header_name')}
            valuePlaceholder={key('header_value')}
          />
        </div>
        {error('headers') && (
          <p role="alert" className={styles.error}>
            {error('headers')}
          </p>
        )}
      </SettingsDisclosure>
      <SettingsDisclosure
        id="config-grok-identity"
        title={key('identity')}
        focusTarget={focusTarget}
        targetIds={[
          'config-grok-passthrough',
          'config-grok-spoof',
          'config-grok-convergence',
          'config-grok-confuse',
        ]}
        dirty={changed('passthrough', 'spoof', 'convergence', 'confuse', 'poolSize')}
        errorCount={errorCount('poolSize')}
      >
        <div className={styles.grid}>
          {toggle('passthrough')}
          {toggle('spoof')}
          {toggle('convergence')}
          {toggle('confuse')}
        </div>
        <div className={styles.pool}>
          <Input
            label={key('poolSize')}
            type="number"
            min={1}
            max={64}
            value={value.poolSize}
            error={error('poolSize')}
            disabled={disabled || !value.convergence}
            onChange={(event) => patch({ poolSize: event.target.value })}
          />
        </div>
        <ConfigHelp title={key('poolSize')} text={key('pool_hint')} />
        <p className={styles.notice}>
          {key(
            value.passthrough && (value.convergence || value.confuse)
              ? 'passthrough_priority'
              : 'identity_hint'
          )}
        </p>
      </SettingsDisclosure>
      <SettingsDisclosure
        id="config-grok-parameters"
        title={key('parameters')}
        description={key('defaults_hint')}
        focusTarget={focusTarget}
        targetIds={['config-grok-webSearch', 'config-grok-xSearch']}
        dirty={changed('defaults', 'webSearch', 'xSearch')}
        errorCount={errorCount(...GROK_DEFAULT_KEYS)}
      >
        <div className={styles.grid}>
          {GROK_DEFAULT_KEYS.map((name) => (
            <div key={name}>
              {name === 'parallel_tool_calls' || name === 'stream_tool_calls' ? (
                <div className="form-group">
                  <label>{name}</label>
                  <Select
                    ariaLabel={name}
                    value={value.defaults[name]}
                    onChange={(next) => patch({ defaults: { ...value.defaults, [name]: next } })}
                    disabled={disabled}
                    options={[
                      { value: '', label: key('unset') },
                      { value: 'true', label: t('common.enabled') },
                      { value: 'false', label: t('common.disabled') },
                    ]}
                  />
                </div>
              ) : (
                <Input
                  label={name}
                  value={value.defaults[name]}
                  placeholder={
                    name === 'tool_choice' ? 'auto / none / required / JSON' : key('unset')
                  }
                  error={error(name)}
                  disabled={disabled}
                  onChange={(event) =>
                    patch({ defaults: { ...value.defaults, [name]: event.target.value } })
                  }
                />
              )}
            </div>
          ))}
        </div>
        <div className={styles.grid}>
          {toggle('webSearch')}
          {toggle('xSearch')}
        </div>
      </SettingsDisclosure>
    </div>
  );
}
