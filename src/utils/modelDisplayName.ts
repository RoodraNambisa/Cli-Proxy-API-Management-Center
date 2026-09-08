/** An empty label inherits the backend catalog's existing name. */
export const normalizeModelDisplayName = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error('Model display-name must be a string');
  return value.trim() || undefined;
};
