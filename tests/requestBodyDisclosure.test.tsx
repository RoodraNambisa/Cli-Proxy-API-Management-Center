import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { RequestBodyAuditCard } from '@/components/config/RequestBodyAuditCard';
import { RequestBodyReleaseCard } from '@/components/config/RequestBodyReleaseCard';
import { configApi } from '@/services/api';

const translate = vi.fn((key: string) => key);

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: translate }),
  };
});

describe('request body disclosures', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('config-management:request-body-release-expanded', 'true');
    vi.spyOn(configApi, 'getRequestBodyRelease').mockResolvedValue({
      enable: false,
      logOnly: false,
      afterSeconds: 0,
      minBodyBytes: 0,
    });
  });

  test('keeps a modified request-body panel expanded', async () => {
    render(<RequestBodyReleaseCard embedded />);

    const afterSeconds = await screen.findByLabelText(
      'config_management.request_body_release.after_seconds'
    );
    fireEvent.change(afterSeconds, { target: { value: '30' } });

    const disclosure = screen.getByRole('button', {
      name: /config_management.request_body_release.title/,
    });
    await waitFor(() => expect(disclosure.getAttribute('aria-expanded')).toBe('true'));
    fireEvent.click(disclosure);
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
  });

  test('keeps a modified audit panel expanded', async () => {
    localStorage.setItem('config-management:request-body-audit-expanded', 'true');
    vi.spyOn(configApi, 'getRequestBodyAudit').mockResolvedValue({
      enable: false,
      keywords: [],
      keywordsBase64: [],
      caseSensitive: false,
      maxBodyBytes: 0,
      rejectOversize: false,
      error: { statusCode: 400, message: '', type: '', code: '' },
    });
    render(<RequestBodyAuditCard embedded />);

    const maxBodyBytes = await screen.findByLabelText(
      'config_management.request_body_audit.max_body_bytes'
    );
    fireEvent.change(maxBodyBytes, { target: { value: '1024' } });

    const disclosure = screen.getByRole('button', {
      name: /config_management.request_body_audit.title/,
    });
    await waitFor(() => expect(disclosure.getAttribute('aria-expanded')).toBe('true'));
    fireEvent.click(disclosure);
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
  });
});
