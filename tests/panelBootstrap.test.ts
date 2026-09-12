import html from '../index.html?raw';
import { afterEach, describe, expect, test, vi } from 'vitest';
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
    expect(result.indexOf('dispatchEvent(new Event("management-assets-ready"))')).toBeGreaterThan(result.indexOf(script));
    expect(result.match(/start\(\)/g)).toHaveLength(1);
  });

  test('keeps a usable, localized initial shell without the app bundle', () => {
    const prefix = html.slice(0, html.indexOf('<script type="module"'));
    const parsed = new DOMParser().parseFromString(prefix, 'text/html');
    expect(parsed.querySelector('#root [role="status"]')).not.toBeNull();
    expect(parsed.querySelector('#root [role="progressbar"]')).not.toBeNull();
    expect(parsed.querySelector('#management-bootstrap-message')?.textContent).toContain('下载');
    expect(prefix).toContain('Downloading page resources');
    expect(prefix).toContain('正在下載');
    expect(prefix).toContain('Загрузка');
    expect(prefix).toContain('prefers-reduced-motion');
    expect(prefix.length).toBeLessThan(10240);
  });
});

function mountBootstrap(locale = 'zh-CN') {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(locale);
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.body.innerHTML = parsed.body.innerHTML;
  window.eval(parsed.getElementById('management-bootstrap-script')!.textContent!);
  return document.getElementById('management-bootstrap')!;
}

afterEach(async () => {
  document.getElementById('management-bootstrap')?.remove();
  await Promise.resolve();
  document.body.replaceChildren();
  vi.useRealTimers();
});

test('reports the actual phase and elapsed time without inventing a download percentage', () => {
  const shell = mountBootstrap();
  const progress = document.getElementById('management-bootstrap-progress')!;
  expect(progress.hasAttribute('aria-valuenow')).toBe(false);
  expect(progress.getAttribute('aria-label')).toContain('下载');
  expect(document.getElementById('management-bootstrap-reload')!.hidden).toBe(true);
  vi.advanceTimersByTime(16000);
  expect(document.getElementById('management-bootstrap-elapsed')!.textContent).toBe('已等待 16 秒');
  expect(document.getElementById('management-bootstrap-reload')!.hidden).toBe(false);
  expect(document.getElementById('management-bootstrap-help')!.textContent).toContain('仍在加载');
  expect(shell.hasAttribute('data-failed')).toBe(false);
  shell.dispatchEvent(new Event('management-assets-ready'));
  expect(document.getElementById('management-bootstrap-initialize')!.getAttribute('aria-current')).toBe('step');
  expect(progress.getAttribute('aria-label')).toContain('资源已下载');
  expect(progress.hasAttribute('aria-valuenow')).toBe(false);
});

test('stops progress on script failure and does not overwrite it with a later download marker', () => {
  const listen = vi.spyOn(window, 'addEventListener');
  const shell = mountBootstrap();
  const onError = listen.mock.calls.find(([name]) => name === 'error')![1] as EventListener;
  onError(new Event('error'));
  shell.dispatchEvent(new Event('management-assets-ready'));
  expect(shell.hasAttribute('data-failed')).toBe(true);
  expect(document.getElementById('management-bootstrap-message')!.textContent).toContain('加载失败');
  expect(document.getElementById('management-bootstrap-reload')!.hidden).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

test('removes timers and global listeners once React replaces the shell', async () => {
  const remove = vi.spyOn(window, 'removeEventListener');
  const shell = mountBootstrap();
  shell.remove();
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
  expect(remove.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining(['error', 'unhandledrejection']));
});

test.each([
  ['en', 'Downloading page resources'], ['ru', 'Загрузка ресурсов страницы'],
  ['zh-CN', '正在下载页面资源'], ['zh-TW', '正在下載頁面資源'],
])('localizes the early progress UI for %s without loading the app bundle', (locale, message) => {
  mountBootstrap(locale);
  expect(document.getElementById('management-bootstrap-message')!.textContent).toContain(message);
});
