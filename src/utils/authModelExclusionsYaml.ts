import { isAlias, isMap, isNode, isSeq, type Document } from 'yaml';
import { detachErrorRuleAliases, readMergedYamlField } from './requestScopedErrorsYaml';

const key = 'auth-model-exclusions';
const fields = [
  'models',
  'providers',
  'priorities',
  'keyword-contains',
  'disable-image-generation',
  'disable-image-generation-priorities',
] as const;
const comparable = (value: unknown): string | undefined =>
  JSON.stringify(value, (_, v: unknown) =>
    typeof v === 'number' || typeof v === 'bigint' ? String(v) : v
  );

// Reuse each rule's source node, so deleting a sibling does not move its comments
// or extensions onto another rule. Empty overrides also shadow YAML merges.
export function writeAuthModelExclusionsYaml(
  doc: Document,
  values: Record<string, unknown>[],
  sourceIndexes: Array<number | undefined>
): void {
  const source = doc.get(key, true);
  const resolved = isAlias(source) ? source.resolve(doc) : source;
  const raw = readMergedYamlField(doc, [key, 'authModelExclusions']);
  const previous = Array.isArray(raw) ? raw : [];
  detachErrorRuleAliases(doc, source);
  const sequence = isSeq(resolved) ? resolved.clone() : doc.createNode([]);
  if (!isSeq(sequence)) return;
  delete sequence.anchor;
  sequence.items = values.map((value, index) => {
    const sourceIndex = sourceIndexes[index];
    const oldRaw = sourceIndex === undefined ? undefined : previous[sourceIndex];
    const node =
      isSeq(resolved) && sourceIndex !== undefined ? resolved.items[sourceIndex] : undefined;
    const oldNode = isAlias(node) ? node.resolve(doc) : node;
    const copy = isMap(oldNode) ? oldNode.clone() : doc.createNode(oldRaw ?? {});
    if (!isMap(copy)) return doc.createNode(value);
    delete copy.anchor;
    for (const field of fields) {
      const fallback = field === 'disable-image-generation' ? false : [];
      const before = oldRaw?.[field] ?? fallback;
      const after = value[field] ?? fallback;
      if (comparable(before) === comparable(after)) continue;
      const old = copy.get(field, true);
      const next = doc.createNode(after);
      if (isNode(old)) {
        next.comment = old.comment;
        next.commentBefore = old.commentBefore;
        next.spaceBefore = old.spaceBefore;
      }
      copy.set(field, next);
    }
    return copy;
  });
  doc.set(key, sequence);
  doc.delete('authModelExclusions');
}
