import { isAlias, isMap, isNode, isSeq, type Document, type YAMLMap } from 'yaml';
import type { RoutingPriorityOverrideVisualEntry } from '@/types/visualConfig';

const priorityFields = [
  'priority',
  'strategy',
  'max-retry-credentials',
  'maxRetryCredentials',
  'fill-first-range',
  'fillFirstRange',
  'fill-first-per-auth-rpm',
  'fillFirstPerAuthRpm',
  'per-auth-request-limit',
  'perAuthRequestLimit',
  'per-auth-request-window-minutes',
  'perAuthRequestWindowMinutes',
  'subscription-overrides',
  'subscriptionOverrides',
];
const subscriptionFields = [
  'credentials',
  'providers',
  'plan-types',
  'planTypes',
  'per-auth-request-limit',
  'perAuthRequestLimit',
  'per-auth-request-window-minutes',
  'perAuthRequestWindowMinutes',
];

// An edited alias becomes an independent node without redefining source anchors.
function cloneResolved(
  doc: Document,
  value: unknown,
  ancestors = new Set<unknown>(),
  keepAnchors = false
): unknown {
  if (!isNode(value)) return value;
  if (ancestors.has(value) || ancestors.size > 100) throw new Error('Recursive routing YAML alias');
  const path = new Set(ancestors).add(value);
  if (isAlias(value)) return cloneResolved(doc, value.resolve(doc), path);
  const copy = value.clone();
  if (!keepAnchors && 'anchor' in copy) delete copy.anchor;
  if (isSeq(value) && isSeq(copy))
    copy.items = value.items.map((item) => cloneResolved(doc, item, path, keepAnchors));
  if (isMap(value) && isMap(copy)) {
    for (const [index, pair] of copy.items.entries()) {
      pair.key = cloneResolved(doc, value.items[index].key, path, keepAnchors);
      pair.value = cloneResolved(doc, value.items[index].value, path, keepAnchors);
    }
  }
  return copy;
}

// Materialize merge sources before clearing known keys, so inheritance cannot
// silently restore an explicitly cleared strategy or limit.
function expandRuleMerges(map: YAMLMap): YAMLMap {
  const merged = map.get('<<', true);
  const sources = isSeq(merged) ? merged.items : [merged];
  for (const source of sources) {
    if (!isMap(source)) continue;
    for (const pair of expandRuleMerges(source).items) {
      if (!map.has(pair.key)) map.add(pair);
    }
  }
  map.delete('<<');
  return map;
}

function sourceMaps(doc: Document, value: unknown): YAMLMap[] {
  if (isAlias(value)) value = cloneResolved(doc, value);
  if (!isSeq(value)) return [];
  return value.items
    .map((item) => cloneResolved(doc, item, new Set(), !isAlias(item)))
    .filter(isMap)
    .map(expandRuleMerges);
}

function mergeFields(
  doc: Document,
  original: YAMLMap | undefined,
  fields: string[],
  values: Record<string, unknown>,
  previous?: Record<string, unknown>
): YAMLMap {
  const candidate = original ? original.clone() : doc.createNode({});
  if (!isMap(candidate)) throw new Error('Routing rule must be a mapping');
  const map: YAMLMap = candidate;
  for (const field of fields) {
    const key = field.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
    if (!previous || key in previous || key in values) map.delete(field);
  }
  for (const [key, value] of Object.entries(values)) {
    map.set(key, doc.createNode(value));
  }
  return map;
}

// Stable form IDs distinguish an edited/reordered rule from an unrelated new one.
export function preserveRoutingOverrideNodes(
  doc: Document,
  rules: RoutingPriorityOverrideVisualEntry[],
  baseline: RoutingPriorityOverrideVisualEntry[],
  serialized: Array<Record<string, unknown>>,
  serializedBaseline: Array<Record<string, unknown>>,
  subscriptionKey: (value: unknown) => string
) {
  const originals = sourceMaps(doc, doc.getIn(['routing', 'priority-overrides'], true));
  return serialized.map((values) => {
    const rule = rules.find((entry) => Number(entry.priority) === values.priority);
    if (!rule) return doc.createNode(values);
    const previous = baseline.find((entry) => entry.clientId === rule.clientId);
    const original = previous
      ? originals.find((entry) => String(entry.get('priority')) === previous.priority)
      : undefined;
    const previousValues = previous
      ? serializedBaseline.find((entry) => entry.priority === Number(previous.priority))
      : undefined;
    const map = mergeFields(
      doc,
      original,
      priorityFields,
      values,
      original ? previousValues : undefined
    );
    if (rule.subscriptionOverrides.length > 0) {
      const oldSubscriptions = sourceMaps(
        doc,
        original?.get('subscription-overrides', true) ??
          original?.get('subscriptionOverrides', true)
      );
      const subscriptions = values['subscription-overrides'] as Array<Record<string, unknown>>;
      map.set(
        'subscription-overrides',
        doc.createNode(
          rule.subscriptionOverrides.map((subscription, subscriptionIndex) => {
            const old = previous?.subscriptionOverrides.find(
              (entry) => entry.clientId === subscription.clientId
            );
            const oldNode = old
              ? oldSubscriptions.find(
                  (entry) => subscriptionKey(entry.toJS(doc)) === subscriptionKey(old)
                )
              : undefined;
            const oldIndex = old && previous ? previous.subscriptionOverrides.indexOf(old) : -1;
            const oldValues = (
              previousValues?.['subscription-overrides'] as
                | Array<Record<string, unknown>>
                | undefined
            )?.[oldIndex];
            return mergeFields(
              doc,
              oldNode,
              subscriptionFields,
              subscriptions?.[subscriptionIndex] ?? {},
              oldNode ? oldValues : undefined
            );
          })
        )
      );
    }
    return map;
  });
}
