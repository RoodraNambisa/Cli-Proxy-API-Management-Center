import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ConfigPage } from '@/pages/ConfigPage';

const harness = vi.hoisted(() => ({
  visualDirty: false,
  releaseDirty: false,
  auditDirty: false,
  importDirty: false,
  accountInfoDirty: false,
  loginProxyDirty: false,
  sentinelDirty: false,
  usageCacheDirty: false,
  mergedYaml: 'request-retry: 1\n',
  fetchYaml: vi.fn(),
  saveYaml: vi.fn(),
  applyVisualChanges: vi.fn(),
  loadVisualValues: vi.fn(),
  releaseSave: vi.fn(),
  releaseReload: vi.fn(),
  auditSave: vi.fn(),
  auditReload: vi.fn(),
  importSave: vi.fn(),
  importReload: vi.fn(),
  accountInfoSave: vi.fn(),
  accountInfoReload: vi.fn(),
  loginProxySave: vi.fn(),
  loginProxyReload: vi.fn(),
  sentinelSave: vi.fn(),
  sentinelReload: vi.fn(),
  usageCacheSave: vi.fn(),
  usageCacheReload: vi.fn(),
  showNotification: vi.fn(),
  showConfirmation: vi.fn(),
  clearConfigCache: vi.fn(),
  fetchSharedConfig: vi.fn(),
  translate: vi.fn(),
  pageTransitionLayer: null as { isCurrentLayer: boolean } | null,
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: harness.translate }),
  };
});

vi.mock('@/components/common/PageTransitionLayer', () => ({
  usePageTransitionLayer: () => harness.pageTransitionLayer,
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}));

vi.mock('@/hooks/useVisualConfig', () => ({
  useVisualConfig: () => ({
    visualValues: {},
    baselineValues: {},
    visualDirty: harness.visualDirty,
    visualDirtyFields: [],
    visualParseError: '',
    visualValidationErrors: {},
    visualCodexCustomModelValidationErrors: [],
    visualHasCodexCustomModelValidationErrors: false,
    visualHasPayloadValidationErrors: false,
    loadVisualValuesFromYaml: harness.loadVisualValues,
    applyVisualChangesToYaml: harness.applyVisualChanges,
    setVisualValues: vi.fn(),
  }),
}));

vi.mock('@/services/api/configFile', () => ({
  configFileApi: {
    fetchConfigYaml: harness.fetchYaml,
    saveConfigYaml: harness.saveYaml,
  },
}));

vi.mock('@/stores', () => {
  const useConfigStore = Object.assign(() => undefined, {
    getState: () => ({
      clearCache: harness.clearConfigCache,
      fetchConfig: harness.fetchSharedConfig,
    }),
  });

  return {
    useNotificationStore: (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        showNotification: harness.showNotification,
        showConfirmation: harness.showConfirmation,
      }),
    useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ connectionStatus: 'connected' }),
    useThemeStore: (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ resolvedTheme: 'light' }),
    useConfigStore,
  };
});

vi.mock('@/components/config/VisualConfigEditor', async () => {
  const React = await import('react');
  return {
    VisualConfigEditor: ({
      renderRequestBodyPanels,
      renderChatGptWebSentinel,
    }: {
      renderRequestBodyPanels?: (options: { focusTarget?: string }) => React.ReactNode;
      renderChatGptWebSentinel?: (options: {
        active: boolean;
        focusTarget?: string;
      }) => React.ReactNode;
    }) => (
      <div>
        {renderRequestBodyPanels?.({})}
        {renderChatGptWebSentinel?.({ active: true })}
      </div>
    ),
  };
});

vi.mock('@/components/config/RequestBodyReleaseCard', async () => {
  const React = await import('react');
  type Props = {
    active?: boolean;
    onDirtyChange?: (dirty: boolean) => void;
    onErrorCountChange?: (count: number) => void;
  };
  type Handle = {
    save: () => Promise<boolean>;
    reload: () => Promise<void>;
    reset: () => void;
    validate: () => boolean;
  };

  return {
    RequestBodyReleaseCard: React.forwardRef<Handle, Props>(function MockReleaseCard(
      { onDirtyChange, onErrorCountChange },
      ref
    ) {
      React.useEffect(() => {
        onDirtyChange?.(harness.releaseDirty);
        onErrorCountChange?.(0);
      }, [onDirtyChange, onErrorCountChange]);
      React.useImperativeHandle(
        ref,
        () => ({
          save: async () => {
            const success = (await harness.releaseSave()) !== false;
            if (success) onDirtyChange?.(false);
            return success;
          },
          reload: async () => {
            await harness.releaseReload();
          },
          reset: vi.fn(),
          validate: () => true,
        }),
        [onDirtyChange]
      );
      return <div>release-panel</div>;
    }),
  };
});

