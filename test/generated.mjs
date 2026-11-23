// Compare the exact JSON written by both builders on the kit generator's three size bands.
import { createHash } from 'node:crypto';
import { compare } from './compare.mjs';

const K = process.env.K;
const { build } = await import(K + '/program/generator/vendor/makefun-site/index.js');
const { run } = await import(process.env.SOLVE);
const { generate } = await import(K + '/program/generator/subject/sites.mjs');
const { streamFor } = await import(K + '/program/generator/rng.ts');
const N = Number(process.argv[2] || 30), start = Number(process.argv[3] || 0);
let bad = 0;
for (let t = start; t < start + N; t++) {
  const seed = createHash('sha256').update('fuzz' + t).digest('hex');
  for (let i = 0; i < 3; i++) {
    const input = JSON.stringify(generate(streamFor(seed, 'case', i), i));
    bad += compare(build, run, input, 'seed ' + t + ' case ' + i);
  }
}
console.log('done', N * 3, 'cases, bad', bad);
if (bad > 0) process.exitCode = 1;
