// fastsite's driver: the harness runs `node /bot/main.ts` (node22). It reads every case from /input/cases.json (a JSON
// array of {id, input}), answers each one alone with run() from solve.js, and writes /output/answers.json, a JSON array
// of the answers in the cases' order. Each answer is serialised and written as soon as it is built, so no two cases'
// trees are alive at once. Outside a container MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and /output.

import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// The house baseline's V8 setting, before solve.js is imported.
setFlagsFromString('--no-incremental-marking');

const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as { run: (input: unknown) => unknown };

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as ({ id: string; input: unknown } | null)[];
const fd = openSync(join(OUTPUT_DIR, 'answers.json'), 'w', 0o644);

/** All of `text`, written in full (a write may take fewer bytes than it is given). */
function writeAll(text: string): void {
  const buf = Buffer.from(text, 'utf8');
  let off = 0;
  while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
}

let out = '[';
for (let i = 0; i < cases.length; i++) {
  const c = cases[i]!;
  cases[i] = null;
  const answer = run(c.input);
  out += (i === 0 ? '' : ',') + (answer === undefined ? 'null' : JSON.stringify(answer));
  writeAll(out);
  out = '';
}
writeAll(`${out}]`);
closeSync(fd);
