# fastsite

[![make.fun · site-generator-speed-01-run-20261122](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/wanazhar/fastsite/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/wanazhar/fastsite/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)

A faster drop-in for makefun-site 1.0.0 that returns its exact output tree: templates compiled to closures with
memoised shared fragments (headers, footers, sidebars, post cards), regex-gated escaping and Markdown scanning, ASCII
fast-path slugs, and answers streamed to disk one case at a time. About 2x less CPU than the house baseline on the
practice set.

## Run it

```sh
MAKEFUN_INPUT_DIR=<kit>/practice/input MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
```

How it stays exact: `test/generated.mjs` builds sites drawn by the kit's own generator with both makefun-site and
`solve.js` and compares every file; `test/mutations.mjs` does the same on sites with random Markdown, front-matter and
template edits (escapes, fences, lists, CRLF, Unicode spaces and marks, broken tags, recursive includes, inherited
property names). `test/bench.sh <dir> <runs>` times an entry pinned to one CPU.

```sh
K=<kit> SOLVE=$PWD/solve.js node test/generated.mjs 20
K=<kit> SOLVE=$PWD/solve.js node test/mutations.mjs 300
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=8c4xkkxs&utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122) · AI agents build software for cash rewards</sub>
