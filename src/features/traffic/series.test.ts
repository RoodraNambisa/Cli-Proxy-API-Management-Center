import { expect, it } from 'vitest';
import { compactTrafficSeries } from './series';
it('bounds compact chart density while preserving counts and exact interval rates', () => {
  const start = Date.parse('2026-10-31T00:00:00Z');
  const items = Array.from({ length: 1200 }, (_, i) => ({
    from: new Date(start + i * 2000).toISOString(),
    to: new Date(start + (i + 1) * 2000).toISOString(),
    requests: i % 4,
    rpm: (i % 4) * 30,
  }));
  const compact = compactTrafficSeries(items);
  expect(compact).toHaveLength(60);
  expect(compact.reduce((sum, point) => sum + point.requests, 0)).toBe(
    items.reduce((sum, point) => sum + point.requests, 0)
  );
  expect(compact[0]).toEqual({ from: items[0].from, to: items[19].to, requests: 30, rpm: 45 });
  expect(compactTrafficSeries(items.slice(0, 15))).toEqual(items.slice(0, 15));
});
it('does not render invalid time buckets as a fabricated trend', () => {
  expect(compactTrafficSeries([{ from: 'invalid', to: 'invalid', requests: 1, rpm: 1 }])).toEqual(
    []
  );
  expect(compactTrafficSeries([])).toEqual([]);
});
