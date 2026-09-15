import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ConfigHelp } from './ConfigHelp';
import { GROK_UPSTREAM_MODES } from '@/utils/grokUpstream';
import {
  emptyGrokModelRouting,
  grokModelRoutingError,
  type GrokModelRoutingDraft,
} from '@/utils/grokModelRouting';
import styles from './GrokModelRoutingEditor.module.scss';

export function GrokModelRoutingEditor({
  value,
  onChange,
  disabled,
  credential = false,
}: {
  value: GrokModelRoutingDraft;
  onChange: (value: GrokModelRoutingDraft) => void;
  disabled?: boolean;
  credential?: boolean;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`grok_routing.${key}`);
  const modes = ['default', ...GROK_UPSTREAM_MODES];
  const node = (raw: string, label: string, set: (value: string) => void) => {
    const normalized = raw.trim().toLowerCase();
    const mode = modes.includes(normalized) ? normalized : 'custom';
    return (
      <div className={styles.node}>
        <Select
          ariaLabel={label}
          value={mode}
          disabled={disabled}
          options={[...modes, 'custom'].map((key) => ({
            value: key,
            label: key === 'default' ? text('default_node') : t(`grok_upstream.modes.${key}`),
          }))}
          onChange={(next) => set(next === 'custom' ? 'https://' : next)}
        />
        {mode === 'custom' && (
          <Input
            aria-label={`${label} URL`}
            value={raw}
            disabled={disabled}
            placeholder="https://gateway.example.com/v1"
            onChange={(event) => set(event.target.value)}
          />
        )}
      </div>
    );
  };
  const issue = grokModelRoutingError(value);
  return (
    <div className={styles.editor}>
      {credential && <p className={styles.hint}>{text('credential_hint')}</p>}
      <div className={styles.heading}>
        <strong>{text('sources')}</strong>
        <ConfigHelp compact title={text('sources')} text={text('sources_hint')} />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => onChange({ ...value, catalogSources: ['cli', 'api'] })}
        >
          {text('merge_cli_api')}
        </Button>
      </div>
      <div className={`${styles.list} ${styles.sourceList}`}>
        {value.catalogSources.map((source, index) => (
          <div className={styles.sourceRow} key={index}>
            {node(source, `${text('source')} ${index + 1}`, (upstream) =>
              onChange({
                ...value,
                catalogSources: value.catalogSources.map((entry, i) =>
                  i === index ? upstream : entry
                ),
              })
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`${text('remove_source')} ${index + 1}`}
              onClick={() =>
                onChange({
                  ...value,
                  catalogSources: value.catalogSources.filter((_, i) => i !== index),
                })
              }
            >
              {t('common.delete')}
            </Button>
          </div>
        ))}
        {!value.catalogSources.length && (
          <p className={styles.hint}>{text(credential ? 'sources_inherit' : 'sources_default')}</p>
        )}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || value.catalogSources.length >= 8}
        onClick={() => onChange({ ...value, catalogSources: [...value.catalogSources, 'default'] })}
      >
        {text('add_source')}
      </Button>
      <div className={styles.heading}>
        <strong>{text('routes')}</strong>
        <ConfigHelp compact title={text('routes')} text={text('routes_hint')} />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || value.modelRoutes.length > 0}
          onClick={() =>
            onChange({
              ...value,
              modelRoutes: [
                { models: 'grok-4.5, grok-4.6', upstream: 'cli' },
                { models: '*', upstream: 'api' },
              ],
            })
          }
        >
          {text('route_preset')}
        </Button>
      </div>
      <div className={styles.list}>
        {value.modelRoutes.map((route, index) => (
          <div className={styles.routeRow} key={index}>
            <Input
              aria-label={`${text('model_pattern')} ${index + 1}`}
              value={route.models}
              placeholder="grok-4.5, grok-4.6 / grok-imagine-*"
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  modelRoutes: value.modelRoutes.map((entry, i) =>
                    i === index ? { ...entry, models: event.target.value } : entry
                  ),
                })
              }
            />
            {node(route.upstream, `${text('route_node')} ${index + 1}`, (upstream) =>
              onChange({
                ...value,
                modelRoutes: value.modelRoutes.map((entry, i) =>
                  i === index ? { ...entry, upstream } : entry
                ),
              })
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`${text('remove_route')} ${index + 1}`}
              onClick={() =>
                onChange({ ...value, modelRoutes: value.modelRoutes.filter((_, i) => i !== index) })
              }
            >
              {t('common.delete')}
            </Button>
          </div>
        ))}
        {!value.modelRoutes.length && (
          <p className={styles.hint}>{text(credential ? 'routes_inherit' : 'routes_default')}</p>
        )}
      </div>
      <div className={styles.actions}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || value.modelRoutes.length >= 64}
          onClick={() =>
            onChange({
              ...value,
              modelRoutes: [...value.modelRoutes, { models: '', upstream: 'api' }],
            })
          }
        >
          {text('add_route')}
        </Button>
        {(value.catalogSources.length > 0 || value.modelRoutes.length > 0) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(emptyGrokModelRouting())}
          >
            {text(credential ? 'reset_account' : 'reset_global')}
          </Button>
        )}
      </div>
      <p className={styles.hint}>{text('priority_hint')}</p>
      {issue && (
        <p role="alert" className={styles.error}>
          {text(`invalid_${issue}`)}
        </p>
      )}
    </div>
  );
}
