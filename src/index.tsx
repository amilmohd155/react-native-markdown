/**
 * Package entry point: the v1 public API.
 *
 * Everything public is declared in ./api (see its header); this file only
 * re-exports it, so the main entry stays pure JS and Expo Go safe (D2,
 * `yarn check:expo-go`).
 *
 * v0.x (the mdast-based renderer) is gone: see decision P1-19. 0.8.x keeps
 * receiving bug fixes on the `main` branch.
 *
 * Design: docs/rewrite/ · Plan: docs/rewrite/phase-1/ · Tracking: issue #7
 */
export * from './api';
