import { DEFAULT_API_PORT, MANAGEMENT_API_PREFIX } from './constants';

export interface ParsedConnectionTarget {
  apiBase: string;
  managementAccessPath: string;
}

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

const splitManagementPrefix = (pathPrefix: string, fallbackAccessPath: string) => {
  const accessPath = normalizeManagementAccessPath(fallbackAccessPath);
  if (!pathPrefix) {
    return { basePath: '', managementAccessPath: '' };
  }

  if (accessPath && pathPrefix.toLowerCase().endsWith(accessPath.toLowerCase())) {
    const basePath = pathPrefix.slice(0, pathPrefix.length - accessPath.length);
    return { basePath, managementAccessPath: accessPath };
  }

  return { basePath: '', managementAccessPath: normalizeManagementAccessPath(pathPrefix) };
};

const buildOriginBase = (origin: string, path: string): string =>
  normalizeApiBase(`${origin}${path}`);

export const detectManagementAccessPathFromLocation = (): string => {
  try {
    const pathname = window.location.pathname || '';
    return normalizeManagementAccessPath(pathname.endsWith('/management.html') ? pathname : '');
  } catch (error) {
    console.warn('Failed to detect management access path from location', error);
    return '';
  }
};

export const parseConnectionTarget = (
  input: string,
  fallbackAccessPath: string = detectManagementAccessPathFromLocation()
): ParsedConnectionTarget => {
  const raw = (input || '').trim();
  const normalizedFallbackAccessPath = normalizeManagementAccessPath(fallbackAccessPath);
  if (!raw) {
    return { apiBase: '', managementAccessPath: normalizedFallbackAccessPath };
  }

  const urlLike = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const url = new URL(urlLike);
    const path = url.pathname.replace(/\/+$/g, '');
    const apiMarker = path.match(/\/v0\/management(?:\/|$)/i);
    const pageMarker = path.match(/\/management\.html$/i);

    if (apiMarker?.index !== undefined) {
      const pathPrefix = path.slice(0, apiMarker.index);
      const { basePath, managementAccessPath } = splitManagementPrefix(
        pathPrefix,
        normalizedFallbackAccessPath
      );
      return {
        apiBase: buildOriginBase(url.origin, basePath),
        managementAccessPath,
      };
    }

    if (pageMarker?.index !== undefined) {
      const pathPrefix = path.slice(0, pageMarker.index);
      const { basePath, managementAccessPath } = splitManagementPrefix(
        pathPrefix,
        normalizedFallbackAccessPath
      );
      return {
        apiBase: buildOriginBase(url.origin, basePath),
        managementAccessPath,
      };
    }

    let basePath = path;
    if (
      normalizedFallbackAccessPath &&
      path.toLowerCase().endsWith(normalizedFallbackAccessPath.toLowerCase())
    ) {
      basePath = path.slice(0, path.length - normalizedFallbackAccessPath.length);
    }

    return {
      apiBase: buildOriginBase(url.origin, basePath),
      managementAccessPath: normalizedFallbackAccessPath,
    };
  } catch (error) {
    console.warn('Failed to parse connection target, fallback to normalized base', error);
    return {
      apiBase: normalizeApiBase(raw),
      managementAccessPath: normalizedFallbackAccessPath,
    };
  }
};

export const computeApiUrl = (base: string, managementAccessPath?: string): string => {
  const normalized = normalizeApiBase(base);
  if (!normalized) return '';
  return `${normalized}${normalizeManagementAccessPath(
    managementAccessPath ?? detectManagementAccessPathFromLocation()
  )}${MANAGEMENT_API_PREFIX}`;
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
