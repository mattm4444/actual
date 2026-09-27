import { appendFileSync } from 'node:fs';

import * as aql from '#server/aql';
import * as db from '#server/db';
import * as sheet from '#server/sheet';
import type { Template } from '#types/models/templates';

import { createAllBudgets } from './base';
import {
  getCategoryFunding,
  getMonthlyCategoryFunding,
  storeTemplates,
} from './goal-template';
import type { MonthlyCategoryFunding } from './goal-template';

beforeEach(async () => {
  await global.emptyDatabase()();
  await sheet.loadSpreadsheet(db);
});

afterEach(() => vi.restoreAllMocks());

it.each([20, 100, 300])(
  'preserves independent results for %i real database categories with constant shared reads',
  async count => {
    await db.insertCategoryGroup({ id: 'goals', name: 'Goals' });
    await db.insertCategoryGroup({
      id: 'income',
      name: 'Income',
      is_income: 1,
    });
    const ids: string[] = [];
    const categoriesWithTemplates: { id: string; templates: Template[] }[] = [];
    for (let i = 0; i < count; i++) {
      const templates: Template[] = [
        {
          type: 'simple',
          monthly: 100 + i,
          priority: i % 3,
          directive: 'template',
        },
      ];
      ids.push(
        await db.insertCategory({
          id: `goal-${i}`,
          name: `Goal ${i}`,
          cat_group: 'goals',
        }),
      );
      categoriesWithTemplates.push({ id: ids[i], templates });
    }
    await storeTemplates({ categoriesWithTemplates, source: 'ui' });
    await createAllBudgets();
    await sheet.waitOnSpreadsheet();
    const month = '2017-01';
    const query = vi.spyOn(aql, 'aqlQuery');
    const singleStart = performance.now();
    const expected: MonthlyCategoryFunding = {};
    for (const categoryId of ids) {
      expected[categoryId] = {
        funding: await getCategoryFunding({ month, categoryId }),
      };
    }
    const singleMs = performance.now() - singleStart;
    const singleReads = query.mock.calls.length;
    expect(singleReads).toBe(3 * count);
    query.mockClear();
    const batchStart = performance.now();
    const actual = await getMonthlyCategoryFunding({ month });
    const batchMs = performance.now() - batchStart;
    const batchReads = query.mock.calls.length;
    expect(actual).toEqual(expected);
    expect(Object.keys(actual)).toHaveLength(count);
    expect(actual[ids[0]].funding?.recommended).toBe(10000);
    expect(batchReads).toBe(3);
    // Timings are diagnostic only; query counts and amounts are deterministic.
    if (process.env.FUNDING_BENCHMARK_OUTPUT) {
      appendFileSync(
        process.env.FUNDING_BENCHMARK_OUTPUT,
        JSON.stringify({ count, singleReads, batchReads, singleMs, batchMs }) +
          '\n',
      );
    }
  },
);
