import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgCheckmark } from '@actual-app/components/icons/v1';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import type { CategoryEntity } from '@actual-app/core/types/models';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useBudgetActions } from '#budget/mutations';
import { fundingQueries } from '#budget/queries';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useFeatureFlag } from '#hooks/useFeatureFlag';
import { useFormat } from '#hooks/useFormat';
import { useNotes } from '#hooks/useNotes';
import { useUndo } from '#hooks/useUndo';

export function CategoryFundingStatus({
  category,
  month,
}: {
  category: CategoryEntity;
  month: string;
}) {
  const isEnabled = useFeatureFlag('goalTemplatesEnabled');
  if (!isEnabled) return null;
  return <EnabledCategoryFundingStatus category={category} month={month} />;
}

function EnabledCategoryFundingStatus({
  category,
  month,
}: {
  category: CategoryEntity;
  month: string;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const notes = useNotes(category.id);
  const hasTemplates = !!category.goal_def || !!notes?.includes('#template');
  const queryClient = useQueryClient();
  const {
    data: funding,
    isError,
    isFetching,
  } = useQuery({
    ...fundingQueries.category(month, category.id),
    enabled: hasTemplates,
    retry: false,
  });
  const { mutateAsync, isPending } = useBudgetActions();
  const { showUndoNotification } = useUndo();
  if (!hasTemplates || (!funding && !isError)) return null;

  const remaining = funding?.remaining ?? 0;
  const canFund = (funding?.amountToFund ?? 0) > 0;
  const amount = format(remaining, 'financial');
  const monthLabel = monthUtils.format(month, 'MMMM yyyy');
  const explanation = !canFund
    ? t("No funds are available for this automation's priority.")
    : funding && funding.amountToFund < remaining
      ? t(
          'Available funds allow {{amount}} to be added now. The rest will remain needed.',
          {
            amount: format(funding.amountToFund, 'financial'),
          },
        )
      : t('Fund this category using its budget automation.');

  async function fund() {
    try {
      await mutateAsync({
        month,
        type: 'fund-category',
        args: { category: category.id },
      });
      await queryClient.invalidateQueries({ queryKey: fundingQueries.all() });
      showUndoNotification({ message: t('Budget automation applied.') });
    } catch {
      // useBudgetActions displays the normal budget mutation error notification.
    }
  }

  return (
    <View
      data-testid="category-funding-status"
      aria-live="polite"
      aria-busy={isFetching}
      onKeyDown={event => {
        // Fund owns its keyboard interaction even when a budget cell is editing.
        if (['Enter', ' ', 'Tab'].includes(event.key)) {
          event.stopPropagation();
        }
      }}
      style={{
        minHeight: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 5,
        padding: '0 10px 3px 5px',
        fontSize: 12,
        backgroundColor: monthUtils.isCurrentMonth(month)
          ? theme.budgetCurrentMonth
          : theme.budgetOtherMonth,
        color: isError
          ? theme.pageTextLight
          : remaining > 0
            ? theme.templateNumberUnderFunded
            : theme.budgetNumberPositive,
        borderBottom: '1px solid ' + theme.tableBorder,
      }}
    >
      {isError ? (
        <Tooltip
          content={t("Check this category's budget automation and try again.")}
        >
          <Text>
            <Trans>Automation unavailable</Trans>
          </Text>
        </Tooltip>
      ) : remaining > 0 ? (
        <>
          <PrivacyFilter>
            <Text style={styles.tnum}>
              <Trans>{{ amount }} needed</Trans>
            </Text>
          </PrivacyFilter>
          <Tooltip content={explanation}>
            <Button
              variant="bare"
              aria-label={t('Fund {{category}} for {{month}}', {
                category: category.name,
                month: monthLabel,
              })}
              isDisabled={!canFund || isPending}
              onPress={() => {
                void fund();
              }}
              style={{
                padding: '2px 5px',
                fontSize: 12,
                color: theme.buttonNormalText,
              }}
            >
              <Trans>Fund</Trans>
            </Button>
          </Tooltip>
        </>
      ) : isFetching ? (
        <Text>
          <Trans>Updating…</Trans>
        </Text>
      ) : funding && funding.recommended <= 0 ? (
        <Text>
          <Trans>No funding needed</Trans>
        </Text>
      ) : (
        <>
          <SvgCheckmark aria-hidden="true" width={12} height={12} />
          <Text>
            <Trans>Funded</Trans>
          </Text>
        </>
      )}
    </View>
  );
}
