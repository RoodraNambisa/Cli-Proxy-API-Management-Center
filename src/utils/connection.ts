import { DEFAULT_API_PORT, MANAGEMENT_API_PREFIX } from './constants';

export const normalizeApiBase = (input: string): string => {
  let base = (input || '').trim();
  if (!base) return '';
  base = base.replace(/\/?v0\/management\/?$/i, '');
  base = base.replace(/\/+$/i, '');
  if (!/^https?:\/\//i.test(base)) {
    base = `http://${base}`;
  }
  return base;
};

export const normalizeManagementAccessPath = (input: string): string => {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';

  const withoutOrigin = trimmed.replace(/^https?:\/\/[^/]+/i, '');
  const withoutQuery = withoutOrigin.split(/[?#]/)[0] ?? '';
  const withoutManagementApi = withoutQuery.replace(/\/?v0\/management\/?$/i, '');
  const withoutManagementPage = withoutManagementApi.replace(/\/?management\.html\/?$/i, '');
  const normalized = withoutManagementPage.replace(/^\/+|\/+$/g, '');

  return normalized ? `/${normalized}` : '';
};

export const detectManagementAccessPathFromLocation = (): string => {
  try {
    const pathname = window.location.pathname || '';
    return normalizeManagementAccessPath(pathname.endsWith('/management.html') ? pathname : '');
  } catch (error) {
    console.warn('Failed to detect management access path from location', error);
    return '';
  }
};

export const computeApiUrl = (base: string): string => {
  const normalized = normalizeApiBase(base);
  if (!normalized) return '';
  const accessPath = normalizeManagementAccessPath(detectManagementAccessPathFromLocation());
  const suffix =
    accessPath && normalized.toLowerCase().endsWith(accessPath.toLowerCase()) ? '' : accessPath;
  return `${normalized}${suffix}${MANAGEMENT_API_PREFIX}`;
};

export const detectApiBaseFromLocation = (): string => {
  try {
    const { protocol, hostname, port } = window.location;
    const normalizedPort = port ? `:${port}` : '';
    return normalizeApiBase(`${protocol}//${hostname}${normalizedPort}`);
  } catch (error) {
    console.warn('Failed to detect api base from location, fallback to default', error);
    return normalizeApiBase(`http://localhost:${DEFAULT_API_PORT}`);
  }
};

export const isLocalhost = (hostname: string): boolean => {
  const value = (hostname || '').toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '[::1]';
};
