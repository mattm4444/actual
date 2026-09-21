import { initServer } from '@actual-app/core/platform/client/connection';
import type { CategoryFunding } from '@actual-app/core/server/budget/goal-template';
import type { CategoryEntity } from '@actual-app/core/types/models';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';

import { fundingQueries } from '#budget/queries';
import {
  configureTestAppStore,
  createTestQueryClient,
  TestProviders,
} from '#mocks';
import { mergeSyncedPrefs } from '#prefs/prefsSlice';

import { CategoryFundingProvider } from './CategoryFundingContext';
import { CategoryFundingStatus } from './CategoryFundingStatus';

vi.mock(
  '@actual-app/core/platform/client/connection',
  () => import('#mocks/connection'),
);

vi.mock('@actual-app/components/hooks/useResponsive', () => ({
  useResponsive: () => ({ isNarrowWidth: true }),
}));

const category: CategoryEntity = {
  id: 'groceries',
  name: 'Groceries',
  group: 'usual',
  is_income: false,
  goal_def:
    '[{"type":"simple","monthly":650,"directive":"template","priority":0}]',
  template_settings: { source: 'ui' },
};
let funding: CategoryFunding | null;
let client: ReturnType<typeof createTestQueryClient>;
let store: ReturnType<typeof configureTestAppStore>;
let fund: Mock<
  (args: { month: string; categoryId: string }) => Promise<boolean>
>;
let read: Mock<() => Promise<CategoryFunding | null>>;

beforeEach(() => {
  funding = {
    budgeted: 0,
    recommended: 65000,
    remaining: 65000,
    amountToFund: 65000,
  };
  client = createTestQueryClient();
  store = configureTestAppStore({ queryClient: client });
  store.dispatch(mergeSyncedPrefs({ 'flags.goalTemplatesEnabled': 'true' }));
  fund = vi.fn(async () => {
    funding = {
      budgeted: 65000,
      recommended: 65000,
      remaining: 0,
      amountToFund: 0,
    };
    return true;
  });
  read = vi.fn(async () => funding);
  initServer({
    'budget/monthly-category-funding': async () => ({
      [category.id]: { funding: await read() },
    }),
    'budget/fund-category': fund,
    query: async () => ({ data: [], dependencies: [] }),
  });
});

function renderStatus(cat = category, onFunded?: () => void) {
  return render(
    <TestProviders queryClient={client} store={store}>
      <CategoryFundingProvider category={cat} month="2024-01">
        <CategoryFundingStatus onFunded={onFunded} />
      </CategoryFundingProvider>
    </TestProviders>,
  );
}

it.each([
  [0, '650.00'],
  [40000, '250.00'],
])(
  'shows the engine-derived amount remaining with %i budgeted',
  async (budgeted, amount) => {
    funding = {
      budgeted,
      recommended: 65000,
      remaining: 65000 - budgeted,
      amountToFund: 65000 - budgeted,
    };
    renderStatus();
    expect(await screen.findByText(amount + ' needed')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Assign money to underfunded goal: Groceries for January 2024',
      }),
    ).toBeEnabled();
  },
);

