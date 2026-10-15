// @ts-strict-ignore
import React, { useCallback } from 'react';
import type {
  ComponentPropsWithoutRef,
  ComponentType,
  CSSProperties,
  ReactNode,
} from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import {
  SvgArrowThinRight,
  SvgCheckmark,
  SvgDotsHorizontalTriple,
  SvgExclamationOutline,
  SvgSubtract,
  SvgTime,
} from '@actual-app/components/icons/v1';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';
import type { CategoryEntity } from '@actual-app/core/types/models';
import type { TransObjectLiteral } from '@actual-app/core/types/util';
import { css, cx } from '@emotion/css';
import type { TFunction } from 'i18next';

import { PrivacyFilter } from '#components/PrivacyFilter';
import { CellValue, CellValueText } from '#components/spreadsheet/CellValue';
import { useFeatureFlag } from '#hooks/useFeatureFlag';
import { useFormat } from '#hooks/useFormat';
import { useSheetValue } from '#hooks/useSheetValue';
import type { Binding } from '#spreadsheet';

import { useCategoryFunding } from './goals/CategoryFundingStatus';
import { makeBalanceAmountStyle } from './util';

type CarryoverIndicatorProps = {
  style?: CSSProperties;
};

export function CarryoverIndicator({ style }: CarryoverIndicatorProps) {
  return (
    <View
      style={{
        marginLeft: 2,
        position: 'absolute',
        right: '-4px',
        alignSelf: 'center',
        justifyContent: 'center',
        top: 0,
        bottom: 0,
        ...style,
      }}
    >
      <SvgArrowThinRight
        width={style?.width || 7}
        height={style?.height || 7}
        style={style}
      />
    </View>
  );
}

function GoalTooltipRow({ children }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {children}
    </div>
  );
}

type CellValueChildren = ComponentPropsWithoutRef<typeof CellValue>['children'];

type ChildrenWithClassName = (
  props: Parameters<CellValueChildren>[0] & {
    className: string;
  },
  /** Live funding for `category`, so children don't read it a second time. */
  funding: CategoryFundingState | null,
) => ReturnType<CellValueChildren>;

type BalanceWithCarryoverProps = Omit<
  ComponentPropsWithoutRef<typeof CellValue>,
  'children' | 'binding'
> & {
  children?: ChildrenWithClassName;
  carryover: Binding<'envelope-budget' | 'tracking-budget', 'carryover'>;
  /**
   * Expense category balance binding is `leftover`,
   * while income category balance binding is `sum-amount`.
   */
  balance: Binding<
    'envelope-budget' | 'tracking-budget',
    'leftover' | 'sum-amount'
  >;
  goal: Binding<'envelope-budget' | 'tracking-budget', 'goal'>;
  budgeted: Binding<'envelope-budget' | 'tracking-budget', 'budget'>;
  longGoal: Binding<'envelope-budget' | 'tracking-budget', 'long-goal'>;
  isDisabled?: boolean;
  shouldInlineGoalStatus?: boolean;
  CarryoverIndicator?: ComponentType<CarryoverIndicatorProps>;
  tooltipDisabled?: boolean;
  category?: CategoryEntity;
  month?: string;
};

