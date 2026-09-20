import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import type { BudgetPage } from './page-models/budget-page';
import { ConfigurationPage } from './page-models/configuration-page';
import { Navigation } from './page-models/navigation';

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
      await row.hover();
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

      await budget.setBudgetedAmount('Food', '0');
      await expect(status).toContainText('650.00 needed');
      await page.mouse.move(0, 0);
      await row.screenshot({ path: testInfo.outputPath('underfunded.png') });
      await expect(row).toMatchThemeScreenshots();

      await budget.setBudgetedAmount('Food', '400');
      await expect(status).toContainText('250.00 needed');
      await row.screenshot({
        path: testInfo.outputPath('partially-funded.png'),
      });
      await expect(row).toMatchThemeScreenshots();
      await expect(fund).toBeEnabled();
      await fund.focus();
      await expect(fund).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(cell).toHaveText('650.00');
      await expect(status).toHaveText('Funded');
      await expect(fund).toHaveCount(0);
      await row.screenshot({
        path: testInfo.outputPath('after-clicking-fund.png'),
      });
      await expect(row).toMatchThemeScreenshots();
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

      await budget.setBudgetedAmount('Food', '800');
      await expect(cell).toHaveText('800.00');
      await expect(status).toHaveText('Funded');
      await expect(fund).toHaveCount(0);
      await expect(row).toMatchThemeScreenshots();
    });
  });
}
