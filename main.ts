import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';
// Limit JIT compilation work in the short-lived grading process.
setFlagsFromString('--no-incremental-marking --max-opt=1');
const { run } = createRequire(import.meta.url)('./solve.js');
const cases = JSON.parse(readFileSync(join(process.env.MAKEFUN_INPUT_DIR ?? '/input', 'cases.json'), 'utf8'));
const output = join(process.env.MAKEFUN_OUTPUT_DIR ?? '/output', 'answers.json');
// Serialize one answer at a time in the same order as the reference's JSON array.
writeFileSync(output, '[');
for (let i = 0; i < cases.length; i++) {
  const answer = run(cases[i].input);
  cases[i] = null;
  appendFileSync(output, (i ? ',' : '') + JSON.stringify(answer));
}
appendFileSync(output, ']');