export function BalanceWithCarryover({
  carryover,
  balance,
  goal,
  budgeted,
  longGoal,
  isDisabled,
  shouldInlineGoalStatus,
  CarryoverIndicator: CarryoverIndicatorComponent = CarryoverIndicator,
  tooltipDisabled,
  category,
  month,
  children,
  ...props
}: BalanceWithCarryoverProps) {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const carryoverValue = useSheetValue(carryover);
  const goalValue = useSheetValue(goal);
  const budgetedValue = useSheetValue(budgeted);
  const longGoalValue = useSheetValue(longGoal);
  const isGoalTemplatesEnabled = useFeatureFlag('goalTemplatesEnabled');
  const getBalanceAmountStyle = useCallback(
    (balanceValue: number) =>
      makeBalanceAmountStyle(
        balanceValue,
        isGoalTemplatesEnabled ? goalValue : null,
        longGoalValue === 1 ? balanceValue : budgetedValue,
      ),
    [budgetedValue, goalValue, isGoalTemplatesEnabled, longGoalValue],
  );
  const format = useFormat();
  const funding = useCategoryFunding({ category, month });

  const getDifferenceToGoal = useCallback(
    (balanceValue: number) =>
      longGoalValue === 1
        ? balanceValue - goalValue
        : budgetedValue - goalValue,
    [budgetedValue, goalValue, longGoalValue],
  );

  const getDefaultClassName = useCallback(
    (balanceValue: number) =>
      css({
        ...getBalanceAmountStyle(balanceValue),
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        textAlign: 'right',
        ...(!isDisabled && {
          cursor: 'pointer',
        }),
        ':hover': { textDecoration: 'underline' },
      }),
    [getBalanceAmountStyle, isDisabled],
  );
  const GoalStatusDisplay = useCallback(
    (balanceValue, type) => {
      return (
        <>
          <span style={{ fontWeight: 'bold' }}>
            {getDifferenceToGoal(balanceValue) === 0 ? (
              <span style={{ color: theme.templateNumberFunded }}>
                <Trans>Fully funded</Trans>
              </span>
            ) : getDifferenceToGoal(balanceValue) > 0 ? (
              <span style={{ color: theme.templateNumberFunded }}>
                <Trans>
                  Overfunded (
                  {{
                    amount: format(
                      getDifferenceToGoal(balanceValue),
                      'financial',
                    ),
                  }}
                  )
                </Trans>
              </span>
            ) : (
              <span style={{ color: theme.templateNumberUnderFunded }}>
                <Trans>
                  Underfunded (
                  {{
                    amount: format(
                      getDifferenceToGoal(balanceValue),
                      'financial',
                    ),
                  }}
                  )
                </Trans>
              </span>
            )}
          </span>
          <GoalTooltipRow>
            <Trans>
              <div>Goal Type:</div>
              <div>
                {
                  {
                    type: longGoalValue === 1 ? t('Goal') : t('Automation'),
                  } as TransObjectLiteral
                }
              </div>
            </Trans>
          </GoalTooltipRow>
          <GoalTooltipRow>
            <Trans>
              <div>Goal:</div>
              <div>
                {
                  {
                    amount: format(goalValue, 'financial'),
                  } as TransObjectLiteral
                }
              </div>
            </Trans>
          </GoalTooltipRow>
          <GoalTooltipRow>
            {longGoalValue !== 1 ? (
              <Trans>
                <div>Budgeted:</div>
                <div>
                  {
                    {
                      amount: format(budgetedValue, 'financial'),
                    } as TransObjectLiteral
                  }
                </div>
              </Trans>
            ) : (
              <Trans>
                <div>Balance:</div>
                <div>
                  {
                    {
                      amount: format(balanceValue, type),
                    } as TransObjectLiteral
                  }
                </div>
              </Trans>
            )}
          </GoalTooltipRow>
        </>
      );
    },
    [budgetedValue, format, getDifferenceToGoal, goalValue, longGoalValue, t],
  );

  return (
    <CellValue binding={balance} type="financial" {...props}>
      {({ type, name, value: balanceValue }) => (
        <>
          <Tooltip
            content={
              <View style={{ padding: 10 }}>
                {funding ? (
                  <PrivacyFilter>
                    {getFundingBadge(funding, balanceValue, t).label}
                  </PrivacyFilter>
                ) : (
                  GoalStatusDisplay(balanceValue, type)
                )}
              </View>
            }
            style={{ ...styles.tooltip, borderRadius: '0px 5px 5px 0px' }}
            placement="bottom"
            triggerProps={{
              delay: 750,
              isDisabled:
                !isGoalTemplatesEnabled ||
                (!funding && goalValue == null) ||
                isNarrowWidth ||
                tooltipDisabled,
            }}
          >
            {children ? (
              children(
                {
                  type,
                  name,
                  value: balanceValue,
                  className: funding
                    ? css({
                        color: getFundingBadge(funding, balanceValue, t).style
                          .color,
                      })
                    : getDefaultClassName(balanceValue),
                },
                funding,
              )
            ) : funding ? (
              <FundingBalance
                funding={funding}
                value={balanceValue}
                className={getDefaultClassName(balanceValue)}
              >
                <CellValueText type={type} name={name} value={balanceValue} />
              </FundingBalance>
            ) : (
              <CellValueText
                type={type}
                name={name}
                value={balanceValue}
                className={getDefaultClassName(balanceValue)}
              />
            )}
          </Tooltip>

          {carryoverValue && (
            <CarryoverIndicatorComponent
              style={getBalanceAmountStyle(balanceValue)}
            />
          )}
          {shouldInlineGoalStatus &&
            !funding &&
            isGoalTemplatesEnabled &&
            goalValue !== null && (
              <>
                <View
                  style={{
                    borderTop: '1px solid ' + theme.tableBorderSeparator,
                    width: '160px',
                    margin: '3px 0px',
                  }}
                />
                <View>{GoalStatusDisplay(balanceValue, type)}</View>
              </>
            )}
        </>
      )}
    </CellValue>
  );
}

