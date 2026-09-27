import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { CategoryFunding } from '@actual-app/core/server/budget/goal-template';
import type { CategoryEntity } from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import { fundingQueries } from '#budget/queries';
import { useFeatureFlag } from '#hooks/useFeatureFlag';
import { useNotes } from '#hooks/useNotes';

type FundingState = {
  category: CategoryEntity;
  month: string;
  funding: CategoryFunding | null | undefined;
  isError: boolean;
  isFetching: boolean;
};

const CategoryFundingContext = createContext<FundingState | null>(null);

type CategoryFundingProviderProps = {
  category: CategoryEntity;
  month: string;
  children: ReactNode;
};

export function CategoryFundingProvider(props: CategoryFundingProviderProps) {
  const isEnabled = useFeatureFlag('goalTemplatesEnabled');
  return isEnabled ? (
    <EnabledCategoryFundingProvider {...props} />
  ) : (
    props.children
  );
}

function EnabledCategoryFundingProvider({
  category,
  month,
  children,
}: CategoryFundingProviderProps) {
  const notes = useNotes(category.id);
  const hasTemplates = !!category.goal_def || !!notes?.includes('#template');
  const { data, isError, isFetching } = useQuery({
    ...fundingQueries.category(month, category.id),
    enabled: hasTemplates,
    retry: false,
  });

  return (
    <CategoryFundingContext.Provider
      value={
        hasTemplates
          ? { category, month, funding: data, isError, isFetching }
          : null
      }
    >
      {children}
    </CategoryFundingContext.Provider>
  );
}

export function useCategoryFunding() {
  return useContext(CategoryFundingContext);
}
