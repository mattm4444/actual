import { initServer } from '@actual-app/core/platform/client/connection';
import type { MonthlyCategoryFunding } from '@actual-app/core/server/budget/goal-template';
import type { CategoryEntity } from '@actual-app/core/types/models';
import { act, render, screen, waitFor } from '@testing-library/react';

import { fundingQueries, invalidateFundingQueries } from '#budget/queries';
import {
  configureTestAppStore,
  createTestQueryClient,
  TestProviders,
} from '#mocks';
import { mergeSyncedPrefs } from '#prefs/prefsSlice';

import {
  CategoryFundingProvider,
  useCategoryFunding,
} from './CategoryFundingContext';

vi.mock(
  '@actual-app/core/platform/client/connection',
  () => import('#mocks/connection'),
);

function FundingValue() {
  const state = useCategoryFunding();
  return (
    <span>{state?.isError ? 'unavailable' : state?.funding?.remaining}</span>
  );
}

it.each([20, 100, 300])(
  'shares one monthly request across %i rows and an opened menu',
  async count => {
    const client = createTestQueryClient();
    const store = configureTestAppStore({ queryClient: client });
    store.dispatch(mergeSyncedPrefs({ 'flags.goalTemplatesEnabled': 'true' }));
    const categories: CategoryEntity[] = Array.from(
      { length: count },
      (_, i) => ({
        id: `goal-${i}`,
        name: `Goal ${i}`,
        group: 'goals',
        is_income: false,
        goal_def: '[]',
      }),
    );
    let remaining = 10000;
    const read = vi.fn(
      async (): Promise<MonthlyCategoryFunding> =>
        Object.fromEntries(
          categories.map(category => [
            category.id,
            {
              funding: {
                budgeted: 0,
                recommended: remaining,
                remaining,
                amountToFund: remaining,
              },
            },
          ]),
        ),
    );
    initServer({
      'budget/monthly-category-funding': read,
      query: async () => ({ data: [], dependencies: [] }),
    });
    function Budget({ menu = false }: { menu?: boolean }) {
      return (
        <TestProviders queryClient={client} store={store}>
          {categories.map(category => (
            <CategoryFundingProvider
              key={category.id}
              category={category}
              month="2024-01"
            >
              <FundingValue />
            </CategoryFundingProvider>
          ))}
          {menu && (
            <CategoryFundingProvider category={categories[0]} month="2024-01">
              <FundingValue />
            </CategoryFundingProvider>
          )}
        </TestProviders>
      );
    }
    const { rerender } = render(<Budget />);
    await waitFor(() =>
      expect(screen.getAllByText('10000')).toHaveLength(count),
    );
    expect(read).toHaveBeenCalledOnce();
    rerender(<Budget menu />);
    await waitFor(() =>
      expect(screen.getAllByText('10000')).toHaveLength(count + 1),
    );
    expect(read).toHaveBeenCalledOnce();
    remaining = 5000;
    await act(() =>
      Promise.all([
        invalidateFundingQueries(client),
        invalidateFundingQueries(client),
        invalidateFundingQueries(client),
      ]),
    );
    await waitFor(() =>
      expect(screen.getAllByText('5000')).toHaveLength(count + 1),
    );
    expect(read).toHaveBeenCalledTimes(2);
  },
);

it('keeps a category error local and uses separate cached data for each month', async () => {
  const client = createTestQueryClient();
  const store = configureTestAppStore({ queryClient: client });
  store.dispatch(mergeSyncedPrefs({ 'flags.goalTemplatesEnabled': 'true' }));
  client.setQueryData(fundingQueries.month('2024-01').queryKey, {
    broken: { funding: null, error: 'Invalid automation' },
    valid: {
      funding: {
        budgeted: 0,
        recommended: 10000,
        remaining: 10000,
        amountToFund: 10000,
      },
    },
  });
  client.setQueryData(fundingQueries.month('2024-02').queryKey, {
    valid: {
      funding: {
        budgeted: 0,
        recommended: 20000,
        remaining: 20000,
        amountToFund: 20000,
      },
    },
  });
  initServer({ query: async () => ({ data: [], dependencies: [] }) });
  render(
    <TestProviders queryClient={client} store={store}>
      {(['broken', 'valid'] as const).map(id => (
        <CategoryFundingProvider
          key={id}
          month="2024-01"
          category={{
            id,
            name: id,
            group: 'goals',
            is_income: false,
            goal_def: '[]',
          }}
        >
          <FundingValue />
        </CategoryFundingProvider>
      ))}
      <CategoryFundingProvider
        month="2024-02"
        category={{
          id: 'valid',
          name: 'Valid',
          group: 'goals',
          is_income: false,
          goal_def: '[]',
        }}
      >
        <FundingValue />
      </CategoryFundingProvider>
    </TestProviders>,
  );
  expect(await screen.findByText('unavailable')).toBeInTheDocument();
  expect(screen.getByText('10000')).toBeInTheDocument();
  expect(screen.getByText('20000')).toBeInTheDocument();
});

it('refreshes an edit during the first read and ignores the older result', async () => {
  const client = createTestQueryClient();
  const store = configureTestAppStore({ queryClient: client });
  store.dispatch(mergeSyncedPrefs({ 'flags.goalTemplatesEnabled': 'true' }));
  let finishOldRead: ((value: MonthlyCategoryFunding) => void) | undefined;
  const result = (remaining: number): MonthlyCategoryFunding => ({
    valid: {
      funding: {
        budgeted: 0,
        recommended: remaining,
        remaining,
        amountToFund: remaining,
      },
    },
  });
  const read = vi
    .fn(async () => result(5000))
    .mockImplementationOnce(
      () =>
        new Promise<MonthlyCategoryFunding>(resolve => {
          finishOldRead = resolve;
        }),
    );
  initServer({
    'budget/monthly-category-funding': read,
    query: async () => ({ data: [], dependencies: [] }),
  });
  render(
    <TestProviders queryClient={client} store={store}>
      <CategoryFundingProvider
        month="2024-01"
        category={{
          id: 'valid',
          name: 'Valid',
          group: 'goals',
          is_income: false,
          goal_def: '[]',
        }}
      >
        <FundingValue />
      </CategoryFundingProvider>
    </TestProviders>,
  );
  await waitFor(() => expect(read).toHaveBeenCalledOnce());
  await act(() => invalidateFundingQueries(client));
  expect(await screen.findByText('5000')).toBeInTheDocument();
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => {
    finishOldRead?.(result(10000));
  });
  expect(screen.queryByText('10000')).not.toBeInTheDocument();
  expect(screen.getByText('5000')).toBeInTheDocument();
});
