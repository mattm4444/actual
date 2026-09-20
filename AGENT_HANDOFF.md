# Actual Budget category funding handoff

Last updated: September 20, 2026. Implementation is finished. The user reports that CI has finished and will provide its results; the latest run result has not been retrieved. See [the detailed validation report](feature-validation/category-funding/VALIDATION.md) for the exact file map, behavior, evidence and manual checklist.

## Repository and authorization

- Local checkout: `C:\Users\mattf\Actual Budget`, branch `category-funding`.
- Remote named `private`: https://github.com/mattm4444/actual-budget-category-feature. Push only to `private`; `origin` is public upstream.
- Starting upstream: `5a131c7c8821ab09a04d66226f06b616b9b2c605`.
- Latest implementation and Linux baselines: `1a8d3e0e4ac449598837b667af3c4861c2e2ce0e`.
- The user has updated GitHub review access and requested this final commit/push. Keep using the configured `private` remote. No new PR or deployment was requested.
- Latest instruction: commit and push, then end the turn. Do not wait for, poll or monitor GitHub Actions. Do not rerun the full local test suite when CI will run it. The user will return with CI results.
- Follow `AGENTS.md`, `.claude/skills/committing-actual-changes/SKILL.md`, `.claude/skills/running-vrts/SKILL.md` and `.github/agents/pr-and-commit-rules.md`. Prefix commits `[AI]`; never bypass hooks. Run Yarn from the repository root.

## User requirements and implementation

Expose monthly category underfunding, amount needed, completed status and one-click Fund using Actual's existing Budget Automation engine. Preserve extra allocations, neighboring categories, priority constraints, normal Apply behavior and undo/redo. No additional goals data model, duplicated schedule math or bulk fund-all.

`computeCategoryFunding` reuses `computeTemplates` / `CategoryTemplateContext`. The existing dry-run projection gives an absolute monthly recommendation; the normal clamped engine gives the allowed increment. `budget/fund-category` recomputes inside `mutator(undoable(...))`, then updates only the category through `setBudget` / `setGoal` inside `batchMessages`. A no-op returns false and produces no misleading mobile Undo toast.

One shared `CategoryFundingStatus` covers desktop/mobile expense rows and tracking-income rows. Envelope income is excluded. Reads use existing saved UI definitions or the scoped legacy note parser, without writing definitions. Category/month queries refresh on changed data, undo/redo and Fund; empty sync events do not invalidate. Background recalculation preserves keyboard focus. Positive completed recommendations show Funded; nonpositive recommendations show No funding needed; errors fail closed.

Standalone balance goals, cleanup-only and limit-only definitions have no engine-prescribed monthly allocation and intentionally receive no invented Fund amount. Existing goal indicators remain. Expired save-by definitions show Automation unavailable. Priority zero keeps Actual's existing overbudget behavior. No large-budget stress benchmark was performed.

## Validation

Latest Linux run (result to be provided by the user): https://github.com/mattm4444/actual-budget-category-feature/actions/runs/35529409043

This run tests workflow commit `76ba663a0` with application code unchanged from `1a8d3e0e4` and screenshot regeneration disabled. Workspaces run serially to reduce contention; browser checks continue independently after a unit failure without hiding that failure. All 51 Linux baselines were generated in the pinned Playwright container in earlier run `35519077705`, then rerun and visually inspected across light/dark/midnight themes. The earlier run passed full typecheck, lint, all nine test workspaces, 12 browser interactions and four themed VRT scenarios. It predates only the final no-op Undo fix.

After that fix, local repository typecheck, 142 engine tests (27 feature plus 115 existing), 17 component tests and changed-file type-aware lint passed. Translation generation succeeded for 1255 files; generated locale output is ignored by repository policy.

Windows full checks have separately verified limitations: lint flags exactly the same 438 unchanged files as a clean upstream checkout. Feature core tests had 1197 passed, two failed and two skipped because `main.test.ts` cannot remove the SQLite fixture (EBUSY), followed by EEXIST. Clean upstream reproduced those same two failures (1170 passed, two failed, two skipped). Sync-server passed all 604 assertions in both checkouts but failed SQLite teardown with EBUSY. Earlier timeout/database-not-open/missing-column failures were not all reproduced; do not generalize that every prior failure is a confirmed baseline issue.

