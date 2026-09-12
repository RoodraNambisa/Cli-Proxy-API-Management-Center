import { useContext, useState } from 'react';
import { ConfigFocusContext } from './configFocus';

export function useSettingsDisclosure({ storageKey, focusTarget, focusMatches, dirty = false, errorCount = 0, defaultExpanded = false, focusRequest: requestedFocus }: {
  storageKey: string; focusTarget?: string; focusMatches: boolean; dirty?: boolean; errorCount?: number; defaultExpanded?: boolean; focusRequest?: number;
}) {
  const contextRequest = useContext(ConfigFocusContext);
  const focusRequest = requestedFocus ?? contextRequest;
  const [preference, setPreference] = useState<boolean | null>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved === null ? null : saved === 'true';
  });
  const [manual, setManual] = useState<{ focusRequest: number; focusTarget?: string; errorCount: number; expanded: boolean }>();
  const manualApplies = manual && errorCount <= manual.errorCount &&
    (!focusMatches || (manual.focusRequest === focusRequest && manual.focusTarget === focusTarget));
  const expanded = manualApplies ? manual.expanded
    : (preference ?? defaultExpanded) || focusMatches || dirty || errorCount > 0;
  const setExpanded = (nextExpanded: boolean) => {
    setPreference(nextExpanded);
    setManual({ focusRequest, focusTarget, errorCount, expanded: nextExpanded });
    localStorage.setItem(storageKey, String(nextExpanded));
  };
  return { expanded, setExpanded };
}
