import React from 'react';
import type { CSSProperties } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Menu } from '@actual-app/components/menu';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import {
  BalanceWithCarryover,
  CarryoverIndicator,
} from '#components/budget/BalanceWithCarryover';
import { CategoryFundingStatus } from '#components/budget/goals/CategoryFundingStatus';
import { BalanceMenu } from '#components/budget/tracking/BalanceMenu';
import {
  Modal,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import { CellValueText } from '#components/spreadsheet/CellValue';
import { useCategory } from '#hooks/useCategory';
import type { Modal as ModalType } from '#modals/modalsSlice';
import { trackingBudget } from '#spreadsheet/bindings';

type TrackingBalanceMenuModalProps = Extract<
  ModalType,
  { name: 'tracking-balance-menu' }
>['options'];

export function TrackingBalanceMenuModal({
  month,
  categoryId,
  onShowActivity,
  onCarryover,
}: TrackingBalanceMenuModalProps) {
  const { t } = useTranslation();
  const defaultMenuItemStyle: CSSProperties = {
    ...styles.mobileMenuItem,
    color: theme.menuItemText,
    borderRadius: 0,
    borderTop: `1px solid ${theme.pillBorder}`,
  };

  const { data: category } = useCategory(categoryId);

  if (!category) {
    return null;
  }

  return (
    <Modal name="tracking-balance-menu">
      {({ state }) => (
        <>
          <ModalHeader
            title={<ModalTitle title={category.name} shrinkOnOverflow />}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View
            style={{
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: 400,
              }}
            >
              <Trans>Balance</Trans>
            </Text>
            <BalanceWithCarryover
              isDisabled
              carryover={trackingBudget.catCarryover(categoryId)}
              balance={
                category.is_income
                  ? trackingBudget.catSumAmount(categoryId)
                  : trackingBudget.catBalance(categoryId)
              }
              goal={trackingBudget.catGoal(categoryId)}
              budgeted={trackingBudget.catBudgeted(categoryId)}
              longGoal={trackingBudget.catLongGoal(categoryId)}
              category={category}
              month={month}
              CarryoverIndicator={({ style }) => (
                <CarryoverIndicator
                  style={{
                    width: 15,
                    height: 15,
                    display: 'inline-flex',
                    position: 'relative',
                    ...style,
                  }}
                />
              )}
            >
              {props => (
                <CellValueText
                  {...props}
                  style={{
                    textAlign: 'center',
                    ...styles.veryLargeText,
                  }}
                />
              )}
            </BalanceWithCarryover>
          </View>
          <CategoryFundingStatus category={category} month={month} />
          {category.is_income ? (
            <Menu
              getItemStyle={() => defaultMenuItemStyle}
              onMenuSelect={() => onShowActivity?.()}
              items={[{ name: 'view', text: t('View transactions') }]}
            />
          ) : (
            <BalanceMenu
              categoryId={categoryId}
              getItemStyle={() => defaultMenuItemStyle}
              onCarryover={onCarryover}
            />
          )}
        </>
      )}
    </Modal>
  );
}
