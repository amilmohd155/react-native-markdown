# react-native-markdown

Markdown renderer for React Native (`@docren/react-native-markdown`). Mid-rewrite to v1.

## Branches

- `main`: v0.8.x, bug fixes only. Released via the manual **Release-it** workflow.
- `v1`: the rewrite. PRs for Phase 1 target `v1`, not `main`. "Closes #n" doesn't auto-close from `v1`, so close milestone issues by hand.

## Source of truth

- Design: `docs/rewrite/` (start at `README.md`). Plan: `docs/rewrite/phase-1/`.
- Decisions: D1–D8 in `docs/rewrite/07-roadmap.md`, P1-n in `docs/rewrite/phase-1/decisions.md`. Record new ones there.
- Tracking: issue #7, with sub-issues #8–#15 and #23 (one per milestone M0–M8).
- Waived or deferred items: carry to the next phase only if that phase depends on them; pure performance tuning waits for the optimization pass after the last feature phase (D9 in `docs/rewrite/07-roadmap.md`).
- Docs stay short (`docs/` is about 50k words; trim, don't grow):
  - Measurements, tables and run logs go in `bench/results/` (`REPORT.md` plus raw JSON), never in `docs/`. `docs/rewrite/02-benchmarks.md` holds conclusions only.
  - A decision entry is `Status · Date`, `Decision`, `Why` (a few lines) plus links to evidence. No pasted tables, no run-by-run history, no "considered" lists longer than a line each.
  - Tasks and issue drafts live in GitHub issues, not in docs. One protocol/harness doc per topic (`testing-harness.md`, `benchmark-protocol.md`), with phase sections inside, not a file per phase.

## Layout

- `src/{model,parse,plugins,render,theme,api}`: v1. No `any` (lint error). Public API is whatever `src/api/index.ts` exports; `src/index.tsx` re-exports it. v0 is gone (P1-19).
- `test/fixtures/`: vendored spec files. Don't edit by hand (see `SOURCES.md`). `test/spec/`: spec runner.
- `bench/`: private workspace (benchmarks, evidence scripts).

## Commands

`npx fallow dead-code` (unused code and deps, config in `.fallowrc.json`; keep it at 0) · `yarn lint` · `yarn typecheck` · `yarn test` (unit) · `yarn test:spec` · `yarn check:expo-go` · `yarn prepare` (build) · `yarn check:public-types` (after a build)

## Rules

- Commit or push only when asked.
- Conventional commits with a lowercase subject (commitlint), e.g. `feat(v1): …`.
- The main entry must stay pure JS so it works in Expo Go (D2). `check:expo-go` enforces this.
- Never run downloaded scripts to generate fixtures.
