let lastSnapshotOrder = 0;

export const captureAuthFileSnapshotOrder = (): number => {
  lastSnapshotOrder = Math.max(Date.now(), lastSnapshotOrder + 1);
  return lastSnapshotOrder;
};
