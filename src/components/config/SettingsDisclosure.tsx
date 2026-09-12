import { useContext, useState, type ReactNode } from 'react';
import { ConfigDisclosure } from './ConfigDisclosure';
import { ConfigFocusContext } from './configFocus';

export function SettingsDisclosure({ id, title, description, summary, focusTarget, targetIds = [], dirty = false, errorCount = 0, children }: {
  id: string;
  title: string;
  description?: string;
  summary?: ReactNode;
  focusTarget?: string;
  targetIds?: string[];
  dirty?: boolean;
  errorCount?: number;
  children: ReactNode;
}) {
  const storageKey = `config-management:${id}-expanded`;
  const focusRequest = useContext(ConfigFocusContext);
  const [expandedPreference, setExpandedPreference] = useState(() => localStorage.getItem(storageKey) === 'true');
  const [manual, setManual] = useState<{ focusRequest: number; focusTarget?: string; errorCount: number; expanded: boolean }>();
  const focusMatches = focusTarget === id || Boolean(focusTarget && targetIds.includes(focusTarget));
  const manualApplies = manual && errorCount <= manual.errorCount &&
    (!focusMatches || (manual.focusRequest === focusRequest && manual.focusTarget === focusTarget));
  const expanded = manualApplies ? manual.expanded
    : expandedPreference || focusMatches || dirty || errorCount > 0;

  return <ConfigDisclosure
    id={id} title={title} description={description} summary={summary}
    expanded={expanded} keepMounted
    onExpandedChange={(nextExpanded) => {
      setExpandedPreference(nextExpanded);
      setManual({ focusRequest, focusTarget, errorCount, expanded: nextExpanded });
      localStorage.setItem(storageKey, String(nextExpanded));
    }}
    dirty={dirty} errorCount={errorCount}
  >{children}</ConfigDisclosure>;
}