vi.mock('@/components/config/RequestBodyAuditCard', async () => {
  const React = await import('react');
  type Props = {
    onDirtyChange?: (dirty: boolean) => void;
    onErrorCountChange?: (count: number) => void;
  };
  type Handle = {
    save: () => Promise<boolean>;
    reload: () => Promise<void>;
    reset: () => void;
    validate: () => boolean;
  };

  return {
    RequestBodyAuditCard: React.forwardRef<Handle, Props>(function MockAuditCard(
      { onDirtyChange, onErrorCountChange },
      ref
    ) {
      React.useEffect(() => {
        onDirtyChange?.(harness.auditDirty);
        onErrorCountChange?.(0);
      }, [onDirtyChange, onErrorCountChange]);
      React.useImperativeHandle(
        ref,
        () => ({
          save: async () => {
            const success = (await harness.auditSave()) !== false;
            if (success) onDirtyChange?.(false);
            return success;
          },
          reload: async () => {
            await harness.auditReload();
          },
          reset: vi.fn(),
          validate: () => true,
        }),
        [onDirtyChange]
      );
      return <div>audit-panel</div>;
    }),
  };
});

vi.mock('@/features/chatgptWeb/components/ChatGptWebSentinelPanel', async () => {
  const React = await import('react');
  type Props = {
    onDirtyChange?: (dirty: boolean) => void;
    onErrorCountChange?: (count: number) => void;
  };
  type Handle = {
    save: () => Promise<boolean>;
    reload: () => Promise<void>;
    reset: () => void;
    validate: () => boolean;
  };

  return {
    ChatGptWebSentinelPanel: React.forwardRef<Handle, Props>(function MockSentinelPanel(
      { onDirtyChange, onErrorCountChange },
      ref
    ) {
      React.useEffect(() => {
        onDirtyChange?.(harness.sentinelDirty);
        onErrorCountChange?.(0);
      }, [onDirtyChange, onErrorCountChange]);
      React.useImperativeHandle(
        ref,
        () => ({
          save: async () => {
            const success = (await harness.sentinelSave()) !== false;
            if (success) onDirtyChange?.(false);
            return success;
          },
          reload: async () => {
            await harness.sentinelReload();
          },
          reset: vi.fn(),
          validate: () => true,
        }),
        [onDirtyChange]
      );
      return <div>sentinel-panel</div>;
    }),
  };
});

vi.mock('@/features/chatgptWeb/components/ChatGptWebImportPanel', async () => {
  const React = await import('react');
  type Props = {
    active?: boolean;
    onDirtyChange?: (dirty: boolean) => void;
    onErrorCountChange?: (count: number) => void;
  };
  type Handle = {
    save: () => Promise<boolean>;
    reload: () => Promise<void>;
    reset: () => void;
    validate: () => boolean;
  };

  return {
    ChatGptWebImportPanel: React.forwardRef<Handle, Props>(function MockImportPanel(
      { active, onDirtyChange, onErrorCountChange },
      ref
    ) {
      React.useEffect(() => {
        onDirtyChange?.(harness.importDirty);
        onErrorCountChange?.(0);
      }, [onDirtyChange, onErrorCountChange]);
      React.useImperativeHandle(
        ref,
        () => ({
          save: async () => {
            const success = (await harness.importSave()) !== false;
            if (success) onDirtyChange?.(false);
            return success;
          },
          reload: async () => {
            await harness.importReload();
          },
          reset: vi.fn(),
          validate: () => true,
        }),
        [onDirtyChange]
      );
      return (
        <div data-testid="import-panel" data-active={String(active)}>
          import-panel
        </div>
      );
    }),
  };
});

