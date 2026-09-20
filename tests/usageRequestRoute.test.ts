import { afterEach, expect, test, vi } from 'vitest';
import { normalizeUsageDetail, useUsageStatsStore } from '@/stores/useUsageStatsStore';
import { collectUsageDetailsWithEndpoint } from '@/utils/usage';
import { normalizeUsageRequestRoute } from '@/utils/usage/requestRoute';
import { buildUsageDetailsQuery } from '@/components/usage/requestDetailsQuery';
import { isTraceableRequestPath } from '@/pages/hooks/useTraceResolver';
import { usageApi } from '@/services/api/usage';

afterEach(() => vi.restoreAllMocks());

test('retains the explicit route independently of the API key grouping', () => {
  const raw = {
    api: 'fixture-client-key',
    model: 'same-model',
    timestamp: '2026-09-20T01:00:00Z',
    request_method: 'POST',
    request_path: '/v1/alpha/search',
    source: 'fixture',
    tokens: {},
  };
  const expected = {
    request_method: 'POST',
    request_path: '/v1/alpha/search',
    __endpoint: 'POST /v1/alpha/search',
    __endpointMethod: 'POST',
    __endpointPath: '/v1/alpha/search',
  };
  expect(normalizeUsageDetail(raw, 0)).toMatchObject(expected);
  expect(
    collectUsageDetailsWithEndpoint({
      apis: { 'fixture-client-key': { models: { 'same-model': { details: [raw] } } } },
    })[0]
  ).toMatchObject(expected);
});

test('uses legacy route metadata without inferring missing paths from model names or keys', () => {
  expect(normalizeUsageRequestRoute({}, 'POST /v1/responses?key=private')).toEqual({
    request_method: 'POST',
    request_path: '/v1/responses',
  });
  expect(
    normalizeUsageRequestRoute({ path: '/v1/chat/completions?key=private', method: 'post' })
  ).toEqual({ request_method: 'POST', request_path: '/v1/chat/completions' });
  expect(normalizeUsageRequestRoute({ model: 'gpt-5.5' }, 'fixture-client-key')).toEqual({});
  expect(
    normalizeUsageDetail({ api: 'fixture-client-key', model: 'gpt-5.5' }, 0).request_path
  ).toBeUndefined();
});

test('sends path filtering to the server with the existing filters', () => {
  expect(
    buildUsageDetailsQuery(
      {
        requestPath: ' /alpha/search ',
        model: 'same-model',
        source: '__all__',
        authIndex: 'auth-a',
        result: 'failed',
      },
      {}
    )
  ).toMatchObject({
    request_path: '/alpha/search',
    model: 'same-model',
    auth_index: 'auth-a',
    failed: true,
  });
});

test('preserves route capability and records through the paginated store', async () => {
  vi.spyOn(usageApi, 'getUsageDetails').mockResolvedValue({
    request_path_supported: true,
    items: [{ api: 'fixture-key', request_method: 'GET', request_path: '/v1/responses' }],
    total: 1,
  });
  const page = await useUsageStatsStore
    .getState()
    .loadUsageDetails({ query: { request_path: '/responses' } });
  expect(page.requestPathSupported).toBe(true);
  expect(page.details[0]).toMatchObject({ request_method: 'GET', request_path: '/v1/responses' });
});

test('makes both search endpoints traceable in the log viewer', () => {
  for (const path of ['/v1/alpha/search', '/backend-api/codex/alpha/search']) {
    expect(isTraceableRequestPath(path)).toBe(true);
    expect(isTraceableRequestPath(path + '?fixture=true')).toBe(true);
  }
  expect(isTraceableRequestPath('/v0/management/usage')).toBe(false);
});
