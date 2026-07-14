export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  if (items.length === 0) return [];

  const normalizedConcurrency = Number.isFinite(concurrency)
    ? Math.max(1, Math.floor(concurrency))
    : 1;
  const workerCount = Math.min(items.length, normalizedConcurrency);
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;

      try {
        results[index] = { status: 'fulfilled', value: await mapper(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
