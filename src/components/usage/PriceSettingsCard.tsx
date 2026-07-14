import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { usageApi } from '@/services/api/usage';
import { useNotificationStore } from '@/stores';
import type { UsageModelPriceConfig, UsageModelPrices, UsagePricesResponse } from '@/types';
import { buildSharedModelPricesFromLegacy, loadModelPrices } from '@/utils/usage';
import type { UsageResource } from './hooks/useUsageData';
import styles from '@/pages/UsagePage.module.scss';

const LEGACY_MODEL_PRICES_KEY = 'cli-proxy-model-prices-v2';

export interface PriceSettingsCardProps {
  modelNames: string[];
  modelPrices: UsageModelPrices;
  resource: UsageResource<UsagePricesResponse>;
  legacyImportAvailable: boolean;
  onChanged: () => Promise<void>;
}

const parsePrice = (value: string): number | null => {
  const parsed = value.trim() === '' ? 0 : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function PriceSettingsCard({
  modelNames,
  modelPrices,
  resource,
  legacyImportAvailable,
  onChanged,
}: PriceSettingsCardProps) {
  const { t } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();
  const [model, setModel] = useState('');
  const [inputPrice, setInputPrice] = useState('');
  const [outputPrice, setOutputPrice] = useState('');
  const [cachedInputPrice, setCachedInputPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingModel, setDeletingModel] = useState('');
  const [importingLegacy, setImportingLegacy] = useState(false);

  const suggestions = useMemo(
    () => Array.from(new Set([...modelNames, ...Object.keys(modelPrices)])).sort(),
    [modelNames, modelPrices]
  );
  const controlsDisabled = resource.status === 'unsupported' || saving || importingLegacy;

  const resetForm = () => {
    setModel('');
    setInputPrice('');
    setOutputPrice('');
    setCachedInputPrice('');
  };

  const editPrice = (name: string, price: UsageModelPriceConfig) => {
    setModel(name);
    setInputPrice(String(price['input-per-million'] ?? 0));
    setOutputPrice(String(price['output-per-million'] ?? 0));
    setCachedInputPrice(String(price['cached-input-per-million'] ?? 0));
  };

  const savePrice = async () => {
    const normalizedModel = model.trim();
    const input = parsePrice(inputPrice);
    const output = parsePrice(outputPrice);
    const cachedInput = parsePrice(cachedInputPrice);
    if (!normalizedModel || input === null || output === null || cachedInput === null) {
      showNotification(t('usage_stats.price_invalid'), 'error');
      return;
    }

    setSaving(true);
    try {
      await usageApi.patchUsagePrices({
        [normalizedModel]: {
          'input-per-million': input,
          'output-per-million': output,
          'cached-input-per-million': cachedInput,
        },
      });
      showNotification(t('usage_stats.price_saved'), 'success');
      resetForm();
      await onChanged();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      showNotification(
        `${t('usage_stats.price_save_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const deletePrice = async (name: string) => {
    setDeletingModel(name);
    try {
      await usageApi.deleteUsagePrice(name);
      showNotification(t('usage_stats.price_deleted'), 'success');
      if (model === name) resetForm();
      await onChanged();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      showNotification(
        `${t('usage_stats.price_delete_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setDeletingModel('');
    }
  };

  const clearPrices = () => {
    showConfirmation({
      title: t('usage_stats.price_clear_title'),
      message: t('usage_stats.price_clear_confirm'),
      variant: 'danger',
      confirmText: t('common.delete'),
      onConfirm: async () => {
        setSaving(true);
        try {
          await usageApi.clearUsagePrices();
          resetForm();
          showNotification(t('usage_stats.price_cleared'), 'success');
          await onChanged();
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : '';
          showNotification(
            `${t('usage_stats.price_delete_failed')}${message ? `: ${message}` : ''}`,
            'error'
          );
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const importLegacyPrices = async () => {
    const models = buildSharedModelPricesFromLegacy(loadModelPrices());
    if (Object.keys(models).length === 0) return;

    setImportingLegacy(true);
    try {
      await usageApi.replaceUsagePrices(models);
      localStorage.removeItem(LEGACY_MODEL_PRICES_KEY);
      showNotification(t('usage_stats.legacy_prices_imported'), 'success');
      await onChanged();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      showNotification(
        `${t('usage_stats.legacy_prices_import_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setImportingLegacy(false);
    }
  };

  return (
    <Card
      title={t('usage_stats.model_price_settings')}
      extra={
        Object.keys(modelPrices).length > 0 ? (
          <Button variant="danger" size="sm" onClick={clearPrices} disabled={controlsDisabled}>
            {t('usage_stats.price_clear_all')}
          </Button>
        ) : null
      }
    >
      {resource.status === 'unsupported' ? (
        <div className={styles.hint}>{t('usage_stats.state_unsupported')}</div>
      ) : (
        <div className={styles.pricingSection}>
          {resource.status === 'error' && (
            <div className={styles.errorBox}>{resource.error || t('usage_stats.state_error')}</div>
          )}
          {legacyImportAvailable && (
            <div className={styles.legacyImportRow}>
              <span>{t('usage_stats.legacy_prices_found')}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void importLegacyPrices()}
                loading={importingLegacy}
                disabled={controlsDisabled}
              >
                {t('usage_stats.import_legacy_prices')}
              </Button>
            </div>
          )}
          <div className={styles.priceForm}>
            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label>{t('usage_stats.model_name')}</label>
                <Input
                  list="usage-model-price-options"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder={t('usage_stats.model_price_select_placeholder')}
                  disabled={controlsDisabled}
                />
                <datalist id="usage-model-price-options">
                  {suggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <span className={styles.formHint}>{t('usage_stats.model_price_exact_hint')}</span>
              </div>
              <div className={styles.formField}>
                <label>{t('usage_stats.model_price_input')} ($/1M)</label>
                <Input
                  type="number"
                  min="0"
                  value={inputPrice}
                  onChange={(event) => setInputPrice(event.target.value)}
                  placeholder="0.00"
                  step="0.0001"
                  disabled={controlsDisabled}
                />
              </div>
              <div className={styles.formField}>
                <label>{t('usage_stats.model_price_output')} ($/1M)</label>
                <Input
                  type="number"
                  min="0"
                  value={outputPrice}
                  onChange={(event) => setOutputPrice(event.target.value)}
                  placeholder="0.00"
                  step="0.0001"
                  disabled={controlsDisabled}
                />
              </div>
              <div className={styles.formField}>
                <label>{t('usage_stats.model_price_cached_input')} ($/1M)</label>
                <Input
                  type="number"
                  min="0"
                  value={cachedInputPrice}
                  onChange={(event) => setCachedInputPrice(event.target.value)}
                  placeholder="0.00"
                  step="0.0001"
                  disabled={controlsDisabled}
                />
              </div>
              <Button onClick={() => void savePrice()} loading={saving} disabled={controlsDisabled}>
                {t('common.save')}
              </Button>
            </div>
          </div>

          <div className={styles.pricesList}>
            <h4 className={styles.pricesTitle}>{t('usage_stats.saved_prices')}</h4>
            {resource.status === 'loading' ? (
              <div className={styles.hint}>{t('common.loading')}</div>
            ) : Object.keys(modelPrices).length > 0 ? (
              <div className={styles.pricesGrid}>
                {Object.entries(modelPrices).map(([name, price]) => (
                  <div key={name} className={styles.priceItem}>
                    <div className={styles.priceInfo}>
                      <span className={styles.priceModel}>{name}</span>
                      <div className={styles.priceMeta}>
                        <span>
                          {t('usage_stats.model_price_input')}: $
                          {price['input-per-million'].toFixed(4)}/1M
                        </span>
                        <span>
                          {t('usage_stats.model_price_output')}: $
                          {price['output-per-million'].toFixed(4)}/1M
                        </span>
                        <span>
                          {t('usage_stats.model_price_cached_input')}: $
                          {price['cached-input-per-million'].toFixed(4)}/1M
                        </span>
                      </div>
                    </div>
                    <div className={styles.priceActions}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => editPrice(name, price)}
                        disabled={controlsDisabled}
                      >
                        {t('common.edit')}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void deletePrice(name)}
                        loading={deletingModel === name}
                        disabled={controlsDisabled || Boolean(deletingModel)}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.hint}>{t('usage_stats.model_price_empty')}</div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
