export type CredentialProxyBinding = {
  version: 1;
  node_id?: string;
  port?: number;
  placeholders?: string[];
  direct?: boolean;
};

export function parseProxyBindingText(text: string): {
  value: CredentialProxyBinding | null;
  invalid: boolean;
} {
  if (!text.trim()) return { value: null, invalid: false };
  try {
    const value = JSON.parse(text) as CredentialProxyBinding;
    if (value === null) return { value: null, invalid: false };
    if (
      typeof value !== 'object' ||
      Array.isArray(value) ||
      value.version !== 1 ||
      Object.keys(value).some(
        (key) => !['version', 'node_id', 'port', 'placeholders', 'direct'].includes(key)
      ) ||
      JSON.stringify(value).length > 4096 ||
      (value.node_id !== undefined && typeof value.node_id !== 'string') ||
      (value.port !== undefined && !Number.isInteger(value.port)) ||
      (value.placeholders !== undefined &&
        (!Array.isArray(value.placeholders) ||
          value.placeholders.length > 32 ||
          value.placeholders.some(
            (item) => typeof item !== 'string' || !/^[a-zA-Z0-9._~-]{1,128}$/.test(item)
          ))) ||
      (value.direct !== undefined && typeof value.direct !== 'boolean')
    ) {
      return { value: null, invalid: true };
    }
    if (value.direct) {
      return {
        value,
        invalid: Boolean(value.node_id || value.port || (value.placeholders?.length ?? 0)),
      };
    }
    if (
      typeof value.node_id !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(value.node_id) ||
      !Number.isInteger(value.port) ||
      value.port! < 1 ||
      value.port! > 65535 ||
      (value.placeholders !== undefined &&
        (!Array.isArray(value.placeholders) ||
          value.placeholders.length > 32 ||
          value.placeholders.some(
            (item) => typeof item !== 'string' || !/^[a-zA-Z0-9._~-]{1,128}$/.test(item)
          )))
    ) {
      return { value: null, invalid: true };
    }
    return { value, invalid: false };
  } catch {
    return { value: null, invalid: true };
  }
}
