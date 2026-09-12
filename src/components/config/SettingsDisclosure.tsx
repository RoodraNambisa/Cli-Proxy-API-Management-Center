import type { ReactNode } from 'react';
import { ConfigDisclosure } from './ConfigDisclosure';
import { useSettingsDisclosure } from './useSettingsDisclosure';

export function SettingsDisclosure({ id, title, description, summary, focusTarget, targetIds = [], dirty = false, errorCount = 0, children, defaultExpanded = false }: {
  id: string;
  title: string;
  description?: string;
  summary?: ReactNode;
  focusTarget?: string;
  targetIds?: string[];
  dirty?: boolean;
  errorCount?: number;
  children: ReactNode;
  defaultExpanded?: boolean;
}) {
  const focusMatches = focusTarget === id || Boolean(focusTarget && targetIds.includes(focusTarget));
  const { expanded, setExpanded } = useSettingsDisclosure({ storageKey: `config-management:${id}-expanded`,
    focusTarget, focusMatches, dirty, errorCount, defaultExpanded });

  return <ConfigDisclosure
    id={id} title={title} description={description} summary={summary}
    expanded={expanded} keepMounted
    onExpandedChange={setExpanded}
    dirty={dirty} errorCount={errorCount}
  >{children}</ConfigDisclosure>;
}
