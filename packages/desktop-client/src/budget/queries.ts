import { send } from '@actual-app/core/platform/client/connection';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';
import { queryOptions } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import i18n from 'i18next';

type CategoryViews = {
  grouped: CategoryGroupEntity[];
  list: CategoryEntity[];
};

export const categoryQueries = {
  all: () => ['categories'],
  lists: () => [...categoryQueries.all(), 'lists'],
  list: () =>
    queryOptions<CategoryViews>({
      queryKey: [...categoryQueries.lists()],
      queryFn: async () => {
        const categories = await send('get-categories');
        return translateStartingBalances(categories);
      },
      placeholderData: {
        grouped: [],
        list: [],
      },
      // Manually invalidated when categories change
      staleTime: Infinity,
    }),
};

function translateStartingBalances(categories: {
  grouped: CategoryGroupEntity[];
  list: CategoryEntity[];
}): CategoryViews {
  return {
    list: translateStartingBalancesCategories(categories.list) ?? [],
    grouped: categories.grouped.map(group => ({
      ...group,
      categories: translateStartingBalancesCategories(group.categories),
    })),
  };
}

function translateStartingBalancesCategories(
  categories: CategoryEntity[] | undefined,
): CategoryEntity[] | undefined {
  return categories
    ? categories.map(cat => translateStartingBalancesCategory(cat))
    : undefined;
}

function translateStartingBalancesCategory(
  category: CategoryEntity,
): CategoryEntity {
  return {
    ...category,
    name:
      category.name?.toLowerCase() === 'starting balances'
        ? i18n.t('Starting Balances')
        : category.name,
  };
}

export const fundingQueries = {
  all: () => ['budget-funding'],
  month: (month: string) =>
    queryOptions({
      queryKey: [...fundingQueries.all(), month],
      queryFn: () => send('budget/monthly-category-funding', { month }),
      staleTime: Infinity,
    }),
};

const pendingFundingRefreshes = new WeakMap<QueryClient, Promise<void>>();

// Sync, undo and the funding action can notify together. Share one refresh for
// the burst; release it before fetching so later edits still trigger a new read.
export function invalidateFundingQueries(
  queryClient: QueryClient,
): Promise<void> {
  const pending = pendingFundingRefreshes.get(queryClient);
  if (pending) return pending;
  const refresh = new Promise<void>(resolve => setTimeout(resolve, 20)).then(
    async () => {
      pendingFundingRefreshes.delete(queryClient);
      // Invalidation alone reuses an initial fetch with no cached data. Cancel
      // its result so an edit during that read cannot leave stale funding visible.
      await queryClient.cancelQueries({ queryKey: fundingQueries.all() });
      return queryClient.invalidateQueries({ queryKey: fundingQueries.all() });
    },
  );
  pendingFundingRefreshes.set(queryClient, refresh);
  return refresh;
}
