/* eslint-disable @typescript-eslint/no-unused-vars -- bundler fragment: stream-web.mjs splices stream.mjs code between head and tail, and that code uses these bindings. */
// Phase 2 S5 web harness (browser entry). Built by stream-web.mjs with esbuild.
// Simulation functions are copied verbatim from stream.mjs (lines 50-270) by stream-web.mjs.
import { getParser } from '../src/parse/markdownIt.ts';
import { convertTokens } from '../src/parse/convert.ts';
import { resolvePreset } from '../src/plugins/presets.ts';
import { F2 } from './fixtures/index.ts';
let text = '';
let rate = 1250;
