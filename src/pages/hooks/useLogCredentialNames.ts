import { useEffect, useState } from 'react';
import { authFilesApi } from '@/services/api/authFiles';

const emptyNames = new Map<string, string>();

// Resolve older index-only logs from safe list metadata, never credential downloads.
export function useLogCredentialNames(scopeKey: string, connected: boolean) {
  const [snapshot, setSnapshot] = useState({ scopeKey: '', names: emptyNames });
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    void authFilesApi
      .list(undefined, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        const names = new Map<string, string>();
        for (const file of response.files || []) {
          const index = String(file.authIndex ?? file['auth_index'] ?? '').trim();
          if (index && file.name) names.set(index, file.name);
        }
        setSnapshot({ scopeKey, names });
      })
      .catch(() => {
        // New events retain their captured name even if the current list is unavailable.
      });
    return () => controller.abort();
  }, [scopeKey, connected]);
  return connected && snapshot.scopeKey === scopeKey ? snapshot.names : emptyNames;
}
