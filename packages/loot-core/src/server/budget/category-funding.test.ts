import { vi } from 'vitest';

import * as aql from '#server/aql';
import * as db from '#server/db';
import { Rule } from '#server/rules';
import { getRuleForSchedule } from '#server/schedules/app';
import type { CategoryEntity } from '#types/models';
import type { Template } from '#types/models/templates';

import * as actions from './actions';
import {
  applySingleCategoryTemplate,
  dryRunCategoryTemplate,
  fundCategory,
  getCategoryFunding,
} from './goal-template';
import * as statements from './statements';
import { getCategoriesWithTemplates } from './template-notes';

vi.mock('./actions', () => ({
  getSheetValue: vi.fn(),
  getSheetBoolean: vi.fn(),
  isTrackingBudget: vi.fn(),
  setBudget: vi.fn(),
  setGoal: vi.fn(),
}));
vi.mock('#server/db', () => ({
  getCategories: vi.fn(),
  getAccounts: vi.fn(),
  first: vi.fn(),
}));
vi.mock('#server/aql', () => ({ aqlQuery: vi.fn() }));
vi.mock('#server/sync', () => ({
  batchMessages: (fn: () => Promise<void>) => fn(),
}));
vi.mock('./statements', () => ({ getActiveSchedules: vi.fn() }));
vi.mock('./template-notes', () => ({
  getCategoriesWithTemplates: vi.fn(),
  storeNoteTemplates: vi.fn(),
  checkTemplateNotes: vi.fn(),
}));
vi.mock('#server/schedules/app', () => ({ getRuleForSchedule: vi.fn() }));

const category: CategoryEntity = {
  id: 'groceries',
  name: 'Groceries',
  group: 'usual',
  is_income: false,
  template_settings: { source: 'ui' },
};
const fixed: Template = {
  type: 'simple',
  monthly: 650,
  priority: 0,
  directive: 'template',
};
const request = { month: '2024-01', categoryId: category.id };
let budgeted: number;
let available: number;
let rollover: number;
let carryover: boolean;
let spent: number;
let templates: Template[];

beforeEach(() => {
  vi.clearAllMocks();
  category.is_income = false;
  budgeted = 0;
  available = 100000;
  rollover = 0;
  carryover = false;
  spent = 0;
  templates = [fixed];
  vi.mocked(actions.isTrackingBudget).mockReturnValue(false);
  vi.mocked(actions.getSheetBoolean).mockImplementation(async () => carryover);
  vi.mocked(actions.getSheetValue).mockImplementation(async (sheet, key) => {
    if (key === 'to-budget' || key === 'total-saved') return available;
    if (key === 'budget-groceries') return budgeted;
    if (key === 'leftover-groceries') {
      return sheet === 'budget202312' ? rollover : rollover + budgeted + spent;
    }
    if (key === 'sum-amount-groceries') return spent;
    return 0;
  });
  vi.mocked(actions.setBudget).mockImplementation(async ({ amount }) => {
    if (typeof amount !== 'number') throw new Error('Expected numeric budget');
    available -= amount - budgeted;
    budgeted = amount;
  });
  vi.mocked(aql.aqlQuery).mockImplementation(async query => {
    const text = JSON.stringify(query);
    if (text.includes('hideFraction')) {
      return { data: [{ value: 'false' }], dependencies: [] };
    }
    if (text.includes('defaultCurrencyCode')) {
      return { data: [{ value: 'USD' }], dependencies: [] };
    }
    if (text.includes('categories')) {
      return {
        data: [{ ...category, goal_def: JSON.stringify(templates) }],
        dependencies: [],
      };
    }
    return { data: [], dependencies: [] };
  });
  vi.mocked(db.getCategories).mockResolvedValue([]);
  vi.mocked(db.getAccounts).mockResolvedValue([]);
  vi.mocked(statements.getActiveSchedules).mockResolvedValue([]);
});

it.each([
  [0, 65000],
  [40000, 25000],
  [65000, 0],
  [90000, 0],
])(
  'a 650-dollar automation with %i budgeted has %i remaining',
  async (amount, remaining) => {
    budgeted = amount;
    expect(await getCategoryFunding(request)).toMatchObject({
      recommended: 65000,
      remaining,
    });
    expect(actions.setBudget).not.toHaveBeenCalled();
    expect(actions.setGoal).not.toHaveBeenCalled();
  },
);

it('funds only this category to the absolute recommendation, and repeated clicks are no-ops', async () => {
  budgeted = 40000;
  await fundCategory(request);
  expect(actions.setBudget).toHaveBeenCalledExactlyOnceWith({
    month: '2024-01',
    category: 'groceries',
    amount: 65000,
  });
  expect(await getCategoryFunding(request)).toMatchObject({
    remaining: 0,
    amountToFund: 0,
  });
  await fundCategory(request);
  expect(actions.setBudget).toHaveBeenCalledTimes(1);
});

