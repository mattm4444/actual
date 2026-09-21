import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import type { BudgetPage } from './page-models/budget-page';
import { ConfigurationPage } from './page-models/configuration-page';
import { Navigation } from './page-models/navigation';

// Local review artifacts are separate from the Linux-only VRT baselines.
async function captureThemeEvidence(target: Locator, name: string) {
  if (!process.env.FUNDING_EVIDENCE) return;
  const page = target.page();
  for (const theme of ['auto', 'dark', 'midnight'] as const) {
    await page.evaluate(theme => window.Actual.setTheme(theme), theme);
    await expect(page.locator('[data-theme]')).toHaveAttribute(
      'data-theme',
      theme,
    );
    await target.screenshot({
      path: test.info().outputPath(`${name}-${theme}.png`),
    });
  }
  await page.evaluate(() => window.Actual.setTheme('auto'));
}

async function expectCompactMobileRow(row: Locator) {
  await expect(row.getByTestId('category-funding-status')).toHaveCount(0);
  await expect(row.getByRole('button', { name: /^Fund / })).toHaveCount(0);
  await expect(row).toHaveCSS('height', '50px');
  await expect(row.getByTestId('category-name')).toHaveCSS(
    '-webkit-line-clamp',
    '1',
  );
  const box = await row.boundingBox();
  const viewport = row.page().viewportSize();
  if (!box || !viewport)
    {throw new Error('Mobile row must have a visible layout');}
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
}

