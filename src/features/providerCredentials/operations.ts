import type { AuthFileItem } from '@/types/authFile';
import { authFilesApi, type AuthFileDependencyAction } from '@/services/api/authFiles';
import type { AuthFileFieldsPatch } from '@/services/api/authFiles';
import { providerCredentialsApi } from './api';

export async function setCredentialStatus(
  file: AuthFileItem | undefined,
  name: string,
  disabled: boolean
) {
  if (!file?.config_ref) return authFilesApi.setStatus(name, disabled);
  await providerCredentialsApi.save(
    {
      id: file.config_ref.id,
      revision: file.config_ref.revision,
      kind: file.config_ref.kind,
      values: {},
    },
    { disabled }
  );
  return { status: 'ok', disabled };
}

export async function deleteCredentialEntries(
  names: string[],
  files: AuthFileItem[],
  action?: AuthFileDependencyAction
) {
  const byName = new Map(files.map((file) => [file.name, file]));
  const apiNames = names.filter((name) => byName.get(name)?.config_ref);
  const fileNames = names.filter((name) => !byName.get(name)?.config_ref);
  const result = action
    ? await authFilesApi.deleteFiles(fileNames, action)
    : await authFilesApi.deleteFiles(fileNames);
  for (const name of apiNames) {
    try {
      await providerCredentialsApi.remove(byName.get(name)!.config_ref!);
      result.files.push(name);
      result.deleted++;
    } catch (error) {
      result.failed.push({ name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

export async function patchCredentialEntries(
  names: string[],
  files: AuthFileItem[],
  patch: AuthFileFieldsPatch
) {
  const byName = new Map(files.map((file) => [file.name, file]));
  const fileNames = names.filter((name) => !byName.get(name)?.config_ref);
  const result = fileNames.length
    ? await authFilesApi.patchFieldsBatch(fileNames, patch)
    : {
        status: 'ok',
        matched: 0,
        updated: 0,
        files: [] as string[],
        failed: [] as { name: string; error: string }[],
      };
  const mapping: Record<string, string> = {
    priority: 'priority',
    weight: 'weight',
    prefix: 'prefix',
    proxy_url: 'proxy-url',
    base_url: 'base-url',
    headers: 'headers',
    excluded_models: 'excluded-models',
    websockets: 'websockets',
    request_scoped_errors: 'request-scoped-errors',
  };
  for (const name of names.filter((name) => byName.get(name)?.config_ref)) {
    const ref = byName.get(name)!.config_ref!;
    result.matched++;
    try {
      const unsupported = Object.keys(patch).filter((key) => !mapping[key]);
      if (unsupported.length)
        throw new Error(`Unsupported API credential fields: ${unsupported.join(', ')}`);
      const values = Object.fromEntries(
        Object.entries(patch).map(([key, value]) => [mapping[key], value])
      );
      await providerCredentialsApi.save(
        { id: ref.id, revision: ref.revision, kind: ref.kind, values: {} },
        values
      );
      result.updated++;
      result.files.push(name);
    } catch (error) {
      result.failed.push({ name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}
