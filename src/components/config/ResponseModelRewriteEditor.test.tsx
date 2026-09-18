import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResponseModelRewriteEditor } from './ResponseModelRewriteEditor';
import { readResponseModelRewrite } from '@/utils/responseModelRewrite';
import '@/i18n';

describe('response model rule editor', () => {
  it('offers provider selection only for providers and supports clearing conditions', () => {
    const onChange = vi.fn();
    render(
      <ResponseModelRewriteEditor
        focusTarget="config-response-model-rewrite"
        onChange={onChange}
        value={readResponseModelRewrite({
          enabled: true,
          rules: [{ providers: ['codex'], 'auth-priorities': [0, 3] }],
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /#1/, expanded: false }));
    expect(
      screen.getAllByRole('button', { name: /Choose providers|选择提供方|選擇提供方/ })
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange.mock.calls[onChange.mock.calls.length - 1]?.[0].enabled).toBe(false);
  });
});
