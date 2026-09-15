import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseDocument } from 'yaml';
import { GrokModelRoutingEditor } from '@/components/config/GrokModelRoutingEditor';
import { AuthFilesPrefixProxyEditorModal } from '@/features/authFiles/components/AuthFilesPrefixProxyEditorModal';
import { AuthFileModelsModal } from '@/features/authFiles/components/AuthFileModelsModal';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { authFilesApi } from '@/services/api/authFiles';
import { readGrokConfig, writeGrokConfig } from '@/utils/grokConfig';
import {
  emptyGrokModelRouting,
  grokModelRoutingError,
  serializeGrokModelRoutes,
} from '@/utils/grokModelRouting';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

function RoutingHarness() {
  const [value, onChange] = useState(emptyGrokModelRouting());
  return (
    <>
      <GrokModelRoutingEditor value={value} onChange={onChange} />
      <output>{JSON.stringify(value)}</output>
    </>
  );
}
const file = { name: 'grok-routes.json', type: 'xai' };
function CredentialHarness() {
  const state = useAuthFilesPrefixProxyEditor({
    disableControls: false,
    loadFiles: async () => {},
  });
  return (
    <>
      <button onClick={() => void state.openPrefixProxyEditor(file)}>open</button>
      <AuthFilesPrefixProxyEditorModal
        disableControls={false}
        editor={state.prefixProxyEditor}
        updatedText={state.prefixProxyUpdatedText}
        dirty={state.prefixProxyDirty}
        onClose={state.closePrefixProxyEditor}
        onCopyText={() => {}}
        onSave={() => void state.handlePrefixProxySave()}
        onChange={state.handlePrefixProxyChange}
      />
    </>
  );
}

