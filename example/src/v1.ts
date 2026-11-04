/**
 * v1 preview for the example app.
 *
 * The v1 API isn't exported from the package until M5, so the example
 * imports it from the library sources directly. Metro watches the monorepo
 * root, so edits under src/ hot-reload here. Delete this file in M5, when the
 * package entry point switches to v1.
 */

export * from '../../src/api';