it('rechecks a now-overfunded category and never removes the extra money', async () => {
  budgeted = 40000;
  expect(await getCategoryFunding(request)).toMatchObject({ remaining: 25000 });
  budgeted = 90000;
  await fundCategory(request);
  expect(actions.setBudget).not.toHaveBeenCalled();
});

it('uses the refill engine with rollover, rather than cap minus current budget', async () => {
  templates = [
    { type: 'refill', priority: 0, directive: 'template' },
    {
      type: 'limit',
      amount: 650,
      period: 'monthly',
      hold: false,
      priority: null,
      directive: 'template',
    },
  ];
  rollover = 20000;
  budgeted = 10000;
  expect(await getCategoryFunding(request)).toMatchObject({
    recommended: 45000,
    remaining: 35000,
  });
  await fundCategory(request);
  expect(budgeted).toBe(45000);
  spent = -30000;
  expect(await getCategoryFunding(request)).toMatchObject({ remaining: 0 });
});

it('does not confuse spending after monthly funding with underfunding', async () => {
  budgeted = 65000;
  spent = -60000;
  expect(await getCategoryFunding(request)).toMatchObject({ remaining: 0 });
});

it('uses save-by-date monthly allocations from the existing engine', async () => {
  templates = [
    {
      type: 'by',
      amount: 1200,
      month: '2024-04',
      priority: 0,
      directive: 'template',
    },
  ];
  rollover = 40000;
  budgeted = 5000;
  const projection = await dryRunCategoryTemplate({ ...request, templates });
  expect(projection.budgeted).toBe(20000);
  expect(await getCategoryFunding(request)).toMatchObject({
    recommended: projection.budgeted,
    remaining: 15000,
  });
});

it('uses recurring schedules through the real schedule engine', async () => {
  templates = [
    { type: 'schedule', name: 'Rent', priority: 0, directive: 'template' },
  ];
  vi.mocked(statements.getActiveSchedules).mockResolvedValue([
    {
      id: 'rent',
      name: 'Rent',
      rule: 'rule',
      active: 1,
      completed: 0,
      posts_transaction: 0,
      tombstone: 0,
    },
  ]);
  vi.mocked(db.first).mockResolvedValue({
    id: 'rent',
    name: 'Rent',
    completed: 0,
  });
  vi.mocked(getRuleForSchedule).mockResolvedValue(
    new Rule({
      id: 'rule',
      stage: 'pre',
      conditionsOp: 'and',
      actions: [],
      conditions: [
        {
          op: 'is',
          field: 'date',
          type: 'date',
          value: {
            start: '2024-01-01',
            interval: 1,
            frequency: 'monthly',
            patterns: [],
            skipWeekend: false,
            weekendSolveMode: 'before',
            endMode: 'never',
            endOccurrences: 1,
            endDate: '2099-01-01',
          },
        },
        { op: 'is', field: 'amount', type: 'number', value: -65000 },
      ],
    }),
  );
  budgeted = 40000;
  expect(await getCategoryFunding(request)).toMatchObject({
    recommended: 65000,
    remaining: 25000,
  });
  await fundCategory(request);
  expect(budgeted).toBe(65000);
});

it('preserves available-funds priority clamping without claiming the category is fully funded', async () => {
  templates = [{ ...fixed, priority: 1 }];
  budgeted = 40000;
  available = 10000;
  expect(await getCategoryFunding(request)).toMatchObject({
    remaining: 25000,
    amountToFund: 10000,
  });
  await fundCategory(request);
  expect(budgeted).toBe(50000);
  expect(await getCategoryFunding(request)).toMatchObject({
    remaining: 15000,
    amountToFund: 0,
  });
  await fundCategory(request);
  expect(actions.setBudget).toHaveBeenCalledTimes(1);
});

it('shows future monthly demand with no available funds, while preserving priority rules', async () => {
  templates = [{ ...fixed, priority: 1 }];
  available = 0;
  expect(
    await getCategoryFunding({ ...request, month: '2027-01' }),
  ).toMatchObject({ remaining: 65000, amountToFund: 0 });
});

it('keeps the existing priority-zero ability to budget beyond available funds', async () => {
  available = 0;
  await fundCategory(request);
  expect(budgeted).toBe(65000);
  expect(available).toBe(-65000);
});

it('uses balance caps and does not remove carried-over excess', async () => {
  templates = [
    { ...fixed, limit: { amount: 700, period: 'monthly', hold: false } },
  ];
  rollover = 60000;
  expect(await getCategoryFunding(request)).toMatchObject({
    recommended: 10000,
    remaining: 10000,
  });
  rollover = 80000;
  expect(await getCategoryFunding(request)).toMatchObject({
    recommended: -10000,
    remaining: 0,
  });
  await fundCategory(request);
  expect(actions.setBudget).not.toHaveBeenCalled();
});

