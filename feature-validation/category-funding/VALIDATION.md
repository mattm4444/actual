# Category funding validation

Status: implementation committed on `category-funding`. The user reports CI has finished and will supply its results. The latest run outcome has not been retrieved, in accordance with the instruction to stop monitoring Actions.

## Behavior

With Goal templates enabled, allocating budget automations show their engine-derived monthly shortfall and a keyboard-accessible Fund button. Funding adds only the currently allowed increment to one category. Positive recommendations show Funded when met; zero/negative recommendations show No funding needed. Extra allocations are preserved. The same control covers desktop and mobile expense rows and tracking-income rows. Envelope income stays excluded by the engine.

The existing CategoryTemplateContext / computeTemplates pipeline remains the only financial engine. Projection uses the same force/skipAvailableClamp mode as dryRunCategoryTemplate; the allowed increment uses normal Apply clamping. setBudget and setGoal run inside batchMessages and the existing mutator(undoable(...)) wrapper. Existing Apply Automation still retains its overwrite behavior.

Standalone #goal, cleanup-only, and limit-only definitions do not prescribe a monthly allocation and intentionally receive no invented Fund amount. The existing goal/balance indicator remains available. Expired save-by or malformed automations fail closed with Automation unavailable.

## Exact source files and purpose

| File                                                                               | Purpose                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| packages/loot-core/src/server/budget/goal-template.ts                              | Engine-backed status/read/mutation; preserve excess allocations; reject non-finite amounts.                                                                                      |
| packages/loot-core/src/server/budget/app.ts                                        | Typed read handler and serialized undoable Fund handler.                                                                                                                         |
| packages/loot-core/src/server/budget/template-notes.ts                             | Export the existing scoped read-only legacy parser.                                                                                                                              |
| packages/loot-core/src/server/budget/category-funding.test.ts                      | Real-engine regressions with mocked persistence/sheet inputs.                                                                                                                    |
| packages/desktop-client/src/budget/queries.ts                                      | Cache funding by category/month.                                                                                                                                                 |
| packages/desktop-client/src/budget/mutations.ts                                    | Route Fund through existing budget actions and notifications.                                                                                                                    |
| packages/desktop-client/src/global-events.ts                                       | Refresh funding after undo/redo.                                                                                                                                                 |
| packages/desktop-client/src/sync-events.ts                                         | Refresh after changed data; skip empty sync successes.                                                                                                                           |
| packages/desktop-client/src/components/budget/ExpenseCategory.tsx                  | Desktop expense placement and row height.                                                                                                                                        |
| packages/desktop-client/src/components/budget/IncomeCategory.tsx                   | Desktop tracking-income placement.                                                                                                                                               |
| packages/desktop-client/src/components/mobile/budget/ExpenseCategoryListItem.tsx   | Mobile expense placement.                                                                                                                                                        |
| packages/desktop-client/src/components/mobile/budget/IncomeCategoryListItem.tsx    | Mobile tracking-income placement.                                                                                                                                                |
| packages/desktop-client/src/components/budget/goals/CategoryFundingStatus.tsx      | Shared translated status, accessible Fund control, privacy filter, error and busy states.                                                                                        |
| packages/desktop-client/src/components/budget/goals/CategoryFundingStatus.test.tsx | Rendering, keyboard/focus, invalidation, removal, error, and busy-state tests.                                                                                                   |
| packages/desktop-client/e2e/category-funding.test.ts                               | Real browser mutations, mouse/Enter/Space, excess funding, neighbors, undo/redo, month changes, automation changes, mobile, tracking income, priorities, and themed screenshots. |
| .github/workflows/category-funding-validation.yml                                  | Manually dispatched private Linux container validation and exact-upstream comparison; read-only repository permissions.                                                          |
| upcoming-release-notes/category-funding.md                                         | Concise user-facing release note.                                                                                                                                                |
| AGENT_HANDOFF.md                                                                   | Reproducible continuation instructions and exact limitations.                                                                                                                    |
| feature-validation/category-funding/                                               | Evidence images and this report.                                                                                                                                                 |

Committed visual baselines: `packages/desktop-client/e2e/category-funding.test.ts-snapshots/` contains 51 Linux PNGs. The evidence directory below contains four separately named demo-state screenshots.

## Reactivity and performance review

Status reads do not persist goal definitions or cached goals. Legacy note parsing is scoped by category ID. Only enabled rows with an automation request a status; results are cached by category/month indefinitely until invalidated. Each read runs at most two engine evaluations. Actual data-change events invalidate all funding queries because transactions, schedules/rules, notes, preferences, priorities and rollover can affect the result; empty sync successes no longer do so. Inactive months become stale and are refreshed when mounted again. Closing a budget clears the query cache. Mutations are serialized and always recompute, so stale UI and repeated requests cannot double-fund or remove excess allocations. A no-op returns false and offers no mobile Undo toast, preserving earlier edit history.

