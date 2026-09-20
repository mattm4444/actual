# Actual Budget category funding feature - agent handoff

Status: WORK IN PROGRESS. Do not describe this feature as complete or production-ready.

## Repository and authorization

- User requested implementation, then a private GitHub upload and a file another agent can use to continue.
- Private repository: https://github.com/mattm4444/actual-budget-category-feature
- Local checkout: C:\Users\mattf\Actual Budget
- Feature branch: category-funding.
- Starting upstream commit: 5a131c7c8 from actualbudget/actual.
- Remote origin is the public upstream; remote private is the user's private repository. Push only to private for this task.
- No PR or public issue was requested. No deployment is authorized by this handoff.
- Read AGENTS.md, CONTRIBUTING.md, packages/docs/docs/contributing/testing.md, and relevant .claude/skills before continuing. Commit messages must start with [AI]; do not bypass hooks.

## User requirements

Expose monthly category underfunding, amount needed, completed status, and one-click Fund using Actual's EXISTING Budget Automation engine. No new goals/targets data model, no duplicated financial calculations, no bulk fund-all. Preserve additional allocations, other categories, normal To Budget/priority constraints, and undo/redo. Recalculate on edits, spending, automation changes, and month navigation.

Required cases: fixed amount; partial/full/excess funding; refill/up-to with rollover; recurring schedules; save-by-date; spending after funding; future months; priorities and balance caps; no automation; keyboard/accessibility; existing Apply behavior unchanged.

Before completion run yarn typecheck, yarn lint, yarn test, relevant web E2E and Linux visual tests. Deliver exact files changed, reused APIs, test results, limitations, manual checklist, and four screenshots (underfunded, partially funded, fully funded, after Fund).

## Implementation already present

The plan was communicated before editing. The implementation reuses computeTemplates in goal-template.ts, the SAME function called by dryRunCategoryTemplate and processTemplate (Apply Automation). It does not implement target-minus-budgeted calculations from raw automation parameters.

Read funding: computeCategoryFunding runs the engine with force=true and skipAvailableClamp=true to obtain its absolute monthly recommendation, then subtracts the current monthly budget and floors at zero. If underfunded, it runs the normal clamped engine to find the allowed increment. This mirrors the existing projection versus Apply distinction.

Fund: budget/fund-category is registered with mutator(undoable(...)). It recomputes from current server state, writes only this category via setBudget/setGoal inside batchMessages, and does nothing if no positive increment is allowed. Repeated/stale clicks cannot reduce extra funding. Priority-zero automations retain Actual's existing ability to make To Budget negative; priority>0 respects engine clamping and can partially fund.

Notes: exported the existing getCategoriesWithTemplates parser entry point for read-only evaluation of legacy note templates, avoiding writes while rendering.

UI: CategoryFundingStatus uses existing Button, Tooltip, SvgCheckmark, semantic theme colors, tabular numerals, PrivacyFilter, translated strings, query cache, useBudgetActions, and error/undo notifications. ExpenseCategory wraps each month component with a small second line. This covers desktop envelope and tracking EXPENSE rows; rows without a computed automation have no extra line. Existing pie icon still edits automations because one category icon cannot represent multiple displayed months.

Refresh: fundingQueries is invalidated on applied/success sync events, undo events, and after funding. Different month/category pairs have separate query keys.

## Exact feature files

- packages/loot-core/src/server/budget/goal-template.ts: CategoryFunding type, computeCategoryFunding, getCategoryFunding, fundCategory.
- packages/loot-core/src/server/budget/app.ts: typed read and undoable mutation handlers.
- packages/loot-core/src/server/budget/template-notes.ts: export existing read-only parser helper.
- packages/loot-core/src/server/budget/category-funding.test.ts: 22 real-engine tests with mocked persistence/sheet inputs; schedule calculations use the real Rule/schedule engine.
- packages/desktop-client/src/budget/queries.ts: funding query keys/options.
- packages/desktop-client/src/budget/mutations.ts: fund-category routing through useBudgetActions.
- packages/desktop-client/src/global-events.ts: invalidate funding after undo/redo events.
- packages/desktop-client/src/sync-events.ts: invalidate after data changes.
- packages/desktop-client/src/components/budget/ExpenseCategory.tsx: per-month status placement and flexible row height.
- packages/desktop-client/src/components/budget/goals/CategoryFundingStatus.tsx: funding UI.
- packages/desktop-client/src/components/budget/goals/CategoryFundingStatus.test.tsx: 10 component tests.
- packages/desktop-client/e2e/category-funding.test.ts: envelope/tracking E2E workflow with screenshot captures and theme assertions. Still being debugged; do not assume it passes.

## Validation checkpoint

- Dependency install: corepack yarn install --immutable completed, existing peer warnings.
- Targeted engine tests: 137 passed (22 new + 115 existing) in four files, initial development run.
- Component tests: 10 passed, initial development run. Later edits corrected strict test typings and lint; rerun after final changes.
- Typecheck: implementation initially passed all 10 workspaces before adding tests. Later runs identified test-only mock types and null goal_def errors, which were corrected. Final rerun pending at initial checkpoint.
- Full yarn lint: failed formatting on 438 existing files in the Windows CRLF checkout. No repository-wide reformat was performed. Feature-only oxlint passes after fixes. Verify baseline and report it separately.
- Full yarn test: started; completion/result pending at initial checkpoint.
- Web E2E: initial run timed out making the demo under concurrent load; retries reached Settings and failed because check() asserted before the asynchronous toggle update. Updated to click then expect(...).toBeChecked(); rerun pending at initial checkpoint.
- VRT: Docker not installed on PATH. Repository skill REQUIRES Linux Docker-generated committed baselines; do not generate Windows baselines and rename them. New test contains toMatchThemeScreenshots calls. Use a Linux/Docker environment or authorized CI later.
- Requested screenshots: not yet verified at initial checkpoint. Test saves them in its Playwright output directory once it reaches the feature.

