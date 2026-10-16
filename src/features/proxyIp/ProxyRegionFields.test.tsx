import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProxyRegionFields, validProxyRegion } from './ProxyRegionFields';
vi.mock('react-i18next', async (importOriginal) => ({
 ...(await importOriginal<typeof import('react-i18next')>()), useTranslation: () => ({ t: (s: string) => s }) }));
describe('proxy manual region', () => {
  it('validates timezone and language independently', () => {
    expect(validProxyRegion({ timezone: 'Asia/Tokyo', language: 'ja-JP' })).toBe(true);
    expect(validProxyRegion({ timezone: 'Local' })).toBe(false);
    expect(validProxyRegion({ language: 'not a language' })).toBe(false);
    expect(validProxyRegion({})).toBe(true);
  });
  it('retains the other field when changing one value', () => {
    const changed = vi.fn();
    render(
      <ProxyRegionFields value={{ timezone: 'Asia/Tokyo', language: 'ja-JP' }} onChange={changed} />
    );
    fireEvent.change(screen.getByLabelText('proxy_ip.manual_timezone'), {
      target: { value: 'Europe/Paris' },
    });
    expect(changed).toHaveBeenCalledWith({ timezone: 'Europe/Paris', language: 'ja-JP' });
  });
});