vi.mock('@/features/chatgptWeb/components/ChatGptWebAccountInfoPanel', async () => {
  const React = await import('react');
  type Props = {
    onDirtyChange?: (dirty: boolean) => void;
    onErrorCountChange?: (count: number) => void;
  };
  type Handle = {
    save: () => Promise<boolean>;
    reload: () => Promise<void>;
    reset: () => void;
    validate: () => boolean;
  };

  return {
    ChatGptWebAccountInfoPanel: React.forwardRef<Handle, Props>(function MockAccountInfoPanel(
      { active, onDirtyChange, onErrorCountChange },
      ref
    ) {
      React.useEffect(() => {
        onDirtyChange?.(harness.accountInfoDirty);
        onErrorCountChange?.(0);
      }, [onDirtyChange, onErrorCountChange]);
      React.useImperativeHandle(
        ref,
        () => ({
          save: async () => {
            const success = (await harness.accountInfoSave()) !== false;
            if (success) onDirtyChange?.(false);
            return success;
          },
          reload: async () => {
            await harness.accountInfoReload();
          },
          reset: vi.fn(),
          validate: () => true,
        }),
        [onDirtyChange]
      );
      return (
        <div data-testid="account-info-panel" data-active={String(active)}>
          account-info-panel
        </div>
      );
    }),
  };
});

vi.mock('@/features/chatgptWeb/components/ChatGptWebUsageCachePanel', async () => {
  const React = await import('react');
  type Props = {
    onDirtyChange?: (dirty: boolean) => void;
    onErrorCountChange?: (count: number) => void;
  };
  type Handle = {
    save: () => Promise<boolean>;
    reload: () => Promise<void>;
    reset: () => void;
    validate: () => boolean;
  };

  return {
    ChatGptWebUsageCachePanel: React.forwardRef<Handle, Props>(function MockUsageCachePanel(
      { onDirtyChange, onErrorCountChange },
      ref
    ) {
      React.useEffect(() => {
        onDirtyChange?.(harness.usageCacheDirty);
        onErrorCountChange?.(0);
      }, [onDirtyChange, onErrorCountChange]);
      React.useImperativeHandle(
        ref,
        () => ({
          save: async () => {
            const success = (await harness.usageCacheSave()) !== false;
            if (success) onDirtyChange?.(false);
            return success;
          },
          reload: async () => {
            await harness.usageCacheReload();
          },
          reset: vi.fn(),
          validate: () => true,
        }),
        [onDirtyChange]
      );
      return <div>usage-cache-panel</div>;
    }),
  };
});

vi.mock('@/features/chatgptWeb/components/ChatGptWebLoginProxyPanel', async () => {
  const React = await import('react');
  type Props = {
    onDirtyChange?: (dirty: boolean) => void;
    onErrorCountChange?: (count: number) => void;
  };
  type Handle = {
    save: () => Promise<boolean>;
    reload: () => Promise<void>;
    reset: () => void;
    validate: () => boolean;
  };

  return {
    ChatGptWebLoginProxyPanel: React.forwardRef<Handle, Props>(function MockLoginProxyPanel(
      { onDirtyChange, onErrorCountChange },
      ref
    ) {
      React.useEffect(() => {
        onDirtyChange?.(harness.loginProxyDirty);
        onErrorCountChange?.(0);
      }, [onDirtyChange, onErrorCountChange]);
      React.useImperativeHandle(
        ref,
        () => ({
          save: async () => {
            const success = (await harness.loginProxySave()) !== false;
            if (success) onDirtyChange?.(false);
            return success;
          },
          reload: async () => {
            await harness.loginProxyReload();
          },
          reset: vi.fn(),
          validate: () => true,
        }),
        [onDirtyChange]
      );
      return <div>login-proxy-panel</div>;
    }),
  };
});

