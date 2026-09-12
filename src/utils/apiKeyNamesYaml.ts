import type { Document } from 'yaml';
import { normalizeApiKeyName } from './apiKeyGroups';
import { detachErrorRuleAliases, readMergedYamlField } from './requestScopedErrorsYaml';

const nameAt = (names: Record<string, string>, key: string): string =>
  Object.prototype.hasOwnProperty.call(names, key) ? normalizeApiKeyName(names[key]) : '';

// Apply only edited names to the latest YAML, retaining concurrently saved
// restrictions and untouched names. Key replacements inherit their old label.
export function writeApiKeyNamesYaml(
  doc: Document,
  baselineKeys: string[],
  nextKeys: string[],
  baselineNames: Record<string, string>,
  names: Record<string, string>
): void {
  const raw = readMergedYamlField(doc, ['api-key-groups']);
  const groups: Record<string, unknown>[] = Array.isArray(raw)
    ? raw.filter((group): group is Record<string, unknown> => !!group && typeof group === 'object' && !Array.isArray(group)).map((group) => ({ ...group }))
    : [];
  let changed = false;
  nextKeys.forEach((key, index) => {
    const previous = baselineKeys[index];
    const sourceKey = baselineKeys.length === nextKeys.length && previous && previous !== key && !nextKeys.includes(previous) && !baselineKeys.includes(key)
      ? previous : key;
    const name = nameAt(names, key);
    if (name === nameAt(baselineNames, sourceKey)) return;
    let group = groups.find((entry) => (entry['api-key'] ?? entry.apiKey) === key);
    if (!group) {
      if (!name) return;
      group = { 'api-key': key, providers: [] };
      groups.push(group);
    }
    if (name) group.name = name;
    else delete group.name;
    changed = true;
  });
  if (changed) {
    detachErrorRuleAliases(doc, doc.get('api-key-groups', true));
    doc.set('api-key-groups', doc.createNode(groups));
  }
}
