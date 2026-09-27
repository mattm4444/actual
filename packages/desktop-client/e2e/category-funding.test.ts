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
  await expect(row.getByRole('button', { name: /^Assign money/ })).toHaveCount(
    0,
  );
  await expect(row).toHaveCSS('height', '50px');
  await expect(row.getByTestId('category-name')).toHaveCSS(
    '-webkit-line-clamp',
    '1',
  );
  const box = await row.boundingBox();
  const viewport = row.page().viewportSize();
  if (!box || !viewport) {
    throw new Error('Mobile row must have a visible layout');
  }
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
      const toggle = page.getByRole('checkbox', {
        name: 'Budget automations UI',
      });
      if (!(await toggle.isChecked())) await toggle.click();
      budget = await navigation.goToBudgetPage();
    });

    test.afterEach(async () => {
      await page?.close();
    });

    function rowFor(name: string) {
      return budget.budgetTable.getByTestId('row').filter({
        has: page.getByTestId('category-name').getByText(name, { exact: true }),
      });
    }

    async function automation(name: string, amount: string, priority = '0') {
      const row = rowFor(name);
      await row.getByTestId('category-name').hover();
      await row
        .getByRole('button', { name: 'Change category automations' })
        .click();
      const modal = page.getByRole('dialog');
      await modal.getByRole('button', { name: 'Add an automation' }).click();
      await modal.locator('#amount-field').fill(amount);
      await modal.locator('#amount-field').press('Tab');
      await modal.getByRole('spinbutton', { name: 'Priority' }).fill(priority);
      await modal.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(modal).toBeHidden();
    }

    const panel = () => page.getByTestId('category-funding-status');
    const assign = () =>
      panel().getByRole('button', {
        name: /^Assign money to underfunded goal:/,
      });

    async function openBalance(row: Locator) {
      await row.getByTestId('balance').first().getByRole('button').click();
      await expect(panel()).toBeVisible();
    }

    test('funds from the balance menu, refreshes edits, and supports undo and redo', async () => {
      await automation('Food', '650');
      const row = rowFor('Food');
      const cell = row.getByTestId('budget').first();
      const badge = row.locator('[data-funding-state]').first();
      const otherCell = rowFor('Restaurants').getByTestId('budget').first();
      const otherBudget = await otherCell.textContent();
      await budget.setBudgetedAmount('Food', '0');
      await openBalance(row);
      await expect(panel()).toContainText('650.00 needed');
      await expect(panel().getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        '0',
      );
      await page.keyboard.press('Escape');
      await budget.setBudgetedAmount('Food', '400');
      await row.hover();
      await expect(row.getByTestId('category-funding-status')).toHaveCount(0);
      expect((await row.boundingBox())?.height).toBeLessThanOrEqual(33);
      await expect(badge).toHaveAttribute('data-funding-state', 'underfunded');
      await openBalance(row);
      await expect(panel()).toContainText('250.00 needed');
      await expect(panel()).toContainText('400.00');
      await expect(panel().getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        '62',
      );
      await expect(
        page.getByText('Rollover overspending', { exact: true }),
      ).toBeVisible();
      await panel().screenshot({
        path: test.info().outputPath('desktop-funding-menu.png'),
      });
      await expect(panel()).toMatchThemeScreenshots();
      await captureThemeEvidence(panel(), 'desktop-funding-menu');
      await assign().focus();
      await page.keyboard.press('Enter');
      await expect(cell).toHaveText('650.00');
      await expect(badge).toHaveAttribute('data-funding-state', 'funded');
      await expect(panel()).toBeHidden();
      await openBalance(row);
      await expect(panel().getByText('Funded', { exact: true })).toBeVisible();
      await expect(assign()).toHaveCount(0);
      await expect(otherCell).toHaveText(otherBudget ?? '');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+z');
      await expect(cell).toHaveText('400.00');
      await openBalance(row);
      await expect(panel()).toContainText('250.00 needed');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+Shift+z');
      await expect(cell).toHaveText('650.00');
      await budget.setBudgetedAmount('Food', '800');
      await openBalance(row);
      await expect(panel().getByText('Funded', { exact: true })).toBeVisible();
      await expect(assign()).toHaveCount(0);
      await expect(cell).toHaveText('800.00');
      await page.keyboard.press('Escape');
      await budget.goToNextMonth();
      await budget.setBudgetedAmount('Food', '0');
      await openBalance(row);
      await expect(panel()).toContainText('650.00 needed');
      await page.keyboard.press('Escape');

      // Touch-size buttons must open the menu even with goal tooltips disabled.
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileRow = page.getByTestId('category-row').filter({
        has: page
          .getByTestId('category-name')
          .getByText('Food', { exact: true }),
      });
      await expectCompactMobileRow(mobileRow);
      const mobileBalance = mobileRow.getByRole('button', {
        name: /Open balance menu/,
      });
      await expect(mobileBalance).toBeEnabled();
      const icon = await mobileBalance.locator('svg').first().boundingBox();
      const text = await mobileBalance.locator('span').last().boundingBox();
      if (!icon || !text) {
        throw new Error('Funding badge must show an icon and amount');
      }
      expect(
        Math.abs(icon.y + icon.height / 2 - text.y - text.height / 2),
      ).toBeLessThanOrEqual(2);
      await mobileBalance.click();
      await expect(panel()).toBeVisible();
      await expect(panel()).toContainText('650.00 needed');
      await page.setViewportSize({ width: 320, height: 844 });
      const menuBox = await panel().boundingBox();
      expect(menuBox).not.toBeNull();
      expect(menuBox!.x).toBeGreaterThanOrEqual(0);
      expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(320);
      await panel().screenshot({
        path: test.info().outputPath('mobile-funding-menu.png'),
      });
      await expect(panel()).toMatchThemeScreenshots();
      await assign().click();
      await expect(panel().getByText('Funded', { exact: true })).toBeVisible();
      await page
        .getByTestId(`${budgetType.toLowerCase()}-balance-menu-modal`)
        .getByRole('button', { name: 'Close', exact: true })
        .click();
      await expectCompactMobileRow(mobileRow);
      await expect(
        mobileRow.getByRole('button', { name: /: Funded$/ }),
      ).toBeVisible();
      await page.setViewportSize({ width: 1280, height: 900 });
      await row.getByTestId('category-name').hover();
      await row
        .getByRole('button', { name: 'Change category automations' })
        .click();
      const modal = page.getByRole('dialog');
      await modal
        .getByRole('button', { name: 'Delete automation', exact: true })
        .click();
      await modal.getByRole('button', { name: 'Save', exact: true }).click();
      await row.getByTestId('balance').first().getByRole('button').click();
      await expect(panel()).toHaveCount(0);
      await expect(
        page.getByText('Rollover overspending', { exact: true }),
      ).toBeVisible();
    });

    if (budgetType === 'Envelope') {
      test('fully funds at nonzero priority into overbudget and restores available funds with undo', async () => {
        await automation('Food', '650', '1');
        await budget.setBudgetedAmount('Food', '400');
        await budget.setBudgetedAmount('Restaurants', '200');
        const row = rowFor('Food');
        const neighbor = rowFor('Restaurants').getByTestId('budget').first();
        const unchanged = await neighbor.innerText();
        await openBalance(row);
        await assign().focus();
        await page.keyboard.press('Space');
        await expect(row.getByTestId('budget').first()).toHaveText('650.00');
        await expect(neighbor).toHaveText(unchanged);
        const summary = page.locator(
          `[data-testid="budget-summary"][data-month="${await budget.getSelectedMonth()}"]`,
        );
        await expect(summary).toContainText('-150.00');
        await page.keyboard.press('Escape');
        await page.keyboard.press('Control+z');
        await expect(row.getByTestId('budget').first()).toHaveText('400.00');
        await expect(summary).toContainText('100.00');
      });
    }

    if (budgetType === 'Tracking') {
      test('keeps tracking income funding accessible on desktop and mobile', async () => {
        await automation('Income', '1200');
        const row = rowFor('Income');
        const cell = row.getByTestId('budget').first();
        await cell.click();
        await cell.locator('input').fill('400');
        await cell.locator('input').press('Enter');
        await row.hover();
        await row
          .getByRole('button', { name: 'Budget menu for Income' })
          .first()
          .click();
        await expect(panel()).toContainText('800.00 needed');
        await assign().click();
        await expect(cell).toHaveText('1,200.00');
        await expect(panel()).toBeHidden();
        await page.keyboard.press('Control+z');
        await expect(cell).toHaveText('400.00');
        await page.setViewportSize({ width: 390, height: 844 });
        const mobileRow = page.getByTestId('category-row').filter({
          has: page
            .getByTestId('category-name')
            .getByText('Income', { exact: true }),
        });
        await expectCompactMobileRow(mobileRow);
        await mobileRow
          .getByRole('button', { name: /Open balance menu/ })
          .click();
        await expect(panel()).toContainText('800.00 needed');
        await expect(
          page.getByText('View transactions', { exact: true }),
        ).toBeVisible();
        await assign().click();
        await expect(
          panel().getByText('Funded', { exact: true }),
        ).toBeVisible();
        await page
          .getByTestId(`${budgetType.toLowerCase()}-balance-menu-modal`)
          .getByRole('button', { name: 'Close', exact: true })
          .click();
        await expect(
          mobileRow.getByRole('button', { name: /: Funded$/ }),
        ).toBeVisible();
        await page.setViewportSize({ width: 1280, height: 900 });
        await expect(cell).toHaveText('1,200.00');
      });
    }
  });
}
