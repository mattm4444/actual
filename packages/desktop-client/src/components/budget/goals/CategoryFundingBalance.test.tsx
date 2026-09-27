import { initServer } from '@actual-app/core/platform/client/connection';
import type { CategoryFunding } from '@actual-app/core/server/budget/goal-template';
import type { CategoryEntity } from '@actual-app/core/types/models';
import { act, render, screen, waitFor } from '@testing-library/react';

import { fundingQueries } from '#budget/queries';
import { BalanceWithCarryover } from '#components/budget/BalanceWithCarryover';
import { SheetNameProvider } from '#hooks/useSheetName';
import {
  configureTestAppStore,
  createTestQueryClient,
  TestProviders,
} from '#mocks';
import { mergeSyncedPrefs } from '#prefs/prefsSlice';
import { envelopeBudget } from '#spreadsheet/bindings';

import { CategoryFundingProvider } from './CategoryFundingContext';
import { CategoryFundingStatus } from './CategoryFundingStatus';

vi.mock(
  '@actual-app/core/platform/client/connection',
  () => import('#mocks/connection'),
);
vi.mock('#hooks/useSheetValue', () => ({
  useSheetValue: (binding: string | { name: string }) => {
    const name = typeof binding === 'string' ? binding : binding.name;
    if (name.startsWith('leftover-')) return balance;
    if (name.startsWith('budget-')) return funding?.budgeted ?? 0;
    // No saved goal: badge must work before Apply/Overwrite.
    return null;
  },
}));

const category: CategoryEntity = {
  id: 'food',
  name: 'Food',
  group: 'usual',
  is_income: false,
  goal_def:
    '[{"type":"simple","monthly":650,"priority":1,"directive":"template"}]',
  template_settings: { source: 'ui' },
};
let balance: number;
let funding: CategoryFunding | null;
let client: ReturnType<typeof createTestQueryClient>;
let store: ReturnType<typeof configureTestAppStore>;
const read = vi.fn<() => Promise<CategoryFunding | null>>();

beforeEach(() => {
  balance = 30620;
  funding = {
    budgeted: 40000,
    recommended: 65000,
    remaining: 25000,
    amountToFund: 25000,
  };
  client = createTestQueryClient();
  store = configureTestAppStore({ queryClient: client });
  store.dispatch(mergeSyncedPrefs({ 'flags.goalTemplatesEnabled': 'true' }));
  read.mockReset().mockImplementation(async () => funding);
  initServer({
    'budget/monthly-category-funding': async () => ({
      [category.id]: { funding: await read() },
    }),
    query: async () => ({ data: [], dependencies: [] }),
  });
});

function renderBalance() {
  return render(
    <TestProviders queryClient={client} store={store}>
      <SheetNameProvider name="budget202401">
        <CategoryFundingProvider category={category} month="2024-01">
          <BalanceWithCarryover
            carryover={envelopeBudget.catCarryover(category.id)}
            balance={envelopeBudget.catBalance(category.id)}
            goal={envelopeBudget.catGoal(category.id)}
            budgeted={envelopeBudget.catBudgeted(category.id)}
            longGoal={envelopeBudget.catLongGoal(category.id)}
          />
          <CategoryFundingStatus />
        </CategoryFundingProvider>
      </SheetNameProvider>
    </TestProviders>,
  );
}

it('uses live underfunding before any stored goal exists and shares the read with the Fund detail', async () => {
  const { container } = renderBalance();
  await screen.findByText('250.00 needed');
  expect(
    container.querySelector('[data-funding-state="underfunded"]'),
  ).toHaveTextContent('306.20');
  expect(screen.getByText('Underfunded:')).toBeInTheDocument();
  expect(read).toHaveBeenCalledOnce();
});

it('updates funded status after edits/undo invalidation and removes it with the automation', async () => {
  const { container } = renderBalance();
  await screen.findByText('250.00 needed');
  funding = {
    budgeted: 65000,
    recommended: 65000,
    remaining: 0,
    amountToFund: 0,
  };
  await act(() => client.invalidateQueries({ queryKey: fundingQueries.all() }));
  await waitFor(() =>
    expect(
      container.querySelector('[data-funding-state="funded"]'),
    ).toBeInTheDocument(),
  );
  funding = null;
  await act(() => client.invalidateQueries({ queryKey: fundingQueries.all() }));
  await waitFor(() =>
    expect(
      container.querySelector('[data-funding-state]'),
    ).not.toBeInTheDocument(),
  );
});

it.each([0, 25000])(
  'keeps a negative balance overspent with %i remaining to fund',
  async remaining => {
    balance = -26317;
    funding = {
      budgeted: 65000 - remaining,
      recommended: 65000,
      remaining,
      amountToFund: remaining,
    };
    const { container } = renderBalance();
    await waitFor(() =>
      expect(
        container.querySelector('[data-funding-state="overspent"]'),
      ).toHaveTextContent('-263.17'),
    );
    expect(
      container.querySelector('[data-funding-state="funded"]'),
    ).not.toBeInTheDocument();
  },
);

it('does not show a funded badge after the engine errors', async () => {
  read.mockRejectedValue(new Error('Invalid automation'));
  const { container } = renderBalance();
  await waitFor(() =>
    expect(
      container.querySelector('[data-funding-state="unavailable"]'),
    ).toBeInTheDocument(),
  );
  expect(
    container.querySelector('[data-funding-state="funded"]'),
  ).not.toBeInTheDocument();
});

it('does not query or show badges when the feature is off', async () => {
  store.dispatch(mergeSyncedPrefs({ 'flags.goalTemplatesEnabled': 'false' }));
  const { container } = renderBalance();
  await act(() => Promise.resolve());
  expect(read).not.toHaveBeenCalled();
  expect(
    container.querySelector('[data-funding-state]'),
  ).not.toBeInTheDocument();
});
