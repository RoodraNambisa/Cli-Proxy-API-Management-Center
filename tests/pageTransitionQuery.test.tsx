import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, useRoutes, useSearchParams, type Location } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { PageTransition } from '@/components/common/PageTransition';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';

const animation = vi.hoisted(() => vi.fn(() => ({ finished: Promise.resolve(), stop: vi.fn() })));
vi.mock('motion/mini', () => ({ animate: animation }));
vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: (key: string) => key }) }));
beforeEach(() => { localStorage.clear(); animation.mockClear(); });

function Form() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState('');
  const editing = location.pathname.endsWith('/edit');
  return <>
    <output>{location.pathname + location.search + location.hash}</output>
    <input aria-label={editing ? 'Child draft' : 'Parent draft'} value={draft} onChange={(e) => setDraft(e.target.value)} />
    <button onClick={() => setParams({ section: params.get('section') === 'a' ? 'b' : 'a' }, { replace: true })}>Change section</button>
    <button onClick={() => navigate(`${location.pathname}${location.search}#details`, { replace: true, state: { source: 'fixture' } })}>Change hash</button>
    <button onClick={() => navigate('/config/edit?section=a')}>Edit child</button>
    <button onClick={() => navigate(-1)}>Back</button>
  </>;
}
function Routes({ location }: { location: Location }) {
  return useRoutes([{ path: '/config', element: <Form /> }, { path: '/config/edit', element: <Form /> }], location);
}

test('query and hash navigation reach the rendered route without remounts or animation', () => {
  render(<MemoryRouter initialEntries={['/config?section=a']}><PageTransition render={(location) => <Routes location={location} />} /></MemoryRouter>);
  const input = screen.getByRole('textbox', { name: 'Parent draft' });
  fireEvent.change(input, { target: { value: 'unfinished' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change section' }));
  expect(screen.getByRole('status').textContent).toBe('/config?section=b');
  fireEvent.click(screen.getByRole('button', { name: 'Change hash' }));
  expect(screen.getByRole('status').textContent).toBe('/config?section=b#details');
  expect(screen.getByRole('textbox')).toBe(input);
  expect((input as HTMLInputElement).value).toBe('unfinished');
  expect(animation).not.toHaveBeenCalled();
});

test('stacked history uses updated navigation keys while retaining the parent component', async () => {
  render(<MemoryRouter initialEntries={['/config?section=a']}><PageTransition getTransitionVariant={() => 'ios'} render={(location) => <Routes location={location} />} /></MemoryRouter>);
  const input = screen.getByRole('textbox', { name: 'Parent draft' });
  fireEvent.change(input, { target: { value: 'parent draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change section' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Edit child' })));
  await screen.findByRole('textbox', { name: 'Child draft' });
  fireEvent.click(screen.getByRole('button', { name: 'Change section' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Back' })));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('/config?section=b'));
  expect(screen.getByRole('textbox', { name: 'Parent draft' })).toBe(input);
  expect((input as HTMLInputElement).value).toBe('parent draft');
  expect(document.querySelectorAll('.page-transition__layer')).toHaveLength(1);
});

test('the configuration center stays on the category selected inside the real transition wrapper', async () => {
  function ConfigRoute({ location }: { location: Location }) {
    return useRoutes([{ path: '/config', element: <VisualConfigEditor values={DEFAULT_VISUAL_VALUES} baselineValues={DEFAULT_VISUAL_VALUES} onChange={vi.fn()} /> }], location);
  }
  render(<MemoryRouter initialEntries={['/config?section=global-credentials']}><PageTransition render={(location) => <ConfigRoute location={location} />} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'config_management.settings_center.pages.provider_codex.title', exact: true }));
  await waitFor(() => expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('config_management.settings_center.pages.provider_codex.title'));
  expect(animation).not.toHaveBeenCalled();
});
