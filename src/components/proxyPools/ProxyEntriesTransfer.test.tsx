import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProxyEntriesTransfer } from './ProxyEntriesTransfer';
import { copyToClipboard } from '@/utils/clipboard';
import i18n from '@/i18n';

vi.mock('@/utils/clipboard', () => ({ copyToClipboard: vi.fn().mockResolvedValue(true) }));
beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

describe('proxy transfer panel', () => {
  it('validates all rows before appending and skips existing duplicates', () => {
    const onImport = vi.fn();
    render(
      <ProxyEntriesTransfer
        mode="import"
        entries={[{ id: 'proxy-001', 'url-template': 'socks5://u:p@192.0.2.10:80' }]}
        onImport={onImport}
      />
    );
    const input = screen.getByRole('textbox', { name: 'Proxy list to import' });
    fireEvent.change(input, { target: { value: '192.0.2.10:80:u:p\n192.0.2.11:80:u:p\ninvalid' } });
    const apply = screen.getByRole('button', { name: 'Import 1 entries' });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Line 3');
    fireEvent.click(apply);
    expect(onImport).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '192.0.2.10:80:u:p\n192.0.2.11:80:u:p' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 entries' }));
    expect(onImport).toHaveBeenCalledWith([
      { id: 'proxy-002', 'url-template': 'socks5://u:p@192.0.2.11:80', ports: '' },
    ]);
  });

  it('selects a requested copy layout and filters protocols', async () => {
    render(
      <ProxyEntriesTransfer
        mode="copy"
        entries={[
          { id: 'one', 'url-template': 'http://user:password@192.0.2.10:80' },
          { id: 'two', 'url-template': 'socks5://u:p@192.0.2.11:1080' },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    fireEvent.click(screen.getByRole('option', { name: 'PASS:PORT:HOST:USER' }));
    fireEvent.click(screen.getByRole('button', { name: 'Filter by protocol' }));
    fireEvent.click(screen.getByRole('option', { name: 'HTTP' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy 1 proxies' }));
    await waitFor(() =>
      expect(copyToClipboard).toHaveBeenCalledWith('password:80:192.0.2.10:user')
    );
  });

  it('reads clipboard only when requested and supports manual paste after denial', async () => {
    const readText = vi
      .fn()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce('192.0.2.10:80:u:p');
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    try {
      render(<ProxyEntriesTransfer mode="import" entries={[]} onImport={vi.fn()} />);
      expect(readText).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Paste from clipboard' }));
      await waitFor(() =>
        expect(
          (screen.getByRole('button', { name: 'Paste from clipboard' }) as HTMLButtonElement)
            .disabled
        ).toBe(false)
      );
      fireEvent.click(screen.getByRole('button', { name: 'Paste from clipboard' }));
      await waitFor(() =>
        expect(
          (screen.getByRole('textbox', { name: 'Proxy list to import' }) as HTMLTextAreaElement)
            .value
        ).toBe('192.0.2.10:80:u:p')
      );
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });
});