describe('Grok model catalogs and routes', () => {
  it('round-trips global routes without rewriting inherited sources or unknown fields', () => {
    const doc = parseDocument(
      'xai:\n  model-catalog-sources: &sources [cli, api]\n  future-sources: *sources\n  model-routes:\n    - models: [grok-4.3]\n      upstream: api\n  future: kept\n'
    );
    const baseline = readGrokConfig(doc.toJS().xai);
    writeGrokConfig(
      doc,
      {
        ...baseline,
        routing: {
          ...baseline.routing,
          modelRoutes: [{ models: 'grok-4.3, grok-4.6', upstream: 'us-east-1' }],
        },
      },
      baseline
    );
    expect(doc.toJS().xai).toMatchObject({
      'model-catalog-sources': ['cli', 'api'],
      'future-sources': ['cli', 'api'],
      future: 'kept',
      'model-routes': [{ models: ['grok-4.3', 'grok-4.6'], upstream: 'us-east-1' }],
    });
    const updated = readGrokConfig(doc.toJS().xai);
    writeGrokConfig(doc, { ...updated, routing: emptyGrokModelRouting() }, updated);
    expect(doc.toJS().xai['model-routes']).toEqual([]);
    expect(doc.toJS().xai['model-catalog-sources']).toEqual([]);
    expect(doc.toJS().xai['future-sources']).toEqual(['cli', 'api']);
  });

  it('edits compact source and route lists and validates custom destinations', () => {
    render(<RoutingHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'grok_routing.merge_cli_api' }));
    fireEvent.click(screen.getByRole('button', { name: 'grok_routing.route_preset' }));
    const first = screen.getByRole('textbox', { name: 'grok_routing.model_pattern 1' });
    fireEvent.change(first, { target: { value: 'grok-4.5, grok-4.6, grok-4.3' } });
    expect(
      JSON.parse(screen.getByRole('status').textContent ?? '{}').modelRoutes[0].models
    ).toContain('grok-4.3');
    fireEvent.click(screen.getByRole('button', { name: 'grok_routing.route_node 1' }));
    fireEvent.click(screen.getByRole('option', { name: 'grok_upstream.modes.custom' }));
    const url = screen.getByRole('textbox', { name: 'grok_routing.route_node 1 URL' });
    fireEvent.change(url, { target: { value: 'https://user:secret@relay.example/v1' } });
    expect(screen.getByRole('alert').textContent).toBe('grok_routing.invalid_routes');
    fireEvent.change(url, { target: { value: 'https://relay.example/v1' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('saves only credential routing overrides and can restore inheritance', async () => {
    const stored = {
      type: 'xai',
      access_token: 'fixture-private',
      xai_identity_seed: 'seed-fixture',
      base_url: 'https://cli-chat-proxy.grok.com/v1',
    };
    vi.spyOn(authFilesApi, 'downloadText').mockResolvedValue(JSON.stringify(stored));
    const save = vi
      .spyOn(authFilesApi, 'patchFieldsBatch')
      .mockResolvedValue({ status: 'ok', matched: 1, updated: 1, files: [file.name], failed: [] });
    render(<CredentialHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    fireEvent.click(await screen.findByRole('button', { name: /grok_routing.title/ }));
    fireEvent.click(screen.getByRole('button', { name: 'grok_routing.merge_cli_api' }));
    fireEvent.click(screen.getByRole('button', { name: 'grok_routing.route_preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const patch = save.mock.calls[0][1];
    expect(patch).toEqual({
      xai_model_catalog_sources: ['cli', 'api'],
      xai_model_routes: [
        { models: ['grok-4.5', 'grok-4.6'], upstream: 'cli' },
        { models: ['*'], upstream: 'api' },
      ],
    });
    vi.mocked(authFilesApi.downloadText).mockResolvedValue(JSON.stringify({ ...stored, ...patch }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'common.save' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    const reset = await screen.findByRole('button', { name: 'grok_routing.reset_account' });
    fireEvent.click(reset);
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][1]).toEqual({ xai_model_catalog_sources: [], xai_model_routes: [] });
  });

  it('shows each catalog failure separately from the selected model route', () => {
    render(
      <AuthFileModelsModal
        open
        fileName={file.name}
        fileType="xai"
        loading={false}
        error={null}
        loadedAtMs={Date.now()}
        excluded={{}}
        onClose={() => {}}
        onCopyText={() => {}}
        models={[
          {
            id: 'grok-4.6',
            upstream_url: 'https://api.x.ai/v1',
            upstream_source: 'credential-rule',
            catalog_sources: [
              'https://cli-chat-proxy.grok.com/v1/models',
              'https://api.x.ai/v1/models',
            ],
          },
        ]}
        catalogInfo={{
          source: 'merged',
          updated_at: '2026-09-15T08:00:00Z',
          using_cached: true,
          sources: [
            {
              source: 'https://api.x.ai/v1/models',
              updated_at: '2026-09-14T08:00:00Z',
              using_cached: true,
              model_count: 12,
              error: 'HTTP 503',
            },
            {
              source: 'https://cli-chat-proxy.grok.com/v1/models',
              updated_at: '2026-09-15T08:00:00Z',
              using_cached: false,
              model_count: 2,
            },
          ],
        }}
      />
    );
    expect(screen.getAllByText('grok-4.6')).toHaveLength(1);
    expect(screen.getByText('grok_routing.source_cached')).toBeTruthy();
    expect(screen.getByText('grok_routing.source_fresh')).toBeTruthy();
    expect(screen.getByText(/grok_routing.origin_credential-rule/)).toBeTruthy();
    expect(screen.getByText('HTTP 503')).toBeTruthy();
  });

  it('validates bounds and preserves comma-separated input until serialization', () => {
    const draft = {
      catalogSources: ['api'],
      modelRoutes: [{ models: 'grok-4.3, grok-4.3, grok-*', upstream: ' API ' }],
    };
    expect(serializeGrokModelRoutes(draft)).toEqual([
      { models: ['grok-4.3', 'grok-*'], upstream: 'api' },
    ]);
    expect(grokModelRoutingError(draft)).toBeNull();
    expect(grokModelRoutingError({ ...draft, catalogSources: Array(9).fill('api') })).toBe(
      'sources'
    );
    expect(
      grokModelRoutingError({ ...draft, modelRoutes: [{ models: 'grok-?', upstream: 'api' }] })
    ).toBe('routes');
  });
});
