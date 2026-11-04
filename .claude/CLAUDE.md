# react-native-markdown

Markdown renderer for React Native (`@docren/react-native-markdown`). Mid-rewrite to v1.

## Branches

- `main`: v0.8.x, bug fixes only. Released via the manual **Release-it** workflow.
- `v1`: the rewrite. PRs for Phase 1 target `v1`, not `main`. "Closes #n" doesn't auto-close from `v1`, so close milestone issues by hand.

## Source of truth

- Design: `docs/rewrite/` (start at `README.md`). Plan: `docs/rewrite/phase-1/`.
- Decisions: D1–D8 in `docs/rewrite/07-roadmap.md`, P1-n in `docs/rewrite/phase-1/decisions.md`. Record new ones there.
- Tracking: issue #7, with sub-issues #8–#15 and #23 (one per milestone M0–M8).

## Layout

- `src/{model,parse,plugins,render,theme,api}`: v1. No `any` (lint error). Public API is whatever `src/api/index.ts` exports; `src/index.tsx` re-exports it. v0 is gone (P1-19).
- `test/fixtures/`: vendored spec files. Don't edit by hand (see `SOURCES.md`). `test/spec/`: spec runner.
- `bench/`: private workspace (benchmarks, evidence scripts).

## Commands

`yarn lint` · `yarn typecheck` · `yarn test` (unit) · `yarn test:spec` · `yarn check:expo-go` · `yarn prepare` (build) · `yarn check:public-types` (after a build)

## Rules

- Commit or push only when asked.
- Conventional commits with a lowercase subject (commitlint), e.g. `feat(v1): …`.
- The main entry must stay pure JS so it works in Expo Go (D2). `check:expo-go` enforces this.
- Never run downloaded scripts to generate fixtures.
