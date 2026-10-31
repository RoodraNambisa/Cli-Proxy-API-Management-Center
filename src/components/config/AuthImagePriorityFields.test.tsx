import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthImagePriorityFields } from './AuthImagePriorityFields';
import { authImagePriorityError } from '@/utils/authModelExclusions';
import type { AuthModelExclusionVisualEntry } from '@/types/visualConfig';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string, opts?: { priority?: string }) =>
      opts?.priority ? `Priority ${opts.priority}` : key,
  }),
}));

function Fixture({ priorities = ['3', '5'] }: { priorities?: string[] }) {
  const [rule, setRule] = useState<AuthModelExclusionVisualEntry>({
    clientId: 'fixture',
    models: ['excluded'],
    providers: ['codex'],
    keywordContains: [],
    priorities,
    disableImageGeneration: true,
    disableImageGenerationScope: 'selected',
    disableImageGenerationPriorities: ['5'],
  });
  return (
    <AuthImagePriorityFields
      rule={rule}
      error={authImagePriorityError(rule)}
      onChange={(patch) => setRule({ ...rule, ...patch })}
    />
  );
}

describe('image priority range editor', () => {
  it('allows one or both matching priorities without changing the shared model rule', () => {
    render(<Fixture />);
    const three = screen.getByRole('checkbox', { name: 'Priority 3' }) as HTMLInputElement;
    const five = screen.getByRole('checkbox', { name: 'Priority 5' }) as HTMLInputElement;
    expect(three.checked).toBe(false);
    expect(five.checked).toBe(true);
    fireEvent.click(three);
    expect(three.checked).toBe(true);
    fireEvent.click(five);
    fireEvent.click(three);
    expect(screen.getByRole('alert').textContent).toContain(
      'auth_model_exclusion_image_priorities_required'
    );
  });

  it('keeps invalid selections visible until the user removes or corrects them', () => {
    render(<Fixture priorities={['3']} />);
    expect(screen.getByRole('alert').textContent).toContain(
      'auth_model_exclusion_image_priorities_outside'
    );
    expect((screen.getByRole('checkbox', { name: /Priority 5/ }) as HTMLInputElement).checked).toBe(
      true
    );
    fireEvent.click(screen.getByRole('button', { name: 'auth_image_priority.remove' }));
    expect(screen.getByRole('alert').textContent).toContain(
      'auth_model_exclusion_image_priorities_required'
    );
  });
});
