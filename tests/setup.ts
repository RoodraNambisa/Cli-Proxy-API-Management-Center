import { act, cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  writable: true,
  value: vi.fn(),
});
Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

afterEach(async () => {
  await act(async () => {
    cleanup();
    await Promise.resolve();
  });
});
