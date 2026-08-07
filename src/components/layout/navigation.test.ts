import { describe, expect, it } from 'vitest';
import { shouldShowLogsNavigation } from './navigation';

describe('shouldShowLogsNavigation', () => {
  it('shows the entry for either file logs or live logs', () => {
    expect(shouldShowLogsNavigation({ loggingToFile: true })).toBe(true);
    expect(shouldShowLogsNavigation({ remoteManagement: { liveLogs: { enabled: true } } })).toBe(
      true
    );
  });

  it('keeps the entry hidden when both log sources are disabled', () => {
    expect(shouldShowLogsNavigation({ loggingToFile: false })).toBe(false);
    expect(shouldShowLogsNavigation(undefined)).toBe(false);
  });
});
