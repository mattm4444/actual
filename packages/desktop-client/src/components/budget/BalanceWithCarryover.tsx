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
import type { TransObjectLiteral } from '@actual-app/core/types/util';
import { css } from '@emotion/css';

import { PrivacyFilter } from '#components/PrivacyFilter';
import { CellValue, CellValueText } from '#components/spreadsheet/CellValue';
import { useFeatureFlag } from '#hooks/useFeatureFlag';
import { useFormat } from '#hooks/useFormat';
import { useSheetValue } from '#hooks/useSheetValue';
import type { Binding } from '#spreadsheet';

import { useCategoryFunding } from './goals/CategoryFundingContext';
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
    statusIcon?: ReactNode;
    statusLabel?: string;
    badgeStyle?: CSSProperties;
  },
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
  const fundingState = useCategoryFunding();
  const hasFunding =
    fundingState && (fundingState.funding || fundingState.isError);

  function getFundingState(balanceValue: number) {
    if (!hasFunding) return null;
    if (balanceValue < 0) return 'overspent';
    if (fundingState.isError) return 'unavailable';
    if (fundingState.isFetching) return 'updating';
    if (fundingState.funding.remaining > 0) return 'underfunded';
    return fundingState.funding.recommended > 0 ? 'funded' : 'not-needed';
  }

  function getFundingLabel(balanceValue: number) {
    const state = getFundingState(balanceValue);
    if (state === 'overspent') return t('Overspent');
    if (state === 'unavailable') return t('Automation unavailable');
    if (state === 'updating') return t('Updating…');
    if (state === 'underfunded') return t('Underfunded');
    if (state === 'funded') return t('Funded');
    if (state === 'not-needed') return t('No funding needed');
    return undefined;
  }

  function getStatusIcon(balanceValue: number) {
    const state = getFundingState(balanceValue);
    if (!state) return undefined;
    const Icon =
      state === 'funded'
        ? SvgCheckmark
        : state === 'underfunded'
          ? SvgTime
          : state === 'updating'
            ? SvgDotsHorizontalTriple
            : state === 'not-needed'
              ? SvgSubtract
              : SvgExclamationOutline;
    return (
      <Icon
        aria-hidden="true"
        width={12}
        height={12}
        style={{ flexShrink: 0 }}
      />
    );
  }

  function getBadgeStyle(balanceValue: number): CSSProperties {
    const state = getFundingState(balanceValue);
    if (!state) return {};
    const colors =
      state === 'overspent'
        ? {
            backgroundColor: theme.errorBackground,
            color: theme.errorTextDarker,
          }
        : state === 'underfunded'
          ? {
              backgroundColor: theme.warningBackground,
              color: theme.warningTextDark,
            }
          : state === 'funded'
            ? {
                backgroundColor: theme.noticeBackground,
                color: theme.noticeTextDark,
              }
            : { backgroundColor: theme.pillBackground, color: theme.pillText };
    return {
      ...colors,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      borderRadius: 12,
      padding: '2px 7px',
      maxWidth: '100%',
      lineHeight: '18px',
    };
  }

  const getDifferenceToGoal = useCallback(
    (balanceValue: number) =>
      longGoalValue === 1
        ? balanceValue - goalValue
        : budgetedValue - goalValue,
    [budgetedValue, goalValue, longGoalValue],
  );

  const getDefaultClassName = (balanceValue: number) =>
    css({
      ...getBalanceAmountStyle(balanceValue),
      ...getBadgeStyle(balanceValue),
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      textAlign: 'right',
      ...(!isDisabled && {
        cursor: 'pointer',
      }),
      ':hover': { textDecoration: 'underline' },
    });
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
                {hasFunding ? (
                  <PrivacyFilter>{getFundingLabel(balanceValue)}</PrivacyFilter>
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
                (!hasFunding && goalValue == null) ||
                isNarrowWidth ||
                tooltipDisabled,
            }}
          >
            {children ? (
              children({
                type,
                name,
                value: balanceValue,
                className: hasFunding
                  ? css({ color: getBadgeStyle(balanceValue).color })
                  : getDefaultClassName(balanceValue),
                ...(hasFunding && {
                  badgeStyle: getBadgeStyle(balanceValue),
                  statusIcon: getStatusIcon(balanceValue),
                  statusLabel: getFundingLabel(balanceValue),
                }),
              })
            ) : (
              <span
                className={getDefaultClassName(balanceValue)}
                data-funding-state={getFundingState(balanceValue) ?? undefined}
                aria-busy={hasFunding ? fundingState.isFetching : undefined}
              >
                {getStatusIcon(balanceValue)}
                {hasFunding && (
                  <span className={css(styles.visuallyHidden)}>
                    {getFundingLabel(balanceValue)}:{' '}
                  </span>
                )}
                <CellValueText type={type} name={name} value={balanceValue} />
              </span>
            )}
          </Tooltip>

          {carryoverValue && (
            <CarryoverIndicatorComponent
              style={getBalanceAmountStyle(balanceValue)}
            />
          )}
          {shouldInlineGoalStatus &&
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