it.each([false, true])(
  'preserves the existing negative rollover rule when carryover is %s',
  async flag => {
    templates = [
      {
        type: 'simple',
        limit: { amount: 650, period: 'monthly', hold: false },
        priority: 0,
        directive: 'template',
      },
    ];
    rollover = -10000;
    carryover = flag;
    expect(await getCategoryFunding(request)).toMatchObject({
      recommended: flag ? 75000 : 65000,
    });
  },
);

it.each(
  (
    [
      [],
      [{ type: 'goal', amount: 10000, directive: 'goal' }],
      [
        {
          type: 'limit',
          amount: 650,
          period: 'monthly',
          hold: false,
          priority: null,
          directive: 'template',
        },
      ],
    ] satisfies Template[][]
  ).map(definitions => [definitions]),
)(
  'does not invent monthly funding for definitions without an allocating automation',
  async definitions => {
    templates = definitions;
    expect(await getCategoryFunding(request)).toBeNull();
    await fundCategory(request);
    expect(actions.setBudget).not.toHaveBeenCalled();
  },
);

it('fails closed for an expired save-by goal instead of showing a funded check', async () => {
  templates = [
    {
      type: 'by',
      amount: 1200,
      month: '2023-12',
      priority: 0,
      directive: 'template',
    },
  ];
  await expect(getCategoryFunding(request)).rejects.toThrow(
    'Target month has passed',
  );
  await expect(fundCategory(request)).rejects.toThrow(
    'Target month has passed',
  );
  expect(actions.setBudget).not.toHaveBeenCalled();
});

it('existing Apply Automation still overwrites an overfunded allocation', async () => {
  budgeted = 90000;
  await applySingleCategoryTemplate({
    month: request.month,
    category: category.id,
  });
  expect(budgeted).toBe(65000);
});

it('reads note templates using the existing parser entry point without saving definitions', async () => {
  vi.mocked(aql.aqlQuery).mockImplementation(async query => {
    if (JSON.stringify(query).includes('categories')) {
      return {
        data: [{ ...category, template_settings: { source: 'notes' } }],
        dependencies: [],
      };
    }
    return { data: [], dependencies: [] };
  });
  vi.mocked(getCategoriesWithTemplates).mockResolvedValue([
    { id: category.id, name: category.name, templates: [fixed] },
  ]);
  expect(await getCategoryFunding(request)).toMatchObject({ remaining: 65000 });
  expect(getCategoriesWithTemplates).toHaveBeenCalledWith([category.id]);
});

it('uses the periodic engine to distinguish an off-month from the next allocation', async () => {
  templates = [
    {
      type: 'periodic',
      amount: 650,
      period: { period: 'month', amount: 2 },
      starting: '2024-02-01',
      priority: 0,
      directive: 'template',
    },
  ];
  expect(await getCategoryFunding(request)).toMatchObject({
    recommended: 0,
    remaining: 0,
    amountToFund: 0,
  });
  await fundCategory(request);
  expect(actions.setBudget).not.toHaveBeenCalled();
  expect(
    await getCategoryFunding({ ...request, month: '2024-02' }),
  ).toMatchObject({ recommended: 65000, remaining: 65000 });
});

it('rechecks replaced and removed automations before a stale Fund request', async () => {
  expect(await getCategoryFunding(request)).toMatchObject({ remaining: 65000 });
  templates = [{ ...fixed, monthly: 200 }];
  await fundCategory(request);
  expect(budgeted).toBe(20000);
  templates = [];
  await fundCategory(request);
  expect(actions.setBudget).toHaveBeenCalledTimes(1);
  expect(await getCategoryFunding(request)).toBeNull();
});

it.each([false, true])(
  'only allocates income in tracking mode (%s)',
  async tracking => {
    category.is_income = true;
    vi.mocked(actions.isTrackingBudget).mockReturnValue(tracking);
    const result = await getCategoryFunding(request);
    if (tracking) expect(result).toMatchObject({ remaining: 65000 });
    else expect(result).toBeNull();
    await fundCategory(request);
    expect(actions.setBudget).toHaveBeenCalledTimes(tracking ? 1 : 0);
  },
);

it('rejects malformed non-finite engine amounts without writing a budget', async () => {
  templates = [{ ...fixed, monthly: Number.NaN }];
  // JSON serialization turns NaN into null; mimic corrupt saved input instead.
  vi.mocked(aql.aqlQuery).mockImplementation(async query => ({
    data: JSON.stringify(query).includes('categories')
      ? [
          {
            ...category,
            goal_def:
              '[{"type":"simple","monthly":"invalid","priority":0,"directive":"template"}]',
          },
        ]
      : [],
    dependencies: [],
  }));
  await expect(getCategoryFunding(request)).rejects.toThrow();
  await expect(fundCategory(request)).rejects.toThrow();
  expect(actions.setBudget).not.toHaveBeenCalled();
});