Completed statuses show Updating during background reads. An available Fund button remains focusable during refresh; disabling it previously caused a real keyboard regression. Mutation-pending and unavailable-funds controls are disabled. No large-budget stress benchmark has been performed; the per-category architecture remains linear in visible automated rows/months.

## Tests

Final implementation: `1a8d3e0e4ac449598837b667af3c4861c2e2ce0e`. [Latest Linux run](https://github.com/mattm4444/actual-budget-category-feature/actions/runs/35529409043): result awaiting user review. Snapshot regeneration is disabled in this run. Workflow commit `76ba663a0` runs workspaces serially; application code is unchanged from `1a8d3e0e4`.

Verified locally after the no-op Undo fix:

- `corepack yarn typecheck`: pass across the repository.
- Four targeted engine files: 142 passed (27 feature + 115 existing).
- `CategoryFundingStatus.test.tsx`: 17 passed.
- Changed-file oxfmt and type-aware oxlint: pass.
- Translation generation: successful, 1255 files parsed; generated locale output is ignored.

[Prior Linux run](https://github.com/mattm4444/actual-budget-category-feature/actions/runs/35519077705) passed typecheck, lint, all nine unit-test workspaces, browser build, 12 E2E interactions, four scoped screenshot-generation scenarios and four subsequent comparison scenarios. All 51 baselines were visually inspected across light, dark and midnight, desktop/mobile expenses, tracking income and priority-limited funding. That run predates the final no-op Undo fix and is baseline provenance, not final-code validation.

Windows baseline comparison used a separate checkout and immutable dependency install at exact upstream `5a131c7c8821ab09a04d66226f06b616b9b2c605`:

| Check           | Feature checkout                                         | Unchanged upstream                            |
| --------------- | -------------------------------------------------------- | --------------------------------------------- |
| Full lint       | 438 formatting files                                     | Identical 438 files; all unchanged by feature |
| Core full tests | 1197 passed, 2 failed, 2 skipped                         | 1170 passed, 2 failed, 2 skipped              |
| Core failures   | SQLite fixture unlink EBUSY, then EEXIST in main.test.ts | Same failures                                 |
| Sync-server     | 604 assertions pass; SQLite teardown EBUSY               | Same result                                   |

Those Windows full runs preceded only the final no-op Undo fix; final targeted tests include it. Earlier timeout/database-not-open/missing-column errors were not all reproduced and are not claimed as confirmed baseline failures. A separate Linux upstream job in run `35518729757` failed two AQL executor timeouts; it does not invalidate the passing feature run. A later Windows browser attempt lost its Vite server to an EBUSY watcher error; final browser verification uses the production build in Linux.

The amount display follows Actual's existing PrivacyFilter behavior, including desktop hover-to-reveal and its current mobile limitation. No large-budget performance benchmark or real two-device remote-sync browser scenario was run. Refresh wiring for real data changes was reviewed, with query invalidation covered at component level; engine cases use real calculation code with mocked persistence/sheet inputs.

The first final-code Linux run, [35528520920](https://github.com/mattm4444/actual-budget-category-feature/actions/runs/35528520920), passed typecheck and lint but failed full tests: eight workspaces passed; core had 1196 passing, three timed-out AQL executor tests and two skipped. All 27 funding engine tests and 17 component tests passed. The three timeouts were aggregate queries with grouped splits, unfiltered transactions and filtered transactions (20 seconds each). The latter two also timed out on unchanged upstream; the aggregate case was not separately reproduced there. Browser checks were skipped in that run. The subsequent run uses `LAGE_POOL_CONCURRENCY=1` without changing assertions or timeout thresholds and retains independent browser results even if units fail.

## Manual checklist

1. Enable Goal templates and Budget automations UI. Set a monthly 650 automation on one expense category.
2. At 0 budgeted, see 650 needed. At 400, see 250 needed. Click Fund or activate it with Enter/Space: see 650 budgeted and Funded.
3. Undo to 400 and redo to 650. Allocate 800: extra funding stays. Check the neighboring category is unchanged.
4. Use priority 1 with only 100 available toward a 250 shortfall: add 100, leave 150 needed, disable Fund. Priority 0 retains Actual's existing ability to overbudget.
5. Navigate months, replace/delete the automation, and repeat in mobile and tracking-income rows.
6. Compare refill/rollover, recurring schedules, save-by-date, caps, and spending-after-funding with the existing engine's preview/Apply behavior. Check a zero-demand month, standalone goal, expired goal, and a category without automation.
7. Check privacy mode, narrow and multi-month desktop layouts, and light/dark/midnight themes.

## Evidence screenshots

Captured and visually inspected from the synthetic Envelope demo in passing Linux run `35519077705`, before the no-op Undo fix. These images document the visible funding states; they do not claim final-code CI success.

- [Underfunded](underfunded.png)
- [Partially funded](partially-funded.png)
- [Fully funded](fully-funded.png)
- [After clicking Fund](after-clicking-fund.png)
