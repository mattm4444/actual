import React from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Menu } from '@actual-app/components/menu';

import { CategoryFundingStatus } from '#components/budget/goals/CategoryFundingStatus';
import { trackingBudget } from '#spreadsheet/bindings';

import { useTrackingSheetValue } from './TrackingBudgetComponents';

type BalanceMenuProps = Omit<
  ComponentPropsWithoutRef<typeof Menu>,
  'onMenuSelect' | 'items'
> & {
  onFunded?: () => void;
  categoryId: string;
  isIncome?: boolean;
  onShowActivity?: () => void;
  onCarryover: (carryover: boolean) => void;
};

export function BalanceMenu({
  categoryId,
  onFunded,
  isIncome,
  onShowActivity,
  onCarryover,
  ...props
}: BalanceMenuProps) {
  const { t } = useTranslation();
  const carryover = useTrackingSheetValue(
    trackingBudget.catCarryover(categoryId),
  );
  return (
    <>
      <CategoryFundingStatus onFunded={onFunded} />
      <Menu
        {...props}
        onMenuSelect={name => {
          switch (name) {
            case 'view':
              onShowActivity?.();
              break;
            case 'carryover':
              onCarryover?.(!carryover);
              break;
            default:
              throw new Error(`Unrecognized menu option: ${String(name)}`);
          }
        }}
        items={
          isIncome
            ? [{ name: 'view', text: t('View transactions') }]
            : [
                {
                  name: 'carryover',
                  text: carryover
                    ? t('Remove overspending rollover')
                    : t('Rollover overspending'),
                },
              ]
        }
      />
    </>
  );
}