Clean upstream also had two Linux AQL executor timeouts in run `35518729757`; that is separate from the feature run and from Windows SQLite errors. Use the final Linux run's actual step results as completion evidence, not an earlier workflow badge.

The first final-code Linux run, [35528520920](https://github.com/mattm4444/actual-budget-category-feature/actions/runs/35528520920), passed typecheck and lint but failed full tests: eight workspaces passed; core had 1196 passing, three timed-out AQL executor tests and two skipped. All 27 funding engine tests and 17 component tests passed. The three timeouts were aggregate queries with grouped splits, unfiltered transactions and filtered transactions (20 seconds each). The latter two also timed out on unchanged upstream; the aggregate case was not separately reproduced there. Browser checks were skipped in that run. The subsequent run uses `LAGE_POOL_CONCURRENCY=1` without changing assertions or timeout thresholds and retains independent browser results even if units fail.

## Reference commands

These commands document prior verification and future reproducibility. The latest user instruction above controls whether to run them; do not start or monitor another CI run on your own.

```powershell
corepack yarn workspace @actual-app/core test:node src/server/budget/category-funding.test.ts src/server/budget/goal-template.test.ts src/server/budget/category-template-context.test.ts src/server/budget/schedule-template.test.ts
corepack yarn workspace @actual-app/web test src/components/budget/goals/CategoryFundingStatus.test.tsx
corepack yarn typecheck
corepack yarn lint
corepack yarn test
$featureFiles = @(git diff --name-only 5a131c7c8 -- '*.ts' '*.tsx')
corepack yarn oxfmt --check @featureFiles
corepack yarn oxlint --type-aware --quiet @featureFiles
```

Configured Linux workflow (does not regenerate snapshots by default):

```powershell
gh workflow run category-funding-validation.yml --repo mattm4444/actual-budget-category-feature --ref category-funding -f baseline=false -f updateSnapshots=false
```

Set `baseline=true` only when an additional unchanged-upstream run is needed. Set `updateSnapshots=true` only for deliberate feature snapshot updates, inspect the generated PNGs and download/commit them. Never rename host snapshots to Linux names or update unrelated VRTs. Feature lint/test failures now fail the workflow rather than being ignored.

## Local Windows development and artifacts

The checkout path contains a space; upstream watch-browser quoting and Vite's `spawn('yarn')` CMD handling required separate backend/frontend startup:

```powershell
corepack yarn workspace @actual-app/core vite build --config vite.config.mts --mode development --watch
# Second terminal, also from repository root:
$env:BROWSER='none'
corepack yarn workspace @actual-app/web start --mode=browser
```

If needed first, run `corepack yarn build:plugins-service`. The redundant frontend backend-spawn error can persist while the separate watcher supplies the worker. Heavy checks running alongside watchers produced Windows EBUSY and a stopped server; use the Linux production-build workflow for reliable browser verification. Do not treat connection-refused failures after that watcher crash as successful tests.

Git hooks are installed at `.husky/_`; local ignored Corepack shims are `.yarn/local-shims`. Add that directory and `node_modules/.bin` to PATH for commits if Yarn is unavailable globally. Keep hooks enabled.

Tests have left unrelated snapshot line-ending changes and `packages/loot-core/src/mocks/files/budgets/test-budget/` in the working tree. These were not committed. Do not delete or stage them indiscriminately. Downloaded `.funding-linux-artifacts/`, contact sheets and local logs are also untracked/ignored verification artifacts. The isolated baseline worktree is `C:\Users\mattf\actual-funding-upstream-check`.

Four shareable synthetic-demo evidence images from passing Linux run `35519077705` (before the no-op Undo fix) and the full manual checklist are in `feature-validation/category-funding/`. They are distinct from the 51 tracked Linux regression baselines under `packages/desktop-client/e2e/category-funding.test.ts-snapshots/`.