it.each([65000, 90000])(
  'shows completed with %i budgeted and no Fund action',
  async budgeted => {
    funding = { budgeted, recommended: 65000, remaining: 0, amountToFund: 0 };
    renderStatus();
    expect(await screen.findByText('Funded')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(fund).not.toHaveBeenCalled();
  },
);

it('is keyboard reachable, has a category and month label, and refreshes after funding', async () => {
  const user = userEvent.setup();
  funding = {
    budgeted: 40000,
    recommended: 65000,
    remaining: 25000,
    amountToFund: 25000,
  };
  renderStatus();
  const button = await screen.findByRole('button', {
    name: 'Assign money to underfunded goal: Groceries for January 2024',
  });
  await user.tab();
  expect(button).toHaveFocus();
  await user.keyboard('{Enter}');
  await waitFor(() =>
    expect(fund).toHaveBeenCalledExactlyOnceWith({
      month: '2024-01',
      categoryId: 'groceries',
    }),
  );
  expect(await screen.findByText('Funded')).toBeInTheDocument();
});

it('refreshes the amount when its funding query is invalidated after a budget change', async () => {
  renderStatus();
  await screen.findByText('650.00 needed');
  funding = {
    budgeted: 40000,
    recommended: 65000,
    remaining: 25000,
    amountToFund: 25000,
  };
  await act(() => client.invalidateQueries({ queryKey: fundingQueries.all() }));
  expect(await screen.findByText('250.00 needed')).toBeInTheDocument();
});

it('does not add funding UI or calculate a recommendation for a category without automation', async () => {
  const { container } = renderStatus({ ...category, goal_def: undefined });
  await act(() => Promise.resolve());
  expect(container).toBeEmptyDOMElement();
  expect(read).not.toHaveBeenCalled();
});

it('allows an explicit Fund action for the full recommendation with no available funds', async () => {
  funding = {
    budgeted: 40000,
    recommended: 65000,
    remaining: 25000,
    amountToFund: 25000,
  };
  renderStatus();
  expect(await screen.findByText('250.00 needed')).toBeInTheDocument();
  expect(
    screen.getByRole('button', {
      name: /Assign money to underfunded goal: Groceries/,
    }),
  ).toBeEnabled();
});

it('shows an unavailable state when the engine cannot calculate, never a funded check', async () => {
  read.mockRejectedValue(new Error('Invalid automation'));
  renderStatus();
  expect(await screen.findByText('Automation unavailable')).toBeInTheDocument();
  expect(screen.queryByText('Funded')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('preserves underfunding and normal error notification if the mutation fails', async () => {
  fund.mockRejectedValue(new Error('Could not save'));
  const user = userEvent.setup();
  renderStatus();
  await user.click(
    await screen.findByRole('button', {
      name: /Assign money to underfunded goal: Groceries/,
    }),
  );
  await waitFor(() =>
    expect(store.getState().notifications.notifications).toHaveLength(1),
  );
  expect(screen.getByText('650.00 needed')).toBeInTheDocument();
  expect(screen.queryByText('Funded')).not.toBeInTheDocument();
});

it('keeps Fund keyboard activation out of the budget cell navigation handler', async () => {
  const user = userEvent.setup();
  const navigateCell = vi.fn(event => event.preventDefault());
  render(
    <TestProviders queryClient={client} store={store}>
      <div onKeyDown={navigateCell}>
        <CategoryFundingProvider category={category} month="2024-01">
          <CategoryFundingStatus />
        </CategoryFundingProvider>
      </div>
    </TestProviders>,
  );
  const button = await screen.findByRole('button', {
    name: /Assign money to underfunded goal: Groceries/,
  });
  act(() => button.focus());
  await user.keyboard('{Enter}');
  expect(await screen.findByText('Funded')).toBeInTheDocument();
  expect(navigateCell).not.toHaveBeenCalled();
  expect(fund).toHaveBeenCalledOnce();
});

it('preserves keyboard focus while an edit triggers a background refresh', async () => {
  renderStatus();
  const button = await screen.findByRole('button', {
    name: /Assign money to underfunded goal: Groceries/,
  });
  act(() => button.focus());
  let finishRead: ((value: CategoryFunding | null) => void) | undefined;
  read.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finishRead = resolve;
      }),
  );
  let refreshing: Promise<void>;
  act(() => {
    refreshing = client.invalidateQueries({ queryKey: fundingQueries.all() });
  });
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  expect(button).toBeEnabled();
  expect(button).toHaveFocus();
  await act(async () => {
    finishRead?.(funding);
    await refreshing;
  });
  expect(button).toHaveFocus();
});

it('shows no funding needed for a zero engine recommendation instead of claiming completion', async () => {
  funding = { budgeted: 0, recommended: 0, remaining: 0, amountToFund: 0 };
  renderStatus();
  expect(await screen.findByText('No funding needed')).toBeInTheDocument();
  expect(screen.queryByText('Funded')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('removes the status when an automation is removed', async () => {
  renderStatus();
  await screen.findByText('650.00 needed');
  funding = null;
  await act(() => client.invalidateQueries({ queryKey: fundingQueries.all() }));
  await waitFor(() =>
    expect(
      screen.queryByTestId('category-funding-status'),
    ).not.toBeInTheDocument(),
  );
});

it('marks a completed status busy while recalculating instead of displaying a stale check', async () => {
  funding = {
    budgeted: 65000,
    recommended: 65000,
    remaining: 0,
    amountToFund: 0,
  };
  renderStatus();
  await screen.findByText('Funded');
  let finishRead: ((value: CategoryFunding | null) => void) | undefined;
  read.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finishRead = resolve;
      }),
  );
  let refreshing: Promise<void>;
  act(() => {
    refreshing = client.invalidateQueries({ queryKey: fundingQueries.all() });
  });
  expect(await screen.findByText('Updating…')).toBeInTheDocument();
  expect(screen.getByTestId('category-funding-status')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  expect(screen.queryByText('Funded')).not.toBeInTheDocument();
  await act(async () => {
    finishRead?.(funding);
    await refreshing;
  });
  expect(await screen.findByText('Funded')).toBeInTheDocument();
});

it('does not offer Undo when a stale Fund request makes no change', async () => {
  fund.mockResolvedValue(false);
  const user = userEvent.setup();
  renderStatus();
  await user.click(
    await screen.findByRole('button', {
      name: /Assign money to underfunded goal: Groceries/,
    }),
  );
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  expect(store.getState().notifications.notifications).toHaveLength(0);
  expect(screen.getByText('650.00 needed')).toBeInTheDocument();
});

it('offers mobile Undo only after funding actually changed the budget', async () => {
  const user = userEvent.setup();
  renderStatus();
  await user.click(
    await screen.findByRole('button', {
      name: /Assign money to underfunded goal: Groceries/,
    }),
  );
  await waitFor(() =>
    expect(store.getState().notifications.notifications).toHaveLength(1),
  );
  expect(store.getState().notifications.notifications[0].button?.title).toBe(
    'Undo',
  );
});

it.each([true, false])(
  'closes the desktop menu only after a successful funding change (%s)',
  async changed => {
    const onFunded = vi.fn();
    fund.mockResolvedValue(changed);
    renderStatus(category, onFunded);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: /Assign money to underfunded goal:/,
      }),
    );
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    if (changed) {
      await waitFor(() => expect(onFunded).toHaveBeenCalledOnce());
    } else {
      expect(onFunded).not.toHaveBeenCalled();
    }
  },
);