type CategoryFundingState = NonNullable<ReturnType<typeof useCategoryFunding>>;

const neutral = {
  backgroundColor: theme.pillBackground,
  color: theme.pillText,
};

const FUNDING_BADGES = {
  overspent: {
    Icon: SvgExclamationOutline,
    colors: {
      backgroundColor: theme.errorBackground,
      color: theme.errorTextDarker,
    },
  },
  unavailable: { Icon: SvgExclamationOutline, colors: neutral },
  updating: { Icon: SvgDotsHorizontalTriple, colors: neutral },
  underfunded: {
    Icon: SvgTime,
    colors: {
      backgroundColor: theme.warningBackground,
      color: theme.warningTextDark,
    },
  },
  funded: {
    Icon: SvgCheckmark,
    colors: {
      backgroundColor: theme.noticeBackground,
      color: theme.noticeTextDark,
    },
  },
  'not-needed': { Icon: SvgSubtract, colors: neutral },
};

function getFundingState(
  { funding, isError, isFetching }: CategoryFundingState,
  balance: number,
): keyof typeof FUNDING_BADGES {
  if (balance < 0) return 'overspent';
  if (isError || !funding) return 'unavailable';
  if (isFetching) return 'updating';
  if (funding.remaining > 0) return 'underfunded';
  if (funding.recommended > 0) return 'funded';
  return 'not-needed';
}

export function getFundingBadge(
  fundingState: CategoryFundingState,
  balance: number,
  t: TFunction,
) {
  const state = getFundingState(fundingState, balance);
  const labels = {
    overspent: t('Overspent'),
    unavailable: t('Automation unavailable'),
    updating: t('Updating…'),
    underfunded: t('Underfunded'),
    funded: t('Funded'),
    'not-needed': t('No funding needed'),
  };
  const { Icon, colors } = FUNDING_BADGES[state];
  const style = {
    ...colors,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    padding: '2px 7px',
    maxWidth: '100%',
    lineHeight: '18px',
  } satisfies CSSProperties;
  return { state, label: labels[state], Icon, style };
}

type FundingBalanceProps = {
  funding: CategoryFundingState;
  value: number;
  className: string;
  children: ReactNode;
};

function FundingBalance({
  funding,
  value,
  className,
  children,
}: FundingBalanceProps) {
  const { t } = useTranslation();
  const { state, label, Icon, style } = getFundingBadge(funding, value, t);
  return (
    <span
      className={cx(className, css(style))}
      data-funding-state={state}
      aria-busy={funding.isFetching}
    >
      <Icon
        aria-hidden="true"
        width={12}
        height={12}
        style={{ flexShrink: 0 }}
      />
      <span className={css(styles.visuallyHidden)}>{label}: </span>
      {children}
    </span>
  );
}
