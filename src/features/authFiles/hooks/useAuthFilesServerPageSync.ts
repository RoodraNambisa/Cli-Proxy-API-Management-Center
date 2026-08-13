import { type Dispatch, type SetStateAction, useEffect } from 'react';

export function useAuthFilesServerPageSync(
  enabled: boolean,
  responsePage: unknown,
  responseVersion: number,
  setPage: Dispatch<SetStateAction<number>>
) {
  useEffect(() => {
    if (!enabled || responseVersion <= 0) return;
    const resolvedPage = Number(responsePage);
    if (!Number.isFinite(resolvedPage) || resolvedPage < 1) return;
    setPage((currentPage) => (currentPage === resolvedPage ? currentPage : resolvedPage));
  }, [enabled, responsePage, responseVersion, setPage]);
}
