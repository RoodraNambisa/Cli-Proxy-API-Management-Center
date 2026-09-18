import { describe, expect, it } from 'vitest';
import {
  exportProxyEntries,
  importProxyEntries,
  MAX_PROXY_TRANSFER_LINES,
  PROXY_TRANSFER_FORMATS,
  type ProxyTransferFormat,
} from './proxyTransfer';
import type { ProxyPoolEntry } from '@/types';

const entry = (url: string, ports = '', id = 'node'): ProxyPoolEntry => ({
  id,
  'url-template': url,
  ports,
});
const layouts: [ProxyTransferFormat, string][] = [
  ['host-port-user-pass', '192.0.2.10:8080:user:password'],
  ['port-host-user-pass', '8080:192.0.2.10:user:password'],
  ['pass-port-host-user', 'password:8080:192.0.2.10:user'],
  ['user-pass-host-port', 'user:password@192.0.2.10:8080'],
  ['url', 'socks5://user:password@192.0.2.10:8080'],
];

describe('proxy bulk transfer', () => {
  it.each(layouts)('imports and exports %s', (format, line) => {
    const result = importProxyEntries(line, format, 'socks5');
    expect(result.issues).toEqual([]);
    expect(result.entries).toEqual([
      entry('socks5://user:password@192.0.2.10:8080', '', 'proxy-001'),
    ]);
    expect(exportProxyEntries(result.entries, format)).toEqual({
      text: line,
      count: 1,
      issues: [],
    });
  });

  it('preserves each URL protocol and explicit default ports', () => {
    const result = importProxyEntries(
      'http://user:p@proxy.example:80\nhttps://proxy.example:443\nsocks5h://proxy.example:1080',
      'host-port-user-pass',
      'socks5'
    );
    expect(result.issues).toEqual([]);
    expect(result.entries.map((e) => e['url-template'])).toEqual([
      'http://user:p@proxy.example:80',
      'https://proxy.example:443',
      'socks5h://proxy.example:1080',
    ]);
    expect(exportProxyEntries(result.entries, 'url', 'https').text).toBe(
      'https://proxy.example:443'
    );
    expect(
      exportProxyEntries(
        [...result.entries, entry('socks5://u:********@proxy.example:1080')],
        'url',
        'https'
      ).issues
    ).toEqual([]);
    expect(
      importProxyEntries('http://proxy.example:80\nhttp://010.1.1.1:80', 'url', 'http').entries[1][
        'url-template'
      ]
    ).toBe('http://010.1.1.1:80');
  });

  it.each(PROXY_TRANSFER_FORMATS)(
    'round-trips IPv6, Unicode and reserved password characters in %s',
    (format) => {
      const input = [entry('https://us%40er:p%3A%40%25%2F%3F%23%E5%AF%86@%5Bbad%5D:8443')];
      expect(exportProxyEntries(input, format).issues).not.toHaveLength(0);
      const original = entry('https://us%40er:p%3A%40%25%2F%3F%23%E5%AF%86@[2001:db8::1]:8443');
      const output = exportProxyEntries([original], format);
      expect(output.issues).toEqual([]);
      const imported = importProxyEntries(output.text, format, 'https');
      expect(imported.issues).toEqual([]);
      expect(imported.entries[0]['url-template']).toBe(original['url-template']);
    }
  );

  it('keeps raw percent signs and password colons, slashes and spaces literal', () => {
    for (const [format, line] of [
      ['host-port-user-pass', 'proxy.example:80:user: p://%41:word '],
      ['port-host-user-pass', '80:proxy.example:user: p://%41:word '],
      ['pass-port-host-user', ' p://%41:word :80:proxy.example:user'],
      ['user-pass-host-port', 'user: p://%41:word @proxy.example:80'],
    ] as [ProxyTransferFormat, string][]) {
      const result = importProxyEntries(line, format, 'http');
      expect(result.issues).toEqual([]);
      expect(result.entries[0]['url-template']).toBe(
        'http://user:%20p%3A%2F%2F%2541%3Aword%20@proxy.example:80'
      );
    }
  });

  it('expands and deduplicates port ranges while retaining placeholders', () => {
    const existing = [
      entry('socks5://u-session-{4}:p{2}@proxy.example', '1082,1080-1082', 'PROXY-001'),
    ];
    const exported = exportProxyEntries(existing);
    expect(exported.issues).toEqual([]);
    expect(exported.count).toBe(3);
    expect(exported.text.split('\n')).toEqual(
      [1080, 1081, 1082].map((p) => `socks5://u-session-{4}:p{2}@proxy.example:${p}`)
    );
    const imported = importProxyEntries(
      exported.text + '\nproxy.example:1083:user:pw\nproxy.example:1083:user:pw',
      'host-port-user-pass',
      'socks5',
      existing
    );
    expect(imported.duplicates).toBe(4);
    expect(imported.entries).toEqual([
      entry('socks5://user:pw@proxy.example:1083', '', 'proxy-002'),
    ]);
    for (const format of PROXY_TRANSFER_FORMATS) {
      const copied = exportProxyEntries(existing, format);
      expect(
        importProxyEntries(copied.text, format, 'socks5').entries.map((e) => e['url-template'])
      ).toEqual(exported.text.split('\n'));
    }
  });

  it('does not turn encoded literal braces into dynamic placeholders', () => {
    const original = entry('http://u:p%7B4%7D@proxy.example:80');
    expect(
      importProxyEntries(original['url-template'], 'url', 'http').entries[0]['url-template']
    ).toBe(original['url-template']);
    expect(exportProxyEntries([original]).text).toBe(original['url-template']);
    expect(exportProxyEntries([original], 'host-port-user-pass').issues[0].code).toBe('ambiguous');
    expect(
      exportProxyEntries([entry('http://u%3Ax:pw@proxy.example:80')], 'user-pass-host-port')
        .issues[0].code
    ).toBe('ambiguous');
  });

  it('supports unauthenticated proxies and empty passwords', () => {
    const result = importProxyEntries(
      'proxy.example:1080\nproxy.example:1081:user:',
      'host-port-user-pass',
      'socks5'
    );
    expect(result.issues).toEqual([]);
    expect(result.entries.map((e) => e['url-template'])).toEqual([
      'socks5://proxy.example:1080',
      'socks5://user:@proxy.example:1081',
    ]);
    for (const format of PROXY_TRANSFER_FORMATS) {
      const exported = exportProxyEntries(result.entries, format);
      expect(
        importProxyEntries(exported.text, format, 'socks5').entries.map((e) => e['url-template'])
      ).toEqual(result.entries.map((e) => e['url-template']));
    }
  });

  it('reports original line numbers without embedding credentials in errors', () => {
    const result = importProxyEntries(
      '\nproxy.example:80:user:valid\r\n\r\nproxy.example:0:user:SECRET\nhttp://u:********@proxy.example:80\nftp://u:SECRET@proxy.example:21\nhttp://u:p%0A@proxy.example:80\nhttp://u:pw@proxy.example:80/path',
      'host-port-user-pass',
      'http'
    );
    expect(result.entries).toHaveLength(1);
    expect(result.issues).toEqual([
      { line: 4, code: 'port' },
      { line: 5, code: 'masked' },
      { line: 6, code: 'protocol' },
      { line: 7, code: 'credentials' },
      { line: 8, code: 'format' },
    ]);
    expect(JSON.stringify(result.issues)).not.toContain('SECRET');
  });

  it('bounds input and expanded output and reports invalid ranges', () => {
    expect(
      importProxyEntries('x\n'.repeat(MAX_PROXY_TRANSFER_LINES + 1), 'url', 'http').issues[0].code
    ).toBe('limit');
    expect(exportProxyEntries([entry('http://proxy.example', '1-65535')]).issues[0].code).toBe(
      'limit'
    );
    for (const ports of ['0', '65536', '3-1', '1,,2', 'bad'])
      expect(exportProxyEntries([entry('http://proxy.example', ports)]).issues[0].code).toBe(
        'port'
      );
    expect(exportProxyEntries([entry('', '', '')]).count).toBe(0);
  });
});