vi.mock('@/components/config/DiffModal', () => ({
  DiffModal: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? (
      <button type="button" onClick={onConfirm}>
        confirm-diff
      </button>
    ) : null,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/config']}>
      <ConfigPage />
    </MemoryRouter>
  );
}

async function clickSave() {
  const saveButton = screen.getByRole('button', { name: 'config_management.save' });
  await waitFor(() => expect(saveButton.hasAttribute('disabled')).toBe(false));
  fireEvent.click(saveButton);
}

describe('ConfigPage save coordination', () => {
  beforeEach(() => {
    localStorage.clear();
    harness.visualDirty = false;
    harness.releaseDirty = false;
    harness.auditDirty = false;
    harness.importDirty = false;
    harness.accountInfoDirty = false;
    harness.loginProxyDirty = false;
    harness.sentinelDirty = false;
    harness.usageCacheDirty = false;
    harness.pageTransitionLayer = null;
    harness.mergedYaml = 'request-retry: 1\n';
    for (const mock of Object.values(harness)) {
      if (typeof mock === 'function' && 'mockReset' in mock) mock.mockReset();
    }
    harness.fetchYaml.mockResolvedValue('request-retry: 0\n');
    harness.saveYaml.mockResolvedValue(undefined);
    harness.applyVisualChanges.mockImplementation(() => harness.mergedYaml);
    harness.loadVisualValues.mockReturnValue({ ok: true });
    harness.releaseSave.mockResolvedValue(true);
    harness.releaseReload.mockResolvedValue(undefined);
    harness.auditSave.mockResolvedValue(true);
    harness.auditReload.mockResolvedValue(undefined);
    harness.importSave.mockResolvedValue(true);
    harness.importReload.mockResolvedValue(undefined);
    harness.accountInfoSave.mockResolvedValue(true);
    harness.accountInfoReload.mockResolvedValue(undefined);
    harness.loginProxySave.mockResolvedValue(true);
    harness.loginProxyReload.mockResolvedValue(undefined);
    harness.sentinelSave.mockResolvedValue(true);
    harness.sentinelReload.mockResolvedValue(undefined);
    harness.usageCacheSave.mockResolvedValue(true);
    harness.usageCacheReload.mockResolvedValue(undefined);
    harness.fetchSharedConfig.mockResolvedValue(undefined);
    harness.translate.mockImplementation((key: string) => key);
  });

  test('refreshes the YAML snapshot after a sidecar-only save', async () => {
    harness.releaseDirty = true;
    harness.fetchYaml
      .mockResolvedValueOnce('request-retry: 0\n')
      .mockResolvedValueOnce('request-body-release:\n  enable: true\n');

    renderPage();
    await clickSave();

    await waitFor(() => expect(harness.fetchYaml).toHaveBeenCalledTimes(2));
    expect(harness.fetchYaml.mock.invocationCallOrder[1]).toBeGreaterThan(
      harness.releaseSave.mock.invocationCallOrder[0]
    );
    expect(harness.loadVisualValues).toHaveBeenLastCalledWith(
      'request-body-release:\n  enable: true\n'
    );
  });

  test('saves Sentinel through the unified sidecar flow and refreshes YAML', async () => {
    harness.sentinelDirty = true;
    harness.fetchYaml
      .mockResolvedValueOnce('chatgpt-web: {}\n')
      .mockResolvedValueOnce('chatgpt-web:\n  sentinel:\n    sdk-workers: 4\n');

    renderPage();
    await clickSave();

    await waitFor(() => expect(harness.sentinelSave).toHaveBeenCalledTimes(1));
    expect(harness.saveYaml).not.toHaveBeenCalled();
    expect(harness.loadVisualValues).toHaveBeenLastCalledWith(
      'chatgpt-web:\n  sentinel:\n    sdk-workers: 4\n'
    );
  });

  test('saves ChatGPT Web import settings through the unified sidecar flow', async () => {
    harness.importDirty = true;
    harness.fetchYaml
      .mockResolvedValueOnce('chatgpt-web: {}\n')
      .mockResolvedValueOnce('chatgpt-web:\n  import:\n    workers: 8\n');

    renderPage();
    await clickSave();

    await waitFor(() => expect(harness.importSave).toHaveBeenCalledTimes(1));
    expect(harness.saveYaml).not.toHaveBeenCalled();
    expect(harness.loadVisualValues).toHaveBeenLastCalledWith(
      'chatgpt-web:\n  import:\n    workers: 8\n'
    );
  });

  test('saves ChatGPT Web account info through the unified sidecar flow', async () => {
    harness.accountInfoDirty = true;
    harness.fetchYaml
      .mockResolvedValueOnce('chatgpt-web: {}\n')
      .mockResolvedValueOnce('chatgpt-web:\n  account-info:\n    refresh-workers: 6\n');

    renderPage();
    await clickSave();

    await waitFor(() => expect(harness.accountInfoSave).toHaveBeenCalledTimes(1));
    expect(harness.saveYaml).not.toHaveBeenCalled();
    expect(harness.loadVisualValues).toHaveBeenLastCalledWith(
      'chatgpt-web:\n  account-info:\n    refresh-workers: 6\n'
    );
  });

  test('deactivates account-info polling outside the visible current visual layer', async () => {
    const firstRender = renderPage();
    const accountInfoPanel = await screen.findByTestId('account-info-panel');
    expect(accountInfoPanel.getAttribute('data-active')).toBe('true');

    const sourceTab = screen.getByRole('button', { name: 'config_management.tabs.source' });
    await waitFor(() => expect(sourceTab.hasAttribute('disabled')).toBe(false));
    fireEvent.click(sourceTab);
    await waitFor(() => expect(accountInfoPanel.getAttribute('data-active')).toBe('false'));
    firstRender.unmount();

    localStorage.setItem('config-management:tab', 'visual');
    harness.pageTransitionLayer = { isCurrentLayer: false };
    renderPage();
    expect((await screen.findByTestId('account-info-panel')).getAttribute('data-active')).toBe(
      'false'
    );
  });

  test('saves ChatGPT Web usage cache through the unified sidecar flow', async () => {
    harness.usageCacheDirty = true;
    harness.fetchYaml
      .mockResolvedValueOnce('chatgpt-web: {}\n')
      .mockResolvedValueOnce('chatgpt-web:\n  estimate-token-usage: true\n');

    renderPage();
    await clickSave();

    await waitFor(() => expect(harness.usageCacheSave).toHaveBeenCalledTimes(1));
    expect(harness.saveYaml).not.toHaveBeenCalled();
    expect(harness.loadVisualValues).toHaveBeenLastCalledWith(
      'chatgpt-web:\n  estimate-token-usage: true\n'
    );
  });

  test('saves the ChatGPT Web login proxy through the unified sidecar flow', async () => {
    harness.loginProxyDirty = true;
    harness.fetchYaml
      .mockResolvedValueOnce('chatgpt-web: {}\n')
      .mockResolvedValueOnce('chatgpt-web:\n  login-proxy:\n    enabled: true\n');

    renderPage();
    await clickSave();

    await waitFor(() => expect(harness.loginProxySave).toHaveBeenCalledTimes(1));
    expect(harness.saveYaml).not.toHaveBeenCalled();
    expect(harness.loadVisualValues).toHaveBeenLastCalledWith(
      'chatgpt-web:\n  login-proxy:\n    enabled: true\n'
    );
  });

  test('reloads clean request-body panels after saving YAML', async () => {
    harness.visualDirty = true;
    harness.fetchYaml
      .mockResolvedValueOnce('request-retry: 0\n')
      .mockResolvedValueOnce('request-retry: 0\n')
      .mockResolvedValueOnce('request-retry: 1\n');

    renderPage();
    await clickSave();
    fireEvent.click(await screen.findByRole('button', { name: 'confirm-diff' }));

    await waitFor(() => expect(harness.fetchYaml).toHaveBeenCalledTimes(3));
    expect(harness.releaseReload).toHaveBeenCalledTimes(1);
    expect(harness.auditReload).toHaveBeenCalledTimes(1);
    expect(harness.accountInfoReload).toHaveBeenCalledTimes(1);
    expect(harness.loginProxyReload).toHaveBeenCalledTimes(1);
    expect(harness.sentinelReload).toHaveBeenCalledTimes(1);
    expect(harness.usageCacheReload).toHaveBeenCalledTimes(1);
    expect(harness.releaseReload.mock.invocationCallOrder[0]).toBeGreaterThan(
      harness.saveYaml.mock.invocationCallOrder[0]
    );
    expect(harness.loadVisualValues).toHaveBeenLastCalledWith('request-retry: 1\n');
  });

  test('preserves a failed request-body draft while refreshing clean panels', async () => {
    harness.visualDirty = true;
    harness.releaseDirty = true;
    harness.releaseSave.mockResolvedValue(false);
    harness.fetchYaml
      .mockResolvedValueOnce('request-retry: 0\n')
      .mockResolvedValueOnce('request-retry: 0\n')
      .mockResolvedValueOnce('request-retry: 1\n');

    renderPage();
    await clickSave();
    fireEvent.click(await screen.findByRole('button', { name: 'confirm-diff' }));

    await waitFor(() => expect(harness.fetchYaml).toHaveBeenCalledTimes(3));
    expect(harness.releaseReload).not.toHaveBeenCalled();
    expect(harness.auditReload).toHaveBeenCalledTimes(1);
    expect(harness.showNotification).toHaveBeenCalledWith(
      'config_management.settings_center.partial_save',
      'warning'
    );
  });

  test('uses a sidecar-only partial-save message when YAML was not saved', async () => {
    harness.releaseDirty = true;
    harness.auditDirty = true;
    harness.auditSave.mockResolvedValue(false);

    renderPage();
    await clickSave();

    await waitFor(() =>
      expect(harness.showNotification).toHaveBeenCalledWith(
        'config_management.settings_center.sidecar_partial_save',
        'warning'
      )
    );
    expect(harness.showNotification).not.toHaveBeenCalledWith(
      'config_management.settings_center.partial_save',
      'warning'
    );
  });
});
