import { expect, test } from 'vitest';
import { parseLiveLogEvent, parseLogLine } from './logParsing';

test('reads HTTP status from provider attempt fields in file logs', () => {
  const line = parseLogLine(
    '[2026-09-13 04:00:00] [a5c2bae8] [warn] [usage_failure.go:166] provider request attempt failed: quota exceeded request_id="a5c2bae8" provider=codex auth_name="fixture.json" auth_index=abc stage=upstream code=http_429 status=429'
  );
  expect(line).toMatchObject({
    requestId: 'a5c2bae8',
    statusCode: 429,
    authName: 'fixture.json',
    authIndex: 'abc',
    provider: 'codex',
    level: 'warn',
  });
});

test('parses nanosecond timestamps without shifting request ID or warning level', () => {
  const line = parseLogLine(
    '[2026-09-12T19:46:37.274802484Z] [c2a5d4cb] [warning] [codex] · HTTP 429 · failed: {"error":"limit"} · auth=888801c7d37b38ae'
  );
  expect(line).toMatchObject({
    timestamp: '2026-09-12T19:46:37.274802484Z',
    requestId: 'c2a5d4cb',
    level: 'warn',
    statusCode: 429,
    authIndex: '888801c7d37b38ae',
  });
  expect(line.message).not.toContain('802484Z]');
});

test('uses structured live metadata even when a response imitates log fields', () => {
  const line = parseLiveLogEvent({
    cursor: 1,
    timestamp: '2026-09-12T19:46:37.274802484Z',
    request_id: 'req-local-full-id',
    level: 'warning',
    provider: 'codex',
    auth_index: 'real-index',
    auth_name: 'real account.json',
    status: 429,
    message: 'HTTP 500 GET /wrong auth_index=wrong error',
    response_body: '{"error":"fixture"}',
  });
  expect(line).toMatchObject({
    requestId: 'req-local-full-id',
    authIndex: 'real-index',
    authName: 'real account.json',
    level: 'warn',
    statusCode: 429,
  });
  expect(line.method).toBeUndefined();
  expect(line.path).toBeUndefined();
  expect(line.raw).toContain('auth_name="real account.json"');
});

test('keeps access log status and path when rendering a live event', () => {
  const line = parseLiveLogEvent({
    cursor: 2,
    timestamp: '2026-09-12T19:46:42Z',
    level: 'info',
    message: '200 | 1.421s | 10.42.0.22 | POST "/v1/chat/completions"',
    status: 200,
    method: 'POST',
    path: '/v1/chat/completions',
    request_id: 'da17979d',
  });
  expect(line).toMatchObject({
    statusCode: 200,
    latency: '1.421s',
    ip: '10.42.0.22',
    method: 'POST',
    path: '/v1/chat/completions',
    message: '',
  });
});

test('reads quoted credential names from console logs without losing legacy status', () => {
  const line = parseLogLine(
    '[2026-09-13 03:44:23] [a5c2bae8] [error] [gin_logger.go:108] 500 | 1ms | 10.42.0.22 | POST "/v1/chat/completions" | error_status=500 code="overloaded" auth_name="my account.json" auth_index=abc'
  );
  expect(line).toMatchObject({
    requestId: 'a5c2bae8',
    statusCode: 500,
    path: '/v1/chat/completions',
    authName: 'my account.json',
    authIndex: 'abc',
    code: 'overloaded',
  });
});