for (const budgetType of ['Envelope', 'Tracking'] as const) {
  test.describe('Category funding - ' + budgetType, () => {
    let page: Page;
    let budget: BudgetPage;

    test.beforeEach(async ({ browser }) => {
      page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto('/');
      await new ConfigurationPage(page).createTestFile();
      const navigation = new Navigation(page);
      const settings = await navigation.goToSettingsPage();
      await settings.useBudgetType(budgetType);
      await settings.enableExperimentalFeature('Goal templates');
      const automationToggle = page.getByRole('checkbox', {
        name: 'Budget automations UI',
      });
      if (!(await automationToggle.isChecked())) await automationToggle.click();
      await expect(automationToggle).toBeChecked();
      budget = await navigation.goToBudgetPage();
    });

    test.afterEach(async () => {
      await page?.close();
    });

    test('funds a category with keyboard access, refreshes edits, and supports undo and redo', async () => {
      const testInfo = test.info();
      const row = budget.budgetTable.getByTestId('row').filter({
        has: page
          .getByTestId('category-name')
          .getByText('Food', { exact: true }),
      });
      const otherRow = budget.budgetTable.getByTestId('row').filter({
        has: page
          .getByTestId('category-name')
          .getByText('Restaurants', { exact: true }),
      });
      const otherBudget = await otherRow
        .getByTestId('budget')
        .first()
        .textContent();
      await row.getByTestId('category-name').hover();
      await row
        .getByRole('button', { name: 'Change category automations' })
        .click();
      const modal = page.getByRole('dialog');
      await modal.getByRole('button', { name: 'Add an automation' }).click();
      await modal.locator('#amount-field').fill('650');
      await modal.locator('#amount-field').press('Tab');
      await modal.getByRole('spinbutton', { name: 'Priority' }).fill('0');
      await modal.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(modal).toBeHidden();
      const status = row.getByTestId('category-funding-status').first();
      const fund = status.getByRole('button', { name: /^Fund Food for / });
      const cell = row.getByTestId('budget').first();
      const badge = row.locator('[data-funding-state]').first();

      await budget.setBudgetedAmount('Food', '0');
      await expect(status).toContainText('650.00 needed');
      await expect(badge).toHaveAttribute(
        'data-funding-state',
        budgetType === 'Tracking' ? 'overspent' : 'underfunded',
      );
      await page.mouse.move(0, 0);
      await row.screenshot({ path: testInfo.outputPath('underfunded.png') });
      await expect(row).toMatchThemeScreenshots();

      await budget.setBudgetedAmount('Food', '400');
      await expect(status).toContainText('250.00 needed');
      await expect(badge).toHaveAttribute('data-funding-state', 'underfunded');
      await row.screenshot({
        path: testInfo.outputPath('partially-funded.png'),
      });
      await expect(row).toMatchThemeScreenshots();
      await page
        .locator(':focus')
        .evaluateAll(elements =>
          elements.forEach(element => (element as HTMLElement).blur()),
        );
      await page.mouse.move(0, 0);
      await expect(status).toBeHidden();
      expect((await row.boundingBox())?.height).toBeLessThanOrEqual(33);
      await captureThemeEvidence(row, 'desktop-underfunded');
      await row.hover();
      await expect(fund).toBeEnabled();
      await fund.focus();
      await expect(fund).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(cell).toHaveText('650.00');
      await expect(badge).toHaveAttribute('data-funding-state', 'funded');
      await captureThemeEvidence(row, 'desktop-funded');
      await expect(status).toHaveText('Funded');
      await expect(fund).toHaveCount(0);

      await expect(otherRow.getByTestId('budget').first()).toHaveText(
        otherBudget ?? '',
      );
      await expect(otherRow.getByTestId('category-funding-status')).toHaveCount(
        0,
      );

      await page.keyboard.press('Control+z');
      await expect(cell).toHaveText('400.00');
      await expect(status).toContainText('250.00 needed');
      await page.keyboard.press('Control+Shift+z');
      await expect(cell).toHaveText('650.00');
      await expect(status).toHaveText('Funded');
      await row.screenshot({ path: testInfo.outputPath('fully-funded.png') });

      await budget.setBudgetedAmount('Food', '400');
      await expect(status).toContainText('250.00 needed');
      await row.hover();
      await fund.click();
      await expect(cell).toHaveText('650.00');
      await expect(status).toHaveText('Funded');
      await row.screenshot({
        path: testInfo.outputPath('after-clicking-fund.png'),
      });
      await expect(row).toMatchThemeScreenshots();

      await budget.setBudgetedAmount('Food', '800');
      await expect(cell).toHaveText('800.00');
      await expect(status).toHaveText('Funded');
      await expect(fund).toHaveCount(0);
      await expect(row).toMatchThemeScreenshots();

      // Navigation must use the new month's engine inputs, not a cached status.
      await budget.goToNextMonth();
      await budget.setBudgetedAmount('Food', '0');
      await expect(status).toContainText('650.00 needed');
      await row.getByTestId('category-name').hover();
      await row
        .getByRole('button', { name: 'Change category automations' })
        .click();
      await modal.locator('#amount-field').fill('700');
      await modal.locator('#amount-field').press('Tab');
      await modal.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(modal).toBeHidden();
      await expect(status).toContainText('700.00 needed');

      // Mobile keeps live status in the balance badge without a second row.
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileRow = page.getByTestId('category-row').filter({
        has: page
          .getByTestId('category-name')
          .getByText('Food', { exact: true }),
      });
      await expectCompactMobileRow(mobileRow);
      await expect(
        mobileRow.getByRole('button', { name: /Underfunded$/ }),
      ).toBeVisible();
      await page.setViewportSize({ width: 320, height: 844 });
      await expectCompactMobileRow(mobileRow);
      await page.setViewportSize({ width: 390, height: 844 });
      await captureThemeEvidence(mobileRow, 'mobile-underfunded');
      await mobileRow.screenshot({
        path: testInfo.outputPath('mobile-underfunded.png'),
      });
      await expect(mobileRow).toMatchThemeScreenshots();
      await page.setViewportSize({ width: 1280, height: 900 });
      await row.hover();
      await fund.click();
      await expect(status).toHaveText('Funded');
      await page.setViewportSize({ width: 390, height: 844 });
      await expectCompactMobileRow(mobileRow);
      await expect(
        mobileRow.getByRole('button', { name: /: Funded$/ }),
      ).toBeVisible();
      await captureThemeEvidence(mobileRow, 'mobile-funded');
      await mobileRow.screenshot({
        path: testInfo.outputPath('mobile-funded.png'),
      });
      await expect(mobileRow).toMatchThemeScreenshots();

      await page.setViewportSize({ width: 1280, height: 900 });
      await expect(status).toHaveText('Funded');
      await row.getByTestId('category-name').hover();
      await row
        .getByRole('button', { name: 'Change category automations' })
        .click();
      await modal
        .getByRole('button', { name: 'Delete automation', exact: true })
        .click();
      await modal.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(modal).toBeHidden();
      await expect(row.getByTestId('category-funding-status')).toHaveCount(0);
    });

    if (budgetType === 'Envelope') {
      test('fully funds at nonzero priority into overbudget and restores available funds with undo', async () => {
        const row = budget.budgetTable.getByTestId('row').filter({
          has: page
            .getByTestId('category-name')
            .getByText('Food', { exact: true }),
        });
        await row.getByTestId('category-name').hover();
        await row
          .getByRole('button', { name: 'Change category automations' })
          .click();
        const modal = page.getByRole('dialog');
        await modal.getByRole('button', { name: 'Add an automation' }).click();
        await modal.locator('#amount-field').fill('650');
        await modal.locator('#amount-field').press('Tab');
        await modal.getByRole('spinbutton', { name: 'Priority' }).fill('1');
        await modal.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(modal).toBeHidden();
        await budget.setBudgetedAmount('Food', '400');
        const otherRow = budget.budgetTable.getByTestId('row').filter({
          has: page
            .getByTestId('category-name')
            .getByText('Restaurants', { exact: true }),
        });
        const otherCell = otherRow.getByTestId('budget').first();
        // The pinned demo has zero To Budget after setting Food to 400.
        // Releasing 100 must still allow the full 250 recommendation.
        await budget.setBudgetedAmount('Restaurants', '200');
        const unchangedNeighbor = await otherCell.innerText();
        const status = row.getByTestId('category-funding-status').first();
        const fund = status.getByRole('button', { name: /^Fund Food for / });
        await expect(status).toContainText('250.00 needed');
        await row.hover();
        await fund.focus();
        await page.keyboard.press('Space');
        await expect(row.getByTestId('budget').first()).toHaveText('650.00');
        await expect(status).toHaveText('Funded');
        const summary = page.locator(
          `[data-testid="budget-summary"][data-month="${await budget.getSelectedMonth()}"]`,
        );
        await expect(summary).toContainText('Overbudgeted:');
        await expect(summary).toContainText('-150.00');
        await expect(fund).toHaveCount(0);
        await expect(otherCell).toHaveText(unchangedNeighbor);
        await expect(row).toMatchThemeScreenshots();
        await page.keyboard.press('Control+z');
        await expect(row.getByTestId('budget').first()).toHaveText('400.00');
        await row.hover();
        await expect(fund).toBeEnabled();
        await expect(summary).toContainText('100.00');
        await page.keyboard.press('Control+Shift+z');
        await expect(row.getByTestId('budget').first()).toHaveText('650.00');
      });
    }

    if (budgetType === 'Tracking') {
      test('funds tracking income on desktop and shows compact mobile status', async () => {
        const row = budget.budgetTable.getByTestId('row').filter({
          has: page
            .getByTestId('category-name')
            .getByText('Income', { exact: true }),
        });
        await row.getByTestId('category-name').hover();
        await row
          .getByRole('button', { name: 'Change category automations' })
          .click();
        const modal = page.getByRole('dialog');
        await modal.getByRole('button', { name: 'Add an automation' }).click();
        await modal.locator('#amount-field').fill('1200');
        await modal.locator('#amount-field').press('Tab');
        await modal.getByRole('spinbutton', { name: 'Priority' }).fill('0');
        await modal.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(modal).toBeHidden();
        const cell = row.getByTestId('budget').first();
        await cell.click();
        await cell.locator('input').fill('0');
        await cell.locator('input').press('Enter');
        const status = row.getByTestId('category-funding-status').first();
        await expect(status).toContainText('1,200.00 needed');
        await expect(row).toMatchThemeScreenshots();
        await row.hover();
        await status.getByRole('button', { name: /^Fund Income for / }).click();
        await expect(cell).toHaveText('1,200.00');
        await expect(status).toHaveText('Funded');
        await expect(row).toMatchThemeScreenshots();
        await cell.click();
        await cell.locator('input').fill('400');
        await cell.locator('input').press('Enter');
        await expect(status).toContainText('800.00 needed');
        await page.setViewportSize({ width: 390, height: 844 });
        const mobileRow = page.getByTestId('category-row').filter({
          has: page
            .getByTestId('category-name')
            .getByText('Income', { exact: true }),
        });
        await expectCompactMobileRow(mobileRow);
        await expect(
          mobileRow.getByRole('button', { name: /Underfunded$/ }),
        ).toBeVisible();
        await expect(mobileRow).toMatchThemeScreenshots();
        await page.setViewportSize({ width: 1280, height: 900 });
        await row.hover();
        await status.getByRole('button', { name: /^Fund Income for / }).click();
        await expect(status).toHaveText('Funded');
        await page.setViewportSize({ width: 390, height: 844 });
        await expectCompactMobileRow(mobileRow);
        await expect(
          mobileRow.getByRole('button', { name: /: Funded$/ }),
        ).toBeVisible();
        await expect(mobileRow).toMatchThemeScreenshots();
      });
    }
  });
}
