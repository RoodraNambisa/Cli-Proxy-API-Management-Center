import { isAlias, isMap, isNode, isSeq, visit, type Document, type Node } from 'yaml';

export function readOAuthErrorRulesYaml(document: Document): unknown {
  return readMergedYamlField(document, ['oauth-request-scoped-errors', 'oauthRequestScopedErrors']);
}

export function readMergedYamlField(document: Document, fields: string[]): unknown {
  const doc = document.clone();
  doc.setSchema('1.2', { merge: true });
  const find = (
    value: unknown,
    field: string,
    ancestors = new Set<Node>()
  ): { value: unknown } | undefined => {
    if (!isNode(value)) return undefined;
    if (ancestors.has(value) || ancestors.size > 100)
      throw new Error('Recursive configuration YAML merge');
    const path = new Set(ancestors).add(value);
    if (isAlias(value)) return find(value.resolve(doc), field, path);
    if (!isMap(value)) return undefined;
    if (value.has(field)) return { value: value.get(field, true) };
    let merged: unknown = value.get('<<', true);
    if (isAlias(merged)) merged = merged.resolve(doc);
    for (const source of isSeq(merged) ? merged.items : [merged]) {
      const result = find(source, field, path);
      if (result) return result;
    }
    return undefined;
  };
  let result: ReturnType<typeof find>;
  for (const field of fields) {
    result = find(doc.contents, field);
    if (result) break;
  }
  return result && isNode(result.value) ? result.value.toJS(doc) : result?.value;
}

// Materialize references before replacing their anchored rule source. Other
// fields must retain their old values rather than inherit the edited rules.
export function detachErrorRuleAliases(doc: Document, source: unknown): void {
  if (!isNode(source) || isAlias(source)) return;
  const removed = new Set<Node>();
  visit(source, { Node: (_, node) => { removed.add(node); } });
  let expanded = 0;
  const clone = (value: unknown, ancestors = new Set<Node>()): unknown => {
    if (!isNode(value)) return value;
    if (++expanded > 10000 || ancestors.has(value) || ancestors.size > 100)
      throw new Error('Error rule YAML aliases are recursive or too large');
    const path = new Set(ancestors).add(value);
    if (isAlias(value)) return clone(value.resolve(doc), path);
    const copy = value.clone();
    if ('anchor' in copy) delete copy.anchor;
    if (isSeq(copy) && isSeq(value)) copy.items = value.items.map((item) => clone(item, path));
    if (isMap(copy) && isMap(value)) {
      copy.items.forEach((pair, index) => {
        pair.key = clone(value.items[index].key, path);
        pair.value = clone(value.items[index].value, path);
      });
    }
    return copy;
  };
  visit(doc, {
    Alias: (_, alias, path) => {
      if (path.some((ancestor) => isNode(ancestor) && removed.has(ancestor))) return;
      const target = alias.resolve(doc);
      if (target && removed.has(target)) return clone(target) as Node;
    },
  });
}
