import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';
import { formatLiveLogEvent, parseSseMessage, streamLiveLogs } from './liveLogs';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('live log SSE parsing', () => {
  it('parses named JSON events with an id', () => {
    expect(parseSseMessage('id: 42\nevent: log\ndata: {"message":"ok"}')).toEqual({
      id: '42',
      event: 'log',
      data: '{"message":"ok"}',
    });
  });

  it('ignores heartbeat comments', () => {
    expect(parseSseMessage(': heartbeat')).toBeNull();
  });

  it('formats safe diagnostic fields for the existing log viewer', () => {
    const line = formatLiveLogEvent({
      cursor: 7,
      timestamp: '2026-08-07T12:00:00Z',
      level: 'error',
      message: 'upstream request failed',
      provider: 'chatgpt-web',
      stage: 'file_sign',
      code: 'cloudflare_challenge',
      status: 403,
      cloudflare: true,
      response_body: '{"error":{"message":"raw upstream detail"}}',
      response_body_truncated: true,
    });
    expect(line).toContain('HTTP 403');
    expect(line).toContain('stage=file_sign');
    expect(line).toContain('code=cloudflare_challenge');
    expect(line).toContain(
      'response_body="{\\"error\\":{\\"message\\":\\"raw upstream detail\\"}}"'
    );
    expect(line).toContain('[truncated]');
  });

  it('uses an authenticated header and keeps the management key out of the stream URL', async () => {
    vi.spyOn(apiClient, 'captureConnection').mockReturnValue({
      apiBase: 'https://example.test/v0/management',
      managementKey: 'management-secret',
      timeout: 1000,
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          'id: 9\nevent: log\ndata: {"cursor":9,"timestamp":"now","level":"info","message":"ok"}\n\n' +
            'event: gap\ndata: {"count":2,"from":10,"to":11}\n\n',
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        )
      );
    const events: number[] = [];
    const gaps: number[] = [];

    await streamLiveLogs(
      { provider: 'chatgpt-web', status: '403', hideManagement: true, cursor: 8 },
      {
        onEvent: (event) => events.push(event.cursor),
        onGap: (gap) => gaps.push(gap.count),
      },
      new AbortController().signal
    );

    expect(events).toEqual([9]);
    expect(gaps).toEqual([2]);
    const [input, init] = fetchMock.mock.calls[0];
    const url = new URL(String(input));
    expect(url.searchParams.get('provider')).toBe('chatgpt-web');
    expect(url.searchParams.get('status')).toBe('403');
    expect(url.searchParams.get('hide_management')).toBe('true');
    expect(url.searchParams.get('cursor')).toBe('8');
    expect(url.toString()).not.toContain('management-secret');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer management-secret');
  });

  it('preserves the HTTP status on backend fallback errors', async () => {
    vi.spyOn(apiClient, 'captureConnection').mockReturnValue({
      apiBase: 'https://example.test/v0/management',
      managementKey: 'secret',
      timeout: 1000,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'live logs disabled' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(
      streamLiveLogs(
        {},
        { onEvent: () => undefined, onGap: () => undefined },
        new AbortController().signal
      )
    ).rejects.toMatchObject({ message: 'live logs disabled', status: 503 });
  });
});
