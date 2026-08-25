import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('toggles collapsible content from the summary', () => {
    const { container } = render(
      <Card title="Runtime metrics" collapsible>
        <div>Metrics body</div>
      </Card>
    );
    const details = container.querySelector('details');

    expect(details?.open).toBe(true);
    fireEvent.click(screen.getByText('Runtime metrics'));
    expect(details?.open).toBe(false);
  });

  it('does not collapse when the header action is clicked', () => {
    const onRefresh = vi.fn();
    const { container } = render(
      <Card
        title="Runtime metrics"
        collapsible
        extra={
          <button type="button" onClick={onRefresh}>
            Refresh
          </button>
        }
      >
        <div>Metrics body</div>
      </Card>
    );
    const details = container.querySelector('details');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(details?.open).toBe(true);
  });
});
