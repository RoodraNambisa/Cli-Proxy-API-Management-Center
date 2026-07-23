import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FrontendFeatureId = 'codexAgentIdentityConversion';

export type FrontendFeatureVisibility = Record<FrontendFeatureId, boolean>;

export const FRONTEND_FEATURE_VISIBILITY_STORAGE_KEY = 'cli-proxy-frontend-feature-visibility-v1';

export const DEFAULT_FRONTEND_FEATURE_VISIBILITY: FrontendFeatureVisibility = {
  codexAgentIdentityConversion: false,
};

type FrontendFeatureState = {
  visibility: FrontendFeatureVisibility;
  setFeatureVisible: (feature: FrontendFeatureId, visible: boolean) => void;
};

const normalizeVisibility = (value: unknown): FrontendFeatureVisibility => {
  const candidate =
    value && typeof value === 'object'
      ? (value as Partial<Record<FrontendFeatureId, unknown>>)
      : {};

  return {
    codexAgentIdentityConversion:
      typeof candidate.codexAgentIdentityConversion === 'boolean'
        ? candidate.codexAgentIdentityConversion
        : DEFAULT_FRONTEND_FEATURE_VISIBILITY.codexAgentIdentityConversion,
  };
};

export const useFrontendFeatureStore = create<FrontendFeatureState>()(
  persist(
    (set) => ({
      visibility: { ...DEFAULT_FRONTEND_FEATURE_VISIBILITY },
      setFeatureVisible: (feature, visible) =>
        set((state) => ({
          visibility: {
            ...state.visibility,
            [feature]: visible,
          },
        })),
    }),
    {
      name: FRONTEND_FEATURE_VISIBILITY_STORAGE_KEY,
      partialize: (state) => ({ visibility: state.visibility }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<FrontendFeatureState> | undefined;
        return {
          ...currentState,
          visibility: normalizeVisibility(persisted?.visibility),
        };
      },
    }
  )
);
