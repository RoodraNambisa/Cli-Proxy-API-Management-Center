import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/services/api/client';
import { useAuthStore } from '@/stores/useAuthStore';
import type { UsageDetailsResponse } from '@/types';
import {
  normalizeUsageFailureDetails,
  type UsageFailureDetails,
} from '@/utils/usage/failureDetails';

export function UsageAggregationDetails({ detail }: { detail: UsageFailureDetails }) {
  const { t } = useTranslation();
  const generation = useAuthStore((s) => s.connectionGeneration);
  const [origin] = useState(generation);
  const [requested, setRequested] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState(false);
  const a = detail.image_aggregation;
  useEffect(() => {
    if (!requested || !a || origin !== generation) return;
    const controller = new AbortController();
    const connection = apiClient.captureConnection();
    void apiClient
      .getAtConnection<UsageDetailsResponse>(connection, '/usage/details', {
        signal: controller.signal,
        params: {
          image_aggregation_role: 'attempt',
          image_aggregation_batch: a.batch_id,
          image_aggregation_index: a.image_index,
          from: detail.aggregation_from,
          to: detail.aggregation_to,
          limit: 100,
          sort_order: 'asc',
        },
      })
      .then(
        (response) => {
          if (!controller.signal.aborted)
            setRows(
              (response.items ?? response.details ?? []).filter(
                (x) => x && typeof x === 'object'
              ) as Record<string, unknown>[]
            );
        },
        () => {
          if (!controller.signal.aborted) setError(true);
        }
      );
    return () => controller.abort();
  }, [requested, a, detail.aggregation_from, detail.aggregation_to, generation, origin]);
  if (!a) return null;
  const label = (key: string) => t(`usage_stats.image_aggregation.${key}`);
  return (
    <section>
      <h4>{label('title')}</h4>
      <p>
        {label('requested')}: {a.requested} · {label('generated')}: {a.generated} ·{' '}
        {label('delivered')}: {a.delivered} · {label('retries')}: {a.retry_attempts}
      </p>
      <p>
        {label('index')}: {a.image_index} · {label('attempt')}: {a.attempt_index}
      </p>
      {a.original_code && (
        <p>
          {label('original')}: <code>{a.original_code}</code> · {label('original_stage')}:{' '}
          {a.original_stage || '—'}
        </p>
      )}
      <p className="hint">{label('attempts_hint')}</p>
      {origin !== generation ? (
        <p>{label('connection_changed')}</p>
      ) : (
        <>
          {!requested && <Button onClick={() => setRequested(true)}>{label('view')}</Button>}
          {requested && !rows && !error && <p>{label('loading')}</p>}
          {error && <p role="alert">{label('error')}</p>}
          {rows?.length === 0 && <p>{label('empty')}</p>}
          {rows && rows.length > 0 && (
            <ul>
              {rows.map((row, index) => {
                const d = normalizeUsageFailureDetails(row);
                return (
                  <li key={index}>
                    {label('attempt')} {d.image_aggregation?.attempt_index}:{' '}
                    {t(row.failed ? 'stats.failure' : 'stats.success')}
                    {d.error_code && (
                      <>
                        {' '}
                        · <code>{d.error_code}</code>
                      </>
                    )}
                    {d.failure_stage && <> · {d.failure_stage}</>}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
