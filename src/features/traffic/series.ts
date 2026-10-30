import type { TrafficOverview } from './types';

// Aggregate complete time buckets for a compact sparkline without discarding requests.
export function compactTrafficSeries(
  items: TrafficOverview['items'],
  maxPoints = 60
): TrafficOverview['items'] {
  const size = Math.max(1, Math.ceil(items.length / Math.max(1, maxPoints)));
  const points: TrafficOverview['items'] = [];
  for (let i = 0; i < items.length; i += size) {
    const group = items.slice(i, i + size);
    const from = group[0].from;
    const to = group[group.length - 1].to;
    const seconds = (Date.parse(to) - Date.parse(from)) / 1000;
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    const requests = group.reduce(
      (sum, point) => sum + Math.max(0, Number(point.requests) || 0),
      0
    );
    points.push({ from, to, requests, rpm: (requests * 60) / seconds });
  }
  return points;
}
