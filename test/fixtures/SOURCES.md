# Test fixtures: sources

These files are vendored, not downloaded at test time, so spec tests are reproducible and work offline. **Don't edit them by hand.** To update one, re-download it from the pinned source below, update the checksum, and review the spec-suite diff.

| File | Source | Pinned at | SHA-256 | License |
|---|---|---|---|---|
| `commonmark/spec.txt` | [commonmark/commonmark-spec `spec.txt`](https://github.com/commonmark/commonmark-spec/blob/0.31.2/spec.txt) | tag `0.31.2` | `257c41ad946f7a1414a499aca402a1aa8fdac3678532266611348c1cf54f4b80` | CC-BY-SA 4.0 |
| `gfm/spec.txt` | [github/cmark-gfm `test/spec.txt`](https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/test/spec.txt) (GFM spec 0.29) | tag `0.29.0.gfm.13` | `7d8e5814befec287ac116786d81ff14e0adc9b13295b4494649e995408fd871c` | CC-BY-SA 4.0 |
| `gfm/extensions.txt` | [github/cmark-gfm `test/extensions.txt`](https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/test/extensions.txt) | tag `0.29.0.gfm.13` | `a2a45e98be9fca95f564f927265a0f63beea6cae5369d1cf4bde44caa51b2a3a` | CC-BY-SA 4.0 |
| `pathological/cases.ts` | Ported by hand from [commonmark/cmark `test/pathological_tests.py`](https://github.com/commonmark/cmark/blob/0.31.1/test/pathological_tests.py) | tag `0.31.1` | — (derived) | BSD-2-Clause |
| `allowlist.json` | Ours: known spec divergences, each with a reason and an issue ([format](../../docs/rewrite/phase-1/testing-harness.md#allowlist-format)) | — | — | MIT (this repo) |

## Licenses and attribution

- **CommonMark spec** © John MacFarlane, licensed [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The **GFM spec and extension tests** are derived from it by GitHub under the same license. The license is stated in each file's front matter. These files are test data only and are **not** part of the published npm package (`test/` is not in `files`).
- **cmark pathological tests** © 2014 John MacFarlane, BSD-2-Clause. `pathological/cases.ts` adapts the inputs and expected-output patterns. The original copyright notice applies to that adaptation.

## Verify

```bash
sha256sum commonmark/spec.txt gfm/spec.txt gfm/extensions.txt
```
