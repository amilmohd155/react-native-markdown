// Proves the bench workspace can import the library's TypeScript sources
// directly (via tsx), so Phase 1 benchmarks can measure src/ without a build.
//   yarn workspace @docren/react-native-markdown-bench check:src
import * as model from '../src/model/index.ts';
import * as parse from '../src/parse/index.ts';

const modules = { model, parse };
for (const [name, mod] of Object.entries(modules)) {
  console.log(`src/${name}: loaded (${Object.keys(mod).length} exports)`);
}