Ignored local logs: .funding-core-tests.log, .funding-ui-tests.log, .typecheck-funding.log, .lint-funding.log, .lint-changed-funding.log, .test-funding.log, .e2e-funding.log, .funding-dev-server.log, .funding-backend.log. These are local only, not pushed. Update this section with terminal results before final delivery.

## Commands (run from repository root)

Use corepack yarn where yarn is not on PATH. Node v24.16.0, repository Yarn 4.17.1; installed Playwright Chromium 1.61.1 browser version.

```powershell
corepack yarn workspace @actual-app/core test:node src/server/budget/category-funding.test.ts src/server/budget/goal-template.test.ts src/server/budget/category-template-context.test.ts src/server/budget/schedule-template.test.ts
corepack yarn workspace @actual-app/web test src/components/budget/goals/CategoryFundingStatus.test.tsx
corepack yarn typecheck
corepack yarn lint
corepack yarn test
```

Windows development startup has TWO existing problems: watch-browser has an unquoted path and fails with the space in Actual Budget; Vite's backend plugin uses spawn('yarn') and fails ENOENT with a Windows CMD shim. Do not change unrelated startup code just for this feature. Start two terminals from the root:

```powershell
corepack yarn workspace @actual-app/core vite build --config vite.config.mts --mode development --watch
# In a second terminal (plugins-service dist was already built by the initial yarn start):
$env:BROWSER='none'
corepack yarn workspace @actual-app/web start --mode=browser
# If needed first: corepack yarn build:plugins-service
```

The frontend will still log its redundant backend spawn failure, but the separately running watcher supplies /kcab/kcab.worker.dev.js. Backend build was verified successful. Frontend is http://localhost:3001.

```powershell
$env:E2E_START_URL='http://localhost:3001'
corepack yarn workspace @actual-app/web e2e category-funding.test.ts --workers=1 --reporter=list --retries=0 --timeout=120000
```

Avoid unnecessary concurrent heavy checks on this 12GB Windows host. Full tests may rewrite snapshot LINE ENDINGS and generate packages/loot-core/src/mocks/files/budgets/test-budget/. These are test artifacts, not feature changes; inspect before cleaning and never commit the generated budget/database or unrelated snapshots.

## Remaining work and review risks

1. Finish/debug the Playwright flow using existing page models. Confirm actual UI rendering, keyboard focus, normal editing, undo/redo, no other category changes, and all four screenshot states. Inspect screenshots rather than claiming success from assertions alone.
2. Review status applicability: engine returns zero for periodic off-months; current UI may label that Funded. Expired save-by goals fail closed as Automation unavailable. User asked for applicable automations only; decide using engine information, not duplicated scheduling logic.
3. Standalone #goal is intentionally excluded: Actual treats it as a balance indicator and returns the already-budgeted value instead of a prescribed monthly allocation. Do NOT invent a monthly amount. This is a limitation relative to the broad request for every goal and must be discussed honestly; existing balance/goal UI remains untouched.
4. Mobile budget rows and tracking INCOME rows are not integrated. Phase 1 implementation is the shared desktop expense row. Evaluate scope explicitly before declaring completion.
5. Check performance and stale-state handling: per-category engine runs and broad invalidation are simple but may be costly for large budgets. Verify changes to notes, schedules, priorities, rollover, prefs, and remote sync invalidate correctly. Ensure a refetch cannot display an obsolete funded check after an edit.
6. Add coverage for month switching in UI, removing/replacing an automation, partial funding at nonzero priority, schedule changes, and malformed definitions where appropriate. Engine tests cover core financial variants but E2E must validate the real mutation/undo path.
7. Run required final checks. Isolate unchanged baseline failures using the upstream revision; do not call an uninvestigated failure pre-existing.
8. Generate translations with yarn generate:i18n and inspect only intentional changes. Add the appropriate release note if preparing a finished contribution.
9. Run the targeted Linux VRT and inspect light/dark/midnight layouts. Keep no-automation row layout unchanged, retain compactness and keyboard navigation.
10. Update this handoff and final report with actual results. Commit with [AI] prefix and push explicitly to private.

## Manual acceptance checklist

- Enable Goal templates (and Budget automations UI for editing). Add a monthly 650 automation to one expense category, priority zero.
- Budget 0: 650 needed. Budget 400: 250 needed. Fund: budget becomes 650 and Funded appears. Undo returns to 400; redo returns to 650.
- Budget 800: Funded, no Fund control, allocation preserved. Neighboring category unchanged.
- Refill cap with prior-month balance: compare against existing automation preview/application. Spending after funding must follow engine behavior, not blindly refill spent money.
- Check recurring schedule, save-by-date, future month, balance cap, priorities with insufficient available funds, and a category without automation.
- Tab to Fund, activate with Enter/Space, verify category/month accessible name and disabled/pending/error behavior. Check narrow desktop width, multi-month layout, privacy mode, and all themes.
