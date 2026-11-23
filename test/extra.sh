#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
export K="${K:-$HOME/kits/site-generator-speed-01-run-20261122-kit}"
export SOLVE="${SOLVE:-$PWD/solve.js}"
node test/edges.mjs

tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
mkdir -- "$tmp/reference" "$tmp/first" "$tmp/second" "$tmp/empty" "$tmp/empty-out"
export MAKEFUN_INPUT_DIR="$K/practice/input"
MAKEFUN_OUTPUT_DIR="$tmp/reference" node "$K/baselines/makefun-site/main.ts"
MAKEFUN_OUTPUT_DIR="$tmp/first" node main.ts
MAKEFUN_OUTPUT_DIR="$tmp/second" node main.ts
cmp "$tmp/reference/answers.json" "$tmp/first/answers.json"
cmp "$tmp/first/answers.json" "$tmp/second/answers.json"
printf '[]\n' > "$tmp/empty/cases.json"
MAKEFUN_INPUT_DIR="$tmp/empty" MAKEFUN_OUTPUT_DIR="$tmp/empty-out" node main.ts
printf '[]' > "$tmp/empty-expected.json"
cmp "$tmp/empty-expected.json" "$tmp/empty-out/answers.json"
echo 'practice reference, repeat run, and empty input: byte-identical'
