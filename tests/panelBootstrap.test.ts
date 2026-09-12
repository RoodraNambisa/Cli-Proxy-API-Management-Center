import html from '../index.html?raw';
import { describe, expect, test } from 'vitest';
import { movePanelAssetsAfterShell } from '../build/panelBootstrap';

describe('single-file management bootstrap', () => {
  test('paints the shell before bulk assets while preserving their contents and order', () => {
    const script = '<script type="module">const html = "</head></body>";start();</script>';
    const css = '<style>.app { color:red }</style>';
    const critical = '<style id="management-bootstrap-style">.boot{color:blue}</style>';
    const early = '<script>localizeBoot();</script>';
    const source = `<html><head>${critical}${script}${css}</head><body><div id="root">Loading</div>${early}</body></html>`;
    const result = movePanelAssetsAfterShell(source);
    const root = result.indexOf('id="root"');
    expect(result.indexOf(critical)).toBeLessThan(root);
    expect(result.indexOf(css)).toBeGreaterThan(root);
    expect(result.indexOf(script)).toBeGreaterThan(result.indexOf(css));
    expect(result.indexOf(early)).toBeLessThan(result.indexOf(css));
    expect(result.match(/start\(\)/g)).toHaveLength(1);
  });

  test('keeps a usable, localized initial shell without the app bundle', () => {
    const prefix = html.slice(0, html.indexOf('<script type="module"'));
    const parsed = new DOMParser().parseFromString(prefix, 'text/html');
    expect(parsed.querySelector('#root [role="status"]')).not.toBeNull();
    expect(parsed.querySelector('#management-bootstrap-message')?.textContent).toContain('加载');
    expect(prefix).toContain('Loading management panel');
    expect(prefix).toContain('正在載入');
    expect(prefix).toContain('Загрузка');
    expect(prefix).toContain('prefers-reduced-motion');
    expect(prefix.length).toBeLessThan(8192);
  });
});
