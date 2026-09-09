/** Missing or null fields keep compatibility mode disabled on older configs. */
export const normalizeModelCompatibility = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new Error('Model is-compat must be a boolean');
  return value;
};
