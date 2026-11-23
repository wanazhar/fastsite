import { openSync, readFileSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';
setFlagsFromString('--no-incremental-marking');
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as { run: (input: unknown) => unknown };
const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as { id: string; input: unknown }[];
const fd = openSync(join(OUTPUT_DIR, 'answers.json'), 'w', 0o644);
writeSync(fd, '[');
for (let i = 0; i < cases.length; i++) {
  const s = JSON.stringify(run(cases[i].input));
  cases[i] = null as never;
  writeSync(fd, i === 0 ? s : ',' + s);
}
writeSync(fd, ']');
closeSync(fd);
